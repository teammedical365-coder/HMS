'use strict';
/**
 * abdm.bridge.service.js - PLATFORM-level bridge management.
 * ABDM has ONE bridge URL per client ID, so this is not per hospital.
 * The URL comes only from the ABDM_BRIDGE_URL env var (never from a request body).
 */
const net = require('net');
const axios = require('axios');
const client = require('./abdm.client');
const config = require('./abdm.config');
const AbdmBridge = require('../../models/abdmBridge.model');
const Hospital = require('../../models/hospital.model');

const httpError = (status, message) => Object.assign(new Error(message), { status });
const maskId = (s) => (s ? `${s.slice(0, 4)}...${s.slice(-4)}` : null);

function validateBridgeUrl(raw) {
    if (!raw) throw httpError(400, 'ABDM_BRIDGE_URL is not set on the server (use your backend host, e.g. https://api.medical365.in)');
    let u;
    try { u = new URL(raw); } catch (_) { throw httpError(400, 'ABDM_BRIDGE_URL is not a valid URL'); }
    if (u.protocol !== 'https:') throw httpError(400, 'Bridge URL must be HTTPS');
    const host = u.hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal') || net.isIP(host)) {
        throw httpError(400, 'Bridge URL must be a public domain name (no localhost or raw IP)');
    }
    if (config.forbiddenBridgeHosts.includes(host)) {
        throw httpError(400, `"${host}" is your website, not your backend. Use the host that runs the Node API (e.g. https://api.medical365.in).`);
    }
    const path = u.pathname.replace(/\/+$/, '');
    return `${u.origin}${path}`;
}

/** Does the public URL actually reach OUR callback handler (JSON 4xx), not a static site? */
async function probeBridge(baseUrl) {
    const url = `${baseUrl}/v0.5/users/auth/on-init`;
    try {
        const r = await axios.post(url, {}, { timeout: 8000, validateStatus: () => true });
        const isJson = /json/i.test(String(r.headers['content-type'] || ''));
        const ours = isJson && r.data && typeof r.data === 'object' && 'error' in r.data;
        return {
            reachable: true,
            status: r.status,
            reachesCallbackHandler: Boolean(ours),
            hint: ours ? 'OK: request reached the Node callback handler.'
                : 'This URL answered, but NOT with the callback handler. It is probably the website/static host or a proxy without the API route.',
        };
    } catch (err) {
        return { reachable: false, status: null, reachesCallbackHandler: false, hint: `Not reachable: ${err.code || err.message}` };
    }
}

async function getBridgeConfig() {
    const stored = await AbdmBridge.findOne({ clientId: config.clientId }).lean().catch(() => null);
    let live = null;
    let liveError = null;
    if (client.isConfigured()) {
        try { live = (await client.getBridgeServices()).data; } catch (e) { liveError = e.message; }
    }
    return {
        success: true,
        isConfigured: client.isConfigured(),
        environment: config.env,
        clientId: maskId(config.clientId),
        configuredBridgeUrl: config.bridgeUrl || null,
        lastRegistered: stored ? { at: stored.lastRegisteredAt, status: stored.lastStatus, message: stored.lastMessage } : null,
        live, liveError,
        note: 'ABDM can take 5-15 minutes to start using a new bridge URL.',
    };
}

async function registerBridgeUrl({ userId = null, skipProbe = false } = {}) {
    client.assertConfigured();
    const url = validateBridgeUrl(config.bridgeUrl);

    const probe = await probeBridge(url);
    if (!skipProbe && !probe.reachesCallbackHandler) {
        throw httpError(409, `Refusing to register: ${probe.hint} (pass skipProbe=true only if this server cannot reach its own public URL)`);
    }

    let status = 'ACCEPTED';
    let message = 'Accepted by ABDM. It can take 5-15 minutes to apply.';
    let gateway = null;
    try {
        gateway = await client.patchBridgeUrl(url);
    } catch (err) {
        status = 'FAILED';
        message = err.message;
    }

    try {
        await AbdmBridge.findOneAndUpdate(
            { clientId: config.clientId },
            { $set: { bridgeUrl: url, lastRegisteredAt: new Date(), lastStatus: status, lastMessage: message, updatedBy: userId } },
            { upsert: true }
        );
    } catch (err) {
        console.error('[ABDM] could not persist bridge state:', err.message);
    }

    if (status === 'FAILED') throw httpError(502, message);
    return { success: true, bridgeUrl: url, probe, gatewayStatus: gateway && gateway.status, message };
}

async function verifyServices() {
    client.assertConfigured();
    const res = await client.getBridgeServices();
    return { success: true, services: res.data };
}

async function registerHospitalHip(hospitalId, { hipId, name, alias }, userId = null) {
    client.assertConfigured();
    const id = String(hipId || '').trim();
    if (!/^[A-Za-z0-9_-]{3,64}$/.test(id)) throw httpError(400, 'hipId must be 3-64 chars: letters, digits, _ or -');

    const hospital = await Hospital.findById(hospitalId).select('_id name abdm');
    if (!hospital) throw httpError(404, 'Hospital not found');
    const clash = await Hospital.findOne({ 'abdm.hipId': id, _id: { $ne: hospital._id } }).select('_id').lean();
    if (clash) throw httpError(409, 'This HIP ID is already assigned to another hospital');

    // Sandbox: register the facility by API. Production: link the facility through HFR instead.
    const svc = await client.addUpdateServices([{ id, name: name || hospital.name, type: 'HIP', active: true, alias: alias || [hospital.name] }]);

    hospital.set('abdm.enabled', true);
    hospital.set('abdm.hipId', id);
    await hospital.save();
    return { success: true, hospitalId: hospital._id, hipId: id, gatewayStatus: svc.status, registeredBy: userId };
}

async function getHospitalStatus(hospitalId) {
    const h = await Hospital.findById(hospitalId).select('name abdm').lean();
    if (!h) throw httpError(404, 'Hospital not found');
    return { success: true, hospital: h.name, enabled: Boolean(h.abdm && h.abdm.enabled), hipId: (h.abdm && h.abdm.hipId) || null };
}

module.exports = { validateBridgeUrl, probeBridge, getBridgeConfig, registerBridgeUrl, verifyServices, registerHospitalHip, getHospitalStatus };
