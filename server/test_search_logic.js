require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./src/models/user.model');
const Appointment = require('./src/models/appointment.model');

mongoose.connect(process.env.MONGODB_URL, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(async () => {
    console.log("Connected to DB");
    
    const hAdmin = await User.findOne({ role: 'hospitaladmin' }).populate('hospitalId');
    if (!hAdmin) return console.log("No hospital admin found");
    
    console.log(`Testing search for Hospital Admin: ${hAdmin.email}, Hospital: ${hAdmin.hospitalId.name}`);
    
    // Simulate search logic
    const role = 'hospitaladmin';
    const hospitalId = hAdmin.hospitalId._id;
    const isCentralRole = false;
    const isHospitalAdmin = true;
    
    const hospitalFilter = isCentralRole ? {} : { hospitalId: hospitalId };
    
    // Search patients
    const patientSearchQuery = {
        ...hospitalFilter,
        role: 'patient',
        $or: [ { name: /man/i }, { email: /man/i } ]
    };
    
    const patients = await User.find(patientSearchQuery).limit(5);
    console.log(`Found ${patients.length} patients for hospital ${hospitalId}`);

    // If central admin searches
    const centralPatientSearchQuery = {
        role: 'patient',
        $or: [ { name: /man/i }, { email: /man/i } ]
    };
    const centralPatients = await User.find(centralPatientSearchQuery).limit(5);
    console.log(`Central Admin found ${centralPatients.length} patients`);

    mongoose.connection.close();
  });
