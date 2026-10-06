const http = require('http');
const logger = require('./logger');
const db = require('./db');
const cloudClient = require('./cloudClient');
const configManager = require('./config');

class LocalHealthServer {
    constructor() {
        this.server = null;
        this.startTime = Date.now();
    }

    start(port = 4000) {
        if (this.server) return;

        this.server = http.createServer((req, res) => {
            const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
            
            // Set JSON response headers
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-agent-token');

            if (req.method === 'OPTIONS') {
                res.writeHead(204);
                res.end();
                return;
            }

            // Helper to read JSON request body
            const readJsonBody = () => new Promise((resolve, reject) => {
                let body = '';
                req.on('data', chunk => {
                    body += chunk;
                    if (body.length > 5 * 1024 * 1024) { // 5MB limit
                        reject(new Error('Payload too large'));
                    }
                });
                req.on('end', () => {
                    if (!body) return resolve({});
                    try {
                        resolve(JSON.parse(body));
                    } catch (e) {
                        reject(new Error('Invalid JSON payload'));
                    }
                });
                req.on('error', reject);
            });

            // ── Phase 4: Local Workstation Offline Mutation Ingestion Endpoint ───
            if ((url.pathname === '/mutate' || url.pathname === '/api/mutate') && req.method === 'POST') {
                readJsonBody().then(async (data) => {
                    const localOutbox = require('./sync/localOutbox');
                    const outboxUploader = require('./sync/outboxUploader');
                    const config = configManager.get();

                    const {
                        entityType,
                        entityId,
                        operation = 'CREATE',
                        payload = {},
                        localBaseVersion = null,
                        source = 'LOCAL'
                    } = data;

                    if (!entityType || !entityId) {
                        res.writeHead(400);
                        res.end(JSON.stringify({ success: false, message: 'entityType and entityId are required' }));
                        return;
                    }

                    const rec = await localOutbox.recordMutation({
                        installationId: config.installationId || 'LOCAL-INSTALLATION',
                        hospitalId: config.hospitalId || payload.hospitalId || 'LOCAL-HOSPITAL',
                        entityType,
                        entityId,
                        operation,
                        payload,
                        localBaseVersion,
                        source
                    });

                    // Trigger immediate upload if connected
                    outboxUploader.triggerImmediateSync().catch(() => {});

                    res.writeHead(200);
                    res.end(JSON.stringify({ success: true, ...rec }));
                }).catch(err => {
                    res.writeHead(400);
                    res.end(JSON.stringify({ success: false, message: err.message }));
                });
                return;
            }

            // ── Phase 4: Outbox Stats Endpoint ──────────────────────────────────
            if (url.pathname === '/outbox/stats' && req.method === 'GET') {
                const localOutbox = require('./sync/localOutbox');
                localOutbox.getOutboxStats().then(stats => {
                    res.writeHead(200);
                    res.end(JSON.stringify({ success: true, stats }));
                }).catch(err => {
                    res.writeHead(500);
                    res.end(JSON.stringify({ success: false, message: err.message }));
                });
                return;
            }

            // ── Phase 4: Immediate Sync Trigger ─────────────────────────────────
            if (url.pathname === '/sync/trigger' && req.method === 'POST') {
                const outboxUploader = require('./sync/outboxUploader');
                outboxUploader.triggerImmediateSync().then(result => {
                    res.writeHead(200);
                    res.end(JSON.stringify({ success: true, result }));
                }).catch(err => {
                    res.writeHead(500);
                    res.end(JSON.stringify({ success: false, message: err.message }));
                });
                return;
            }

            if (url.pathname === '/health' && req.method === 'GET') {
                const dbHealth = db.getHealth();
                const cloudHealth = cloudClient.getHealth();
                const config = configManager.get();

                const isHealthy = dbHealth.status === 'HEALTHY' && cloudHealth.status === 'CONNECTED';

                const responsePayload = {
                    status: isHealthy ? 'healthy' : (dbHealth.status === 'DOWN' ? 'degraded' : 'disconnected'),
                    agent: 'healthy',
                    database: dbHealth.status.toLowerCase(),
                    cloud: cloudHealth.status.toLowerCase(),
                    installationId: config.installationId || 'UNCONFIGURED',
                    agentVersion: config.agentVersion,
                    uptimeSeconds: Math.round((Date.now() - this.startTime) / 1000),
                    lastHeartbeatAck: cloudHealth.lastHeartbeatAck,
                    lastError: cloudHealth.lastError,
                    timestamp: new Date().toISOString()
                };

                res.writeHead(isHealthy ? 200 : 503);
                res.end(JSON.stringify(responsePayload, null, 2));
                return;
            }

            if (url.pathname === '/status' && req.method === 'GET') {
                const dbHealth = db.getHealth();
                const cloudHealth = cloudClient.getHealth();
                const config = configManager.get();

                const responsePayload = {
                    agent: {
                        name: config.agentName,
                        version: config.agentVersion,
                        installationId: config.installationId || 'UNCONFIGURED',
                        paired: Boolean(config.agentToken),
                        uptimeSeconds: Math.round((Date.now() - this.startTime) / 1000)
                    },
                    database: dbHealth,
                    cloud: {
                        url: config.cloudUrl,
                        ...cloudHealth
                    },
                    operationalLogs: logger.getRecentLogs().slice(0, 15),
                    timestamp: new Date().toISOString()
                };

                res.writeHead(200);
                res.end(JSON.stringify(responsePayload, null, 2));
                return;
            }

            // 404 for any other path
            res.writeHead(404);
            res.end(JSON.stringify({ error: 'Endpoint not found. Available endpoints: /health, /status, /mutate, /outbox/stats, /sync/trigger' }));
        });

        this.server.listen(port, () => {
            logger.info('HEALTH_SERVER', `Local health status server listening on http://localhost:${port}/health`);
        });

        this.server.on('error', (err) => {
            logger.error('HEALTH_SERVER', `Health server error on port ${port}: ${err.message}`);
        });
    }

    stop() {
        if (this.server) {
            this.server.close();
            this.server = null;
            logger.info('HEALTH_SERVER', 'Local health server stopped.');
        }
    }
}

module.exports = new LocalHealthServer();
