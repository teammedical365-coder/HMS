const mongoose = require('mongoose');

const visitSchema = new mongoose.Schema({
    visitNumber:   { type: Number, required: true },
    scheduledDate: { type: Date, required: true },
    scheduledTime: { type: String, default: '' },
    procedure:     { type: String, default: '' },
    amountPaid:    { type: Number, default: 0 },    // payment collected on this visit (optional)
    paymentMethod: { type: String, default: 'Cash' },
    status:        { type: String, enum: ['scheduled', 'completed', 'missed'], default: 'scheduled' },
    completedAt:   { type: Date },
    notes:         { type: String, default: '' },
    alertSent:     { type: Boolean, default: false },
}, { _id: true });

const treatmentPlanSchema = new mongoose.Schema({
    hospitalId:        { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', required: true, index: true },
    clinicPatientId:   { type: mongoose.Schema.Types.ObjectId, ref: 'ClinicPatient', required: true },
    createdBy:         { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title:             { type: String, required: true, trim: true },
    description:       { type: String, default: '' },
    totalDurationDays: { type: Number, default: 0 },
    visits:            [visitSchema],
    totalAmount:       { type: Number, required: true, default: 0 }, // set once at creation
    totalPaid:         { type: Number, default: 0 },                 // sum of all visit.amountPaid
    pendingBalance:    { type: Number, default: 0 },                 // totalAmount - totalPaid
    status:            { type: String, enum: ['active', 'completed', 'cancelled'], default: 'active', index: true },
}, { timestamps: true });

module.exports = mongoose.model('TreatmentPlan', treatmentPlanSchema);
