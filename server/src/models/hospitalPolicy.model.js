const mongoose = require('mongoose');

const POLICY_CATEGORIES = [
    'General Hospital Policy',
    'Appointment & Cancellation Policy',
    'Patient Privacy Policy',
    'Consultation Policy',
    'Refund Policy',
    'Medical Records Policy',
    'Patient Consent',
    'Emergency Disclaimer',
    'Data Usage Policy',
    'Other'
];

const hospitalPolicySchema = new mongoose.Schema({
    hospitalId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Hospital',
        required: true,
        index: true
    },
    title: {
        type: String,
        required: true,
        trim: true
    },
    slug: {
        type: String,
        trim: true,
        lowercase: true
    },
    content: {
        type: String,
        required: true
    },
    category: {
        type: String,
        required: true,
        default: 'General Hospital Policy'
    },
    isActive: {
        type: Boolean,
        default: true,
        index: true
    },
    isMandatory: {
        type: Boolean,
        default: true
    },
    displayOrder: {
        type: Number,
        default: 0
    },
    version: {
        type: Number,
        default: 1,
        min: 1
    },
    applicableTo: [{
        type: String,
        enum: ['PATIENT_REGISTRATION', 'APPOINTMENT_BOOKING', 'ALL'],
        default: 'ALL'
    }],
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, { timestamps: true });

// Auto slug generation before save
hospitalPolicySchema.pre('save', function (next) {
    if (this.isModified('title') && (!this.slug || this.isModified('slug'))) {
        this.slug = this.title
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9\s-]/g, '')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-');
    }
    next();
});

// Indexes for tenant and sorting
hospitalPolicySchema.index({ hospitalId: 1, isActive: 1, displayOrder: 1 });
hospitalPolicySchema.index({ hospitalId: 1, slug: 1 });

const HospitalPolicy = mongoose.models.HospitalPolicy || mongoose.model('HospitalPolicy', hospitalPolicySchema);

module.exports = {
    HospitalPolicy,
    hospitalPolicySchema,
    POLICY_CATEGORIES
};
