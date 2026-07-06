require('dotenv').config();
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const User = require('../src/models/user.model');
const Role = require('../src/models/role.model');

const DB_URI = process.env.MONGODB_URL || 'mongodb://localhost:27017/crm';
const JWT_SECRET = process.env.JWT_SECRET || 'this_is_a_secure_fallback_secret_for_local_development_only_12345';

async function run() {
    await mongoose.connect(DB_URI);
    
    // Find a clinic doctor user
    const clinicDocRole = await Role.findOne({ name: 'Clinic Doctor' });
    const doctorUser = await User.findOne({ role: clinicDocRole._id });
    if (!doctorUser) {
        console.log('No clinic doctor user found!');
        await mongoose.disconnect();
        return;
    }
    
    const tokenPayload = {
        userId: doctorUser._id.toString(),
        role: doctorUser.role.toString(),
        hospitalId: doctorUser.hospitalId ? doctorUser.hospitalId.toString() : null
    };
    
    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '1h' });
    console.log('Generated token for', doctorUser.name);
    
    await mongoose.disconnect();
    
    try {
        const response = await axios.get('http://127.0.0.1:3000/api/patients/6a3f832c98baa12e4ce315be/full-history', {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });
        console.log('STATUS CODE:', response.status);
        console.log('RESPONSE DATA:', JSON.stringify(response.data, null, 2));
    } catch (err) {
        console.log('API ERROR STATUS CODE:', err.response?.status);
        console.log('API ERROR DATA:', err.response?.data);
        console.log('ERROR:', err.message);
        console.error('STACK:', err.stack);
    }
}
run();
