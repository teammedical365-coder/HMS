let mongoose;
try {
    mongoose = require('mongoose');
} catch (e) {
    try {
        mongoose = require('../server/node_modules/mongoose');
    } catch (e2) {
        mongoose = require('../../server/node_modules/mongoose');
    }
}
const logger = require('./logger');

class LocalDatabaseManager {
    constructor() {
        this.status = 'DOWN'; // 'HEALTHY' | 'DOWN'
        this.latencyMs = 0;
        this.databaseName = 'medical365_local';
        this.lastChecked = null;
        this.isConnecting = false;
        this.reconnectTimer = null;
    }

    async connect(mongoUri) {
        if (this.isConnecting) return;
        this.isConnecting = true;

        logger.info('DATABASE', `Connecting to Local MongoDB: ${mongoUri.replace(/:([^:@]{1,})@/, ':****@')}`);

        try {
            await mongoose.connect(mongoUri, {
                serverSelectionTimeoutMS: 5000,
                connectTimeoutMS: 5000
            });

            this.status = 'HEALTHY';
            this.isConnecting = false;
            this.databaseName = mongoose.connection.name || 'medical365_local';
            logger.info('DATABASE', `Connected successfully to Local MongoDB (${this.databaseName})`);

            // Attach event listeners
            mongoose.connection.on('disconnected', () => {
                this.status = 'DOWN';
                logger.warn('DATABASE', 'Local MongoDB connection disconnected. Scheduling reconnect...');
                this.scheduleReconnect(mongoUri);
            });

            mongoose.connection.on('error', (err) => {
                this.status = 'DOWN';
                logger.error('DATABASE', `Local MongoDB error: ${err.message}`);
            });

            mongoose.connection.on('reconnected', () => {
                this.status = 'HEALTHY';
                logger.info('DATABASE', 'Local MongoDB reconnected successfully.');
            });

        } catch (err) {
            this.status = 'DOWN';
            this.isConnecting = false;
            logger.error('DATABASE', `Failed to connect to Local MongoDB: ${err.message}`);
            this.scheduleReconnect(mongoUri);
        }
    }

    scheduleReconnect(mongoUri) {
        if (this.reconnectTimer) return;
        this.reconnectTimer = setTimeout(async () => {
            this.reconnectTimer = null;
            if (mongoose.connection.readyState !== 1) {
                logger.info('DATABASE', 'Attempting reconnection to Local MongoDB...');
                await this.connect(mongoUri);
            }
        }, 5000);
    }

    /**
     * Measure ping latency to verify database responsiveness
     */
    async ping() {
        if (mongoose.connection.readyState !== 1) {
            this.status = 'DOWN';
            this.latencyMs = 0;
            return { status: 'DOWN', latencyMs: 0 };
        }

        const start = Date.now();
        try {
            if (mongoose.connection.db) {
                await mongoose.connection.db.command({ ping: 1 });
            }
            this.latencyMs = Date.now() - start;
            this.status = 'HEALTHY';
            this.lastChecked = new Date();
            return { status: 'HEALTHY', latencyMs: this.latencyMs };
        } catch (err) {
            this.status = 'DOWN';
            this.latencyMs = 0;
            logger.error('DATABASE', `Local MongoDB ping check failed: ${err.message}`);
            return { status: 'DOWN', latencyMs: 0 };
        }
    }

    getHealth() {
        return {
            status: this.status,
            connected: mongoose.connection.readyState === 1,
            latencyMs: this.latencyMs,
            databaseName: this.databaseName,
            lastChecked: this.lastChecked
        };
    }

    getDb() {
        if (mongoose.connection && mongoose.connection.readyState === 1) {
            return mongoose.connection.db;
        }
        return null;
    }

    async disconnect() {
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        await mongoose.disconnect();
        this.status = 'DOWN';
        logger.info('DATABASE', 'Local MongoDB connection closed gracefully.');
    }
}

module.exports = new LocalDatabaseManager();
