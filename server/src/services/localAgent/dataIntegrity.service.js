const mongoose = require('mongoose');
const User = require('../../models/user.model');
const Doctor = require('../../models/doctor.model');
const Department = require('../../models/department.model');
const Service = require('../../models/service.model');
const Bed = require('../../models/bed.model');
const Medicine = require('../../models/medicine.model');
const Hospital = require('../../models/hospital.model');
const SyncEvent = require('../../models/syncEvent.model');
const SyncConflict = require('../../models/syncConflict.model');
const LocalInstallation = require('../../models/localInstallation.model');
const LocalSyncProcessedEvent = require('../../models/localSyncProcessedEvent.model');

const ENTITY_MODELS = {
    Hospital: { model: Hospital, tenantScoped: true, tenantField: '_id' },
    Department: { model: Department, tenantScoped: true, tenantField: 'hospitalId' },
    Doctor: { model: Doctor, tenantScoped: true, tenantField: 'hospitalId' },
    Service: { model: Service, tenantScoped: false },
    Bed: { model: Bed, tenantScoped: true, tenantField: 'hospitalId' },
    Medicine: { model: Medicine, tenantScoped: false },
    Patient: { model: User, tenantScoped: true, tenantField: 'hospitalId', extraFilter: { role: { $in: ['patient', 'Patient'] } } }
};

class DataIntegrityService {
    /**
     * Run a comprehensive data integrity verification for a hospital.
     * This is READ-ONLY — it never modifies any data.
     *
     * Returns a detailed report of:
     * - Per-entity cloud record counts
     * - Pending/failed sync events
     * - Unresolved conflicts
     * - Sync health summary
     */
    async verifyIntegrity(hospitalId) {
        if (!hospitalId) {
            throw new Error('hospitalId is required for data integrity verification');
        }

        const startTime = Date.now();
        const report = {
            hospitalId: String(hospitalId),
            timestamp: new Date(),
            status: 'HEALTHY', // HEALTHY | WARNINGS | ERRORS | CRITICAL
            summary: {
                totalCloudRecords: 0,
                totalSyncEvents: 0,
                pendingSyncEvents: 0,
                failedSyncEvents: 0,
                unresolvedConflicts: 0,
                issues: []
            },
            entities: {},
            syncEvents: {},
            conflicts: {},
            installation: null,
            durationMs: 0
        };

        // 1. Check installation health
        const installation = await LocalInstallation.findOne({ hospitalId }).lean();
        if (!installation) {
            report.installation = { configured: false, status: 'NOT_CONFIGURED' };
            report.status = 'WARNINGS';
            report.summary.issues.push({
                severity: 'WARNING',
                category: 'INSTALLATION',
                message: 'No local installation configured for this hospital'
            });
        } else {
            const now = Date.now();
            const lastHbTime = installation.lastHeartbeat ? new Date(installation.lastHeartbeat).getTime() : 0;
            const heartbeatAge = lastHbTime ? Math.round((now - lastHbTime) / 1000) : null;
            const isHeartbeatFresh = heartbeatAge !== null && heartbeatAge < 45;

            report.installation = {
                configured: Boolean(installation.agentTokenHash),
                installationId: installation.installationId,
                status: installation.status,
                dbStatus: isHeartbeatFresh ? installation.dbStatus : 'UNKNOWN',
                cloudConnection: isHeartbeatFresh ? installation.cloudConnection : 'DISCONNECTED',
                agentVersion: installation.agentVersion,
                lastHeartbeat: installation.lastHeartbeat,
                heartbeatAgeSeconds: heartbeatAge,
                initialSync: installation.syncStatus?.initialSync?.status || 'NOT_STARTED',
                lastSyncAt: installation.syncStatus?.lastSyncAt || null
            };

            if (!isHeartbeatFresh && installation.agentTokenHash) {
                report.summary.issues.push({
                    severity: 'WARNING',
                    category: 'AGENT',
                    message: `Local Agent heartbeat stale (${heartbeatAge || 'N/A'}s ago). Agent may be offline.`
                });
            }

            if (installation.dbStatus === 'DOWN') {
                report.summary.issues.push({
                    severity: 'ERROR',
                    category: 'DATABASE',
                    message: 'Local MongoDB reported as DOWN by agent'
                });
            }
        }

        // 2. Count cloud records for each syncable entity
        for (const [entityType, config] of Object.entries(ENTITY_MODELS)) {
            const query = {};
            if (config.tenantScoped) {
                if (config.tenantField === '_id') {
                    query._id = hospitalId;
                } else {
                    query[config.tenantField] = hospitalId;
                }
            }
            if (config.extraFilter) {
                Object.assign(query, config.extraFilter);
            }

            try {
                const count = await config.model.countDocuments(query);
                report.entities[entityType] = {
                    cloudCount: count,
                    status: 'OK'
                };
                report.summary.totalCloudRecords += count;
            } catch (err) {
                report.entities[entityType] = {
                    cloudCount: 0,
                    status: 'ERROR',
                    error: err.message
                };
                report.summary.issues.push({
                    severity: 'ERROR',
                    category: 'ENTITY_COUNT',
                    message: `Failed to count ${entityType} records: ${err.message}`
                });
            }
        }

        // 3. Check sync events
        try {
            const installationId = installation?.installationId;
            if (installationId) {
                const totalEvents = await SyncEvent.countDocuments({ hospitalId });
                const pendingEvents = await SyncEvent.countDocuments({
                    hospitalId,
                    'installations.installationId': installationId,
                    'installations.status': 'PENDING'
                });
                const failedEvents = await SyncEvent.countDocuments({
                    hospitalId,
                    'installations.installationId': installationId,
                    'installations.status': 'FAILED'
                });

                report.syncEvents = {
                    totalCloudToLocal: totalEvents,
                    pendingCloudToLocal: pendingEvents,
                    failedCloudToLocal: failedEvents
                };
                report.summary.totalSyncEvents = totalEvents;
                report.summary.pendingSyncEvents = pendingEvents;
                report.summary.failedSyncEvents = failedEvents;

                if (failedEvents > 0) {
                    report.summary.issues.push({
                        severity: 'WARNING',
                        category: 'SYNC_EVENTS',
                        message: `${failedEvents} Cloud→Local sync events have failed delivery`
                    });
                }

                if (pendingEvents > 100) {
                    report.summary.issues.push({
                        severity: 'WARNING',
                        category: 'SYNC_EVENTS',
                        message: `${pendingEvents} Cloud→Local sync events are pending. Large backlog detected.`
                    });
                }
            }
        } catch (err) {
            report.summary.issues.push({
                severity: 'ERROR',
                category: 'SYNC_EVENTS',
                message: `Failed to query sync events: ${err.message}`
            });
        }

        // 4. Check upload stats (Local → Cloud)
        if (installation?.syncStatus?.uploadStatus) {
            const us = installation.syncStatus.uploadStatus;
            report.syncEvents.pendingLocalToCloud = us.pendingUploadsCount || 0;
            report.syncEvents.failedLocalToCloud = us.failedUploadsCount || 0;
            report.syncEvents.completedLocalToCloud = us.completedUploadsCount || 0;
            report.syncEvents.lastUploadAt = us.lastUploadAt || null;

            if ((us.failedUploadsCount || 0) > 0) {
                report.summary.issues.push({
                    severity: 'WARNING',
                    category: 'UPLOAD',
                    message: `${us.failedUploadsCount} Local→Cloud upload events have failed`
                });
            }

            if ((us.pendingUploadsCount || 0) > 100) {
                report.summary.issues.push({
                    severity: 'WARNING',
                    category: 'UPLOAD',
                    message: `${us.pendingUploadsCount} Local→Cloud uploads are pending. Large queue detected.`
                });
            }
        }

        // 5. Check unresolved conflicts
        try {
            const unresolvedConflicts = await SyncConflict.countDocuments({
                hospitalId,
                status: { $in: ['PENDING', 'PENDING_REVIEW', 'MANUAL_REVIEW_REQUIRED'] }
            });
            const totalConflicts = await SyncConflict.countDocuments({ hospitalId });
            const resolvedConflicts = await SyncConflict.countDocuments({
                hospitalId,
                status: { $in: ['RESOLVED', 'RESOLVED_LOCAL', 'RESOLVED_CLOUD', 'RESOLVED_MERGED', 'DISMISSED'] }
            });

            report.conflicts = {
                total: totalConflicts,
                unresolved: unresolvedConflicts,
                resolved: resolvedConflicts
            };
            report.summary.unresolvedConflicts = unresolvedConflicts;

            if (unresolvedConflicts > 0) {
                report.summary.issues.push({
                    severity: 'WARNING',
                    category: 'CONFLICTS',
                    message: `${unresolvedConflicts} unresolved sync conflicts require admin attention`
                });
            }
        } catch (err) {
            report.summary.issues.push({
                severity: 'ERROR',
                category: 'CONFLICTS',
                message: `Failed to query conflicts: ${err.message}`
            });
        }

        // 6. Check for duplicate processed events (idempotency integrity)
        try {
            const processedDupes = await LocalSyncProcessedEvent.aggregate([
                { $match: { hospitalId: mongoose.Types.ObjectId.isValid(hospitalId) ? new mongoose.Types.ObjectId(hospitalId) : hospitalId } },
                { $group: { _id: '$eventId', count: { $sum: 1 } } },
                { $match: { count: { $gt: 1 } } },
                { $limit: 5 }
            ]);

            if (processedDupes.length > 0) {
                report.summary.issues.push({
                    severity: 'WARNING',
                    category: 'IDEMPOTENCY',
                    message: `${processedDupes.length} duplicate processed event IDs detected in idempotency log`
                });
            }
        } catch (err) {
            // Non-critical — aggregate may fail on older mongo versions
        }

        // 7. Determine overall status
        const hasErrors = report.summary.issues.some(i => i.severity === 'ERROR');
        const hasCritical = report.summary.issues.some(i => i.severity === 'CRITICAL');
        const hasWarnings = report.summary.issues.some(i => i.severity === 'WARNING');

        if (hasCritical) {
            report.status = 'CRITICAL';
        } else if (hasErrors) {
            report.status = 'ERRORS';
        } else if (hasWarnings) {
            report.status = 'WARNINGS';
        } else {
            report.status = 'HEALTHY';
        }

        report.durationMs = Date.now() - startTime;
        return report;
    }

    /**
     * Get a compact sync health summary for the UI dashboard.
     */
    async getSyncHealth(hospitalId) {
        const installation = await LocalInstallation.findOne({ hospitalId }).lean();
        const now = Date.now();

        let agentStatus = 'OFFLINE';
        let cloudStatus = 'DISCONNECTED';
        let dbStatus = 'UNKNOWN';
        let syncStatus = 'UNKNOWN';

        if (installation) {
            const lastHbTime = installation.lastHeartbeat ? new Date(installation.lastHeartbeat).getTime() : 0;
            const isHeartbeatFresh = (now - lastHbTime) < 45000;

            if (!installation.agentTokenHash) {
                agentStatus = 'NOT_CONFIGURED';
            } else if (isHeartbeatFresh) {
                agentStatus = installation.status || 'ONLINE';
                cloudStatus = installation.cloudConnection || 'CONNECTED';
                dbStatus = installation.dbStatus || 'HEALTHY';
            } else {
                agentStatus = 'OFFLINE';
                cloudStatus = 'DISCONNECTED';
                dbStatus = 'UNKNOWN';
            }
        } else {
            agentStatus = 'NOT_CONFIGURED';
        }

        // Compute sync health
        const pendingCloud2Local = installation?.syncStatus?.pendingEventsCount || 0;
        const failedCloud2Local = installation?.syncStatus?.failedEventsCount || 0;
        const pendingLocal2Cloud = installation?.syncStatus?.uploadStatus?.pendingUploadsCount || 0;
        const failedLocal2Cloud = installation?.syncStatus?.uploadStatus?.failedUploadsCount || 0;
        const conflicts = installation?.syncStatus?.uploadStatus?.conflictsCount || 0;

        const totalPending = pendingCloud2Local + pendingLocal2Cloud;
        const totalFailed = failedCloud2Local + failedLocal2Cloud;

        let pendingConflicts = 0;
        try {
            pendingConflicts = await SyncConflict.countDocuments({
                hospitalId,
                status: { $in: ['PENDING', 'PENDING_REVIEW'] }
            });
        } catch (e) {}

        // Determine sync status
        if (agentStatus === 'NOT_CONFIGURED') {
            syncStatus = 'NOT_CONFIGURED';
        } else if (agentStatus === 'OFFLINE') {
            syncStatus = 'OFFLINE';
        } else if (totalFailed > 0 || dbStatus === 'DOWN') {
            syncStatus = 'ERROR';
        } else if (totalPending > 50 || pendingConflicts > 0) {
            syncStatus = 'WARNING';
        } else {
            syncStatus = 'HEALTHY';
        }

        // Last successful sync
        const lastSyncAt = installation?.syncStatus?.lastSyncAt || null;
        const lastUploadAt = installation?.syncStatus?.uploadStatus?.lastSuccessfulSyncAt ||
            installation?.syncStatus?.uploadStatus?.lastUploadAt || null;
        const lastSuccessfulSync = lastSyncAt && lastUploadAt
            ? new Date(Math.max(new Date(lastSyncAt).getTime(), new Date(lastUploadAt).getTime()))
            : (lastSyncAt || lastUploadAt || null);
        const lastSyncError = installation?.syncStatus?.lastSyncError || null;

        return {
            cloud: {
                status: cloudStatus,
                label: cloudStatus === 'CONNECTED' ? 'Connected' : 'Disconnected'
            },
            agent: {
                status: agentStatus,
                label: agentStatus === 'ONLINE' ? 'Connected' :
                    agentStatus === 'DEGRADED' ? 'Degraded' :
                        agentStatus === 'NOT_CONFIGURED' ? 'Not Configured' : 'Offline',
                version: installation?.agentVersion || null,
                lastHeartbeat: installation?.lastHeartbeat || null
            },
            database: {
                status: dbStatus,
                label: dbStatus === 'HEALTHY' ? 'Healthy' :
                    dbStatus === 'DOWN' ? 'Down' : 'Unknown',
                latencyMs: installation?.localHealth?.dbLatencyMs || null
            },
            sync: {
                status: syncStatus,
                label: syncStatus === 'HEALTHY' ? 'Healthy' :
                    syncStatus === 'WARNING' ? 'Warning' :
                        syncStatus === 'ERROR' ? 'Error' :
                            syncStatus === 'OFFLINE' ? 'Offline' : 'Not Configured'
            },
            metrics: {
                pending: totalPending,
                failed: totalFailed,
                conflicts: pendingConflicts,
                lastSuccessfulSync,
                lastSyncError,
                initialSyncStatus: installation?.syncStatus?.initialSync?.status || 'NOT_STARTED',
                totalRecordsSynced: installation?.syncStatus?.totalRecordsSynced || 0,
                completedUploads: installation?.syncStatus?.uploadStatus?.completedUploadsCount || 0
            }
        };
    }
}

module.exports = new DataIntegrityService();
