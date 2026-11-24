const mongoose = require('mongoose');

/**
 * LabCashRegister Model — Phase 5 Daily Cash Register & Shift Reconciliation
 * Tracks opening cash, collections, cash refunds, adjustments, and closing reconciliation.
 */
const labCashRegisterSchema = new mongoose.Schema({
    hospitalId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Hospital',
        required: true,
        index: true
    },
    locationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'LabLocation',
        default: null,
        index: true
    },
    staffId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    staffName: {
        type: String,
        default: ''
    },
    dateStr: {
        type: String, // e.g. '20261123'
        required: true,
        index: true
    },
    openingBalance: {
        type: Number,
        default: 0,
        min: 0
    },
    cashReceived: {
        type: Number,
        default: 0,
        min: 0
    },
    cashRefunds: {
        type: Number,
        default: 0,
        min: 0
    },
    cashAdjustments: {
        type: Number,
        default: 0
    },
    expectedClosingBalance: {
        type: Number,
        default: 0
    },
    actualClosingBalance: {
        type: Number,
        default: null
    },
    discrepancy: {
        type: Number,
        default: 0
    },
    status: {
        type: String,
        enum: ['OPEN', 'CLOSED'],
        default: 'OPEN',
        index: true
    },
    openedAt: {
        type: Date,
        default: Date.now
    },
    closedAt: {
        type: Date,
        default: null
    },
    closedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    closingNotes: {
        type: String,
        default: ''
    }
}, {
    timestamps: true
});

labCashRegisterSchema.index({ hospitalId: 1, staffId: 1, dateStr: 1 });
labCashRegisterSchema.index({ hospitalId: 1, status: 1 });

const LabCashRegister = mongoose.model('LabCashRegister', labCashRegisterSchema);
module.exports = LabCashRegister;
