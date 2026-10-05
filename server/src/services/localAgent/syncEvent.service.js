const crypto = require('crypto');
const SyncEvent = require('../../models/syncEvent.model');
const LocalInstallation = require('../../models/localInstallation.model');

const SUPPORTED_ENTITIES = ['Hospital', 'Department', 'Doctor', 'Service', 'Bed', 'Medicine', 'Patient'];

/**
 * Sanitize document payload before queuing for local sync.
 * Strips password hashes, internal secrets, tokens, and Mongoose internals.
 */
function sanitizePayload(raw) {
    if (!raw) return {};
    const obj = (typeof raw.toObject === 'function') ? raw.toObject() : JSON.parse(JSON.stringify(raw));

    // Never send password hashes, security salts, or tokens to local agent
    delete obj.password;
    delete obj.resetPasswordToken;
    delete obj.resetPasswordExpires;
    delete obj.refreshToken;
    delete obj.__v;

    return obj;
}

class SyncEventService {
    /**
     * Create and record a durable sync event in Cloud MongoDB.
     */
    async createSyncEvent({ hospitalId, entityType, entityId, operation, payload = {}, version, io = null }) {
        if (!hospitalId) {
            throw new Error('hospitalId is required to create a sync event');
        }
        if (!SUPPORTED_ENTITIES.includes(entityType)) {
            throw new Error(`Entity type '${entityType}' is not supported in Phase 2 sync`);
        }
        if (!['CREATE', 'UPDATE', 'DELETE'].includes(operation)) {
            throw new Error(`Invalid operation '${operation}'. Must be CREATE, UPDATE, or DELETE`);
        }

        const eventId = `EVT-${crypto.randomUUID()}`;
        const eventVersion = Number(version) || Date.now();
        const sanitized = sanitizePayload(payload);

        // Find active local installations for this hospital
        const installations = await LocalInstallation.find({
            hospitalId,
            status: { $ne: 'NOT_CONFIGURED' }
        }).select('installationId').lean();

        const installationStatusList = installations.map(inst => ({
            installationId: inst.installationId,
            status: 'PENDING',
            acknowledgedAt: null,
            retryCount: 0,
            errorMessage: null
        }));

        const syncEvent = await SyncEvent.create({
            eventId,
            hospitalId,
            entityType,
            entityId: String(entityId),
            operation,
            version: eventVersion,
            payload: sanitized,
            status: 'PENDING',
            installations: installationStatusList
        });

        // Update pending count on local installations
        if (installations.length > 0) {
            await LocalInstallation.updateMany(
                { hospitalId, status: { $ne: 'NOT_CONFIGURED' } },
                { $inc: { 'syncStatus.pendingEventsCount': 1 } }
            );
        }

        // Notify Local Agent via Socket.io if available (optional speedup, not single source of truth)
        if (io) {
            try {
                io.to(`hospital_${hospitalId}`).emit('sync:new_event', {
                    eventId,
                    entityType,
                    entityId: String(entityId),
                    operation,
                    version: eventVersion,
                    hospitalId
                });
            } catch (err) {
                // Non-fatal: durable DB queue remains the source of truth
            }
        }

        return syncEvent;
    }

    /**
     * Retrieve pending events for a specific installation (Cursor/checkpoint pagination).
     * Strictly enforces multi-tenant isolation by hospitalId.
     */
    async getPendingEvents({ hospitalId, installationId, afterVersion = 0, limit = 100 }) {
        const safeLimit = Math.min(Math.max(1, parseInt(limit, 10) || 100), 500);

        const query = {
            hospitalId,
            version: { $gt: Number(afterVersion) || 0 },
            'installations.installationId': installationId,
            'installations.status': { $in: ['PENDING', 'FAILED'] }
        };

        const events = await SyncEvent.find(query)
            .sort({ version: 1, _id: 1 })
            .limit(safeLimit)
            .lean();

        const count = events.length;
        const latestVersion = count > 0 ? events[count - 1].version : Number(afterVersion) || 0;

        return {
            events,
            count,
            hasMore: count === safeLimit,
            latestVersion
        };
    }

    /**
     * Acknowledge one or multiple events processed by a Local Agent.
     */
    async acknowledgeEvents({ hospitalId, installationId, acks = [] }) {
        if (!Array.isArray(acks) || acks.length === 0) {
            return { success: true, acknowledgedCount: 0 };
        }

        let successCount = 0;
        let failCount = 0;
        let lastVersion = 0;
        let lastEventId = null;
        let lastError = null;

        for (const ack of acks) {
            const { eventId, status = 'ACKNOWLEDGED', errorMessage, version } = ack;
            if (!eventId) continue;

            const isSuccess = status === 'ACKNOWLEDGED';
            if (isSuccess) {
                successCount++;
            } else {
                failCount++;
                lastError = errorMessage || 'Processing failed on local agent';
            }

            if (version && version > lastVersion) {
                lastVersion = version;
                lastEventId = eventId;
            }

            // Update specific installation delivery state
            await SyncEvent.updateOne(
                {
                    hospitalId,
                    eventId,
                    'installations.installationId': installationId
                },
                {
                    $set: {
                        'installations.$.status': isSuccess ? 'ACKNOWLEDGED' : 'FAILED',
                        'installations.$.acknowledgedAt': isSuccess ? new Date() : null,
                        'installations.$.errorMessage': isSuccess ? null : (errorMessage || 'Processing error')
                    },
                    $inc: {
                        'installations.$.retryCount': isSuccess ? 0 : 1
                    }
                }
            );

            // If all installations for this event have acknowledged, mark event SYNCED
            if (isSuccess) {
                const pendingRemaining = await SyncEvent.countDocuments({
                    eventId,
                    'installations.status': { $ne: 'ACKNOWLEDGED' }
                });
                if (pendingRemaining === 0) {
                    await SyncEvent.updateOne({ eventId }, { $set: { status: 'SYNCED' } });
                }
            }
        }

        // Recompute pending & failed counts for this installation
        const pendingCount = await SyncEvent.countDocuments({
            hospitalId,
            'installations.installationId': installationId,
            'installations.status': 'PENDING'
        });

        const failedCount = await SyncEvent.countDocuments({
            hospitalId,
            'installations.installationId': installationId,
            'installations.status': 'FAILED'
        });

        // Update installation sync status
        const updateFields = {
            'syncStatus.lastSyncAt': new Date(),
            'syncStatus.pendingEventsCount': pendingCount,
            'syncStatus.failedEventsCount': failedCount
        };

        if (successCount > 0) {
            updateFields['syncStatus.totalRecordsSynced'] = successCount;
        }
        if (lastVersion > 0) {
            updateFields['syncStatus.lastProcessedVersion'] = lastVersion;
            updateFields['syncStatus.lastProcessedEventId'] = lastEventId;
        }
        if (lastError) {
            updateFields['syncStatus.lastSyncError'] = lastError;
        } else if (failCount === 0) {
            updateFields['syncStatus.lastSyncError'] = null;
        }

        await LocalInstallation.updateOne(
            { hospitalId, installationId },
            {
                $set: updateFields,
                $inc: { 'syncStatus.totalRecordsSynced': successCount }
            }
        );

        return {
            success: true,
            acknowledgedCount: acks.length,
            successCount,
            failCount,
            pendingRemaining: pendingCount
        };
    }

    /**
     * Get aggregate sync telemetry for the Hospital Admin UI.
     */
    async getSyncStatus(hospitalId) {
        const inst = await LocalInstallation.findOne({ hospitalId }).lean();
        if (!inst) {
            return {
                configured: false,
                installationId: null,
                initialSync: { status: 'NOT_STARTED', progress: {} },
                lastSyncAt: null,
                pendingEvents: 0,
                failedEvents: 0,
                recordsSynced: 0,
                lastSyncError: null
            };
        }

        const syncStatus = inst.syncStatus || {};
        return {
            configured: inst.status !== 'NOT_CONFIGURED',
            installationId: inst.installationId,
            name: inst.name,
            agentVersion: inst.agentVersion,
            agentStatus: inst.status,
            dbStatus: inst.dbStatus,
            cloudConnection: inst.cloudConnection,
            initialSync: syncStatus.initialSync || { status: 'NOT_STARTED', progress: {} },
            lastSyncAt: syncStatus.lastSyncAt,
            lastProcessedVersion: syncStatus.lastProcessedVersion || 0,
            pendingEvents: syncStatus.pendingEventsCount || 0,
            failedEvents: syncStatus.failedEventsCount || 0,
            recordsSynced: syncStatus.totalRecordsSynced || 0,
            lastSyncError: syncStatus.lastSyncError || null,
            lastHeartbeat: inst.lastHeartbeat
        };
    }

    /**
     * Reset failed events to PENDING so local agent can retry them.
     */
    async retryFailedEvents(hospitalId, installationId) {
        await SyncEvent.updateMany(
            {
                hospitalId,
                'installations.installationId': installationId,
                'installations.status': 'FAILED'
            },
            {
                $set: {
                    'installations.$.status': 'PENDING',
                    'installations.$.errorMessage': null
                }
            }
        );

        const pendingCount = await SyncEvent.countDocuments({
            hospitalId,
            'installations.installationId': installationId,
            'installations.status': 'PENDING'
        });

        await LocalInstallation.updateOne(
            { hospitalId, installationId },
            {
                $set: {
                    'syncStatus.pendingEventsCount': pendingCount,
                    'syncStatus.failedEventsCount': 0,
                    'syncStatus.lastSyncError': null
                }
            }
        );

        return { success: true, pendingCount };
    }
}

module.exports = new SyncEventService();
