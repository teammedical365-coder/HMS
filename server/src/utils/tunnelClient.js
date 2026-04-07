/**
 * tunnelClient.js — runs on LOCAL clinic server only.
 *
 * Maintains a persistent WebSocket connection to the Medical365 cloud.
 * The cloud can forward patient API requests through this tunnel, so the
 * patient app can reach local data without port-forwarding on the clinic router.
 *
 * Protocol:
 *   Local → Cloud:  { type: 'register', clinicId, apiKey }
 *   Cloud → Local:  { type: 'request',  requestId, method, path, headers, body }
 *   Local → Cloud:  { type: 'response', requestId, status, headers, body }
 *   Cloud → Local:  { type: 'ping' }
 *   Local → Cloud:  { type: 'pong' }
 */

const DEPLOYMENT_MODE = process.env.DEPLOYMENT_MODE || 'cloud';
const CLOUD_URL       = process.env.CLOUD_URL || 'https://medical365.in';
const CLINIC_ID       = process.env.CLINIC_ID || '';
const CLOUD_API_KEY   = process.env.CLOUD_API_KEY || '';

// Convert https → wss, http → ws
const wsUrl = () => CLOUD_URL.replace(/^https/, 'wss').replace(/^http/, 'ws') + '/tunnel';

let ws = null;
let reconnectTimer = null;
let isConnected = false;
let localApp = null;   // Express app reference — set via setApp()

// ─── Local HTTP bridge ────────────────────────────────────────────────────────
// When cloud forwards a patient request, we execute it against the local Express app
// and send the response back through the tunnel.

const executeLocalRequest = (method, path, headers, body) => {
    return new Promise((resolve) => {
        if (!localApp) {
            return resolve({ status: 503, body: { success: false, message: 'Local app not ready' } });
        }

        const http = require('http');

        const options = {
            hostname: '127.0.0.1',
            port: process.env.PORT || 3000,
            path,
            method: method.toUpperCase(),
            headers: {
                'Content-Type': 'application/json',
                ...headers,
                'x-tunnel-request': '1',   // mark as coming through tunnel
            },
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, body: JSON.parse(data) });
                } catch {
                    resolve({ status: res.statusCode, body: { raw: data } });
                }
            });
        });

        req.on('error', (err) => {
            resolve({ status: 500, body: { success: false, message: err.message } });
        });

        if (body && method.toUpperCase() !== 'GET') {
            req.write(JSON.stringify(body));
        }

        req.end();
    });
};

// ─── WebSocket connection ─────────────────────────────────────────────────────

const connect = () => {
    if (DEPLOYMENT_MODE !== 'local') return;
    if (!CLINIC_ID || !CLOUD_API_KEY) {
        console.warn('[Tunnel] CLINIC_ID / CLOUD_API_KEY not set — tunnel disabled');
        return;
    }

    // ws package — loaded lazily so server still starts if not installed
    let WebSocket;
    try {
        WebSocket = require('ws');
    } catch {
        console.warn('[Tunnel] "ws" package not found — run: npm install ws');
        return;
    }

    const url = wsUrl();
    console.log(`[Tunnel] Connecting to ${url}`);

    ws = new WebSocket(url);

    ws.on('open', () => {
        isConnected = true;
        console.log('[Tunnel] Connected to cloud relay');

        // Register this clinic with the cloud
        ws.send(JSON.stringify({
            type: 'register',
            clinicId: CLINIC_ID,
            apiKey: CLOUD_API_KEY,
        }));
    });

    ws.on('message', async (raw) => {
        let msg;
        try { msg = JSON.parse(raw); } catch { return; }

        if (msg.type === 'ping') {
            ws.send(JSON.stringify({ type: 'pong' }));
            return;
        }

        if (msg.type === 'request') {
            // Cloud is forwarding a patient API request — execute locally
            const { requestId, method, path, headers = {}, body } = msg;

            const result = await executeLocalRequest(method, path, headers, body);

            ws.send(JSON.stringify({
                type: 'response',
                requestId,
                status: result.status,
                body: result.body,
            }));
        }
    });

    ws.on('close', () => {
        isConnected = false;
        console.log('[Tunnel] Disconnected — reconnecting in 10s...');
        reconnectTimer = setTimeout(connect, 10000);
    });

    ws.on('error', (err) => {
        console.error('[Tunnel] Error:', err.message);
        // close event will fire after error → triggers reconnect
    });
};

const disconnect = () => {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (ws) ws.close();
    isConnected = false;
};

/**
 * setApp — pass Express app reference so tunnel can execute requests locally.
 * Call this from server.js: tunnelClient.setApp(app)
 */
const setApp = (app) => { localApp = app; };

const getStatus = () => ({ isConnected, clinicId: CLINIC_ID });

module.exports = { connect, disconnect, setApp, getStatus };
