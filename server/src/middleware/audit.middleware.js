const AuditLog = require('../models/auditLog.model');

/**
 * auditLog(action, getTargetFn?)
 *
 * Middleware factory. Writes one AuditLog entry after the route handler
 * responds. Never blocks the response — fires asynchronously.
 *
 * Usage:
 *   router.get('/:id', verifyToken, auditLog('VIEW_PATIENT'), handler);
 *
 * getTargetFn is optional: (req, res) => ({ model, id, label })
 */
const auditLog = (action, getTargetFn) => {
    return (req, res, next) => {
        const originalJson = res.json.bind(res);

        res.json = function (body) {
            const result = originalJson(body);

            // Fire-and-forget — never delay the response
            setImmediate(async () => {
                try {
                    const user = req.user;
                    const hospitalId = user?.hospitalId || req.hospitalId;
                    if (!hospitalId) return;

                    const target = getTargetFn ? getTargetFn(req, res) : {};

                    await AuditLog.create({
                        clinicId:    hospitalId,
                        userId:      user?._id || null,
                        userName:    user?.name || user?.email || 'Unknown',
                        role:        user?._roleData?.name || String(user?.role || ''),
                        action,
                        targetModel: target.model || '',
                        targetId:    target.id   || null,
                        targetLabel: target.label || '',
                        ip:          req.ip || req.connection?.remoteAddress || '',
                        userAgent:   req.headers['user-agent'] || '',
                        success:     res.statusCode < 400,
                        reason:      res.statusCode >= 400 ? (body?.message || '') : '',
                    });
                } catch {
                    // Audit failure must never crash the app
                }
            });

            return result;
        };

        next();
    };
};

module.exports = auditLog;
