const mongoose = require('mongoose');

/**
 * VoiceScribe — AI-generated clinical notes from doctor-patient voice consultations.
 * 
 * Lifecycle: DRAFT → REVIEWED → APPROVED | DISCARDED
 * Only APPROVED records are merged into the patient's clinical record.
 * Raw audio is NOT stored — only the transcript and structured analysis.
 */

const speakerSegmentSchema = new mongoose.Schema({
    speaker: { type: String, default: 'Speaker' }, // 'Doctor', 'Patient', 'Speaker 1', etc.
    text: { type: String, default: '' },
    timestamp: { type: String, default: '' }, // e.g. '00:32'
}, { _id: false });

const clinicalSummarySchema = new mongoose.Schema({
    chiefComplaint: [{ type: String }],
    historyOfPresentIllness: { type: String, default: '' },
    symptoms: [{ type: String }],
    duration: [{ type: String }],
    associatedSymptoms: [{ type: String }],
    relevantHistory: [{ type: String }],
    medicationsMentioned: [{ type: String }],
    allergiesMentioned: [{ type: String }],
    examinationFindings: [{ type: String }],
    vitalsMentioned: [{ type: String }],
    investigationsMentioned: [{ type: String }],
    previousDiagnosis: [{ type: String }],
    assessment: [{ type: String }],
    plan: [{ type: String }],
    followUp: { type: String, default: '' },
    importantPoints: [{ type: String }],
}, { _id: false });

const soapSchema = new mongoose.Schema({
    subjective: { type: String, default: '' },
    objective: { type: String, default: '' },
    assessment: { type: String, default: '' },
    plan: { type: String, default: '' },
}, { _id: false });

const voiceScribeSchema = new mongoose.Schema({
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', required: true, index: true },
    patientId: { type: mongoose.Schema.Types.Mixed, required: true }, // User or ClinicPatient ID
    doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    appointmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment', required: true },

    // Transcript
    transcript: { type: String, default: '' },
    speakerSegments: [speakerSegmentSchema],
    detectedLanguages: [{ type: String }],
    outputLanguage: { type: String, default: 'English' },

    // Recording metadata
    durationSeconds: { type: Number, default: 0 },
    recordingStartedAt: { type: Date },
    recordingEndedAt: { type: Date },

    // AI-generated structured data (editable by doctor before approval)
    clinicalSummary: { type: clinicalSummarySchema, default: () => ({}) },
    soap: { type: soapSchema, default: () => ({}) },

    // Consent
    consentRecordedAt: { type: Date },
    consentText: { type: String, default: 'AI-assisted recording and transcription is enabled for this consultation.' },

    // Lifecycle
    status: {
        type: String,
        enum: ['DRAFT', 'REVIEWED', 'APPROVED', 'DISCARDED'],
        default: 'DRAFT',
        index: true
    },

    // Approval tracking
    approvedAt: { type: Date },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    discardedAt: { type: Date },

    // What was merged into the appointment on approval
    mergedData: {
        diagnosis: { type: String, default: '' },
        notes: { type: String, default: '' },
    },

}, { timestamps: true });

// Compound indexes for efficient queries
voiceScribeSchema.index({ hospitalId: 1, appointmentId: 1 });
voiceScribeSchema.index({ hospitalId: 1, patientId: 1, createdAt: -1 });
voiceScribeSchema.index({ hospitalId: 1, doctorId: 1, createdAt: -1 });

module.exports = mongoose.model('VoiceScribe', voiceScribeSchema);
