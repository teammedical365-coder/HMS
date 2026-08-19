require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./src/models/user.model');

mongoose.connect(process.env.MONGODB_URL, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(async () => {
    console.log("Connected to DB");
    
    // Test Hospital Admin
    const hAdmin = await User.findOne({ role: 'hospitaladmin' }).select('name email role hospitalId');
    console.log("Hospital Admin:", hAdmin);

    const filterWithUndefined = { hospitalId: undefined, role: 'patient' };
    const patientsWithUndefined = await User.find(filterWithUndefined).limit(2);
    console.log("Patients with undefined filter count:", patientsWithUndefined.length);

    const filterWithNull = { hospitalId: null, role: 'patient' };
    const patientsWithNull = await User.find(filterWithNull).limit(2);
    console.log("Patients with null filter count:", patientsWithNull.length);

    mongoose.connection.close();
  });
