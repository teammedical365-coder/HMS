const mongoose = require('./server/node_modules/mongoose');
require('./server/node_modules/dotenv').config({ path: './server/.env' });

async function run() {
    await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/medical365');
    const Admission = mongoose.model('Admission', new mongoose.Schema({}, { strict: false }));
    const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }));
    const adm = await Admission.findOne().sort({ createdAt: -1 }).lean();
    console.log('Sample Admission record:', JSON.stringify(adm, null, 2));
    if (adm) {
        const pt = await User.findById(adm.patientId).lean();
        console.log('Sample Patient record:', JSON.stringify(pt, null, 2));
        if (adm.doctorId) {
            const doc = await User.findById(adm.doctorId).lean();
            console.log('Sample Doctor record:', JSON.stringify(doc, null, 2));
        }
        if (adm.admittedBy) {
            const admBy = await User.findById(adm.admittedBy).lean();
            console.log('Sample AdmittedBy record:', JSON.stringify(admBy, null, 2));
        }
    }
    await mongoose.disconnect();
}
run().catch(e => { console.error(e); process.exit(1); });
