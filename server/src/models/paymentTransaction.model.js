const mongoose = require('mongoose');

const paymentTransactionSchema = new mongoose.Schema({
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', index: true },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    paymentMode: { type: String, enum: ['Cash', 'UPI', 'Card', 'NetBanking', 'Insurance'], default: 'Cash' },
    paymentStatus: { type: String, enum: ['Pending', 'Paid', 'Failed', 'Refunded'], default: 'Paid' },
    amount: { type: Number, required: true, default: 0 },
    
    // Split Payments
    splitPayments: [{
        method: { type: String },
        amount: { type: Number, default: 0 }
    }],
    
    // Payment Details
    transactionId: { type: String, default: '' },
    upiId: { type: String, default: '' },
    cardDetails: { type: String, default: '' }, // Masked
    bankReference: { type: String, default: '' },
    paymentDate: { type: Date, default: Date.now },
    
    // Proof
    proofUrl: { type: String, default: '' },
    proofFileId: { type: String, default: '' },
    
    // Related items
    description: { type: String, default: '' },
    billedItems: {
        appointments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Appointment' }],
        labReports: [{ type: mongoose.Schema.Types.ObjectId, ref: 'LabReport' }],
        pharmacyOrders: [{ type: mongoose.Schema.Types.ObjectId, ref: 'PharmacyOrder' }],
        facilityCharges: [{ type: mongoose.Schema.Types.ObjectId, ref: 'FacilityCharge' }],
        admissions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Admission' }]
    },
    
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, {
    timestamps: true
});

const PaymentTransaction = mongoose.model('PaymentTransaction', paymentTransactionSchema);
module.exports = PaymentTransaction;
