const mongoose = require('mongoose');

const vendorReturnSchema = new mongoose.Schema({
    hospitalId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Hospital',
        required: true,
        index: true
    },
    vendorName: {
        type: String,
        required: true,
        trim: true
    },
    invoiceOrBillNo: {
        type: String,
        default: '',
        trim: true
    },
    items: [{
        inventoryId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Inventory'
        },
        medicineName: { type: String, required: true },
        batchNumber: { type: String, default: '' },
        quantityReturned: { type: Number, required: true, min: 1 },
        unitPrice: { type: Number, required: true, min: 0 },
        reason: { 
            type: String, 
            enum: ['Damaged', 'Expired', 'Excess Stock', 'Other'],
            default: 'Other'
        }
    }],
    totalReturnAmount: {
        type: Number,
        default: 0
    },
    returnDate: {
        type: Date,
        default: Date.now
    },
    status: {
        type: String,
        default: 'Returned'
    }
}, { timestamps: true });

module.exports = mongoose.model('VendorReturn', vendorReturnSchema);
