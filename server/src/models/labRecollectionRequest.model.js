const mongoose = require('mongoose');

/**
 * LabRecollectionRequest Model — Phase 6 Specimen Recollection Management
 */
const labRecollectionRequestSchema = new mongoose.Schema({
    hospitalId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Hospital',
        required: true,
        index: true
    },
    orderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'LabOrder',
        required: true,
        index: true
    },
    orderNumber: {
        type: String,
        required: true
    },
    patientId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    patientName: {
        type: String,
        default: ''
    },
    originalSampleId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'LabSample',
        required: true,
        index: true
    },
    originalBarcode: {
        type: String,
        required: true
    },
    specimenPlaceholderId: {
        type: String,
        required: true
    },
    specimenType: {
        type: String,
        required: true
    },
    containerType: {
        type: String,
        required: true
    },
    reason: {
        type: String,
        required: true,
        trim: true
    },
    status: {
        type: String,
        enum: ['REQUESTED', 'ASSIGNED', 'COLLECTION_PENDING', 'RECOLLECTED', 'CANCELLED'],
        default: 'REQUESTED',
        index: true
    },
    requestedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    requestedByName: {
        type: String,
        default: ''
    },
    requestedAt: {
        type: Date,
        default: Date.now
    },
    assignedTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    assignedToName: {
        type: String,
        default: ''
    },
    assignedAt: {
        type: Date,
        default: null
    },
    replacementSampleId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'LabSample',
        default: null
    },
    replacementBarcode: {
        type: String,
        default: ''
    },
    recollectedAt: {
        type: Date,
        default: null
    },
    recollectedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    notes: {
        type: String,
        default: ''
    }
}, {
    timestamps: true
});

labRecollectionRequestSchema.index({ hospitalId: 1, originalSampleId: 1 });
labRecollectionRequestSchema.index({ hospitalId: 1, status: 1 });
labRecollectionRequestSchema.index({ hospitalId: 1, createdAt: -1 });

const LabRecollectionRequest = mongoose.model('LabRecollectionRequest', labRecollectionRequestSchema);
module.exports = LabRecollectionRequest;
