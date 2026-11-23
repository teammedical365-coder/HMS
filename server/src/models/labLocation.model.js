const mongoose = require('mongoose');

const labLocationSchema = new mongoose.Schema({
    hospitalId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Hospital',
        required: [true, 'Hospital ID is required'],
        index: true
    },
    labId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Lab',
        default: null,
        index: true
    },
    locationName: {
        type: String,
        required: [true, 'Location name is required'],
        trim: true
    },
    locationCode: {
        type: String,
        required: [true, 'Location code is required'],
        uppercase: true,
        trim: true
    },
    locationType: {
        type: String,
        enum: ['PROCESSING_LAB', 'COLLECTION_CENTRE', 'BRANCH'],
        default: 'COLLECTION_CENTRE',
        required: true
    },
    address: {
        type: String,
        default: '',
        trim: true
    },
    contactPerson: {
        type: String,
        default: '',
        trim: true
    },
    phone: {
        type: String,
        default: '',
        trim: true
    },
    email: {
        type: String,
        default: '',
        trim: true,
        lowercase: true
    },
    isProcessingLab: {
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
    }
}, {
    timestamps: true
});

// Enforce unique locationCode per hospital tenant
labLocationSchema.index({ hospitalId: 1, locationCode: 1 }, { unique: true });
labLocationSchema.index({ hospitalId: 1, isActive: 1 });
labLocationSchema.index({ hospitalId: 1, isProcessingLab: 1 });

const LabLocation = mongoose.model('LabLocation', labLocationSchema);

module.exports = LabLocation;
