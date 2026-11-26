const mongoose = require('mongoose');

const ipdWristbandSchema = new mongoose.Schema({
    hospitalId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Hospital',
        required: true,
        index: true
    },
    admissionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Admission',
        required: true
    },
    patientId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    wristbandCode: {
        type: String,
        required: true,
        trim: true
    },
    ipdNumber: {
        type: String,
        required: true,
        trim: true
    },
    // Opaque internal clinical identifier for authenticated scanner lookup (contains zero public URLs or PII)
    barcodePayload: {
        type: String,
        required: true,
        trim: true
    },
    patientSnapshot: {
        fullName: { type: String, required: true, trim: true },
        mrn: { type: String, default: '', trim: true },
        age: { type: String, default: '' },
        gender: { type: String, default: '' },
        phone: { type: String, default: '' }
    },
    admissionSnapshot: {
        ipdNumber: { type: String, default: '' },
        ward: { type: String, default: '' },
        bedNumber: { type: String, default: '' },
        admissionDate: { type: Date },
        admissionTime: { type: String, default: '' },
        attendingDoctor: { type: String, default: '' }
    },
    hospitalSnapshot: {
        name: { type: String, default: 'Medical 365' },
        logoUrl: { type: String, default: '' }
    },
    status: {
        type: String,
        enum: ['ACTIVE', 'DISCHARGED'],
        default: 'ACTIVE'
    },
    generatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    generatedAt: {
        type: Date,
        default: Date.now
    },
    printCount: {
        type: Number,
        default: 0
    },
    lastPrintedAt: {
        type: Date,
        default: null
    },
    lastPrintedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    }
}, { timestamps: true });

// Strictly ONE wristband per IPD admission within a hospital tenant
ipdWristbandSchema.index({ hospitalId: 1, admissionId: 1 }, { unique: true });
ipdWristbandSchema.index({ hospitalId: 1, wristbandCode: 1 }, { unique: true });
ipdWristbandSchema.index({ hospitalId: 1, ipdNumber: 1 });

const IPDWristband = mongoose.model('IPDWristband', ipdWristbandSchema);
module.exports = IPDWristband;
module.exports.ipdWristbandSchema = ipdWristbandSchema;
