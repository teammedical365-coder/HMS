const mongoose = require('mongoose');

/**
 * LabCounter Model
 * Provides atomic, thread-safe sequence numbers per tenant/hospital.
 * Used for UHID, Order Numbers, and Reception Daily Tokens.
 */
const labCounterSchema = new mongoose.Schema({
    hospitalId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Hospital',
        required: true,
        index: true
    },
    key: {
        type: String,
        required: true,
        trim: true
    },
    dateStr: {
        type: String,
        default: '' // e.g. '20261123' for daily sequences, or '' for lifetime sequences
    },
    seq: {
        type: Number,
        default: 0
    }
}, {
    timestamps: true
});

labCounterSchema.index({ hospitalId: 1, key: 1, dateStr: 1 }, { unique: true });

/**
 * Atomic sequence generator
 * Increments and returns the next sequence number without race conditions.
 */
labCounterSchema.statics.getNextSequence = async function(hospitalId, key, dateStr = '') {
    const doc = await this.findOneAndUpdate(
        { hospitalId, key, dateStr: String(dateStr) },
        { $inc: { seq: 1 } },
        { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    return doc.seq;
};

const LabCounter = mongoose.model('LabCounter', labCounterSchema);

module.exports = LabCounter;
