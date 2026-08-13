const mongoose = require('mongoose');

const consumptionLogSchema = new mongoose.Schema({
    hospitalId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Hospital',
        index: true
    },
    medicineId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Inventory',
        required: true
    },
    quantity: {
        type: Number,
        required: true,
        min: 1
    },
    reason: {
        type: String,
        enum: [
            'Doctor/Staff Use', 
            'Hospital Emergency / First Aid', 
            'Sample / Promotional', 
            'Damaged / Expired Write-off'
        ],
        required: true
    },
    givenTo: {
        type: String,
        trim: true,
        default: ''
    },
    loggedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    date: {
        type: Date,
        default: Date.now
    }
}, { timestamps: true });

module.exports = mongoose.model('ConsumptionLog', consumptionLogSchema);
