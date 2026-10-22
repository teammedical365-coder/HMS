/**
 * migrate-package-id-index.js
 * 
 * Medical365 Multi-Tenant Database Hardening:
 * Migration script to audit and apply a MongoDB Partial Unique Index on `appConfig.androidPackageId`.
 * 
 * DEPLOYMENT & EXECUTION ORDER:
 * 1. Read-Only Audit (Default Dry-Run Mode):
 *    Run without flags to inspect existing hospital records:
 *      node scripts/migrate-package-id-index.js
 * 
 * 2. Data Resolution:
 *    If duplicate non-empty package IDs are reported, resolve them administratively.
 * 
 * 3. Index Application (Requires Explicit Flag):
 *    Only when dry-run passes with 0 duplicates, apply the index:
 *      node scripts/migrate-package-id-index.js --apply
 * 
 * SAFETY GUARDS:
 * - Defaults to DRY-RUN (read-only audit). Does NOT modify database or create indexes without --apply.
 * - Enforces partialFilterExpression: { 'appConfig.androidPackageId': { $type: 'string', $gt: '' } }.
 * - Empty string defaults ('') and nulls are completely excluded from uniqueness constraint.
 * - Refuses to apply index if any duplicate non-empty package ID exists.
 */

require('dotenv').config();
const mongoose = require('mongoose');

const INDEX_SPEC = { 'appConfig.androidPackageId': 1 };
const INDEX_OPTIONS = {
    unique: true,
    partialFilterExpression: {
        'appConfig.androidPackageId': { $type: 'string', $gt: '' }
    },
    name: 'unique_android_package_id_non_empty',
    background: true
};

async function auditAndMigrate() {
    const isApplyMode = process.argv.includes('--apply');
    const mongoUrl = process.env.MONGODB_URL || process.env.MONGODB_URI || process.env.MONGO_URI;

    console.log('================================================================');
    console.log(`🔍 MEDICAL365 — PACKAGE ID PARTIAL UNIQUE INDEX MIGRATION`);
    console.log(`Mode: ${isApplyMode ? '🚀 APPLY (Will create index if safe)' : '🛡️  DRY-RUN / AUDIT ONLY (No changes will be made)'}`);
    console.log('================================================================\n');

    if (!mongoUrl) {
        console.error('❌ MONGODB_URL / MONGODB_URI is not set in environment or .env.');
        console.error('   Aborting to prevent unintended database actions.');
        process.exit(1);
    }

    try {
        console.log('🔌 Connecting to MongoDB...');
        await mongoose.connect(mongoUrl);
        console.log('✅ Connected successfully.\n');

        const db = mongoose.connection.db;
        const hospitalCollection = db.collection('hospitals');

        // 1. Audit all hospital records
        console.log('📊 Step 1: Auditing existing hospital records...');
        const totalHospitals = await hospitalCollection.countDocuments();
        const emptyCount = await hospitalCollection.countDocuments({
            $or: [
                { 'appConfig.androidPackageId': { $exists: false } },
                { 'appConfig.androidPackageId': null },
                { 'appConfig.androidPackageId': '' }
            ]
        });
        const populatedCount = totalHospitals - emptyCount;

        console.log(`   Total hospitals: ${totalHospitals}`);
        console.log(`   Unconfigured / default empty package IDs: ${emptyCount}`);
        console.log(`   Populated package IDs: ${populatedCount}\n`);

        // 2. Scan for duplicates among non-empty package IDs
        console.log('🔎 Step 2: Scanning for duplicate non-empty package IDs...');
        const duplicates = await hospitalCollection.aggregate([
            {
                $match: {
                    'appConfig.androidPackageId': { $type: 'string', $gt: '' }
                }
            },
            {
                $group: {
                    _id: '$appConfig.androidPackageId',
                    count: { $sum: 1 },
                    hospitalIds: { $push: '$_id' },
                    names: { $push: '$name' }
                }
            },
            {
                $match: {
                    count: { $gt: 1 }
                }
            }
        ]).toArray();

        // 3. Scan for malformed package IDs
        console.log('🔎 Step 3: Checking package ID format compliance (^com\\.medical365\\.[a-z][a-z0-9_]*$)...');
        const populatedHospitals = await hospitalCollection.find(
            { 'appConfig.androidPackageId': { $type: 'string', $gt: '' } },
            { projection: { _id: 1, name: 1, 'appConfig.androidPackageId': 1 } }
        ).toArray();

        const malformed = populatedHospitals.filter(h => {
            const pkg = h.appConfig?.androidPackageId;
            return !/^com\.medical365\.[a-z][a-z0-9_]*$/.test(pkg);
        });

        // 4. Report Audit Results
        console.log('\n────────────────────────────────────────────────────────────────');
        console.log('📋 AUDIT REPORT:');
        console.log(`   Duplicate non-empty package IDs found: ${duplicates.length}`);
        console.log(`   Malformed package IDs found: ${malformed.length}`);

        if (duplicates.length > 0) {
            console.error('\n❌ CONFLICTS DETECTED: The following package IDs are shared by multiple hospitals:');
            duplicates.forEach(d => {
                console.error(`   - Package ID "${d._id}" (${d.count} occurrences):`);
                d.names.forEach((name, i) => console.error(`       • ${name} [ID: ${d.hospitalIds[i]}]`));
            });
        }

        if (malformed.length > 0) {
            console.warn('\n⚠️  FORMAT WARNINGS: The following package IDs do not match the canonical format:');
            malformed.forEach(m => {
                console.warn(`   - ${m.name} [ID: ${m._id}]: "${m.appConfig?.androidPackageId}"`);
            });
        }

        // 5. Index Status Check
        const existingIndexes = await hospitalCollection.indexes();
        const currentIndex = existingIndexes.find(idx => idx.name === INDEX_OPTIONS.name);

        if (currentIndex) {
            console.log(`\nℹ️  Index "${INDEX_OPTIONS.name}" already exists on the collection.`);
        } else {
            console.log(`\nℹ️  Index "${INDEX_OPTIONS.name}" does NOT currently exist.`);
        }

        // 6. Action Execution
        if (!isApplyMode) {
            console.log('\n🛡️  DRY-RUN COMPLETED: No changes were applied.');
            if (duplicates.length === 0) {
                console.log('   ✅ All checks passed! Ready for application: run with --apply to create index.');
            } else {
                console.error('   ❌ Refusing index creation: resolve duplicates before running with --apply.');
            }
        } else {
            if (duplicates.length > 0) {
                console.error('\n🚫 ABORTING INDEX CREATION: Cannot apply unique index while duplicate package IDs exist.');
                process.exit(1);
            }

            if (currentIndex) {
                console.log('\n✅ Index already applied and active. No action needed.');
            } else {
                console.log('\n🚀 Creating Partial Unique Index on appConfig.androidPackageId...');
                await hospitalCollection.createIndex(INDEX_SPEC, INDEX_OPTIONS);
                console.log(`✅ Index "${INDEX_OPTIONS.name}" successfully created!`);
            }
        }

    } catch (err) {
        console.error('\n❌ Migration script error:', err.message);
        process.exit(1);
    } finally {
        await mongoose.disconnect();
        console.log('\n🔌 Disconnected from MongoDB.');
        console.log('================================================================');
    }
}

// Only execute when invoked directly from CLI
if (require.main === module) {
    auditAndMigrate();
}

module.exports = { auditAndMigrate, INDEX_SPEC, INDEX_OPTIONS };
