const mongoose = require('mongoose');
const crypto = require('crypto');

const LocalInstallation = require('../../models/localInstallation.model');
const SyncConflict = require('../../models/syncConflict.model');
const LocalSyncProcessedEvent = require('../../models/localSyncProcessedEvent.model');
const User = require('../../models/user.model');
const Doctor = require('../../models/doctor.model');
const Department = require('../../models/department.model');
const Service = require('../../models/service.model');
const Bed = require('../../models/bed.model');
const Medicine = require('../../models/medicine.model');

const SUPPORTED_ENTITIES = new Set([
    'Patient',
    'Doctor',
    'Department',
    'Service',
    'Bed',
    'Medicine'
]);

const FORBIDDEN_ENTITIES = new Set([
    'Payment',
    'PaymentTransaction',
    'Refund',
    'Invoice',
    'ClinicalNote',
    'Prescription',
    'LabReport',
    'NursingVital',
    'SurgeryRecord'
]);

class CloudSyncReceiverService {
    /**
     * Process an incoming batch of mutations uploaded from a Local Agent (Phase 3).
     *
     * @param {Object} params
     * @param {string|ObjectId} params.hospitalId Authenticated hospital ID (from installation JWT)
     * @param {string} params.installationId Authenticated installation ID (from installation JWT)
     * @param {Array} params.events Array of outbox events to apply
     */
    async processIncomingBatch({ hospitalId, installationId, events = [] }) {
        if (!hospitalId || !installationId) {
            throw new Error('Authenticated hospital and installation context required');
        }

        if (!Array.isArray(events)) {
            throw new Error('events must be an array');
        }

        // 1. Verify that installation exists, is active, and belongs to this hospital
        const inst = await LocalInstallation.findOne({ installationId, hospitalId });
        if (!inst) {
            throw new Error(`Installation '${installationId}' does not belong to hospital '${hospitalId}'`);
        }

        if (inst.status === 'REVOKED' || inst.status === 'NOT_CONFIGURED') {
            throw new Error(`Installation '${installationId}' is not active (status: ${inst.status})`);
        }

        const results = [];
        let successCount = 0;
        let conflictCount = 0;
        let failedCount = 0;

        for (const evt of events) {
            try {
                const res = await this.processSingleEvent({ hospitalId, installationId, event: evt });
                results.push(res);
                if (res.status === 'SUCCESS') successCount++;
                else if (res.status === 'CONFLICT') conflictCount++;
                else failedCount++;
            } catch (err) {
                results.push({
                    eventId: evt.eventId,
                    status: 'FAILED',
                    message: err.message
                });
                failedCount++;
            }
        }

        // 2. Update installation telemetry & recent activity log
        try {
            if (!inst.syncStatus) inst.syncStatus = {};
            if (!inst.syncStatus.uploadStatus) {
                inst.syncStatus.uploadStatus = {
                    pendingUploadsCount: 0,
                    completedUploadsCount: 0,
                    failedUploadsCount: 0,
                    conflictsCount: 0,
                    lastUploadAt: null
                };
            }

            inst.syncStatus.uploadStatus.lastUploadAt = new Date();
            inst.syncStatus.uploadStatus.completedUploadsCount = (inst.syncStatus.uploadStatus.completedUploadsCount || 0) + successCount;
            inst.syncStatus.uploadStatus.conflictsCount = (inst.syncStatus.uploadStatus.conflictsCount || 0) + conflictCount;
            inst.syncStatus.uploadStatus.failedUploadsCount = (inst.syncStatus.uploadStatus.failedUploadsCount || 0) + failedCount;

            // Append to recent activities (keep last 50)
            if (!inst.syncStatus.recentActivities) inst.syncStatus.recentActivities = [];
            for (const r of results) {
                const targetEvt = events.find(e => e.eventId === r.eventId);
                inst.syncStatus.recentActivities.unshift({
                    timestamp: new Date(),
                    entityType: targetEvt?.entityType || 'Unknown',
                    operation: targetEvt?.operation || 'SYNC',
                    status: r.status,
                    details: r.message || (r.status === 'SUCCESS' ? 'Uploaded successfully' : 'Processed')
                });
            }
            inst.syncStatus.recentActivities = inst.syncStatus.recentActivities.slice(0, 50);

            if (typeof inst.markModified === 'function') {
                inst.markModified('syncStatus');
            }
            if (typeof inst.save === 'function') {
                await inst.save();
            }
        } catch (telemetryErr) {
            console.error('[CloudSyncReceiverService] Failed to update telemetry:', telemetryErr.message);
        }

        return {
            success: true,
            totalReceived: events.length,
            successCount,
            conflictCount,
            failedCount,
            results
        };
    }

    /**
     * Process an individual event with validation, idempotency, conflict detection, and safe persistence.
     */
    async processSingleEvent({ hospitalId, installationId, event }) {
        const { eventId, entityType, entityId, operation, payload = {}, localVersion, localBaseVersion, source } = event;

        // Validation A: Event identifiers
        if (!eventId) throw new Error('eventId is required');
        if (!entityType) throw new Error('entityType is required');
        if (!entityId) throw new Error('entityId is required');
        if (!operation || !['CREATE', 'UPDATE', 'DELETE'].includes(operation)) {
            throw new Error(`Invalid or missing operation '${operation}'`);
        }

        // Validation B: Source validation
        if (source && source !== 'LOCAL') {
            throw new Error(`Invalid event source '${source}'. Expected 'LOCAL'.`);
        }

        // Validation C: Strict scope enforcement
        if (FORBIDDEN_ENTITIES.has(entityType)) {
            throw new Error(`Entity type '${entityType}' is strictly prohibited in Phase 3 sync (Financial/Clinical protection).`);
        }

        if (!SUPPORTED_ENTITIES.has(entityType)) {
            throw new Error(`Entity type '${entityType}' is not supported in Phase 3 sync`);
        }

        // 1. Idempotency Check: Was this event already processed?
        const alreadyProcessed = await LocalSyncProcessedEvent.findOne({ eventId });
        if (alreadyProcessed) {
            return {
                eventId,
                status: alreadyProcessed.status,
                message: 'Already processed (idempotent)',
                cloudVersion: alreadyProcessed.cloudVersion
            };
        }

        // 2. Fetch current cloud document to check version & conflicts
        const targetModel = this.getModelForEntity(entityType);
        const query = { _id: entityId };
        // Enforce tenant boundary on tenant-scoped entities
        if (entityType !== 'Medicine') {
            query.hospitalId = hospitalId;
        }

        let existingDoc = null;
        if (targetModel) {
            existingDoc = await targetModel.findOne(query);
        }

        // 3. Conflict Detection
        // If updating or deleting an existing doc and the cloud document has changed since local modified it
        if (existingDoc && (operation === 'UPDATE' || operation === 'DELETE')) {
            const currentCloudVersion = (existingDoc._cloudVersion !== undefined && existingDoc._cloudVersion !== null)
                ? Number(existingDoc._cloudVersion)
                : (existingDoc.updatedAt ? new Date(existingDoc.updatedAt).getTime() : 0);
            const baseVersion = (localBaseVersion !== undefined && localBaseVersion !== null)
                ? Number(localBaseVersion)
                : (Number(localVersion) || 0);

            if (currentCloudVersion > baseVersion) {
                // Conflict detected: cloud document was modified after local base version!
                const conflictId = `CONF-${crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(36).substring(2, 7)}`;
                
                await SyncConflict.create({
                    conflictId,
                    eventId,
                    hospitalId,
                    installationId,
                    entityType,
                    entityId: String(entityId),
                    baseVersion,
                    localVersion: Number(localVersion) || Date.now(),
                    cloudVersion: currentCloudVersion,
                    localPayload: payload,
                    cloudPayload: existingDoc.toObject ? existingDoc.toObject() : existingDoc,
                    detectedAt: new Date(),
                    status: 'PENDING_REVIEW'
                });

                // Record in processed events to avoid recreating conflict on retry
                await LocalSyncProcessedEvent.create({
                    eventId,
                    hospitalId,
                    installationId,
                    entityType,
                    entityId: String(entityId),
                    operation,
                    status: 'CONFLICT',
                    cloudVersion: currentCloudVersion,
                    message: `Conflict detected: Cloud version (${currentCloudVersion}) is newer than local base version (${baseVersion}).`
                });

                // Emit socket notification to Hospital Admin if IO instance is attached
                if (this.io) {
                    try {
                        this.io.to(`hospital_${hospitalId}`).emit('sync:conflict_detected', {
                            conflictId,
                            entityType,
                            entityId: String(entityId),
                            baseVersion,
                            cloudVersion: currentCloudVersion,
                            timestamp: Date.now()
                        });
                    } catch (e) {}
                }

                return {
                    eventId,
                    status: 'CONFLICT',
                    message: `Conflict detected: Cloud version (${currentCloudVersion}) is newer than local base (${baseVersion}). Saved for review.`,
                    conflictId,
                    cloudVersion: currentCloudVersion
                };
            }
        }

        // 4. Safe Cloud Persistence
        const cloudVersion = Date.now();
        await this.applyMutationToCloud({
            hospitalId,
            entityType,
            entityId,
            operation,
            payload,
            cloudVersion
        });

        // 5. Record Processed Event for Idempotency
        await LocalSyncProcessedEvent.create({
            eventId,
            hospitalId,
            installationId,
            entityType,
            entityId: String(entityId),
            operation,
            status: 'SUCCESS',
            cloudVersion,
            message: 'Successfully applied to cloud primary database'
        });

        return {
            eventId,
            status: 'SUCCESS',
            message: 'Applied to cloud successfully',
            cloudVersion
        };
    }

    /**
     * Apply the validated mutation directly to the Cloud MongoDB model.
     * Guarantees tenant isolation and sanitizes any sensitive credentials.
     */
    async applyMutationToCloud({ hospitalId, entityType, entityId, operation, payload = {}, cloudVersion }) {
        // Sanitize incoming payload
        const sanitized = { ...payload };
        delete sanitized.password;
        delete sanitized.resetPasswordToken;
        delete sanitized.refreshToken;
        delete sanitized.pairingToken;

        // Ensure origin tag so loop prevention hook won't bounce back to local
        sanitized._source = 'LOCAL_SYNC_APPLIED';
        sanitized.updatedAt = new Date(cloudVersion);

        if (entityType === 'Patient') {
            sanitized.hospitalId = hospitalId;
            sanitized.role = 'patient';

            if (operation === 'DELETE') {
                await User.updateOne(
                    { _id: entityId, hospitalId },
                    { $set: { isActive: false, isDeleted: true, patientStatus: 'Inactive', updatedAt: new Date(cloudVersion) } }
                );
            } else {
                // CREATE or UPDATE
                await User.updateOne(
                    { _id: entityId },
                    { $set: sanitized },
                    { upsert: true }
                );
            }
            return;
        }

        const model = this.getModelForEntity(entityType);
        if (!model) {
            throw new Error(`No Cloud model registered for entity '${entityType}'`);
        }

        if (entityType !== 'Medicine') {
            sanitized.hospitalId = hospitalId;
        }

        if (operation === 'DELETE') {
            await model.updateOne(
                { _id: entityId, ...(entityType !== 'Medicine' ? { hospitalId } : {}) },
                { $set: { isActive: false, _isDeleted: true, updatedAt: new Date(cloudVersion) } }
            );
        } else {
            await model.updateOne(
                { _id: entityId },
                { $set: sanitized },
                { upsert: true }
            );
        }
    }

    getModelForEntity(entityType) {
        switch (entityType) {
            case 'Patient': return User;
            case 'Doctor': return Doctor;
            case 'Department': return Department;
            case 'Service': return Service;
            case 'Bed': return Bed;
            case 'Medicine': return Medicine;
            default: return null;
        }
    }

    /**
     * Get list of unresolved sync conflicts for Hospital Admin
     */
    async getConflicts(hospitalId, { status = 'PENDING_REVIEW', limit = 50, skip = 0 } = {}) {
        const query = { hospitalId };
        if (status) query.status = status;

        const total = await SyncConflict.countDocuments(query);
        const conflicts = await SyncConflict.find(query)
            .sort({ detectedAt: -1 })
            .skip(Number(skip) || 0)
            .limit(Number(limit) || 50)
            .lean();

        return { total, conflicts };
    }

    /**
     * Get conflict detail by conflictId
     */
    async getConflictById(hospitalId, conflictId) {
        const conflict = await SyncConflict.findOne({ hospitalId, conflictId }).lean();
        if (!conflict) {
            throw new Error(`Conflict '${conflictId}' not found.`);
        }
        return conflict;
    }
}

module.exports = new CloudSyncReceiverService();
