import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

async function run() {
    await mongoose.connect(process.env.MONGODB_URL);
    const hospitalId = new mongoose.Types.ObjectId('6aaa0637ca3e7fc08c0d1f57');
    const residentRole = await mongoose.connection.collection('roles').findOne({ name: { $regex: /resident/i } });
    console.log('Resident Role ID:', residentRole?._id);

    let resUser = await mongoose.connection.collection('users').findOne({
        hospitalId,
        $or: [
            { role: residentRole?._id },
            { email: 'resident.pacific@medical365.com' }
        ]
    });

    if (!resUser) {
        const insertRes = await mongoose.connection.collection('users').insertOne({
            name: 'Dr. Ananya Sharma (Resident)',
            email: 'resident.pacific@medical365.com',
            role: residentRole._id,
            hospitalId,
            status: 'active',
            createdAt: new Date(),
            updatedAt: new Date()
        });
        console.log('Created resident doctor user ID:', insertRes.insertedId);
        resUser = { _id: insertRes.insertedId };
    } else {
        console.log('Found existing resident user ID:', resUser._id);
    }

    await mongoose.disconnect();
}

run().catch(console.error);

