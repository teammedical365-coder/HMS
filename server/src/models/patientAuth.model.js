const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const patientAuthSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true, minlength: 2 },
    email: { type: String, required: true, lowercase: true, trim: true, match: /^\S+@\S+\.\S+$/ },
    mobile: { type: String, required: true, trim: true, match: /^\d{10}$/ },
    age: { type: Number, required: true, min: 1 },
    aadhaarNumber: { type: String, required: true, match: /^\d{12}$/ },
    password: { type: String, required: true },
    
    // Multi-tenant context (must belong to a specific hospital)
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', required: true },
    
    status: { type: String, enum: ['Active', 'Suspended', 'Unverified'], default: 'Active' },
    emailVerified: { type: Boolean, default: false },
    mobileVerified: { type: Boolean, default: false },
    
    // Future expansion for associating with a specific MRN/Patient Profile once registered clinically
    linkedPatientProfileId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', default: null }
}, { timestamps: true });

// Ensure email and mobile are unique strictly PER hospital
patientAuthSchema.index({ email: 1, hospitalId: 1 }, { unique: true });
patientAuthSchema.index({ mobile: 1, hospitalId: 1 }, { unique: true });

// Hash password before save
patientAuthSchema.pre('save', async function (next) {
    if (!this.isModified('password')) return next();
    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (err) {
        next(err);
    }
});

// Compare password method
patientAuthSchema.methods.comparePassword = async function (enteredPassword) {
    if (!this.password) return false;
    return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('PatientAuth', patientAuthSchema);
