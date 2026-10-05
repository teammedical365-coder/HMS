const syncEventService = require('./syncEvent.service');

/**
 * SyncEmitter — Dispatches change events for Cloud -> Local sync.
 * Used by Mongoose middleware, controllers, or test scripts.
 */
class SyncEmitter {
    async emitEntityChange({ entityType, doc, operation = 'UPDATE', hospitalId = null, io = null }) {
        try {
            if (!doc) return null;
            // Loop Prevention (Phase 3): Never echo changes back that originated from Local sync
            if (doc._source === 'LOCAL_SYNC_APPLIED' || doc._origin === 'LOCAL') {
                return null;
            }
            const targetHospitalId = hospitalId || doc.hospitalId || (entityType === 'Hospital' ? doc._id : null);
            if (!targetHospitalId) return null;

            // Only sync patients for User model changes
            if (entityType === 'User' || entityType === 'Patient') {
                const role = String(doc.role || '').toLowerCase();
                // If it has a specific staff role other than patient, do not sync as patient
                if (role && role !== 'patient' && !role.includes('patient')) {
                    return null;
                }
            }

            const normalizedEntity = (entityType === 'User') ? 'Patient' : entityType;

            return await syncEventService.createSyncEvent({
                hospitalId: targetHospitalId,
                entityType: normalizedEntity,
                entityId: String(doc._id || doc.id),
                operation,
                payload: doc,
                version: Date.now(),
                io
            });
        } catch (err) {
            console.warn(`[SyncEmitter] Non-fatal error recording ${entityType} ${operation}:`, err.message);
            return null;
        }
    }
}

module.exports = new SyncEmitter();
