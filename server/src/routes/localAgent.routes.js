const express = require('express');
const router = express.Router();

const { verifyToken } = require('../middleware/auth.middleware');
const { resolveTenant } = require('../middleware/tenantMiddleware');
const localAgentController = require('../controllers/localAgent.controller');
const conflictController = require('../controllers/conflict.controller');

/**
 * Middleware: Strictly enforce Hospital Admin (or Central/Super Admin)
 */
const verifyHospitalAdmin = (req, res, next) => {
    try {
        if (!req.user) {
            return res.status(401).json({ success: false, message: 'Authentication required' });
        }
        const roleName = (req.user._roleData?.name || String(req.user.role || '')).toLowerCase().replace(/[\s_-]+/g, '');
        const allowedRoles = ['hospitaladmin', 'centraladmin', 'superadmin'];
        if (allowedRoles.includes(roleName)) {
            return next();
        }
        return res.status(403).json({
            success: false,
            message: 'Access denied. Only Hospital Admin is authorized to manage local database & agent.'
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Internal authorization error' });
    }
};

// ── Public / Local Agent Endpoints ───────────────────────────────────────────
router.get('/ping', (req, res) => localAgentController.ping(req, res));
router.post('/pair', (req, res) => localAgentController.pairAgent(req, res));
router.post('/heartbeat', (req, res) => localAgentController.processHeartbeat(req, res));

// ── Hospital Admin Management Endpoints ──────────────────────────────────────
router.use(verifyToken);
router.use(resolveTenant);
router.use(verifyHospitalAdmin);

router.get('/status', (req, res) => localAgentController.getStatus(req, res));
router.post('/provision', (req, res) => localAgentController.provisionInstallation(req, res));
router.post('/test-connection', (req, res) => localAgentController.testConnection(req, res));
router.post('/revoke', (req, res) => localAgentController.revokeInstallation(req, res));

// ── Conflict Resolution Endpoints ───────────────────────────────────────────
router.get('/conflicts', (req, res) => conflictController.getConflicts(req, res));
router.get('/conflicts/:conflictId', (req, res) => conflictController.getConflictDetail(req, res));
router.post('/conflicts/:conflictId/resolve', (req, res) => conflictController.resolveConflict(req, res));
router.post('/conflicts/:conflictId/dismiss', (req, res) => conflictController.dismissConflict(req, res));

module.exports = router;

