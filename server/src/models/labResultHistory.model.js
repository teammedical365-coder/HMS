const mongoose = require('mongoose');

/**
 * LabResultHistory Model — Phase 7
 * Immutable audit trail of every status transition, value modification,
 * pathologist verification, rejection, and amendment.
 */
const labResultHistorySchema = new mongoose.Schema({
    hospitalId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Hospital',
        required: true,
        index: true
    },
    resultId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'LabTestResult',
        required: true,
        index: true
    },
    orderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'LabOrder',
        required: true,
        index: true
    },
    testId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'LabTest',
        required: true
    },
    testCode: {
        type: String,
        default: ''
    },
    previousStatus: {
        type: String,
        default: ''
    },
    newStatus: {
        type: String,
        required: true
    },
    action: {
        type: String,
        required: true
    },
    revisionNumber: {
        type: Number,
        default: 1
    },
    performedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    performedByName: {
        type: String,
        default: ''
    },
    details: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    timestamp: {
        type: Date,
        default: Date.now,
        index: true
    }
}, {
    timestamps: false
});

labResultHistorySchema.index({ hospitalId: 1, resultId: 1, timestamp: -1 });

const LabResultHistory = mongoose.model('LabResultHistory', labResultHistorySchema);
module.exports = LabResultHistory;
