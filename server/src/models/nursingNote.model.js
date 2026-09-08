const mongoose = require('mongoose');

const nursingNoteSchema = new mongoose.Schema({
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', required: true, index: true },
    admissionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admission', required: true, index: true },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    nurseId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    noteType: {
        type: String,
        enum: ['GENERAL', 'PATIENT_CONDITION', 'OBSERVATION', 'MEDICATION', 'POST_OP', 'WOUND', 'SAFETY', 'OTHER'],
        default: 'GENERAL',
        index: true
    },
    note: { type: String, required: true, trim: true },
    shift: { type: String, default: '', trim: true },
    priority: { type: String, enum: ['Normal', 'High', 'Urgent'], default: 'Normal' }
}, {
    timestamps: true
});

// Compound indexes for performant audit queries
nursingNoteSchema.index({ hospitalId: 1, admissionId: 1, createdAt: -1 });
nursingNoteSchema.index({ hospitalId: 1, patientId: 1, createdAt: -1 });

module.exports = mongoose.model('NursingNote', nursingNoteSchema);
module.exports.nursingNoteSchema = nursingNoteSchema;
