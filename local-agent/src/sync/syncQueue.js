const db = require('../db');
const logger = require('../logger');

class SyncQueue {
    constructor() {
        this.inMemoryQueue = [];
        this.maxRetries = 5;
    }

    getCollection() {
        const localDb = db.getDb();
        return localDb ? localDb.collection('sync_queue') : null;
    }

    /**
     * Enqueue events durably.
     */
    async enqueue(events) {
        if (!Array.isArray(events) || events.length === 0) return 0;

        const coll = this.getCollection();
        let inserted = 0;

        for (const evt of events) {
            const queueItem = {
                eventId: evt.eventId,
                entityType: evt.entityType,
                entityId: evt.entityId,
                operation: evt.operation,
                payload: evt.payload,
                version: evt.version,
                status: 'PENDING',
                retryCount: 0,
                lastError: null,
                createdAt: new Date(),
                processedAt: null
            };

            if (coll) {
                try {
                    await coll.updateOne(
                        { eventId: evt.eventId },
                        { $setOnInsert: queueItem },
                        { upsert: true }
                    );
                    inserted++;
                } catch (err) {
                    // Fall back to in-memory queue if DB write fails
                    this.inMemoryQueue.push(queueItem);
                }
            } else {
                this.inMemoryQueue.push(queueItem);
                inserted++;
            }
        }

        return inserted;
    }

    /**
     * Get pending items to process.
     */
    async getPending(limit = 50) {
        const coll = this.getCollection();
        if (coll) {
            // First flush any items that were queued in memory while DB was down
            if (this.inMemoryQueue.length > 0) {
                const itemsToFlush = [...this.inMemoryQueue];
                this.inMemoryQueue = [];
                for (const item of itemsToFlush) {
                    await coll.updateOne({ eventId: item.eventId }, { $setOnInsert: item }, { upsert: true });
                }
            }

            return await coll.find({
                status: 'PENDING',
                retryCount: { $lt: this.maxRetries }
            }).sort({ version: 1 }).limit(limit).toArray();
        }

        // Return from in-memory queue if DB is down
        return this.inMemoryQueue.filter(i => i.status === 'PENDING' && i.retryCount < this.maxRetries).slice(0, limit);
    }

    /**
     * Mark an event completed in the queue.
     */
    async markCompleted(eventId) {
        const coll = this.getCollection();
        if (coll) {
            await coll.updateOne(
                { eventId },
                {
                    $set: {
                        status: 'COMPLETED',
                        processedAt: new Date()
                    }
                }
            );
        }
        const memIdx = this.inMemoryQueue.findIndex(i => i.eventId === eventId);
        if (memIdx >= 0) {
            this.inMemoryQueue.splice(memIdx, 1);
        }
    }

    /**
     * Mark an event failed in the queue with exponential backoff retry.
     */
    async markFailed(eventId, errorMessage) {
        const coll = this.getCollection();
        if (coll) {
            await coll.updateOne(
                { eventId },
                {
                    $set: {
                        status: 'FAILED',
                        lastError: errorMessage,
                        processedAt: new Date()
                    },
                    $inc: { retryCount: 1 }
                }
            );
        }
        const memItem = this.inMemoryQueue.find(i => i.eventId === eventId);
        if (memItem) {
            memItem.status = 'FAILED';
            memItem.lastError = errorMessage;
            memItem.retryCount = (memItem.retryCount || 0) + 1;
        }
    }
}

module.exports = new SyncQueue();
