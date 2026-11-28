/**
 * pacificDemo.routes.js — Isolated Interactive Demo Auth & Account Switcher
 * Exclusively for Pacific Hospital (`https://pacifichospital.medical365.in/`).
 *
 * Dynamically serves ALL existing Pacific Hospital staff & doctor accounts
 * using their ORIGINAL Medical365 dashboards, roles, permissions, and data.
 * ZERO modifications to existing OTP generation, OTP verification, or authentication
 * flows of any other hospital tenant.
 */
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const UAParser = require('ua-parser-js');

const Hospital = require('../models/hospital.model');
const User = require('../models/user.model');
const Doctor = require('../models/doctor.model');
const Role = require('../models/role.model');
const Session = require('../models/session.model');
const TokenBlacklist = require('../models/tokenBlacklist.model');

const { JWT_SECRET } = require('../config/jwt');
const {
    verifyToken,
    verifySuperAdmin,
    invalidateAuthCache
} = require('../middleware/auth.middleware');
const {
    pacificDemoLoginLimiter,
    pacificDemoSwitchLimiter
} = require('../middleware/rateLimiter');

const {
    PACIFIC_DEMO_SLUG,
    PACIFIC_DEMO_HOSPITAL_ID,
    PACIFIC_DEMO_JWT_EXPIRES_IN,
    PACIFIC_DEMO_SESSION_TTL_MS,
    PACIFIC_DEMO_ROLES,
    getPacificRoleSpec,
    categorizePacificRole,
    resolveOriginalDashboardPath,
    verifyPacificRequestContext
} = require('../config/pacificDemoConfig');

const ROLE_SORT_ORDER = {
    hospitaladmin: 1,
    doctor: 2,
    reception: 3,
    lab: 4,
    accountant: 5,
    nurse: 6,
    pharmacy: 7,
    billing: 8,
    ot: 9,
    staff: 10
};

function parseUserAgent(uaString) {
    const parser = new UAParser(uaString || '');
    const browser = parser.getBrowser();
    const os = parser.getOS();
    return {
        browser: browser.name ? `${browser.name} ${browser.version || ''}`.trim() : 'Demo Browser',
        os: os.name ? `${os.name} ${os.version || ''}`.trim() : 'Demo OS'
    };
}

/**
 * Resolve Role document for a Pacific Hospital user without mutating the DB.
 */
async function resolveUserRoleDoc(user, hospitalId) {
    if (!user) return null;
    const rawRole = String(user.role || '').trim();

    if (rawRole === 'hospitaladmin') {
        return {
            name: 'hospitaladmin',
            permissions: ['admin_manage_roles', 'admin_view_stats'],
            dashboardPath: '/hospitaladmin',
            navLinks: [],
            isSystemRole: true
        };
    }

    if (mongoose.Types.ObjectId.isValid(user.role)) {
        const roleDoc = await Role.findById(user.role).lean();
        if (roleDoc) {
            if (roleDoc.hospitalId && String(roleDoc.hospitalId) !== String(hospitalId)) {
                return null;
            }
            return roleDoc;
        }
    }

    if (rawRole) {
        const roleDoc = await Role.findOne({
            hospitalId,
            name: { $regex: new RegExp(`^${rawRole.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
        }).lean() || await Role.findOne({
            hospitalId: null,
            name: { $regex: new RegExp(`^${rawRole.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
        }).lean();
        if (roleDoc) return roleDoc;
    }

    if (user.demoRoleKey) {
        const spec = getPacificRoleSpec(user.demoRoleKey);
        if (spec?.roleLookupName) {
            return await Role.findOne({
                hospitalId,
                name: { $regex: new RegExp(`^${spec.roleLookupName}$`, 'i') }
            }).lean() || await Role.findOne({
                hospitalId: null,
                name: { $regex: new RegExp(`^${spec.roleLookupName}$`, 'i') }
            }).lean();
        }
    }

    return null;
}

/**
 * Load Pacific Hospital tenant cleanly and enforce strict Origin / Host / DB Demo invariants.
 */
async function validatePacificTenant(req) {
    const ctxCheck = verifyPacificRequestContext(req);
    if (!ctxCheck.ok) {
        return { ok: false, status: 403, message: ctxCheck.reason };
    }

    const hospital = await Hospital.findOne({
        slug: PACIFIC_DEMO_SLUG,
        isActive: true
    }).select('_id name slug hospitalCode clinicType subscriptionPlan isActive isDemoEnabled branding').lean();

    if (!hospital || String(hospital._id) !== String(PACIFIC_DEMO_HOSPITAL_ID)) {
        return { ok: false, status: 403, message: 'Pacific Hospital demo tenant is not configured or inactive.' };
    }
    if (hospital.isDemoEnabled !== true) {
        return { ok: false, status: 403, message: 'Interactive demo mode is currently disabled for Pacific Hospital.' };
    }

    return { ok: true, hospital, sourceHost: ctxCheck.sourceHost };
}

/**
 * Resolve all existing non-patient, non-superadmin users in Pacific Hospital dynamically from DB.
 */
async function fetchAllPacificAccounts(hospitalId) {
    const [users, roles, doctors] = await Promise.all([
        User.find({
            hospitalId,
            isActive: { $ne: false },
            role: { $nin: ['patient', 'superadmin', 'centraladmin'] }
        })
            .select('_id name email phone role departments isDemoAccount demoRoleKey')
            .lean(),
        Role.find({ $or: [{ hospitalId }, { hospitalId: null }] }).lean(),
        Doctor.find({ hospitalId, status: { $ne: 'Inactive' } })
            .select('_id userId name email specialty departments consultationFee')
            .lean()
    ]);

    const roleById = new Map(roles.map((r) => [String(r._id), r]));
    const roleByName = new Map(roles.map((r) => [String(r.name || '').toLowerCase().trim(), r]));
    const docByUserId = new Map(doctors.filter((d) => d.userId).map((d) => [String(d.userId), d]));
    const docByEmail = new Map(doctors.filter((d) => d.email).map((d) => [String(d.email).toLowerCase().trim(), d]));

    const accounts = [];
    for (const u of users) {
        const rawRole = String(u.role || '').trim();
        let roleDoc = null;
        if (mongoose.Types.ObjectId.isValid(rawRole)) {
            roleDoc = roleById.get(rawRole) || null;
        }
        if (!roleDoc && rawRole) {
            roleDoc = roleByName.get(rawRole.toLowerCase()) || null;
        }

        const roleName = rawRole === 'hospitaladmin'
            ? 'Hospital Admin'
            : (roleDoc?.name || rawRole || 'Staff');

        const lowerRole = roleName.toLowerCase().trim();
        if (['superadmin', 'centraladmin', 'patient'].includes(lowerRole)) {
            continue;
        }

        const roleCategory = categorizePacificRole(lowerRole);
        const docProfile = docByUserId.get(String(u._id)) || docByEmail.get(String(u.email || '').toLowerCase().trim()) || null;
        const mergedDepts = Array.from(new Set([
            ...(Array.isArray(u.departments) ? u.departments : []),
            ...(Array.isArray(docProfile?.departments) ? docProfile.departments : []),
            ...(docProfile?.specialty ? [docProfile.specialty] : [])
        ].filter(Boolean)));

        const dashboardPath = resolveOriginalDashboardPath(
            rawRole === 'hospitaladmin' ? 'hospitaladmin' : roleName,
            roleDoc?.dashboardPath || null
        );

        accounts.push({
            userId: String(u._id),
            name: u.name || 'Unnamed Staff',
            roleName,
            roleCategory,
            departments: mergedDepts,
            specialty: docProfile?.specialty || null,
            doctorId: docProfile?._id ? String(docProfile._id) : null,
            dashboardPath,
            isDemoAccount: Boolean(u.isDemoAccount)
        });
    }

    accounts.sort((a, b) => {
        const orderA = ROLE_SORT_ORDER[a.roleCategory] || 99;
        const orderB = ROLE_SORT_ORDER[b.roleCategory] || 99;
        if (orderA !== orderB) return orderA - orderB;
        return a.name.localeCompare(b.name);
    });

    return { accounts, doctors };
}

/**
 * Validate target user strictly belongs to Pacific Hospital, is active, and is non-superadmin/non-patient.
 */
async function validatePacificDemoTarget(req, { userId = null, roleKey = null, doctorUserId = null }) {
    const tenantRes = await validatePacificTenant(req);
    if (!tenantRes.ok) return tenantRes;
    const { hospital } = tenantRes;

    let user = null;

    if (userId && mongoose.Types.ObjectId.isValid(userId)) {
        user = await User.findOne({
            _id: userId,
            hospitalId: hospital._id,
            isActive: { $ne: false }
        });
    } else if (roleKey === 'doctor' && doctorUserId && mongoose.Types.ObjectId.isValid(doctorUserId)) {
        const docRecord = await Doctor.findOne({
            hospitalId: hospital._id,
            $or: [{ userId: doctorUserId }, { _id: doctorUserId }],
            status: { $ne: 'Inactive' }
        }).lean();
        const targetUid = docRecord?.userId || doctorUserId;
        if (mongoose.Types.ObjectId.isValid(targetUid)) {
            user = await User.findOne({
                _id: targetUid,
                hospitalId: hospital._id,
                isActive: { $ne: false }
            });
        }
    } else if (roleKey) {
        const roleSpec = getPacificRoleSpec(roleKey);
        if (roleSpec) {
            user = await User.findOne({
                hospitalId: hospital._id,
                email: roleSpec.email,
                isActive: { $ne: false }
            });
        }
        if (!user) {
            const { accounts } = await fetchAllPacificAccounts(hospital._id);
            const matched = accounts.find((a) => a.roleCategory === String(roleKey).toLowerCase().trim());
            if (matched) {
                user = await User.findOne({ _id: matched.userId, hospitalId: hospital._id, isActive: { $ne: false } });
            }
        }
    }

    if (!user) {
        return { ok: false, status: 404, message: 'Selected Pacific Hospital user account not found or inactive.' };
    }
    if (String(user.hospitalId) !== String(hospital._id)) {
        return { ok: false, status: 403, message: 'Tenant mismatch on selected account.' };
    }

    const roleData = await resolveUserRoleDoc(user, hospital._id);
    if (!roleData) {
        return { ok: false, status: 403, message: 'Role configuration not found for selected user.' };
    }

    const resolvedRoleLower = String(roleData.name || user.role || '').toLowerCase().trim();
    if (['superadmin', 'centraladmin', 'patient'].includes(resolvedRoleLower)) {
        return { ok: false, status: 403, message: 'Selected role is not permitted for Pacific Hospital portal switching.' };
    }

    const roleCategory = categorizePacificRole(resolvedRoleLower);
    const dashboardPath = resolveOriginalDashboardPath(roleData.name || user.role, roleData.dashboardPath);

    return {
        ok: true,
        hospital,
        user,
        roleData,
        roleCategory,
        dashboardPath,
        sourceHost: tenantRes.sourceHost
    };
}

/**
 * Cap concurrent demo sessions per account cleanly while expiring stale sessions.
 */
async function capConcurrentDemoSessions(userId, maxActive = 20) {
    const active = await Session.find({ userId, isActive: true }).sort({ lastActive: -1 });
    if (active.length < maxActive) return;

    const toDeactivate = active.slice(maxActive - 1);
    const now = new Date();
    for (const s of toDeactivate) {
        if (s.jti) {
            await TokenBlacklist.create({
                jti: s.jti,
                expireAt: new Date(Date.now() + PACIFIC_DEMO_SESSION_TTL_MS + 60 * 60 * 1000)
            }).catch(() => {});
        }
        s.isActive = false;
        s.logoutTime = now;
        await s.save().catch(() => {});
    }
    invalidateAuthCache({ userId });
}

async function issuePacificDemoSession({ user, hospital, roleData, roleCategory, dashboardPath, req }) {
    await capConcurrentDemoSessions(user._id, 20);

    const sessionId = uuidv4();
    const jti = uuidv4();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + PACIFIC_DEMO_SESSION_TTL_MS);
    const { browser, os } = parseUserAgent(req.headers['user-agent']);
    const ipAddress = req.ip || req.connection?.remoteAddress || '';

    await Session.create({
        userId: user._id,
        sessionId,
        jti,
        browser,
        os,
        ipAddress,
        loginTime: now,
        lastActive: now,
        isActive: true,
        isDemoSession: true,
        expiresAt
    });

    await User.findByIdAndUpdate(user._id, { $set: { lastLogin: now } });

    const token = jwt.sign(
        {
            jti,
            userId: user._id,
            email: user.email,
            roleId: String(user.role),
            hospitalId: String(hospital._id),
            sessionId,
            tv: user.tokenVersion ?? 0,
            isPacificDemo: true,
            isDemoSession: true,
            demoRoleKey: roleCategory
        },
        JWT_SECRET,
        { expiresIn: PACIFIC_DEMO_JWT_EXPIRES_IN }
    );

    const userData = {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: roleData.name,
        roleName: roleData.name,
        roleId: String(user.role),
        _roleData: {
            _id: roleData._id || null,
            name: roleData.name,
            permissions: roleData.permissions || [],
            dashboardPath
        },
        hospitalId: String(hospital._id),
        clinicType: hospital.clinicType || 'hospital',
        subscriptionPlan: hospital.subscriptionPlan || 'enterprise',
        departments: user.departments || [],
        permissions: roleData.permissions || [],
        dashboardPath,
        navLinks: roleData.navLinks || [],
        lastLogin: now,
        isDemo: true,
        isDemoUser: true,
        isDemoTenant: true,
        isPacificDemo: true,
        demoRoleKey: roleCategory,
        demoExpiresAt: expiresAt.toISOString()
    };

    const tenantPayload = {
        id: String(hospital._id),
        name: hospital.name,
        slug: hospital.slug,
        subdomain: `${hospital.slug}.medical365.in`,
        isDemoEnabled: true,
        isPacificDemo: true
    };

    return {
        token,
        user: userData,
        tenant: tenantPayload,
        expiresAt: expiresAt.toISOString()
    };
}

// ─── GET /api/pacific-demo/config (& /users) ──────────────────────────────────
// Dynamically fetches ALL existing active Pacific Hospital staff & doctor users.
// Strictly returns { demoEnabled: false, accounts: [], roles: [] } on any other domain.
async function handleGetConfig(req, res) {
    try {
        const tenantRes = await validatePacificTenant(req);
        if (!tenantRes.ok) {
            return res.json({ success: true, demoEnabled: false, accounts: [], roles: [] });
        }

        const { hospital } = tenantRes;
        const { accounts, doctors } = await fetchAllPacificAccounts(hospital._id);

        // Keep summary role metadata for backward compatibility where needed
        const categorySet = new Set(accounts.map((a) => a.roleCategory));
        const roles = PACIFIC_DEMO_ROLES
            .filter((r) => categorySet.has(r.roleKey))
            .map((r) => ({
                roleKey: r.roleKey,
                label: r.label,
                subtitle: r.subtitle,
                badge: r.badge,
                dashboardPath: r.dashboardPath
            }));

        res.set('Cache-Control', 'no-store');
        return res.json({
            success: true,
            demoEnabled: accounts.length > 0,
            hospital: {
                id: String(hospital._id),
                name: hospital.name,
                slug: hospital.slug,
                branding: hospital.branding || {}
            },
            accounts,
            roles,
            doctors: doctors.map((d) => ({
                id: String(d._id),
                userId: d.userId ? String(d.userId) : null,
                name: d.name,
                specialty: d.specialty || 'General',
                departments: d.departments || [],
                consultationFee: d.consultationFee || 0
            }))
        });
    } catch (err) {
        console.error('[pacific-demo/config] Error:', err.message);
        return res.status(500).json({ success: false, demoEnabled: false, message: 'Unable to check demo configuration.' });
    }
}

router.get('/config', handleGetConfig);
router.get('/users', handleGetConfig);

// ─── POST /api/pacific-demo/login ──────────────────────────────────────────────
// OTP-free authenticated login strictly scoped to Pacific Hospital for any existing Pacific user.
router.post('/login', pacificDemoLoginLimiter, async (req, res) => {
    try {
        const { userId, roleKey, doctorUserId } = req.body || {};
        if (!userId && (!roleKey || typeof roleKey !== 'string')) {
            return res.status(400).json({ success: false, message: 'A valid Pacific Hospital userId or roleKey is required.' });
        }

        const check = await validatePacificDemoTarget(req, { userId, roleKey, doctorUserId });
        if (!check.ok) {
            return res.status(check.status || 403).json({ success: false, message: check.message });
        }

        const sessionResult = await issuePacificDemoSession({
            user: check.user,
            hospital: check.hospital,
            roleData: check.roleData,
            roleCategory: check.roleCategory,
            dashboardPath: check.dashboardPath,
            req
        });

        return res.json({
            success: true,
            otpBypassed: true,
            isPacificDemo: true,
            message: `Signed into Pacific Hospital as ${check.user.name}`,
            token: sessionResult.token,
            user: sessionResult.user,
            tenant: sessionResult.tenant,
            expiresAt: sessionResult.expiresAt
        });
    } catch (err) {
        console.error('[pacific-demo/login] Error:', err);
        return res.status(500).json({ success: false, message: 'Demo login failed. Please try again.' });
    }
});

// ─── POST /api/pacific-demo/switch-role (& /switch-user) ──────────────────────
// Instant account switching inside Pacific Hospital sidebar via backend token re-issuance.
async function handleSwitchUser(req, res) {
    try {
        if (!req.user?.isPacificDemo) {
            return res.status(403).json({
                success: false,
                message: 'Account switching is restricted exclusively to active Pacific Hospital Demo sessions.'
            });
        }
        if (String(req.user.hospitalId) !== String(PACIFIC_DEMO_HOSPITAL_ID)) {
            return res.status(403).json({ success: false, message: 'Cross-tenant switching is forbidden.' });
        }

        const { userId, roleKey, doctorUserId } = req.body || {};
        if (!userId && (!roleKey || typeof roleKey !== 'string')) {
            return res.status(400).json({ success: false, message: 'Target Pacific Hospital userId or roleKey is required.' });
        }

        const check = await validatePacificDemoTarget(req, { userId, roleKey, doctorUserId });
        if (!check.ok) {
            return res.status(check.status || 403).json({ success: false, message: check.message });
        }

        // Invalidate ONLY caller's previous demo session token before issuing the new user's token
        const authHeader = req.headers.authorization || '';
        const prevToken = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
        if (prevToken) {
            try {
                const decodedPrev = jwt.verify(prevToken, JWT_SECRET);
                if (decodedPrev.jti) {
                    await TokenBlacklist.create({
                        jti: decodedPrev.jti,
                        expireAt: new Date(Date.now() + PACIFIC_DEMO_SESSION_TTL_MS + 60 * 60 * 1000)
                    }).catch(() => {});
                }
                if (decodedPrev.sessionId) {
                    await Session.updateOne(
                        { sessionId: decodedPrev.sessionId, isActive: true },
                        { $set: { isActive: false, logoutTime: new Date() } }
                    );
                }
                invalidateAuthCache({ token: prevToken, jti: decodedPrev.jti });
            } catch (_) {}
        }

        const sessionResult = await issuePacificDemoSession({
            user: check.user,
            hospital: check.hospital,
            roleData: check.roleData,
            roleCategory: check.roleCategory,
            dashboardPath: check.dashboardPath,
            req
        });

        return res.json({
            success: true,
            switched: true,
            isPacificDemo: true,
            message: `Switched account to ${check.user.name} (${check.roleData.name})`,
            token: sessionResult.token,
            user: sessionResult.user,
            tenant: sessionResult.tenant,
            expiresAt: sessionResult.expiresAt
        });
    } catch (err) {
        console.error('[pacific-demo/switch-role] Error:', err);
        return res.status(500).json({ success: false, message: 'Unable to switch account right now.' });
    }
}

router.post('/switch-role', verifyToken, pacificDemoSwitchLimiter, handleSwitchUser);
router.post('/switch-user', verifyToken, pacificDemoSwitchLimiter, handleSwitchUser);

// ─── PATCH /api/pacific-demo/admin/toggle (Super Admin Only) ──────────────────
router.patch('/admin/toggle', verifySuperAdmin, async (req, res) => {
    try {
        const { enabled } = req.body || {};
        if (typeof enabled !== 'boolean') {
            return res.status(400).json({ success: false, message: 'Boolean "enabled" value required.' });
        }
        const hospital = await Hospital.findOneAndUpdate(
            { slug: PACIFIC_DEMO_SLUG },
            { $set: { isDemoEnabled: enabled } },
            { new: true }
        ).select('_id name slug isDemoEnabled').lean();

        if (!hospital) {
            return res.status(404).json({ success: false, message: 'Pacific Hospital tenant not found.' });
        }
        return res.json({ success: true, hospital });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
