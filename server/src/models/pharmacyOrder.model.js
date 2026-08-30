const mongoose = require('mongoose');

const pharmacyOrderSchema = new mongoose.Schema({
    appointmentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Appointment',
        required: function() { return !this.isOutsidePatient; }
    },
    patientId: { 
        type: String, 
        required: function() { return !this.isOutsidePatient; } 
    },
    userId: {
        type: mongoose.Schema.Types.Mixed, // Kept from Project B
        ref: 'User',
        required: function() { return !this.isOutsidePatient; }
    },
    doctorId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: function() { return !this.isOutsidePatient; }
    },
    isOutsidePatient: { type: Boolean, default: false },
    patientName: { type: String, default: '' },
    patientPhone: { type: String, default: '' },
    doctorName: { type: String, default: '' },
    hospitalId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Hospital',
        index: true,
        required: true
    },
    items: [{
        medicineName: String,
        frequency: String,
        duration: String,
        volumeMl: { type: String, default: '' },
        administrationTime: { type: String, default: '' },
        gapDays: { type: Number, default: 0 },
        startDate: { type: Date, default: null },
        mixId: { type: String },
        mixName: { type: String },
        price: { type: Number, default: 0 },
        purchased: { type: Boolean, default: false },
        quantity: { type: Number, default: 0 },
        returnedQty: { type: Number, default: 0 },
        scheduleText: { type: String, default: '' },
        dosePerAdmin: { type: Number, default: 1 },
        doseAdmin: { type: Number, default: 1 },
        dose: { type: String },
        qtyPerDose: { type: Number, default: 0 },
        days: { type: Number, default: 1 },
        totalDosageRequired: { type: Number, default: 0 }
    }],
    paymentStatus: {
        type: String,
        enum: ['Pending', 'Paid', 'Failed', 'Refunded', 'PAID_BY_DOCTOR'], // Merged enums
        default: 'Pending'
    },
    paymentMode: { type: String },
    splitPayments: [{ // Kept from Project B
        method: { type: String },
        amount: { type: Number, default: 0 }
    }],
    authorizedByDoctor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    authorizedDoctorName: { type: String },
    authorizationNote: { type: String },
    totalAmount: {
        type: Number,
        default: 0
    },
    discountAmount: {
        type: Number,
        default: 0
    },
    taxableAmount: {
        type: Number,
        default: 0
    },
    discountPercent: {
        type: Number,
        default: 0
    },
    cgstAmount: {
        type: Number,
        default: 0
    },
    sgstAmount: {
        type: Number,
        default: 0
    },
    totalCost: {
        type: Number,
        default: 0
    },
    orderStatus: {
        type: String,
        enum: ['Upcoming', 'Completed', 'Cancelled'],
        default: 'Upcoming'
    },
    returnStatus: {
        type: String,
        enum: ['NONE', 'PARTIALLY_RETURNED', 'FULLY_RETURNED'],
        default: 'NONE'
    }
}, { timestamps: true });

// Compound Indexes for fast pharmacy order lookups, patient orders and billing
pharmacyOrderSchema.index({ hospitalId: 1, createdAt: -1 });
pharmacyOrderSchema.index({ hospitalId: 1, userId: 1, createdAt: -1 });
pharmacyOrderSchema.index({ hospitalId: 1, orderStatus: 1, createdAt: -1 });
pharmacyOrderSchema.index({ hospitalId: 1, paymentStatus: 1 });
pharmacyOrderSchema.index({ appointmentId: 1 });
pharmacyOrderSchema.index({ userId: 1, createdAt: -1 });
pharmacyOrderSchema.index({ patientId: 1 });

module.exports = mongoose.model('PharmacyOrder', pharmacyOrderSchema);