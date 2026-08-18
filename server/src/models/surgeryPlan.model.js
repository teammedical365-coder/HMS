const mongoose = require('mongoose');

const surgeryPlanSchema = new mongoose.Schema({
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', required: true, index: true },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // The doctor creating the plan
    surgeonId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // Selected surgeon
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
    admissionRequired: { type: Boolean, default: false },
    admissionDate: { type: Date },
    preOpRequired: { type: Boolean, default: false },
    notes: { type: String },
    status: { type: String, enum: ['PLANNED', 'SCHEDULED', 'ADMITTED', 'PRE_OP', 'READY_FOR_OT', 'IN_OT', 'SURGERY_COMPLETED', 'POST_OP', 'COMPLETED', 'CANCELLED'], default: 'PLANNED' },
    actualStartTime: { type: Date },
    actualEndTime: { type: Date }
}, { timestamps: true });

module.exports = mongoose.model('SurgeryPlan', surgeryPlanSchema);
