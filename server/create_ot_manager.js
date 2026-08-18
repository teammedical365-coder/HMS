require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./src/models/user.model');
const bcrypt = require('bcryptjs');

async function createOTManager() {
    await mongoose.connect(process.env.MONGODB_URL || 'mongodb://localhost:27017/hms_master');
    console.log('Connected to DB');
    
    // Pick the first hospital admin to get a valid hospitalId
    const admin = await User.findOne({ role: 'hospitaladmin' });
    if (!admin) {
        console.log("No hospital admin found to copy hospitalId from.");
        process.exit(1);
    }
    
    const hospitalId = admin.hospitalId;
    const email = 'otmanager@medical365.in';
    
    // Check if user already exists
    const existing = await User.findOne({ email });
    if (existing) {
        console.log("OT Manager already exists! Login with:", email);
        process.exit(0);
    }
    
    const hashedPassword = await bcrypt.hash('123456', 10);
    
    const otManager = new User({
        name: 'OT Manager',
        email: email,
        password: hashedPassword,
        phone: '9999999999',
        role: 'otmanager',
        hospitalId: hospitalId,
        isVerified: true
    });
    
    await otManager.save();
    console.log("==================================================");
    console.log("Successfully created dedicated OT Manager!");
    console.log("Email: " + email);
    console.log("Password: 123456");
    console.log("Hospital ID: " + hospitalId);
    console.log("==================================================");
    
    process.exit(0);
}

createOTManager();
