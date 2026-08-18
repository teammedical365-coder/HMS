const mongoose = require('mongoose');

const referralSchema = new mongoose.Schema({
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', required: true, index: true },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    appointmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment' },
    referringDoctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    referredToDoctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    reason: { type: String, required: true },
    notes: { type: String },
    referralDate: { type: Date, default: Date.now },
    status: {
        type: String,
        enum: ['REFERRED', 'ACCEPTED', 'REJECTED', 'NOT_REQUIRED', 'SURGERY_PLANNED'],
        default: 'REFERRED'
    },
    surgeryPlanId: { type: mongoose.Schema.Types.ObjectId, ref: 'SurgeryPlan' },
    reviewNotes: { type: String },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

referralSchema.index({ referredToDoctorId: 1, hospitalId: 1 });
referralSchema.index({ referringDoctorId: 1, hospitalId: 1 });

module.exports = mongoose.model('Referral', referralSchema);
