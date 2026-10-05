const LocalInstallation = require('../../models/localInstallation.model');
const SyncEvent = require('../../models/syncEvent.model');
const SyncConflict = require('../../models/syncConflict.model');
const LocalSyncProcessedEvent = require('../../models/localSyncProcessedEvent.model');
const AuditLog = require('../../models/auditLog.model');
const initialSyncService = require('./initialSync.service');

/**
 * DisasterRecovery Service — Phase 6
 *
 * Provides safe administrative operations for:
 * 1. Rebuilding local database from Cloud data
 * 2. Resetting sync state for a fresh start
 * 3. Archive existing sync state before rebuild
 *
 * Safety rules:
 * - NEVER deletes Cloud data
 * - NEVER starts destructive operation without explicit confirmation token
 * - Audit logs all disaster recovery actions
 * - Cloud remains authoritative at all times
 */
class DisasterRecoveryService {
    /**
     * Get current rebuild eligibility status.
     * Returns information the admin needs to decide whether to trigger a rebuild.
     */
    async getRebuildStatus(hospitalId) {
        const installation = await LocalInstallation.findOne({ hospitalId }).lean();
        if (!installation) {
            return {
                eligible: false,
                reason: 'No local installation configured for this hospital',
                installation: null
            };
        }

        const pendingConflicts = await SyncConflict.countDocuments({
            hospitalId,
            status: { $in: ['PENDING', 'PENDING_REVIEW'] }
        });

        const pendingEvents = await SyncEvent.countDocuments({
            hospitalId,
            'installations.installationId': installation.installationId,
            'installations.status': 'PENDING'
        });

        return {
            eligible: true,
            installationId: installation.installationId,
            currentStatus: installation.status,
            initialSyncStatus: installation.syncStatus?.initialSync?.status || 'NOT_STARTED',
            lastSyncAt: installation.syncStatus?.lastSyncAt,
            totalRecordsSynced: installation.syncStatus?.totalRecordsSynced || 0,
            pendingEventsCount: pendingEvents,
            pendingConflictsCount: pendingConflicts,
            warnings: [
                pendingConflicts > 0 ? `${pendingConflicts} unresolved conflicts will be dismissed during rebuild` : null,
                pendingEvents > 0 ? `${pendingEvents} pending sync events will be reset` : null,
                'This will reset the local sync state and re-run initial sync from cloud',
                'Cloud data will NOT be modified or deleted',
                'This operation requires the Local Agent to be running'
            ].filter(Boolean)
        };
    }

    /**
     * Initiate a safe local database rebuild.
     *
     * Flow:
     * 1. Archive current sync state metadata
     * 2. Reset sync checkpoints & counters
     * 3. Dismiss all pending conflicts (non-destructive archive)
     * 4. Mark initial sync as NOT_STARTED so agent re-runs
     * 5. Trigger initial sync
     *
     * IMPORTANT: This NEVER deletes Cloud data.
     */
    async initiateRebuild({ hospitalId, user, confirmationToken }) {
        // Safety: require explicit confirmation token
        if (confirmationToken !== 'CONFIRM_REBUILD_LOCAL_DATABASE') {
            throw new Error('Rebuild requires explicit confirmation. Send confirmationToken: "CONFIRM_REBUILD_LOCAL_DATABASE"');
        }

        const installation = await LocalInstallation.findOne({ hospitalId });
        if (!installation) {
            throw new Error('No local installation configured for this hospital');
        }

        // 1. Archive current state
        const archiveSnapshot = {
            archivedAt: new Date(),
            previousSyncStatus: JSON.parse(JSON.stringify(installation.syncStatus || {})),
            previousStatus: installation.status,
            triggeredBy: user ? (user.name || user.email || 'Hospital Admin') : 'Hospital Admin'
        };

        // 2. Dismiss all pending conflicts (non-destructive)
        const dismissedConflicts = await SyncConflict.updateMany(
            {
                hospitalId,
                status: { $in: ['PENDING', 'PENDING_REVIEW', 'MANUAL_REVIEW_REQUIRED'] }
            },
            {
                $set: {
                    status: 'DISMISSED',
                    resolutionNotes: 'Auto-dismissed during local database rebuild',
                    resolvedAt: new Date(),
                    resolvedBy: user ? (user._id || user.id) : null
                }
            }
        );

        // 3. Reset sync state on installation
        installation.syncStatus = {
            initialSync: {
                status: 'NOT_STARTED',
                startedAt: null,
                completedAt: null,
                progress: {
                    Hospital: { total: 0, synced: 0 },
                    Department: { total: 0, synced: 0 },
                    Doctor: { total: 0, synced: 0 },
                    Service: { total: 0, synced: 0 },
                    Bed: { total: 0, synced: 0 },
                    Medicine: { total: 0, synced: 0 },
                    Patient: { total: 0, synced: 0 },
                    overall: { total: 0, synced: 0, percent: 0 }
                }
            },
            lastSyncAt: null,
            lastProcessedEventId: null,
            lastProcessedVersion: 0,
            pendingEventsCount: 0,
            failedEventsCount: 0,
            totalRecordsSynced: 0,
            lastSyncError: null,
            uploadStatus: {
                pendingUploadsCount: 0,
                syncingUploadsCount: 0,
                completedUploadsCount: 0,
                completedTodayCount: 0,
                failedUploadsCount: 0,
                conflictsCount: 0,
                lastUploadAt: null,
                lastSuccessfulSyncAt: null
            },
            recentActivities: []
        };

        // Store archive in metadata
        if (!installation.metadata) installation.metadata = {};
        if (!installation.metadata.rebuildHistory) installation.metadata.rebuildHistory = [];
        installation.metadata.rebuildHistory.unshift(archiveSnapshot);
        // Keep last 5 rebuild archives
        if (installation.metadata.rebuildHistory.length > 5) {
            installation.metadata.rebuildHistory = installation.metadata.rebuildHistory.slice(0, 5);
        }

        installation.operationalLogs.unshift({
            timestamp: new Date(),
            level: 'WARN',
            event: 'LOCAL_DATABASE_REBUILD',
            message: `Local database rebuild initiated by ${archiveSnapshot.triggeredBy}. Sync state reset. Cloud data preserved.`
        });

        if (installation.operationalLogs.length > 50) {
            installation.operationalLogs = installation.operationalLogs.slice(0, 50);
        }

        installation.markModified('syncStatus');
        installation.markModified('metadata');
        await installation.save();

        // 4. Reset all sync events for this installation to PENDING
        await SyncEvent.updateMany(
            {
                hospitalId,
                'installations.installationId': installation.installationId
            },
            {
                $set: {
                    'installations.$.status': 'PENDING',
                    'installations.$.acknowledgedAt': null,
                    'installations.$.errorMessage': null,
                    'installations.$.retryCount': 0
                }
            }
        );

        // 5. Audit trail
        try {
            await AuditLog.create({
                clinicId: hospitalId,
                userId: user ? (user._id || user.id) : null,
                userName: user ? (user.name || user.email || 'Hospital Admin') : 'Hospital Admin',
                role: user ? (user.role || 'Hospital Admin') : 'Hospital Admin',
                action: 'BACKUP_CREATED',
                targetModel: 'LocalInstallation',
                targetId: installation._id,
                targetLabel: `Local Database Rebuild — ${installation.installationId}`,
                reason: 'Local database rebuild initiated. Sync state archived and reset.',
                success: true
            });
        } catch (auditErr) {
            console.warn('[DisasterRecovery] AuditLog warning:', auditErr.message);
        }

        // 6. Start initial sync
        let initialSyncResult = null;
        try {
            initialSyncResult = await initialSyncService.startInitialSync(hospitalId, installation.installationId);
        } catch (syncErr) {
            console.warn('[DisasterRecovery] Could not auto-start initial sync:', syncErr.message);
        }

        return {
            success: true,
            message: 'Local database rebuild initiated. Cloud data is preserved. Initial sync will re-download all data.',
            installationId: installation.installationId,
            dismissedConflicts: dismissedConflicts.modifiedCount || 0,
            archiveSnapshot: {
                archivedAt: archiveSnapshot.archivedAt,
                previousTotalSynced: archiveSnapshot.previousSyncStatus?.totalRecordsSynced || 0
            },
            initialSyncStarted: Boolean(initialSyncResult)
        };
    }

    /**
     * Get the local backup status from docker-compose infrastructure.
     * Since backup is handled by the docker mongo container running mongodump nightly,
     * this returns status information from the installation metadata.
     */
    async getBackupStatus(hospitalId) {
        const installation = await LocalInstallation.findOne({ hospitalId }).lean();
        if (!installation) {
            return {
                configured: false,
                message: 'No local installation configured'
            };
        }

        const backupInfo = installation.metadata?.lastBackup || null;
        const rebuildHistory = installation.metadata?.rebuildHistory || [];

        return {
            configured: true,
            installationId: installation.installationId,
            backupStrategy: 'Docker mongodump (nightly at 2:00 AM, 7-day retention)',
            lastKnownBackup: backupInfo,
            rebuildHistory: rebuildHistory.slice(0, 5).map(r => ({
                archivedAt: r.archivedAt,
                triggeredBy: r.triggeredBy,
                previousTotalSynced: r.previousSyncStatus?.totalRecordsSynced || 0,
                previousInitialSyncStatus: r.previousSyncStatus?.initialSync?.status || 'UNKNOWN'
            })),
            restoreInstructions: [
                'Stop the local-agent and api containers',
                'Identify the backup folder in clinic-data/backups/ (format: YYYYMMDD_HHMM)',
                'Run: mongorestore --host mongo --db hms --drop /backups/<DATE>/hms/',
                'Restart the local-agent and api containers',
                'Navigate to Settings → Local Database → Rebuild Local Database',
                'Confirm rebuild to re-sync from cloud',
                'WARNING: Restore replaces local data. Cloud data is NOT affected.'
            ]
        };
    }

    /**
     * Record a backup event (called from local agent health endpoint or manually).
     */
    async recordBackupEvent(hospitalId, backupData = {}) {
        const installation = await LocalInstallation.findOne({ hospitalId });
        if (!installation) {
            throw new Error('Installation not found');
        }

        if (!installation.metadata) installation.metadata = {};
        installation.metadata.lastBackup = {
            timestamp: new Date(),
            path: backupData.path || 'clinic-data/backups/',
            sizeBytes: backupData.sizeBytes || null,
            status: backupData.status || 'COMPLETED',
            method: backupData.method || 'mongodump'
        };

        installation.operationalLogs.unshift({
            timestamp: new Date(),
            level: 'INFO',
            event: 'BACKUP_COMPLETED',
            message: `Local MongoDB backup completed at ${new Date().toISOString()}`
        });

        if (installation.operationalLogs.length > 50) {
            installation.operationalLogs = installation.operationalLogs.slice(0, 50);
        }

        installation.markModified('metadata');
        await installation.save();

        return { success: true, message: 'Backup event recorded' };
    }
}

module.exports = new DisasterRecoveryService();
