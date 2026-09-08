const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URL = process.env.MONGODB_URL || 'mongodb://127.0.0.1:27017/crm';

const HospitalSchema = new mongoose.Schema({ name: String, slug: String }, { strict: false });
const RoleSchema = new mongoose.Schema({ name: String, dashboardPath: String, navLinks: Array }, { strict: false });
const UserSchema = new mongoose.Schema({ name: String, role: String, dashboardPath: String }, { strict: false });

async function updateAll() {
    try {
        console.log('Connecting to Master DB...');
        const masterConn = await mongoose.createConnection(MONGODB_URL, { dbName: 'crm' }).asPromise();
        console.log('Master DB connected.');

        const MasterHospital = masterConn.model('Hospital', HospitalSchema);
        const MasterRole = masterConn.model('Role', RoleSchema);
        const MasterUser = masterConn.model('User', UserSchema);

        // 1. Update Master DB Roles
        const masterRoles = await MasterRole.find({ name: /nurse/i });
        for (let r of masterRoles) {
            r.dashboardPath = '/nurse/dashboard';
            r.navLinks = [
                { label: 'Nurse Command Center', path: '/nurse/dashboard' },
                { label: 'Patient Queue', path: '/doctor/patients' },
                { label: 'Appointments', path: '/appointment' }
            ];
            await r.save();
            console.log(`[Master DB] Updated Role: ${r.name} -> /nurse/dashboard`);
        }

        // 2. Update Master DB Users
        const masterUsers = await MasterUser.find({
            $or: [
                { role: /nurse/i },
                { role: 'nurse' },
                { role: 'staffnurse' },
                { role: 'headnurse' }
            ]
        });
        for (let u of masterUsers) {
            u.dashboardPath = '/nurse/dashboard';
            await u.save();
            console.log(`[Master DB] Updated User: ${u.name || u.email} -> /nurse/dashboard`);
        }

        // 3. Fetch all hospitals to iterate over tenant databases
        const hospitals = await MasterHospital.find({}).lean();
        console.log(`Found ${hospitals.length} hospitals in Master DB.`);

        for (let h of hospitals) {
            const dbName = `hms_hospital_${String(h._id).replace(/[^a-zA-Z0-9_-]/g, '_')}`;
            try {
                const tenantConn = await mongoose.createConnection(MONGODB_URL, { dbName }).asPromise();
                const TenantRole = tenantConn.model('Role', RoleSchema);
                const TenantUser = tenantConn.model('User', UserSchema);

                const tRoles = await TenantRole.find({ name: /nurse/i });
                for (let r of tRoles) {
                    r.dashboardPath = '/nurse/dashboard';
                    r.navLinks = [
                        { label: 'Nurse Command Center', path: '/nurse/dashboard' },
                        { label: 'Patient Queue', path: '/doctor/patients' },
                        { label: 'Appointments', path: '/appointment' }
                    ];
                    await r.save();
                    console.log(`[${dbName}] Updated Tenant Role: ${r.name}`);
                }

                const tUsers = await TenantUser.find({
                    $or: [
                        { role: /nurse/i },
                        { role: 'nurse' },
                        { role: 'staffnurse' },
                        { role: 'headnurse' }
                    ]
                });
                for (let u of tUsers) {
                    u.dashboardPath = '/nurse/dashboard';
                    await u.save();
                    console.log(`[${dbName}] Updated Tenant User: ${u.name || u.email}`);
                }

                await tenantConn.close();
            } catch (tErr) {
                console.warn(`Could not update tenant ${dbName}:`, tErr.message);
            }
        }

        await masterConn.close();
        console.log('✅ ALL Nurse Roles & Users have been successfully updated to /nurse/dashboard!');
        process.exit(0);
    } catch (err) {
        console.error('Migration error:', err);
        process.exit(1);
    }
}

updateAll();
