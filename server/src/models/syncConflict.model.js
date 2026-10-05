const mongoose = require('mongoose');

/**
 * SyncConflict Model — Stores Local -> Cloud sync version conflicts (Phase 3).
 * Created when a local update occurs against an older version than the cloud's current version.
 * Prevents silent overwriting of cloud data and allows hospital admins to review discrepancies.
 */
const syncConflictSchema = new mongoose.Schema({
    conflictId: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        index: true
    },
    eventId: {
        type: String,
        index: true
    },
    hospitalId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Hospital',
        required: true,
        index: true
    },
    installationId: {
        type: String,
        required: true,
        index: true
    },
    entityType: {
        type: String,
        required: true,
        enum: ['Patient', 'Doctor', 'Department', 'Service', 'Bed', 'Medicine', 'Hospital'],
        index: true
    },
    entityId: {
        type: String,
        required: true,
        index: true
    },
    baseVersion: {
        type: Number,
        default: 0
    },
    localVersion: {
        type: Number,
        required: true
    },
    cloudVersion: {
        type: Number,
        required: true
    },
    finalCloudVersion: {
        type: Number,
        default: null
    },
    localPayload: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    cloudPayload: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    detectedAt: {
        type: Date,
        default: Date.now,
        index: true
    },
    status: {
        type: String,
        enum: ['PENDING', 'PENDING_REVIEW', 'RESOLVED', 'DISMISSED', 'RESOLVED_LOCAL', 'RESOLVED_CLOUD', 'RESOLVED_MERGED'],
        default: 'PENDING',
        index: true
    },
    resolutionType: {
        type: String,
        enum: ['KEEP_LOCAL', 'KEEP_CLOUD', 'MERGED', null],
        default: null,
        index: true
    },
    selectedMergeFields: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    resolutionNotes: {
        type: String,
        default: ''
    },
    resolvedAt: {
        type: Date,
        default: null
    },
    resolvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    }
}, { timestamps: true });

syncConflictSchema.index({ hospitalId: 1, status: 1 });
syncConflictSchema.index({ hospitalId: 1, entityType: 1, entityId: 1 });

module.exports = mongoose.model('SyncConflict', syncConflictSchema);
