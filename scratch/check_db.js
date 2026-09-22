const mongoose = require('mongoose');

const mongoUri = 'mongodb://teammedical365_db_user:vSDiFkOXnaJPjvZS@ac-bjkun8x-shard-00-00.2k5ctog.mongodb.net:27017,ac-bjkun8x-shard-00-01.2k5ctog.mongodb.net:27017,ac-bjkun8x-shard-00-02.2k5ctog.mongodb.net:27017/?ssl=true&replicaSet=atlas-wyet2k-shard-0&authSource=admin&appName=Cluster0';

async function run() {
  try {
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 10000 });
    console.log('Connected to DB');

    const db = mongoose.connection.db;
    const hospitals = await db.collection('hospitals').find({}).toArray();
    console.log(`Found ${hospitals.length} hospitals:`);
    for (const h of hospitals) {
      console.log(`- ID: ${h._id}, Name: ${h.name}, Plan: ${h.subscriptionPlan}, ClinicType: ${h.clinicType}`);
    }

    const users = await db.collection('users').find({ role: 'hospitaladmin' }).toArray();
    console.log(`\nFound ${users.length} hospitaladmin users:`);
    for (const u of users) {
      console.log(`- ID: ${u._id}, Email: ${u.email}, HospitalId: ${u.hospitalId}, Name: ${u.name}`);
    }

    // Check staff in the hospital
    if (hospitals.length > 0) {
      const hId = hospitals[0]._id;
      const staff = await db.collection('users').find({ hospitalId: hId }).toArray();
      console.log(`\nStaff in hospital ${hId} (${hospitals[0].name}): ${staff.length}`);
      for (const s of staff) {
        console.log(`  * ${s.name} (${s.email}) - role: ${s.role}`);
      }

      const vials = await db.collection('vials').find({ hospitalId: hId }).toArray();
      console.log(`\nVials in hospital ${hId}: ${vials.length}`);
      for (const v of vials.slice(0, 5)) {
        console.log(`  * Vial: ${v.vialNumber || v.barcode || v._id} - type: ${v.vialType} - status: ${v.status}`);
      }
    }

    await mongoose.disconnect();
  } catch (err) {
    console.error('DB error:', err);
  }
}

run();
