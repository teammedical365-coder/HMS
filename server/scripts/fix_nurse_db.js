const mongoose = require('mongoose');
const Role = require('./src/models/role.model');
const User = require('./src/models/user.model');

mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/crm').then(async () => {
    console.log('Connected');

    // Update the Nurse roles (or any role containing 'nurse') to point to doctor/patients
    const nurseRoles = await Role.find({ name: /nurse/i });
    for (let r of nurseRoles) {
        r.dashboardPath = '/doctor/patients';
        if (r.navLinks) {
            r.navLinks.forEach(l => {
                if (l.label === 'Nurse Intake' && l.path === '/reception/dashboard') {
                    l.path = '/doctor/patients';
                }
            });
        }
        await r.save();
        console.log(`Updated role ${r.name}`);
    }

    // Update any role that has Nurse Intake navLink to path /doctor/patients instead of reception
    const roles = await Role.find({});
    for (let r of roles) {
        let changed = false;
        if (r.navLinks) {
            r.navLinks.forEach(l => {
                if (l.label === 'Nurse Intake' && l.path === '/reception/dashboard') {
                    l.path = '/doctor/patients';
                    changed = true;
                }
            });
        }
        if (changed) {
            await r.save();
            console.log(`Updated navLinks for role ${r.name}`);
        }
    }

    // If there were Users that had dashboardPath override
    const nurses = await User.find({ role: /nurse/i });
    for(let n of nurses) {
        if(n.dashboardPath && n.dashboardPath.includes('reception')) {
            n.dashboardPath = '/doctor/patients';
            await n.save();
        }
    }

    console.log('Complete');
    process.exit(0);
}).catch(console.error);
