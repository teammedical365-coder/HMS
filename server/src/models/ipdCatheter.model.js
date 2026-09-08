const mongoose = require('mongoose');

const ipdCatheterSchema = new mongoose.Schema({
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', required: true, index: true },
    admissionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admission', required: true, index: true },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    catheterType: {
        type: String,
        enum: ['FOLEY', 'URINARY', 'SUPRAPUBIC', 'CONDOM', 'NEPHROSTOMY', 'OTHER'],
        default: 'FOLEY',
        index: true
    },
    size: {
        type: String,
        default: '',
        trim: true
        // e.g. 14 Fr, 16 Fr, 18 Fr, 3-way 20 Fr
    },
    site: {
        type: String,
        default: '',
        trim: true
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

// Compound indexes for active vs historical catheter lifecycles
ipdCatheterSchema.index({ hospitalId: 1, admissionId: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('IPDCatheter', ipdCatheterSchema);
module.exports.ipdCatheterSchema = ipdCatheterSchema;
