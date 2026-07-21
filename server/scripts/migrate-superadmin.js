require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./src/models/user.model');
const Role = require('./src/models/role.model');

async function migrate() {
    try {
        await mongoose.connect(process.env.MONGODB_URL);
        console.log('Connected to MongoDB');

        // Update User roles where string is 'administrator'
        const userUpdateResult = await User.updateMany(
            { role: 'administrator' },
            { $set: { role: 'superadmin' } }
        );
        console.log(`Updated ${userUpdateResult.modifiedCount} users with hardcoded administrator role -> superadmin`);

        // Because we might have a Role document with name 'Administrator', let's rename it to 'Super Admin'
        const roleUpdateResult = await Role.updateMany(
            { name: { $in: ['administrator', 'Administrator'] } },
            { $set: { name: 'Super Admin', systemName: 'superadmin' } }
        );
        console.log(`Updated ${roleUpdateResult.modifiedCount} role documents to Super Admin`);

    } catch (err) {
        console.error('Migration error:', err);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB');
    }
}

migrate();
