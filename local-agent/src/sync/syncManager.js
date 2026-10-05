const logger = require('../logger');
const cloudClient = require('../cloudClient');
const syncExecutor = require('./syncExecutor');
const syncQueue = require('./syncQueue');
const outboxUploader = require('./outboxUploader');

const localOutbox = require('./localOutbox');
const connectionWatcher = require('./connectionWatcher');

class SyncManager {
    constructor() {
        this.pollTimer = null;
        this.isPolling = false;
        this.isInitialSyncing = false;
        this.cloudUrl = '';
        this.agentToken = '';
        this.pollIntervalMs = 10000; // 10 seconds
    }

    async start(cloudUrl, agentToken) {
        this.cloudUrl = cloudUrl;
        this.agentToken = agentToken;

        if (this.pollTimer) clearInterval(this.pollTimer);

        logger.info('SYNC', 'Starting Phase 4 Local Sync Engine (Durable Outbox, Crash Recovery, Connection Watcher)...');

        // 1. Crash / Restart Recovery: Recover any stale IN_FLIGHT events
        try {
            await localOutbox.recoverStaleInFlight();
        } catch (e) {
            logger.warn('SYNC', `Failed to recover in-flight events on start: ${e.message}`);
        }

        // 2. Start Outbox Uploader (Local -> Cloud)
        outboxUploader.start(cloudUrl, agentToken, 8000);

        // 3. Start Connection Watcher
        connectionWatcher.start(this);

        // 4. Initial incremental poll run, then interval (Cloud -> Local)
        this.pollIncrementalSync().catch(err => {
            logger.warn('SYNC', `Initial incremental poll failed: ${err.message}`);
        });

        this.pollTimer = setInterval(() => {
            this.pollIncrementalSync().catch(err => {
                logger.warn('SYNC', `Incremental poll error: ${err.message}`);
            });
        }, this.pollIntervalMs);
    }

    stop() {
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
        }
        connectionWatcher.stop();
        outboxUploader.stop();
        logger.info('SYNC', 'Local Sync Engine stopped.');
    }

    async triggerSyncNow() {
        return connectionWatcher.triggerSyncNow();
    }

    async retryFailed() {
        return connectionWatcher.retryFailed();
    }

    /**
     * Poll cloud for incremental change events since latest checkpoint cursor.
     */
    async pollIncrementalSync() {
        if (this.isPolling || this.isInitialSyncing || !this.agentToken) return;
        this.isPolling = true;

        try {
            const latestVersion = await syncExecutor.getLatestCheckpoint();
            const response = await cloudClient.fetchPendingEvents(this.cloudUrl, this.agentToken, latestVersion, 100);

            const events = response?.events || [];
            if (events.length > 0) {
                logger.info('SYNC', `Received ${events.length} new change event(s) from Cloud (latestVersion: ${latestVersion}).`);

                // 1. Enqueue durably into local queue
                await syncQueue.enqueue(events);

                // 2. Process pending queue items
                const pendingItems = await syncQueue.getPending(100);
                const acks = [];

                for (const item of pendingItems) {
                    try {
                        const result = await syncExecutor.applyEvent({
                            eventId: item.eventId,
                            entityType: item.entityType,
                            entityId: item.entityId,
                            operation: item.operation,
                            payload: item.payload,
                            version: item.version
                        });

                        await syncQueue.markCompleted(item.eventId);
                        acks.push({
                            eventId: item.eventId,
                            status: 'ACKNOWLEDGED',
                            version: item.version
                        });
                    } catch (itemErr) {
                        logger.error('SYNC', `Failed to apply event '${item.eventId}' (${item.entityType}): ${itemErr.message}`);
                        await syncQueue.markFailed(item.eventId, itemErr.message);
                        acks.push({
                            eventId: item.eventId,
                            status: 'FAILED',
                            errorMessage: itemErr.message,
                            version: item.version
                        });
                    }
                }

                // 3. Send acknowledgements back to Cloud
                if (acks.length > 0) {
                    await cloudClient.acknowledgeEvents(this.cloudUrl, this.agentToken, acks);
                    logger.info('SYNC', `Acknowledged ${acks.length} event(s) back to Cloud.`);
                }
            }
        } catch (err) {
            // Non-fatal: logged and retried on next poll cycle
            logger.warn('SYNC', `pollIncrementalSync error: ${err.message}`);
        } finally {
            this.isPolling = false;
        }
    }

    /**
     * Execute initial full synchronization across all 7 entities.
     */
    async runInitialSync(entityOrder = ['Hospital', 'Department', 'Doctor', 'Service', 'Bed', 'Medicine', 'Patient']) {
        if (this.isInitialSyncing) {
            logger.warn('SYNC', 'Initial sync already in progress. Ignoring duplicate trigger.');
            return;
        }

        this.isInitialSyncing = true;
        logger.info('SYNC', `Beginning initial sync streaming for entities: ${entityOrder.join(', ')}`);

        try {
            for (let i = 0; i < entityOrder.length; i++) {
                const entityType = entityOrder[i];
                let skip = 0;
                const limit = 200;
                let hasMore = true;
                let totalEntitySynced = 0;

                logger.info('SYNC', `[Initial Sync] Starting entity: ${entityType}...`);

                while (hasMore) {
                    const batchResult = await cloudClient.fetchInitialSyncBatch(
                        this.cloudUrl,
                        this.agentToken,
                        entityType,
                        skip,
                        limit
                    );

                    const records = batchResult.records || [];
                    if (records.length > 0) {
                        const applyResult = await syncExecutor.applyInitialBatch(entityType, records);
                        totalEntitySynced += applyResult.applied;
                        skip += records.length;
                    }

                    hasMore = batchResult.hasMore;

                    const isLastEntity = (i === entityOrder.length - 1) && !hasMore;
                    await cloudClient.reportInitialSyncProgress(this.cloudUrl, this.agentToken, {
                        entityType,
                        syncedCount: totalEntitySynced,
                        isCompleted: isLastEntity
                    });
                }

                logger.info('SYNC', `[Initial Sync] Completed entity ${entityType}: ${totalEntitySynced} records synchronized.`);
            }

            logger.info('SYNC', '=== ALL ENTITIES SUCCESSFULLY SYNCHRONIZED FOR INITIAL SYNC ===');
        } catch (err) {
            logger.error('SYNC', `Initial sync stream encountered an error: ${err.message}`);
            try {
                await cloudClient.reportInitialSyncProgress(this.cloudUrl, this.agentToken, {
                    entityType: 'Hospital',
                    syncedCount: 0,
                    error: err.message
                });
            } catch (ignore) {}
        } finally {
            this.isInitialSyncing = false;
        }
    }
}

module.exports = new SyncManager();
