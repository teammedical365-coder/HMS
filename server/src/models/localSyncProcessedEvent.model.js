const mongoose = require('mongoose');

/**
 * LocalSyncProcessedEvent Model — Tracks eventIds processed from Local -> Cloud (Phase 3).
 * Ensures 100% idempotency: if the same event is received again due to network retry,
 * the Cloud returns the cached result without duplicate execution.
 */
const localSyncProcessedEventSchema = new mongoose.Schema({
    eventId: {
        type: String,
        required: true,
        unique: true,
        trim: true,
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
        index: true
    },
    entityId: {
        type: String,
        required: true,
        index: true
    },
    operation: {
        type: String,
        required: true,
        enum: ['CREATE', 'UPDATE', 'DELETE']
    },
    status: {
        type: String,
        required: true,
        enum: ['SUCCESS', 'CONFLICT', 'FAILED']
    },
    cloudVersion: {
        type: Number,
        default: () => Date.now()
    },
    message: {
        type: String,
        default: ''
    },
    processedAt: {
        type: Date,
        default: Date.now,
        index: true
    }
}, { timestamps: true });

localSyncProcessedEventSchema.index({ hospitalId: 1, eventId: 1 });
localSyncProcessedEventSchema.index({ hospitalId: 1, entityType: 1, entityId: 1 });

module.exports = mongoose.model('LocalSyncProcessedEvent', localSyncProcessedEventSchema);
