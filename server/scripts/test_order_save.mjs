import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

async function check() {
    await mongoose.connect(process.env.MONGODB_URL);
    const Adm = mongoose.model('Admission', new mongoose.Schema({}, { strict: false }));
    const InpatientOrder = (await import('../src/models/inpatientOrder.model.js')).default;
    const a = await Adm.findById('6aeb1f2fe6591c696cea8947').lean();
    console.log('Admission doc:', {
        _id: a._id,
        patientId: a.patientId,
        doctorId: a.doctorId,
        attendingDoctorId: a.attendingDoctorId,
        primaryDoctorId: a.primaryDoctorId
    });

    try {
        const docId = a.attendingDoctorId || a.doctorId || a.primaryDoctorId || new mongoose.Types.ObjectId('6aaa2147ca3e7fc08c0d22b8');
        const testOrd = new InpatientOrder({
            hospitalId: a.hospitalId,
            admissionId: a._id,
            patientId: a.patientId,
            doctorId: docId,
            medicineName: 'Test Save',
            dosageValue: 500,
            dosageUnit: 'mg',
            route: 'Oral',
            frequency: 'TDS',
            startDate: new Date(),
            status: 'ACTIVE'
        });
        await testOrd.save();
        console.log('Order save successful, ID:', testOrd._id);
        await InpatientOrder.deleteOne({ _id: testOrd._id });
        console.log('Cleaned up test order');
    } catch (err) {
        console.error('Order save error:', err);
    }
    await mongoose.disconnect();
}

check();
