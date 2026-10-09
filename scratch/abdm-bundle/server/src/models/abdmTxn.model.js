'use strict';
const mongoose = require('mongoose');

// Short-lived server-side record of WHO started an ABDM transaction, so a client
// can never replay a txnId against a different patient or user.
const schema = new mongoose.Schema({
    txnId: { type: String, required: true },
    flow: { type: String, enum: ['ENROL', 'LOGIN', 'LINK'], required: true },
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', required: true },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    otpHash: { type: String, default: null },       // LINK flow only
    attempts: { type: Number, default: 0 },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
    createdAt: { type: Date, default: Date.now, expires: 15 * 60 }, // auto-delete after 15 min
});
schema.index({ txnId: 1, flow: 1 }, { unique: true });

module.exports = mongoose.models.AbdmTxn || mongoose.model('AbdmTxn', schema);
