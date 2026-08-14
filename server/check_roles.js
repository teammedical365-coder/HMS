require('dotenv').config();
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGODB_URI).then(async () => {
    try {
        const db = mongoose.connection.db;
        const users = await db.collection('users').find({ 'role': { $regex: 'doctor', $options: 'i' } }).toArray();
        console.log('Doctors found:', users.length);
        if(users.length > 0) {
            console.log('Sample doctor role:', users[0].role, 'hospitalId:', users[0].hospitalId);
            const roleStr = users[0].role;
            const hospitalId = users[0].hospitalId;
            
            const roleByName = await db.collection('roles').findOne({ name: { $regex: roleStr, $options: 'i' }, hospitalId: hospitalId });
            console.log('Role found by Name+Hospital:', !!roleByName);
            
            const allRoles = await db.collection('roles').find({ hospitalId: hospitalId }).toArray();
            console.log('All roles for this hospital:', allRoles.map(r => r.name));
            
            if (!roleByName) {
                console.log('Wait, let us see if we can find ANY role named Doctor:');
                const anyDoctorRole = await db.collection('roles').findOne({ name: { $regex: 'doctor', $options: 'i' }});
                if (anyDoctorRole) {
                    console.log('Found some doctor role:', anyDoctorRole.name, 'with hospitalId:', anyDoctorRole.hospitalId);
                } else {
                    console.log('No doctor role found at all in DB!');
                }
            }
        }
    } finally {
        mongoose.disconnect();
    }
});
