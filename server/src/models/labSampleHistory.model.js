const mongoose = require('mongoose');

/**
 * LabSampleHistory Model — Phase 6 Immutable Sample Tracking & Status Audit
 */
const labSampleHistorySchema = new mongoose.Schema({
    hospitalId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Hospital',
        required: true,
        index: true
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
    performedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    performedByName: {
        type: String,
        default: ''
    },
    locationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'LabLocation',
        default: null
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

labSampleHistorySchema.index({ hospitalId: 1, sampleId: 1, timestamp: -1 });

const LabSampleHistory = mongoose.model('LabSampleHistory', labSampleHistorySchema);
module.exports = LabSampleHistory;
