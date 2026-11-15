import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config({ path: 'd:/Medical365 Project/HMS/server/.env' });

async function run() {
    await mongoose.connect(process.env.MONGODB_URL);
    const residentRole = await mongoose.connection.collection('roles').findOne({ name: { $regex: /resident/i } });
    console.log('Resident Role:', JSON.stringify(residentRole, null, 2));

    const users = await mongoose.connection.collection('users').find({
        $or: [
            { role: residentRole ? residentRole._id : null },
            { role: { $regex: /resident/i } }
        ]
    }).toArray();
    console.log('Users with resident role:', users.map(u => ({ id: u._id, name: u.name, email: u.email, role: u.role, hospitalId: u.hospitalId })));

    await mongoose.disconnect();
}
run().catch(console.error);
