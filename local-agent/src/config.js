const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const CONFIG_PATH = path.resolve(__dirname, '../config.json');

class ConfigManager {
    constructor() {
        this.config = this.loadConfig();
    }

    loadConfig() {
        let loaded = {};
        if (fs.existsSync(CONFIG_PATH)) {
            try {
                const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
                loaded = JSON.parse(raw);
            } catch (err) {
                logger.error('CONFIG', `Failed to parse config.json: ${err.message}`);
            }
        }

        // Merge with environment variables
        const config = {
            cloudUrl: process.env.MED365_CLOUD_URL || loaded.cloudUrl || 'http://localhost:3000',
            hospitalId: process.env.MED365_HOSPITAL_ID || loaded.hospitalId || '',
            installationId: process.env.MED365_INSTALLATION_ID || loaded.installationId || '',
            pairingToken: process.env.MED365_PAIRING_TOKEN || loaded.pairingToken || '',
            agentToken: process.env.MED365_AGENT_TOKEN || loaded.agentToken || null,
            localMongoUri: process.env.MED365_LOCAL_MONGO_URI || loaded.localMongoUri || 'mongodb://localhost:27017/medical365_local',
            localHealthPort: parseInt(process.env.MED365_HEALTH_PORT || loaded.localHealthPort || '4000', 10),
            heartbeatIntervalMs: parseInt(process.env.MED365_HEARTBEAT_INTERVAL || loaded.heartbeatIntervalMs || '15000', 10),
            agentName: loaded.agentName || 'Hospital Local Server',
            agentVersion: '2.4.0'
        };

        return config;
    }

    get() {
        return this.config;
    }

    save(updates = {}) {
        this.config = { ...this.config, ...updates };
        try {
            fs.writeFileSync(CONFIG_PATH, JSON.stringify(this.config, null, 2), 'utf8');
            logger.info('CONFIG', 'Configuration file updated successfully.');
        } catch (err) {
            logger.error('CONFIG', `Failed to write config.json: ${err.message}`);
        }
    }
}

module.exports = new ConfigManager();
