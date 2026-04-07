const mongoose = require('mongoose');

/**
 * PatientSession — OTP and JWT session management for the patient mobile app.
 * Stored on CLOUD. Local servers verify JWTs using shared JWT_SECRET.
 */
const patientSessionSchema = new mongoose.Schema({
    phone:     { type: String, required: true, index: true },
    clinicId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', default: null },

    // OTP flow
    otp:          { type: String, default: null },        // hashed OTP
    otpExpiresAt: { type: Date, default: null },
    otpAttempts:  { type: Number, default: 0 },           // max 3 attempts per OTP

    // After verification
    patientId:  { type: mongoose.Schema.Types.ObjectId, default: null }, // ClinicPatient._id on local server
    isVerified: { type: Boolean, default: false },

    // Active JWT sessions (for revocation)
    activeSessions: [{
        jti:       { type: String },   // JWT ID — unique per token
        issuedAt:  { type: Date },
        expiresAt: { type: Date },
        deviceInfo:{ type: String, default: '' },
    }],
}, { timestamps: true });

// TTL: auto-delete unverified OTP sessions after 10 minutes
patientSessionSchema.index({ otpExpiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('PatientSession', patientSessionSchema);
