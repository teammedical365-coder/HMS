const mongoose = require('mongoose');

const capaActionHistorySchema = new mongoose.Schema({
    action: { type: String, required: true },
    comment: { type: String, default: '' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedByName: { type: String, default: 'Staff' },
    updatedAt: { type: Date, default: Date.now }
}, { _id: false });

const capaSchema = new mongoose.Schema({
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', required: true, index: true },
    capaNumber: { type: String, required: true, trim: true }, // e.g. CAPA-2026-001
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    chapterCode: {
        type: String,
        enum: ['AAC', 'COP', 'MOM', 'PRE', 'HIC', 'PSQ', 'ROM', 'FMS', 'HRM', 'IMS', 'GENERAL'],
        default: 'GENERAL',
        index: true
    },
    standardReference: { type: String, default: '', trim: true },
    nonConformanceType: {
        type: String,
        enum: ['CLINICAL', 'INFRASTRUCTURE', 'DOCUMENTATION', 'MEDICATION', 'INFECTION_CONTROL', 'SAFETY'],
        default: 'DOCUMENTATION'
    },
    severity: {
        type: String,
        enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
        default: 'MEDIUM'
    },
    rootCauseAnalysis: { type: String, default: '', trim: true },
    correctiveAction: { type: String, default: '', trim: true },
    preventiveAction: { type: String, default: '', trim: true },
    assignedToId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    assignedToName: { type: String, default: '', trim: true },
    assignedToRole: { type: String, default: '', trim: true },
    targetDate: { type: Date, default: null },
    status: {
        type: String,
        enum: ['OPEN', 'UNDER_INVESTIGATION', 'ACTION_PLANNED', 'RESOLVED', 'CLOSED'],
        default: 'OPEN',
        index: true
    },
    verificationSignOff: {
        verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        verifiedByName: { type: String, default: '' },
        verifiedAt: { type: Date, default: null },
        remarks: { type: String, default: '' }
    },
    actionHistory: { type: [capaActionHistorySchema], default: [] },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdByName: { type: String, default: '' }
}, { timestamps: true });

capaSchema.index({ hospitalId: 1, status: 1, targetDate: 1 });

module.exports = mongoose.model('Capa', capaSchema);
module.exports.capaSchema = capaSchema;

