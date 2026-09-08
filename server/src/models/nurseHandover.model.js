const mongoose = require('mongoose');

const nurseHandoverSchema = new mongoose.Schema({
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', required: true, index: true },
    admissionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admission', required: true, index: true },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    fromNurseId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    toNurseId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    shift: {
        type: String,
        default: 'Morning to Evening',
        trim: true
        // e.g. Morning to Evening, Evening to Night, Night to Morning, Emergency Handover
    },
    handoverAt: {
        type: Date,
        default: Date.now,
        index: true
    },
    summary: {
        type: String,
        required: true,
        trim: true
    },
    importantObservations: {
        type: String,
        default: '',
        trim: true
    },
    pendingTasks: {
        type: String,
        default: '',
        trim: true
    },
    medicationConcerns: {
        type: String,
        default: '',
        trim: true
    },
    safetyConcerns: {
        type: String,
        default: '',
        trim: true
    }
}, {
    timestamps: true
});

// Compound index for append-only shift handover chronological audit trail
nurseHandoverSchema.index({ hospitalId: 1, admissionId: 1, handoverAt: -1 });

module.exports = mongoose.model('NurseHandover', nurseHandoverSchema);
module.exports.nurseHandoverSchema = nurseHandoverSchema;
