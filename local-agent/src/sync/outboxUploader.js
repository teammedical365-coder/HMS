const localOutbox = require('./localOutbox');
const cloudClient = require('../cloudClient');
const logger = require('../logger');

/**
 * OutboxUploader — Autonomous Outbox Draining Daemon (Phase 4).
 *
 * Capabilities:
 * 1. Controlled Batch Streaming: Streams offline events in chunks (default 50) without overloading RAM.
 * 2. Rapid Drain on Long Offline Reconnect: Continuously processes backlog until empty.
 * 3. Partial Batch Handling: Tracks success, retry, conflict, and failure individually per event.
 * 4. Network Failure & Timeout Resilience: Reverts in-flight batches safely with exponential backoff.
 * 5. Immediate Trigger Support: Supports instantaneous synchronization triggers upon reconnect or Admin command.
 */
class OutboxUploader {
    constructor() {
        this.timer = null;
        this.isUploading = false;
        this.batchSize = 50;
        this.intervalMs = 8000;
        this.cloudUrl = '';
        this.agentToken = '';
    }

    start(cloudUrl, agentToken, intervalMs = 8000) {
        if (this.timer) clearInterval(this.timer);
        this.cloudUrl = cloudUrl;
        this.agentToken = agentToken;
        this.intervalMs = intervalMs;

        logger.info('OUTBOX_UPLOADER', `Started Phase 4 Outbox Uploader (interval: ${this.intervalMs}ms, batchSize: ${this.batchSize})`);

        this.timer = setInterval(() => {
            this.uploadPendingBatch(this.cloudUrl, this.agentToken).catch(err => {
                logger.warn('OUTBOX_UPLOADER', `Upload cycle error: ${err.message}`);
            });
        }, this.intervalMs);

        // Immediate check on startup
        this.uploadPendingBatch(this.cloudUrl, this.agentToken).catch(() => {});
    }

    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
            logger.info('OUTBOX_UPLOADER', 'Stopped background outbox uploader.');
        }
    }

    /**
     * Trigger immediate upload cycle without waiting for interval.
     */
    async triggerImmediateSync() {
        if (!this.cloudUrl || !this.agentToken) return;
        logger.info('OUTBOX_UPLOADER', 'Immediate outbox upload triggered.');
        return this.uploadPendingBatch(this.cloudUrl, this.agentToken);
    }

    /**
     * Upload pending events in controlled batches.
     * Continues in a loop if more events are immediately ready (e.g. recovering from long offline periods).
     */
    async uploadPendingBatch(cloudUrl = this.cloudUrl, agentToken = this.agentToken) {
        if (this.isUploading) return { skipped: true, reason: 'ALREADY_UPLOADING' };

        // 1. Connection check: Do not attempt if Cloud is known to be offline
        if (cloudClient.status === 'DISCONNECTED') {
            logger.debug('OUTBOX_UPLOADER', 'Cloud is offline. Outbox upload paused; local mutations held safely in queue.');
            return { skipped: true, reason: 'CLOUD_OFFLINE' };
        }

        this.isUploading = true;
        let totalUploaded = 0;
        let batchCount = 0;

        try {
            while (true) {
                // 2. Fetch next batch of pending mutations
                const batch = await localOutbox.getPendingBatch(this.batchSize);
                if (!batch || batch.length === 0) {
                    break;
                }

                batchCount++;
                const eventIds = batch.map(e => e.eventId);
                logger.info('OUTBOX_UPLOADER', `Streaming batch #${batchCount} (${batch.length} events) to Cloud...`);

                try {
                    // 3. Mark events as IN_FLIGHT
                    await localOutbox.markInFlight(eventIds);

                    // 4. Send to Cloud Sync Push API
                    const response = await cloudClient.pushOutboxBatch(cloudUrl, agentToken, batch);

                    if (response && Array.isArray(response.results)) {
                        // 5. Apply individual ACKs (Partial batch success/failure handling)
                        await localOutbox.applyAcknowledgements(response.results);
                        totalUploaded += response.successCount || 0;
                        logger.info('OUTBOX_UPLOADER', `Batch #${batchCount} processed. Success: ${response.successCount || 0}, Conflicts: ${response.conflictCount || 0}, Failed: ${response.failedCount || 0}`);
                    } else {
                        throw new Error(response?.message || 'Empty or invalid response from Cloud Sync Push API');
                    }
                } catch (batchErr) {
                    logger.warn('OUTBOX_UPLOADER', `Network/API failure on batch #${batchCount}: ${batchErr.message}. Reverting to PENDING with backoff.`);
                    // Safely revert with exponential backoff so events are not dropped
                    await localOutbox.revertInFlightToPending(eventIds, batchErr.message);
                    // Break out of the rapid drain loop on failure
                    break;
                }

                // If less than batchSize returned, queue is drained for now
                if (batch.length < this.batchSize) {
                    break;
                }

                // Small 200ms yield to prevent event loop starvation during massive backlogs
                await new Promise(resolve => setTimeout(resolve, 200));
            }
        } finally {
            this.isUploading = false;
        }

        return {
            success: true,
            batchesProcessed: batchCount,
            totalUploaded
        };
    }
}

module.exports = new OutboxUploader();
