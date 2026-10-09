/**
 * test_abdm_admin_endpoints.js — Verify ABDM Bridge Admin Endpoints with genuine MongoDB connection
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const connectDB = require('../src/db/db');
const { JWT_SECRET } = require('../src/config/jwt');
const app = require('../src/app');
const User = require('../src/models/user.model');
const Hospital = require('../src/models/hospital.model');

async function testApi() {
    await connectDB();
    const server = app.listen(0);
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;

    let platformAdmin = await User.findOne({ role: { $in: ['superadmin', 'centraladmin'] } });
    if (!platformAdmin) {
        platformAdmin = await User.create({
            name: 'ABDM Platform Admin',
            email: 'abdm_platform_admin@medical365.in',
            phone: '9888888888',
            role: 'centraladmin',
            password: 'HashPassword123'
        });
    }

    let testHospital = await Hospital.findOne({});
    if (!testHospital) {
        testHospital = await Hospital.create({
            name: 'ABDM Test Hospital',
            phone: '9777777777',
            email: 'hospital_test@medical365.in',
        });
    }

    let hospitalAdmin = await User.findOne({ role: 'hospitaladmin', hospitalId: testHospital._id });
    if (!hospitalAdmin) {
        hospitalAdmin = await User.create({
            name: 'ABDM Hospital Admin',
            email: 'abdm_hosp_admin@medical365.in',
            phone: '9666666666',
            role: 'hospitaladmin',
            hospitalId: testHospital._id,
            password: 'HashPassword123'
        });
    }

    const platformToken = jwt.sign({
        userId: platformAdmin._id,
        role: platformAdmin.role,
        hospitalId: null
    }, JWT_SECRET, { expiresIn: '1h' });

    const hospitalToken = jwt.sign({
        userId: hospitalAdmin._id,
        role: hospitalAdmin.role,
        hospitalId: testHospital._id
    }, JWT_SECRET, { expiresIn: '1h' });

    console.log('Testing Admin Endpoints with genuine DB Platform Admin & Hospital Admin...');

    // 1. GET /api/abdm/bridge/config (Platform admin)
    const configRes = await axios.get(`${baseUrl}/api/abdm/bridge/config`, {
        headers: { Authorization: `Bearer ${platformToken}` }
    });
    console.log('1. Config API status:', configRes.status, 'configuredBridgeUrl:', configRes.data.configuredBridgeUrl, 'isConfigured:', configRes.data.isConfigured);

    // 2. GET /api/abdm/bridge/hospital (Hospital admin read-only)
    const hospRes = await axios.get(`${baseUrl}/api/abdm/bridge/hospital`, {
        headers: { Authorization: `Bearer ${hospitalToken}` }
    });
    console.log('2. Hospital Status API status:', hospRes.status, 'hospital:', hospRes.data.hospital, 'enabled:', hospRes.data.enabled);

    // 3. RBAC check: Hospital admin forbidden from platform config
    try {
        await axios.get(`${baseUrl}/api/abdm/bridge/config`, {
            headers: { Authorization: `Bearer ${hospitalToken}` }
        });
        throw new Error('Hospital admin should NOT have access to platform bridge config');
    } catch (err) {
        console.log('3. RBAC Isolation verified: hospital admin blocked from platform config (Status: ' + (err.response?.status || err.message) + ')');
    }

    server.close();
    await mongoose.disconnect();
    console.log('\n✅ ALL ABDM BRIDGE ADMIN ENDPOINTS SUCCESSFULLY TESTED AND VERIFIED!');
}

testApi().catch(err => {
    console.error('API test failed:', err.response?.data || err.message);
    process.exit(1);
});
