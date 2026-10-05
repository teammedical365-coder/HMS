const syncEventService = require('../services/localAgent/syncEvent.service');
const initialSyncService = require('../services/localAgent/initialSync.service');
const cloudSyncReceiverService = require('../services/localAgent/cloudSyncReceiver.service');
const LocalInstallation = require('../models/localInstallation.model');

class LocalSyncController {
    // ── Hospital Admin Operations ─────────────────────────────────────────────

    /**
     * Hospital Admin: Get aggregate sync status & metrics
     * GET /api/local-sync/status
     */
    async getSyncStatus(req, res) {
        try {
            const hospitalId = req.hospitalId || req.user?.hospitalId;
            if (!hospitalId) {
                return res.status(400).json({ success: false, message: 'Hospital context required.' });
            }

            const status = await syncEventService.getSyncStatus(hospitalId);
            return res.json({ success: true, ...status });
        } catch (err) {
            console.error('[LocalSyncController.getSyncStatus] Error:', err.message);
            return res.status(500).json({ success: false, message: err.message });
        }
    }

    /**
     * Hospital Admin: Start Initial Sync
     * POST /api/local-sync/start-initial-sync
     */
    async startInitialSync(req, res) {
        try {
            const hospitalId = req.hospitalId || req.user?.hospitalId;
            if (!hospitalId) {
                return res.status(400).json({ success: false, message: 'Hospital context required.' });
            }

            const inst = await LocalInstallation.findOne({ hospitalId });
            if (!inst || inst.status === 'NOT_CONFIGURED') {
                return res.status(400).json({
                    success: false,
                    message: 'Cannot start initial sync: Local Agent is not paired or configured.'
                });
            }

            const result = await initialSyncService.startInitialSync(hospitalId, inst.installationId);

            // Notify Local Agent via Socket.io to kick off initial sync stream
            const io = req.app?.get('io');
            if (io) {
                io.to(`hospital_${hospitalId}`).emit('sync:initial_sync_requested', {
                    installationId: inst.installationId,
                    entityOrder: result.entityOrder,
                    timestamp: Date.now()
                });
            }

            return res.json({
                success: true,
                message: 'Initial sync started. Data is being prepared for local streaming.',
                ...result
            });
        } catch (err) {
            console.error('[LocalSyncController.startInitialSync] Error:', err.message);
            return res.status(500).json({ success: false, message: err.message });
        }
    }

    /**
     * Hospital Admin: Trigger immediate sync
     * POST /api/local-sync/sync-now
     */
    async syncNow(req, res) {
        try {
            const hospitalId = req.hospitalId || req.user?.hospitalId;
            if (!hospitalId) {
                return res.status(400).json({ success: false, message: 'Hospital context required.' });
            }

            const io = req.app?.get('io');
            if (io) {
                io.to(`hospital_${hospitalId}`).emit('sync:trigger_now', {
                    hospitalId,
                    timestamp: Date.now()
                });
            }

            return res.json({
                success: true,
                message: 'Immediate sync signal broadcast to Local Agent.'
            });
        } catch (err) {
            console.error('[LocalSyncController.syncNow] Error:', err.message);
            return res.status(500).json({ success: false, message: err.message });
        }
    }

    /**
     * Hospital Admin: Retry failed events
     * POST /api/local-sync/retry-failed
     */
    async retryFailed(req, res) {
        try {
            const hospitalId = req.hospitalId || req.user?.hospitalId;
            if (!hospitalId) {
                return res.status(400).json({ success: false, message: 'Hospital context required.' });
            }

            const inst = await LocalInstallation.findOne({ hospitalId });
            if (!inst) {
                return res.status(400).json({ success: false, message: 'Installation not found.' });
            }

            const result = await syncEventService.retryFailedEvents(hospitalId, inst.installationId);

            // Also reset failed uploads counter on Cloud installation
            if (inst.syncStatus?.uploadStatus) {
                inst.syncStatus.uploadStatus.failedUploadsCount = 0;
                await inst.save();
            }

            const io = req.app?.get('io');
            if (io) {
                io.to(`hospital_${hospitalId}`).emit('sync:retry_failed', { hospitalId, timestamp: Date.now() });
                io.to(`hospital_${hospitalId}`).emit('sync:trigger_now', { hospitalId, timestamp: Date.now() });
            }

            return res.json({
                success: true,
                message: `Reset failed events to PENDING for retry.`,
                ...result
            });
        } catch (err) {
            console.error('[LocalSyncController.retryFailed] Error:', err.message);
            return res.status(500).json({ success: false, message: err.message });
        }
    }

    // ── Local Agent Machine Operations ────────────────────────────────────────

    /**
     * Local Agent: Fetch initial sync batch
     * GET /api/local-sync/initial-sync/batch
     */
    async getInitialSyncBatch(req, res) {
        try {
            const { hospitalId, installationId } = req.agent;
            const { entityType, skip, limit } = req.query;

            if (!entityType) {
                return res.status(400).json({ success: false, message: 'entityType query param is required.' });
            }

            const batch = await initialSyncService.getInitialSyncBatch({
                hospitalId,
                installationId,
                entityType,
                skip,
                limit
            });

            return res.json({ success: true, ...batch });
        } catch (err) {
            console.error('[LocalSyncController.getInitialSyncBatch] Error:', err.message);
            return res.status(500).json({ success: false, message: err.message });
        }
    }

    /**
     * Local Agent: Report initial sync batch progress
     * POST /api/local-sync/initial-sync/progress
     */
    async reportInitialSyncProgress(req, res) {
        try {
            const { hospitalId, installationId } = req.agent;
            const { entityType, syncedCount, isCompleted, error } = req.body;

            const result = await initialSyncService.reportInitialSyncProgress({
                hospitalId,
                installationId,
                entityType,
                syncedCount,
                isCompleted,
                error
            });

            return res.json({ success: true, ...result });
        } catch (err) {
            console.error('[LocalSyncController.reportInitialSyncProgress] Error:', err.message);
            return res.status(500).json({ success: false, message: err.message });
        }
    }

    /**
     * Local Agent: Fetch pending incremental events since version checkpoint
     * GET /api/local-sync/events
     */
    async getPendingEvents(req, res) {
        try {
            const { hospitalId, installationId } = req.agent;
            const { afterVersion, limit } = req.query;

            const result = await syncEventService.getPendingEvents({
                hospitalId,
                installationId,
                afterVersion,
                limit
            });

            return res.json({ success: true, ...result });
        } catch (err) {
            console.error('[LocalSyncController.getPendingEvents] Error:', err.message);
            return res.status(500).json({ success: false, message: err.message });
        }
    }

    /**
     * Local Agent: Acknowledge processed sync events
     * POST /api/local-sync/ack
     */
    async acknowledgeEvents(req, res) {
        try {
            const { hospitalId, installationId } = req.agent;
            const { acks } = req.body;

            if (!Array.isArray(acks)) {
                return res.status(400).json({ success: false, message: 'acks array is required.' });
            }

            const result = await syncEventService.acknowledgeEvents({
                hospitalId,
                installationId,
                acks
            });

            return res.json({ success: true, ...result });
        } catch (err) {
            console.error('[LocalSyncController.acknowledgeEvents] Error:', err.message);
            return res.status(500).json({ success: false, message: err.message });
        }
    }

    // ── Phase 3: Local -> Cloud Synchronization Endpoints ─────────────────────

    /**
     * Local Agent: Push batch of mutations to Cloud
     * POST /api/local-sync/push
     */
    async pushLocalBatch(req, res) {
        try {
            const { hospitalId, installationId } = req.agent;
            const { events } = req.body;

            if (!Array.isArray(events)) {
                return res.status(400).json({ success: false, message: 'events array is required.' });
            }

            const result = await cloudSyncReceiverService.processIncomingBatch({
                hospitalId,
                installationId,
                events
            });

            return res.json(result);
        } catch (err) {
            console.error('[LocalSyncController.pushLocalBatch] Error:', err.message);
            return res.status(500).json({ success: false, message: err.message });
        }
    }

    /**
     * Hospital Admin: Get unresolved sync conflicts
     * GET /api/local-sync/conflicts
     */
    async getConflicts(req, res) {
        try {
            const hospitalId = req.hospitalId || req.user?.hospitalId;
            if (!hospitalId) {
                return res.status(400).json({ success: false, message: 'Hospital context required.' });
            }

            const { status, limit, skip } = req.query;
            const result = await cloudSyncReceiverService.getConflicts(hospitalId, { status, limit, skip });
            return res.json({ success: true, ...result });
        } catch (err) {
            console.error('[LocalSyncController.getConflicts] Error:', err.message);
            return res.status(500).json({ success: false, message: err.message });
        }
    }

    /**
     * Hospital Admin: Get conflict detail
     * GET /api/local-sync/conflicts/:conflictId
     */
    async getConflictDetail(req, res) {
        try {
            const hospitalId = req.hospitalId || req.user?.hospitalId;
            if (!hospitalId) {
                return res.status(400).json({ success: false, message: 'Hospital context required.' });
            }

            const conflict = await cloudSyncReceiverService.getConflictById(hospitalId, req.params.conflictId);
            return res.json({ success: true, conflict });
        } catch (err) {
            console.error('[LocalSyncController.getConflictDetail] Error:', err.message);
            return res.status(404).json({ success: false, message: err.message });
        }
    }

    /**
     * Hospital Admin: Get Phase 3 upload stats & recent activities
     * GET /api/local-sync/upload-stats
     */
    async getUploadStats(req, res) {
        try {
            const hospitalId = req.hospitalId || req.user?.hospitalId;
            if (!hospitalId) {
                return res.status(400).json({ success: false, message: 'Hospital context required.' });
            }

            const inst = await LocalInstallation.findOne({ hospitalId }).lean();
            const uploadStatus = inst?.syncStatus?.uploadStatus || {
                pendingUploadsCount: 0,
                completedUploadsCount: 0,
                failedUploadsCount: 0,
                conflictsCount: 0,
                lastUploadAt: null
            };
            const recentActivities = inst?.syncStatus?.recentActivities || [];

            return res.json({
                success: true,
                uploadStatus,
                recentActivities
            });
        } catch (err) {
            console.error('[LocalSyncController.getUploadStats] Error:', err.message);
            return res.status(500).json({ success: false, message: err.message });
        }
    }

    // ── Phase 6: Production Readiness Endpoints ───────────────────────────────

    /**
     * Hospital Admin: Verify data integrity
     * POST /api/local-sync/verify-integrity
     */
    async verifyIntegrity(req, res) {
        try {
            const hospitalId = req.hospitalId || req.user?.hospitalId;
            if (!hospitalId) {
                return res.status(400).json({ success: false, message: 'Hospital context required.' });
            }

            const dataIntegrityService = require('../services/localAgent/dataIntegrity.service');
            const report = await dataIntegrityService.verifyIntegrity(hospitalId);

            // Audit log
            try {
                const AuditLog = require('../models/auditLog.model');
                await AuditLog.create({
                    clinicId: hospitalId,
                    userId: req.user ? (req.user._id || req.user.id) : null,
                    userName: req.user ? (req.user.name || req.user.email || 'Hospital Admin') : 'Hospital Admin',
                    role: req.user ? (req.user.role || 'Hospital Admin') : 'Hospital Admin',
                    action: 'SYNC_INTEGRITY_CHECK',
                    targetModel: 'LocalInstallation',
                    targetLabel: `Integrity check: ${report.status}`,
                    reason: `${report.summary.issues.length} issues found`,
                    success: true
                });
            } catch (auditErr) {}

            return res.json({ success: true, report });
        } catch (err) {
            console.error('[LocalSyncController.verifyIntegrity] Error:', err.message);
            return res.status(500).json({ success: false, message: err.message });
        }
    }

    /**
     * Hospital Admin: Get sync health summary
     * GET /api/local-sync/health
     */
    async getSyncHealth(req, res) {
        try {
            const hospitalId = req.hospitalId || req.user?.hospitalId;
            if (!hospitalId) {
                return res.status(400).json({ success: false, message: 'Hospital context required.' });
            }

            const dataIntegrityService = require('../services/localAgent/dataIntegrity.service');
            const health = await dataIntegrityService.getSyncHealth(hospitalId);

            return res.json({ success: true, ...health });
        } catch (err) {
            console.error('[LocalSyncController.getSyncHealth] Error:', err.message);
            return res.status(500).json({ success: false, message: err.message });
        }
    }

    /**
     * Hospital Admin: Get rebuild eligibility status
     * GET /api/local-sync/rebuild-status
     */
    async getRebuildStatus(req, res) {
        try {
            const hospitalId = req.hospitalId || req.user?.hospitalId;
            if (!hospitalId) {
                return res.status(400).json({ success: false, message: 'Hospital context required.' });
            }

            const disasterRecoveryService = require('../services/localAgent/disasterRecovery.service');
            const status = await disasterRecoveryService.getRebuildStatus(hospitalId);

            return res.json({ success: true, ...status });
        } catch (err) {
            console.error('[LocalSyncController.getRebuildStatus] Error:', err.message);
            return res.status(500).json({ success: false, message: err.message });
        }
    }

    /**
     * Hospital Admin: Initiate local database rebuild
     * POST /api/local-sync/rebuild
     */
    async rebuildLocalDatabase(req, res) {
        try {
            const hospitalId = req.hospitalId || req.user?.hospitalId;
            if (!hospitalId) {
                return res.status(400).json({ success: false, message: 'Hospital context required.' });
            }

            const { confirmationToken } = req.body;
            if (!confirmationToken) {
                return res.status(400).json({
                    success: false,
                    message: 'confirmationToken is required. Send "CONFIRM_REBUILD_LOCAL_DATABASE" to proceed.'
                });
            }

            const disasterRecoveryService = require('../services/localAgent/disasterRecovery.service');
            const result = await disasterRecoveryService.initiateRebuild({
                hospitalId,
                user: req.user,
                confirmationToken
            });

            // Notify agent via Socket.io
            const io = req.app?.get('io');
            if (io) {
                io.to(`hospital_${hospitalId}`).emit('sync:rebuild_requested', {
                    hospitalId,
                    installationId: result.installationId,
                    timestamp: Date.now()
                });
            }

            return res.json(result);
        } catch (err) {
            console.error('[LocalSyncController.rebuildLocalDatabase] Error:', err.message);
            return res.status(400).json({ success: false, message: err.message });
        }
    }

    /**
     * Hospital Admin: Get backup & restore status
     * GET /api/local-sync/backup-status
     */
    async getBackupStatus(req, res) {
        try {
            const hospitalId = req.hospitalId || req.user?.hospitalId;
            if (!hospitalId) {
                return res.status(400).json({ success: false, message: 'Hospital context required.' });
            }

            const disasterRecoveryService = require('../services/localAgent/disasterRecovery.service');
            const status = await disasterRecoveryService.getBackupStatus(hospitalId);

            return res.json({ success: true, ...status });
        } catch (err) {
            console.error('[LocalSyncController.getBackupStatus] Error:', err.message);
            return res.status(500).json({ success: false, message: err.message });
        }
    }
}

module.exports = new LocalSyncController();

