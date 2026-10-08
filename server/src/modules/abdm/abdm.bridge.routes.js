/**
 * abdm.bridge.routes.js — Router for ABDM Bridge Management and Official Callbacks
 *
 * Base Mounts:
 *   - /api/abdm/bridge (Admin bridge configuration endpoints)
 *   - /api/abdm/v0.5 and /v0.5 (ABDM Gateway callback webhooks)
 */

const express = require('express');
const router = express.Router();
const { verifyToken } = require('../../middleware/auth.middleware');
const bridgeController = require('./abdm.bridge.controller');
const webhookController = require('./abdm.webhook.controller');

// Middleware to enforce Hospital Admin or Superadmin role
const requireHospitalAdmin = (req, res, next) => {
    const role = req.user?.role;
    const allowedRoles = ['hospitaladmin', 'superadmin', 'centraladmin'];
    const permissions = req.user?._roleData?.permissions || [];

    if (allowedRoles.includes(role) || permissions.includes('*') || permissions.includes('admin_manage_roles')) {
        return next();
    }
    return res.status(403).json({
        success: false,
        message: 'Access denied: Hospital Administrator credentials required to manage ABDM Bridge'
    });
};

// ── Bridge Configuration Endpoints (Requires Hospital Admin Auth) ─────────────
router.get('/config', verifyToken, requireHospitalAdmin, bridgeController.getBridgeConfig);
router.patch('/url', verifyToken, requireHospitalAdmin, bridgeController.updateBridgeUrl);
router.post('/services', verifyToken, requireHospitalAdmin, bridgeController.registerHipService);
router.get('/verify', verifyToken, requireHospitalAdmin, bridgeController.verifyServices);

// ── Webhook Callback Router Factory ──────────────────────────────────────────
const webhookRouter = express.Router();

webhookRouter.post('/users/auth/on-init', webhookController.handleAuthOnInit);
webhookRouter.post('/users/auth/on-confirm', webhookController.handleAuthOnConfirm);
webhookRouter.post('/users/auth/on-fetch-modes', webhookController.handleAuthOnFetchModes);
webhookRouter.post('/patients/profile/on-share', webhookController.handleProfileOnShare);
webhookRouter.post('/links/link/on-init', webhookController.handleLinkOnInit);
webhookRouter.post('/links/link/on-confirm', webhookController.handleLinkOnConfirm);

module.exports = {
    bridgeRouter: router,
    webhookRouter
};
