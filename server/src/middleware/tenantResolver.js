const Hospital = require('../models/hospital.model');

// Simple TTL Cache for tenant domain resolution to prevent DB bottleneck
const tenantCache = new Map();
const CACHE_TTL_MS = 1000 * 60 * 5; // 5 minutes

// Reserved base domains that should never be queried as custom domains
const RESERVED_DOMAINS = new Set([
    'localhost',
    '127.0.0.1',
    'medical365.in',
    'www.medical365.in',
    'api.medical365.in'
]);

/**
 * Custom Domain Resolution Middleware
 * Maps incoming HTTP Host header to a specific hospital tenant.
 */
const tenantResolver = async (req, res, next) => {
    try {
        const hostHeader = req.headers.host;
        if (!hostHeader) {
            req.tenant = null;
            return next();
        }

        // Extract raw hostname without port
        const hostname = hostHeader.split(':')[0].toLowerCase();

        // ── Central Admin Domain Interception ──────────────────────────────────
        // Requests from admin.medical365.in must NEVER be routed through tenant DB.
        const forwardedHost = req.headers['x-forwarded-host'] || '';
        const isCentralAdminDomain = hostname === 'admin.medical365.in' 
            || forwardedHost.includes('admin.medical365.in')
            || req.headers['x-app-type'] === 'central-admin';
        
        if (isCentralAdminDomain) {
            req.tenant = null;
            req.isCentralAdmin = true;
            return next();
        }

        // 1. Skip reserved base platform domains
        if (RESERVED_DOMAINS.has(hostname) || hostname.endsWith('.medical365.in')) {
            req.tenant = null;
            return next();
        }

        // 2. Check in-memory cache
        const now = Date.now();
        const cached = tenantCache.get(hostname);
        if (cached && (now - cached.timestamp < CACHE_TTL_MS)) {
            req.tenant = cached.tenant;
            return next();
        }

        // 3. Cache miss: Query Database
        // Look up by customDomain or slug if they mapped a CNAME exactly to their slug (less common but possible)
        const hospital = await Hospital.findOne({
            $or: [
                { customDomain: hostname },
                { slug: hostname }
            ],
            isActive: true
        }).select('_id name slug customDomain branding isWhitelabeled appConfig').lean();

        // 4. Update Cache
        tenantCache.set(hostname, {
            tenant: hospital || null,
            timestamp: now
        });

        // 5. Attach and proceed
        req.tenant = hospital || null;
        next();
    } catch (error) {
        console.error('[TenantResolver] Error resolving tenant from host:', error);
        // Fail-safe: gracefully degrade to default multi-tenant mode
        req.tenant = null;
        next();
    }
};

module.exports = tenantResolver;
