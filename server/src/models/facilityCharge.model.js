const mongoose = require('mongoose');

const facilityChargeSchema = new mongoose.Schema({
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', required: true },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    facilityName: { type: String, required: true },
    pricePerDay: { type: Number, required: true },
    days: { type: Number, required: true },
    totalAmount: { type: Number, required: true },
    paymentStatus: {
        type: String,
        enum: ['Pending', 'Paid'],
        default: 'Pending'
    },
    splitPayments: [{
        method: { type: String },
        amount: { type: Number, default: 0 }
    }],
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    collectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

module.exports = mongoose.model('FacilityCharge', facilityChargeSchema);
