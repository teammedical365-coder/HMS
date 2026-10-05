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
            res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

            if (req.method === 'OPTIONS') {
                res.writeHead(204);
                res.end();
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
            res.end(JSON.stringify({ error: 'Endpoint not found. Available endpoints: /health, /status' }));
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
