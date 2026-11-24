const mongoose = require('mongoose');

/**
 * Result Parameter Sub-Schema — Phase 7
 * Stores entered parameter findings, snapshots of reference ranges,
 * automated clinical flags, and critical value detection.
 */
const resultParameterSchema = new mongoose.Schema({
    parameterId: {
        type: mongoose.Schema.Types.ObjectId,
        default: null
    },
    parameterName: {
        type: String,
        required: true,
        trim: true
    },
    parameterCode: {
        type: String,
        default: '',
        trim: true
    },
    dataType: {
        type: String,
        enum: ['Numeric', 'Text', 'Choice'],
        default: 'Numeric'
    },
    decimalPlaces: {
        type: Number,
        default: 0
    },
    enteredValue: {
        type: String,
        default: '',
        trim: true
    },
    numericValue: {
        type: Number,
        default: null
    },
    unit: {
        type: String,
        default: '',
        trim: true
    },
    referenceRangeSnapshot: {
        minAge: { type: Number, default: 0 },
        maxAge: { type: Number, default: 120 },
        ageUnit: { type: String, default: 'Years' },
        gender: { type: String, default: 'Any' },
        normalMin: { type: Number, default: null },
        normalMax: { type: Number, default: null },
        criticalLow: { type: Number, default: null },
        criticalHigh: { type: Number, default: null },
        unit: { type: String, default: '' },
        interpretationNotes: { type: String, default: '' }
    },
    referenceRangeText: {
        type: String,
        default: ''
    },
    abnormalFlag: {
        type: String,
        enum: ['NORMAL', 'LOW', 'HIGH', 'ABNORMAL', 'NOT_APPLICABLE', 'RANGE_NOT_CONFIGURED'],
        default: 'NORMAL'
    },
    criticalFlag: {
        type: Boolean,
        default: false
    },
    criticalAlertId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'LabCriticalAlert',
        default: null
    },
    remarks: {
        type: String,
        default: ''
    },
    displayOrder: {
        type: Number,
        default: 1
    },
    isRequired: {
        type: Boolean,
        default: true
    },
    choices: [{
        type: String,
        trim: true
    }]
}, { _id: true });

/**
 * LabTestResult Model — Phase 7 Laboratory Result Entry & Pathologist Verification
 */
const labTestResultSchema = new mongoose.Schema({
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
    patientSnapshot: {
        name: { type: String, required: true },
        uhid: { type: String, default: '' },
        mrn: { type: String, default: '' },
        phone: { type: String, default: '' },
        gender: { type: String, default: 'Other' },
        age: { type: Number, default: 0 },
        dob: { type: Date, default: null }
    },
    orderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'LabOrder',
        required: true,
        index: true
    },
    orderNumber: {
        type: String,
        required: true,
        index: true
    },
    tokenNumber: {
        type: Number,
        default: 1
    },
    sampleId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'LabSample',
        required: true,
        index: true
    },
    barcode: {
        type: String,
        required: true,
        index: true
    },
    testId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'LabTest',
        required: true,
        index: true
    },
    testCode: {
        type: String,
        required: true,
        trim: true
    },
    testName: {
        type: String,
        required: true,
        trim: true
    },
    department: {
        type: String,
        default: 'General Pathology',
        index: true
    },
    processingLocationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'LabLocation',
        default: null
    },
    processingLocationName: {
        type: String,
        default: ''
    },
    priority: {
        type: String,
        enum: ['Routine', 'Urgent', 'STAT'],
        default: 'Routine',
        index: true
    },
    resultStatus: {
        type: String,
        enum: [
            'PENDING',
            'DRAFT',
            'SUBMITTED',
            'UNDER_REVIEW',
            'CORRECTION_REQUESTED',
            'REJECTED',
            'VERIFIED',
            'CANCELLED'
        ],
        default: 'PENDING',
        index: true
    },
    resultParameters: [resultParameterSchema],
    hasAbnormalParameters: {
        type: Boolean,
        default: false,
        index: true
    },
    hasCriticalParameters: {
        type: Boolean,
        default: false,
        index: true
    },
    overallRemarks: {
        type: String,
        default: ''
    },
    clinicalNotes: {
        type: String,
        default: ''
    },
    // Technician workflow
    enteredBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    enteredByName: {
        type: String,
        default: ''
    },
    enteredAt: {
        type: Date,
        default: null
    },
    submittedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    submittedByName: {
        type: String,
        default: ''
    },
    submittedAt: {
        type: Date,
        default: null
    },
    // Pathologist verification workflow
    reviewedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    reviewedByName: {
        type: String,
        default: ''
    },
    reviewedAt: {
        type: Date,
        default: null
    },
    verifiedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    verifiedByName: {
        type: String,
        default: ''
    },
    verifiedAt: {
        type: Date,
        default: null
    },
    rejectionReason: {
        type: String,
        default: ''
    },
    rejectedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    rejectedByName: {
        type: String,
        default: ''
    },
    rejectedAt: {
        type: Date,
        default: null
    },
    correctionReason: {
        type: String,
        default: ''
    },
    correctionRequestedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    correctionRequestedByName: {
        type: String,
        default: ''
    },
    correctionRequestedAt: {
        type: Date,
        default: null
    },
    revisionNumber: {
        type: Number,
        default: 1
    },
    correctionHistory: [{
        revisionNumber: { type: Number, required: true },
        previousParameters: [resultParameterSchema],
        reason: { type: String, default: '' },
        changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        changedByName: { type: String, default: '' },
        changedAt: { type: Date, default: Date.now }
    }]
}, {
    timestamps: true
});

labTestResultSchema.index({ hospitalId: 1, orderId: 1, testId: 1 }, { unique: true });
labTestResultSchema.index({ hospitalId: 1, barcode: 1 });
labTestResultSchema.index({ hospitalId: 1, sampleId: 1 });
labTestResultSchema.index({ hospitalId: 1, resultStatus: 1 });
labTestResultSchema.index({ hospitalId: 1, department: 1 });
labTestResultSchema.index({ hospitalId: 1, hasCriticalParameters: 1 });
labTestResultSchema.index({ hospitalId: 1, verifiedAt: -1 });
labTestResultSchema.index({ hospitalId: 1, createdAt: -1 });

const LabTestResult = mongoose.model('LabTestResult', labTestResultSchema);
module.exports = LabTestResult;
