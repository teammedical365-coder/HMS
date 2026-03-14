/**
 * provision_tenant_dbs.js
 *
 * One-time script: Creates an isolated MongoDB database for every existing hospital
 * that was registered before the multi-tenant architecture was implemented.
 *
 * Run once:
 *   node src/scripts/provision_tenant_dbs.js
 *
 * After running, refresh MongoDB Compass — you will see new databases like:
 *   hms_hospital_<objectId>
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Hospital = require('../models/hospital.model');

const MONGODB_URL = process.env.MONGODB_URL;

function sanitizeDbName(hospitalId) {
    return `hms_hospital_${String(hospitalId).replace(/[^a-zA-Z0-9_-]/g, '_')}`;
}

function getBaseClusterUri() {
    const url = new URL(MONGODB_URL);
    return `${url.protocol}//${url.username}:${url.password}@${url.host}`;
}

async function provisionTenantDb(hospital) {
    const dbName = sanitizeDbName(String(hospital._id));
    const baseUri = getBaseClusterUri();
    const tenantUri = `${baseUri}/${dbName}?retryWrites=true&w=majority`;

    const conn = mongoose.createConnection(tenantUri, {
        serverSelectionTimeoutMS: 30000,
        socketTimeoutMS: 45000,
    });

    await new Promise((resolve, reject) => {
        conn.once('open', resolve);
        conn.once('error', reject);
    });

    // Write a seed document — this physically creates the database
    await conn.db.collection('hospital_meta').insertOne({
        hospitalId: hospital._id,
        hospitalName: hospital.name,
        city: hospital.city || '',
        state: hospital.state || '',
        departments: hospital.departments || [],
        createdAt: new Date(),
        _type: 'tenant_init',
    });

    await conn.close();
    return dbName;
}

async function main() {
    console.log('\n🚀 Provisioning tenant databases for all existing hospitals...\n');

    await mongoose.connect(MONGODB_URL);
    console.log('✅ Connected to master DB\n');

    const hospitals = await Hospital.find({});
    console.log(`Found ${hospitals.length} hospital(s)\n`);

    let success = 0;
    let failed = 0;

    for (const hospital of hospitals) {
        try {
            const dbName = await provisionTenantDb(hospital);
            console.log(`✅  ${hospital.name.padEnd(30)} → ${dbName}`);
            success++;
        } catch (err) {
            console.error(`❌  ${hospital.name.padEnd(30)} → FAILED: ${err.message}`);
            failed++;
        }
    }

    console.log('\n─────────────────────────────────────────');
    console.log(`✅  Success: ${success}`);
    if (failed > 0) console.log(`❌  Failed:  ${failed}`);
    console.log('─────────────────────────────────────────');
    console.log('\n🎉 Done! Refresh MongoDB Compass to see the new databases.\n');

    await mongoose.disconnect();
    process.exit(0);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
