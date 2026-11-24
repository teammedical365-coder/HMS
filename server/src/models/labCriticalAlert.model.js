const mongoose = require('mongoose');

/**
 * LabCriticalAlert Model — Phase 7 Internal Critical / Panic Value Alerts
 * Generates an internal clinical alert whenever an entered result crosses critical thresholds.
 * Tracks staff acknowledgement, escalation, and audit notes.
 */
const labCriticalAlertSchema = new mongoose.Schema({
    hospitalId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Hospital',
        required: true,
        index: true
    },
    resultId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'LabTestResult',
        required: true,
        index: true
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
    uhid: {
        type: String,
        default: ''
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
    sampleId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'LabSample',
        required: true
    },
    barcode: {
        type: String,
        required: true
    },
    testId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'LabTest',
        required: true
    },
    testCode: {
        type: String,
        default: ''
    },
    testName: {
        type: String,
        default: ''
    },
    department: {
        type: String,
        default: 'General Pathology',
        index: true
    },
    parameterId: {
        type: mongoose.Schema.Types.ObjectId,
        default: null
    },
    parameterName: {
        type: String,
        required: true
    },
    parameterCode: {
        type: String,
        default: ''
    },
    criticalValue: {
        type: mongoose.Schema.Types.Mixed,
        required: true
    },
    criticalThreshold: {
        type: { type: String, enum: ['LOW', 'HIGH', 'QUALITATIVE'], default: 'HIGH' },
        limit: { type: Number, default: null },
        unit: { type: String, default: '' }
    },
    alertStatus: {
        type: String,
        enum: ['PENDING', 'ACKNOWLEDGED', 'ESCALATED'],
        default: 'PENDING',
        index: true
    },
    detectedAt: {
        type: Date,
        default: Date.now,
        index: true
    },
    acknowledgedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    acknowledgedByName: {
        type: String,
        default: ''
    },
    acknowledgedAt: {
        type: Date,
        default: null
    },
    actionTaken: {
        type: String,
        default: ''
    },
    notes: {
        type: String,
        default: ''
    },
    escalatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    escalatedByName: {
        type: String,
        default: ''
    },
    escalatedAt: {
        type: Date,
        default: null
    }
}, {
    timestamps: true
});

labCriticalAlertSchema.index({ hospitalId: 1, alertStatus: 1, detectedAt: -1 });
labCriticalAlertSchema.index({ hospitalId: 1, orderId: 1 });
labCriticalAlertSchema.index({ hospitalId: 1, patientId: 1 });

const LabCriticalAlert = mongoose.model('LabCriticalAlert', labCriticalAlertSchema);
module.exports = LabCriticalAlert;
