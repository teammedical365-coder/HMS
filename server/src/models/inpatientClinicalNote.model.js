const mongoose = require('mongoose');

const inpatientClinicalNoteSchema = new mongoose.Schema({
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', required: true, index: true },
    admissionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admission', required: true, index: true },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    // Page 1 Demographic Header Fields (Pre-populated from Patient & Admission, editable when authorized)
    patientName: { type: String, default: '', trim: true },
    age: { type: String, default: '', trim: true },
    sex: { type: String, default: '', trim: true },
    regdNo: { type: String, default: '', trim: true },
    ipdNo: { type: String, default: '', trim: true },
    noteDate: { type: String, default: '', trim: true },
    noteTime: { type: String, default: '', trim: true },
    ward: { type: String, default: '', trim: true },
    bedNo: { type: String, default: '', trim: true },
    consultantName: { type: String, default: '', trim: true },

    // Page 1 Clinical Sections
    historyAndComplaints: { type: String, default: '' },
    relevantPhysicalExamination: { type: String, default: '' },
    historyOfPresentIllness: { type: String, default: '' },
    pastMedicalSurgicalHistory: { type: String, default: '' },
    personalSocialHistory: { type: String, default: '' },
    anyDrugAllergy: { type: String, default: '' },

    // Page 2 Clinical Sections
    generalExamination: {
        bp: { type: String, default: '', trim: true },
        temp: { type: String, default: '', trim: true },
        pallor: { type: String, default: '', trim: true },
        pulse: { type: String, default: '', trim: true },
        spo2: { type: String, default: '', trim: true },
        pain: { type: String, default: '', trim: true }
    },
    systemicExamination: { type: String, default: '' },
    provisionalDiagnosis: { type: String, default: '' },
    investigations: { type: String, default: '' },
    dischargeAndFollowUp: { type: String, default: '' },

    // Page 2 Footer Sign-off
    footer: {
        consultantName: { type: String, default: '', trim: true },
        signature: { type: String, default: '', trim: true },
        signDate: { type: String, default: '', trim: true },
        signTime: { type: String, default: '', trim: true }
    },

    // Authorship & Edit Audit Trail
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    createdByName: { type: String, default: '' },
    createdByRole: { type: String, default: '' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedByName: { type: String, default: '' },
    updatedByRole: { type: String, default: '' },
    editHistory: [{
        editedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        editedByName: { type: String, default: '' },
        editedByRole: { type: String, default: '' },
        editedAt: { type: Date, default: Date.now },
        summary: { type: String, default: '' }
    }]
}, { timestamps: true });

inpatientClinicalNoteSchema.index({ hospitalId: 1, admissionId: 1 }, { unique: true });

module.exports = mongoose.model('InpatientClinicalNote', inpatientClinicalNoteSchema);
module.exports.inpatientClinicalNoteSchema = inpatientClinicalNoteSchema;

