const mongoose = require('mongoose');

/**
 * LabRefund Model — Phase 5 Laboratory Refund Workflow
 * Controlled, auditable refunds referencing successful payments.
 */
const labRefundSchema = new mongoose.Schema({
    hospitalId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Hospital',
        required: true,
        index: true
    },
    refundNumber: {
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
    paymentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'LabPayment',
        required: true,
        index: true
    },
    paymentNumber: {
        type: String,
        required: true
    },
    patientId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    amount: {
        type: Number,
        required: true,
        min: 0.01
    },
    refundMethod: {
        type: String,
        enum: ['Cash', 'UPI', 'Bank Transfer', 'Original Payment Method', 'Other'],
        required: true,
        default: 'Cash'
    },
    reason: {
        type: String,
        required: true,
        trim: true
    },
    status: {
        type: String,
        enum: ['APPROVED', 'PENDING', 'REJECTED'],
        default: 'APPROVED',
        index: true
    },
    processedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    refundDate: {
        type: Date,
        default: Date.now,
        index: true
    },
    notes: {
        type: String,
        default: ''
    }
}, {
    timestamps: true
});

labRefundSchema.index({ hospitalId: 1, refundNumber: 1 }, { unique: true });
labRefundSchema.index({ hospitalId: 1, refundDate: -1 });

const LabRefund = mongoose.model('LabRefund', labRefundSchema);
module.exports = LabRefund;
