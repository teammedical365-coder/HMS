const jwt = require('jsonwebtoken');
const User = require('../models/user.model');
const Role = require('../models/role.model');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

/**
 * Verify JWT token and attach user + populated role to req.user
 */
exports.verifyToken = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, message: 'No token provided' });
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);

        const user = await User.findById(decoded.userId);
        if (!user) return res.status(401).json({ success: false, message: 'User not found' });

        // hospitalId: prefer JWT payload (authoritative for hospital admins), fallback to DB
        if (decoded.hospitalId) {
            user.hospitalId = decoded.hospitalId;
        }

        // Populate the role data
        let roleData = null;
        const specialRoles = ['superadmin', 'centraladmin', 'hospitaladmin'];

        if (specialRoles.includes(user.role)) {
            const isCentral = user.role === 'centraladmin' || user.role === 'superadmin';
            roleData = {
                name: user.role,
                permissions: isCentral ? ['*'] : ['admin_manage_roles', 'admin_view_stats'],
                dashboardPath: isCentral ? '/supremeadmin' : '/hospitaladmin',
                navLinks: [],
                isSystemRole: true
            };
        } else if (user.role) {
            const mongoose = require('mongoose');
            if (mongoose.Types.ObjectId.isValid(user.role)) {
                roleData = await Role.findById(user.role);
            }

            if (!roleData) {
                const query = { name: { $regex: new RegExp(`^${user.role}$`, 'i') } };
                // Scope legacy role lookup to the user's hospital
                if (user.hospitalId) query.hospitalId = user.hospitalId;
                roleData = await Role.findOne(query);
                if (roleData) {
                    user.role = roleData._id;
                    await user.save();
                }
            }

            if (!roleData) {
                return res.status(403).json({ success: false, message: 'Your assigned role no longer exists. Contact admin.' });
            }
        }

        req.user = user;
        req.user._roleData = roleData;
        next();
    } catch (error) {
        return res.status(401).json({ success: false, message: 'Invalid token' });
    }
};

/**
 * Generic permission-checking middleware factory.
 * Usage: requirePermission('admin_manage_roles', 'admin_view_stats')
 * The user must have AT LEAST ONE of the specified permissions.
 * SuperAdmins (wildcard *) always pass.
 */
exports.requirePermission = (...requiredPermissions) => {
    return async (req, res, next) => {
        try {
            // verifyToken must run first
            if (!req.user) {
                return res.status(401).json({ success: false, message: 'Authentication required' });
            }

            const roleData = req.user._roleData;
            if (!roleData) {
                return res.status(403).json({ success: false, message: 'No role assigned. Contact admin.' });
            }

            // SuperAdmin wildcard — always allowed
            if (roleData.permissions && roleData.permissions.includes('*')) {
                return next();
            }

            // Check if user has at least one of the required permissions
            const userPerms = roleData.permissions || [];
            const hasPermission = requiredPermissions.some(perm => userPerms.includes(perm));

            if (!hasPermission) {
                return res.status(403).json({
                    success: false,
                    message: `Access denied. Required permission: ${requiredPermissions.join(' or ')}`
                });
            }

            next();
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    };
};

/**
 * Verify user is an superadmin (bootstrap super-admin).
 * Use this only for system-level operations like first-time setup.
 */
exports.verifySuperAdmin = async (req, res, next) => {
    try {
        await exports.verifyToken(req, res, () => {
            const role = req.user.role;
            if (role === 'superadmin' || role === 'centraladmin') {
                next();
            } else {
                return res.status(403).json({ success: false, message: 'Central Admin access required' });
            }
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

/**
 * BACKWARDS COMPATIBILITY — verifyAdmin and verifyAdminOrSuperAdmin
 * Now checks for admin_manage_roles permission OR superadmin role.
 */
exports.verifyAdminOrSuperAdmin = async (req, res, next) => {
    try {
        await exports.verifyToken(req, res, () => {
            const roleData = req.user._roleData;

            // Central admin always passes
            if (req.user.role === 'superadmin' || req.user.role === 'centraladmin') return next();

            // Hospital admin also passes for admin-level routes
            if (req.user.role === 'hospitaladmin') return next();

            // Check for admin-level permissions
            if (roleData && roleData.permissions &&
                (roleData.permissions.includes('*') ||
                    roleData.permissions.includes('admin_manage_roles') ||
                    roleData.permissions.includes('admin_view_stats'))) {
                return next();
            }

            return res.status(403).json({ success: false, message: 'Admin access required' });
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.verifyAdmin = exports.verifyAdminOrSuperAdmin;