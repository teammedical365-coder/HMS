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
let warnedUnsigned = false;
let joseMod = null;
let jwks = null;

const deny = (res, status, message) => res.status(status).json({ error: { code: status, message } });

async function verifySignature(token) {
    if (!joseMod) joseMod = await import('jose'); // works from CommonJS; jose may be ESM-only
    if (!jwks) jwks = joseMod.createRemoteJWKSet(new URL(config.jwksUrl));
    await joseMod.jwtVerify(token, jwks, { clockTolerance: 60 });
}

async function verifyAbdmCallback(req, res, next) {
    try {
        if (!config.isConfigured()) return deny(res, 503, 'ABDM is not configured on this server');

        // 1. X-CM-ID is REQUIRED and must match (no "if present" leniency)
        const cm = String(req.get('X-CM-ID') || '').trim().toLowerCase();
        if (!cm || cm !== config.xCmId.toLowerCase()) return deny(res, 401, 'Invalid or missing X-CM-ID');

        // 2. Signed bearer token from the gateway
        const auth = String(req.get('Authorization') || '');
        const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
        if (config.jwksUrl) {
            if (!token) return deny(res, 401, 'Missing bearer token');
            try { await verifySignature(token); } catch (_) { return deny(res, 401, 'Invalid gateway token'); }
        } else if (config.allowUnsignedCallbacks) {
            if (!warnedUnsigned) {
                warnedUnsigned = true;
                console.warn('[ABDM] WARNING: callback signature verification is OFF (sandbox only). Set ABDM_JWKS_URL.');
            }
        } else {
            return deny(res, 503, 'Callback verification is not configured (set ABDM_JWKS_URL)');
        }

        // 3. Basic shape + replay window
        const body = req.body;
        if (!body || typeof body !== 'object') return deny(res, 400, 'Malformed callback body');
        const ts = Date.parse(req.get('TIMESTAMP') || body.timestamp || '');
        if (!Number.isNaN(ts) && Math.abs(Date.now() - ts) > DRIFT_MS) return deny(res, 400, 'Callback timestamp outside allowed window');

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

module.exports = { ABDM_CALLBACK_PATH, abdmCallbackLimiter, verifyAbdmCallback, abdmCallbackHandler };
