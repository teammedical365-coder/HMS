const mongoose = require('mongoose');
const SyncConflict = require('../../models/syncConflict.model');
const LocalInstallation = require('../../models/localInstallation.model');
const AuditLog = require('../../models/auditLog.model');
const syncEmitter = require('./syncEmitter');

// Cloud primary models
const User = require('../../models/user.model');
const Doctor = require('../../models/doctor.model');
const Department = require('../../models/department.model');
const Service = require('../../models/service.model');
const Bed = require('../../models/bed.model');
const Medicine = require('../../models/medicine.model');
const Hospital = require('../../models/hospital.model');

// Prohibited fields that must never be overwritten or merged directly
const PROHIBITED_FIELDS = new Set([
    '_id',
    'id',
    'hospitalId',
    'installationId',
    'password',
    'token',
    'credentials',
    'resetPasswordToken',
    'refreshToken',
    'pairingToken',
    'createdAt',
    'updatedAt',
    '__v',
    'isDeleted',
    '_cloudVersion',
    '_source',
    '_originInstallationId',
    '_origin'
]);

class ConflictResolutionService {
    getModelForEntity(entityType) {
        switch (entityType) {
            case 'Patient': return User;
            case 'Doctor': return Doctor;
            case 'Department': return Department;
            case 'Service': return Service;
            case 'Bed': return Bed;
            case 'Medicine': return Medicine;
            case 'Hospital': return Hospital;
            default: return null;
        }
    }

    /**
     * Remove system-protected and sensitive fields from a payload
     */
    sanitizePayload(payload = {}) {
        const cleaned = { ...payload };
        for (const field of PROHIBITED_FIELDS) {
            delete cleaned[field];
        }
        return cleaned;
    }

    /**
     * Query conflicts for a hospital with optional status/entityType filtering & pagination.
     */
    async getConflicts({ hospitalId, status, entityType, limit = 50, page = 1 }) {
        const query = { hospitalId };

        if (status) {
            if (status === 'PENDING') {
                query.status = { $in: ['PENDING', 'PENDING_REVIEW'] };
            } else {
                query.status = status;
            }
        }

        if (entityType) {
            query.entityType = entityType;
        }

        const skip = (Math.max(1, parseInt(page, 10)) - 1) * Math.max(1, parseInt(limit, 10));
        const take = Math.max(1, parseInt(limit, 10));

        const [conflicts, totalCount, pendingCount, resolvedCount] = await Promise.all([
            SyncConflict.find(query)
                .sort({ detectedAt: -1 })
                .skip(skip)
                .limit(take)
                .lean(),
            SyncConflict.countDocuments(query),
            SyncConflict.countDocuments({ hospitalId, status: { $in: ['PENDING', 'PENDING_REVIEW'] } }),
            SyncConflict.countDocuments({ hospitalId, status: { $in: ['RESOLVED', 'RESOLVED_LOCAL', 'RESOLVED_CLOUD', 'RESOLVED_MERGED'] } })
        ]);

        return {
            conflicts,
            totalCount,
            pendingCount,
            resolvedCount,
            page: parseInt(page, 10),
            limit: take,
            totalPages: Math.ceil(totalCount / take)
        };
    }

    /**
     * Compute field-by-field diff between localPayload and cloudPayload.
     * Returns structured comparison for UI inspection.
     */
    async getConflictDetail({ hospitalId, conflictId }) {
        const conflict = await SyncConflict.findOne({ conflictId, hospitalId }).lean();
        if (!conflict) {
            throw new Error(`Conflict '${conflictId}' not found for this hospital.`);
        }

        const model = this.getModelForEntity(conflict.entityType);
        let currentCloudDoc = null;
        let isStale = false;
        let currentCloudVersion = conflict.cloudVersion;

        if (model) {
            const query = { _id: conflict.entityId };
            if (conflict.entityType !== 'Medicine') {
                query.hospitalId = hospitalId;
            }
            currentCloudDoc = await model.findOne(query).lean();
            if (currentCloudDoc) {
                currentCloudVersion = (currentCloudDoc._cloudVersion !== undefined && currentCloudDoc._cloudVersion !== null)
                    ? Number(currentCloudDoc._cloudVersion)
                    : (currentCloudDoc.updatedAt ? new Date(currentCloudDoc.updatedAt).getTime() : 0);
                if (currentCloudVersion !== conflict.cloudVersion) {
                    isStale = true;
                }
            }
        }

        const localPayload = conflict.localPayload || {};
        const cloudPayload = conflict.cloudPayload || (currentCloudDoc || {});

        const patientName = (conflict.entityType === 'Patient')
            ? (localPayload.name || cloudPayload.name || 'Unknown Patient')
            : null;
        const mrn = (conflict.entityType === 'Patient')
            ? (localPayload.mrn || cloudPayload.mrn || localPayload.patientId || cloudPayload.patientId || 'N/A')
            : null;

        const allKeys = Array.from(new Set([
            ...Object.keys(localPayload),
            ...Object.keys(cloudPayload)
        ])).filter(k => !k.startsWith('__'));

        const diff = allKeys.map(key => {
            const localVal = localPayload[key];
            const cloudVal = cloudPayload[key];
            const isProhibited = PROHIBITED_FIELDS.has(key);
            const isDifferent = JSON.stringify(localVal) !== JSON.stringify(cloudVal);

            return {
                field: key,
                localValue: localVal !== undefined ? localVal : null,
                cloudValue: cloudVal !== undefined ? cloudVal : null,
                isDifferent,
                isProhibited
            };
        });

        return {
            conflict,
            diff,
            isStale,
            currentCloudVersion,
            currentCloudDoc,
            patientName,
            mrn
        };
    }

    /**
     * Resolve a conflict with one of KEEP_LOCAL, KEEP_CLOUD, or MERGED.
     * Enforces:
     * - Stale conflict protection (rejects if Cloud version changed since detection)
     * - Prohibited fields protection
     * - Atomicity & Cloud master consistency
     * - Loop prevention: emits event with source: 'CONFLICT_RESOLUTION'
     * - Audit trail recording
     */
    async resolveConflict({ hospitalId, conflictId, resolutionType, selectedMergeFields = {}, resolutionNotes = '', user }) {
        if (!['KEEP_LOCAL', 'KEEP_CLOUD', 'MERGED'].includes(resolutionType)) {
            throw new Error(`Invalid resolution type '${resolutionType}'. Must be KEEP_LOCAL, KEEP_CLOUD, or MERGED.`);
        }

        const conflict = await SyncConflict.findOne({ conflictId, hospitalId });
        if (!conflict) {
            throw new Error(`Conflict '${conflictId}' not found.`);
        }

        if (conflict.status === 'RESOLVED' || conflict.status.startsWith('RESOLVED_')) {
            throw new Error(`Conflict '${conflictId}' has already been resolved.`);
        }

        // Merge safety: Never auto-merge complex clinical or financial records
        const FORBIDDEN_MERGE_ENTITIES = new Set([
            'Payment', 'PaymentTransaction', 'Refund', 'Invoice',
            'ClinicalNote', 'Prescription', 'LabReport', 'NursingVital', 'SurgeryRecord'
        ]);
        if (FORBIDDEN_MERGE_ENTITIES.has(conflict.entityType)) {
            conflict.status = 'MANUAL_REVIEW_REQUIRED';
            await conflict.save();
            const err = new Error(`Entity type '${conflict.entityType}' requires manual review and cannot be merged automatically.`);
            err.code = 'MANUAL_REVIEW_REQUIRED';
            throw err;
        }

        const model = this.getModelForEntity(conflict.entityType);
        if (!model) {
            throw new Error(`No primary model found for entity '${conflict.entityType}'`);
        }

        const query = { _id: conflict.entityId };
        if (conflict.entityType !== 'Medicine') {
            query.hospitalId = hospitalId;
        }

        let existingDoc = await model.findOne(query);

        // 1. Stale Conflict Protection:
        // If Cloud was modified again after the conflict was detected, reject resolution
        if (existingDoc) {
            const currentCloudVersion = (existingDoc._cloudVersion !== undefined && existingDoc._cloudVersion !== null)
                ? Number(existingDoc._cloudVersion)
                : (existingDoc.updatedAt ? new Date(existingDoc.updatedAt).getTime() : 0);
            if (currentCloudVersion !== conflict.cloudVersion) {
                // Update conflict's cloud snapshot so admin can review updated state
                conflict.cloudPayload = existingDoc.toObject ? existingDoc.toObject() : existingDoc;
                conflict.cloudVersion = currentCloudVersion;
                await conflict.save();

                const err = new Error('STALE_CONFLICT: Conflict has changed since it was detected. Please review the latest version.');
                err.code = 'STALE_CONFLICT';
                err.currentCloudVersion = currentCloudVersion;
                err.conflictCloudVersion = conflict.cloudVersion;
                throw err;
            }
        }

        // 2. Compute New Authoritative Cloud Data
        let finalData = {};
        const baseCloud = existingDoc ? (existingDoc.toObject ? existingDoc.toObject() : existingDoc) : (conflict.cloudPayload || {});
        const baseLocal = conflict.localPayload || {};

        if (resolutionType === 'KEEP_LOCAL') {
            finalData = this.sanitizePayload(baseLocal);
        } else if (resolutionType === 'KEEP_CLOUD') {
            finalData = this.sanitizePayload(baseCloud);
        } else if (resolutionType === 'MERGED') {
            // Validate selected merge fields
            finalData = this.sanitizePayload(baseCloud);

            for (const [field, choice] of Object.entries(selectedMergeFields || {})) {
                if (PROHIBITED_FIELDS.has(field)) {
                    continue; // Skip prohibited fields safely
                }

                if (choice === 'LOCAL') {
                    if (baseLocal[field] !== undefined) {
                        finalData[field] = baseLocal[field];
                    }
                } else if (choice === 'CLOUD') {
                    if (baseCloud[field] !== undefined) {
                        finalData[field] = baseCloud[field];
                    }
                }
            }
        }

        // 3. New Cloud Version Calculation
        const currentVersion = conflict.cloudVersion || Date.now();
        const newCloudVersion = Math.max(currentVersion, conflict.localVersion || 0, Date.now()) + 1;

        // Apply metadata for loop prevention
        finalData._cloudVersion = newCloudVersion;
        finalData._source = 'CONFLICT_RESOLUTION';
        finalData._originInstallationId = conflict.installationId;
        finalData.updatedAt = new Date(newCloudVersion);

        if (conflict.entityType === 'Patient') {
            finalData.hospitalId = hospitalId;
            finalData.role = 'patient';
        } else if (conflict.entityType !== 'Medicine') {
            finalData.hospitalId = hospitalId;
        }

        // 4. Persist to Cloud Primary Database
        let updatedDoc = null;
        if (existingDoc) {
            Object.assign(existingDoc, finalData);
            updatedDoc = await existingDoc.save();
        } else {
            finalData._id = conflict.entityId;
            updatedDoc = await model.create(finalData);
        }

        // 5. Broadcast Cloud -> Local Sync Event with source: 'CONFLICT_RESOLUTION'
        // This ensures the conflicting local installation AND all other local installations
        // receive the final resolved document without triggering sync loops.
        try {
            await syncEmitter.emitEntityChange({
                entityType: conflict.entityType,
                doc: updatedDoc.toObject ? updatedDoc.toObject() : updatedDoc,
                operation: 'UPDATE',
                hospitalId,
                source: 'CONFLICT_RESOLUTION'
            });
        } catch (emitErr) {
            console.warn('[ConflictResolution] Warning: Failed to emit sync event for resolution:', emitErr.message);
        }

        // 6. Update SyncConflict Record
        conflict.status = 'RESOLVED';
        conflict.resolutionType = resolutionType;
        conflict.selectedMergeFields = selectedMergeFields || {};
        conflict.finalCloudVersion = newCloudVersion;
        conflict.resolvedAt = new Date();
        conflict.resolvedBy = user ? (user._id || user.id) : null;
        conflict.resolutionNotes = resolutionNotes || '';
        await conflict.save();

        // 7. Audit Trail
        try {
            await AuditLog.create({
                clinicId: hospitalId,
                userId: user ? (user._id || user.id) : null,
                userName: user ? (user.name || user.email || 'Hospital Admin') : 'Hospital Admin',
                role: user ? (user.role || 'Hospital Admin') : 'Hospital Admin',
                action: 'SYNC_CONFLICT_RESOLVED',
                targetModel: conflict.entityType,
                targetId: updatedDoc._id,
                targetLabel: `${conflict.conflictId} (${resolutionType})`,
                reason: resolutionNotes || `Resolved conflict via ${resolutionType}`,
                success: true
            });
        } catch (auditErr) {
            console.warn('[ConflictResolution] AuditLog creation warning:', auditErr.message);
        }

        // 8. Update Local Installation Statistics
        try {
            const pendingCount = await SyncConflict.countDocuments({
                hospitalId,
                status: { $in: ['PENDING', 'PENDING_REVIEW'] }
            });

            await LocalInstallation.updateMany(
                { hospitalId },
                {
                    $set: { 'syncStatus.uploadStatus.conflictsCount': pendingCount },
                    $push: {
                        'syncStatus.recentActivities': {
                            $each: [{
                                action: 'CONFLICT_RESOLVED',
                                details: `Resolved ${conflict.entityType} (${conflict.entityId}) via ${resolutionType}`,
                                timestamp: new Date()
                            }],
                            $slice: -20
                        }
                    }
                }
            );
        } catch (instErr) {
            console.warn('[ConflictResolution] LocalInstallation stat update warning:', instErr.message);
        }

        return {
            success: true,
            message: `Conflict '${conflictId}' resolved successfully using ${resolutionType}.`,
            conflict,
            finalCloudVersion: newCloudVersion,
            updatedDoc
        };
    }

    /**
     * Dismiss a conflict without modifying Cloud database.
     */
    async dismissConflict({ hospitalId, conflictId, dismissalNotes = '', user }) {
        const conflict = await SyncConflict.findOne({ conflictId, hospitalId });
        if (!conflict) {
            throw new Error(`Conflict '${conflictId}' not found.`);
        }

        conflict.status = 'DISMISSED';
        conflict.resolutionNotes = dismissalNotes;
        conflict.resolvedAt = new Date();
        conflict.resolvedBy = user ? (user._id || user.id) : null;
        await conflict.save();

        try {
            await AuditLog.create({
                clinicId: hospitalId,
                userId: user ? (user._id || user.id) : null,
                userName: user ? (user.name || user.email || 'Hospital Admin') : 'Hospital Admin',
                role: user ? (user.role || 'Hospital Admin') : 'Hospital Admin',
                action: 'SYNC_CONFLICT_DISMISSED',
                targetModel: conflict.entityType,
                targetId: conflict._id,
                targetLabel: conflict.conflictId,
                reason: dismissalNotes,
                success: true
            });
        } catch (e) {}

        const pendingCount = await SyncConflict.countDocuments({
            hospitalId,
            status: { $in: ['PENDING', 'PENDING_REVIEW'] }
        });

        await LocalInstallation.updateMany(
            { hospitalId },
            { $set: { 'syncStatus.uploadStatus.conflictsCount': pendingCount } }
        );

        return {
            success: true,
            message: `Conflict '${conflictId}' has been dismissed.`,
            conflict
        };
    }
}

module.exports = new ConflictResolutionService();
