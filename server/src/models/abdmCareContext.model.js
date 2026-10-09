'use strict';
const mongoose = require('mongoose');

const HI_TYPES = [
    'OPConsultation', 'Prescription', 'DiagnosticReport', 'DischargeSummary',
    'ImmunizationRecord', 'WellnessRecord', 'HealthDocumentRecord', 'Invoice',
];

// One care context = one clinical encounter/document you offer to link to a patient's ABHA.
const schema = new mongoose.Schema({
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', required: true, index: true },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    referenceNumber: { type: String, required: true },   // your ID, e.g. OPD-<appointmentId>
    display: { type: String, required: true },           // what the patient reads in their PHR app
    hiType: { type: String, enum: HI_TYPES, required: true },
    sourceModel: { type: String, default: null },        // e.g. 'Appointment', 'LabReport'
    sourceId: { type: String, default: null },
    visitDate: { type: Date, default: Date.now },
    status: { type: String, enum: ['CREATED', 'LINK_REQUESTED', 'LINKED', 'FAILED'], default: 'CREATED', index: true },
    abhaAddress: { type: String, default: null },
    linkedAt: { type: Date, default: null },   // used later to scope which records are shared
    lastRequestId: { type: String, default: null, index: true },
    error: { type: String, default: null },
}, { timestamps: true });

schema.index({ hospitalId: 1, referenceNumber: 1 }, { unique: true });

const Model = mongoose.models.AbdmCareContext || mongoose.model('AbdmCareContext', schema);
module.exports = Model;
module.exports.HI_TYPES = HI_TYPES;
