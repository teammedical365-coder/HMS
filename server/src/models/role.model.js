const mongoose = require('mongoose');

const navLinkSchema = new mongoose.Schema({
    label: { type: String, required: true },
    path: { type: String, required: true }
}, { _id: false });

const roleSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
        // NOTE: Not globally unique — name+hospitalId combination is unique
        // Central admin roles have hospitalId = null
    },
    description: {
        type: String,
        default: ''
    },
    // Hospital scoping: null = central/global role, ObjectId = hospital-specific role
    hospitalId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Hospital',
        default: null,
        index: true
    },
    // Dynamic permissions — no enum restriction, admin can define any permission key
    permissions: [{
        type: String,
        trim: true
    }],
    // Default dashboard path for users with this role
    dashboardPath: {
        type: String,
        default: '/'
    },
    // Navigation links shown in the navbar for this role
    navLinks: [navLinkSchema],
    // System roles (seeded defaults) — can be copied per-hospital but not mutated globally
    isSystemRole: {
        type: Boolean,
        default: false
    }
}, { timestamps: true });

// Compound index: name must be unique per hospital (null = global)
roleSchema.index({ name: 1, hospitalId: 1 }, { unique: true });

module.exports = mongoose.model('Role', roleSchema);