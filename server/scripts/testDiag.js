const mongoose = require('mongoose');
const User = require('../src/models/user.model');
const Doctor = require('../src/models/doctor.model');
const Hospital = require('../src/models/hospital.model');
const QuestionLibrary = require('../src/models/questionLibrary.model');
require('dotenv').config({ path: './.env' });

async function run() {
    await mongoose.connect(process.env.MONGODB_URL);
    const user = await User.findOne({ email: 'ydeepesh0369@gmail.com' }).lean();
    console.log('User:', {
        id: user._id,
        name: user.name,
        role: user.role,
        hospitalId: user.hospitalId,
        assignedDoctors: user.assignedDoctors,
        departments: user.departments
    });

    const populatedUser = await User.findOne({ email: 'ydeepesh0369@gmail.com' }).populate({
        path: 'assignedDoctors',
        match: user.hospitalId ? { hospitalId: user.hospitalId, status: { $ne: 'Inactive' } } : { status: { $ne: 'Inactive' } }
    }).lean();
    console.log('Populated user assignedDoctors:', populatedUser.assignedDoctors);

    const allHospitalDoctors = await Doctor.find({ hospitalId: user.hospitalId, status: { $ne: 'Inactive' } }).lean();
    console.log('All Hospital Doctors in Pacific Hospital:', allHospitalDoctors.map(d => ({ _id: d._id, name: d.name, specialty: d.specialty, depts: d.departments })));

    const hospital = await Hospital.findById(user.hospitalId).lean();
    console.log('Hospital:', { _id: hospital._id, name: hospital.name, departments: hospital.departments });

    const qlib = await QuestionLibrary.findOne({ hospitalId: user.hospitalId }).sort({ version: -1 }).lean();
    console.log('Hospital QLib version:', qlib?.version, 'keys:', Object.keys(qlib?.data || {}));

    await mongoose.disconnect();
}

run().catch(console.error);
