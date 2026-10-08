/**
 * abdm.bridge.controller.js — Request Handlers for ABDM Bridge & HIP Configuration
 *
 * Enforces:
 *   - Authenticated Hospital Admin / Central Admin permissions
 *   - Strict Tenant Isolation (never trust hospitalId from client body/params for scoped users)
 *   - Safe structured error responses without leaking credentials
 */

const abdmBridgeService = require('./abdm.bridge.service');

function getEffectiveHospitalId(req) {
    // Never trust hospitalId from client body/query for tenant-scoped users
    if (req.user?.hospitalId) {
        return String(req.user.hospitalId);
    }
    // Superadmins and Central Admins can specify hospitalId in headers/query
    if (req.user?.role === 'superadmin' || req.user?.role === 'centraladmin') {
        return req.headers['x-hospital-id'] || req.body?.hospitalId || req.query?.hospitalId || null;
    }
    return null;
}

/**
 * GET /api/abdm/bridge/config
 * Retrieve current Bridge configuration, registered HIP services, and gateway status
 */
exports.getBridgeConfig = async (req, res) => {
    try {
        const hospitalId = getEffectiveHospitalId(req);
        const result = await abdmBridgeService.getBridgeConfig(hospitalId);
        return res.json(result);
    } catch (err) {
        const status = err.status || 500;
        return res.status(status).json({
            success: false,
            message: err.message || 'Failed to retrieve ABDM Bridge configuration'
        });
    }
};

/**
 * PATCH /api/abdm/bridge/url
 * Updates the public HTTPS callback URL for ABDM Bridge (PATCH /gateway/v1/bridges)
 */
exports.updateBridgeUrl = async (req, res) => {
    try {
        const hospitalId = getEffectiveHospitalId(req);
        const { bridgeUrl } = req.body;

        const result = await abdmBridgeService.updateBridgeUrl(hospitalId, {
            bridgeUrl,
            userId: req.user?._id
        });

        return res.json(result);
    } catch (err) {
        const status = err.status || 500;
        return res.status(status).json({
            success: false,
            message: err.message || 'Failed to update ABDM Bridge URL'
        });
    }
};

/**
 * POST /api/abdm/bridge/services
 * Registers Medical365's HIP service (POST /gateway/v1/bridges/addUpdateServices)
 */
exports.registerHipService = async (req, res) => {
    try {
        const hospitalId = getEffectiveHospitalId(req);
        const { serviceId, serviceName, alias } = req.body;

        const result = await abdmBridgeService.registerHipService(hospitalId, {
            serviceId,
            serviceName,
            alias,
            userId: req.user?._id
        });

        return res.json(result);
    } catch (err) {
        const status = err.status || 500;
        return res.status(status).json({
            success: false,
            message: err.message || 'Failed to register HIP service on ABDM Bridge'
        });
    }
};

/**
 * GET /api/abdm/bridge/verify
 * Calls GET /gateway/v1/bridges/getServices to verify live registration status
 */
exports.verifyServices = async (req, res) => {
    try {
        const hospitalId = getEffectiveHospitalId(req);
        const result = await abdmBridgeService.verifyServices(hospitalId);
        return res.json(result);
    } catch (err) {
        const status = err.status || 500;
        return res.status(status).json({
            success: false,
            message: err.message || 'Failed to verify services with ABDM Gateway'
        });
    }
};
