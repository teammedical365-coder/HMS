const mongoose = require('mongoose');

const pharmacyReturnSchema = new mongoose.Schema({
    originalOrderId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'PharmacyOrder', 
        required: true 
    },
    patientId: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', index: true },
    pharmacyId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    returnType: { 
        type: String, 
        enum: ['Refund', 'Exchange'], 
        required: true 
    },
    returnedItems: [{
        medicineName: String,
        quantity: Number,
        pricePerUnit: Number, // Estimated or actual selling price they originally paid
        refundAmount: Number
    }],
    exchangedItems: [{
        medicineId: { type: mongoose.Schema.Types.ObjectId, ref: 'Inventory' },
        medicineName: String,
        quantity: Number,
        pricePerUnit: Number,
        totalCost: Number
    }],
    netAmount: { 
        type: Number, 
        default: 0 
        // Negative = Refund given to patient
        // Positive = Extra collected from patient
    },
    returnReason: { type: String, default: '' },
    processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    refundAmount: { type: Number, default: 0 },
    status: { type: String, default: 'Completed' },
    paymentMode: { type: String, enum: ['CASH', 'ONLINE', 'WALLET'], default: 'CASH' }
}, { timestamps: true });

module.exports = mongoose.model('PharmacyReturn', pharmacyReturnSchema);
