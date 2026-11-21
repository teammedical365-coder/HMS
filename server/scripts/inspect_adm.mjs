import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

await mongoose.connect(process.env.MONGODB_URL);
const Admission = mongoose.model('Admission', new mongoose.Schema({}, { strict: false }));
const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }));
const Appointment = mongoose.model('Appointment', new mongoose.Schema({}, { strict: false }));

const admissions = await Admission.find().sort({ createdAt: -1 }).limit(3).lean();
for (const adm of admissions) {
    console.log('--- Admission ---');
    console.log(JSON.stringify({
        _id: adm._id,
        patientId: adm.patientId,
        doctorId: adm.doctorId,
        admittedBy: adm.admittedBy,
        appointmentId: adm.appointmentId,
        consultant: adm.consultant,
        doctorName: adm.doctorName,
        ward: adm.ward,
        bedNumber: adm.bedNumber,
        ipdNumber: adm.ipdNumber,
        admissionNumber: adm.admissionNumber
    }, null, 2));

    if (adm.doctorId) {
        const doc = await User.findById(adm.doctorId).lean();
        console.log('Doctor User by doctorId:', doc?.name, doc?.role);
    }
    if (adm.admittedBy) {
        const admBy = await User.findById(adm.admittedBy).lean();
        console.log('AdmittedBy User:', admBy?.name, admBy?.role);
    }
    if (adm.appointmentId) {
        const appt = await Appointment.findById(adm.appointmentId).lean();
        console.log('Appointment:', appt?.doctorName, appt?.doctorId);
    }
    if (adm.patientId) {
        const pt = await User.findById(adm.patientId).lean();
        console.log('Patient:', pt?.name, 'uhid:', pt?.uhid, 'patientId:', pt?.patientId, 'age:', pt?.age, 'gender:', pt?.gender);
    }
}

await mongoose.disconnect();
