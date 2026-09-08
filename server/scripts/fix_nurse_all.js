const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URL = process.env.MONGODB_URL;

async function run() {
    await mongoose.connect(MONGODB_URL);
    console.log('Connected to:', mongoose.connection.name);

    // Update Roles
    const roles = await mongoose.connection.collection('roles').find({ name: /nurse/i }).toArray();
    console.log('Found nurse roles in default db:', roles.length);
    for (let r of roles) {
        await mongoose.connection.collection('roles').updateOne(
            { _id: r._id },
            {
                $set: {
                    dashboardPath: '/nurse/dashboard',
                    navLinks: [
                        { label: 'Nurse Command Center', path: '/nurse/dashboard' },
                        { label: 'OPD Patient Queue', path: '/doctor/patients' },
                        { label: 'Appointments', path: '/appointment' }
                    ]
                }
            }
        );
        console.log(`Updated role ${r.name} to /nurse/dashboard`);
    }

    // Update Users
    const users = await mongoose.connection.collection('users').find({
        $or: [
            { role: /nurse/i },
            { role: 'nurse' },
            { role: 'staffnurse' },
            { role: 'headnurse' }
        ]
    }).toArray();
    console.log('Found nurse users in default db:', users.length);
    for (let u of users) {
        await mongoose.connection.collection('users').updateOne(
            { _id: u._id },
            {
                $set: {
                    dashboardPath: '/nurse/dashboard'
                }
            }
        );
        console.log(`Updated user ${u.name || u.email} to /nurse/dashboard`);
    }

    // Also check all other collections in all other databases if possible
    const hospitals = await mongoose.connection.collection('hospitals').find({}).toArray();
    console.log('Found hospitals in default db:', hospitals.length);

    for (let h of hospitals) {
        const dbName = `hms_hospital_${String(h._id).replace(/[^a-zA-Z0-9_-]/g, '_')}`;
        console.log(`Checking tenant db ${dbName}...`);
        const tDb = mongoose.connection.useDb(dbName);
        
        const tRoles = await tDb.collection('roles').find({ name: /nurse/i }).toArray();
        for (let r of tRoles) {
            await tDb.collection('roles').updateOne(
                { _id: r._id },
                {
                    $set: {
                        dashboardPath: '/nurse/dashboard',
                        navLinks: [
                            { label: 'Nurse Command Center', path: '/nurse/dashboard' },
                            { label: 'OPD Patient Queue', path: '/doctor/patients' },
                            { label: 'Appointments', path: '/appointment' }
                        ]
                    }
                }
            );
            console.log(`[${dbName}] Updated role ${r.name}`);
        }

        const tUsers = await tDb.collection('users').find({
            $or: [
                { role: /nurse/i },
                { role: 'nurse' },
                { role: 'staffnurse' },
                { role: 'headnurse' }
            ]
        }).toArray();
        for (let u of tUsers) {
            await tDb.collection('users').updateOne(
                { _id: u._id },
                { $set: { dashboardPath: '/nurse/dashboard' } }
            );
            console.log(`[${dbName}] Updated user ${u.name || u.email}`);
        }
    }

    console.log('Done!');
    process.exit(0);
}

run().catch(console.error);
