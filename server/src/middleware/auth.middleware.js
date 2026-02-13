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

        // Populate the role data if it's an ObjectId reference
        let roleData = null;
        if (user.role === 'administrator') {
            // Special bootstrap role — full access
            roleData = {
                name: 'administrator',
                permissions: ['*'], // Wildcard = all permissions
                dashboardPath: '/administrator',
                navLinks: [],
                isSystemRole: true
            };
        } else if (user.role) {
            const mongoose = require('mongoose');
            if (mongoose.Types.ObjectId.isValid(user.role)) {
                // It's a proper ObjectId — fetch directly
                roleData = await Role.findById(user.role);
            }

            // If not found by ID (or it was a legacy string like 'admin', 'doctor'), try by name
            if (!roleData) {
                roleData = await Role.findOne({
                    name: { $regex: new RegExp(`^${user.role}$`, 'i') }
                });
                // Auto-migrate: update user's role to the ObjectId for future requests
                if (roleData) {
                    user.role = roleData._id;
                    await user.save();
                }
            }

            if (!roleData) {
                return res.status(403).json({ success: false, message: 'Your assigned role no longer exists. Contact admin.' });
            }
        }

        // Attach to request
        req.user = user;
        req.user._roleData = roleData; // Full role object
        next();
    } catch (error) {
        return res.status(401).json({ success: false, message: 'Invalid token' });
    }
};

/**
 * Generic permission-checking middleware factory.
 * Usage: requirePermission('admin_manage_roles', 'admin_view_stats')
 * The user must have AT LEAST ONE of the specified permissions.
 * Administrators (wildcard *) always pass.
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

            // Administrator wildcard — always allowed
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
 * Verify user is an administrator (bootstrap super-admin).
 * Use this only for system-level operations like first-time setup.
 */
exports.verifyAdministrator = async (req, res, next) => {
    try {
        await exports.verifyToken(req, res, () => {
            if (req.user.role === 'administrator') {
                next();
            } else {
                return res.status(403).json({ success: false, message: 'Administrator access required' });
            }
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

/**
 * BACKWARDS COMPATIBILITY — verifyAdmin and verifyAdminOrAdministrator
 * Now checks for admin_manage_roles permission OR administrator role.
 */
exports.verifyAdminOrAdministrator = async (req, res, next) => {
    try {
        await exports.verifyToken(req, res, () => {
            const roleData = req.user._roleData;

            // Administrator always passes
            if (req.user.role === 'administrator') return next();

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

exports.verifyAdmin = exports.verifyAdminOrAdministrator;