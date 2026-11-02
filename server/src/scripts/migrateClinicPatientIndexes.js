/**
 * migrateClinicPatientIndexes.js
 * 
 * Safely migrates compound unique indexes on the `clinicpatients` collection:
 * - Drops legacy sparse compound indexes: `clinicId_1_email_1` and `clinicId_1_aadhaarNumber_1`.
 *   (In MongoDB, compound indexes with { sparse: true } do not skip docs unless ALL keys are missing.
 *    Because clinicId is always present, docs without email/aadhaar collided on { clinicId, email: null }).
 * - Cleans up existing documents with null or empty string email/aadhaar (unsets them safely).
 * - Creates production partial unique indexes that strictly enforce uniqueness ONLY when email/aadhaar is a non-empty string.
 * - Leaves all patient records and other indexes completely untouched.
 */

const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

async function migrateIndexes() {
    try {
        const mongoUri = process.env.MONGODB_URL || process.env.MONGODB_URI || process.env.MONGO_URI;
        if (!mongoUri) {
            console.error('❌ MONGODB_URL / MONGO_URI missing in .env file!');
            process.exit(1);
        }

        console.log('🔌 Connecting to MongoDB...');
        await mongoose.connect(mongoUri);
        console.log('✅ Connected to MongoDB');

        const masterDb = mongoose.connection.db;

        // Discover master database + any tenant databases
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

        console.log(`🔍 Discovered ${dbList.length} database(s) to inspect for clinicpatients.`);

        for (const dbName of dbList) {
            const db = mongoose.connection.useDb(dbName);
            const collExists = (await db.db.listCollections({ name: 'clinicpatients' }).toArray()).length > 0;
            if (!collExists) {
                console.log(`⏩ Database ${dbName}: 'clinicpatients' collection not found, skipping.`);
                continue;
            }

            console.log(`\n📂 Migrating indexes in database: ${dbName}.clinicpatients`);
            const coll = db.db.collection('clinicpatients');
            const currentIndexes = await coll.indexes();
            console.log(`   Found ${currentIndexes.length} existing indexes:`, currentIndexes.map(i => i.name));

            // 1. Drop legacy sparse compound indexes if present
            for (const idx of currentIndexes) {
                if (idx.name === 'clinicId_1_email_1') {
                    const hasProperPartial = idx.partialFilterExpression && idx.partialFilterExpression.email;
                    if (!hasProperPartial || idx.sparse) {
                        console.log(`   🗑️ Dropping legacy index: ${idx.name} (sparse: ${idx.sparse})`);
                        await coll.dropIndex(idx.name);
                        console.log(`   ✅ Dropped legacy index ${idx.name}`);
                    }
                }
                if (idx.name === 'clinicId_1_aadhaarNumber_1') {
                    const hasProperPartial = idx.partialFilterExpression && idx.partialFilterExpression.aadhaarNumber;
                    if (!hasProperPartial || idx.sparse) {
                        console.log(`   🗑️ Dropping legacy index: ${idx.name} (sparse: ${idx.sparse})`);
                        await coll.dropIndex(idx.name);
                        console.log(`   ✅ Dropped legacy index ${idx.name}`);
                    }
                }
            }

            // 2. Clean existing documents: unset null or empty strings
            const emailCleanResult = await coll.updateMany(
                { email: { $in: [null, ''] } },
                { $unset: { email: 1 } }
            );
            if (emailCleanResult.modifiedCount > 0) {
                console.log(`   🧹 Cleaned ${emailCleanResult.modifiedCount} document(s) with null/empty email`);
            }

            const aadhaarCleanResult = await coll.updateMany(
                { aadhaarNumber: { $in: [null, ''] } },
                { $unset: { aadhaarNumber: 1 } }
            );
            if (aadhaarCleanResult.modifiedCount > 0) {
                console.log(`   🧹 Cleaned ${aadhaarCleanResult.modifiedCount} document(s) with null/empty aadhaarNumber`);
            }

            // 3. Create the partial unique compound indexes
            console.log('   🔨 Creating partial unique index clinicId_1_email_1...');
            await coll.createIndex(
                { clinicId: 1, email: 1 },
                {
                    unique: true,
                    partialFilterExpression: { email: { $type: 'string', $gt: '' } },
                    background: true,
                    name: 'clinicId_1_email_1'
                }
            );
            console.log('   ✅ Created partial unique index clinicId_1_email_1');

            console.log('   🔨 Creating partial unique index clinicId_1_aadhaarNumber_1...');
            await coll.createIndex(
                { clinicId: 1, aadhaarNumber: 1 },
                {
                    unique: true,
                    partialFilterExpression: { aadhaarNumber: { $type: 'string', $gt: '' } },
                    background: true,
                    name: 'clinicId_1_aadhaarNumber_1'
                }
            );
            console.log('   ✅ Created partial unique index clinicId_1_aadhaarNumber_1');

            // 4. Verification
            const updatedIndexes = await coll.indexes();
            console.log(`   ✨ Updated indexes on ${dbName}.clinicpatients:`);
            for (const idx of updatedIndexes) {
                console.log(`      - ${idx.name}: unique=${!!idx.unique}, partial=${JSON.stringify(idx.partialFilterExpression || null)}`);
            }
        }

        console.log('\n🎉 Index migration completed safely and successfully!');
    } catch (error) {
        console.error('❌ Migration error:', error);
        process.exit(1);
    } finally {
        await mongoose.disconnect();
    }
}

migrateIndexes();

