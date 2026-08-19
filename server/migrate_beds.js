require('dotenv').config();
const mongoose = require('mongoose');

async function migrateBeds() {
    await mongoose.connect(process.env.MONGODB_URL || 'mongodb://localhost:27017/hms_master');
    console.log('Connected to DB');
    
    const db = mongoose.connection.db;
    const beds = await db.collection('beds').find({}).toArray();
    console.log('Beds in master:', beds.length);
    
    for (let bed of beds) {
        const tenantDbName = `hms_hospital_${bed.hospitalId.toString()}`;
        const tenantDb = mongoose.connection.useDb(tenantDbName);
        
        // Insert into tenant db
        const existing = await tenantDb.collection('beds').findOne({ _id: bed._id });
        if (!existing) {
            await tenantDb.collection('beds').insertOne(bed);
            console.log(`Migrated bed ${bed.bedNumber} to ${tenantDbName}`);
        }
        
        // Remove from master db
        await db.collection('beds').deleteOne({ _id: bed._id });
        console.log(`Deleted bed ${bed.bedNumber} from master`);
    }

    console.log("Migration complete");
    process.exit(0);
}

migrateBeds();
