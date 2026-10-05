const db = require('../db');
const logger = require('../logger');

const ENTITY_COLLECTION_MAP = {
    Hospital: 'hospitals',
    Department: 'departments',
    Doctor: 'doctors',
    Service: 'services',
    Bed: 'beds',
    Medicine: 'medicines',
    Patient: 'patients'
};

class SyncExecutor {
    getCollection(name) {
        const localDb = db.getDb();
        if (!localDb) {
            throw new Error('Local MongoDB is not connected');
        }
        return localDb.collection(name);
    }

    /**
     * Apply an incremental change event to Local MongoDB.
     * Guaranteed idempotent and protected against stale versions.
     */
    async applyEvent({ eventId, entityType, entityId, operation, payload = {}, version }) {
        const collectionName = ENTITY_COLLECTION_MAP[entityType];
        if (!collectionName) {
            throw new Error(`Unsupported entity type '${entityType}' for local sync`);
        }

        const eventsColl = this.getCollection('sync_applied_events');
        const checkpointsColl = this.getCollection('sync_checkpoints');
        const targetColl = this.getCollection(collectionName);

        // 1. Idempotency Check: Was this exact event already applied?
        const alreadyApplied = await eventsColl.findOne({ eventId });
        if (alreadyApplied) {
            logger.info('SYNC', `Event '${eventId}' already applied. Skipping idempotently.`);
            return { success: true, skipped: true, reason: 'ALREADY_APPLIED' };
        }

        const targetId = payload._id || entityId;
        const incomingVersion = Number(version) || Date.now();

        // 2. Versioning Check: Prevent stale updates from overwriting newer records
        const existingDoc = await targetColl.findOne({ _id: targetId });
        if (existingDoc && existingDoc._cloudVersion && existingDoc._cloudVersion >= incomingVersion) {
            logger.warn('SYNC', `Stale event version (${incomingVersion} <= ${existingDoc._cloudVersion}) for ${entityType} '${targetId}'. Skipping.`);
            // Still record event as applied so we do not re-process
            await eventsColl.insertOne({
                eventId,
                entityType,
                entityId: String(targetId),
                operation,
                version: incomingVersion,
                skipped: true,
                reason: 'STALE_VERSION',
                appliedAt: new Date()
            });
            return { success: true, skipped: true, reason: 'STALE_VERSION' };
        }

        // 3. Execute Operation
        if (operation === 'DELETE') {
            // Respect soft-delete conventions: flag document as inactive / deleted
            await targetColl.updateOne(
                { _id: targetId },
                {
                    $set: {
                        isActive: false,
                        _isDeleted: true,
                        _cloudVersion: incomingVersion,
                        _syncedAt: new Date(),
                        _source: 'CLOUD'
                    }
                },
                { upsert: false }
            );
            logger.info('SYNC', `Soft-deleted ${entityType} '${targetId}' in Local MongoDB`);
        } else {
            // CREATE or UPDATE -> Idempotent upsert
            const docToSave = {
                ...payload,
                _id: targetId,
                _cloudVersion: incomingVersion,
                _syncedAt: new Date(),
                _source: 'CLOUD'
            };

            await targetColl.updateOne(
                { _id: targetId },
                { $set: docToSave },
                { upsert: true }
            );
            logger.info('SYNC', `Upserted ${entityType} '${targetId}' (v${incomingVersion}) into Local MongoDB`);
        }

        // 4. Record event as successfully applied
        await eventsColl.insertOne({
            eventId,
            entityType,
            entityId: String(targetId),
            operation,
            version: incomingVersion,
            appliedAt: new Date()
        });

        // 5. Update installation checkpoint cursor
        await checkpointsColl.updateOne(
            { checkpointId: 'latest' },
            {
                $set: {
                    lastProcessedVersion: incomingVersion,
                    lastProcessedEventId: eventId,
                    updatedAt: new Date()
                }
            },
            { upsert: true }
        );

        // 6. Neutralize any conflicting local outbox mutations for this entity
        try {
            const outboxCol = this.getCollection('sync_outbox');
            if (outboxCol) {
                await outboxCol.updateMany(
                    { entityType, entityId: String(targetId), status: 'CONFLICT' },
                    {
                        $set: {
                            status: 'RESOLVED',
                            resolvedAt: new Date(),
                            errorMessage: `Resolved by incoming Cloud version ${incomingVersion}`
                        }
                    }
                );
            }
            const localOutbox = require('./localOutbox');
            if (localOutbox?.inMemoryOutbox) {
                for (const item of localOutbox.inMemoryOutbox.values()) {
                    if (item.entityType === entityType && String(item.entityId) === String(targetId) && item.status === 'CONFLICT') {
                        item.status = 'RESOLVED';
                        item.resolvedAt = new Date();
                    }
                }
            }
        } catch (e) {
            // non-fatal
        }

        return { success: true, applied: true, version: incomingVersion };
    }

    /**
     * Apply initial sync batch for an entity into Local MongoDB.
     */
    async applyInitialBatch(entityType, records = []) {
        if (!records || records.length === 0) {
            return { total: 0, applied: 0 };
        }

        const collectionName = ENTITY_COLLECTION_MAP[entityType];
        if (!collectionName) {
            throw new Error(`Unsupported entity type '${entityType}'`);
        }

        const targetColl = this.getCollection(collectionName);
        const operations = records.map(rec => {
            const docId = rec._id || rec.id;
            const docVersion = rec.updatedAt ? new Date(rec.updatedAt).getTime() : Date.now();
            return {
                updateOne: {
                    filter: { _id: docId },
                    update: {
                        $set: {
                            ...rec,
                            _id: docId,
                            _cloudVersion: docVersion,
                            _syncedAt: new Date()
                        }
                    },
                    upsert: true
                }
            };
        });

        const bulkResult = await targetColl.bulkWrite(operations, { ordered: false });
        logger.info('SYNC', `Initial batch: Upserted ${bulkResult.upsertedCount + bulkResult.modifiedCount} ${entityType} records.`);

        return {
            total: records.length,
            applied: bulkResult.upsertedCount + bulkResult.modifiedCount
        };
    }

    /**
     * Get the latest processed checkpoint version from Local MongoDB.
     */
    async getLatestCheckpoint() {
        try {
            const checkpointsColl = this.getCollection('sync_checkpoints');
            const cp = await checkpointsColl.findOne({ checkpointId: 'latest' });
            return cp ? cp.lastProcessedVersion : 0;
        } catch (e) {
            return 0;
        }
    }
}

module.exports = new SyncExecutor();
