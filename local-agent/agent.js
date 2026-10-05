/**
 * Medical365 Local Agent — Main Process
 * Hospital Server Local Infrastructure for Offline Database & Sync (Phase 1)
 */

const logger = require('./src/logger');
const configManager = require('./src/config');
const db = require('./src/db');
const cloudClient = require('./src/cloudClient');
const heartbeat = require('./src/heartbeat');
const localHealthServer = require('./src/localHealthServer');
const syncManager = require('./src/sync/syncManager');

async function main() {
    console.log('========================================================');
    console.log('       MEDICAL365 HMS — LOCAL AGENT (PHASE 2)           ');
    console.log('========================================================');

    const config = configManager.get();
    logger.info('AGENT', `Initializing Medical365 Local Agent v${config.agentVersion}...`);
    logger.info('AGENT', `Cloud URL: ${config.cloudUrl}`);
    logger.info('AGENT', `Installation ID: ${config.installationId || '[NOT CONFIGURED]'}`);

    // 1. Start Local Health Server on port 4000
    localHealthServer.start(config.localHealthPort || 4000);

    // 2. Connect to Hospital Local MongoDB
    await db.connect(config.localMongoUri);

    // 3. Pairing & Cloud Connectivity
    if (!config.agentToken) {
        if (config.installationId && config.pairingToken) {
            logger.info('AGENT', `No permanent agentToken found. Initiating pairing with pairingToken: ${config.pairingToken}...`);
            try {
                const pairResult = await cloudClient.pair(
                    config.cloudUrl,
                    config.installationId,
                    config.pairingToken,
                    config.agentVersion
                );

                // Save permanent token into config.json
                configManager.save({
                    agentToken: pairResult.agentToken,
                    pairingToken: null
                });

                logger.info('AGENT', 'Pairing complete! Permanent agentToken stored.');
                heartbeat.start();
                syncManager.start(config.cloudUrl, pairResult.agentToken);
            } catch (err) {
                logger.error('AGENT', `Pairing failed: ${err.message}. Retrying in 10 seconds...`);
                setTimeout(() => main(), 10000);
                return;
            }
        } else {
            logger.warn('AGENT', 'Agent is NOT PAIRED. Please set installationId and pairingToken in config.json or generate from Hospital Admin.');
            logger.warn('AGENT', 'Agent will keep running in waiting state.');
        }
    } else {
        logger.info('AGENT', 'Permanent agentToken detected. Starting heartbeat & sync loops...');
        heartbeat.start();
        syncManager.start(config.cloudUrl, config.agentToken);
    }
}

// Graceful termination handling
process.on('SIGINT', async () => {
    logger.info('AGENT', 'Received SIGINT. Shutting down gracefully...');
    heartbeat.stop();
    syncManager.stop();
    localHealthServer.stop();
    await db.disconnect();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    logger.info('AGENT', 'Received SIGTERM. Shutting down gracefully...');
    heartbeat.stop();
    syncManager.stop();
    localHealthServer.stop();
    await db.disconnect();
    process.exit(0);
});

main().catch((err) => {
    logger.error('AGENT', `Fatal agent error: ${err.message}`);
});
