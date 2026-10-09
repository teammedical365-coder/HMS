'use strict';
/**
 * abdm.client.js - ABDM V3 client (gateway, ABHA, bridge, HIP calls).
 *
 * Rules:
 *  - NEVER log Aadhaar, OTPs, tokens, secrets or request bodies.
 *  - Aadhaar / mobile / OTP are RSA-encrypted with ABDM's public key before leaving this server.
 *  - Every call carries REQUEST-ID + TIMESTAMP + X-CM-ID (required by V3).
 */
const axios = require('axios');
const crypto = require('crypto');
const dns = require('dns');
const { v4: uuidv4 } = require('uuid');
const config = require('./abdm.config');

try { dns.setDefaultResultOrder('ipv4first'); } catch (_) { /* older Node */ }

class AbdmConfigError extends Error {
    constructor(message = 'ABDM is not configured. Set ABDM_CLIENT_ID and ABDM_CLIENT_SECRET in the server environment.') {
        super(message);
        this.name = 'AbdmConfigError';
        this.status = 503;
        this.isConfigError = true;
    }
}

class AbdmClient {
    constructor() {
        this.token = null;
        this.tokenExpiry = 0;
        this.cert = null;
        this.certExpiry = 0;
    }

    isConfigured() { return config.isConfigured(); }
    get clientId() { return config.clientId; }

    assertConfigured() { if (!this.isConfigured()) throw new AbdmConfigError(); }

    clearTokenCache() { this.token = null; this.tokenExpiry = 0; }

    headers(token, extra = {}) {
        const h = {
            'Content-Type': 'application/json',
            'REQUEST-ID': uuidv4(),
            TIMESTAMP: new Date().toISOString(),
            'X-CM-ID': config.xCmId,
            ...extra,
        };
        if (token) h.Authorization = `Bearer ${token}`;
        return h;
    }

    /** Gateway session token. Tries V3 first, then the legacy endpoint. */
    async getGatewayToken() {
        this.assertConfigured();
        const now = Date.now();
        if (this.token && now < this.tokenExpiry - 60000) return this.token;

        const attempts = [
            {
                url: `${config.gatewayBase}/gateway/v3/sessions`,
                body: { clientId: config.clientId, clientSecret: config.clientSecret, grantType: 'client_credentials' },
            },
            {
                url: `${config.legacyGatewayBase}/v0.5/sessions`,
                body: { clientId: config.clientId, clientSecret: config.clientSecret },
            },
        ];

        let lastErr = null;
        for (const a of attempts) {
            try {
                const res = await axios.post(a.url, a.body, { headers: this.headers(null), timeout: config.timeoutMs });
                const data = res.data || {};
                const token = data.accessToken || data.token;
                if (!token) throw new Error('Gateway did not return an accessToken');
                this.token = token;
                this.tokenExpiry = now + (Number(data.expiresIn) || 1200) * 1000;
                return token;
            } catch (err) {
                lastErr = err;
            }
        }
        this.fail(lastErr, 'ABDM gateway session authentication failed');
    }

    /**
     * Generic authenticated call. Returns { data, status, requestId }.
     * Retries once on 401 with a fresh token.
     */
    async call(method, url, { body, extraHeaders = {}, auth = true } = {}) {
        this.assertConfigured();
        const requestId = uuidv4();

        const attempt = async () => {
            const token = auth ? await this.getGatewayToken() : null;
            const res = await axios({
                method,
                url,
                data: body,
                headers: this.headers(token, { 'REQUEST-ID': requestId, ...extraHeaders }),
                timeout: config.timeoutMs,
            });
            return { data: res.data, status: res.status, requestId };
        };

        try {
            return await attempt();
        } catch (err) {
            if (err.response && err.response.status === 401 && auth) {
                this.clearTokenCache();
                try { return await attempt(); } catch (err2) { this.fail(err2, `ABDM ${method.toUpperCase()} call failed`); }
            }
            this.fail(err, `ABDM ${method.toUpperCase()} call failed`);
        }
    }

    // ── Encryption (Aadhaar / mobile / OTP) ──────────────────────────────────
    async getAbhaPublicKeyPem() {
        const now = Date.now();
        if (this.cert && now < this.certExpiry) return this.cert;
        const { data } = await this.call('get', `${config.abhaBase}/v3/profile/public/certificate`);
        const b64 = String((data && data.publicKey) || '').replace(/\s+/g, '');
        if (!b64) throw new Error('ABDM did not return a public key');
        this.cert = `-----BEGIN PUBLIC KEY-----\n${b64.match(/.{1,64}/g).join('\n')}\n-----END PUBLIC KEY-----`;
        this.certExpiry = now + 6 * 60 * 60 * 1000;
        return this.cert;
    }

    /** RSA/ECB/OAEPWithSHA-1AndMGF1Padding, base64 */
    async rsaEncrypt(plain) {
        const pem = await this.getAbhaPublicKeyPem();
        return crypto.publicEncrypt(
            { key: pem, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha1' },
            Buffer.from(String(plain), 'utf8')
        ).toString('base64');
    }

    // ── ABHA V3: create ──────────────────────────────────────────────────────
    async requestEnrolOtp({ aadhaar }) {
        const loginId = await this.rsaEncrypt(aadhaar);
        const { data } = await this.call('post', `${config.abhaBase}/v3/enrollment/request/otp`, {
            body: { txnId: '', scope: ['abha-enrol'], loginHint: 'aadhaar', loginId, otpSystem: 'aadhaar' },
        });
        return { txnId: data && data.txnId, message: data && data.message };
    }

    async enrolByAadhaar({ txnId, otp, mobile }) {
        const otpBlock = { txnId, otpValue: await this.rsaEncrypt(otp) };
        if (mobile) otpBlock.mobile = await this.rsaEncrypt(mobile);
        const { data } = await this.call('post', `${config.abhaBase}/v3/enrollment/enrol/byAadhaar`, {
            body: {
                txnId,
                scope: ['abha-enrol'],
                authData: { authMethods: ['otp'], otp: otpBlock },
                consent: { code: 'abha-enrollment', version: '1.4' },
            },
        });
        return { profile: (data && data.ABHAProfile) || null, isNew: Boolean(data && data.isNew) };
    }

    // ── ABHA V3: verify / link existing ──────────────────────────────────────
    async requestLoginOtp({ loginHint, loginId, otpSystem, scope }) {
        const encrypted = await this.rsaEncrypt(loginId);
        const { data } = await this.call('post', `${config.abhaBase}/v3/profile/login/request/otp`, {
            body: { scope, loginHint, loginId: encrypted, otpSystem },
        });
        return { txnId: data && data.txnId, message: data && data.message };
    }

    async verifyLogin({ txnId, otp, scope }) {
        const { data } = await this.call('post', `${config.abhaBase}/v3/profile/login/verify`, {
            body: {
                txnId,
                scope,
                authData: { authMethods: ['otp'], otp: { txnId, otpValue: await this.rsaEncrypt(otp) } },
            },
        });
        return { profile: (data && data.ABHAProfile) || null, authResult: data && data.authResult };
    }

    // ── Bridge ───────────────────────────────────────────────────────────────
    async patchBridgeUrl(url) {
        const res = await this.call('patch', `${config.gatewayBase}/gateway/v3/bridge/url`, { body: { url } });
        return { status: res.status, data: res.data || null };
    }

    async getBridgeServices() {
        const res = await this.call('get', `${config.gatewayBase}/gateway/v3/bridge-services`);
        return { status: res.status, data: res.data || null };
    }

    /** Sandbox facility (HIP) registration. In production, link the facility via HFR instead. */
    async addUpdateServices(services) {
        const body = (Array.isArray(services) ? services : [services]).map((s) => ({
            id: String(s.id).trim(),
            name: String(s.name).trim(),
            type: String(s.type || 'HIP').toUpperCase(),
            active: s.active !== false,
            alias: Array.isArray(s.alias) ? s.alias : [String(s.alias || s.name)],
        }));
        try {
            const res = await this.call('put', config.servicesUrl, { body });
            return { status: res.status, services: body };
        } catch (err) {
            if (err.status === 405) {
                const res = await this.call('post', config.servicesUrl, { body });
                return { status: res.status, services: body };
            }
            throw err;
        }
    }

    // ── HIP (M2) outbound ────────────────────────────────────────────────────
    async generateLinkToken({ hipId, abhaNumber, abhaAddress, name, gender, yearOfBirth }) {
        const res = await this.call('post', `${config.gatewayBase}${config.paths.generateToken}`, {
            extraHeaders: { 'X-HIP-ID': hipId },
            body: { abhaNumber, abhaAddress, name, gender, yearOfBirth },
        });
        return { requestId: res.requestId, status: res.status };
    }

    async linkCareContext({ hipId, linkToken, body }) {
        const res = await this.call('post', `${config.gatewayBase}${config.paths.linkCareContext}`, {
            extraHeaders: { 'X-HIP-ID': hipId, 'X-LINK-TOKEN': linkToken },
            body,
        });
        return { requestId: res.requestId, status: res.status };
    }

    /** Send an on-* reply. body.response.requestId MUST equal the callback's REQUEST-ID header. */
    async reply(path, body, { hipId }) {
        const res = await this.call('post', `${config.gatewayBase}${path}`, {
            extraHeaders: { 'X-HIP-ID': hipId },
            body,
        });
        return { requestId: res.requestId, status: res.status };
    }

    /** Sanitised error: never leaks credentials or request payloads. */
    fail(err, defaultMessage) {
        if (err && err.isConfigError) throw err;
        const status = (err && err.response && err.response.status) || 502;
        const d = err && err.response && err.response.data;
        const msg = (d && (d.description || (d.error && d.error.message) || d.message
            || (d.details && d.details[0] && d.details[0].message))) || (err && err.message) || 'unknown error';
        const out = new Error(`${defaultMessage}: ${msg}`);
        out.status = status;
        out.abdmCode = (d && (d.code || (d.error && d.error.code))) || 'ABDM_API_ERROR';
        out.abdmDetails = d || null;
        throw out;
    }
}

module.exports = new AbdmClient();
module.exports.AbdmConfigError = AbdmConfigError;
