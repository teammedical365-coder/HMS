const mongoose = require('mongoose');

const pharmacyOrderSchema = new mongoose.Schema({
    appointmentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Appointment',
        required: true
    },
    patientId: { type: String, required: true },
    userId: {
        type: mongoose.Schema.Types.Mixed,
        ref: 'User',
        required: true
    },
    doctorId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    hospitalId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Hospital',
        index: true
    },
    items: [{
        medicineName: String,
        frequency: String,
        duration: String,
        price: { type: Number, default: 0 },
        purchased: { type: Boolean, default: false }
    }],
    paymentStatus: {
        type: String,
        enum: ['Pending', 'Paid', 'Failed', 'Refunded'],
        default: 'Pending'
    },
    splitPayments: [{
        method: { type: String },
        amount: { type: Number, default: 0 }
    }],
    totalAmount: {
        type: Number,
        default: 0
    },
    totalCost: {
        type: Number,
        default: 0
    },
    orderStatus: {
        type: String,
        enum: ['Upcoming', 'Completed', 'Cancelled'],
        default: 'Upcoming'
    }
}, { timestamps: true });

module.exports = mongoose.model('PharmacyOrder', pharmacyOrderSchema); //sdf//