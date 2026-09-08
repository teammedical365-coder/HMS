const mongoose = require('mongoose');

const nursingTaskSchema = new mongoose.Schema({
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', required: true, index: true },
    admissionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admission', required: true, index: true },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    taskType: {
        type: String,
        enum: ['VITALS', 'MEDICATION', 'SAMPLE_COLLECTION', 'PROCEDURE_PREP', 'POST_OP_MONITORING', 'INTAKE_OUTPUT', 'WOUND_CARE', 'OTHER'],
        default: 'OTHER',
        index: true
    },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    priority: {
        type: String,
        enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'],
        default: 'MEDIUM'
    },
    scheduledAt: { type: Date },
    startedAt: { type: Date },
    completedAt: { type: Date },
    status: {
        type: String,
        enum: ['PENDING', 'DUE', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED', 'CANCELLED'],
        default: 'PENDING',
        index: true
    },
    completedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    notes: { type: String, default: '', trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, {
    timestamps: true
});

// Compound indexes for task assignment and status tracking
nursingTaskSchema.index({ hospitalId: 1, admissionId: 1, status: 1, createdAt: -1 });
nursingTaskSchema.index({ hospitalId: 1, assignedTo: 1, status: 1 });

module.exports = mongoose.model('NursingTask', nursingTaskSchema);
module.exports.nursingTaskSchema = nursingTaskSchema;
