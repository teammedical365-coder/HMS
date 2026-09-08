const mongoose = require('mongoose');

const ipdIntakeOutputSchema = new mongoose.Schema({
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', required: true, index: true },
    admissionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admission', required: true, index: true },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    recordedAt: { type: Date, default: Date.now, index: true },

    category: {
        type: String,
        enum: ['INTAKE', 'OUTPUT'],
        required: true,
        index: true
    },
    type: {
        type: String,
        required: true,
        trim: true
        // Examples: Oral, IV, Tube Feed, Urine, Drain, Vomit, Stool, Blood/Transfusion, Other
    },
    amount: {
        type: Number,
        required: true,
        min: [0.01, 'Amount must be greater than zero']
    },
    unit: {
        type: String,
        enum: ['ml', 'L'],
        default: 'ml'
    },
    source: {
        type: String,
        default: '',
        trim: true
    },
    notes: {
        type: String,
        default: '',
        trim: true
    }
}, {
    timestamps: true
});

// Compound indexes for time-series fluid balance calculation
ipdIntakeOutputSchema.index({ hospitalId: 1, admissionId: 1, recordedAt: -1 });
ipdIntakeOutputSchema.index({ hospitalId: 1, admissionId: 1, category: 1, recordedAt: -1 });

module.exports = mongoose.model('IPDIntakeOutput', ipdIntakeOutputSchema);
module.exports.ipdIntakeOutputSchema = ipdIntakeOutputSchema;
