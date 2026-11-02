const path = require('path');
const Hospital = require('../models/hospital.model');
const { verifyToken } = require('./auth.middleware');

/**
 * buildAuth.middleware.js
 * 
 * Middleware for securing mobile build downloads (APKs, AABs, and React Native builds).
 * Enforces strict authentication, role checks, and tenant isolation (FINDING-19 Remediation).
 * 
 * Access rules:
 * 1. Requires valid JWT (via Authorization header 'Bearer <token>' or query param '?token=<token>').
 * 2. Only 'centraladmin', 'superadmin', and 'hospitaladmin' are authorized.
 * 3. Central Admins ('centraladmin', 'superadmin') can access builds across all tenants.
 * 4. Hospital Admins ('hospitaladmin') are strictly constrained to their own hospital's builds.
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
            const isHospitalAdmin = role === 'hospitaladmin' || rawRole === 'hospitaladmin';
            req.isCentralAdmin = isCentralAdmin;

            // Only Central Admins and Hospital Admins have privileges for build artifacts
            if (!isCentralAdmin && !isHospitalAdmin) {
                return res.status(403).json({
                    success: false,
                    message: 'Access denied. Central Admin or Hospital Admin access required for build downloads.'
                });
            }

            // Central Admins have full access across tenants
            if (isCentralAdmin) {
                return next();
            }

            // Hospital Admin Scoping:
            // Case A: Parameterized route with target hospital ID (:id)
            if (req.params?.id) {
                const callerHospitalId = req.user?.hospitalId ? req.user.hospitalId.toString() : '';
                const targetHospitalId = req.params.id.toString();
                if (callerHospitalId && targetHospitalId && callerHospitalId === targetHospitalId) {
                    return next();
                }
                return res.status(403).json({
                    success: false,
                    message: 'Access denied. You cannot download builds for other hospitals.'
                });
            }

            // Case B: Static file download routes (/downloads/apks/*, /downloads/aabs/*)
            const rawPath = req.path || req.url || '';
            const filename = path.basename(rawPath).split('?')[0];

            if (!filename || filename === '.' || filename === '/') {
                return res.status(400).json({
                    success: false,
                    message: 'Build artifact filename is required.'
                });
            }

            // Path Traversal Prevention
            if (rawPath.includes('..') || path.normalize(rawPath).includes('..')) {
                return res.status(403).json({
                    success: false,
                    message: 'Access denied: Invalid file path.'
                });
            }

            const callerHospitalId = req.user?.hospitalId ? req.user.hospitalId.toString() : '';
            if (!callerHospitalId) {
                return res.status(403).json({
                    success: false,
                    message: 'Access denied. Hospital context missing.'
                });
            }

            const hospital = await Hospital.findById(callerHospitalId).lean();
            if (!hospital) {
                return res.status(404).json({
                    success: false,
                    message: 'Hospital not found.'
                });
            }

            const safeName = hospital.name ? hospital.name.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() : '';
            const brandName = (hospital.brandingSchema?.appName || hospital.branding?.appName || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
            const slug = hospital.slug ? hospital.slug.toLowerCase() : '';

            const lowerFile = filename.toLowerCase();
            let isAuthorized = false;

            const configuredFiles = [
                hospital.appConfig?.apkUrl,
                hospital.appConfig?.aabUrl,
                hospital.appConfig?.rnApkUrl,
                hospital.appConfig?.rnAabUrl
            ].filter(Boolean).map(url => path.basename(url).toLowerCase());

            if (configuredFiles.includes(lowerFile)) {
                isAuthorized = true;
            }

            if (!isAuthorized && safeName) {
                if (lowerFile === `${safeName}-release.apk` ||
                    lowerFile === `${safeName}-release.aab` ||
                    lowerFile === `${safeName}-rn-release.apk` ||
                    lowerFile === `${safeName}-rn-release.aab` ||
                    lowerFile.startsWith(`${safeName}-`)) {
                    isAuthorized = true;
                }
            }

            if (!isAuthorized && brandName) {
                if (lowerFile === `${brandName}-release.apk` ||
                    lowerFile === `${brandName}-release.aab` ||
                    lowerFile === `${brandName}-rn-release.apk` ||
                    lowerFile === `${brandName}-rn-release.aab` ||
                    lowerFile.startsWith(`${brandName}-`)) {
                    isAuthorized = true;
                }
            }

            if (!isAuthorized && slug) {
                if (lowerFile === `${slug}-release.apk` ||
                    lowerFile === `${slug}-release.aab` ||
                    lowerFile === `${slug}-rn-release.apk` ||
                    lowerFile === `${slug}-rn-release.aab` ||
                    lowerFile.startsWith(`${slug}-`)) {
                    isAuthorized = true;
                }
            }

            // Demo fallback builds
            if (!isAuthorized && (req.user.isDemo || hospital.isDemo || req.isDemo) && lowerFile.startsWith('cityhospital-')) {
                isAuthorized = true;
            }

            if (!isAuthorized) {
                return res.status(403).json({
                    success: false,
                    message: 'Access denied. You cannot download builds for other hospitals.'
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
 * Validate download authorization and tenant scope for hospital builds
 */
const verifyBuildDownloadAccess = async (req, res, next) => {
    await authenticateBuildDownload(req, res, () => {
        if (req.isCentralAdmin) {
            return next();
        }
        const callerHospitalId = req.user?.hospitalId ? req.user.hospitalId.toString() : '';
        const targetHospitalId = req.params?.id ? req.params.id.toString() : '';
        if (callerHospitalId && targetHospitalId && callerHospitalId === targetHospitalId) {
            return next();
        }
        return res.status(403).json({
            success: false,
            message: 'Access denied. You cannot download builds for other hospitals.'
        });
    });
};

authenticateBuildDownload.authenticateBuildDownload = authenticateBuildDownload;
authenticateBuildDownload.verifyBuildDownloadAccess = verifyBuildDownloadAccess;

module.exports = authenticateBuildDownload;
module.exports.authenticateBuildDownload = authenticateBuildDownload;
module.exports.verifyBuildDownloadAccess = verifyBuildDownloadAccess;
