const mongoose = require('mongoose');
const User = require('./src/models/user.model');
const Doctor = require('./src/models/doctor.model');
const Hospital = require('./src/models/hospital.model');

mongoose.connect('mongodb://127.0.0.1:27017/medical365', { useNewUrlParser: true, useUnifiedTopology: true })
  .then(async () => {
    console.log("Connected to DB");
    const q = "sup"; // Like "supreme" or something
    const searchRegex = new RegExp(q, 'i');
    
    const hospitals = await Hospital.find({ name: searchRegex }).limit(5);
    console.log("Hospitals:", hospitals.length);

    const users = await User.find({ $or: [ { name: searchRegex }, { role: searchRegex } ] }).limit(5);
    console.log("Users:", users.length, users.map(u => u.name + " (" + u.role + ")"));

    const patients = await User.find({ role: 'patient', name: searchRegex }).limit(5);
    console.log("Patients:", patients.length);
    
    mongoose.connection.close();
  });
