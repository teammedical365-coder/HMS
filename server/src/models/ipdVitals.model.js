const mongoose = require('mongoose');

const ipdVitalsSchema = new mongoose.Schema({
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', required: true, index: true },
    admissionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admission', required: true, index: true },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    recordedAt: { type: Date, default: Date.now, index: true },

    // Clinical Vitals (Time-Series append-only)
    systolicBP: { type: Number },
    diastolicBP: { type: Number },
    pulse: { type: Number },
    temperature: { type: Number }, // in °F or °C
    spo2: { type: Number },        // percentage 0-100
    respiratoryRate: { type: Number },
    painScore: { type: Number, min: 0, max: 10 },

    notes: { type: String, default: '', trim: true }
}, { timestamps: true });

// Compound indexes for time-series history retrieval
ipdVitalsSchema.index({ hospitalId: 1, admissionId: 1, recordedAt: -1 });

module.exports = mongoose.model('IPDVitals', ipdVitalsSchema);
module.exports.ipdVitalsSchema = ipdVitalsSchema;
