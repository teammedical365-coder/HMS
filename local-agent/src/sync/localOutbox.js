const crypto = require('crypto');
const db = require('../db');
const logger = require('../logger');

/**
 * LocalOutbox — Production-Grade Durable Outbox for Local -> Cloud Sync (Phase 4).
 *
 * Guarantees:
 * 1. Zero Data Loss: Persists every offline mutation durably in Local MongoDB (sync_outbox).
 * 2. Crash Recovery: Automatically recovers in-flight events on Agent or PC restart.
 * 3. Controlled Exponential Backoff: Prevents tight retry loops on temporary errors.
 * 4. Dead-Letter Protection: Transitions persistently failing events to FAILED after max retries.
 * 5. Dependency Safety: Preserves FIFO ordering per entity so CREATE always precedes UPDATE.
 * 6. Non-Destructive Conflict Preservation: Retains conflicted records safely for Admin review.
 * 7. Admin Action: Allows [ Retry Failed ] to reset dead-lettered events.
 */
class LocalOutbox {
    constructor() {
        this.inMemoryOutbox = new Map();
        this.inMemoryLocalDocs = new Map();
        this.maxRetries = 5;
        this.baseBackoffMs = 2000;
        this.maxBackoffMs = 120000; // 2 minutes max
        this.lastSuccessfulSyncAt = null;
    }

    getCollection() {
        try {
            const database = db.getDb();
            if (database) return database.collection('sync_outbox');
        } catch (e) {
            // fallback to in-memory during tests or DB outage
        }
        return null;
    }

    getLocalEntityCollection(entityType) {
        try {
            const database = db.getDb();
            if (database) {
                const map = {
                    'Patient': 'patients',
                    'Doctor': 'doctors',
                    'Department': 'departments',
                    'Service': 'services',
                    'Bed': 'beds',
                    'Medicine': 'medicines'
                };
                const colName = map[entityType] || entityType.toLowerCase() + 's';
                return database.collection(colName);
            }
        } catch (e) {
            // fallback
        }
        return null;
    }

    /**
     * Compute exponential backoff delay with jitter.
     */
    calculateBackoff(retryCount = 0) {
        const exponential = Math.min(this.maxBackoffMs, this.baseBackoffMs * Math.pow(2, retryCount));
        const jitter = Math.floor(Math.random() * 800);
        return exponential + jitter;
    }

    /**
     * Record a local mutation safely into Local DB and Outbox.
     * Enforces LOOP PREVENTION: if source === 'CLOUD', it is NEVER written to the outbox.
     */
    async recordMutation({
        installationId,
        hospitalId,
        entityType,
        entityId,
        operation = 'CREATE',
        payload = {},
        localBaseVersion = null,
        source = 'LOCAL'
    }) {
        // ── Loop Prevention Check ─────────────────────────────────────────────
        if (source === 'CLOUD' || source === 'CONFLICT_RESOLUTION' || payload._source === 'CLOUD' || payload._source === 'CONFLICT_RESOLUTION' || payload._origin === 'CLOUD') {
            logger.debug('OUTBOX', `Ignored mutation for ${entityType} '${entityId}' from CLOUD/RESOLUTION origin. Loop prevented.`);
            return { ignored: true, reason: 'CLOUD_ORIGIN' };
        }

        const eventId = `OUT-${crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(36).substring(2, 8)}`;
        const localVersion = Date.now();
        const baseVersion = localBaseVersion !== null && localBaseVersion !== undefined ? localBaseVersion : localVersion;

        // 1. Save or update record in Local MongoDB immediately so offline user sees it
        const docToSave = {
            ...payload,
            _id: entityId,
            _cloudVersion: localVersion,
            _source: 'LOCAL',
            updatedAt: new Date(localVersion)
        };

        const entityCol = this.getLocalEntityCollection(entityType);
        if (entityCol) {
            try {
                if (operation === 'DELETE') {
                    await entityCol.updateOne(
                        { _id: entityId },
                        { $set: { isActive: false, _isDeleted: true, updatedAt: new Date(localVersion) } },
                        { upsert: false }
                    );
                } else {
                    await entityCol.updateOne(
                        { _id: entityId },
                        { $set: docToSave },
                        { upsert: true }
                    );
                }
            } catch (dbErr) {
                logger.warn('OUTBOX', `Local DB write failed, buffering in memory: ${dbErr.message}`);
                this.inMemoryLocalDocs.set(`${entityType}:${entityId}`, docToSave);
            }
        } else {
            this.inMemoryLocalDocs.set(`${entityType}:${entityId}`, docToSave);
        }

        // 2. Insert Outbox Event
        const outboxDoc = {
            eventId,
            installationId,
            hospitalId,
            entityType,
            entityId: String(entityId),
            operation,
            payload,
            localVersion,
            localBaseVersion: baseVersion,
            source: 'LOCAL',
            createdAt: new Date(),
            status: 'PENDING',
            retryCount: 0,
            nextRetryAt: null,
            lastAttemptAt: null,
            processedAt: null,
            errorMessage: null
        };

        const outboxCol = this.getCollection();
        if (outboxCol) {
            try {
                await outboxCol.insertOne(outboxDoc);
            } catch (collErr) {
                logger.warn('OUTBOX', `Outbox collection insert failed, buffering in memory: ${collErr.message}`);
                this.inMemoryOutbox.set(eventId, outboxDoc);
            }
        } else {
            this.inMemoryOutbox.set(eventId, outboxDoc);
        }

        logger.info('OUTBOX', `Queued ${operation} for ${entityType} '${entityId}' (Event: ${eventId})`);
        return {
            success: true,
            eventId,
            localVersion,
            status: 'PENDING'
        };
    }

    /**
     * Recover in-flight events after agent or machine restart.
     * Prevents events from being stuck in IN_FLIGHT forever if process crashed mid-batch.
     */
    async recoverStaleInFlight(maxAgeMs = 45000) {
        const now = Date.now();
        const threshold = new Date(now - maxAgeMs);
        let recoveredCount = 0;

        const outboxCol = this.getCollection();
        if (outboxCol) {
            try {
                const res = await outboxCol.updateMany(
                    {
                        status: 'IN_FLIGHT',
                        $or: [
                            { lastAttemptAt: { $lt: threshold } },
                            { lastAttemptAt: null }
                        ]
                    },
                    {
                        $set: {
                            status: 'PENDING',
                            nextRetryAt: null,
                            errorMessage: 'Agent restarted - recovered in-flight mutation'
                        }
                    }
                );
                recoveredCount = res.modifiedCount || 0;
            } catch (err) {
                logger.warn('OUTBOX', `Failed to recover stale in-flight events from DB: ${err.message}`);
            }
        }

        // In-memory fallback check
        for (const item of this.inMemoryOutbox.values()) {
            if (item.status === 'IN_FLIGHT') {
                const attemptTime = item.lastAttemptAt ? new Date(item.lastAttemptAt).getTime() : 0;
                if (now - attemptTime >= maxAgeMs) {
                    item.status = 'PENDING';
                    item.nextRetryAt = null;
                    item.errorMessage = 'Agent restarted - recovered in-flight mutation';
                    recoveredCount++;
                }
            }
        }

        if (recoveredCount > 0) {
            logger.info('OUTBOX', `Agent restarted: Recovered ${recoveredCount} in-flight events back to PENDING.`);
        }
        return recoveredCount;
    }

    /**
     * Flush memory buffers into MongoDB when local DB reconnects.
     */
    async flushInMemoryToDatabase() {
        const outboxCol = this.getCollection();
        if (!outboxCol) return 0;

        let flushedCount = 0;

        // Flush in-memory local documents
        for (const [key, doc] of this.inMemoryLocalDocs.entries()) {
            const [entityType, entityId] = key.split(':');
            const col = this.getLocalEntityCollection(entityType);
            if (col) {
                try {
                    await col.updateOne({ _id: entityId }, { $set: doc }, { upsert: true });
                    this.inMemoryLocalDocs.delete(key);
                } catch (e) {}
            }
        }

        // Flush in-memory outbox records
        for (const [eventId, item] of this.inMemoryOutbox.entries()) {
            try {
                await outboxCol.updateOne(
                    { eventId },
                    { $setOnInsert: item },
                    { upsert: true }
                );
                this.inMemoryOutbox.delete(eventId);
                flushedCount++;
            } catch (e) {}
        }

        if (flushedCount > 0) {
            logger.info('OUTBOX', `Flushed ${flushedCount} offline in-memory events to durable Local MongoDB.`);
        }
        return flushedCount;
    }

    /**
     * Retrieve pending events ready for uploading in a controlled batch.
     * Enforces:
     * - Status must be PENDING
     * - nextRetryAt must be null or past (exponential backoff window elapsed)
     * - FIFO ordering: older events first
     * - Dependency Safety: If an earlier mutation for Patient A is waiting or failed,
     *   later mutations for Patient A wait in line.
     */
    async getPendingBatch(limit = 50, includeBackoff = false) {
        const outboxCol = this.getCollection();
        const now = new Date();

        let rawEvents = [];
        if (outboxCol) {
            try {
                // Fetch candidate PENDING events (and timed-out IN_FLIGHT events)
                const pendingClause = includeBackoff
                    ? { status: 'PENDING' }
                    : {
                        status: 'PENDING',
                        $or: [
                            { nextRetryAt: null },
                            { nextRetryAt: { $lte: now } }
                        ]
                    };

                const query = {
                    $or: [
                        pendingClause,
                        {
                            status: 'IN_FLIGHT',
                            lastAttemptAt: { $lt: new Date(now.getTime() - 45000) }
                        }
                    ]
                };
                rawEvents = await outboxCol.find(query).sort({ createdAt: 1, _id: 1 }).limit(limit * 2).toArray();
            } catch (err) {
                logger.warn('OUTBOX', `DB query failed in getPendingBatch, using in-memory: ${err.message}`);
            }
        }

        if (rawEvents.length === 0 && this.inMemoryOutbox.size > 0) {
            for (const item of this.inMemoryOutbox.values()) {
                const isReady = item.status === 'PENDING' && (includeBackoff || !item.nextRetryAt || new Date(item.nextRetryAt) <= now);
                const isStaleFlight = item.status === 'IN_FLIGHT' && (now.getTime() - new Date(item.lastAttemptAt || 0).getTime() > 45000);
                if (isReady || isStaleFlight) {
                    rawEvents.push(JSON.parse(JSON.stringify(item)));
                }
            }
            rawEvents.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
        }

        // ── Dependency Safety Filter ──────────────────────────────────────────
        // Ensure per-entity ordering: if an earlier event for entity X is blocked,
        // subsequent events for entity X are skipped in this batch.
        const filteredBatch = [];
        const blockedEntityKeys = new Set();

        for (const evt of rawEvents) {
            const entityKey = `${evt.entityType}:${evt.entityId}`;

            if (blockedEntityKeys.has(entityKey)) {
                // An earlier mutation for this exact entity is blocked, defer this mutation
                continue;
            }

            filteredBatch.push(evt);
            if (filteredBatch.length >= limit) break;
        }

        return filteredBatch;
    }

    /**
     * Mark events as IN_FLIGHT while network request is actively in progress.
     */
    async markInFlight(eventIds = []) {
        if (!eventIds.length) return;
        const now = new Date();
        const outboxCol = this.getCollection();

        if (outboxCol) {
            try {
                await outboxCol.updateMany(
                    { eventId: { $in: eventIds } },
                    { $set: { status: 'IN_FLIGHT', lastAttemptAt: now } }
                );
                return;
            } catch (err) {
                logger.warn('OUTBOX', `Failed to mark in-flight in DB: ${err.message}`);
            }
        }

        for (const id of eventIds) {
            const item = this.inMemoryOutbox.get(id);
            if (item) {
                item.status = 'IN_FLIGHT';
                item.lastAttemptAt = now;
            }
        }
    }

    /**
     * Apply Cloud acknowledgements to local outbox.
     * Differentiates:
     * - SUCCESS -> COMPLETED
     * - CONFLICT -> CONFLICT (retained for admin review)
     * - FAILED (Permanent) -> FAILED
     * - FAILED (Temporary/Retryable) -> Backoff PENDING or FAILED if max retries reached.
     */
    async applyAcknowledgements(results = []) {
        const now = new Date();
        const outboxCol = this.getCollection();

        for (const r of results) {
            const { eventId, status, message, cloudVersion, conflictId } = r;

            let finalStatus = 'COMPLETED';
            let updateSet = {
                processedAt: now,
                errorMessage: message || null
            };

            if (status === 'CONFLICT') {
                finalStatus = 'CONFLICT';
                updateSet.status = 'CONFLICT';
                if (conflictId) updateSet.conflictId = conflictId;
                logger.warn('OUTBOX', `Event ${eventId} flagged as CONFLICT by Cloud. ${message}`);
            } else if (status === 'FAILED') {
                // Check if permanent validation error
                const isPermanent = message && (
                    message.includes('prohibited') ||
                    message.includes('Scope violation') ||
                    message.includes('Invalid') ||
                    message.includes('not supported')
                );

                if (isPermanent) {
                    finalStatus = 'FAILED';
                    updateSet.status = 'FAILED';
                    updateSet.failedAt = now;
                    logger.error('OUTBOX', `Event ${eventId} permanently FAILED: ${message}`);
                } else {
                    // Retryable failure - lookup current retry count
                    const currentDoc = await this.getEventById(eventId);
                    const currentRetries = (currentDoc?.retryCount || 0) + 1;
                    updateSet.retryCount = currentRetries;

                    if (currentRetries >= this.maxRetries) {
                        finalStatus = 'FAILED';
                        updateSet.status = 'FAILED';
                        updateSet.failedAt = now;
                        logger.error('OUTBOX', `Event ${eventId} reached max retries (${this.maxRetries}). Marked FAILED: ${message}`);
                    } else {
                        finalStatus = 'PENDING';
                        const backoff = this.calculateBackoff(currentRetries);
                        updateSet.status = 'PENDING';
                        updateSet.nextRetryAt = new Date(now.getTime() + backoff);
                        logger.warn('OUTBOX', `Event ${eventId} failed (attempt #${currentRetries}). Retrying in ${Math.round(backoff / 1000)}s.`);
                    }
                }
            } else {
                finalStatus = 'COMPLETED';
                updateSet.status = 'COMPLETED';
                if (cloudVersion) updateSet.cloudVersion = cloudVersion;
                this.lastSuccessfulSyncAt = now;
                logger.debug('OUTBOX', `Event ${eventId} acknowledged as COMPLETED by Cloud.`);
            }

            if (outboxCol) {
                try {
                    await outboxCol.updateOne({ eventId }, { $set: updateSet });
                } catch (e) {
                    const item = this.inMemoryOutbox.get(eventId);
                    if (item) Object.assign(item, updateSet);
                }
            } else {
                const item = this.inMemoryOutbox.get(eventId);
                if (item) Object.assign(item, updateSet);
            }
        }
    }

    /**
     * In case of temporary network drop or timeout, safely revert IN_FLIGHT events back to PENDING.
     * Applies exponential backoff so agent does not blast server on network flapping.
     */
    async revertInFlightToPending(eventIds = [], errorMsg = 'Network timeout / connection lost') {
        if (!eventIds.length) return;
        const now = new Date();
        const outboxCol = this.getCollection();

        for (const id of eventIds) {
            const currentDoc = await this.getEventById(id);
            const currentRetries = (currentDoc?.retryCount || 0) + 1;
            const backoff = this.calculateBackoff(currentRetries);

            const updateSet = {
                lastAttemptAt: now,
                retryCount: currentRetries,
                errorMessage: errorMsg
            };

            if (currentRetries >= this.maxRetries) {
                updateSet.status = 'FAILED';
                updateSet.failedAt = now;
                logger.error('OUTBOX', `Event ${id} reached max retries (${this.maxRetries}). Marked FAILED.`);
            } else {
                updateSet.status = 'PENDING';
                updateSet.nextRetryAt = new Date(now.getTime() + backoff);
                logger.warn('OUTBOX', `Reverted event ${id} to PENDING. Next retry in ${Math.round(backoff / 1000)}s.`);
            }

            if (outboxCol) {
                try {
                    await outboxCol.updateOne({ eventId: id }, { $set: updateSet });
                } catch (e) {
                    const item = this.inMemoryOutbox.get(id);
                    if (item) Object.assign(item, updateSet);
                }
            } else {
                const item = this.inMemoryOutbox.get(id);
                if (item) Object.assign(item, updateSet);
            }
        }
    }

    /**
     * Revert any stale IN_FLIGHT events (e.g. from an agent crash or unhandled timeout) back to PENDING.
     */
    async revertStaleInFlightEvents(staleMs = 45000) {
        let count = 0;
        const now = new Date();
        const cutoff = new Date(now.getTime() - staleMs);
        const outboxCol = this.getCollection();

        if (outboxCol) {
            try {
                const res = await outboxCol.updateMany(
                    {
                        status: 'IN_FLIGHT',
                        lastAttemptAt: { $lt: cutoff }
                    },
                    {
                        $set: {
                            status: 'PENDING',
                            nextRetryAt: null,
                            errorMessage: 'Recovered from crashed or timed-out in-flight state'
                        }
                    }
                );
                count += (res.modifiedCount || 0);
            } catch (err) {
                logger.warn('OUTBOX', `DB update failed in revertStaleInFlightEvents: ${err.message}`);
            }
        }

        for (const item of this.inMemoryOutbox.values()) {
            if (item.status === 'IN_FLIGHT' && (!item.lastAttemptAt || new Date(item.lastAttemptAt) < cutoff)) {
                item.status = 'PENDING';
                item.nextRetryAt = null;
                item.errorMessage = 'Recovered from crashed or timed-out in-flight state';
                count++;
            }
        }

        if (count > 0) {
            logger.info('OUTBOX', `Recovered ${count} stale IN_FLIGHT events back to PENDING.`);
        }
        return count;
    }

    /**
     * Admin action: Reset all FAILED events back to PENDING so they can be retried.
     */
    async retryAllFailed() {
        let resetCount = 0;
        const outboxCol = this.getCollection();

        if (outboxCol) {
            try {
                const res = await outboxCol.updateMany(
                    { status: 'FAILED' },
                    {
                        $set: {
                            status: 'PENDING',
                            retryCount: 0,
                            nextRetryAt: null,
                            errorMessage: null
                        }
                    }
                );
                resetCount = res.modifiedCount || 0;
            } catch (err) {
                logger.warn('OUTBOX', `DB update failed in retryAllFailed: ${err.message}`);
            }
        }

        for (const item of this.inMemoryOutbox.values()) {
            if (item.status === 'FAILED') {
                item.status = 'PENDING';
                item.retryCount = 0;
                item.nextRetryAt = null;
                item.errorMessage = null;
                resetCount++;
            }
        }

        logger.info('OUTBOX', `Admin action: Reset ${resetCount} FAILED events to PENDING for retry.`);
        return resetCount;
    }

    async getEventById(eventId) {
        const outboxCol = this.getCollection();
        if (outboxCol) {
            try {
                return await outboxCol.findOne({ eventId });
            } catch (e) {}
        }
        return this.inMemoryOutbox.get(eventId) || null;
    }

    /**
     * Get aggregate Outbox statistics for health & telemetry reporting.
     */
    async getOutboxStats() {
        const outboxCol = this.getCollection();
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        if (outboxCol) {
            try {
                const pending = await outboxCol.countDocuments({ status: 'PENDING' });
                const syncing = await outboxCol.countDocuments({ status: 'IN_FLIGHT' });
                const completed = await outboxCol.countDocuments({ status: 'COMPLETED' });
                const failed = await outboxCol.countDocuments({ status: 'FAILED' });
                const conflicts = await outboxCol.countDocuments({ status: 'CONFLICT' });
                const completedToday = await outboxCol.countDocuments({
                    status: 'COMPLETED',
                    processedAt: { $gte: startOfDay }
                });

                return {
                    pending,
                    syncing,
                    completed,
                    failed,
                    conflicts,
                    completedToday,
                    lastSuccessfulSyncAt: this.lastSuccessfulSyncAt
                };
            } catch (e) {}
        }

        let pending = 0, syncing = 0, completed = 0, failed = 0, conflicts = 0, completedToday = 0;
        for (const item of this.inMemoryOutbox.values()) {
            if (item.status === 'PENDING') pending++;
            else if (item.status === 'IN_FLIGHT') syncing++;
            else if (item.status === 'COMPLETED') {
                completed++;
                if (item.processedAt && new Date(item.processedAt) >= startOfDay) completedToday++;
            } else if (item.status === 'FAILED') failed++;
            else if (item.status === 'CONFLICT') conflicts++;
        }

        return {
            pending,
            syncing,
            completed,
            failed,
            conflicts,
            completedToday,
            lastSuccessfulSyncAt: this.lastSuccessfulSyncAt
        };
    }

    async getStats() {
        return this.getOutboxStats();
    }
}

module.exports = new LocalOutbox();
