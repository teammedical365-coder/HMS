'use strict';
const mongoose = require('mongoose');

// ABDM-issued link token per patient (needed for HIP-initiated care-context linking).
const schema = new mongoose.Schema({
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', required: true },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    abhaAddress: { type: String, default: null },
    requestId: { type: String, default: null, index: true }, // REQUEST-ID of our generate-token call
    token: { type: String, default: null },                  // treat as a secret; never log
    status: { type: String, enum: ['PENDING', 'READY', 'FAILED'], default: 'PENDING' },
    error: { type: String, default: null },
}, { timestamps: true });

schema.index({ hospitalId: 1, patientId: 1 }, { unique: true });

module.exports = mongoose.models.AbdmLinkToken || mongoose.model('AbdmLinkToken', schema);
