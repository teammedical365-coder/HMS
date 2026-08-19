require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./src/models/user.model');
const HospitalMaster = require('./src/models/hospital.model');

async function checkHospital() {
    await mongoose.connect(process.env.MONGODB_URL || 'mongodb://localhost:27017/hms_master');
    const otManager = await User.findOne({ email: 'otmanager@medical365.in' });
    if (!otManager) {
        console.log("No OT Manager found.");
        process.exit(1);
    }
    
    const hospital = await HospitalMaster.findById(otManager.hospitalId);
    if (hospital) {
        console.log("HOSPITAL_NAME: " + hospital.name);
        console.log("HOSPITAL_SLUG: " + hospital.slug);
    } else {
        console.log("Hospital not found for ID: " + otManager.hospitalId);
    }
    process.exit(0);
}

checkHospital();
