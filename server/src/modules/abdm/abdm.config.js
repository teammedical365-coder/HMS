'use strict';
/**
 * abdm.config.js - single source of truth for ABDM settings.
 * All values come from environment variables. Nothing secret is hardcoded.
 *
 * NOTE: every URL/path below is overridable by env because ABDM changes paths
 * between releases. Verify against the swagger/Postman collection on
 * https://sandbox.abdm.gov.in before go-live.
 */
const e = process.env;
const t = (v, d = '') => String(v === undefined || v === null ? d : v).trim();
const stripSlash = (s) => s.replace(/\/+$/, '');

const env = t(e.ABDM_ENV, 'sandbox').toLowerCase();
const nodeEnv = t(e.NODE_ENV, 'development').toLowerCase();
const isProdOrStaging = ['production', 'staging'].includes(env) || ['production', 'staging'].includes(nodeEnv);

function parseJwksUrl(raw) {
    const val = t(raw);
    if (!val) return { configured: false, valid: true, url: '' };
    let u;
    try {
        u = new URL(val);
    } catch (_) {
        return { configured: true, valid: false, url: val, reason: 'ABDM_JWKS_URL is not a valid URL' };
    }
    const isLocalHost = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
    if (u.protocol !== 'https:' && !( !isProdOrStaging && isLocalHost && u.protocol === 'http:' )) {
        return {
            configured: true,
            valid: false,
            url: val,
            reason: 'ABDM_JWKS_URL must use HTTPS (localhost HTTP allowed only in non-production testing)'
        };
    }
    return { configured: true, valid: true, url: val };
}

const config = {
    env, // 'sandbox' | 'production'
    clientId: t(e.ABDM_CLIENT_ID),
    clientSecret: t(e.ABDM_CLIENT_SECRET),
    xCmId: t(e.ABDM_X_CM_ID, env === 'production' ? 'abdm' : 'sbx'),

    // V3 gateway root (sessions, bridge url, HIP calls)  prod: https://apis.abdm.gov.in/api/hiecm
    gatewayBase: stripSlash(t(e.ABDM_GATEWAY_BASE, 'https://dev.abdm.gov.in/api/hiecm')),
    // Legacy gateway root, only used as a fallback for the session token
    legacyGatewayBase: stripSlash(t(e.ABDM_LEGACY_GATEWAY_BASE, 'https://dev.abdm.gov.in/gateway')),
    // ABHA V3 root   prod: https://abha.abdm.gov.in/api/abha
    abhaBase: stripSlash(t(e.ABDM_ABHA_BASE, 'https://abhasbx.abdm.gov.in/abha/api')),
    // Sandbox facility (HIP) registration. In production this is done through HFR, not by API.
    servicesUrl: t(e.ABDM_SERVICES_URL, 'https://dev.abdm.gov.in/devservice/v1/bridges/addUpdateServices'),

    // THE bridge URL: public HTTPS base of YOUR BACKEND (not the website). e.g. https://api.medical365.in
    bridgeUrl: stripSlash(t(e.ABDM_BRIDGE_URL)),
    // Hosts that must never be used as a bridge URL (your marketing site)
    forbiddenBridgeHosts: (t(e.ABDM_FORBIDDEN_BRIDGE_HOSTS, 'medical365.in,www.medical365.in'))
        .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),

    // Callback signature verification: URL of ABDM's published signing keys (JWKS) or explicit SPKI PEM
    jwksUrl: t(e.ABDM_JWKS_URL),
    callbackPublicKey: t(e.ABDM_CALLBACK_PUBLIC_KEY).replace(/\\n/g, '\n'),
    jwtIssuers: t(e.ABDM_JWT_ISSUER).split(',').map((s) => s.trim()).filter(Boolean),
    jwtAudience: t(e.ABDM_JWT_AUDIENCE),
    // Disabled by default in ALL environments. Sandbox bypass only works if explicitly opted-in outside prod/staging.
    allowUnsignedCallbacks: t(e.ABDM_ALLOW_UNSIGNED_CALLBACKS) === 'true' &&
        env === 'sandbox' &&
        !isProdOrStaging,

    // Sandbox-only fixed OTP for care-context linking when no SMS provider is wired yet
    sandboxFixedOtp: env === 'sandbox' && /^\d{6}$/.test(t(e.ABDM_SANDBOX_FIXED_OTP)) ? t(e.ABDM_SANDBOX_FIXED_OTP) : '',

    // Data push (Fidelius + FHIR) is a separate module. Keep false until it is built and tested.
    dataPushEnabled: t(e.ABDM_DATAPUSH_ENABLED) === 'true',

    timeoutMs: 25000,

    // Paths relative to gatewayBase. VERIFY against the current swagger.
    paths: {
        generateToken: '/v3/token/generate-token',
        linkCareContext: '/hip/v3/link/carecontext',
        onDiscover: '/user-initiated-linking/v3/patient/care-context/on-discover',
        onLinkInit: '/user-initiated-linking/v3/link/care-context/on-init',
        onLinkConfirm: '/user-initiated-linking/v3/link/care-context/on-confirm',
        onConsentNotify: '/consent/v3/request/hip/on-notify',
        onHealthInfoRequest: '/data-flow/v3/health-information/hip/on-request',
    },
};

config.isConfigured = () => Boolean(config.clientId && config.clientSecret);
config.parseJwksUrl = parseJwksUrl;

config.validateSecurityStartup = () => {
    const AbdmLinkToken = require('../../models/abdmLinkToken.model');
    const warnings = [];

    // 1. Validate encryption key strictly if set (throws immediately if weak/JWT_SECRET/default)
    const encCheck = AbdmLinkToken.validateEncryptionConfig({
        requireKey: isProdOrStaging && config.isConfigured()
    });
    if (!encCheck.configured) {
        warnings.push('ABDM_TOKEN_ENCRYPTION_KEY is not configured; ABDM link-token encryption/decryption will fail closed.');
    }

    // 2. Validate ABDM_JWKS_URL syntax/protocol when provided
    const jwksCheck = parseJwksUrl(config.jwksUrl);
    if (!jwksCheck.valid) {
        throw new Error(`[ABDM Config Error] ${jwksCheck.reason}`);
    }

    // 3. Enforce callback verification configuration in production / staging when ABDM is enabled
    if (isProdOrStaging && config.isConfigured() && !config.jwksUrl && !config.callbackPublicKey) {
        throw new Error('[ABDM Config Error] ABDM_JWKS_URL (or ABDM_CALLBACK_PUBLIC_KEY) is required in production/staging.');
    }
    if (!config.jwksUrl && !config.callbackPublicKey) {
        warnings.push('ABDM_JWKS_URL is not set; inbound ABDM callbacks will fail closed unless explicitly isolated in sandbox.');
    }

    return { ok: true, isProdOrStaging, encryption: encCheck, jwks: jwksCheck, warnings };
};

module.exports = config;
