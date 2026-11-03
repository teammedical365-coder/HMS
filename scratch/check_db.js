require('dotenv').config({ path: 'server/.env' });
const mongoose = require('mongoose');

async function check() {
  await mongoose.connect(process.env.MONGODB_URL);
  const Hospital = mongoose.model('Hospital', new mongoose.Schema({}, { strict: false }));
  const hospitals = await Hospital.find({ $or: [{ name: /getwell/i }, { email: 'manish@test.com' }] }).sort({ createdAt: -1 }).limit(5);
  console.log('Hospitals found:', JSON.stringify(hospitals.map(h => ({
    id: h._id,
    name: h.name,
    slug: h.slug,
    email: h.email,
    subscriptionPlan: h.subscriptionPlan,
    createdAt: h.createdAt
  })), null, 2));
  await mongoose.disconnect();
}
check().catch(console.error);
