const mongoose = require('mongoose');
require('dotenv').config({ path: 'server/.env' });
require('../src/models/aiWallet.model');
const Hospital = require('../src/models/hospital.model');
const LabLocation = require('../src/models/labLocation.model');
const User = require('../src/models/user.model');

async function main() {
  await mongoose.connect(process.env.MONGODB_URL);
  console.log('Connected to MongoDB.');

  const hosps = await Hospital.find({}).select('_id name slug hospitalCode isActive').lean();
  console.log('Hospitals found in DB:');
  hosps.forEach(h => console.log(' ->', h.name, '| slug:', h.slug, '| code:', h.hospitalCode, '| id:', h._id));

  const pacific = await Hospital.findOne({ $or: [{ slug: 'pacifichospital' }, { name: /pacific/i }] }).lean();
  if (pacific) {
    console.log('\nPacific Hospital details:', pacific);
    const locs = await LabLocation.find({ hospitalId: pacific._id }).lean();
    console.log('Pacific Lab locations count:', locs.length);
    locs.forEach(l => console.log('  Loc:', l.locationName, '| code:', l.locationCode, '| isProcessingLab:', l.isProcessingLab, '| isActive:', l.isActive));
    const users = await User.find({ hospitalId: pacific._id }).select('name email role _roleData').lean();
    console.log('Pacific Users count:', users.length);
    users.forEach(u => console.log('  User:', u.name, '| email:', u.email, '| role:', u.role, '| roleData:', u._roleData?.name));
  } else {
    console.log('\nPacific hospital not found by exact slug/name');
  }

  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
