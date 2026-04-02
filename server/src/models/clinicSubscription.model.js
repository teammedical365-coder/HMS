const mongoose = require('mongoose');

/**
 * ClinicSubscription — monthly billing record per clinic.
 * Central admin sets ratePerPatient, tracks new patients registered each month,
 * and can mark months as paid/waived.
 */
const clinicSubscriptionSchema = new mongoose.Schema({
    clinicId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Hospital',
        required: true,
        index: true,
    },
    month: { type: Number, required: true, min: 1, max: 12 }, // 1–12
    year:  { type: Number, required: true },

    // Counts
    newPatientCount:   { type: Number, default: 0 }, // registered this month
    totalPatientCount: { type: Number, default: 0 }, // total active patients in clinic

    // Billing
    ratePerPatient: { type: Number, default: 0 }, // ₹ per new patient this month
    totalAmount:    { type: Number, default: 0 }, // newPatientCount * ratePerPatient

    // Status
    status:  { type: String, enum: ['pending', 'paid', 'waived'], default: 'pending' },
    paidAt:  { type: Date, default: null },
    notes:   { type: String, default: '' },
}, { timestamps: true });

// One record per clinic per month
clinicSubscriptionSchema.index({ clinicId: 1, month: 1, year: 1 }, { unique: true });

module.exports = mongoose.model('ClinicSubscription', clinicSubscriptionSchema);
