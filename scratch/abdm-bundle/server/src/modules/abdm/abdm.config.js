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

const env = t(e.ABDM_ENV, 'sandbox');

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

    // Callback signature verification: URL of ABDM's published signing keys (JWKS)
    jwksUrl: t(e.ABDM_JWKS_URL),
    // Sandbox-only escape hatch while you confirm the JWKS URL. Ignored when ABDM_ENV=production.
    allowUnsignedCallbacks: t(e.ABDM_ALLOW_UNSIGNED_CALLBACKS) === 'true' && env !== 'production',

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

module.exports = config;
