const jwt = require('jsonwebtoken');
const User = require('../models/user.model');
const Role = require('../models/role.model'); // Import the new Role model

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// --- NEW DYNAMIC PERMISSION MIDDLEWARE (The Core of your new System) ---
// Usage: router.post('/intake', verifyToken, checkPermission('visit_intake'), ...)
exports.checkPermission = (requiredPermission) => {
    return async (req, res, next) => {
        try {
            // req.user is already populated by verifyToken
            const user = req.user;

            if (!user) {
                return res.status(401).json({ success: false, message: 'User not authenticated' });
            }

            // 1. SUPER ADMIN BYPASS
            // If user has a role named 'Administrator' or 'Super Admin', they can do anything.
            const isSuperAdmin = user.roles.some(r =>
                r.name === 'Administrator' || r.name === 'Super Admin' || user.role === 'administrator'
            );
            if (isSuperAdmin) return next();

            // 2. CHECK CUSTOM PERMISSIONS (Overrides Roles)
            // If you explicitly granted/revoked a permission for this specific user
            const customPerm = user.customPermissions.find(cp => cp.permission === requiredPermission);
            if (customPerm) {
                if (customPerm.granted) return next(); // Explicitly granted
                else return res.status(403).json({ success: false, message: 'Permission explicitly denied for this user.' });
            }

            // 3. CHECK ROLE PERMISSIONS
            // Look through all the user's roles to see if ONE of them has the permission
            const hasPermission = user.roles.some(role =>
                role.permissions && role.permissions.includes(requiredPermission)
            );

            if (hasPermission) {
                return next();
            }

            // 4. DENY ACCESS
            return res.status(403).json({
                success: false,
                message: `Access denied. Requires permission: ${requiredPermission}`
            });

        } catch (error) {
            console.error('Permission check error:', error);
            return res.status(500).json({ success: false, message: 'Permission check failed' });
        }
    };
};

// --- UPDATED STANDARD MIDDLEWARE ---

// Middleware to verify JWT token (Updated to populate Roles)
exports.verifyToken = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                message: 'No token provided'
            });
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);

        // CRITICAL UPDATE: .populate('roles') loads the dynamic role data
        const user = await User.findById(decoded.userId).populate('roles');

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'User not found'
            });
        }

        // Attach full user object (including populated roles) to request
        req.user = user;

        next();
    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({ success: false, message: 'Invalid token' });
        }
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ success: false, message: 'Token expired' });
        }
        return res.status(500).json({ success: false, message: 'Authentication error', error: error.message });
    }
};

// Legacy Admin Check (Kept for backward compatibility)
exports.verifyAdmin = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ message: 'No token' });

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);

        const user = await User.findById(decoded.userId).populate('roles');

        if (!user) return res.status(401).json({ message: 'User not found' });

        // Check legacy 'role' string OR new dynamic 'roles'
        const isAdmin = user.role === 'administrator' || user.roles.some(r => r.name === 'Administrator');

        if (!isAdmin) {
            return res.status(403).json({ message: 'Access denied. Administrator privileges required.' });
        }

        req.user = user;
        next();
    } catch (error) {
        return res.status(401).json({ message: 'Invalid or expired token' });
    }
};

// Legacy Admin/Administrator Check
exports.verifyAdminOrAdministrator = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ message: 'No token' });

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await User.findById(decoded.userId).populate('roles');

        if (!user) return res.status(401).json({ message: 'User not found' });

        const hasAccess =
            user.role === 'admin' ||
            user.role === 'administrator' ||
            user.roles.some(r => r.name === 'Administrator' || r.name === 'Admin');

        if (!hasAccess) {
            return res.status(403).json({ message: 'Access denied. Admin privileges required.' });
        }

        req.user = user;
        next();
    } catch (error) {
        return res.status(500).json({ message: 'Auth Error', error: error.message });
    }
};