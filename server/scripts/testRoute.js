const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const User = require('../src/models/user.model');
const Doctor = require('../src/models/doctor.model');
const Hospital = require('../src/models/hospital.model');
const QuestionLibrary = require('../src/models/questionLibrary.model');
require('dotenv').config({ path: './.env' });

async function run() {
    await mongoose.connect(process.env.MONGODB_URL);
    const user = await User.findOne({ email: 'ydeepesh0369@gmail.com' }).lean();

    // Replicate getAssistantContext logic
    const userId = user._id;
    const hospitalId = user.hospitalId;

    // Simulate getAssistantContext:
    const userDoc = await User.findById(userId).populate({
        path: 'assignedDoctors',
        match: hospitalId ? { hospitalId, status: { $ne: 'Inactive' } } : { status: { $ne: 'Inactive' } }
    }).lean();

    console.log('userDoc:', {
        assignedDoctors: userDoc.assignedDoctors,
        departments: userDoc.departments,
        role: userDoc.role
    });

    let assignedDocs = userDoc?.assignedDoctors || [];
    if (assignedDocs.length === 0) {
        const docQuery = hospitalId ? { hospitalId, status: { $ne: 'Inactive' } } : { status: { $ne: 'Inactive' } };
        assignedDocs = await Doctor.find(docQuery)
            .select('name specialty departments userId hospitalId doctorId image availability')
            .lean();
    }

    console.log('assignedDocs after check:', assignedDocs);

    // Let's check what QuestionLibrary was returned
    let library = null;
    if (hospitalId) {
        library = await QuestionLibrary.findOne({ hospitalId }).sort({ version: -1 });
    }
    console.log('library found for hospitalId:', library ? { id: library._id, keys: Object.keys(library.data || {}) } : null);

    await mongoose.disconnect();
}

run().catch(console.error);
