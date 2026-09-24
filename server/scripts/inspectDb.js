const mongoose = require('mongoose');
require('dotenv').config();
const QuestionLibrary = require('../src/models/questionLibrary.model');
const Doctor = require('../src/models/doctor.model');
const Hospital = require('../src/models/hospital.model');
const User = require('../src/models/user.model');

async function check() {
    await mongoose.connect(process.env.MONGODB_URL);
    console.log('Connected to MongoDB Atlas');

    const docs = await QuestionLibrary.find({}).lean();
    console.log(`QuestionLibrary records: ${docs.length}`);
    docs.forEach(d => {
        console.log(`- QL ID: ${d._id} | hospitalId: ${d.hospitalId} | version: ${d.version}`);
        console.log(`  Depts:`, Object.keys(d.data || {}));
        if (d.data?.ENT) {
            console.log(`  ENT Categories:`, Object.keys(d.data.ENT));
            console.log(`  ENT Details:`, JSON.stringify(d.data.ENT, null, 2));
        }
    });

    const doctors = await Doctor.find({}).lean();
    console.log(`\nDoctors in DB: ${doctors.length}`);
    doctors.forEach(d => {
        console.log(`- Doctor: ${d.name} (${d._id}) | hosp: ${d.hospitalId} | depts: ${d.departments} | specialty: ${d.specialty} | status: ${d.status}`);
    });

    const hospitals = await Hospital.find({}).lean();
    console.log(`\nHospitals in DB: ${hospitals.length}`);
    hospitals.forEach(h => {
        console.log(`- Hosp: ${h.name} (${h._id}) | depts: ${h.departments}`);
    });

    process.exit(0);
}

check().catch(e => {
    console.error('Error:', e);
    process.exit(1);
});
