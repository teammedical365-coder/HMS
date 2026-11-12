const jwt = require('jsonwebtoken');
const User = require('../models/user.model');
const Role = require('../models/role.model');
const TokenBlacklist = require('../models/tokenBlacklist.model');
const Session = require('../models/session.model');

const { JWT_SECRET } = require('../config/jwt');
const { isDemoAccount, isDemoHospital, isPredefinedDemoUser } = require('../config/demoConfig');

// ── Bounded In-Memory TTL Cache for Verified Auth Tokens ──────────────────────
// Drastically reduces database round trips (from 5 DB queries down to 0) on repeat requests
const authCache = new Map();
const AUTH_CACHE_TTL_MS = 45 * 1000; // 45 seconds TTL
const AUTH_CACHE_MAX_ENTRIES = 1000;

function pruneAuthCache() {
    const now = Date.now();
    for (const [key, val] of authCache.entries()) {
        if (val.expiresAt <= now) {
            authCache.delete(key);
        }
    }
    if (authCache.size > AUTH_CACHE_MAX_ENTRIES) {
        const excess = authCache.size - AUTH_CACHE_MAX_ENTRIES;
        let count = 0;
        for (const key of authCache.keys()) {
            authCache.delete(key);
            count++;
            if (count >= excess) break;
        }
    }
}

/**
 * Invalidate cached auth context upon logout, session revocation, user update/deletion, or role modification
 */
function invalidateAuthCache({ userId, jti, token, roleId } = {}) {
    if (token && authCache.has(token)) {
        authCache.delete(token);
    }
    if (jti) {
        for (const [key, val] of authCache.entries()) {
            if (val.jti === jti) {
                authCache.delete(key);
            }
        }
    }
    if (userId) {
        const uIdStr = String(userId);
        for (const [key, val] of authCache.entries()) {
            if (String(val.userId) === uIdStr) {
                authCache.delete(key);
            }
        }
    }
    if (roleId) {
        const rIdStr = String(roleId).toLowerCase();
        for (const [key, val] of authCache.entries()) {
            const cachedRoleId = val.roleId ? String(val.roleId).toLowerCase() : null;
            const cachedRoleName = val.roleName ? String(val.roleName).toLowerCase() : null;
            if (cachedRoleId === rIdStr || cachedRoleName === rIdStr) {
                authCache.delete(key);
            }
        }
    }
}
exports.invalidateAuthCache = invalidateAuthCache;

/**
 * Verify JWT token and attach user + populated role to req.user
 */
exports.verifyToken = async (req, res, next) => {
    // If user is already authenticated by an upstream middleware, proceed immediately (prevents duplicate execution)
    if (req.user && req.user._roleData) {
        return next();
    }
    let decoded;
    let token;
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, message: 'No token provided' });
        }

        token = authHeader.split(' ')[1];
        decoded = jwt.verify(token, JWT_SECRET);
    } catch (jwtErr) {
        if (jwtErr.name === 'TokenExpiredError') {
            return res.status(401).json({ 
                success: false, 
                sessionExpired: true, 
                message: 'jwt expired. Please login again.' 
            });
        }
        return res.status(401).json({ success: false, message: 'Invalid token' });
    }

    // ── Fast-Path: Check Bounded Auth Cache ─────────────────────────────────────
    const cachedAuth = authCache.get(token);
    const now = Date.now();
    if (cachedAuth && cachedAuth.expiresAt > now) {
        // Double-check token version if present in token
        if (decoded.tv === undefined || decoded.tv === cachedAuth.tokenVersion) {
            req.user = { ...cachedAuth.user };
            req.user.id = cachedAuth.userId;
            req.user.userId = cachedAuth.userId;
            req.user._roleData = cachedAuth.roleData;

            if (cachedAuth.isDemoTenant) {
                req.user.isDemo = true;
                req.user.isDemoTenant = true;
                req.isDemo = true;
                if (cachedAuth.isPredefinedDemo) {
                    req.user.isDemoUser = true;
                }
            }
            return next();
        } else {
            authCache.delete(token); // Version mismatch, invalidate entry
        }
    }

    try {
        // Reject tokens that have been explicitly invalidated (logout)
        const jti = decoded.jti;
        if (jti) {
            const revoked = await TokenBlacklist.exists({ jti });
            if (revoked) return res.status(401).json({ success: false, message: 'Token has been invalidated. Please log in again.' });
        }

        // Reject tokens issued before the user's token version was bumped (revoke-all-sessions)
        let tokenVersion = 0;
        if (decoded.tv !== undefined) {
            const currentVersion = await User.findById(decoded.userId).select('tokenVersion').lean();
            tokenVersion = currentVersion?.tokenVersion ?? 0;
            if (currentVersion && tokenVersion !== decoded.tv) {
                return res.status(401).json({ success: false, message: 'Session revoked. Please log in again.' });
            }
        }

        // ── Session validation (single active session enforcement) ────────────
        // Tokens with sessionId are from the new OTP flow; legacy tokens without sessionId skip this check.
        if (decoded.sessionId) {
            const activeSession = await Session.findOne({
                sessionId: decoded.sessionId,
                userId: decoded.userId,
                isActive: true,
            });

            if (!activeSession) {
                return res.status(401).json({
                    success: false,
                    sessionExpired: true,
                    message: 'Your account has been logged in from another device. Please login again.',
                });
            }

            // Update lastActive (throttled — only if >1 minute since last update)
            const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
            if (activeSession.lastActive < oneMinuteAgo) {
                activeSession.lastActive = new Date();
                activeSession.save().catch(() => {}); // fire-and-forget
            }
        }

        let user;
        const mongoose = require('mongoose');
        if (decoded.patientId) {
            if (!mongoose.Types.ObjectId.isValid(decoded.patientId)) {
                return res.status(401).json({ success: false, message: 'Invalid token payload' });
            }
            const PatientAuth = require('../models/patientAuth.model');
            const patient = await PatientAuth.findById(decoded.patientId).lean();
            if (!patient) return res.status(401).json({ success: false, message: 'Patient not found' });
            user = {
                _id: patient._id,
                userId: patient._id,
                name: patient.name,
                email: patient.email,
                role: 'patient',
                hospitalId: patient.hospitalId
            };
        } else {
            if (!decoded.userId || !mongoose.Types.ObjectId.isValid(decoded.userId)) {
                return res.status(401).json({ success: false, message: 'Invalid token payload' });
            }
            user = await User.findById(decoded.userId).lean();
            if (!user) return res.status(401).json({ success: false, message: 'User not found' });
        }

        // hospitalId: prefer JWT payload (authoritative for hospital admins), fallback to DB
        if (decoded.hospitalId) {
            try {
                user.hospitalId = new mongoose.Types.ObjectId(decoded.hospitalId);
            } catch (e) {
                user.hospitalId = decoded.hospitalId; // Fallback if somehow not castable
            }
        }

        // Populate the role data
        let roleData = null;
        const specialRoles = ['superadmin', 'centraladmin', 'hospitaladmin'];

        if (specialRoles.includes(user.role)) {
            const isCentral = user.role === 'centraladmin' || user.role === 'superadmin';
            roleData = {
                name: user.role,
                permissions: isCentral ? ['*'] : ['admin_manage_roles', 'admin_view_stats'],
                dashboardPath: isCentral ? '/supremeadmin' : '/hospitaladmin',
                navLinks: [],
                isSystemRole: true
            };
        } else if (user.role === 'patient') {
            roleData = {
                name: 'patient',
                permissions: ['appointment_manage', 'reception_access'],
                dashboardPath: '/patient/dashboard',
                isSystemRole: true
            };
        } else if (user.role) {
            if (mongoose.Types.ObjectId.isValid(user.role)) {
                roleData = await Role.findById(user.role).lean();
            }

            if (!roleData) {
                const query = { name: { $regex: new RegExp(`^${user.role}$`, 'i') } };
                // Scope legacy role lookup to the user's hospital
                if (user.hospitalId) query.hospitalId = user.hospitalId;
                roleData = await Role.findOne(query).lean();
                
                // Fallback to global roles if hospital-specific role is not found
                if (!roleData && user.hospitalId) {
                    roleData = await Role.findOne({
                        hospitalId: null,
                        name: { $regex: new RegExp(`^${user.role}$`, 'i') }
                    }).lean();
                }

                if (roleData) {
                    const newRoleId = roleData._id;
                    user.role = newRoleId;
                    User.updateOne({ _id: user._id }, { $set: { role: newRoleId } }).catch(saveErr => {
                        console.warn(`[verifyToken] Non-fatal: could not persist role migration for user ${user._id}:`, saveErr.message);
                    });
                }
            }

            if (!roleData) {
                return res.status(403).json({ success: false, message: 'Your assigned role no longer exists. Contact admin.' });
            }
        }

        req.user = { ...user };
        req.user.id = user._id || user.id || user.userId;
        req.user.userId = user._id || user.id || user.userId;
        req.user._roleData = roleData;

        // Server-side Demo Identification (Preserving genuine RBAC permissions per role)
        const isDemoTenant = Boolean(decoded.isDemoTenant) || 
                             isDemoHospital(user.hospitalId) || 
                             (decoded.hospitalId && isDemoHospital(decoded.hospitalId));
        const isPredefinedDemo = Boolean(decoded.isDemoUser) || 
                                 isPredefinedDemoUser(user);

        if (isDemoTenant) {
            req.user.isDemo = true;
            req.user.isDemoTenant = true;
            req.isDemo = true;
            if (isPredefinedDemo) {
                req.user.isDemoUser = true;
            }
        }

        // Cache the verified auth details
        if (token) {
            if (authCache.size >= AUTH_CACHE_MAX_ENTRIES) pruneAuthCache();
            authCache.set(token, {
                user: { ...user },
                userId: req.user.id,
                roleData,
                roleId: roleData?._id ? String(roleData._id) : (user?.role ? String(user.role) : null),
                roleName: roleData?.name ? String(roleData.name).toLowerCase() : null,
                tokenVersion,
                jti: decoded.jti,
                isDemoTenant,
                isPredefinedDemo,
                expiresAt: now + AUTH_CACHE_TTL_MS
            });
        }
    } catch (dbErr) {
        if (dbErr.name === 'CastError') {
            return res.status(401).json({ success: false, message: 'Invalid token payload' });
        }
        console.error('[verifyToken] Database connection error:', dbErr.message);
        return res.status(503).json({ success: false, message: 'Database temporarily unavailable' });
    }

    return next();
};

/**
 * Generic permission-checking middleware factory.
 * Usage: requirePermission('admin_manage_roles', 'admin_view_stats')
 * The user must have AT LEAST ONE of the specified permissions.
 * SuperAdmins (wildcard *) always pass.
 */
exports.requirePermission = (...requiredPermissions) => {
    return async (req, res, next) => {
        try {
            // verifyToken must run first
            if (!req.user) {
                return res.status(401).json({ success: false, message: 'Authentication required' });
            }

            const roleData = req.user._roleData;
            if (!roleData) {
                return res.status(403).json({ success: false, message: 'No role assigned. Contact admin.' });
            }

            // SuperAdmin wildcard — always allowed
            if (roleData.permissions && roleData.permissions.includes('*')) {
                return next();
            }

            // Check if user has at least one of the required permissions
            const userPerms = roleData.permissions || [];
            const hasPermission = requiredPermissions.some(perm => userPerms.includes(perm));

            if (!hasPermission) {
                return res.status(403).json({
                    success: false,
                    message: `Access denied. Required permission: ${requiredPermissions.join(' or ')}`
                });
            }

            next();
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    };
};

/**
 * Verify user is an superadmin (bootstrap super-admin) or centraladmin.
 * Use this only for system-level operations like first-time setup or release management.
 */
exports.verifySuperAdmin = async (req, res, next) => {
    try {
        const checkRoleAndProceed = () => {
            const role = req.user?.role;
            if (role === 'superadmin' || role === 'centraladmin') {
                return next();
            }
            return res.status(403).json({ success: false, message: 'Central Admin access required' });
        };

        if (req.user) {
            return checkRoleAndProceed();
        }

        await exports.verifyToken(req, res, checkRoleAndProceed);
    } catch (error) {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
};

exports.verifyCentralAdmin = exports.verifySuperAdmin;

/**
 * BACKWARDS COMPATIBILITY — verifyAdmin and verifyAdminOrSuperAdmin
 * Now checks for admin_manage_roles permission OR superadmin role.
 */
exports.verifyAdminOrSuperAdmin = async (req, res, next) => {
    try {
        await exports.verifyToken(req, res, () => {
            const roleData = req.user._roleData;

            // Central admin always passes
            if (req.user.role === 'superadmin' || req.user.role === 'centraladmin') return next();

            // Hospital admin also passes for admin-level routes
            if (req.user.role === 'hospitaladmin') return next();

            // Check for admin-level permissions
            if (roleData && roleData.permissions &&
                (roleData.permissions.includes('*') ||
                    roleData.permissions.includes('admin_manage_roles') ||
                    roleData.permissions.includes('admin_view_stats'))) {
                return next();
            }

            return res.status(403).json({ success: false, message: 'Admin access required' });
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
};

exports.verifyAdmin = exports.verifyAdminOrSuperAdmin;

exports.verifyPatientToken = async (req, res, next) => {
    let decoded;
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, message: 'Authentication required' });
        }

        const token = authHeader.split(' ')[1];
        decoded = jwt.verify(token, JWT_SECRET);

        if (!decoded.patientId) {
            return res.status(401).json({ success: false, message: 'Invalid token payload' });
        }
    } catch (jwtErr) {
        return res.status(401).json({ success: false, message: 'Invalid or expired token' });
    }

    try {
        const PatientAuth = require('../models/patientAuth.model');
        const patient = await PatientAuth.findById(decoded.patientId);
        if (!patient) {
            return res.status(401).json({ success: false, message: 'Patient account not found' });
        }

        if (patient.status !== 'Active') {
            return res.status(401).json({ success: false, message: 'Account is inactive' });
        }

        req.patient = patient;
    } catch (dbErr) {
        console.error('[verifyPatientToken] Database connection error:', dbErr.message);
        return res.status(503).json({ success: false, message: 'Database temporarily unavailable' });
    }

    return next();
};