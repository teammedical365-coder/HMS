/**
 * tenantMiddleware.js — Hospital-ID-based Multi-Tenant Routing Middleware
 *
 * For every authenticated API request, this middleware:
 *   1. Reads hospitalId from the JWT token (already decoded by verifyToken)
 *   2. Gets/creates the Mongoose connection for that hospital's database
 *   3. Attaches req.tenantDb and req.hospitalId so any route can use it
 *
 * Routes that DON'T need tenant isolation (central admin, hospital listing)
 * can skip this middleware entirely.
 */

const { getTenantConnection } = require('../db/tenantDb');

/**
 * Middleware: resolves the tenant DB from req.user.hospitalId (set by verifyToken).
 * Attach req.tenantDb for use in route handlers.
 *
 * Usage in routes:
 *   router.get('/patients', verifyToken, resolveTenant, async (req, res) => {
 *       const { User } = getTenantModels(req.tenantDb);
 *       const patients = await User.find({});
 *   });
 */
exports.resolveTenant = async (req, res, next) => {
    try {
        // Central admins and supreme admins operate on master DB — skip tenant resolution
        const role = req.user?.role;
        const specialRoles = ['superadmin', 'centraladmin'];
        if (specialRoles.includes(role)) {
            req.tenantDb = null; // will use master DB
            req.hospitalId = null;
            return next();
        }

        const hospitalId = req.user?.hospitalId;
        if (!hospitalId) {
            // Staff without a hospitalId — could be legacy data
            // Allow the request through but without a tenant DB
            req.tenantDb = null;
            req.hospitalId = null;
            return next();
        }

        const tenantDb = await getTenantConnection(String(hospitalId));
        req.tenantDb = tenantDb;
        req.hospitalId = hospitalId;
        next();
    } catch (err) {
        console.error('Tenant resolution error:', err.message);
        return res.status(500).json({
            success: false,
            message: 'Failed to connect to hospital database. Please try again.',
        });
    }
};

/**
 * Middleware: strict version — rejects request if no tenant DB is resolved.
 * Use for routes that MUST have a hospital context (patient records, billing, etc.)
 */
exports.requireTenant = async (req, res, next) => {
    await exports.resolveTenant(req, res, () => {
        if (!req.tenantDb) {
            return res.status(400).json({
                success: false,
                message: 'This operation requires a hospital context. Ensure you are logged in as hospital staff.',
            });
        }
        next();
    });
};
