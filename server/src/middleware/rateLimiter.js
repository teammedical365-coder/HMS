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

// General API — generous limit per IP (DoS protection)
// In development the frontend makes many rapid calls (branding, auth-config, tenant-config, pings etc.)
// so we keep this high. Public health/config endpoints are skipped entirely.
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: process.env.NODE_ENV === 'production' ? 2500 : 5000,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many requests. Please slow down.' },
    // Skip rate-limiting for lightweight public config endpoints that the frontend polls frequently
    skip: (req) => {
        const skipPaths = [
            '/api/public/auth-config',
            '/api/public/branding',
            '/api/public/tenant-config',
        ];
        return skipPaths.some(p => req.originalUrl.startsWith(p));
    },
});

// Email OTP send — skip successful logins so legitimate users and test suites are not blocked
const emailOtpSendLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: process.env.NODE_ENV === 'production' && process.env.AUTH_OTP_ENABLED !== 'false' ? 25 : 150,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many login attempts. Please try again after 15 minutes.' },
    skipSuccessfulRequests: true,
});

// Email OTP verify — 10 attempts per 15 min per IP
const emailOtpVerifyLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many verification attempts. Please try again after 15 minutes.' },
});

// Password recovery — 5 attempts per 15 min per IP
const passwordRecoveryLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many password recovery attempts. Please try again after 15 minutes.' },
});

// Dedicated Public Configuration Limiter — 300 requests per 5 min per IP
// Protects /branding, /tenant-config, /auth-config against flood/scraping while allowing normal frontend polling
const publicConfigLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many configuration requests. Please slow down.' },
});

// Heavy AI Processing Limiter — 60 requests per 15 min per User/IP
const aiWalletLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => (req.user?.id || req.user?.userId ? String(req.user.id || req.user.userId) : req.ip),
    validate: { keyGeneratorIpFallback: false },
    message: { success: false, message: 'AI generation limit reached. Please wait a few moments.' },
});

// File Upload Limiter — 40 uploads per 10 min per User/IP
const uploadLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 40,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => (req.user?.id || req.user?.userId ? String(req.user.id || req.user.userId) : req.ip),
    validate: { keyGeneratorIpFallback: false },
    message: { success: false, message: 'Upload limit reached. Please wait a few moments before trying again.' },
});

// Global Search Limiter — 120 searches per 5 min per User/IP
const searchLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => (req.user?.id || req.user?.userId ? String(req.user.id || req.user.userId) : req.ip),
    validate: { keyGeneratorIpFallback: false },
    message: { success: false, message: 'Too many search queries. Please wait a moment.' },
});

// Pacific Demo Login Limiter — 30 demo logins per 15 min per IP
const pacificDemoLoginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: process.env.NODE_ENV === 'production' ? 30 : 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many demo login requests. Please wait a few minutes and try again.' },
});

// Pacific Demo Role Switch Limiter — 60 role switches per 15 min per session/IP
const pacificDemoSwitchLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: process.env.NODE_ENV === 'production' ? 60 : 200,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => (req.user?.id || req.user?.userId ? String(req.user.id || req.user.userId) : req.ip),
    validate: { keyGeneratorIpFallback: false },
    message: { success: false, message: 'Demo role switch rate limit reached. Please wait a few moments.' },
});

module.exports = { 
    loginLimiter, 
    signupLimiter, 
    otpLimiter, 
    generalLimiter, 
    emailOtpSendLimiter, 
    emailOtpVerifyLimiter, 
    passwordRecoveryLimiter,
    publicConfigLimiter,
    aiWalletLimiter,
    uploadLimiter,
    searchLimiter,
    pacificDemoLoginLimiter,
    pacificDemoSwitchLimiter
};
