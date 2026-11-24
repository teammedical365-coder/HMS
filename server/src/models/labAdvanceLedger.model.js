const mongoose = require('mongoose');

/**
 * LabAdvanceLedger Model — Phase 5 Patient Advance Balance & Ledger
 * Manages patient advance deposits and applications against laboratory invoices.
 */
const labAdvanceLedgerSchema = new mongoose.Schema({
    hospitalId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Hospital',
        required: true,
        index: true
    },
    patientId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    type: {
        type: String,
        enum: ['DEPOSIT', 'ADJUSTMENT', 'REFUND'],
        required: true,
        index: true
    },
    amount: {
        type: Number,
        required: true,
        min: 0.01
    },
    balanceAfter: {
        type: Number,
        required: true,
        min: 0
    },
    paymentMethod: {
        type: String,
        enum: ['Cash', 'UPI', 'Card', 'Bank Transfer', 'Advance Adjustment', 'Other'],
        default: 'Cash'
    },
    transactionReference: {
        type: String,
        default: '',
        trim: true
    },
    invoiceId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'LabInvoice',
        default: null,
        index: true
    },
    paymentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'LabPayment',
        default: null
    },
    notes: {
        type: String,
        default: ''
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }
}, {
    timestamps: true
});

labAdvanceLedgerSchema.index({ hospitalId: 1, patientId: 1, createdAt: -1 });

// Static helper to compute patient's current available advance balance
labAdvanceLedgerSchema.statics.getAvailableBalance = async function(hospitalId, patientId) {
    const latest = await this.findOne({ hospitalId, patientId }).sort({ createdAt: -1 });
    return latest ? latest.balanceAfter : 0;
};

const LabAdvanceLedger = mongoose.model('LabAdvanceLedger', labAdvanceLedgerSchema);
module.exports = LabAdvanceLedger;
