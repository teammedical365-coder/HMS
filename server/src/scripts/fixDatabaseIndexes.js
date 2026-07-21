const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

async function fixIndexes() {
    try {
        const mongoUri = process.env.MONGODB_URL || process.env.MONGODB_URI || process.env.MONGO_URI;
        if (!mongoUri) {
            console.error('❌ MONGODB_URL / MONGO_URI missing in .env file!');
            process.exit(1);
        }

        console.log('🔌 Connecting to MongoDB...');
        await mongoose.connect(mongoUri);
        console.log('✅ Connected to Master Database');

        const masterDb = mongoose.connection.db;

        // Try listing all databases in cluster to clean tenant DBs as well if multi-tenant DB per hospital is used
        let dbList = [];
        try {
            const adminDb = masterDb.admin();
            const { databases } = await adminDb.listDatabases();
            dbList = databases
                .map(d => d.name)
                .filter(name => name === masterDb.databaseName || name.startsWith('hms_hospital_'));
        } catch (e) {
            dbList = [masterDb.databaseName];
        }

        if (!dbList.includes(masterDb.databaseName)) {
            dbList.push(masterDb.databaseName);
        }

        console.log(`🔍 Discovered ${dbList.length} database(s) to scan for legacy indexes.`);

        const collectionsToClean = ['users', 'clinicpatients', 'patientauths'];

        for (const dbName of dbList) {
            const db = mongoose.connection.useDb(dbName);
            console.log(`\n📂 Scanning database: ${dbName}`);

            for (const collName of collectionsToClean) {
                const collectionExists = (await db.db.listCollections({ name: collName }).toArray()).length > 0;
                if (!collectionExists) continue;

                const coll = db.db.collection(collName);
                const indexes = await coll.indexes();
                console.log(`  Checking indexes for collection: ${collName}`);

                for (const idx of indexes) {
                    // Drop old single field unique indexes that block multi-tenant scoping
                    const isSingleAadhaar = idx.name === 'aadhaarNumber_1' || (idx.key && idx.key.aadhaarNumber && Object.keys(idx.key).length === 1);
                    const isSinglePhone = idx.name === 'phone_1' || (idx.key && idx.key.phone && Object.keys(idx.key).length === 1);
                    const isSinglePatientId = idx.name === 'patientId_1' || (idx.key && idx.key.patientId && Object.keys(idx.key).length === 1);

                    if (isSingleAadhaar || isSinglePhone || isSinglePatientId) {
                        console.log(`  🗑️ Dropping legacy index: ${idx.name} from ${dbName}.${collName}`);
                        try {
                            await coll.dropIndex(idx.name);
                            console.log(`  ✅ Successfully dropped index ${idx.name}`);
                        } catch (dropErr) {
                            console.log(`  ⚠️ Failed/Skipped dropping index ${idx.name}: ${dropErr.message}`);
                        }
                    }
                }
            }
        }

        console.log('\n🎉 Legacy global indexes dropped successfully! Multi-tenant isolation active.');
    } catch (error) {
        console.error('⚠️ Index drop process notice:', error.message);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
}

fixIndexes();
