const mongoose = require('mongoose');
const User = require('../src/models/user.model');
const Doctor = require('../src/models/doctor.model');
const Hospital = require('../src/models/hospital.model');
const QuestionLibrary = require('../src/models/questionLibrary.model');
const { MASTER_DEFAULT_QUESTION_LIBRARY, resolveDepartmentQuestions } = require('../src/config/masterQuestionLibrary');
require('dotenv').config({ path: './.env' });

async function testQLibOutput() {
    await mongoose.connect(process.env.MONGODB_URL);
    const user = await User.findOne({ email: 'ydeepesh0369@gmail.com' }).lean();

    const hospitalId = user.hospitalId || null;

    let hospitalDoctors = [];
    if (hospitalId) {
        hospitalDoctors = await Doctor.find({ hospitalId, status: { $ne: 'Inactive' } })
            .select('name specialty departments userId hospitalId doctorId image availability')
            .lean();
    }

    console.log('Result Doctors:', hospitalDoctors.map(d => ({ name: d.name, specialty: d.specialty })));
    console.log('Result All Departments Count:', Object.keys(MASTER_DEFAULT_QUESTION_LIBRARY).length);
    console.log('All Departments List:', Object.keys(MASTER_DEFAULT_QUESTION_LIBRARY));

    await mongoose.disconnect();
}

testQLibOutput().catch(console.error);
