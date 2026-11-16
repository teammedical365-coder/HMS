const mongoose = require('mongoose');

const evidenceDocSchema = new mongoose.Schema({
    title: { type: String, required: true, trim: true },
    fileUrl: { type: String, required: true, trim: true },
    fileType: { type: String, default: 'application/pdf', trim: true },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    uploadedByName: { type: String, default: 'Staff', trim: true },
    uploadedAt: { type: Date, default: Date.now }
}, { _id: true });

const elementComplianceSchema = new mongoose.Schema({
    elementCode: { type: String, required: true, trim: true },
    status: {
        type: String,
        enum: ['COMPLIANT', 'PARTIALLY_COMPLIANT', 'NON_COMPLIANT', 'NOT_APPLICABLE'],
        default: 'NON_COMPLIANT'
    },
    score: { type: Number, default: 0, min: 0, max: 10 }, // 10 = Compliant, 5 = Partially Compliant, 0 = Non-Compliant
    remarks: { type: String, default: '', trim: true },
    evidences: { type: [evidenceDocSchema], default: [] },
    evaluatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    evaluatedByName: { type: String, default: '' },
    evaluatedAt: { type: Date, default: null }
}, { _id: false });

const nabhComplianceSchema = new mongoose.Schema({
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', required: true, index: true },
    chapterCode: {
        type: String,
        required: true,
        enum: ['AAC', 'COP', 'MOM', 'PRE', 'HIC', 'PSQ', 'ROM', 'FMS', 'HRM', 'IMS'],
        index: true
    },
    standardCode: { type: String, required: true, trim: true, index: true },
    elementScores: { type: [elementComplianceSchema], default: [] },
    chapterScore: { type: Number, default: 0 },
    compliancePercentage: { type: Number, default: 0 },
    overallStatus: {
        type: String,
        enum: ['NOT_STARTED', 'IN_ASSESSMENT', 'READY_FOR_AUDIT', 'ACCREDITED'],
        default: 'NOT_STARTED'
    },
    lastAuditedAt: { type: Date, default: null },
    lastAuditedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

nabhComplianceSchema.index({ hospitalId: 1, chapterCode: 1, standardCode: 1 }, { unique: true });

module.exports = mongoose.model('NabhCompliance', nabhComplianceSchema);
module.exports.nabhComplianceSchema = nabhComplianceSchema;

