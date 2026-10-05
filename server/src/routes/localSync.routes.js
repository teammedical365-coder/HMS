const express = require('express');
const router = express.Router();

const { verifyToken } = require('../middleware/auth.middleware');
const { resolveTenant } = require('../middleware/tenantMiddleware');
const localAgentService = require('../services/localAgent/localAgent.service');
const localSyncController = require('../controllers/localSync.controller');

/**
 * Middleware: Verify Local Agent JWT
 */
const verifyAgentAuth = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization || req.headers['x-agent-token'];
        if (!authHeader) {
            return res.status(401).json({ success: false, message: 'Agent authorization header required.' });
        }
        const { decoded } = localAgentService.verifyAgentToken(authHeader);
        req.agent = {
            hospitalId: decoded.hospitalId,
            installationId: decoded.installationId
        };
        next();
    } catch (err) {
        return res.status(401).json({ success: false, message: `Agent auth error: ${err.message}` });
    }
};

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
            message: 'Access denied. Only Hospital Admin is authorized to manage local sync.'
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Internal authorization error' });
    }
};

// ── Local Agent Machine Routes (Authenticated via Agent JWT) ──────────────────
router.get('/initial-sync/batch', verifyAgentAuth, (req, res) => localSyncController.getInitialSyncBatch(req, res));
router.post('/initial-sync/progress', verifyAgentAuth, (req, res) => localSyncController.reportInitialSyncProgress(req, res));
router.get('/events', verifyAgentAuth, (req, res) => localSyncController.getPendingEvents(req, res));
router.post('/ack', verifyAgentAuth, (req, res) => localSyncController.acknowledgeEvents(req, res));
router.post('/push', verifyAgentAuth, (req, res) => localSyncController.pushLocalBatch(req, res));

const conflictController = require('../controllers/conflict.controller');

// ── Hospital Admin Management Routes ──────────────────────────────────────────
router.get('/status', verifyToken, resolveTenant, verifyHospitalAdmin, (req, res) => localSyncController.getSyncStatus(req, res));
router.post('/start-initial-sync', verifyToken, resolveTenant, verifyHospitalAdmin, (req, res) => localSyncController.startInitialSync(req, res));
router.post('/sync-now', verifyToken, resolveTenant, verifyHospitalAdmin, (req, res) => localSyncController.syncNow(req, res));
router.post('/retry-failed', verifyToken, resolveTenant, verifyHospitalAdmin, (req, res) => localSyncController.retryFailed(req, res));
router.get('/conflicts', verifyToken, resolveTenant, verifyHospitalAdmin, (req, res) => conflictController.getConflicts(req, res));
router.get('/conflicts/:conflictId', verifyToken, resolveTenant, verifyHospitalAdmin, (req, res) => conflictController.getConflictDetail(req, res));
router.post('/conflicts/:conflictId/resolve', verifyToken, resolveTenant, verifyHospitalAdmin, (req, res) => conflictController.resolveConflict(req, res));
router.post('/conflicts/:conflictId/dismiss', verifyToken, resolveTenant, verifyHospitalAdmin, (req, res) => conflictController.dismissConflict(req, res));
router.get('/upload-stats', verifyToken, resolveTenant, verifyHospitalAdmin, (req, res) => localSyncController.getUploadStats(req, res));

// ── Phase 6: Production Readiness Routes ──────────────────────────────────────
router.post('/verify-integrity', verifyToken, resolveTenant, verifyHospitalAdmin, (req, res) => localSyncController.verifyIntegrity(req, res));
router.get('/health', verifyToken, resolveTenant, verifyHospitalAdmin, (req, res) => localSyncController.getSyncHealth(req, res));
router.get('/rebuild-status', verifyToken, resolveTenant, verifyHospitalAdmin, (req, res) => localSyncController.getRebuildStatus(req, res));
router.post('/rebuild', verifyToken, resolveTenant, verifyHospitalAdmin, (req, res) => localSyncController.rebuildLocalDatabase(req, res));
router.get('/backup-status', verifyToken, resolveTenant, verifyHospitalAdmin, (req, res) => localSyncController.getBackupStatus(req, res));

module.exports = router;

