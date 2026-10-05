const localAgentService = require('../services/localAgent/localAgent.service');

/**
 * Controller handling Hospital Local Agent Cloud APIs
 */
class LocalAgentController {
    /**
     * Hospital Admin: Generate/Refresh Pairing Token
     * POST /api/local-agent/provision
     */
    async provisionInstallation(req, res) {
        try {
            const hospitalId = req.hospitalId || req.user?.hospitalId;
            if (!hospitalId) {
                return res.status(400).json({ success: false, message: 'Hospital context required.' });
            }

            const { customName } = req.body;
            const result = await localAgentService.provisionInstallation(hospitalId, customName);

            // Construct standard cloud API URL for easy copy-paste
            const host = req.get('host');
            const protocol = req.protocol;
            const cloudUrl = `${protocol}://${host}`;

            return res.json({
                success: true,
                ...result,
                cloudUrl
            });
        } catch (err) {
            console.error('[LocalAgentController.provisionInstallation] Error:', err.message);
            return res.status(500).json({ success: false, message: err.message });
        }
    }

    /**
     * Hospital Admin: Get Live Agent & Connection Status
     * GET /api/local-agent/status
     */
    async getStatus(req, res) {
        try {
            const hospitalId = req.hospitalId || req.user?.hospitalId;
            if (!hospitalId) {
                return res.status(400).json({ success: false, message: 'Hospital context required.' });
            }

            const status = await localAgentService.getStatus(hospitalId);
            return res.json({
                success: true,
                ...status
            });
        } catch (err) {
            console.error('[LocalAgentController.getStatus] Error:', err.message);
            return res.status(500).json({ success: false, message: err.message });
        }
    }

    /**
     * Hospital Admin: Test Local DB & Cloud Connection
     * POST /api/local-agent/test-connection
     */
    async testConnection(req, res) {
        try {
            const hospitalId = req.hospitalId || req.user?.hospitalId;
            if (!hospitalId) {
                return res.status(400).json({ success: false, message: 'Hospital context required.' });
            }

            const result = await localAgentService.testConnection(hospitalId);
            return res.json(result);
        } catch (err) {
            console.error('[LocalAgentController.testConnection] Error:', err.message);
            return res.status(500).json({ success: false, message: err.message });
        }
    }

    /**
     * Hospital Admin: Revoke Installation
     * POST /api/local-agent/revoke
     */
    async revokeInstallation(req, res) {
        try {
            const hospitalId = req.hospitalId || req.user?.hospitalId;
            if (!hospitalId) {
                return res.status(400).json({ success: false, message: 'Hospital context required.' });
            }

            const result = await localAgentService.revokeInstallation(hospitalId);
            return res.json(result);
        } catch (err) {
            console.error('[LocalAgentController.revokeInstallation] Error:', err.message);
            return res.status(500).json({ success: false, message: err.message });
        }
    }

    /**
     * Public / Local Agent: Pair with Cloud
     * POST /api/local-agent/pair
     */
    async pairAgent(req, res) {
        try {
            const { installationId, pairingToken, agentVersion, metrics } = req.body;
            const ipAddress = req.ip || req.connection?.remoteAddress || '';

            const result = await localAgentService.pairAgent({
                installationId,
                pairingToken,
                agentVersion,
                metrics,
                ipAddress
            });

            return res.json(result);
        } catch (err) {
            console.error('[LocalAgentController.pairAgent] Error:', err.message);
            return res.status(400).json({ success: false, message: err.message });
        }
    }

    /**
     * Local Agent: Authenticated Heartbeat
     * POST /api/local-agent/heartbeat
     */
    async processHeartbeat(req, res) {
        try {
            const authHeader = req.headers.authorization || req.headers['x-agent-token'];
            if (!authHeader) {
                return res.status(401).json({ success: false, message: 'Authorization header or x-agent-token required.' });
            }

            const { installationId, dbStatus, status, agentVersion, metrics, outboxStats } = req.body;
            const ipAddress = req.ip || req.connection?.remoteAddress || '';

            const result = await localAgentService.processHeartbeat({
                token: authHeader,
                installationId,
                dbStatus,
                status,
                agentVersion,
                metrics,
                outboxStats,
                ipAddress
            });

            return res.json(result);
        } catch (err) {
            return res.status(401).json({ success: false, message: err.message });
        }
    }

    /**
     * Public: Ping probe
     * GET /api/local-agent/ping
     */
    ping(req, res) {
        return res.json({
            success: true,
            message: 'Medical365 Cloud Local-Agent Gateway is alive',
            timestamp: Date.now()
        });
    }
}

module.exports = new LocalAgentController();
