let axios;
try {
    axios = require('axios');
} catch (e) {
    try {
        axios = require('../server/node_modules/axios');
    } catch (e2) {
        axios = require('../../server/node_modules/axios');
    }
}
const logger = require('./logger');

class CloudClient {
    constructor() {
        this.status = 'DISCONNECTED'; // 'CONNECTED' | 'DISCONNECTED' | 'RECONNECTING'
        this.lastHeartbeatAck = null;
        this.lastError = null;
        this.consecutiveFailures = 0;
        this.backoffDelayMs = 2000;
        this.maxBackoffMs = 30000;
    }

    /**
     * Pair the agent with cloud using pairing token
     */
    async pair(cloudUrl, installationId, pairingToken, agentVersion, metrics = {}) {
        logger.info('CLOUD', `Attempting initial pairing with Cloud (${cloudUrl}) for ${installationId}...`);

        try {
            const res = await axios.post(`${cloudUrl}/api/local-agent/pair`, {
                installationId,
                pairingToken,
                agentVersion,
                metrics
            }, { timeout: 10000 });

            if (res.data && res.data.success && res.data.agentToken) {
                this.status = 'CONNECTED';
                this.lastError = null;
                this.consecutiveFailures = 0;
                this.backoffDelayMs = 2000;
                logger.info('CLOUD', `Successfully paired with Hospital "${res.data.hospitalName || res.data.hospitalId}"!`);
                return res.data;
            } else {
                throw new Error(res.data?.message || 'Pairing rejected by cloud.');
            }
        } catch (err) {
            this.status = 'DISCONNECTED';
            this.lastError = err.response?.data?.message || err.message;
            logger.error('CLOUD', `Pairing failed: ${this.lastError}`);
            throw new Error(this.lastError);
        }
    }

    /**
     * Send heartbeat to Medical365 Cloud
     */
    async sendHeartbeat(cloudUrl, agentToken, installationId, payload) {
        try {
            const res = await axios.post(`${cloudUrl}/api/local-agent/heartbeat`, {
                installationId,
                ...payload
            }, {
                headers: {
                    'Authorization': `Bearer ${agentToken}`,
                    'x-agent-token': agentToken,
                    'Content-Type': 'application/json'
                },
                timeout: 8000
            });

            if (res.data && res.data.success) {
                const wasDisconnected = this.status !== 'CONNECTED';
                this.status = 'CONNECTED';
                this.lastHeartbeatAck = new Date();
                this.lastError = null;
                this.consecutiveFailures = 0;
                this.backoffDelayMs = 2000;

                if (wasDisconnected) {
                    logger.info('CLOUD', 'Cloud connection restored. Heartbeat acknowledged.');
                }
                return res.data;
            } else {
                throw new Error(res.data?.message || 'Heartbeat rejected.');
            }
        } catch (err) {
            this.handleHeartbeatFailure(err);
            throw err;
        }
    }

    handleHeartbeatFailure(err) {
        this.consecutiveFailures++;
        this.lastError = err.response?.data?.message || err.message;

        if (this.status === 'CONNECTED') {
            logger.warn('CLOUD', `Cloud connection lost: ${this.lastError}. Entering RECONNECTING state.`);
            this.status = 'DISCONNECTED';
        } else {
            this.status = 'RECONNECTING';
        }

        // Calculate exponential backoff with jitter for next attempt
        this.backoffDelayMs = Math.min(
            this.maxBackoffMs,
            Math.round(this.backoffDelayMs * 1.5 + Math.random() * 500)
        );

        logger.warn('CLOUD', `Heartbeat failed (Attempt #${this.consecutiveFailures}). Next retry in ${Math.round(this.backoffDelayMs / 1000)}s.`);
    }

    /**
     * Quick internet / cloud ping check
     */
    async ping(cloudUrl) {
        try {
            const start = Date.now();
            const res = await axios.get(`${cloudUrl}/api/local-agent/ping`, { timeout: 5000 });
            return {
                reachable: true,
                latencyMs: Date.now() - start,
                serverTime: res.data?.timestamp
            };
        } catch (err) {
            return {
                reachable: false,
                latencyMs: 0,
                error: err.message
            };
        }
    }

    getHealth() {
        return {
            status: this.status,
            lastHeartbeatAck: this.lastHeartbeatAck,
            consecutiveFailures: this.consecutiveFailures,
            lastError: this.lastError
        };
    }

    // ── Phase 2: Cloud -> Local Synchronization API Methods ───────────────────

    async fetchInitialSyncBatch(cloudUrl, agentToken, entityType, skip = 0, limit = 200) {
        const res = await axios.get(`${cloudUrl}/api/local-sync/initial-sync/batch`, {
            params: { entityType, skip, limit },
            headers: { 'x-agent-token': agentToken },
            timeout: 15000
        });
        return res.data;
    }

    async reportInitialSyncProgress(cloudUrl, agentToken, progressPayload) {
        const res = await axios.post(`${cloudUrl}/api/local-sync/initial-sync/progress`, progressPayload, {
            headers: { 'x-agent-token': agentToken },
            timeout: 10000
        });
        return res.data;
    }

    async fetchPendingEvents(cloudUrl, agentToken, afterVersion = 0, limit = 100) {
        const res = await axios.get(`${cloudUrl}/api/local-sync/events`, {
            params: { afterVersion, limit },
            headers: { 'x-agent-token': agentToken },
            timeout: 15000
        });
        return res.data;
    }

    async acknowledgeEvents(cloudUrl, agentToken, acks = []) {
        const res = await axios.post(`${cloudUrl}/api/local-sync/ack`, { acks }, {
            headers: { 'x-agent-token': agentToken },
            timeout: 10000
        });
        return res.data;
    }

    /**
     * Phase 3: Push a batch of local mutations from Outbox to Cloud
     */
    async pushOutboxBatch(cloudUrl, agentToken, events = []) {
        const res = await axios.post(`${cloudUrl}/api/local-sync/push`, { events }, {
            headers: { 'x-agent-token': agentToken },
            timeout: 20000
        });
        return res.data;
    }
}

module.exports = new CloudClient();
