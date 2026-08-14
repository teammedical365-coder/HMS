const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const UAParser = require('ua-parser-js');

const User = require('../models/user.model');
const Role = require('../models/role.model');
const Hospital = require('../models/hospital.model');
const LoginOtp = require('../models/loginOtp.model');
const Session = require('../models/session.model');
const TokenBlacklist = require('../models/tokenBlacklist.model');

const { JWT_SECRET, JWT_EXPIRES_IN } = require('../config/jwt');
const { emailOtpSendLimiter, emailOtpVerifyLimiter } = require('../middleware/rateLimiter');
const { sendLoginOtpEmail } = require('../services/email.service');

const OTP_EXPIRY_MINUTES = 5;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_COOLDOWN_SECONDS = 30;

/**
 * ⚠️  OTP Feature Flag (environment-controlled)
 * When false, the /send endpoint bypasses OTP generation/email and proceeds
 * directly to session check → JWT. All OTP code remains intact for production.
 *
 * OTP is temporarily disabled for development. Enable AUTH_OTP_ENABLED=true before production deployment.
 */
const AUTH_OTP_ENABLED = process.env.AUTH_OTP_ENABLED !== 'false';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Generate a cryptographically secure 6-digit OTP */
function generateSecureOTP() {
    return String(crypto.randomInt(100000, 999999));
}

/** Parse User-Agent header into browser and OS strings */
function parseUserAgent(uaString) {
    const parser = new UAParser(uaString || '');
    const browser = parser.getBrowser();
    const os = parser.getOS();
    return {
        browser: browser.name ? `${browser.name} ${browser.version || ''}`.trim() : 'Unknown',
        os: os.name ? `${os.name} ${os.version || ''}`.trim() : 'Unknown',
    };
}

/** Build user response object with full role data (reused across endpoints) */
async function buildLoginUserData(user, roleData) {
    let clinicType = null;
    let subscriptionPlan = null;
    if (user.hospitalId) {
        try {
            const hosp = await Hospital.findById(user.hospitalId).select('clinicType subscriptionPlan');
            clinicType = hosp?.clinicType || 'hospital';
            subscriptionPlan = hosp?.subscriptionPlan || 'none';
        } catch (_) {}
    }

    return {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: roleData.name,
        roleId: String(user.role),
        patientId: user.patientId || null,
        hospitalId: user.hospitalId ? String(user.hospitalId) : null,
        clinicType,
        subscriptionPlan,
        permissions: roleData.permissions || [],
        dashboardPath: roleData.dashboardPath || '/',
        navLinks: roleData.navLinks || [],
    };
}

/** Resolve role data for a user (handles special roles + ObjectId + legacy string) */
async function resolveRoleData(user) {
    const specialRoles = ['superadmin', 'centraladmin', 'hospitaladmin'];

    if (specialRoles.includes(user.role)) {
        const isCentral = user.role === 'centraladmin' || user.role === 'superadmin';
        return {
            name: user.role,
            permissions: isCentral ? ['*'] : ['admin_manage_roles', 'admin_view_stats'],
            dashboardPath: isCentral ? '/supremeadmin' : '/hospitaladmin',
            navLinks: [],
            isSystemRole: true,
        };
    }

    let roleData = null;
    if (mongoose.Types.ObjectId.isValid(user.role)) {
        roleData = await Role.findById(user.role);
    }
    if (!roleData && user.role) {
        const query = { name: { $regex: new RegExp(`^${user.role}$`, 'i') } };
        if (user.hospitalId) query.hospitalId = user.hospitalId;
        roleData = await Role.findOne(query);
        if (!roleData && user.hospitalId) {
            roleData = await Role.findOne({
                hospitalId: null,
                name: { $regex: new RegExp(`^${user.role}$`, 'i') },
            });
        }
    }
    return roleData;
}

/** Create a session and JWT for a verified user */
async function createSessionAndToken(user, roleData, req) {
    const sessionId = uuidv4();
    const jti = uuidv4();
    const { browser, os } = parseUserAgent(req.headers['user-agent']);
    const ipAddress = req.ip || req.connection?.remoteAddress || '';

    // Create session record
    await Session.create({
        userId: user._id,
        sessionId,
        jti,
        browser,
        os,
        ipAddress,
        loginTime: new Date(),
        lastActive: new Date(),
        isActive: true,
    });

    // Generate JWT with sessionId
    const token = jwt.sign(
        {
            jti,
            userId: user._id,
            email: user.email,
            roleId: String(user.role),
            hospitalId: user.hospitalId ? String(user.hospitalId) : null,
            sessionId,
            tv: user.tokenVersion ?? 0,
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
    );

    const userData = await buildLoginUserData(user, roleData);
    return { token, userData, sessionId };
}

/**
 * Determine if a user belongs to Super Admin / Central Admin role
 */
function isCentralAdminRole(user, roleData) {
    if (!user) return false;
    if (user.role === 'superadmin' || user.role === 'centraladmin') return true;
    const roleName = roleData?.name ? roleData.name.toLowerCase() : (typeof user.role === 'string' ? user.role.toLowerCase() : '');
    return ['superadmin', 'centraladmin', 'super admin', 'central admin'].includes(roleName);
}

/**
 * Get maximum allowed active sessions for a user based on their role:
 * - Super Admin & Central Admin: 2 devices
 * - All other roles (Hospital Admin, Doctor, Receptionist, Staff, etc.): 1 device
 */
function getMaxAllowedSessions(user, roleData) {
    return isCentralAdminRole(user, roleData) ? 2 : 1;
}

/** Invalidate all active sessions for a user (blacklist JWTs + deactivate sessions) */
async function invalidateUserSessions(userId) {
    const activeSessions = await Session.find({ userId, isActive: true });
    const now = new Date();

    for (const session of activeSessions) {
        // Blacklist the JWT
        if (session.jti) {
            try {
                // Decode the token to get expiry — use a generous future date if not decodable
                await TokenBlacklist.create({
                    jti: session.jti,
                    expireAt: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000), // 8 days
                });
            } catch (e) {
                // Ignore duplicate key errors (already blacklisted)
                if (e.code !== 11000) console.error('[session] Error blacklisting JTI:', e.message);
            }
        }

        // Deactivate the session
        session.isActive = false;
        session.logoutTime = now;
        await session.save();
    }
}

/**
 * Invalidate oldest active sessions for a user so that at most `keepCount` active sessions remain.
 * Used when a user exceeds their allowed session limit and force-logins from a new device.
 */
async function invalidateOldestSessions(userId, keepCount = 0) {
    const activeSessions = await Session.find({ userId, isActive: true }).sort({ lastActive: -1 }); // newest first
    const now = new Date();

    const sessionsToDeactivate = activeSessions.slice(keepCount);

    for (const session of sessionsToDeactivate) {
        if (session.jti) {
            try {
                await TokenBlacklist.create({
                    jti: session.jti,
                    expireAt: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000), // 8 days
                });
            } catch (e) {
                if (e.code !== 11000) console.error('[session] Error blacklisting JTI:', e.message);
            }
        }
        session.isActive = false;
        session.logoutTime = now;
        await session.save();
    }
}


// ══════════════════════════════════════════════════════════════════════════════
// POST /api/auth/otp/send
// Validate credentials → generate OTP → hash → store → email
// Returns { preAuthToken, email (masked) }
// ══════════════════════════════════════════════════════════════════════════════
router.post('/send', emailOtpSendLimiter, async (req, res) => {
    try {
        const { email, password, hospitalId, loginType } = req.body;

        if (!email || !password) {
            return res.status(400).json({ success: false, message: 'Email and password are required' });
        }

        const normalizedEmail = email.toLowerCase().trim();
        
        let user = null;
        if (hospitalId) {
            // Priority 1: Find user strictly for this hospital
            user = await User.findOne({ email: normalizedEmail, hospitalId });
            // Priority 2: If not found, maybe a global admin is trying to log in
            if (!user) {
                user = await User.findOne({ email: normalizedEmail, role: { $in: ['superadmin', 'centraladmin'] } });
            }
        }
        
        // Priority 3: Generic fallback
        if (!user) {
            user = await User.findOne({ email: normalizedEmail });
        }

        if (!user) {
            return res.status(401).json({ success: false, message: 'Invalid email or password' });
        }

        // ── Login-type–specific validation ────────────────────────────────────
        const effectiveLoginType = loginType || 'staff';
        let roleData = null;

        if (effectiveLoginType === 'admin') {
            // Central Admin login — only superadmin/centraladmin/admin allowed
            let roleDoc = null;
            if (mongoose.Types.ObjectId.isValid(user.role)) {
                roleDoc = await Role.findById(user.role);
            }
            let roleName = null;
            if (roleDoc && typeof roleDoc.name === 'string') {
                roleName = roleDoc.name.toLowerCase();
            } else if (typeof user.role === 'string' && user.role) {
                roleName = user.role.toLowerCase();
            }

            if (roleName !== 'superadmin' && roleName !== 'centraladmin' && roleName !== 'admin') {
                return res.status(403).json({ success: false, message: 'Access denied. Central Admin only.' });
            }

            roleData = {
                name: roleName,
                permissions: ['*'],
                dashboardPath: '/supremeadmin',
                navLinks: [],
            };

        } else if (effectiveLoginType === 'hospitaladmin') {
            // Hospital Admin login — only hospitaladmin allowed
            const userRole = typeof user.role === 'string' ? user.role : null;
            if (userRole !== 'hospitaladmin') {
                return res.status(403).json({ success: false, message: 'This login is for Hospital Admins only.' });
            }
            if (!user.hospitalId) {
                return res.status(403).json({ success: false, message: 'This account is not linked to any hospital. Contact your Central Admin.' });
            }
            const hospital = await Hospital.findById(user.hospitalId);
            if (!hospital) {
                return res.status(403).json({ success: false, message: 'Linked hospital not found. Contact your Central Admin.' });
            }
            if (!hospital.isActive) {
                return res.status(403).json({ success: false, message: 'Hospital account is inactive. Contact your Central Admin.' });
            }

            roleData = {
                name: 'hospitaladmin',
                permissions: ['admin_manage_roles', 'admin_view_stats'],
                dashboardPath: '/hospitaladmin',
                navLinks: [],
            };

        } else {
            // Staff login (general auth.routes /login flow)
            // Block central admins from using the staff portal
            if (user.role === 'superadmin' || user.role === 'centraladmin') {
                return res.status(401).json({ success: false, message: 'Invalid email or password' });
            }

            if (!user.role) {
                return res.status(403).json({ success: false, message: 'No role assigned. Contact admin.' });
            }

            roleData = await resolveRoleData(user);
            if (!roleData) {
                return res.status(403).json({ success: false, message: 'Your assigned role no longer exists. Contact admin.' });
            }

            if (roleData.name && ['superadmin', 'centraladmin'].includes(roleData.name.toLowerCase())) {
                return res.status(401).json({ success: false, message: 'Invalid email or password' });
            }

            // Hospital row-level security for staff login
            const globalAdminRoles = ['superadmin', 'centraladmin'];
            const userRoleStr = roleData.name ? roleData.name.toLowerCase() : '';
            const isGlobalAdmin = globalAdminRoles.includes(userRoleStr);

            if (!isGlobalAdmin) {
                if (hospitalId) {
                    if (!user.hospitalId || String(user.hospitalId) !== String(hospitalId)) {
                        return res.status(403).json({ success: false, message: 'Access denied: You are not authorized for this clinic. Check the URL.' });
                    }
                } else {
                    if (user.hospitalId && userRoleStr !== 'hospitaladmin') {
                        return res.status(403).json({ success: false, message: 'Access denied: Please log in using your specific clinic portal URL.' });
                    }
                }
            }
        }

        // ── Verify password ───────────────────────────────────────────────────
        const isPasswordValid = await user.comparePassword(password);
        if (!isPasswordValid) {
            return res.status(401).json({ success: false, message: 'Invalid email or password' });
        }

        // ── DEV BYPASS: Skip OTP when AUTH_OTP_ENABLED=false ──────────────────
        // All OTP code below remains intact. This block early-returns so the
        // /send endpoint acts as a direct login when OTP is disabled.
        // Session management (active-session check, force-login) still works.
        if (!AUTH_OTP_ENABLED) {
            // Resolve role if not already resolved (staff loginType)
            if (!roleData) {
                roleData = await resolveRoleData(user);
                if (!roleData) {
                    return res.status(403).json({ success: false, message: 'Role not found. Contact admin.' });
                }
            }

            // Check for active sessions against role-based limit (2 for central/superadmin, 1 for others)
            const maxAllowedSessions = getMaxAllowedSessions(user, roleData);
            const activeSessions = await Session.find({ userId: user._id, isActive: true }).sort({ lastActive: -1 });

            if (activeSessions.length >= maxAllowedSessions) {
                // Generate a preAuthToken so force-login still works
                const preAuthToken = jwt.sign(
                    { otp_pending: true, userId: String(user._id), loginType: effectiveLoginType },
                    JWT_SECRET,
                    { expiresIn: `${OTP_EXPIRY_MINUTES}m` }
                );

                return res.json({
                    success: true,
                    otpBypassed: true,
                    activeSessionExists: true,
                    maxAllowedSessions,
                    preAuthToken,
                    activeSession: {
                        browser: activeSessions[0].browser,
                        os: activeSessions[0].os,
                        lastActive: activeSessions[0].lastActive,
                        loginTime: activeSessions[0].loginTime,
                    },
                    activeSessions: activeSessions.map(s => ({
                        sessionId: s.sessionId,
                        browser: s.browser,
                        os: s.os,
                        lastActive: s.lastActive,
                        loginTime: s.loginTime,
                    })),
                });
            }

            // Active sessions are below the limit — complete login immediately
            const { token, userData } = await createSessionAndToken(user, roleData, req);

            return res.json({
                success: true,
                otpBypassed: true,
                activeSessionExists: false,
                message: 'Login successful (OTP bypassed for development)',
                token,
                user: userData,
            });
        }


        // ── Generate OTP ──────────────────────────────────────────────────────
        const otp = generateSecureOTP();
        const otpHash = await bcrypt.hash(otp, 6); // low rounds — OTP is short-lived

        // Create a pre-auth token (5 min expiry)
        const preAuthToken = jwt.sign(
            { otp_pending: true, userId: String(user._id), loginType: effectiveLoginType },
            JWT_SECRET,
            { expiresIn: `${OTP_EXPIRY_MINUTES}m` }
        );

        // Remove any existing OTP for this user and create a new one
        await LoginOtp.deleteMany({ userId: user._id });
        await LoginOtp.create({
            userId: user._id,
            otpHash,
            expiresAt: new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000),
            attempts: 0,
            lastResendAt: new Date(),
            preAuthToken,
            loginType: effectiveLoginType,
            hospitalId: hospitalId || user.hospitalId || null,
        });

        // ── Send OTP email ────────────────────────────────────────────────────
        await sendLoginOtpEmail({
            email: user.email,
            otp,
            userName: user.name,
        });

        // Mask email for frontend display
        const parts = user.email.split('@');
        const maskedEmail = parts[0].substring(0, 2) + '***@' + parts[1];

        res.json({
            success: true,
            message: 'OTP sent to your registered email',
            preAuthToken,
            email: maskedEmail,
        });

    } catch (error) {
        console.error('[otp/send] Error:', error);
        res.status(500).json({ success: false, message: 'Error sending OTP' });
    }
});


// ══════════════════════════════════════════════════════════════════════════════
// POST /api/auth/otp/verify
// Verify OTP → check active session → return result
// ══════════════════════════════════════════════════════════════════════════════
router.post('/verify', emailOtpVerifyLimiter, async (req, res) => {
    try {
        const { preAuthToken, otp } = req.body;

        if (!preAuthToken || !otp) {
            return res.status(400).json({ success: false, message: 'Pre-auth token and OTP are required' });
        }

        if (!/^\d{6}$/.test(otp)) {
            return res.status(400).json({ success: false, message: 'OTP must be a 6-digit number' });
        }

        // Verify the pre-auth token
        let decoded;
        try {
            decoded = jwt.verify(preAuthToken, JWT_SECRET);
        } catch {
            return res.status(401).json({ success: false, message: 'OTP expired. Please request a new one.', otpExpired: true });
        }

        if (!decoded.otp_pending || !decoded.userId) {
            return res.status(401).json({ success: false, message: 'Invalid token' });
        }

        // Find the OTP record
        const otpRecord = await LoginOtp.findOne({ userId: decoded.userId, preAuthToken });
        if (!otpRecord) {
            return res.status(401).json({ success: false, message: 'OTP expired. Please request a new one.', otpExpired: true });
        }

        // Check expiry
        if (otpRecord.expiresAt < new Date()) {
            await LoginOtp.deleteMany({ userId: decoded.userId });
            return res.status(401).json({ success: false, message: 'OTP expired. Please request a new one.', otpExpired: true });
        }

        // Check max attempts
        if (otpRecord.attempts >= OTP_MAX_ATTEMPTS) {
            await LoginOtp.deleteMany({ userId: decoded.userId });
            return res.status(429).json({ success: false, message: 'Maximum OTP attempts exceeded. Please request a new OTP.', otpExpired: true });
        }

        // Verify OTP
        const isValid = await bcrypt.compare(otp, otpRecord.otpHash);
        if (!isValid) {
            otpRecord.attempts += 1;
            await otpRecord.save();
            const remaining = OTP_MAX_ATTEMPTS - otpRecord.attempts;
            return res.status(401).json({
                success: false,
                message: `Invalid OTP. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`,
                attemptsRemaining: remaining,
            });
        }

        // OTP verified! Clean up the OTP record
        await LoginOtp.deleteMany({ userId: decoded.userId });

        const user = await User.findById(decoded.userId);
        if (!user) {
            return res.status(401).json({ success: false, message: 'User not found' });
        }

        const roleData = await resolveRoleData(user);
        if (!roleData) {
            return res.status(403).json({ success: false, message: 'Role not found. Contact admin.' });
        }

        // ── Check active sessions against role-based limit ───────────────────
        // Super Admin & Central Admin: 2 devices. All other roles: 1 device.
        const maxAllowedSessions = getMaxAllowedSessions(user, roleData);
        const activeSessions = await Session.find({ userId: decoded.userId, isActive: true }).sort({ lastActive: -1 });

        if (activeSessions.length >= maxAllowedSessions) {
            // Return session info so frontend can show the modal
            return res.json({
                success: true,
                otpVerified: true,
                activeSessionExists: true,
                maxAllowedSessions,
                activeSession: {
                    browser: activeSessions[0].browser,
                    os: activeSessions[0].os,
                    lastActive: activeSessions[0].lastActive,
                    loginTime: activeSessions[0].loginTime,
                },
                activeSessions: activeSessions.map(s => ({
                    sessionId: s.sessionId,
                    browser: s.browser,
                    os: s.os,
                    lastActive: s.lastActive,
                    loginTime: s.loginTime,
                })),
            });
        }

        // Active sessions are below the limit — proceed to complete login
        const { token, userData } = await createSessionAndToken(user, roleData, req);

        res.json({
            success: true,
            otpVerified: true,
            activeSessionExists: false,
            message: 'Login successful',
            token,
            user: userData,
        });

    } catch (error) {
        console.error('[otp/verify] Error:', error);
        res.status(500).json({ success: false, message: 'Error verifying OTP' });
    }
});


// ══════════════════════════════════════════════════════════════════════════════
// POST /api/auth/otp/resend
// Resend OTP (30s cooldown). Requires preAuthToken.
// ══════════════════════════════════════════════════════════════════════════════
router.post('/resend', emailOtpSendLimiter, async (req, res) => {
    try {
        const { preAuthToken } = req.body;

        if (!preAuthToken) {
            return res.status(400).json({ success: false, message: 'Pre-auth token is required' });
        }

        // Verify the pre-auth token
        let decoded;
        try {
            decoded = jwt.verify(preAuthToken, JWT_SECRET);
        } catch {
            return res.status(401).json({ success: false, message: 'Session expired. Please login again.', otpExpired: true });
        }

        if (!decoded.otp_pending || !decoded.userId) {
            return res.status(401).json({ success: false, message: 'Invalid token' });
        }

        // Find existing OTP record
        const otpRecord = await LoginOtp.findOne({ userId: decoded.userId, preAuthToken });
        if (!otpRecord) {
            return res.status(401).json({ success: false, message: 'Session expired. Please login again.', otpExpired: true });
        }

        // Check cooldown
        if (otpRecord.lastResendAt) {
            const elapsed = (Date.now() - otpRecord.lastResendAt.getTime()) / 1000;
            if (elapsed < OTP_RESEND_COOLDOWN_SECONDS) {
                const remaining = Math.ceil(OTP_RESEND_COOLDOWN_SECONDS - elapsed);
                return res.status(429).json({
                    success: false,
                    message: `Please wait ${remaining} seconds before requesting a new OTP.`,
                    retryAfter: remaining,
                });
            }
        }

        // Generate new OTP
        const user = await User.findById(decoded.userId);
        if (!user) {
            return res.status(401).json({ success: false, message: 'User not found' });
        }

        const otp = generateSecureOTP();
        const otpHash = await bcrypt.hash(otp, 6);

        // Update the record
        otpRecord.otpHash = otpHash;
        otpRecord.attempts = 0;
        otpRecord.lastResendAt = new Date();
        otpRecord.expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
        await otpRecord.save();

        // Send OTP email
        await sendLoginOtpEmail({
            email: user.email,
            otp,
            userName: user.name,
        });

        res.json({
            success: true,
            message: 'New OTP sent to your registered email',
        });

    } catch (error) {
        console.error('[otp/resend] Error:', error);
        res.status(500).json({ success: false, message: 'Error resending OTP' });
    }
});


// ══════════════════════════════════════════════════════════════════════════════
// POST /api/auth/otp/force-login
// Invalidate previous session → create new session → generate JWT
// Called when user confirms "Logout Previous Device & Continue"
// ══════════════════════════════════════════════════════════════════════════════
router.post('/force-login', async (req, res) => {
    try {
        const { preAuthToken } = req.body;

        if (!preAuthToken) {
            return res.status(400).json({ success: false, message: 'Pre-auth token is required' });
        }

        // Verify the pre-auth token
        let decoded;
        try {
            decoded = jwt.verify(preAuthToken, JWT_SECRET);
        } catch {
            return res.status(401).json({ success: false, message: 'Session expired. Please login again.' });
        }

        if (!decoded.otp_pending || !decoded.userId) {
            return res.status(401).json({ success: false, message: 'Invalid token' });
        }

        const user = await User.findById(decoded.userId);
        if (!user) {
            return res.status(401).json({ success: false, message: 'User not found' });
        }

        const roleData = await resolveRoleData(user);
        if (!roleData) {
            return res.status(403).json({ success: false, message: 'Role not found. Contact admin.' });
        }

        const maxAllowedSessions = getMaxAllowedSessions(user, roleData);

        // For single-session roles (max 1): invalidate all existing active sessions
        // For multi-session roles (max 2): invalidate oldest session(s) leaving at most (maxAllowedSessions - 1)
        // so that creating 1 new session keeps total active sessions <= maxAllowedSessions.
        const keepCount = Math.max(0, maxAllowedSessions - 1);
        await invalidateOldestSessions(user._id, keepCount);

        // Create new session and JWT
        const { token, userData } = await createSessionAndToken(user, roleData, req);

        res.json({
            success: true,
            message: 'Login successful. Previous session has been terminated.',
            token,
            user: userData,
        });

    } catch (error) {
        console.error('[otp/force-login] Error:', error);
        res.status(500).json({ success: false, message: 'Error completing login' });
    }
});


module.exports = router;
