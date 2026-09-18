const Hospital = require('../models/hospital.model');

// Simple TTL Cache for tenant domain resolution to prevent DB bottleneck
const tenantCache = new Map();
const CACHE_TTL_MS = 1000 * 60 * 5; // 5 minutes

// Reserved base domains that should never be queried as custom domains
const ADMIN_HOST = (process.env.ADMIN_HOST || 'admin.medical365.in').toLowerCase();
const BASE_DOMAIN = (process.env.BASE_DOMAIN || 'medical365.in').toLowerCase();

const RESERVED_DOMAINS = new Set([
    'localhost',
    '127.0.0.1',
    BASE_DOMAIN,
    `www.${BASE_DOMAIN}`,
    `api.${BASE_DOMAIN}`
]);

/**
 * Custom Domain Resolution Middleware
 * Maps incoming HTTP Host header to a specific hospital tenant.
 * 
 * Now properly validates *.medical365.in subdomains against the database
 * instead of blindly skipping them.
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
        const isCentralAdminDomain = hostname === ADMIN_HOST 
            || forwardedHost.includes(ADMIN_HOST)
            || req.headers['x-app-type'] === 'central-admin';
        
        if (isCentralAdminDomain) {
            req.tenant = null;
            req.isCentralAdmin = true;
            return next();
        }

        // 1. Skip exact reserved base platform domains (but NOT subdomains of base domain)
        if (RESERVED_DOMAINS.has(hostname)) {
            req.tenant = null;
            return next();
        }

        // 2. Handle *.medical365.in subdomains — look up by slug
        if (hostname.endsWith(`.${BASE_DOMAIN}`)) {
            const slug = hostname.replace(`.${BASE_DOMAIN}`, '');
            
            // Check cache
            const now = Date.now();
            const cached = tenantCache.get(hostname);
            if (cached && (now - cached.timestamp < CACHE_TTL_MS)) {
                req.tenant = cached.tenant;
                return next();
            }

            // Look up hospital by slug
            const hospital = await Hospital.findOne({
                slug: slug,
                isActive: true
            }).select('_id name slug customDomain branding isWhitelabeled appConfig').lean();

            // Cache the result (even null, to prevent repeated DB queries for invalid slugs)
            tenantCache.set(hostname, {
                tenant: hospital || null,
                timestamp: now
            });

            req.tenant = hospital || null;
            return next();
        }

        // 3. Handle non-medical365.in domains (custom hospital domains)
        // Check in-memory cache
        const now = Date.now();
        const cached = tenantCache.get(hostname);
        if (cached && (now - cached.timestamp < CACHE_TTL_MS)) {
            req.tenant = cached.tenant;
            return next();
        }

        // 4. Cache miss: Query Database for custom domains
        const hospital = await Hospital.findOne({
            $or: [
                { customDomain: hostname },
                { slug: hostname }
            ],
            isActive: true
        }).select('_id name slug customDomain branding isWhitelabeled appConfig').lean();

        // 5. Update Cache
        tenantCache.set(hostname, {
            tenant: hospital || null,
            timestamp: now
        });

        // 6. Attach and proceed
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
