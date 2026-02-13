const mongoose = require('mongoose');

const navLinkSchema = new mongoose.Schema({
    label: { type: String, required: true },
    path: { type: String, required: true }
}, { _id: false });

const roleSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    description: {
        type: String,
        default: ''
    },
    // Dynamic permissions — no enum restriction, admin can define any permission key
    permissions: [{
        type: String,
        trim: true
    }],
    // Default dashboard path for users with this role (e.g., '/admin', '/doctor/patients')
    dashboardPath: {
        type: String,
        default: '/'
    },
    // Navigation links shown in the navbar for this role
    navLinks: [navLinkSchema],
    // System roles cannot be deleted (e.g., 'administrator')
    isSystemRole: {
        type: Boolean,
        default: false
    }
}, { timestamps: true });

module.exports = mongoose.model('Role', roleSchema);