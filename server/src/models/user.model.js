const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: false, unique: true, sparse: true },
    password: { type: String, required: false },
    phone: { type: String, default: '' },

    // Dynamic role reference — points to a Role document in the DB
    // The only exception is 'administrator' which is a bootstrap string
    role: {
        type: mongoose.Schema.Types.Mixed, // ObjectId (normal) or String ('administrator')
        default: 'patient'
    },

    // Patient ID for clinical tracking
    patientId: { type: String, unique: true, sparse: true },

    // Static Demographics
    dob: String,
    gender: String,
    bloodGroup: String,
    address: String,
    city: String,

    // Identity Verification (KYC)
    aadhaarNumber: { type: String, unique: true, sparse: true, trim: true },
    isAadhaarVerified: { type: Boolean, default: false },

    services: [String],

    // Profile Image
    avatar: { type: String, default: null }
}, { timestamps: true });

userSchema.pre('save', async function (next) {
    if (!this.isModified('password')) return next();
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
});

userSchema.methods.comparePassword = async function (entered) {
    if (!this.password) return false;
    return await bcrypt.compare(entered, this.password);
};

module.exports = mongoose.model('User', userSchema);