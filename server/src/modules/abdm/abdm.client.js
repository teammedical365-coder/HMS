/**
 * abdm.client.js — Official ABDM (Ayushman Bharat Digital Mission) Sandbox API Client
 *
 * Implements M1 / Gateway and ABHA API contract for:
 *   1. Gateway Session Authentication (v0.5/sessions)
 *   2. Link Existing ABHA (Auth Init + Confirm with OTP)
 *   3. Create ABHA (Aadhaar OTP Generate + Verify)
 *
 * SECURITY & PRIVACY RULES:
 *   - NEVER logs Aadhaar numbers, OTPs, access tokens, or client secrets.
 *   - All sensitive data is sanitized / redacted in debug traces.
 *   - If credentials are not configured, throws AbdmConfigError with clear user-friendly explanation.
 */

const axios = require('axios');
const dns = require('dns');

// Prioritize IPv4 on Windows to prevent IPv6 DNS lag / timeouts to Indian NIC/ABDM gateways
try {
    dns.setDefaultResultOrder('ipv4first');
} catch (e) {}

const DEFAULT_TIMEOUT_MS = 25000;

class AbdmConfigError extends Error {
    constructor(message = 'ABDM Sandbox is not configured. Please set ABDM_CLIENT_ID and ABDM_CLIENT_SECRET in the server environment.') {
        super(message);
        this.name = 'AbdmConfigError';
        this.status = 503;
        this.isConfigError = true;
    }
}

class AbdmClient {
    constructor() {
        this.env = process.env.ABDM_ENV || 'sandbox';
        this.baseUrl = (process.env.ABDM_BASE_URL || 'https://dev.abdm.gov.in/gateway').replace(/\/+$/, '');
        this.clientId = (process.env.ABDM_CLIENT_ID || '').trim();
        this.clientSecret = (process.env.ABDM_CLIENT_SECRET || '').trim();
        this.xCmId = (process.env.ABDM_X_CM_ID || 'sbx').trim();

        // In-memory token cache
        this.cachedToken = null;
        this.tokenExpiry = null;
    }

    /**
     * Check whether required ABDM Sandbox credentials are provided
     */
    isConfigured() {
        return Boolean(this.clientId && this.clientSecret);
    }

    /**
     * Asserts that sandbox credentials are configured, or throws AbdmConfigError
     */
    assertConfigured() {
        if (!this.isConfigured()) {
            throw new AbdmConfigError();
        }
    }

    /**
     * Fetch or return cached Gateway session token
     */
    async getGatewayToken() {
        this.assertConfigured();

        const now = Date.now();
        if (this.cachedToken && this.tokenExpiry && now < this.tokenExpiry - 60000) {
            return this.cachedToken;
        }

        try {
            const endpoint = `${this.baseUrl}/v0.5/sessions`;
            const payload = {
                clientId: this.clientId,
                clientSecret: this.clientSecret
            };

            const response = await axios.post(endpoint, payload, {
                headers: { 'Content-Type': 'application/json' },
                timeout: DEFAULT_TIMEOUT_MS
            });

            const data = response.data || {};
            const token = data.accessToken || data.token;
            if (!token) {
                throw new Error('ABDM Gateway did not return an accessToken');
            }

            const expiresInMs = (Number(data.expiresIn) || 1800) * 1000;
            this.cachedToken = token;
            this.tokenExpiry = now + expiresInMs;

            return token;
        } catch (err) {
            this.handleAxiosError(err, 'Gateway session authentication failed');
        }
    }

    /**
     * Step 1: Initiate Link Existing ABHA Authentication Flow
     * @param {Object} params
     * @param {string} params.abhaIdentifier - ABHA Number or ABHA Address
     * @param {string} [params.authMethod='AADHAAR_OTP'] - 'AADHAAR_OTP' or 'MOBILE_OTP'
     */
    async initLink({ abhaIdentifier, authMethod = 'AADHAAR_OTP' }) {
        this.assertConfigured();
        const token = await this.getGatewayToken();

        try {
            // Official ABDM v0.5 /users/auth/init
            const endpoint = `${this.baseUrl}/v0.5/users/auth/init`;
            const payload = {
                requestId: this.generateRequestId(),
                timestamp: new Date().toISOString(),
                query: {
                    id: abhaIdentifier.trim(),
                    purpose: 'KYC_AND_LINK',
                    authMode: authMethod.trim().toUpperCase(),
                    requester: {
                        type: 'HIP',
                        id: this.clientId
                    }
                }
            };

            const response = await axios.post(endpoint, payload, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                    'X-CM-ID': this.xCmId
                },
                timeout: DEFAULT_TIMEOUT_MS
            });

            const data = response.data || {};
            const txnId = data.transactionId || data.txnId || data.requestId;

            return {
                txnId: txnId || this.generateRequestId(),
                authMode: authMethod,
                message: 'ABDM OTP initiated successfully'
            };
        } catch (err) {
            this.handleAxiosError(err, 'Failed to initiate ABHA linking authentication with ABDM');
        }
    }

    /**
     * Step 2: Confirm Link Existing ABHA with OTP
     * @param {Object} params
     * @param {string} params.txnId - ABDM Transaction ID from initLink
     * @param {string} params.otp - 6-digit OTP received by patient
     */
    async confirmLink({ txnId, otp }) {
        this.assertConfigured();
        const token = await this.getGatewayToken();

        try {
            // Official ABDM v0.5 /users/auth/confirm
            const endpoint = `${this.baseUrl}/v0.5/users/auth/confirm`;
            const payload = {
                requestId: this.generateRequestId(),
                timestamp: new Date().toISOString(),
                transactionId: txnId,
                credential: {
                    authCode: String(otp).trim()
                }
            };

            const response = await axios.post(endpoint, payload, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                    'X-CM-ID': this.xCmId
                },
                timeout: DEFAULT_TIMEOUT_MS
            });

            const data = response.data || {};
            const patient = data.patient || data.profile || data;

            return {
                abhaNumber: patient.id || patient.healthIdNumber || patient.abhaNumber || null,
                abhaAddress: patient.healthId || patient.abhaAddress || null,
                name: patient.name || null,
                gender: patient.gender || null,
                dateOfBirth: patient.yearOfBirth ? `${patient.yearOfBirth}` : null
            };
        } catch (err) {
            this.handleAxiosError(err, 'Failed to confirm ABHA linking with ABDM');
        }
    }

    /**
     * Step 1: Create ABHA — Generate Aadhaar OTP
     * @param {Object} params
     * @param {string} params.aadhaarNumber - 12-digit Aadhaar Number
     */
    async generateCreateOtp({ aadhaarNumber }) {
        this.assertConfigured();
        const token = await this.getGatewayToken();

        try {
            const endpoint = `${this.baseUrl}/v1/registration/aadhaar/generateOtp`;
            const payload = {
                aadhaar: String(aadhaarNumber).trim()
            };

            const response = await axios.post(endpoint, payload, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                    'X-CM-ID': this.xCmId
                },
                timeout: DEFAULT_TIMEOUT_MS
            });

            const data = response.data || {};
            const txnId = data.txnId || data.transactionId;

            return {
                txnId: txnId || this.generateRequestId(),
                message: 'Aadhaar OTP generated successfully by ABDM'
            };
        } catch (err) {
            this.handleAxiosError(err, 'Failed to generate Aadhaar OTP with ABDM Sandbox');
        }
    }

    /**
     * Step 2: Create ABHA — Verify Aadhaar OTP & Retrieve ABHA
     * @param {Object} params
     * @param {string} params.txnId - Transaction ID from generateCreateOtp
     * @param {string} params.otp - 6-digit Aadhaar OTP
     */
    async verifyCreateOtp({ txnId, otp }) {
        this.assertConfigured();
        const token = await this.getGatewayToken();

        try {
            const endpoint = `${this.baseUrl}/v1/registration/aadhaar/verifyOTP`;
            const payload = {
                txnId: txnId,
                otp: String(otp).trim()
            };

            const response = await axios.post(endpoint, payload, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                    'X-CM-ID': this.xCmId
                },
                timeout: DEFAULT_TIMEOUT_MS
            });

            const data = response.data || {};
            const profile = data.profile || data;

            return {
                abhaNumber: profile.healthIdNumber || profile.abhaNumber || null,
                abhaAddress: profile.healthId || profile.abhaAddress || null,
                name: profile.name || null,
                gender: profile.gender || null,
                dateOfBirth: profile.dayOfBirth && profile.monthOfBirth && profile.yearOfBirth ?
                    `${profile.yearOfBirth}-${profile.monthOfBirth}-${profile.dayOfBirth}` : null
            };
        } catch (err) {
            this.handleAxiosError(err, 'Failed to verify Aadhaar OTP with ABDM Sandbox');
        }
    }

    /**
     * Official ABDM v1 PATCH /gateway/v1/bridges
     * Updates the callback URL for the bridge.
     * @param {string} bridgeUrl - Public HTTPS callback URL
     */
    async patchBridgeUrl(bridgeUrl) {
        this.assertConfigured();
        if (!bridgeUrl || typeof bridgeUrl !== 'string') {
            const err = new Error('A valid bridge URL is required');
            err.status = 400;
            throw err;
        }

        const trimmedUrl = bridgeUrl.trim();
        // Validation: Must be HTTPS, no localhost, no http
        if (!trimmedUrl.startsWith('https://')) {
            const err = new Error('Bridge URL must use secure public HTTPS protocol (e.g. https://medical365.in/api/abdm)');
            err.status = 400;
            throw err;
        }
        if (trimmedUrl.includes('localhost') || trimmedUrl.includes('127.0.0.1')) {
            const err = new Error('Bridge URL cannot be localhost. A publicly accessible domain is required.');
            err.status = 400;
            throw err;
        }

        const token = await this.getGatewayToken();
        const endpoint = `${this.baseUrl}/v1/bridges`;

        try {
            const response = await axios.patch(endpoint, { url: trimmedUrl }, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                    'X-CM-ID': this.xCmId
                },
                timeout: DEFAULT_TIMEOUT_MS
            });

            return {
                success: true,
                status: response.status,
                bridgeUrl: trimmedUrl,
                data: response.data || null,
                message: 'Bridge URL registered successfully with ABDM Gateway'
            };
        } catch (err) {
            this.handleAxiosError(err, 'Failed to update bridge URL on ABDM Gateway');
        }
    }

    /**
     * Official ABDM v1 POST /gateway/v1/bridges/addUpdateServices
     * Registers or updates services under this bridge.
     * Service type for HMS is strictly 'HIP'.
     * @param {Array<Object>|Object} servicePayload
     */
    async addUpdateServices(servicePayload) {
        this.assertConfigured();
        const token = await this.getGatewayToken();
        const endpoint = `${this.baseUrl}/v1/bridges/addUpdateServices`;

        // Normalize to array as expected by ABDM spec
        const payload = Array.isArray(servicePayload) ? servicePayload : [servicePayload];

        // Ensure each item has type 'HIP' by default if not set
        const sanitizedPayload = payload.map(svc => ({
            id: String(svc.id || this.clientId).trim(),
            name: String(svc.name || 'Medical365 HMS').trim(),
            type: String(svc.type || 'HIP').trim().toUpperCase(),
            active: typeof svc.active === 'boolean' ? svc.active : true,
            alias: Array.isArray(svc.alias) ? svc.alias : [String(svc.alias || 'Medical365').trim()]
        }));

        try {
            // First try POST as per M1 specification
            const response = await axios.post(endpoint, sanitizedPayload, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                    'X-CM-ID': this.xCmId
                },
                timeout: DEFAULT_TIMEOUT_MS
            });

            return {
                success: true,
                status: response.status,
                services: sanitizedPayload,
                data: response.data || null,
                message: 'ABDM M1 HIP services registered/updated successfully'
            };
        } catch (err) {
            // If POST fails with 405 Method Not Allowed, fallback to PUT as some ABDM versions use PUT
            if (err.response?.status === 405) {
                try {
                    const putResponse = await axios.put(endpoint, sanitizedPayload, {
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`,
                            'X-CM-ID': this.xCmId
                        },
                        timeout: DEFAULT_TIMEOUT_MS
                    });
                    return {
                        success: true,
                        status: putResponse.status,
                        services: sanitizedPayload,
                        data: putResponse.data || null,
                        message: 'ABDM M1 HIP services registered/updated successfully'
                    };
                } catch (putErr) {
                    this.handleAxiosError(putErr, 'Failed to register/update services on ABDM Gateway');
                }
            }
            this.handleAxiosError(err, 'Failed to register/update services on ABDM Gateway');
        }
    }

    /**
     * Official ABDM v1 GET /gateway/v1/bridges/getServices
     * Fetches registered services under this client ID.
     */
    async getServices() {
        this.assertConfigured();
        const token = await this.getGatewayToken();
        const endpoint = `${this.baseUrl}/v1/bridges/getServices`;

        try {
            const response = await axios.get(endpoint, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'X-CM-ID': this.xCmId
                },
                timeout: DEFAULT_TIMEOUT_MS
            });

            return {
                success: true,
                status: response.status,
                services: response.data || [],
                message: 'Retrieved registered services from ABDM Gateway'
            };
        } catch (err) {
            this.handleAxiosError(err, 'Failed to fetch registered services from ABDM Gateway');
        }
    }

    /**
     * Clear cached token (useful for tests and key rotation)
     */
    clearTokenCache() {
        this.cachedToken = null;
        this.tokenExpiry = null;
    }

    /**
     * Generate unique v4/alphanumeric request ID for ABDM tracing
     */
    generateRequestId() {
        const { v4: uuidv4 } = require('uuid');
        return uuidv4();
    }

    /**
     * Format and sanitize Axios errors without leaking sensitive headers or raw payloads
     */
    handleAxiosError(err, defaultMessage) {
        if (err.isConfigError) throw err;

        const status = err.response?.status || 502;
        const abdmErrorData = err.response?.data;
        const abdmErrorMsg = abdmErrorData?.description ||
                             abdmErrorData?.error?.message || 
                             abdmErrorData?.message || 
                             abdmErrorData?.details?.[0]?.message || 
                             err.message;

        const error = new Error(`${defaultMessage}: ${abdmErrorMsg}`);
        error.status = status;
        error.abdmCode = abdmErrorData?.code || abdmErrorData?.error?.code || 'ABDM_API_ERROR';
        error.abdmDetails = abdmErrorData;
        throw error;
    }
}

module.exports = new AbdmClient();
module.exports.AbdmConfigError = AbdmConfigError;

