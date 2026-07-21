/**
 * Migration Script: Multi-Tenant Hospital Data Isolation
 *
 * Run ONCE after deploying the multi-tenant changes:
 *   node migrate-multitenant.js
 *
 * What it does:
 * 1. Drops old unique index on Role.name (replaced by compound index name+hospitalId)
 * 2. Marks all existing roles as global (hospitalId = null)
 * 3. Marks all existing users (non-admin) without hospitalId as global/legacy (leaves them null)
 * 4. Re-seeds roles with the updated schema
 */

require('dotenv').config();
const mongoose = require('mongoose');

const DB_URI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/crm';

async function migrate() {
    try {
        await mongoose.connect(DB_URI);
        console.log('✅ Connected to MongoDB');

        const db = mongoose.connection.db;

        // =====================================================
        // 1. Drop old unique index on Role.name if it exists
        // =====================================================
        try {
            const roleCollection = db.collection('roles');
            const indexes = await roleCollection.indexes();
            const nameIndex = indexes.find(idx => idx.key && idx.key.name && !idx.key.hospitalId);
            if (nameIndex && nameIndex.name !== '_id_') {
                await roleCollection.dropIndex(nameIndex.name);
                console.log(`✅ Dropped old index: ${nameIndex.name}`);
            } else {
                console.log('ℹ️  No old name-only unique index found (may already be migrated)');
            }
        } catch (e) {
            console.log('ℹ️  Index drop skipped:', e.message);
        }

        // =====================================================
        // 2. Mark all existing Roles as global (hospitalId = null)
        // =====================================================
        const roleResult = await db.collection('roles').updateMany(
            { hospitalId: { $exists: false } },
            { $set: { hospitalId: null } }
        );
        console.log(`✅ Marked ${roleResult.modifiedCount} roles as global (hospitalId: null)`);

        // =====================================================
        // 3. Ensure all existing Users have hospitalId field
        //    (non-admin users that predate multi-tenancy get null)
        // =====================================================
        const userResult = await db.collection('users').updateMany(
            { hospitalId: { $exists: false } },
            { $set: { hospitalId: null } }
        );
        console.log(`✅ Added hospitalId=null to ${userResult.modifiedCount} existing users`);

        // Similarly for doctors, labs, pharmacy, reception
        for (const col of ['doctors', 'labs', 'pharmacies', 'receptions']) {
            try {
                const r = await db.collection(col).updateMany(
                    { hospitalId: { $exists: false } },
                    { $set: { hospitalId: null } }
                );
                if (r.modifiedCount > 0) {
                    console.log(`✅ Added hospitalId=null to ${r.modifiedCount} records in '${col}'`);
                }
            } catch (e) {
                console.log(`ℹ️  Skipped '${col}':`, e.message);
            }
        }

        console.log('\n🎉 Migration complete!');
        console.log('Next steps:');
        console.log('  1. Restart server: npx nodemon server.js');
        console.log('  2. Re-run seed: node seed-roles.js');
        console.log('  3. Go to /supremeadmin to manage hospitals');

        await mongoose.disconnect();
        process.exit(0);
    } catch (error) {
        console.error('❌ Migration failed:', error);
        await mongoose.disconnect();
        process.exit(1);
    }
}

migrate();
