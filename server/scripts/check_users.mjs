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
    const hospital = await mongoose.connection.collection('hospitals').findOne({ _id: hospitalId });
    console.log('Hospital:', hospital ? { id: hospital._id, name: hospital.name, nabhCertified: hospital.nabhCertified, nabhNumber: hospital.nabhNumber } : 'Not found');

    const users = await mongoose.connection.collection('users').find({ hospitalId }).toArray();
    console.log('Users for Pacific Hospital:', users.map(u => ({ id: u._id, name: u.name, email: u.email, role: u.role })));

    const tConn = mongoose.connection.useDb('hms_hospital_6aaa0637ca3e7fc08c0d1f57');
    const patient = await tConn.collection('patients').findOne({ _id: new mongoose.Types.ObjectId('6ab4d76f0f0d58ed3597f346') });
    console.log('Patient in tenant DB:', patient ? { id: patient._id, name: patient.name, uhid: patient.uhid, gender: patient.gender, age: patient.age } : 'Not found');

    await mongoose.disconnect();
}
run().catch(console.error);
