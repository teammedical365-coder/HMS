const mongoose = require('mongoose');

const paymentTransactionSchema = new mongoose.Schema({
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', index: true },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    paymentMode: { type: String, default: 'Cash' },
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
    appointmentTime: { type: String, default: '' },
    
    // Proof
    proofUrl: { type: String, default: '' },
    proofFileId: { type: String, default: '' },
    
    // Department & Source Accounting Classification
    department: {
        type: String,
        enum: ['HOSPITAL_RECEPTION', 'OPD_CONSULTATION', 'IPD', 'HOSPITAL_SERVICES', 'OT_SURGERY', 'PHARMACY', 'LABORATORY'],
        default: 'HOSPITAL_RECEPTION',
        index: true
    },
    sourceCategory: {
        type: String,
        default: 'HOSPITAL_BILLING'
    },
    nonAppointmentAmount: {
        type: Number,
        default: null
    },
    idempotencyKey: {
        type: String,
        sparse: true,
        index: true
    },

    // Related items
    description: { type: String, default: '' },
    billedItems: {
        appointments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Appointment' }],
        labReports: [{ type: mongoose.Schema.Types.ObjectId, ref: 'LabReport' }],
        pharmacyOrders: [{ type: mongoose.Schema.Types.ObjectId, ref: 'PharmacyOrder' }],
        facilityCharges: [{ type: mongoose.Schema.Types.ObjectId, ref: 'FacilityCharge' }],
        admissions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Admission' }],
        surgeryPlans: [{ type: mongoose.Schema.Types.ObjectId, ref: 'SurgeryPlan' }]
    },
    
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, {
    timestamps: true
});

const PaymentTransaction = mongoose.model('PaymentTransaction', paymentTransactionSchema);
module.exports = PaymentTransaction;
