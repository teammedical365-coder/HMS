const mongoose = require('mongoose');

/**
 * SyncedRecord — read-only copies of prescriptions and bills pushed from local servers.
 * Stored on CLOUD. Used exclusively by the patient mobile app.
 * No raw PII beyond what's needed to display the record to the patient.
 */
const syncedRecordSchema = new mongoose.Schema({
    clinicId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', required: true, index: true },
    localId:      { type: String, required: true },      // _id on the local server
    type:         { type: String, enum: ['prescription', 'bill'], required: true },

    // Used to link to patient without storing patient _id (phone is the identity in patient app)
    patientPhone: { type: String, required: true, index: true },
    patientUid:   { type: String, default: '' },

    // Record content — fields vary by type
    data: { type: mongoose.Schema.Types.Mixed, default: {} },

    syncedAt: { type: Date, default: Date.now },
}, { timestamps: true });

// Patient queries their records by phone + clinic
syncedRecordSchema.index({ clinicId: 1, patientPhone: 1, type: 1, syncedAt: -1 });
// Upsert key — one record per local document
syncedRecordSchema.index({ clinicId: 1, localId: 1, type: 1 }, { unique: true });

module.exports = mongoose.model('SyncedRecord', syncedRecordSchema);
