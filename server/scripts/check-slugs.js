const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config({ path: './.env' });

const Hospital = require('./src/models/hospital.model');

mongoose.connect(process.env.MONGODB_URL, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(async () => {
    const hospitals = await Hospital.find({});
    hospitals.forEach(h => console.log(`Name: ${h.name}, Slug: ${h.slug}, Active: ${h.isActive}`));
    process.exit(0);
}).catch(err => {
    console.error(err);
    process.exit(1);
});
