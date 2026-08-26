const mongoose = require('mongoose');

/**
 * LoginOtp — stores hashed OTP for email-based login verification.
 * Auto-deleted after expiry via TTL index.
 * Separate from the patient-app SMS OTP flow (patientSession.model.js).
 */
const loginOtpSchema = new mongoose.Schema({
    userId:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    otpHash:      { type: String, required: true },           // bcrypt-hashed 6-digit OTP
    expiresAt:    { type: Date, required: true },             // 5 minutes from creation
    attempts:     { type: Number, default: 0 },               // max 5 invalid attempts
    lastResendAt: { type: Date, default: null },              // enforce 30s cooldown
    preAuthToken: { type: String, required: true },           // short-lived JWT tying this OTP flow
    loginType:    { type: String, enum: ['staff', 'admin', 'hospitaladmin', 'patient'], default: 'staff' },
    hospitalId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', default: null },
}, { timestamps: true });

// Only one active OTP per user at a time
loginOtpSchema.index({ userId: 1 });
// TTL: auto-delete expired OTP documents
loginOtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('LoginOtp', loginOtpSchema);
