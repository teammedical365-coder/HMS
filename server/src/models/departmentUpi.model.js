const mongoose = require('mongoose');

const departmentUpiSchema = new mongoose.Schema({
    hospitalId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Hospital',
        required: true,
        index: true
    },
    // Linked staff member — must be an existing active user
    staffUserId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    // Denormalized role name for quick lookups (e.g. "Reception", "Billing", "Pharmacy")
    staffRoleName: {
        type: String,
        required: true,
        trim: true
    },
    // The actual UPI address
    upiId: {
        type: String,
        required: true,
        trim: true
    },
    // Display label (e.g. "Reception Counter", "Pharmacy UPI")
    label: {
        type: String,
        required: true,
        trim: true
    },
    // Active/Inactive toggle — inactive UPIs are hidden from modules
    isActive: {
        type: Boolean,
        default: true
    },
    // Audit: who created this record
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    }
}, { timestamps: true });

// One UPI per staff member per hospital
departmentUpiSchema.index({ hospitalId: 1, staffUserId: 1 }, { unique: true });

// Prevent duplicate UPI IDs within the same hospital
departmentUpiSchema.index({ hospitalId: 1, upiId: 1 }, { unique: true });

// Fast lookup by role name within a hospital
departmentUpiSchema.index({ hospitalId: 1, staffRoleName: 1 });

module.exports = mongoose.model('DepartmentUpi', departmentUpiSchema);
