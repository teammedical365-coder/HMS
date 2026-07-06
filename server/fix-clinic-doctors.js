require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./src/models/user.model');
const Hospital = require('./src/models/hospital.model');
const Role = require('./src/models/role.model');

const DB_URI = process.env.MONGODB_URL || process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/crm';

async function migrate() {
    try {
        await mongoose.connect(DB_URI);
        console.log('✅ Connected to MongoDB');

        // Find the global "Clinic Doctor" role
        const clinicDoctorRole = await Role.findOne({ name: 'Clinic Doctor', hospitalId: null });
        if (!clinicDoctorRole) {
            console.error('❌ "Clinic Doctor" role not found in database. Make sure seed-roles.js was executed successfully.');
            await mongoose.disconnect();
            process.exit(1);
        }
        console.log(`ℹ️ Found Clinic Doctor role ID: ${clinicDoctorRole._id}`);

        // Find the global "Doctor" role for comparison
        const legacyDoctorRole = await Role.findOne({ name: 'Doctor', hospitalId: null });
        const legacyDoctorIdStr = legacyDoctorRole ? String(legacyDoctorRole._id) : null;
        console.log(`ℹ️ Legacy Doctor role ID: ${legacyDoctorIdStr}`);

        // Find all simple clinics
        const clinics = await Hospital.find({ clinicType: 'clinic' }).select('_id name');
        const clinicIds = clinics.map(c => c._id);
        console.log(`ℹ️ Found ${clinics.length} simple clinic(s): ${clinics.map(c => c.name).join(', ')}`);

        if (clinicIds.length === 0) {
            console.log('ℹ️ No clinics found. Nothing to migrate.');
            await mongoose.disconnect();
            process.exit(0);
        }

        // Find clinic doctor users to migrate
        // They are users belonging to one of the clinic IDs and have role === 'doctor' or legacy Doctor role ID
        const query = {
            hospitalId: { $in: clinicIds },
            $or: [
                { role: 'doctor' },
                { role: 'Doctor' }
            ]
        };
        if (legacyDoctorRole) {
            query.$or.push({ role: legacyDoctorRole._id });
        }

        const usersToMigrate = await User.find(query);
        console.log(`ℹ️ Found ${usersToMigrate.length} clinic doctor(s) to migrate.`);

        let updatedCount = 0;
        for (const user of usersToMigrate) {
            const oldRole = user.role;
            user.role = clinicDoctorRole._id;
            await user.save();
            console.log(`⚡ Migrated user: ${user.name} (${user.email}) | Old role: ${oldRole} -> New role: ${clinicDoctorRole.name} (${clinicDoctorRole._id})`);
            updatedCount++;
        }

        console.log(`\n🎉 Migration complete! Successfully updated ${updatedCount} clinic doctor(s).`);
        await mongoose.disconnect();
        process.exit(0);
    } catch (err) {
        console.error('❌ Migration failed:', err);
        await mongoose.disconnect();
        process.exit(1);
    }
}

migrate();
