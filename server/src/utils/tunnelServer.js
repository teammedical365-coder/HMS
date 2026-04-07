/**
 * tunnelServer.js — runs on CLOUD server only.
 *
 * Manages WebSocket connections from local clinic servers.
 * When a patient app hits GET /api/tunnel/:clinicId/..., this server
 * forwards the request through the tunnel to the correct local server
 * and streams the response back to the patient app.
 *
 * Usage in server.js:
 *   const tunnelServer = require('./src/utils/tunnelServer');
 *   tunnelServer.attach(httpServer);
 */

const { Server: WsServer } = require('ws');

// Map of clinicId → WebSocket connection
const clinicConnections = new Map();

// Map of requestId → { resolve, reject, timer } — pending forwarded requests
const pendingRequests = new Map();

const CLOUD_API_KEYS = {};   // loaded lazily from Hospital model

// ─── Verify a local server's API key ──────────────────────────────────────────
const verifyClinicApiKey = async (clinicId, apiKey) => {
    try {
        const Hospital = require('../models/hospital.model');
        const clinic = await Hospital.findById(clinicId).select('clinicApiKey isActive');
        if (!clinic || !clinic.isActive) return false;
        // clinicApiKey is stored hashed (bcrypt) on the Hospital document
        const bcrypt = require('bcryptjs');
        return await bcrypt.compare(apiKey, clinic.clinicApiKey || '');
    } catch {
        return false;
    }
};

// ─── Attach to existing HTTP server ──────────────────────────────────────────

const attach = (httpServer) => {
    if (process.env.DEPLOYMENT_MODE === 'local') return; // don't run on local servers

    const wss = new WsServer({ server: httpServer, path: '/tunnel' });
    console.log('[TunnelServer] WebSocket relay listening on /tunnel');

    wss.on('connection', (socket) => {
        let clinicId = null;
        let pingTimer = null;

        socket.on('message', async (raw) => {
            let msg;
            try { msg = JSON.parse(raw); } catch { return; }

            // ── Registration ──────────────────────────────────────────────
            if (msg.type === 'register') {
                const valid = await verifyClinicApiKey(msg.clinicId, msg.apiKey);
                if (!valid) {
                    socket.send(JSON.stringify({ type: 'error', message: 'Invalid clinic credentials' }));
                    socket.close();
                    return;
                }

                clinicId = msg.clinicId;
                clinicConnections.set(clinicId, socket);
                console.log(`[TunnelServer] Clinic ${clinicId} connected`);

                socket.send(JSON.stringify({ type: 'registered', clinicId }));

                // Keep-alive ping every 30s
                pingTimer = setInterval(() => {
                    if (socket.readyState === socket.OPEN) {
                        socket.send(JSON.stringify({ type: 'ping' }));
                    }
                }, 30000);

                return;
            }

            // ── Response from local server ────────────────────────────────
            if (msg.type === 'response') {
                const pending = pendingRequests.get(msg.requestId);
                if (pending) {
                    clearTimeout(pending.timer);
                    pendingRequests.delete(msg.requestId);
                    pending.resolve({ status: msg.status, body: msg.body });
                }
                return;
            }

            if (msg.type === 'pong') return; // heartbeat reply — ignore
        });

        socket.on('close', () => {
            if (clinicId) {
                clinicConnections.delete(clinicId);
                console.log(`[TunnelServer] Clinic ${clinicId} disconnected`);
            }
            if (pingTimer) clearInterval(pingTimer);
        });

        socket.on('error', (err) => {
            console.error(`[TunnelServer] Socket error for clinic ${clinicId}:`, err.message);
        });
    });
};

// ─── Forward a request to a local clinic server via tunnel ───────────────────

const forward = (clinicId, method, path, headers, body) => {
    return new Promise((resolve, reject) => {
        const socket = clinicConnections.get(clinicId);
        if (!socket || socket.readyState !== socket.OPEN) {
            return reject(new Error('Clinic is offline or not connected'));
        }

        const requestId = `${clinicId}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

        // Timeout after 15s — local server may be slow
        const timer = setTimeout(() => {
            pendingRequests.delete(requestId);
            reject(new Error('Tunnel request timed out'));
        }, 15000);

        pendingRequests.set(requestId, { resolve, reject, timer });

        socket.send(JSON.stringify({ type: 'request', requestId, method, path, headers, body }));
    });
};

const isClinicOnline = (clinicId) => {
    const s = clinicConnections.get(clinicId);
    return s && s.readyState === s.OPEN;
};

const onlineClinicIds = () => [...clinicConnections.keys()];

module.exports = { attach, forward, isClinicOnline, onlineClinicIds };
