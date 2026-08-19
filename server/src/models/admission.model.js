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

const admissionSchema = new mongoose.Schema({
    hospitalId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    appointmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment' },
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

module.exports = mongoose.model('Admission', admissionSchema);
