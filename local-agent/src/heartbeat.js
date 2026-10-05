const os = require('os');
const logger = require('./logger');
const db = require('./db');
const cloudClient = require('./cloudClient');
const configManager = require('./config');
const localOutbox = require('./sync/localOutbox');

class HeartbeatScheduler {
    constructor() {
        this.timer = null;
        this.isRunning = false;
        this.startTime = Date.now();
    }

    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        logger.info('HEARTBEAT', 'Heartbeat scheduler started.');
        this.tick();
    }

    stop() {
        this.isRunning = false;
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        logger.info('HEARTBEAT', 'Heartbeat scheduler stopped.');
    }

    async tick() {
        if (!this.isRunning) return;

        const config = configManager.get();
        if (!config.agentToken) {
            // Not yet paired, skip heartbeat and re-check in 5s
            this.scheduleNext(5000);
            return;
        }

        try {
            // 1. Probe local database health
            const dbPing = await db.ping();
            const dbHealth = db.getHealth();

            // 2. Collect local system metrics
            const uptimeSeconds = Math.round((Date.now() - this.startTime) / 1000);
            const memoryMb = Math.round(process.memoryUsage().rss / (1024 * 1024));

            const metrics = {
                dbLatencyMs: dbPing.latencyMs,
                memoryMb,
                uptimeSeconds,
                nodeVersion: process.version,
                platform: `${os.type()} ${os.release()}`,
                localDbName: dbHealth.databaseName
            };

            // 3. Collect local outbox telemetry
            let outboxStats = null;
            try {
                outboxStats = await localOutbox.getOutboxStats();
            } catch (e) {}

            // 4. Assemble heartbeat payload
            const payload = {
                agentVersion: config.agentVersion,
                dbStatus: dbHealth.status,
                status: dbHealth.status === 'HEALTHY' ? 'ONLINE' : 'DEGRADED',
                metrics,
                outboxStats,
                timestamp: new Date().toISOString()
            };

            // 4. Send outbound heartbeat to Cloud
            await cloudClient.sendHeartbeat(
                config.cloudUrl,
                config.agentToken,
                config.installationId,
                payload
            );

            // Normal interval when successful
            this.scheduleNext(config.heartbeatIntervalMs || 15000);

        } catch (err) {
            // On failure, cloudClient has already computed exponential backoff
            const retryDelay = cloudClient.backoffDelayMs || 5000;
            this.scheduleNext(retryDelay);
        }
    }

    scheduleNext(delayMs) {
        if (!this.isRunning) return;
        if (this.timer) clearTimeout(this.timer);
        this.timer = setTimeout(() => this.tick(), delayMs);
    }
}

module.exports = new HeartbeatScheduler();
