require('dotenv').config();
const mongoose = require('mongoose');
const ClinicPatient = require('../src/models/clinicPatient.model');
const User = require('../src/models/user.model');
const Role = require('../src/models/role.model');

const DB_URI = process.env.MONGODB_URL || 'mongodb://localhost:27017/crm';

async function run() {
    await mongoose.connect(DB_URI);
    
    const patients = await ClinicPatient.find({});
    console.log('--- CLINIC PATIENTS ---');
    patients.forEach(p => console.log(`Patient _id: ${p._id}, patientUid: ${p.patientUid}, Name: ${p.name}, clinicId: ${p.clinicId}`));
    
    const roles = await Role.find({});
    console.log('--- ROLES ---');
    roles.forEach(r => console.log(`Role _id: ${r._id}, Name: ${r.name}, hospitalId: ${r.hospitalId}`));
    
    const clinicDocRole = await Role.findOne({ name: 'Clinic Doctor' });
    const doctors = await User.find({ role: clinicDocRole?._id });
    console.log('--- CLINIC DOCTORS ---');
    doctors.forEach(d => console.log(`Doctor _id: ${d._id}, Name: ${d.name}, hospitalId: ${d.hospitalId}, role: ${d.role}`));
    
    await mongoose.disconnect();
}
run();
