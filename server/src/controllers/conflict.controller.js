const conflictResolutionService = require('../services/localAgent/conflictResolution.service');

class ConflictController {
    /**
     * GET /api/local-agent/conflicts
     * Query params: status (PENDING, RESOLVED, etc.), entityType, page, limit
     */
    async getConflicts(req, res) {
        try {
            const hospitalId = req.hospitalId || (req.user && req.user.hospitalId);
            if (!hospitalId) {
                return res.status(400).json({ success: false, message: 'Hospital identification required' });
            }

            const { status, entityType, limit, page } = req.query;

            const result = await conflictResolutionService.getConflicts({
                hospitalId,
                status,
                entityType,
                limit,
                page
            });

            return res.json({
                success: true,
                data: result
            });
        } catch (error) {
            console.error('[ConflictController] getConflicts error:', error);
            return res.status(500).json({
                success: false,
                message: error.message || 'Failed to fetch conflicts'
            });
        }
    }

    /**
     * GET /api/local-agent/conflicts/:conflictId
     * Returns conflict info, diff between local and cloud, and staleness check
     */
    async getConflictDetail(req, res) {
        try {
            const hospitalId = req.hospitalId || (req.user && req.user.hospitalId);
            const { conflictId } = req.params;

            if (!hospitalId) {
                return res.status(400).json({ success: false, message: 'Hospital identification required' });
            }

            const result = await conflictResolutionService.getConflictDetail({
                hospitalId,
                conflictId
            });

            return res.json({
                success: true,
                data: result
            });
        } catch (error) {
            console.error('[ConflictController] getConflictDetail error:', error);
            const statusCode = error.message.includes('not found') ? 404 : 500;
            return res.status(statusCode).json({
                success: false,
                message: error.message || 'Failed to fetch conflict detail'
            });
        }
    }

    /**
     * POST /api/local-agent/conflicts/:conflictId/resolve
     * Body: { resolutionType: 'KEEP_LOCAL' | 'KEEP_CLOUD' | 'MERGED', selectedMergeFields: {}, resolutionNotes: '' }
     */
    async resolveConflict(req, res) {
        try {
            const hospitalId = req.hospitalId || (req.user && req.user.hospitalId);
            const { conflictId } = req.params;
            const { resolutionType, selectedMergeFields, resolutionNotes } = req.body;

            if (!hospitalId) {
                return res.status(400).json({ success: false, message: 'Hospital identification required' });
            }

            if (!resolutionType || !['KEEP_LOCAL', 'KEEP_CLOUD', 'MERGED'].includes(resolutionType)) {
                return res.status(400).json({
                    success: false,
                    message: 'resolutionType is required and must be KEEP_LOCAL, KEEP_CLOUD, or MERGED'
                });
            }

            const result = await conflictResolutionService.resolveConflict({
                hospitalId,
                conflictId,
                resolutionType,
                selectedMergeFields,
                resolutionNotes,
                user: req.user
            });

            return res.json({
                success: true,
                message: result.message,
                data: result
            });
        } catch (error) {
            console.error('[ConflictController] resolveConflict error:', error);
            if (error.code === 'STALE_CONFLICT') {
                return res.status(409).json({
                    success: false,
                    code: 'STALE_CONFLICT',
                    message: error.message,
                    currentCloudVersion: error.currentCloudVersion,
                    conflictCloudVersion: error.conflictCloudVersion
                });
            }

            return res.status(400).json({
                success: false,
                message: error.message || 'Failed to resolve conflict'
            });
        }
    }

    /**
     * POST /api/local-agent/conflicts/:conflictId/dismiss
     * Body: { dismissalNotes: '' }
     */
    async dismissConflict(req, res) {
        try {
            const hospitalId = req.hospitalId || (req.user && req.user.hospitalId);
            const { conflictId } = req.params;
            const { dismissalNotes } = req.body;

            if (!hospitalId) {
                return res.status(400).json({ success: false, message: 'Hospital identification required' });
            }

            const result = await conflictResolutionService.dismissConflict({
                hospitalId,
                conflictId,
                dismissalNotes,
                user: req.user
            });

            return res.json({
                success: true,
                message: result.message,
                data: result
            });
        } catch (error) {
            console.error('[ConflictController] dismissConflict error:', error);
            return res.status(400).json({
                success: false,
                message: error.message || 'Failed to dismiss conflict'
            });
        }
    }
}

module.exports = new ConflictController();
