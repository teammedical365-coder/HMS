const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    name: { type: String, required: true, minlength: 2 },
    email: { type: String, required: true, lowercase: true, trim: true, match: /^\S+@\S+\.\S+$/ },
    password: { type: String, required: false },
    phone: { type: String, required: true, match: /^\d{10}$/ },

    // Dynamic role reference — points to a Role document in the DB
    // Special string roles: 'centraladmin' (top-level), 'hospitaladmin' (hospital-level), 'superadmin' (legacy)
    role: {
        type: mongoose.Schema.Types.Mixed, // ObjectId (normal) or String ('centraladmin'/'hospitaladmin'/'superadmin')
        default: 'patient'
    },

    // Hospital reference for multi-tenant support
    // centraladmin: null (manages all hospitals)
    // hospitaladmin: points to their hospital
    // staff: points to the hospital they belong to
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', default: null },

    // Patient ID for clinical tracking
    patientId: { type: String, unique: true, sparse: true },
    uhid: { type: String, sparse: true },
    patientStatus: { type: String, default: 'Active' },
    branch: { type: String },

    // Static Demographics
    dob: String,
    gender: String,
    bloodGroup: String,
    maritalStatus: String,
    nationality: String,
    occupation: String,
    
    // Address
    address: String,
    houseNo: String,
    buildingName: String,
    street: String,
    area: String,
    landmark: String,
    city: String,
    state: String,
    country: { type: String, default: 'India' },
    zipCode: String,

    // Contact
    alternateMobile: String,
    whatsappNumber: String,

    // Emergency Contact
    emergencyContact: {
        name: String,
        relation: String,
        mobile: String
    },

    // Identity Verification (KYC)
    aadhaarNumber: { 
        type: String, 
        match: /^\d{12}$/, 
        unique: true, 
        sparse: true, 
        trim: true 
    },
    panNumber: String,
    isAadhaarVerified: { type: Boolean, default: false },
    age: { 
        type: Number, 
        min: 1,
        max: 999,
        validate: {
            validator: Number.isInteger,
            message: '{VALUE} is not an integer value'
        }
    },

    // Clinical Profile
    patientType: { type: String, enum: ['Primary', 'Partner'], default: 'Primary' },
    partner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    ivfDetails: {
        coupleId: String,
        partnerName: String,
        partnerMrn: String
    },
    fertilityProfile: { type: mongoose.Schema.Types.Mixed, default: {} },

    // Hospital Details
    department: { type: String },
    primaryDoctor: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor' },
    sourceType: { type: String },
    sourceDetails: { type: String },
    registrationType: { type: String, default: 'Self' },

    services: [String],
    departments: [{ type: String }],

    // Profile Image
    avatar: { type: String, default: null },

    // MFA (TOTP-based, optional per staff account)
    mfaEnabled: { type: Boolean, default: false },
    mfaSecret:  { type: String, default: null, select: false },

    // Increment to invalidate all outstanding tokens for this user (revoke-all-sessions)
    tokenVersion: { type: Number, default: 0 },
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