require('dotenv').config();
const mongoose = require('mongoose');
async function testSearch() {
    await mongoose.connect(process.env.MONGODB_URL || 'mongodb://127.0.0.1:27017/hms');
    const MasterUser = require('./src/models/user.model');
    const Role = require('./src/models/role.model');

    const patientRole = await Role.findOne({ name: { $regex: /^patient$/i } }).select('_id').lean();
    const patientRoleIds = ['patient', 'Patient'];
    if (patientRole) {
        patientRoleIds.push(patientRole._id);
        patientRoleIds.push(patientRole._id.toString());
    }

    const term = 'kushal';
    const regexTerm = { $regex: term, $options: 'i' };

    const patients = await MasterUser.find({
        $and: [
            {
                $or: [
                    { role: { $in: patientRoleIds } },
                    { patientId: { $exists: true, $ne: null, $ne: '' } },
                    { mrn: { $exists: true, $ne: null, $ne: '' } }
                ]
            },
            {
                $or: [
                    { phone: regexTerm },
                    { patientId: regexTerm },
                    { mrn: regexTerm },
                    { name: regexTerm }
                ]
            }
        ]
    }).select('name phone patientId mrn dob gender city avatar role hospitalId').lean();

    console.log('Result for kushal with new query:', patients);
    await mongoose.disconnect();
}
testSearch();
