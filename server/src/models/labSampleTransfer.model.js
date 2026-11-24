const mongoose = require('mongoose');

/**
 * LabSampleTransfer Model — Phase 6 Multi-Location Sample Transfers
 */
const labSampleTransferSchema = new mongoose.Schema({
    hospitalId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Hospital',
        required: true,
        index: true
    },
    transferNumber: {
        type: String,
        required: true,
        trim: true
    },
    sourceLocationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'LabLocation',
        required: true,
        index: true
    },
    sourceLocationName: {
        type: String,
        default: ''
    },
    destinationLocationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'LabLocation',
        required: true,
        index: true
    },
    destinationLocationName: {
        type: String,
        default: ''
    },
    samples: [{
        sampleId: { type: mongoose.Schema.Types.ObjectId, ref: 'LabSample', required: true },
        barcode: { type: String, required: true },
        specimenType: { type: String, default: '' },
        containerType: { type: String, default: '' },
        patientName: { type: String, default: '' },
        testNames: [{ type: String }]
    }],
    status: {
        type: String,
        enum: ['DRAFT', 'DISPATCHED', 'IN_TRANSIT', 'RECEIVED', 'CANCELLED'],
        default: 'DISPATCHED',
        index: true
    },
    transportReference: {
        type: String,
        default: '',
        trim: true
    },
    courierName: {
        type: String,
        default: ''
    },
    dispatchedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    dispatchedByName: {
        type: String,
        default: ''
    },
    dispatchedAt: {
        type: Date,
        default: Date.now
    },
    receivedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    receivedByName: {
        type: String,
        default: ''
    },
    receivedAt: {
        type: Date,
        default: null
    },
    notes: {
        type: String,
        default: ''
    }
}, {
    timestamps: true
});

labSampleTransferSchema.index({ hospitalId: 1, transferNumber: 1 }, { unique: true });
labSampleTransferSchema.index({ hospitalId: 1, status: 1 });
labSampleTransferSchema.index({ hospitalId: 1, createdAt: -1 });

const LabSampleTransfer = mongoose.model('LabSampleTransfer', labSampleTransferSchema);
module.exports = LabSampleTransfer;
