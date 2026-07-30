const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
    amount: { type: Number, required: true },
    date: { type: Date, required: true },
    method: { type: String, default: 'Cash' },
    upiId: { type: String, default: '' },
    upiRef: { type: String, default: '' },
    notes: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now }
}, { _id: true });

const visitSchema = new mongoose.Schema({
    visitNumber:   { type: Number, required: true },
    scheduledDate: { type: Date, required: true },
    scheduledTime: { type: String, default: '' },
    procedure:     { type: String, default: '' },
    amountPaid:    { type: Number, default: 0 },    // cumulative total of payments collected on this visit
    paymentMethod: { type: String, default: 'Cash' }, // keeping for backward compat / latest method
    upiId:         { type: String, default: '' },
    upiRef:        { type: String, default: '' },
    paymentHistory: [paymentSchema],
    status:        { type: String, enum: ['scheduled', 'completed', 'missed', 'rescheduled', 'due'], default: 'scheduled' },
    completedAt:   { type: Date },
    notes:         { type: String, default: '' },
    paidAt:        { type: Date },                    // when latest payment was recorded
    alertSent:     { type: Boolean, default: false },
    rescheduledToDate: { type: Date },
    rescheduledToTime: { type: String, default: '' },
    originalScheduledDate: { type: Date },
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
