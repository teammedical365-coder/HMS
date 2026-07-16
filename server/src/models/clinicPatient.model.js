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
    name:   { type: String, required: true, trim: true, minlength: 2 },
    phone:  { type: String, required: true, trim: true, match: /^\d{10}$/ },
    email:  { type: String, required: true, trim: true, match: /^\S+@\S+\.\S+$/ },
    age:    { type: Number, required: true, min: 1 },
    aadhaarNumber: { type: String, required: true, match: /^\d{12}$/ },
    gender: { type: String, enum: ['Male', 'Female', 'Other'], default: 'Male' },
    dob:    { type: Date, default: null },

    // Medical profile
    bloodGroup:        { type: String, default: '' },
    address:           { type: String, default: '' },
    allergies:         { type: String, default: '' },
    chronicConditions: { type: String, default: '' },
    medicalNotes:      { type: String, default: '' },

    vitals: {
        weight:          { type: String, default: '' },
        height:          { type: String, default: '' },
        bmi:             { type: String, default: '' },
        bloodPressure:   { type: String, default: '' },
        pulse:           { type: String, default: '' },
        temperature:     { type: String, default: '' },
        spo2:            { type: String, default: '' },
        respiratoryRate: { type: String, default: '' },
        lastRecorded:    { type: Date, default: null }
    },

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
