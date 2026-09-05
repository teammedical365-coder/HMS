const mongoose = require('mongoose');

const marRecordSchema = new mongoose.Schema({
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', required: true, index: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'InpatientOrder', required: true, index: true },
    admissionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admission', required: true, index: true },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    scheduledTime: { type: Date, required: true, index: true },
    administeredTime: { type: Date },
    administeredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    status: {
        type: String,
        enum: ['SCHEDULED', 'DUE', 'ADMINISTERED', 'HELD', 'REFUSED', 'MISSED', 'CANCELLED'],
        default: 'SCHEDULED',
        index: true
    },

    // Actual dosage details (kept strictly distinct from prescribed amount)
    actualDoseValue: { type: Number },
    actualDoseUnit: { type: String, default: '', trim: true },

    notes: { type: String, default: '', trim: true },
    reason: { type: String, default: '', trim: true } // Required when status is HELD, REFUSED, or MISSED
}, { timestamps: true });

// Compound indexes for shift-based MAR queries
marRecordSchema.index({ hospitalId: 1, admissionId: 1, scheduledTime: 1 });
marRecordSchema.index({ hospitalId: 1, admissionId: 1, status: 1 });

module.exports = mongoose.model('MARRecord', marRecordSchema);
module.exports.marRecordSchema = marRecordSchema;
