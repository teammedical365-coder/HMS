const mongoose = require('mongoose');

/**
 * LabFinancialAudit Model — Phase 5 Financial Audit Trail
 * Unalterable historical log of all financial events, approvals, refunds, and adjustments.
 */
const labFinancialAuditSchema = new mongoose.Schema({
    hospitalId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Hospital',
        required: true,
        index: true
    },
    action: {
        type: String,
        enum: [
            'INVOICE_CREATED',
            'PAYMENT_RECORDED',
            'DISCOUNT_APPLIED',
            'DISCOUNT_APPROVED',
            'REFUND_PROCESSED',
            'ADVANCE_DEPOSITED',
            'ADVANCE_ADJUSTED',
            'CASH_REGISTER_OPENED',
            'CASH_REGISTER_CLOSED',
            'INVOICE_CANCELLED'
        ],
        required: true,
        index: true
    },
    entityType: {
        type: String,
        enum: ['LabInvoice', 'LabPayment', 'LabRefund', 'LabAdvanceLedger', 'LabCashRegister'],
        required: true
    },
    entityId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        index: true
    },
    entityIdentifier: {
        type: String,
        default: ''
    },
    amount: {
        type: Number,
        default: 0
    },
    details: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    performedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    ipAddress: {
        type: String,
        default: ''
    },
    userAgent: {
        type: String,
        default: ''
    }
}, {
    timestamps: { createdAt: true, updatedAt: false }
});

labFinancialAuditSchema.index({ hospitalId: 1, createdAt: -1 });

const LabFinancialAudit = mongoose.model('LabFinancialAudit', labFinancialAuditSchema);
module.exports = LabFinancialAudit;
