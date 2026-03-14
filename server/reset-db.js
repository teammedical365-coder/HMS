const mongoose = require('mongoose');
const User = require('./src/models/user.model');
const Appointment = require('./src/models/appointment.model');
const Doctor = require('./src/models/doctor.model');
const Lab = require('./src/models/lab.model');
const Pharmacy = require('./src/models/pharmacy.model');
const Reception = require('./src/models/reception.model');

// --- YOUR SPECIFIC CONNECTION STRING ---
const MONGO_URI = "mongodb+srv://crm:ilK0TxSZI3UJLijE@cluster0.bzkyl0e.mongodb.net/IVF_CRM_TEST";

const reset = async () => {
    try {
        console.log('⏳ Connecting to MongoDB Atlas...');
        // Connect specifically to your IVF_CRM_TEST database
        await mongoose.connect(MONGO_URI);
        console.log('✅ Connected.');

        // 1. CLEAR COLLECTIONS (Fixes the Schema Mismatch)
        console.log('🗑️  Clearing Corrupt Data...');
        try { await User.collection.drop(); } catch (e) { }
        try { await Appointment.collection.drop(); } catch (e) { }
        try { await Doctor.collection.drop(); } catch (e) { }
        try { await Lab.collection.drop(); } catch (e) { }
        try { await Pharmacy.collection.drop(); } catch (e) { }
        try { await Reception.collection.drop(); } catch (e) { }

        // 2. CREATE ADMIN USER
        console.log('👤 Creating Fresh Admin User...');
        const admin = new User({
            name: 'System Admin',
            email: 'admin@admin.com',
            password: 'admin', // Will be hashed automatically
            role: 'superadmin', // Using 'superadmin' to match your auth middleware check
            phone: '9999999999',
            services: ['Manage Users', 'System Settings']
        });
        await admin.save();
        console.log('✅ Admin Created: admin@admin.com / admin');

        // 3. CREATE RECEPTION USER (For testing dashboard)
        const reception = new User({
            name: 'Reception Desk',
            email: 'reception@crm.com',
            password: '123',
            role: 'reception',
            phone: '8888888888',
            services: ['Patient Registration']
        });
        await reception.save();
        console.log('✅ Reception Created: reception@crm.com / 123');

        console.log('🎉 DATABASE RESET COMPLETE.');
        process.exit(0);

    } catch (err) {
        console.error('❌ Error:', err);
        process.exit(1);
    }
};

reset();