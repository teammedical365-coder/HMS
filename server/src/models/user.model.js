const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Name is required']
    },
    email: {
        type: String,
        required: [true, 'Email is required'],
        unique: true,
        lowercase: true,
        trim: true
    },
    password: {
        type: String,
        required: [true, 'Password is required']
    },
    phone: {
        type: String,
        default: '',
        unique: true, // Crucial for identifying returning patients
        sparse: true  // Allows multiple users (like admins) to have empty phones if needed
    },

    // --- NEW DYNAMIC RBAC SYSTEM ---
    // Instead of a single string, we now link to the dynamic Role model
    roles: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Role'
    }],

    // Allow per-user permission overrides (e.g., giving Nurse Priya extra access)
    customPermissions: [{
        permission: String,
        granted: Boolean // true = extra access, false = restricted access
    }],

    // --- LEGACY FIELD (Kept for safety, but primary logic moves to 'roles') ---
    role: {
        type: String,
        default: 'user'
    },

    // --- PATIENT IDENTIFIERS ---
    patientId: {
        type: String,
        default: '',
        unique: true,
        sparse: true
    },

    // --- STATIC DEMOGRAPHICS ---
    // These stay in User profile because they don't change often.
    // Dynamic health data (BP, Weight, Symptoms) has moved to the 'ClinicalVisit' model.
    dob: { type: String, default: '' },
    gender: { type: String, default: '' },
    bloodGroup: { type: String, default: '' },
    address: { type: String, default: '' },
    city: { type: String, default: '' },

    services: [{
        type: String
    }]
}, {
    timestamps: true
});

// Encrypt password before saving
userSchema.pre('save', async function (next) {
    if (!this.isModified('password')) {
        next();
    }
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
});

// Match password
userSchema.methods.comparePassword = async function (enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

const User = mongoose.model('User', userSchema);

module.exports = User;