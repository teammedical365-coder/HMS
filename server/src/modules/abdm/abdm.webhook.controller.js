/**
 * abdm.webhook.controller.js — Official ABDM Sandbox M1 Callback & Webhook Handlers
 *
 * Implements the official ABDM asynchronous callback contracts:
 *   - POST /v0.5/users/auth/on-init
 *   - POST /v0.5/users/auth/on-confirm
 *   - POST /v0.5/users/auth/on-fetch-modes
 *   - POST /v0.5/patients/profile/on-share
 *   - POST /v0.5/links/link/on-init
 *   - POST /v0.5/links/link/on-confirm
 *
 * SECURITY & PRIVACY:
 *   - Strict request validation (requestId, timestamp drift checks)
 *   - Gateway header verification (X-CM-ID)
 *   - Idempotency & duplicate event deduplication
 *   - NEVER logs Aadhaar numbers, OTPs, or auth codes
 *   - Responds with official HTTP 202 Accepted ACK
 */

// In-memory LRU-style cache for deduplicating requestIds (max 10,000, 1-hour TTL)
const processedRequestMap = new Map();
const MAX_IDEMPOTENCY_KEYS = 10000;
const TIMESTAMP_DRIFT_TOLERANCE_MS = 15 * 60 * 1000; // 15 minutes

function cleanIdempotencyCache() {
    const now = Date.now();
    for (const [key, expireAt] of processedRequestMap.entries()) {
        if (now > expireAt) {
            processedRequestMap.delete(key);
        }
    }
}

/**
 * Validates official ABDM Gateway callback security and structure
 */
function validateAbdmCallback(req, res) {
    const { body, headers } = req;

    // 1. Gateway header validation
    const xCmId = (headers['x-cm-id'] || '').trim().toLowerCase();
    const expectedCmId = (process.env.ABDM_X_CM_ID || 'sbx').trim().toLowerCase();
    if (xCmId && xCmId !== expectedCmId && xCmId !== 'sbx' && xCmId !== 'abdm') {
        return {
            valid: false,
            status: 401,
            error: `Unauthorized ABDM Gateway source: invalid X-CM-ID '${xCmId}'`
        };
    }

    // 2. Body structure validation
    if (!body || typeof body !== 'object') {
        return {
            valid: false,
            status: 400,
            error: 'Malformed callback: request body is missing or invalid'
        };
    }

    const { requestId, timestamp } = body;
    if (!requestId || typeof requestId !== 'string') {
        return {
            valid: false,
            status: 400,
            error: 'Malformed callback: requestId is required'
        };
    }

    if (!timestamp || isNaN(Date.parse(timestamp))) {
        return {
            valid: false,
            status: 400,
            error: 'Malformed callback: valid ISO timestamp is required'
        };
    }

    // 3. Timestamp drift validation (prevent replay attacks)
    const requestTime = new Date(timestamp).getTime();
    const now = Date.now();
    if (Math.abs(now - requestTime) > TIMESTAMP_DRIFT_TOLERANCE_MS) {
        return {
            valid: false,
            status: 400,
            error: 'Callback rejected: timestamp drift exceeds acceptable 15-minute tolerance window'
        };
    }

    // 4. Idempotency check
    cleanIdempotencyCache();
    if (processedRequestMap.has(requestId)) {
        return {
            valid: true,
            isDuplicate: true,
            requestId
        };
    }

    // Register requestId for 1 hour
    if (processedRequestMap.size >= MAX_IDEMPOTENCY_KEYS) {
        const oldestKey = processedRequestMap.keys().next().value;
        processedRequestMap.delete(oldestKey);
    }
    processedRequestMap.set(requestId, now + 3600 * 1000);

    return {
        valid: true,
        isDuplicate: false,
        requestId
    };
}

/**
 * Format safe structured log without leaking sensitive credentials or PII
 */
function logSafeAbdmEvent(eventType, body) {
    const safeSummary = {
        event: eventType,
        requestId: body.requestId,
        timestamp: body.timestamp,
        hasError: Boolean(body.error),
        errorCode: body.error?.code || null,
        respRequestId: body.resp?.requestId || null,
        txnId: body.auth?.transactionId || body.transactionId || null,
        authMode: body.auth?.mode || null
    };

    if (process.env.NODE_ENV !== 'test') {
        console.log(`[ABDM Webhook] ${eventType}:`, JSON.stringify(safeSummary));
    }
}

/**
 * Standard HTTP 202 Accepted response for ABDM Gateway callbacks
 */
function sendAbdmAck(res, requestId) {
    return res.status(202).json({
        status: 'ACK',
        timestamp: new Date().toISOString(),
        requestId: requestId || null
    });
}

// ── Webhook Handlers ──────────────────────────────────────────────────────────

/**
 * Callback 1: POST /v0.5/users/auth/on-init
 * Gateway delivers auth transaction ID and auth mode
 */
exports.handleAuthOnInit = async (req, res) => {
    const validation = validateAbdmCallback(req, res);
    if (!validation.valid) {
        return res.status(validation.status).json({
            error: { code: validation.status, message: validation.error }
        });
    }

    logSafeAbdmEvent('users/auth/on-init', req.body);

    // If duplicate, acknowledge immediately
    if (validation.isDuplicate) {
        return sendAbdmAck(res, validation.requestId);
    }

    // Process event state (e.g. correlate with initiating requestId)
    const { auth, error, resp } = req.body;
    if (error) {
        console.warn(`[ABDM on-init] Error returned from gateway for req ${resp?.requestId}:`, error.message);
    }

    return sendAbdmAck(res, validation.requestId);
};

/**
 * Callback 2: POST /v0.5/users/auth/on-confirm
 * Gateway delivers confirmed auth token and patient profile
 */
exports.handleAuthOnConfirm = async (req, res) => {
    const validation = validateAbdmCallback(req, res);
    if (!validation.valid) {
        return res.status(validation.status).json({
            error: { code: validation.status, message: validation.error }
        });
    }

    logSafeAbdmEvent('users/auth/on-confirm', req.body);

    if (validation.isDuplicate) {
        return sendAbdmAck(res, validation.requestId);
    }

    const { auth, error, resp } = req.body;
    if (error) {
        console.warn(`[ABDM on-confirm] Error returned from gateway for req ${resp?.requestId}:`, error.message);
    }

    return sendAbdmAck(res, validation.requestId);
};

/**
 * Callback 3: POST /v0.5/users/auth/on-fetch-modes
 * Gateway delivers available auth modes for user
 */
exports.handleAuthOnFetchModes = async (req, res) => {
    const validation = validateAbdmCallback(req, res);
    if (!validation.valid) {
        return res.status(validation.status).json({
            error: { code: validation.status, message: validation.error }
        });
    }

    logSafeAbdmEvent('users/auth/on-fetch-modes', req.body);

    if (validation.isDuplicate) {
        return sendAbdmAck(res, validation.requestId);
    }

    return sendAbdmAck(res, validation.requestId);
};

/**
 * Callback 4: POST /v0.5/patients/profile/on-share
 * ABHA Scan & Share / Profile sharing callback
 */
exports.handleProfileOnShare = async (req, res) => {
    const validation = validateAbdmCallback(req, res);
    if (!validation.valid) {
        return res.status(validation.status).json({
            error: { code: validation.status, message: validation.error }
        });
    }

    logSafeAbdmEvent('patients/profile/on-share', req.body);

    if (validation.isDuplicate) {
        return sendAbdmAck(res, validation.requestId);
    }

    return sendAbdmAck(res, validation.requestId);
};

/**
 * Callback 5: POST /v0.5/links/link/on-init
 * Care-context / Record linking init callback
 */
exports.handleLinkOnInit = async (req, res) => {
    const validation = validateAbdmCallback(req, res);
    if (!validation.valid) {
        return res.status(validation.status).json({
            error: { code: validation.status, message: validation.error }
        });
    }

    logSafeAbdmEvent('links/link/on-init', req.body);

    if (validation.isDuplicate) {
        return sendAbdmAck(res, validation.requestId);
    }

    return sendAbdmAck(res, validation.requestId);
};

/**
 * Callback 6: POST /v0.5/links/link/on-confirm
 * Care-context / Record linking confirm callback
 */
exports.handleLinkOnConfirm = async (req, res) => {
    const validation = validateAbdmCallback(req, res);
    if (!validation.valid) {
        return res.status(validation.status).json({
            error: { code: validation.status, message: validation.error }
        });
    }

    logSafeAbdmEvent('links/link/on-confirm', req.body);

    if (validation.isDuplicate) {
        return sendAbdmAck(res, validation.requestId);
    }

    return sendAbdmAck(res, validation.requestId);
};

/**
 * Helper to clear idempotency cache (for tests)
 */
exports._clearIdempotencyCache = () => {
    processedRequestMap.clear();
};
