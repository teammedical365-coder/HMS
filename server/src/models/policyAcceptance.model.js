const mongoose = require('mongoose');

const policyAcceptanceItemSchema = new mongoose.Schema({
    policyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'HospitalPolicy',
        required: true
    },
    policyTitle: {
        type: String,
        required: true
    },
    category: {
        type: String,
        default: 'General Hospital Policy'
    },
    version: {
        type: Number,
        required: true,
        min: 1
    },
    acceptedAt: {
        type: Date,
        default: Date.now
    }
}, { _id: false });

const policyAcceptanceSchema = new mongoose.Schema({
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
    appointmentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Appointment',
        default: null,
        index: true
    },
    policiesAccepted: [policyAcceptanceItemSchema],
    source: {
        type: String,
        enum: ['PATIENT_REGISTRATION', 'APPOINTMENT_BOOKING', 'PATIENT_PORTAL_SIGNUP', 'PATIENT_PORTAL', 'PATIENT_SIGNUP', 'RECEPTION_DESK', 'OTHER'],
        required: true,
        default: 'PATIENT_REGISTRATION'
    },
    acceptedAt: {
        type: Date,
        default: Date.now,
        index: true
    },
    acceptedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    ipAddress: {
        type: String,
        default: ''
    },
    userAgent: {
        type: String,
        default: ''
    },
    offlineSync: {
        isOfflineEvent: {
            type: Boolean,
            default: false
        },
        offlineAcceptedAt: {
            type: Date,
            default: null
        },
        syncedAt: {
            type: Date,
            default: null
        }
    }
}, { timestamps: true });

// Composite indexes for fast tenant querying and auditing
policyAcceptanceSchema.index({ hospitalId: 1, patientId: 1, source: 1 });
policyAcceptanceSchema.index({ hospitalId: 1, appointmentId: 1 });
policyAcceptanceSchema.index({ hospitalId: 1, acceptedAt: -1 });

const PolicyAcceptance = mongoose.models.PolicyAcceptance || mongoose.model('PolicyAcceptance', policyAcceptanceSchema);

module.exports = {
    PolicyAcceptance,
    policyAcceptanceSchema
};
