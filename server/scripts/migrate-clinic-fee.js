require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');

// It's important to use the correct model path relative to the scripts folder
const Hospital = require('../src/models/hospital.model');

async function migrateLegacyClinicFees() {
    try {
        console.log('🔗 Connecting to database...');
        await mongoose.connect(process.env.MONGODB_URL);
        console.log('✅ Connected to MongoDB.');

        // 1. Identify all hospitals/clinics where defaultFee is 0
        // We filter by clinicType: 'clinic' to avoid altering full 'hospital' records 
        // that legitimately might not use defaultFee
        const filterQuery = { 
            clinicType: 'clinic', 
            defaultFee: 0 
        };

        const clinicsWithZeroFee = await Hospital.find(filterQuery);
        console.log(`\n🔍 Found ${clinicsWithZeroFee.length} clinic(s) with a 0 Consultation Fee.`);

        if (clinicsWithZeroFee.length === 0) {
            console.log('👍 No migration needed. Exiting...');
            process.exit(0);
        }

        // Display the clinics that will be updated for transparency
        clinicsWithZeroFee.forEach(c => {
            console.log(`   - ${c.name} (Code: ${c.clinicCode})`);
        });

        // 2. Perform the update operation safely
        // You can change '300' below to whatever your baseline standard fee is
        const standardBaseFee = 300;
        console.log(`\n⚙️ Updating these clinics to a defaultFee of ₹${standardBaseFee}...`);

        const updateResult = await Hospital.updateMany(
            filterQuery, 
            { $set: { defaultFee: standardBaseFee } }
        );

        console.log(`✅ Successfully updated ${updateResult.modifiedCount} clinic(s).`);

    } catch (error) {
        console.error('❌ Migration failed:', error);
    } finally {
        await mongoose.disconnect();
        console.log('🔌 Disconnected from database.');
        process.exit(0);
    }
}

migrateLegacyClinicFees();
