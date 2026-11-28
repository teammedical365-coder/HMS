'use strict';
/**
 * abdm.bridge.routes.js - ADMIN endpoints only. Mount at /api/abdm/bridge.
 * (The public ABDM callbacks live in abdm.callbacks.js, mounted at the app root.)
 *
 * Platform actions are superadmin/centraladmin ONLY. A hospital admin or custom hospital role
 * must never be able to change the shared bridge URL or reassign HIP IDs across tenants.
 */
const express = require('express');
const { verifyToken } = require('../../middleware/auth.middleware');
const c = require('./abdm.bridge.controller');

const router = express.Router();

function resolveNormalizedRole(user) {
    if (!user) return '';
    return String((user._roleData && user._roleData.name) || user.role || '')
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ' ');
}

function isPlatformAdmin(user) {
    if (!user) return false;
    if (user.isPacificDemo || user.isDemoAccount) return false;
    // Never treat hospital-scoped custom roles or hospital users as platform administrators
    if (user.hospitalId) return false;
    if (user._roleData && user._roleData.hospitalId) return false;
    const role = resolveNormalizedRole(user);
    return role === 'superadmin' || role === 'centraladmin';
}

const requirePlatformAdmin = (req, res, next) => {
    if (isPlatformAdmin(req.user)) return next();
    return res.status(403).json({ success: false, message: 'Platform administrator access required' });
};

const requireHospitalAdmin = (req, res, next) => {
    if (isPlatformAdmin(req.user)) return next();
    const role = resolveNormalizedRole(req.user);
    const roleCompact = role.replace(/[\s_]+/g, '');
    const perms = (req.user && req.user._roleData && Array.isArray(req.user._roleData.permissions))
        ? req.user._roleData.permissions
        : [];
    const isHospAdmin =
        roleCompact === 'hospitaladmin' ||
        (role === 'admin' && (perms.includes('admin_manage_roles') || perms.includes('admin_view_stats')));

    if (isHospAdmin && req.user && req.user.hospitalId) return next();
    return res.status(403).json({ success: false, message: 'Hospital administrator access required' });
};

router.get('/config', verifyToken, requirePlatformAdmin, c.getConfig);
router.patch('/url', verifyToken, requirePlatformAdmin, c.registerUrl);   // kept path for the existing UI; body ignored
router.get('/probe', verifyToken, requirePlatformAdmin, c.probe);
router.get('/verify', verifyToken, requirePlatformAdmin, c.verify);
router.put('/hospitals/:hospitalId/hip', verifyToken, requirePlatformAdmin, c.registerHospital);
router.get('/hospital', verifyToken, requireHospitalAdmin, c.ownHospitalStatus);

module.exports = { bridgeRouter: router, resolveNormalizedRole, isPlatformAdmin };
