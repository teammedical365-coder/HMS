const mongoose = require('mongoose');
require('dotenv').config({ path: './.env' });

async function testUpdate() {
    await mongoose.connect(process.env.MONGODB_URL || process.env.MONGODB_URI);
    const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }));
    const Role = mongoose.model('Role', new mongoose.Schema({}, { strict: false }));
    
    // Find a staff user
    const staff = await User.findOne({
        role: { $nin: ['patient', 'user', 'superadmin', 'centraladmin', 'hospitaladmin'] }
    }).lean();

    if (!staff) {
        console.log('No staff found');
        process.exit(0);
    }

    console.log('Found staff:', {
        id: staff._id,
        name: staff.name,
        role: staff.role,
        roleType: typeof staff.role,
        email: staff.email,
        phone: staff.phone
    });

    // Test what happens in PUT /users/:userId logic
    const userId = staff._id;
    const user = await User.findById(userId);

    // What if frontend sends roleId from user.role or user.roleId?
    console.log('Testing role check:');
    console.log('String(user.role):', String(user.role));
    
    // Check if role is an ObjectId
    if (mongoose.Types.ObjectId.isValid(user.role)) {
        const roleDoc = await Role.findById(user.role);
        console.log('Role doc found:', roleDoc ? roleDoc.name : 'null');
    } else {
        console.log('Role is NOT an ObjectId, trying Role.findById(user.role)...');
        try {
            await Role.findById(user.role);
        } catch (e) {
            console.error('CRASHED on Role.findById:', e.message);
        }
    }

    process.exit(0);
}

testUpdate().catch(e => { console.error(e); process.exit(1); });
