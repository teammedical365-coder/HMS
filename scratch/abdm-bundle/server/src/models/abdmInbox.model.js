'use strict';
const mongoose = require('mongoose');

// Every ABDM callback is stored here FIRST, then acknowledged, then processed.
// Lives in the MASTER DB because callbacks arrive with no tenant context.
const schema = new mongoose.Schema({
    requestId: { type: String, required: true },          // REQUEST-ID header
    path: { type: String, required: true },
    hipId: { type: String, default: null, index: true },
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', default: null },
    payload: { type: mongoose.Schema.Types.Mixed, default: {} },
    status: {
        type: String,
        enum: ['RECEIVED', 'PROCESSING', 'PROCESSED', 'FAILED', 'UNHANDLED'],
        default: 'RECEIVED',
        index: true,
    },
    attempts: { type: Number, default: 0 },
    lockedAt: Date,
    lastAttemptAt: Date,
    processedAt: Date,
    error: String,
    meta: { type: mongoose.Schema.Types.Mixed, default: {} }, // e.g. discovery match status (no PII)
    // Payloads contain patient identifiers: keep 30 days, then auto-delete.
    receivedAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 30 },
}, { timestamps: true });

schema.index({ requestId: 1, path: 1 }, { unique: true });
schema.index({ status: 1, receivedAt: 1 });

module.exports = mongoose.models.AbdmInbox || mongoose.model('AbdmInbox', schema);
