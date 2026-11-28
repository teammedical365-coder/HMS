'use strict';
const mongoose = require('mongoose');

// Short-lived server-side record of WHO started an ABDM transaction, preventing
// replay across patients/users, concurrent OTP brute-force, and resend abuse.
const schema = new mongoose.Schema({
    txnId:               { type: String, required: true },
    flow:                { type: String, enum: ['ENROL', 'LOGIN', 'LINK'], required: true },
    hospitalId:          { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', required: true },
    patientId:           { type: mongoose.Schema.Types.ObjectId, refPath: 'patientModel', required: true },
    patientModel:        { type: String, enum: ['User', 'ClinicPatient'], default: 'User' },
    userId:              { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    otpHash:             { type: String, default: null }, // LINK flow only
    status:              { type: String, enum: ['ACTIVE', 'PROCESSING', 'VERIFIED', 'LOCKED', 'EXPIRED'], default: 'ACTIVE' },
    attempts:            { type: Number, default: 0 },
    maxAttempts:         { type: Number, default: 5 },
    lockedUntil:         { type: Date, default: null },
    expiresAt:           { type: Date, default: () => new Date(Date.now() + 10 * 60 * 1000) },
    lastOtpSentAt:       { type: Date, default: Date.now },
    verifiedAt:          { type: Date, default: null },
    processingStartedAt: { type: Date, default: null },
    meta:                { type: mongoose.Schema.Types.Mixed, default: {} },
    createdAt:           { type: Date, default: Date.now, expires: 15 * 60 }, // auto-delete after 15 min
});

schema.index({ txnId: 1, flow: 1 }, { unique: true });
schema.index({ hospitalId: 1, patientId: 1, flow: 1, lastOtpSentAt: -1 });

module.exports = mongoose.models.AbdmTxn || mongoose.model('AbdmTxn', schema);
