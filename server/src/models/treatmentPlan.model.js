const mongoose = require('mongoose');

const visitSchema = new mongoose.Schema({
    visitNumber:    { type: Number, required: true },
    scheduledDate:  { type: Date, required: true },
    scheduledTime:  { type: String, default: '' },
    procedure:      { type: String, default: '' },      // what happens this visit
    amountDue:      { type: Number, default: 0 },       // base fee for this visit
    carryForward:   { type: Number, default: 0 },       // unpaid balance from previous visit
    totalDue:       { type: Number, default: 0 },       // amountDue + carryForward
    amountPaid:     { type: Number, default: 0 },       // collected this visit
    balance:        { type: Number, default: 0 },       // totalDue - amountPaid (carries to next)
    status:         { type: String, enum: ['scheduled', 'completed', 'missed'], default: 'scheduled' },
    completedAt:    { type: Date },
    notes:          { type: String, default: '' },
    paymentMethod:  { type: String, default: 'Cash' },
    alertSent:      { type: Boolean, default: false },  // daily alert fired flag
}, { _id: true });

const treatmentPlanSchema = new mongoose.Schema({
    hospitalId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', required: true, index: true },
    clinicPatientId:  { type: mongoose.Schema.Types.ObjectId, ref: 'ClinicPatient', required: true },
    createdBy:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title:            { type: String, required: true, trim: true },
    description:      { type: String, default: '' },
    totalDurationDays:{ type: Number, default: 0 },
    visits:           [visitSchema],
    pendingBalance:   { type: Number, default: 0 },  // cumulative unpaid across all visits
    totalAmount:      { type: Number, default: 0 },  // sum of all visit amountDue
    totalPaid:        { type: Number, default: 0 },
    status:           { type: String, enum: ['active', 'completed', 'cancelled'], default: 'active', index: true },
}, { timestamps: true });

module.exports = mongoose.model('TreatmentPlan', treatmentPlanSchema);
