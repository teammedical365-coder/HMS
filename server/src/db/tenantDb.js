/**
 * tenantDb.js — Multi-Tenant Database Connection Manager
 *
 * Strategy: Database-per-tenant inside ONE Atlas cluster.
 *   - Master DB (MONGODB_URL): stores Hospitals, CentralAdmins, Roles (global)
 *   - Tenant DB (auto-named): stores all hospital-specific data
 *
 * Compass: Just connect to your cluster URI once. All tenant databases
 *          will automatically appear in the left sidebar as they are created.
 */

const mongoose = require('mongoose');

// In-memory cache: { hospitalDbName -> Mongoose Connection }
const connectionCache = new Map();

/**
 * Extract the base cluster URI (strip the database name from the URL).
 * e.g. "mongodb+srv://user:pass@cluster0.xyz.mongodb.net/IVF_CRM_TEST?retryWrites=true"
 *   -> "mongodb+srv://user:pass@cluster0.xyz.mongodb.net"
 */
function getBaseClusterUri() {
    const fullUri = process.env.MONGODB_URL;
    if (!fullUri) throw new Error('MONGODB_URL is not defined in .env');

    try {
        // Remove the database name and query params, keep the cluster URI
        // Works for standard mongodb+srv:// and simple mongodb:// formats
        const url = new URL(fullUri);
        return `${url.protocol}//${url.username}:${url.password}@${url.host}`;
    } catch (err) {
        // Fallback for MongoDB replica set URLs containing commas (e.g. ac-0.net:27017,ac-1.net:27017)
        // new URL() throws "Invalid URL" if the hostname contains commas.
        // We will manually extract the base URI using string manipulation.
        const protoIndex = fullUri.indexOf('://');
        if (protoIndex === -1) return fullUri.split('?')[0];

        const pathIndex = fullUri.indexOf('/', protoIndex + 3);
        if (pathIndex === -1) {
            return fullUri.split('?')[0]; // No database path, just strip query
        }

        return fullUri.substring(0, pathIndex);
    }
}

/**
 * Sanitize a hospitalId string to be safe for use as a MongoDB database name.
 * MongoDB database names cannot contain: / \ . " $ * < > : | ?
 */
function sanitizeDbName(hospitalId) {
    return `hms_hospital_${String(hospitalId).replace(/[^a-zA-Z0-9_-]/g, '_')}`;
}

/**
 * Get (or create and cache) a Mongoose connection for a specific hospital.
 *
 * @param {string} hospitalId - The MongoDB ObjectId string of the hospital
 * @returns {Promise<mongoose.Connection>}
 */
async function getTenantConnection(hospitalId) {
    const dbName = sanitizeDbName(hospitalId);

    // Return cached connection if it already exists (whether connected or still connecting)
    if (connectionCache.has(dbName)) {
        const cached = connectionCache.get(dbName);
        if (cached.readyState !== 0) { // 0 = disconnected
            return cached;
        }
        connectionCache.delete(dbName);
    }

    console.log(`🏥 Opening tenant DB connection: ${dbName}`);

    const connection = mongoose.createConnection(process.env.MONGODB_URL, {
        dbName: dbName, // CRITICAL: Standard Mongoose way to isolate tenant databases dynamically
        serverSelectionTimeoutMS: 15000,
        socketTimeoutMS: 45000,
        connectTimeoutMS: 30000,
        retryWrites: true,
        maxPoolSize: 10
    });

    // CACHE IMMEDIATELY before awaiting to prevent connection race conditions
    connectionCache.set(dbName, connection);

    // Wait for the connection to be established
    await new Promise((resolve, reject) => {
        connection.once('open', resolve);
        connection.once('error', reject);
    });

    console.log(`✅ Tenant DB connected: ${dbName}`);

    return connection;
}

/**
 * Get the MASTER database connection (the default mongoose connection).
 * This stores: Hospitals, CentralAdmins, global Roles.
 */
function getMasterConnection() {
    return mongoose.connection;
}

/**
 * Get the friendly database name for a hospitalId (for logging/display).
 */
function getTenantDbName(hospitalId) {
    return sanitizeDbName(hospitalId);
}

/**
 * Close and remove a tenant connection from cache.
 * Used when deleting a hospital to clean up resources.
 */
async function removeTenantConnection(hospitalId) {
    const dbName = sanitizeDbName(hospitalId);
    if (connectionCache.has(dbName)) {
        const conn = connectionCache.get(dbName);
        try { await conn.close(); } catch (e) { /* ignore */ }
        connectionCache.delete(dbName);
        console.log(`🗑️  Removed tenant connection from cache: ${dbName}`);
    }
}

/**
 * List all currently cached (open) tenant connections.
 * Useful for the Supreme Admin's monitoring dashboard.
 */
function getActiveConnections() {
    const active = [];
    for (const [dbName, conn] of connectionCache.entries()) {
        active.push({
            dbName,
            readyState: conn.readyState, // 1 = connected
            host: conn.host,
        });
    }
    return active;
}

module.exports = {
    getTenantConnection,
    getMasterConnection,
    getTenantDbName,
    getActiveConnections,
    removeTenantConnection,
};
