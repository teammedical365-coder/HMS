const mongoose = require('mongoose');

const inpatientOrderSchema = new mongoose.Schema({
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', required: true, index: true },
    admissionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admission', required: false, index: true },
    appointmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment', required: false, index: true },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    // Clinical Context
    diagnosis: { type: String, default: '', trim: true },
    admissionReason: { type: String, default: '', trim: true },
    clinicalNotes: { type: String, default: '', trim: true },

    // Medication / Clinical details
    medicineName: { type: String, required: true, trim: true },
    dosageValue: { type: Number, default: 0 },
    dosageUnit: { type: String, default: '', trim: true }, // e.g. mg, ml, tab, puff, drops, IU
    route: {
        type: String,
        enum: ['Oral', 'IV', 'IV Push', 'IV Infusion', 'IM', 'SC', 'Topical', 'Inhalation', 'Sublingual', 'PR', 'Rectal', 'Other'],
        default: 'Oral'
    },
    frequency: { type: String, default: 'OD', trim: true }, // STAT, OD, BD, TDS, QID, Q4H, Q6H, Q8H, SOS
    startDate: { type: Date, default: Date.now },
    endDate: { type: Date },
    duration: { type: String, default: '', trim: true }, // e.g. "5 days", "STAT", "Continuous"
    instructions: { type: String, default: '', trim: true },

    // Status & Audit
    status: {
        type: String,
        enum: ['ACTIVE', 'COMPLETED', 'CANCELLED', 'ON_HOLD'],
        default: 'ACTIVE',
        index: true
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Virtual helpers for structured frontend compatibility
inpatientOrderSchema.virtual('dosage').get(function() {
    return {
        value: this.dosageValue,
        unit: this.dosageUnit
    };
});

inpatientOrderSchema.virtual('schedule').get(function() {
    return {
        startDate: this.startDate,
        endDate: this.endDate,
        duration: this.duration
    };
});

// Compound indexes for performant queries
inpatientOrderSchema.index({ hospitalId: 1, admissionId: 1, status: 1 });
inpatientOrderSchema.index({ hospitalId: 1, patientId: 1, createdAt: -1 });

module.exports = mongoose.model('InpatientOrder', inpatientOrderSchema);
module.exports.inpatientOrderSchema = inpatientOrderSchema;
