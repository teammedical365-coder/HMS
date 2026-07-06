require('dotenv').config();
const mongoose = require('mongoose');
const ClinicPatient = require('../src/models/clinicPatient.model');

const DB_URI = process.env.MONGODB_URL || 'mongodb://localhost:27017/crm';

async function run() {
    await mongoose.connect(DB_URI);
    const cp = await ClinicPatient.findOne({});
    console.log('Clinic Patient:', cp);
    await mongoose.disconnect();
}
run();
