const mongoose = require('mongoose');

/**
 * ClinicPatient — proper patient record for simple clinics.
 * Separate from the User/staff model. Each patient is unique within a clinic.
 * patientUid is scoped per clinic: e.g. "RAM-001", "RAM-002"
 */
const clinicPatientSchema = new mongoose.Schema({
    clinicId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Hospital',
        required: true,
        index: true,
    },
    patientUid: {
        type: String,
        required: true,
        trim: true,
        // e.g. "RAM-001" — unique within clinic (compound index below)
    },

    // Core identity
    name:   { type: String, required: true, trim: true },
    phone:  { type: String, required: true, trim: true },
    email:  { type: String, trim: true, default: '' },
    gender: { type: String, enum: ['Male', 'Female', 'Other'], default: 'Male' },
    dob:    { type: Date, default: null },

    // Medical profile
    bloodGroup:        { type: String, default: '' },
    address:           { type: String, default: '' },
    allergies:         { type: String, default: '' },
    chronicConditions: { type: String, default: '' },
    medicalNotes:      { type: String, default: '' },

    // Emergency / known contacts
    relatives: [{
        name:     { type: String, trim: true, default: '' },
        relation: { type: String, trim: true, default: '' },
        phone:    { type: String, trim: true, default: '' },
    }],

    // Uploaded medical reports (PDFs / images)
    reports: [{
        name:       { type: String, required: true, trim: true },
        filename:   { type: String, required: true },   // server-side filename
        mimetype:   { type: String, default: 'application/pdf' },
        uploadedAt: { type: Date, default: Date.now },
    }],

    isActive: { type: Boolean, default: true },
}, { timestamps: true });

// patientUid unique per clinic
clinicPatientSchema.index({ clinicId: 1, patientUid: 1 }, { unique: true });
// phone unique per clinic
clinicPatientSchema.index({ clinicId: 1, phone: 1 }, { unique: true });

module.exports = mongoose.model('ClinicPatient', clinicPatientSchema);
