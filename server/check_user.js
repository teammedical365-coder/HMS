require('dotenv').config();
const mongoose = require('mongoose');
async function findKushal() {
    await mongoose.connect(process.env.MONGODB_URL || 'mongodb://127.0.0.1:27017/hms');
    const User = require('./src/models/user.model');
    const Role = require('./src/models/role.model');
    const ClinicPatient = require('./src/models/clinicPatient.model');

    const users = await User.find({ name: { $regex: 'kushal', $options: 'i' } }).lean();
    console.log('Found users by kushal:', users.map(u => ({ _id: u._id, name: u.name, role: u.role, hospitalId: u.hospitalId, patientId: u.patientId, mrn: u.mrn })));
    
    const clinicPatients = await ClinicPatient.find({ name: { $regex: 'kushal', $options: 'i' } }).lean();
    console.log('Found clinic patients by kushal:', clinicPatients.map(c => ({ _id: c._id, name: c.name, clinicId: c.clinicId, patientUid: c.patientUid })));

    const allPatients = await User.find({ role: 'patient' }).limit(5).select('name role hospitalId patientId mrn').lean();
    console.log('Sample User patients:', allPatients);

    const allUsersWithRoles = await User.find({}).limit(10).select('name role hospitalId').lean();
    console.log('Sample 10 users in DB:', allUsersWithRoles);

    await mongoose.disconnect();
}
findKushal();
