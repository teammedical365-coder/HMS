const mongoose = require('mongoose');
require('dotenv').config({ path: './.env' });

async function check() {
    await mongoose.connect(process.env.MONGODB_URL || process.env.MONGODB_URI);
    const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }));
    const Role = mongoose.model('Role', new mongoose.Schema({}, { strict: false }));
    const users = await User.find({}).limit(15).lean();
    console.log('--- Sample Staff Users ---');
    for (const u of users) {
        if (['patient', 'user', 'superadmin', 'centraladmin'].includes(u.role)) continue;
        console.log({
            id: u._id,
            name: u.name,
            role: u.role,
            roleType: typeof u.role,
            isObjectId: mongoose.Types.ObjectId.isValid(u.role),
            hospitalId: u.hospitalId
        });
    }
    const roles = await Role.find({}).limit(5).lean();
    console.log('--- Sample Roles ---');
    for (const r of roles) {
        console.log({ id: r._id, name: r.name });
    }
    process.exit(0);
}
check().catch(e => { console.error(e); process.exit(1); });
