/**
 * applicationId.util.js
 * 
 * Generates a valid deterministic Android applicationId for every tenant.
 * Format: com.medical365.<lowercase-segment>
 * Segment regex: ^[a-z][a-z0-9_]*$
 * 
 * Complies with Android package naming rules:
 * - Must start with a lowercase ASCII letter [a-z]
 * - Contains only lowercase letters, digits, and underscores [a-z0-9_]
 * - Avoids Java/Android reserved keywords
 * - Deterministic for the same tenant
 * - Safe against collisions across tenants
 * - Does not modify or truncate the user-facing hospital/clinic display name
 */

const RESERVED_KEYWORDS = new Set([
    'abstract', 'assert', 'boolean', 'break', 'byte', 'case', 'catch', 'char',
    'class', 'const', 'continue', 'default', 'do', 'double', 'else', 'enum',
    'extends', 'final', 'finally', 'float', 'for', 'goto', 'if', 'implements',
    'import', 'instanceof', 'int', 'interface', 'long', 'native', 'new',
    'package', 'private', 'protected', 'public', 'return', 'short', 'static',
    'strictfp', 'super', 'switch', 'synchronized', 'this', 'throw', 'throws',
    'transient', 'try', 'void', 'volatile', 'while', 'true', 'false', 'null'
]);

/**
 * Normalizes any raw string into a safe, valid Android package segment.
 * 
 * @param {string} input - Raw hospital name, app name, or code
 * @param {string} [fallback='app'] - Fallback segment if input contains no valid characters
 * @returns {string} Valid lowercase segment matching ^[a-z][a-z0-9_]*$
 */
function normalizeSegment(input, fallback = 'app') {
    if (!input || typeof input !== 'string') {
        input = '';
    }

    let text = input.trim();

    // 1. If brand contains '&', prioritize the primary brand name before '&'
    // E.g. "Krishna IVF & Fertility" -> "Krishna IVF" -> "krishnaivf"
    if (text.includes('&')) {
        const parts = text.split('&');
        const candidate = parts[0].trim();
        if (candidate.replace(/[^a-zA-Z0-9]/g, '').length >= 2) {
            text = candidate;
        }
    }

    // 2. Convert to lowercase and strip all characters except a-z, 0-9, and underscores
    let normalized = text.toLowerCase().replace(/[^a-z0-9_]/g, '');

    // 3. Fallback if empty
    if (!normalized) {
        normalized = String(fallback).toLowerCase().replace(/[^a-z0-9_]/g, '') || 'app';
    }

    // 4. Ensure it starts with [a-z]. If starting with a digit or underscore, prepend 'app_'
    if (!/^[a-z]/.test(normalized)) {
        normalized = `app_${normalized}`;
    }

    // 5. Check if it matches a Java/Android reserved keyword
    if (RESERVED_KEYWORDS.has(normalized)) {
        normalized = `app_${normalized}`;
    }

    // 6. Clean consecutive and trailing underscores
    normalized = normalized.replace(/_+/g, '_').replace(/_+$/, '');

    // Truncate to reasonable length (max 50 chars for the segment)
    if (normalized.length > 50) {
        normalized = normalized.substring(0, 50).replace(/_+$/, '');
    }

    return normalized;
}

/**
 * Generates the full deterministic Android applicationId: com.medical365.<lowercase-segment>
 * 
 * @param {Object|string} hospitalOrName - Mongoose Hospital doc, tenant object, or string name
 * @param {Object|string} [options] - Options object or tenantId string
 * @param {string} [options.tenantId] - MongoDB _id or tenant identifier
 * @param {string} [options.hospitalCode] - Hospital code
 * @param {string} [options.clinicCode] - Clinic code
 * @param {string} [options.slug] - Hospital/clinic unique slug
 * @param {boolean} [options.disambiguate] - True if collision detected, appends tenant suffix
 * @returns {string} Fully qualified applicationId (e.g. "com.medical365.krishnaivf")
 */
function generateApplicationId(hospitalOrName, options = {}) {
    let rawName = '';
    let rawId = '';
    let rawCode = '';
    let rawSlug = '';
    let explicitAppId = '';
    let disambiguate = false;

    if (typeof hospitalOrName === 'string') {
        rawName = hospitalOrName;
        if (typeof options === 'string') {
            rawId = options;
        } else if (options && typeof options === 'object') {
            rawId = options.tenantId || '';
            rawCode = options.hospitalCode || options.clinicCode || '';
            rawSlug = options.slug || '';
            disambiguate = !!options.disambiguate;
        }
    } else if (hospitalOrName && typeof hospitalOrName === 'object') {
        const h = hospitalOrName;
        rawName = h.brandingSchema?.appName || h.branding?.appName || h.name || '';
        rawCode = h.hospitalCode || h.clinicCode || '';
        rawSlug = h.slug || '';
        rawId = (h._id ? h._id.toString() : '') || h.tenantId || '';
        explicitAppId = h.appConfig?.androidPackageId || '';
        if (typeof options === 'string') {
            rawId = options;
        } else if (options && typeof options === 'object') {
            if (options.disambiguate) disambiguate = true;
            if (options.tenantId) rawId = options.tenantId;
            if (options.hospitalCode) rawCode = options.hospitalCode;
            if (options.clinicCode) rawCode = options.clinicCode;
            if (options.slug) rawSlug = options.slug;
        }
    }

    // 1. If explicit valid androidPackageId was previously saved/locked, reuse it
    if (explicitAppId && typeof explicitAppId === 'string') {
        const clean = explicitAppId.trim().toLowerCase();
        if (clean.startsWith('com.medical365.')) {
            const seg = clean.replace('com.medical365.', '');
            const normalizedSeg = normalizeSegment(seg, 'app');
            return `com.medical365.${normalizedSeg}`;
        }
    }

    // 2. Base segment derivation
    const fallback = rawCode || rawSlug || (rawId ? `app_${rawId.substring(0, 8)}` : 'app');
    let baseSeg = normalizeSegment(rawName, fallback);

    // 3. Collision safety: append unique tenant suffix when necessary
    if (disambiguate && rawId) {
        const cleanId = rawId.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        const suffix = cleanId.substring(Math.max(0, cleanId.length - 6)) || cleanId.substring(0, 6);
        baseSeg = `${baseSeg}_${suffix}`;
    }

    return `com.medical365.${baseSeg}`;
}

module.exports = {
    normalizeSegment,
    generateApplicationId,
    RESERVED_KEYWORDS
};
