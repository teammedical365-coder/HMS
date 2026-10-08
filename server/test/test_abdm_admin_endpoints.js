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

async function testApi() {
    await connectDB();
    const server = app.listen(0);
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;

    let admin = await User.findOne({ role: { $in: ['hospitaladmin', 'superadmin', 'centraladmin'] } });
    if (!admin) {
        admin = await User.create({
            name: 'ABDM Test Admin',
            email: 'abdm_test_admin@medical365.in',
            phone: '9999999999',
            role: 'hospitaladmin',
            password: 'HashPassword123'
        });
    }

    const adminToken = jwt.sign({
        userId: admin._id,
        role: admin.role,
        hospitalId: admin.hospitalId || '65f123456789012345678902'
    }, JWT_SECRET, { expiresIn: '1h' });

    console.log('Testing Admin Endpoints with genuine DB Admin User...');

    // 1. GET /api/abdm/bridge/config
    const configRes = await axios.get(`${baseUrl}/api/abdm/bridge/config`, {
        headers: { Authorization: `Bearer ${adminToken}` }
    });
    console.log('1. Config API status:', configRes.status, 'bridgeUrl:', configRes.data.bridgeUrl, 'serviceType:', configRes.data.serviceType);

    // 2. PATCH /api/abdm/bridge/url
    const patchRes = await axios.patch(`${baseUrl}/api/abdm/bridge/url`, 
        { bridgeUrl: 'https://medical365.in/api/abdm' },
        { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    console.log('2. Patch URL API status:', patchRes.status, 'message:', patchRes.data.message);

    // 3. POST /api/abdm/bridge/services
    const serviceRes = await axios.post(`${baseUrl}/api/abdm/bridge/services`,
        { serviceId: 'SBXID_087160', serviceName: 'Medical365 HMS', alias: ['Medical365'] },
        { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    console.log('3. Register Service API status:', serviceRes.status, 'type:', serviceRes.data.service.type);

    // 4. GET /api/abdm/bridge/verify
    const verifyRes = await axios.get(`${baseUrl}/api/abdm/bridge/verify`, {
        headers: { Authorization: `Bearer ${adminToken}` }
    });
    console.log('4. Verify API status:', verifyRes.status, 'diagnostic live status:', verifyRes.data.diagnostic.gatewayLiveStatus);

    server.close();
    await mongoose.disconnect();
    console.log('\n✅ ALL ABDM BRIDGE ADMIN ENDPOINTS SUCCESSFULLY TESTED AND VERIFIED!');
}

testApi().catch(err => {
    console.error('API test failed:', err.response?.data || err.message);
    process.exit(1);
});
