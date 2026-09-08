const mongoose = require('mongoose');

const ipdLineSchema = new mongoose.Schema({
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', required: true, index: true },
    admissionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admission', required: true, index: true },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    lineType: {
        type: String,
        enum: ['IV_CANNULA', 'CENTRAL_LINE', 'PICC', 'MIDLINE', 'ARTERIAL_LINE', 'OTHER'],
        default: 'IV_CANNULA',
        index: true
    },
    site: {
        type: String,
        required: true,
        trim: true
        // e.g. Left Forearm, Right Hand Dorsum, Right Subclavian, Left Antecubital
    },
    gauge: {
        type: String,
        default: '',
        trim: true
        // e.g. 18G, 20G, 22G, 24G, 7Fr Triple Lumen
    },
    insertedAt: {
        type: Date,
        default: Date.now
    },
    insertedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    status: {
        type: String,
        enum: ['ACTIVE', 'REMOVED'],
        default: 'ACTIVE',
        index: true
    },
    removedAt: {
        type: Date
    },
    removedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    removalReason: {
        type: String,
        default: '',
        trim: true
    },
    notes: {
        type: String,
        default: '',
        trim: true
    }
}, {
    timestamps: true
});

// Compound indexes for active vs historical line lifecycles
ipdLineSchema.index({ hospitalId: 1, admissionId: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('IPDLine', ipdLineSchema);
module.exports.ipdLineSchema = ipdLineSchema;
