const mongoose = require('mongoose');

const vitalsSchema = new mongoose.Schema({
    height: { type: String, default: '' },      // cm
    weight: { type: String, default: '' },      // kg
    bmi: { type: String, default: '' },         // auto-calculated
    bp: { type: String, default: '' },          // e.g. 120/80 mmHg
    pulse: { type: String, default: '' },       // bpm
    temperature: { type: String, default: '' }, // °F or °C
    spo2: { type: String, default: '' },        // %
    rr: { type: String, default: '' },          // breaths/min
    bloodSugar: { type: String, default: '' },  // mg/dL
    painScore: { type: String, default: '' },   // 0-10
    recordedAt: { type: Date, default: Date.now },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { _id: false });

const clinicalHistorySchema = new mongoose.Schema({
    chiefComplaint: { type: String, default: '' },
    historyOfPresentIllness: { type: String, default: '' },
    pastMedicalHistory: { type: String, default: '' },
    pastSurgicalHistory: { type: String, default: '' },
    familyHistory: { type: String, default: '' },
    allergies: { type: String, default: '' },
    currentMedicines: { type: String, default: '' },
    lifestyle: { type: String, default: '' },
    assistantRemarks: { type: String, default: '' }
}, { _id: false });

const reportRefSchema = new mongoose.Schema({
    name: { type: String, required: true },
    url: { type: String, required: true },
    fileId: { type: String, default: '' },
    docType: { type: String, default: 'Medical Report' },
    uploadedAt: { type: Date, default: Date.now },
    uploadedBy: { type: String, default: 'Doctor Assistant' }
}, { _id: false });

const investigationSuggestionSchema = new mongoose.Schema({
    testName: { type: String, required: true },
    notes: { type: String, default: '' },
    urgency: { type: String, enum: ['Routine', 'Urgent', 'Stat'], default: 'Routine' },
    suggestedAt: { type: Date, default: Date.now }
}, { _id: false });

const consentRefSchema = new mongoose.Schema({
    consentId: { type: mongoose.Schema.Types.ObjectId, ref: 'ConsentTemplate', default: null },
    templateName: { type: String, default: '' },
    status: { type: String, enum: ['Pending', 'Signed', 'Declined', 'Not Applicable'], default: 'Pending' },
    signedDate: { type: Date, default: null }
}, { _id: false });

const checklistSchema = new mongoose.Schema({
    patientVerified: { type: Boolean, default: false },
    vitalsDone: { type: Boolean, default: false },
    complaintDone: { type: Boolean, default: false },
    historyDone: { type: Boolean, default: false },
    questionsDone: { type: Boolean, default: false },
    reportsDone: { type: Boolean, default: false },
    investigationsDone: { type: Boolean, default: false },
    consentDone: { type: Boolean, default: false },
    draftNotesDone: { type: Boolean, default: false }
}, { _id: false });

const doctorReviewSchema = new mongoose.Schema({
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    doctorNotes: { type: String, default: '' },
    acceptedVitals: { type: Boolean, default: false },
    status: { type: String, enum: ['Pending', 'Reviewed', 'Accepted', 'Modified'], default: 'Pending' }
}, { _id: false });

const doctorAssistantPreparationSchema = new mongoose.Schema({
    hospitalId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Hospital',
        required: true,
        index: true
    },
    assistantId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    doctorId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Doctor',
        required: true,
        index: true
    },
    doctorUserId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    department: {
        type: String,
        required: true,
        trim: true,
        index: true
    },
    patientId: {
        type: mongoose.Schema.Types.Mixed,
        ref: 'User',
        required: true,
        index: true
    },
    appointmentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Appointment',
        required: true,
        unique: true,
        index: true
    },
    status: {
        type: String,
        enum: ['waiting_for_assistant', 'preparation_in_progress', 'ready_for_doctor', 'in_review', 'completed'],
        default: 'waiting_for_assistant',
        index: true
    },
    vitals: {
        type: vitalsSchema,
        default: () => ({})
    },
    preparation: {
        type: clinicalHistorySchema,
        default: () => ({})
    },
    questionnaireAnswers: {
        type: mongoose.Schema.Types.Mixed,
        default: () => ({})
    },
    reportReferences: [reportRefSchema],
    investigationSuggestions: [investigationSuggestionSchema],
    consentReferences: [consentRefSchema],
    draftClinicalNotes: {
        type: String,
        default: ''
    },
    checklist: {
        type: checklistSchema,
        default: () => ({})
    },
    progressPercentage: {
        type: Number,
        default: 0,
        min: 0,
        max: 100
    },
    preparedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    preparedAt: {
        type: Date,
        default: null
    },
    readyAt: {
        type: Date,
        default: null
    },
    doctorReview: {
        type: doctorReviewSchema,
        default: () => ({})
    }
}, {
    timestamps: true
});

// Indexes for fast querying per hospital, assistant, doctor, and date
doctorAssistantPreparationSchema.index({ hospitalId: 1, status: 1, createdAt: -1 });
doctorAssistantPreparationSchema.index({ hospitalId: 1, doctorId: 1, status: 1 });
doctorAssistantPreparationSchema.index({ hospitalId: 1, assistantId: 1, createdAt: -1 });
doctorAssistantPreparationSchema.index({ hospitalId: 1, department: 1 });

const DoctorAssistantPreparation = mongoose.model('DoctorAssistantPreparation', doctorAssistantPreparationSchema);

module.exports = DoctorAssistantPreparation;
