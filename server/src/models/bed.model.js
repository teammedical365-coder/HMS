const mongoose = require('mongoose');

const bedSchema = new mongoose.Schema({
    hospitalId: { type: mongoose.Schema.Types.ObjectId, required: true },
    bedNumber: { type: String, required: true, trim: true },
    ward: { type: String, required: true, trim: true },
    bedType: { type: String, enum: ['General', 'ICU', 'Private', 'Semi-Private', 'Other'], default: 'General' },
    status: { type: String, enum: ['AVAILABLE', 'OCCUPIED', 'MAINTENANCE'], default: 'AVAILABLE' },
    currentPatient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    currentAdmission: { type: mongoose.Schema.Types.ObjectId, ref: 'Admission', default: null }
}, { timestamps: true });

// Prevent duplicate beds within the same hospital and ward
bedSchema.index({ hospitalId: 1, ward: 1, bedNumber: 1 }, { unique: true });

module.exports = mongoose.model('Bed', bedSchema);
