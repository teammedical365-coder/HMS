const EventEmitter = require('events');
const logger = require('../logger');
const cloudClient = require('../cloudClient');
const db = require('../db');
const localOutbox = require('./localOutbox');
const outboxUploader = require('./outboxUploader');

/**
 * ConnectionWatcher — Autonomous Network & Database Recovery Watcher (Phase 4).
 *
 * Responsibilities:
 * 1. Cloud Connection Recovery: Detects when internet/cloud returns and automatically
 *    triggers immediate synchronization without requiring a manual agent restart.
 * 2. Local Database Recovery: Detects when local MongoDB comes back online after downtime
 *    and immediately flushes buffered in-memory mutations into durable storage.
 * 3. Proactive Health Events: Emits status changes for local telemetry and health server.
 */
class ConnectionWatcher extends EventEmitter {
    constructor() {
        super();
        this.timer = null;
        this.checkIntervalMs = 5000;
        this.previousCloudStatus = 'DISCONNECTED';
        this.previousDbStatus = 'UNKNOWN';
        this.isRunning = false;
        this.syncManagerRef = null;
    }

    start(syncManager) {
        if (this.isRunning) return;
        this.isRunning = true;
        this.syncManagerRef = syncManager;

        logger.info('CONNECTION_WATCHER', 'Started Phase 4 Connection Watcher daemon.');

        this.timer = setInterval(() => {
            this.checkConnections().catch(err => {
                logger.debug('CONNECTION_WATCHER', `Connection probe error: ${err.message}`);
            });
        }, this.checkIntervalMs);
    }

    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        this.isRunning = false;
        logger.info('CONNECTION_WATCHER', 'Stopped Connection Watcher daemon.');
    }

    async checkConnections() {
        const currentCloudStatus = cloudClient.status;
        const currentDbStatus = db.isConnected() ? 'HEALTHY' : 'DOWN';

        // ── 1. Cloud Connection Transitions ──────────────────────────────────
        if (this.previousCloudStatus === 'DISCONNECTED' && currentCloudStatus === 'CONNECTED') {
            logger.info('CONNECTION_WATCHER', 'Connection restored: Cloud is now reachable. Resuming pending synchronization.');
            this.emit('cloud:restored');

            // Trigger immediate outbox drain
            outboxUploader.triggerImmediateSync().catch(e => {
                logger.warn('CONNECTION_WATCHER', `Outbox resume error: ${e.message}`);
            });

            // Trigger immediate incremental cloud poll
            if (this.syncManagerRef && typeof this.syncManagerRef.pollIncrementalSync === 'function') {
                this.syncManagerRef.pollIncrementalSync().catch(e => {
                    logger.warn('CONNECTION_WATCHER', `Cloud poll resume error: ${e.message}`);
                });
            }
        } else if (this.previousCloudStatus === 'CONNECTED' && currentCloudStatus === 'DISCONNECTED') {
            logger.warn('CONNECTION_WATCHER', 'Cloud connection lost. Local changes are held safely in durable outbox.');
            this.emit('cloud:lost');
        }

        // ── 2. Local Database Connection Transitions ─────────────────────────
        if (this.previousDbStatus === 'DOWN' && currentDbStatus === 'HEALTHY') {
            logger.info('CONNECTION_WATCHER', 'Local DB connection restored. Flushing offline memory buffer to durable MongoDB.');
            this.emit('db:restored');

            await localOutbox.flushInMemoryToDatabase();
        } else if (this.previousDbStatus === 'HEALTHY' && currentDbStatus === 'DOWN') {
            logger.error('CONNECTION_WATCHER', 'Local MongoDB connection lost! Mutations will temporarily buffer in memory.');
            this.emit('db:lost');
        }

        this.previousCloudStatus = currentCloudStatus;
        this.previousDbStatus = currentDbStatus;
    }

    /**
     * Trigger immediate synchronization cycle.
     */
    async triggerSyncNow() {
        logger.info('CONNECTION_WATCHER', 'Manual sync trigger requested.');
        const outboxResult = await outboxUploader.triggerImmediateSync();
        let pollResult = null;
        if (this.syncManagerRef && typeof this.syncManagerRef.pollIncrementalSync === 'function') {
            pollResult = await this.syncManagerRef.pollIncrementalSync();
        }
        return {
            success: true,
            outbox: outboxResult,
            poll: pollResult
        };
    }

    /**
     * Trigger retry of all failed events.
     */
    async retryFailed() {
        logger.info('CONNECTION_WATCHER', 'Manual retry of failed events requested.');
        const resetCount = await localOutbox.retryAllFailed();
        if (resetCount > 0) {
            await outboxUploader.triggerImmediateSync();
        }
        return {
            success: true,
            resetCount
        };
    }

    getStatus() {
        return {
            cloudStatus: cloudClient.status,
            dbStatus: db.isConnected() ? 'HEALTHY' : 'DOWN',
            lastHeartbeatAck: cloudClient.lastHeartbeatAck,
            consecutiveFailures: cloudClient.consecutiveFailures
        };
    }
}

module.exports = new ConnectionWatcher();
