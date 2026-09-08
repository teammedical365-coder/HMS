const mongoose = require('mongoose');

const transferRecordSchema = new mongoose.Schema({
    fromWard: { type: String, required: true },
    fromBedNumber: { type: String, required: true },
    fromBedId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bed' },
    toWard: { type: String, required: true },
    toBedNumber: { type: String, required: true },
    toBedId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bed', required: true },
    transferDate: { type: Date, required: true },
    transferTime: { type: String, default: '' },
    ratePerDay: { type: Number, default: 0 },
    hourlyRate: { type: Number, default: 0 },
    durationHours: { type: Number, default: 0 },
    durationDays: { type: Number, default: 0 },
    durationText: { type: String, default: '' },
    segmentAmount: { type: Number, default: 0 },
    transferredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    notes: { type: String, default: '' }
}, { _id: true, timestamps: true });

const nurseAssignmentSchema = new mongoose.Schema({
    nurseId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    assignedAt: { type: Date, default: Date.now },
    assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    unassignedAt: { type: Date },
    unassignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    status: { type: String, enum: ['ACTIVE', 'UNASSIGNED'], default: 'ACTIVE' },
    shift: { type: String, default: 'All' },
    notes: { type: String, default: '' }
}, { _id: true, timestamps: true });

const dischargeMedicationSchema = new mongoose.Schema({
    medicineName: { type: String, required: true, trim: true },
    dosage: { type: String, default: '', trim: true },
    route: { type: String, default: 'Oral', trim: true },
    frequency: { type: String, default: 'OD', trim: true },
    duration: { type: String, default: '5 days', trim: true },
    instructions: { type: String, default: 'After meals', trim: true }
}, { _id: true });

const dischargeSummarySchema = new mongoose.Schema({
    diagnosis: { type: String, default: '', trim: true },
    admissionReason: { type: String, default: '', trim: true },
    hospitalCourse: { type: String, default: '', trim: true },
    proceduresSummary: { type: String, default: '', trim: true },
    keyInvestigationsSummary: { type: String, default: '', trim: true },
    treatmentSummary: { type: String, default: '', trim: true },
    conditionAtDischarge: {
        type: String,
        enum: ['STABLE', 'IMPROVED', 'RECOVERED', 'CRITICAL', 'TRANSFERRED', 'LAMA', 'EXPIRED'],
        default: 'STABLE'
    },
    dischargeMedications: [dischargeMedicationSchema],
    followUpInstructions: { type: String, default: '', trim: true },
    returnPrecautions: { type: String, default: '', trim: true },
    followUpDate: { type: Date },
    doctorSignedAt: { type: Date },
    doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    status: {
        type: String,
        enum: ['DRAFT', 'FINALIZED'],
        default: 'DRAFT'
    }
}, { _id: true, timestamps: true });

const admissionSchema = new mongoose.Schema({
    hospitalId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    appointmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment' },
    doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    admittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    admissionDate: { type: Date, default: Date.now },
    admissionTime: { type: String, default: '' },
    dischargeDate: Date,
    dischargeTime: { type: String, default: '' },
    status: { type: String, enum: ['Admitted', 'Discharged'], default: 'Admitted' },
    ward: { type: String, required: true },
    bedNumber: { type: String, required: true },
    bedId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bed', required: true },
    wardRatePerDay: { type: Number, default: 0 },
    wardHourlyRate: { type: Number, default: 0 },
    transferHistory: [transferRecordSchema],
    assignedNurses: [nurseAssignmentSchema],
    dischargeReadiness: {
        doctorDischargeOrdered: { type: Boolean, default: false },
        doctorDischargeDate: { type: Date },
        doctorDischargeDoctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        doctorDischargeNotes: { type: String, default: '' },
        nursingClearance: { type: Boolean, default: false },
        nursingClearedAt: { type: Date },
        nursingClearedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        nursingNotes: { type: String, default: '' },
        status: {
            type: String,
            enum: ['NOT_READY', 'DOCTOR_ORDERED', 'NURSING_CLEARED', 'READY_FOR_DISCHARGE'],
            default: 'NOT_READY'
        }
    },
    dischargeSummary: dischargeSummarySchema,
    selectedFacilities: [{
        facilityName: { type: String, required: true },
        pricePerDay: { type: Number, required: true },
        hourlyRate: { type: Number, default: 0 },
        days: { type: Number, default: 0 },
        hours: { type: Number, default: 0 },
        durationText: { type: String, default: '' },
        totalAmount: { type: Number, required: true }
    }],
    totalAmount: { type: Number, default: 0 },
    paymentStatus: { type: String, enum: ['Pending', 'Paid'], default: 'Pending' },
    splitPayments: [{
        method: { type: String },
        amount: { type: Number, default: 0 }
    }],
    notes: String,
}, { timestamps: true });

admissionSchema.index({ hospitalId: 1, status: 1 });
admissionSchema.index({ hospitalId: 1, 'assignedNurses.nurseId': 1, 'assignedNurses.status': 1 });

module.exports = mongoose.model('Admission', admissionSchema);
module.exports.admissionSchema = admissionSchema;
module.exports.nurseAssignmentSchema = nurseAssignmentSchema;
module.exports.dischargeSummarySchema = dischargeSummarySchema;
