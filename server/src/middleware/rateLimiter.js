const rateLimit = require('express-rate-limit');

// Login — 10 attempts per 15 minutes per IP
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many login attempts. Please try again after 15 minutes.' },
    skipSuccessfulRequests: true,
});

// Signup — 5 registrations per hour per IP (prevents account spam)
const signupLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many accounts created from this IP. Try again after an hour.' },
});

// OTP requests — 3 per hour per IP
const otpLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 3,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many OTP requests. Please try again after an hour.' },
});

// General API — 200 requests per 15 min per IP (DoS protection)
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many requests. Please slow down.' },
});

// Email OTP send — when OTP is enabled: 5 sends per 15 min; when disabled: acts as login so more generous
const emailOtpSendLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: process.env.AUTH_OTP_ENABLED === 'false' ? 20 : 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many login attempts. Please try again after 15 minutes.' },
    skipSuccessfulRequests: process.env.AUTH_OTP_ENABLED === 'false',
});

// Email OTP verify — 10 attempts per 15 min per IP
const emailOtpVerifyLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many verification attempts. Please try again after 15 minutes.' },
});

module.exports = { loginLimiter, signupLimiter, otpLimiter, generalLimiter, emailOtpSendLimiter, emailOtpVerifyLimiter };
