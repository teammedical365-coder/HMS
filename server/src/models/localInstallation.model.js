const mongoose = require('mongoose');

/**
 * LocalInstallation Model — tracks the hospital's registered Local Agent installation.
 * Stored on the CLOUD database.
 * Strictly bound to one hospitalId for multi-tenant isolation.
 */
const localInstallationSchema = new mongoose.Schema({
    hospitalId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Hospital',
        required: true,
        index: true
    },
    installationId: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        index: true
    },
    name: {
        type: String,
        default: 'Hospital Local Server',
        trim: true
    },
    agentVersion: {
        type: String,
        default: '1.0.0'
    },
    // High-level overall status
    status: {
        type: String,
        enum: ['NOT_CONFIGURED', 'ONLINE', 'OFFLINE', 'DEGRADED'],
        default: 'NOT_CONFIGURED',
        index: true
    },
    // Hospital Local MongoDB health
    dbStatus: {
        type: String,
        enum: ['HEALTHY', 'DOWN', 'UNKNOWN'],
        default: 'UNKNOWN'
    },
    // Outbound Cloud connection health
    cloudConnection: {
        type: String,
        enum: ['CONNECTED', 'DISCONNECTED'],
        default: 'DISCONNECTED'
    },
    // One-time pairing token for initial handshake
    pairingToken: {
        type: String,
        default: null
    },
    pairingTokenExpiresAt: {
        type: Date,
        default: null
    },
    // Hashed permanent agent token for continuous authenticated heartbeats
    agentTokenHash: {
        type: String,
        default: null
    },
    lastHeartbeat: {
        type: Date,
        default: null
    },
    lastIp: {
        type: String,
        default: ''
    },
    // Diagnostics & metrics reported from the Local Agent
    localHealth: {
        dbLatencyMs: { type: Number, default: 0 },
        memoryMb: { type: Number, default: 0 },
        uptimeSeconds: { type: Number, default: 0 },
        nodeVersion: { type: String, default: '' },
        platform: { type: String, default: '' },
        localDbName: { type: String, default: 'medical365_local' }
    },
    // Operational audit logs (capped to last 50 events)
    operationalLogs: [{
        timestamp: { type: Date, default: Date.now },
        level: { type: String, enum: ['INFO', 'WARN', 'ERROR'], default: 'INFO' },
        event: { type: String, required: true },
        message: { type: String, required: true }
    }],
    // Phase 2: Cloud -> Local Data Synchronization Tracking
    syncStatus: {
        initialSync: {
            status: {
                type: String,
                enum: ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'FAILED'],
                default: 'NOT_STARTED'
            },
            startedAt: { type: Date, default: null },
            completedAt: { type: Date, default: null },
            progress: {
                Hospital: { total: { type: Number, default: 0 }, synced: { type: Number, default: 0 } },
                Department: { total: { type: Number, default: 0 }, synced: { type: Number, default: 0 } },
                Doctor: { total: { type: Number, default: 0 }, synced: { type: Number, default: 0 } },
                Service: { total: { type: Number, default: 0 }, synced: { type: Number, default: 0 } },
                Bed: { total: { type: Number, default: 0 }, synced: { type: Number, default: 0 } },
                Medicine: { total: { type: Number, default: 0 }, synced: { type: Number, default: 0 } },
                Patient: { total: { type: Number, default: 0 }, synced: { type: Number, default: 0 } },
                overall: { total: { type: Number, default: 0 }, synced: { type: Number, default: 0 }, percent: { type: Number, default: 0 } }
            }
        },
        lastSyncAt: { type: Date, default: null },
        lastProcessedEventId: { type: String, default: null },
        lastProcessedVersion: { type: Number, default: 0 },
        pendingEventsCount: { type: Number, default: 0 },
        failedEventsCount: { type: Number, default: 0 },
        totalRecordsSynced: { type: Number, default: 0 },
        lastSyncError: { type: String, default: null },
        // Phase 3 & 4: Local -> Cloud Upload Tracking & Reliability
        uploadStatus: {
            pendingUploadsCount: { type: Number, default: 0 },
            syncingUploadsCount: { type: Number, default: 0 },
            completedUploadsCount: { type: Number, default: 0 },
            completedTodayCount: { type: Number, default: 0 },
            failedUploadsCount: { type: Number, default: 0 },
            conflictsCount: { type: Number, default: 0 },
            lastUploadAt: { type: Date, default: null },
            lastSuccessfulSyncAt: { type: Date, default: null }
        },
        recentActivities: [{
            timestamp: { type: Date, default: Date.now },
            entityType: { type: String },
            operation: { type: String },
            status: { type: String, enum: ['SUCCESS', 'CONFLICT', 'RETRYING', 'FAILED'] },
            details: { type: String }
        }]
    },
    metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    }
}, { timestamps: true });

// Index for quick status checks by hospital
localInstallationSchema.index({ hospitalId: 1, status: 1 });

module.exports = mongoose.model('LocalInstallation', localInstallationSchema);
