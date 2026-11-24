const mongoose = require('mongoose');

/**
 * LabPayment Model — Phase 5 Laboratory Payment Transactions
 * Records every immutable financial collection against an invoice.
 * Supports multiple payment modes, partial payments, advance adjustments, and receipts.
 */
const labPaymentSchema = new mongoose.Schema({
    hospitalId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Hospital',
        required: true,
        index: true
    },
    paymentNumber: {
        type: String,
        required: true,
        trim: true
    },
    invoiceId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'LabInvoice',
        required: true,
        index: true
    },
    invoiceNumber: {
        type: String,
        required: true
    },
    orderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'LabOrder',
        required: true,
        index: true
    },
    orderNumber: {
        type: String,
        required: true
    },
    patientId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    patientSnapshot: {
        name: { type: String, default: '' },
        uhid: { type: String, default: '' },
        phone: { type: String, default: '' }
    },
    amount: {
        type: Number,
        required: true,
        min: 0.01
    },
    paymentMethod: {
        type: String,
        enum: ['Cash', 'UPI', 'Debit Card', 'Credit Card', 'Card', 'Bank Transfer', 'Advance Adjustment', 'Other'],
        required: true,
        default: 'Cash'
    },
    transactionReference: {
        type: String,
        default: '',
        trim: true
    },
    paymentStatus: {
        type: String,
        enum: ['SUCCESS', 'FAILED', 'REVERSED'],
        default: 'SUCCESS',
        index: true
    },
    previousDue: {
        type: Number,
        required: true,
        min: 0
    },
    remainingDue: {
        type: Number,
        required: true,
        min: 0
    },
    refundedAmount: {
        type: Number,
        default: 0,
        min: 0
    },
    locationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'LabLocation',
        default: null,
        index: true
    },
    receivedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    receivedByName: {
        type: String,
        default: ''
    },
    idempotencyKey: {
        type: String,
        default: null,
        index: true
    },
    notes: {
        type: String,
        default: ''
    },
    paymentDate: {
        type: Date,
        default: Date.now,
        index: true
    }
}, {
    timestamps: true
});

labPaymentSchema.index({ hospitalId: 1, paymentNumber: 1 }, { unique: true });
labPaymentSchema.index({ hospitalId: 1, paymentDate: -1 });
labPaymentSchema.index({ hospitalId: 1, paymentMethod: 1 });
labPaymentSchema.index({ hospitalId: 1, idempotencyKey: 1 }, { unique: true, sparse: true });

const LabPayment = mongoose.model('LabPayment', labPaymentSchema);
module.exports = LabPayment;
