const syncEmitter = require('./syncEmitter');

/**
 * syncModelPlugin — Production-grade Mongoose schema plugin
 * 
 * Automatically captures mutations on Cloud models (Patient/User, Doctor, Department,
 * Bed, Medicine, Service, Hospital) and queues corresponding SyncEvent records.
 *
 * Guarantees:
 * 1. Non-blocking: Emits asynchronously via setImmediate without delaying primary API responses.
 * 2. Loop prevention: Never emits for changes originating from 'LOCAL_SYNC_APPLIED' or 'LOCAL'.
 * 3. Tenant scoped: Associates changes with the correct hospitalId.
 * 4. Error resilient: Catches any dispatch errors without interrupting user operations.
 */
function syncModelPlugin(schema, options = {}) {
    const entityType = options.entityType || 'Unknown';

    // Hook: post-save for documents (CREATE or UPDATE)
    schema.post('save', function (doc) {
        if (!doc) return;
        // Loop prevention: ignore if originated from local sync
        if (doc._source === 'LOCAL_SYNC_APPLIED' || doc._origin === 'LOCAL') return;

        const operation = this.isNew ? 'CREATE' : 'UPDATE';
        setImmediate(async () => {
            try {
                await syncEmitter.emitEntityChange({
                    entityType,
                    doc: doc.toObject ? doc.toObject() : doc,
                    operation
                });
            } catch (err) {
                // Non-fatal, logged inside syncEmitter
            }
        });
    });

    // Hook: post-findOneAndUpdate for atomic updates
    schema.post('findOneAndUpdate', function (doc) {
        if (!doc) return;
        if (doc._source === 'LOCAL_SYNC_APPLIED' || doc._origin === 'LOCAL') return;

        setImmediate(async () => {
            try {
                await syncEmitter.emitEntityChange({
                    entityType,
                    doc: doc.toObject ? doc.toObject() : doc,
                    operation: 'UPDATE'
                });
            } catch (err) {
                // Non-fatal
            }
        });
    });

    // Hook: post-findOneAndDelete / post-remove for deletions
    schema.post('findOneAndDelete', function (doc) {
        if (!doc) return;
        if (doc._source === 'LOCAL_SYNC_APPLIED' || doc._origin === 'LOCAL') return;

        setImmediate(async () => {
            try {
                await syncEmitter.emitEntityChange({
                    entityType,
                    doc: doc.toObject ? doc.toObject() : doc,
                    operation: 'DELETE'
                });
            } catch (err) {
                // Non-fatal
            }
        });
    });
}

module.exports = syncModelPlugin;
