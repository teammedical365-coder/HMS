'use strict';
const mongoose = require('mongoose');

const schema = new mongoose.Schema({
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', required: true, index: true },
    consentId: { type: String, required: true },
    status: { type: String, default: 'UNKNOWN', index: true }, // GRANTED | REVOKED | EXPIRED | DENIED
    patientAbhaAddress: { type: String, default: null },
    detail: { type: mongoose.Schema.Types.Mixed, default: {} }, // artefact: purpose, hiTypes, dateRange, expiry, requester
    lastNotifiedAt: { type: Date, default: Date.now },
}, { timestamps: true });

schema.index({ hospitalId: 1, consentId: 1 }, { unique: true });

module.exports = mongoose.models.AbdmConsent || mongoose.model('AbdmConsent', schema);
