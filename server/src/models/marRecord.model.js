const mongoose = require('mongoose');

const marEditHistorySchema = new mongoose.Schema({
    previousStatus: { type: String, default: '' },
    previousAdministeredTime: { type: Date, default: null },
    previousAdministeredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    previousAdministeredByName: { type: String, default: '' },
    previousActualDoseValue: { type: Number },
    previousActualDoseUnit: { type: String, default: '' },
    previousActualDose: { type: String, default: '' },
    previousRoute: { type: String, default: '' },
    previousNotes: { type: String, default: '' },
    previousReason: { type: String, default: '' },
    correctionReason: { type: String, default: '', trim: true },
    editedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    editedByName: { type: String, default: 'Staff', trim: true },
    editedByRole: { type: String, default: '', trim: true },
    editedAt: { type: Date, default: Date.now }
}, { _id: true });

const marRecordSchema = new mongoose.Schema({
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', required: true, index: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'InpatientOrder', required: true, index: true },
    admissionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admission', required: false, index: true },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    scheduledTime: { type: Date, required: true, index: true },
    scheduledDateKey: { type: String, default: '', trim: true, index: true }, // YYYY-MM-DD
    scheduledSlot: { type: String, default: '', trim: true }, // e.g. '06 AM', '10 AM', '02 PM', '10 PM'
    administeredTime: { type: Date },
    administeredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    administeredByName: { type: String, default: '', trim: true },

    status: {
        type: String,
        enum: ['SCHEDULED', 'DUE', 'ADMINISTERED', 'HELD', 'REFUSED', 'MISSED', 'NOT_GIVEN', 'CANCELLED'],
        default: 'SCHEDULED',
        index: true
    },

    // Actual dosage & route details (kept strictly distinct from prescribed amount)
    actualDoseValue: { type: Number },
    actualDoseUnit: { type: String, default: '', trim: true },
    actualDose: { type: String, default: '', trim: true },
    route: { type: String, default: '', trim: true },

    notes: { type: String, default: '', trim: true },
    reason: { type: String, default: '', trim: true }, // Required when status is HELD, REFUSED, MISSED, or NOT_GIVEN

    // Authorship & immutable audit trail for authorized corrections
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    createdByName: { type: String, default: '', trim: true },
    createdByRole: { type: String, default: '', trim: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedByName: { type: String, default: '', trim: true },
    updatedByRole: { type: String, default: '', trim: true },
    editHistory: { type: [marEditHistorySchema], default: [] }
}, { timestamps: true });

// Compound indexes for shift-based MAR & Drug Chart grid queries
marRecordSchema.index({ hospitalId: 1, admissionId: 1, scheduledTime: 1 });
marRecordSchema.index({ hospitalId: 1, admissionId: 1, status: 1 });
marRecordSchema.index({ hospitalId: 1, admissionId: 1, orderId: 1, scheduledDateKey: 1, scheduledSlot: 1 });

module.exports = mongoose.model('MARRecord', marRecordSchema);
module.exports.marRecordSchema = marRecordSchema;
