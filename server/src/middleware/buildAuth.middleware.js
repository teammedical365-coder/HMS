const path = require('path');
const Hospital = require('../models/hospital.model');
const { verifyToken } = require('./auth.middleware');

/**
 * buildAuth.middleware.js
 * 
 * Middleware for securing mobile build downloads (APKs, AABs, and React Native builds).
 * Enforces strict authentication, role checks, and access restriction.
 * 
 * Access rules:
 * 1. Requires valid JWT (via Authorization header 'Bearer <token>' or query param '?token=<token>').
 * 2. Only Central Super Admins ('centraladmin', 'superadmin') are authorized to download builds.
 * 3. Hospital Admins ('hospitaladmin') and all other roles are strictly prohibited from downloading
 *    build artifacts and are rejected with HTTP 403 Forbidden.
 */

const authenticateBuildDownload = async (req, res, next) => {
    try {
        // 1. Support standard Authorization header, URL query param, and cookie fallback
        if (!req.headers.authorization) {
            const candidateToken = req.query?.token || req.headers?.['x-access-token'] || req.cookies?.token || req.cookies?.jwt;
            if (candidateToken && typeof candidateToken === 'string') {
                const cleanToken = candidateToken.trim();
                req.headers.authorization = cleanToken.startsWith('Bearer ') ? cleanToken : `Bearer ${cleanToken}`;
            }
        }

        // 2. Verify token and attach user
        await verifyToken(req, res, async () => {
            const rawRole = typeof req.user?.role === 'string' ? req.user.role.toLowerCase() : '';
            const role = (req.user?._roleData?.name || rawRole || '').toLowerCase();
            const isCentralAdmin = role === 'centraladmin' || role === 'superadmin' || rawRole === 'centraladmin' || rawRole === 'superadmin';
            req.isCentralAdmin = isCentralAdmin;

            // Restrict downloads exclusively to the verified Central Super Admin role.
            // Hospital Admins and all other roles must not have direct download access and are rejected with HTTP 403.
            if (!isCentralAdmin) {
                return res.status(403).json({
                    success: false,
                    message: 'Access denied. Central Super Admin access required for build downloads.'
                });
            }

            return next();
        });
    } catch (err) {
        console.error('[authenticateBuildDownload Error]:', err);
        return res.status(500).json({
            success: false,
            message: 'An internal error occurred during download authentication'
        });
    }
};

/**
 * Validate download authorization for hospital builds (Central Super Admin only)
 */
const verifyBuildDownloadAccess = async (req, res, next) => {
    await authenticateBuildDownload(req, res, () => {
        if (req.isCentralAdmin) {
            return next();
        }
        return res.status(403).json({
            success: false,
            message: 'Access denied. Central Super Admin access required for build downloads.'
        });
    });
};

authenticateBuildDownload.authenticateBuildDownload = authenticateBuildDownload;
authenticateBuildDownload.verifyBuildDownloadAccess = verifyBuildDownloadAccess;

module.exports = authenticateBuildDownload;
module.exports.authenticateBuildDownload = authenticateBuildDownload;
module.exports.verifyBuildDownloadAccess = verifyBuildDownloadAccess;
