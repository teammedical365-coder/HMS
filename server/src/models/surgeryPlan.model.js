const mongoose = require('mongoose');

const surgeryPlanSchema = new mongoose.Schema({
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', required: true, index: true },
    planId: { type: String, index: true }, // e.g. SP-2026-0001
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // The doctor creating the plan
    surgeonId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true }, // Primary operating surgeon
    assistantSurgeonIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // Surgical assistant doctors
    appointmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment' },
    referralId: { type: mongoose.Schema.Types.ObjectId, ref: 'Referral' },
    referringDoctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    surgery: { type: String, required: true },
    diagnosis: { type: String },
    preferredDate: { type: Date, required: true },
    preferredTime: { type: String, required: true },
    otRoomId: { type: mongoose.Schema.Types.ObjectId, ref: 'OTRoom' },
    surgeryDate: { type: Date },
    startTime: { type: String },
    endTime: { type: String },
    priority: { type: String, enum: ['Normal', 'High', 'Emergency'], default: 'Normal' },
    admissionRequired: { type: Boolean, default: false },
    admissionDate: { type: Date },
    preOpRequired: { type: Boolean, default: false },
    notes: { type: String },
    status: { 
        type: String, 
        enum: ['PLANNED', 'SCHEDULED', 'ADMITTED', 'PRE_OP', 'READY_FOR_OT', 'IN_OT', 'SURGERY_COMPLETED', 'POST_OP', 'COMPLETED', 'CANCELLED'], 
        default: 'PLANNED',
        index: true
    },
    // Financial & billing integration
    surgeryCost: { type: Number, default: 0 },
    paidAmount: { type: Number, default: 0 },
    paymentStatus: {
        type: String,
        enum: ['UNPAID', 'PARTIALLY PAID', 'PAID'],
        default: 'UNPAID',
        index: true
    },
    splitPayments: [{
        method: { type: String },
        amount: { type: Number, default: 0 },
        date: { type: Date, default: Date.now }
    }],
    facilityChargeId: { type: mongoose.Schema.Types.ObjectId, ref: 'FacilityCharge' },
    actualStartTime: { type: Date },
    actualEndTime: { type: Date },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

surgeryPlanSchema.index({ hospitalId: 1, status: 1 });
surgeryPlanSchema.index({ surgeonId: 1, hospitalId: 1 });
surgeryPlanSchema.index({ patientId: 1, hospitalId: 1 });
surgeryPlanSchema.index({ assistantSurgeonIds: 1 });

module.exports = mongoose.model('SurgeryPlan', surgeryPlanSchema);

