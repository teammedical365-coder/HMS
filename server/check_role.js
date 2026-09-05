require('dotenv').config();
const mongoose = require('mongoose');
async function checkRole() {
    await mongoose.connect(process.env.MONGODB_URL || 'mongodb://127.0.0.1:27017/hms');
    const Role = require('./src/models/role.model');
    const role = await Role.findById('6a7ea4edeb86903c836d3faf').lean();
    console.log('Role for 6a7ea4edeb86903c836d3faf is:', role);
    const allRoles = await Role.find({}).lean();
    console.log('All roles in DB:', allRoles.map(r => ({ _id: r._id, name: r.name, hospitalId: r.hospitalId })));
    await mongoose.disconnect();
}
checkRole();
