const mongoose = require('mongoose');

const POLICY_TYPES = [
    'TPA',
    'Private Health Insurance',
    'Government Health Scheme',
    'Government Employee Health Scheme',
    'Corporate Health Insurance',
    'Other'
];

const VERIFICATION_STATUSES = [
    'Not Verified',
    'Pending Verification',
    'Verified',
    'Rejected',
    'Expired'
];

const RELATIONSHIP_OPTIONS = [
    'Self',
    'Spouse',
    'Son',
    'Daughter',
    'Father',
    'Mother',
    'Dependent',
    'Employee',
    'Other'
];

function normalizeIdentifier(value) {
    if (!value || typeof value !== 'string') return '';
    return value.trim().replace(/\s+/g, ' ').toUpperCase();
}

const cardDocumentSchema = new mongoose.Schema({
    url: { type: String, trim: true, default: '' },
    fileName: { type: String, trim: true, default: '' },
    originalName: { type: String, trim: true, default: '' },
    fileId: { type: String, trim: true, default: '' },
    mimeType: { type: String, trim: true, default: '' },
    size: { type: Number, default: 0 },
    uploadedAt: { type: Date, default: null },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { _id: false });

const patientInsurancePolicySchema = new mongoose.Schema({
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
    policyType: {
        type: String,
        enum: POLICY_TYPES,
        default: 'Private Health Insurance'
    },
    providerName: {
        type: String,
        trim: true,
        default: ''
    },
    policyNumber: {
        type: String,
        trim: true,
        default: ''
    },
    tpaOrMemberId: {
        type: String,
        trim: true,
        default: ''
    },
    policyHolderName: {
        type: String,
        trim: true,
        default: ''
    },
    relationshipWithPatient: {
        type: String,
        trim: true,
        default: 'Self'
    },
    validFrom: {
        type: Date,
        default: null
    },
    validUntil: {
        type: Date,
        default: null
    },
    cardDocument: {
        type: cardDocumentSchema,
        default: null
    },
    notes: {
        type: String,
        trim: true,
        default: ''
    },
    normalizedProvider: {
        type: String,
        trim: true,
        default: ''
    },
    normalizedPolicyNumber: {
        type: String,
        trim: true,
        default: ''
    },
    normalizedMemberId: {
        type: String,
        trim: true,
        default: ''
    },
    verificationStatus: {
        type: String,
        enum: VERIFICATION_STATUSES,
        default: 'Not Verified'
    },
    verificationNotes: {
        type: String,
        trim: true,
        default: ''
    },
    verifiedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    verifiedByName: {
        type: String,
        trim: true,
        default: ''
    },
    verifiedAt: {
        type: Date,
        default: null
    },
    isPrimary: {
        type: Boolean,
        default: false
    },
    isActive: {
        type: Boolean,
        default: true,
        index: true
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    }
}, { timestamps: true });

patientInsurancePolicySchema.pre('validate', function (next) {
    this.normalizedProvider = normalizeIdentifier(this.providerName);
    this.normalizedPolicyNumber = normalizeIdentifier(this.policyNumber);
    this.normalizedMemberId = normalizeIdentifier(this.tpaOrMemberId);
    next();
});

patientInsurancePolicySchema.index({ hospitalId: 1, patientId: 1, isActive: 1, createdAt: -1 });
patientInsurancePolicySchema.index({ hospitalId: 1, normalizedPolicyNumber: 1 });
patientInsurancePolicySchema.index({ 'cardDocument.fileName': 1 });

patientInsurancePolicySchema.statics.POLICY_TYPES = POLICY_TYPES;
patientInsurancePolicySchema.statics.VERIFICATION_STATUSES = VERIFICATION_STATUSES;
patientInsurancePolicySchema.statics.RELATIONSHIP_OPTIONS = RELATIONSHIP_OPTIONS;
patientInsurancePolicySchema.statics.normalizeIdentifier = normalizeIdentifier;

module.exports = mongoose.model('PatientInsurancePolicy', patientInsurancePolicySchema);
