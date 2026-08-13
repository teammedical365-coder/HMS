const mongoose = require('mongoose');

const departmentStockSchema = new mongoose.Schema({
    hospitalId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Hospital',
        index: true
    },
    departmentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Department',
        required: true
    },
    medicineId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Inventory',
        required: true
    },
    quantity: {
        type: Number,
        default: 0
    }
}, { timestamps: true });

// Prevent duplicate stock entries for the same medicine in the same department
departmentStockSchema.index({ hospitalId: 1, departmentId: 1, medicineId: 1 }, { unique: true });

module.exports = mongoose.model('DepartmentStock', departmentStockSchema);
