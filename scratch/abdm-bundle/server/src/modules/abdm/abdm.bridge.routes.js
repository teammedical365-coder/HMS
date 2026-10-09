'use strict';
/**
 * abdm.bridge.routes.js - ADMIN endpoints only. Mount at /api/abdm/bridge.
 * (The public ABDM callbacks live in abdm.callbacks.js, mounted at the app root.)
 *
 * Platform actions are superadmin/centraladmin ONLY. A hospital admin must never be able to
 * change the shared bridge URL or reassign HIP IDs: that would redirect every hospital.
 */
const express = require('express');
const { verifyToken } = require('../../middleware/auth.middleware');
const c = require('./abdm.bridge.controller');

const router = express.Router();

const requirePlatformAdmin = (req, res, next) => {
    const role = req.user && req.user.role;
    if (role === 'superadmin' || role === 'centraladmin') return next();
    return res.status(403).json({ success: false, message: 'Platform administrator access required' });
};
const requireHospitalAdmin = (req, res, next) => {
    const role = req.user && req.user.role;
    if (['hospitaladmin', 'superadmin', 'centraladmin'].includes(role)) return next();
    return res.status(403).json({ success: false, message: 'Hospital administrator access required' });
};

router.get('/config', verifyToken, requirePlatformAdmin, c.getConfig);
router.patch('/url', verifyToken, requirePlatformAdmin, c.registerUrl);   // kept path for the existing UI; body ignored
router.get('/probe', verifyToken, requirePlatformAdmin, c.probe);
router.get('/verify', verifyToken, requirePlatformAdmin, c.verify);
router.put('/hospitals/:hospitalId/hip', verifyToken, requirePlatformAdmin, c.registerHospital);
router.get('/hospital', verifyToken, requireHospitalAdmin, c.ownHospitalStatus);

module.exports = { bridgeRouter: router };
