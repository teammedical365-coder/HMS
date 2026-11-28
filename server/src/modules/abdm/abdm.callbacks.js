'use strict';
/**
 * abdm.callbacks.js - the PUBLIC callback layer ABDM posts to (your "bridge").
 *
 * Mount in app.js BEFORE tenantResolver and BEFORE the /api generalLimiter:
 *   const { ABDM_CALLBACK_PATH, abdmCallbackLimiter, verifyAbdmCallback, abdmCallbackHandler } =
 *       require('./modules/abdm/abdm.callbacks');
 *   app.post(ABDM_CALLBACK_PATH, abdmCallbackLimiter, verifyAbdmCallback, abdmCallbackHandler);
 *
 * Contract: verify -> persist (idempotent) -> reply 202 immediately -> process in background.
 */
const rateLimit = require('express-rate-limit');
const config = require('./abdm.config');
const AbdmInbox = require('../../models/abdmInbox.model');

// Matches /v3/.., /api/v3/.., /api/callbacks/v3/.., /v0.5/.., /hip/.., /user-initiated-linking/..,
// /consent/v3/.., /data-flow/.., /patient-share/..   (suffix routing happens in the processor)
const ABDM_CALLBACK_PATH = /^\/(?:(?:api\/)?(?:callbacks\/)?v3\/|v0\.5\/|hip\/|user-initiated-linking\/|consent\/v3\/|data-flow\/|patient-share\/)/;

// ABDM calls from a small set of IPs: do NOT use the 200/15min general limiter.
const abdmCallbackLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 600,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: { code: 429, message: 'Too many requests' } },
});

const DRIFT_MS = 15 * 60 * 1000;
const ALLOWED_CALLBACK_ALGORITHMS = ['RS256', 'RS384', 'RS512', 'ES256', 'ES384', 'PS256'];
const JWKS_REFRESH_COOLDOWN_MS = 15 * 1000;
const JWKS_GLOBAL_MIN_INTERVAL_MS = 2 * 1000;

let warnedUnsigned = false;
let joseMod = null;
let jwks = null;
let cachedJwksUrl = null;
let lastJwksResetAt = 0;
const lastKidRefreshAt = new Map();
let cachedPublicKeyPem = null;
let importedPublicKey = null;

const deny = (res, status, message) => res.status(status).json({ error: { code: status, message } });

async function getJose() {
    if (!joseMod) joseMod = await import('jose'); // works from CommonJS; jose v6 is ESM-only
    return joseMod;
}

async function buildRemoteJwks(forceReset = false) {
    const jose = await getJose();
    const jwksCheck = config.parseJwksUrl(config.jwksUrl);
    if (!jwksCheck.valid || !jwksCheck.url) {
        throw new Error(jwksCheck.reason || 'Invalid ABDM_JWKS_URL');
    }
    if (forceReset || !jwks || cachedJwksUrl !== jwksCheck.url) {
        cachedJwksUrl = jwksCheck.url;
        const options = {
            cooldownDuration: 30000,
            cacheMaxAge: 600000,
            timeoutDuration: 8000,
        };
        if (jwksCheck.url.includes('abdm.gov.in')) {
            try {
                const client = require('./abdm.client');
                if (client.isConfigured()) {
                    const gwToken = await client.getGatewayToken();
                    if (gwToken) options.headers = { Authorization: `Bearer ${gwToken}` };
                }
            } catch (_) {}
        }
        jwks = jose.createRemoteJWKSet(new URL(jwksCheck.url), options);
    }
    return jwks;
}

async function getPublicKeyMaterial() {
    const jose = await getJose();
    if (config.jwksUrl) {
        return buildRemoteJwks(false);
    }
    if (config.callbackPublicKey) {
        if (!importedPublicKey || cachedPublicKeyPem !== config.callbackPublicKey) {
            cachedPublicKeyPem = config.callbackPublicKey;
            importedPublicKey = await jose.importSPKI(config.callbackPublicKey, 'RS256');
        }
        return importedPublicKey;
    }
    throw new Error('No ABDM callback verification key configured');
}

function buildJwtVerifyOptions() {
    const opts = {
        algorithms: ALLOWED_CALLBACK_ALGORITHMS,
        clockTolerance: 60,
        requiredClaims: ['exp'],
    };
    if (Array.isArray(config.jwtIssuers) && config.jwtIssuers.length === 1) {
        opts.issuer = config.jwtIssuers[0];
    } else if (Array.isArray(config.jwtIssuers) && config.jwtIssuers.length > 1) {
        opts.issuer = config.jwtIssuers;
    }
    if (config.jwtAudience) {
        opts.audience = config.jwtAudience;
    }
    return opts;
}

async function verifySignature(token) {
    const jose = await getJose();
    const verifyOptions = buildJwtVerifyOptions();
    const keySource = await getPublicKeyMaterial();

    let verified;
    try {
        verified = await jose.jwtVerify(token, keySource, verifyOptions);
    } catch (err) {
        // Safely handle JWKS key rotation ONLY when kid is missing from cached JWKS
        // so invalid signatures on known kids fail immediately without resetting rotation state.
        const isUnknownKid = Boolean(config.jwksUrl && err?.code === 'ERR_JWKS_NO_MATCHING_KEY');
        if (!isUnknownKid) {
            throw err;
        }
        let kidKey = '__default__';
        try {
            const header = jose.decodeProtectedHeader(token);
            if (header && header.kid) kidKey = String(header.kid);
        } catch (_) {}

        const now = Date.now();
        const kidPrev = lastKidRefreshAt.get(kidKey) || 0;
        if (now - kidPrev > JWKS_REFRESH_COOLDOWN_MS && now - lastJwksResetAt > JWKS_GLOBAL_MIN_INTERVAL_MS) {
            lastJwksResetAt = now;
            if (lastKidRefreshAt.size >= 50) lastKidRefreshAt.clear();
            lastKidRefreshAt.set(kidKey, now);
            const refreshedSet = await buildRemoteJwks(true);
            verified = await jose.jwtVerify(token, refreshedSet, verifyOptions);
        } else {
            throw err;
        }
    }

    if (!verified || !verified.payload || typeof verified.payload.exp !== 'number') {
        throw new Error('Callback token missing required expiry claim');
    }
    return verified;
}

async function verifyAbdmCallback(req, res, next) {
    try {
        if (!config.isConfigured()) return deny(res, 503, 'ABDM is not configured on this server');

        // 1. X-CM-ID is REQUIRED and must match
        const cm = String(req.get('X-CM-ID') || '').trim().toLowerCase();
        if (!cm || cm !== config.xCmId.toLowerCase()) return deny(res, 401, 'Invalid or missing X-CM-ID');

        // 2. Cryptographic signature verification (JWKS or configured public key)
        const isProductionOrStaging =
            ['production', 'staging'].includes(String(process.env.NODE_ENV || '').toLowerCase()) ||
            ['production', 'staging'].includes(String(config.env || '').toLowerCase());
        const hasVerificationKey = Boolean(config.jwksUrl || config.callbackPublicKey);

        const auth = String(req.get('Authorization') || '');
        const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';

        if (hasVerificationKey) {
            if (!token) return deny(res, 401, 'Missing bearer token');
            try {
                const verified = await verifySignature(token);
                req.abdmJwtPayload = {
                    sub: verified.payload.sub || null,
                    iss: verified.payload.iss || null,
                    exp: verified.payload.exp
                };
            } catch (sigErr) {
                return deny(res, 401, 'Invalid or expired gateway callback signature');
            }
        } else if (isProductionOrStaging || !config.allowUnsignedCallbacks) {
            return deny(res, 503, 'Callback signature verification is required (configure ABDM_JWKS_URL or ABDM_CALLBACK_PUBLIC_KEY)');
        } else {
            if (!warnedUnsigned) {
                warnedUnsigned = true;
                console.warn('[ABDM] WARNING: callback signature verification is OFF (explicit sandbox opt-in only). Configure ABDM_JWKS_URL.');
            }
        }

        // 3. Basic shape + replay window & mandatory timestamp
        const body = req.body;
        if (!body || typeof body !== 'object' || Array.isArray(body)) {
            return deny(res, 400, 'Malformed callback body');
        }

        const rawTimestamp = req.get('TIMESTAMP') || (body && body.timestamp);
        if (!rawTimestamp) return deny(res, 400, 'Missing mandatory callback timestamp');
        const ts = Date.parse(rawTimestamp);
        if (Number.isNaN(ts)) return deny(res, 400, 'Invalid callback timestamp format');
        if (Math.abs(Date.now() - ts) > DRIFT_MS) return deny(res, 400, 'Callback timestamp outside allowed window');

        return next();
    } catch (err) {
        console.error('[ABDM] callback verification error:', err.message);
        return deny(res, 500, 'Verification error');
    }
}

async function abdmCallbackHandler(req, res) {
    const requestId = String(req.get('REQUEST-ID') || (req.body && req.body.requestId) || '').trim();
    if (!requestId) return deny(res, 400, 'REQUEST-ID header is required');

    const hipId = String(req.get('X-HIP-ID') || (req.body && (req.body.hipId || (req.body.hip && req.body.hip.id))) || '').trim() || null;

    let doc;
    try {
        doc = await AbdmInbox.create({ requestId, path: req.path, hipId, payload: req.body, status: 'RECEIVED' });
    } catch (err) {
        if (err && err.code === 11000) return res.status(202).json({ status: 'ACK', duplicate: true }); // already have it
        console.error('[ABDM] inbox write failed:', err.message);
        return deny(res, 500, 'Could not record callback');
    }

    // Log path + id only. Never log the payload (patient identifiers).
    console.log(`[ABDM] callback ${req.path} request-id=${requestId}`);
    res.status(202).json({ status: 'ACK', requestId });

    setImmediate(() => {
        require('./abdm.inbox.processor').processInbox(doc._id)
            .catch((e) => console.error('[ABDM] processing error:', e.message));
    });
}

module.exports = { ABDM_CALLBACK_PATH, abdmCallbackLimiter, verifyAbdmCallback, abdmCallbackHandler, verifySignature };
