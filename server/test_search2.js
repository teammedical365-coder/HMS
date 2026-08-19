require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./src/models/user.model');
const Hospital = require('./src/models/hospital.model');

mongoose.connect(process.env.MONGODB_URL, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(async () => {
    console.log("Connected to DB");
    
    const h = await Hospital.find().limit(3);
    console.log("Sample Hospitals:", h.map(x => x.name));

    const q = h[0]?.name || "test";
    const searchRegex = new RegExp(q, 'i');
    const hospitals = await Hospital.find({ name: searchRegex }).limit(5);
    console.log(`Search for '${q}' found ${hospitals.length} hospitals`);

    const admin = await User.findOne({ role: 'centraladmin' });
    console.log("Central admin user:", admin?.email, "Role:", admin?.role);

    mongoose.connection.close();
  });
