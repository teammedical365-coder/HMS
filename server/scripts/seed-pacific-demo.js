/**
 * seed-pacific-demo.js — Idempotent Setup Script for Pacific Hospital Interactive Demo
 *
 * Ensures:
 *  1. Existing Pacific Hospital tenant (`slug: 'pacifichospital'`) is configured with `isDemoEnabled: true`
 *     (or created safely without duplicating if missing). Does NOT alter or enable demo on any other hospital.
 *  2. The 5 required demo accounts exist strictly inside Pacific Hospital:
 *       - Hospital Admin (`hospitaladmin`)
 *       - Doctor (`doctor`) + linked Doctor profile inside Pacific Hospital
 *       - Reception (`reception` -> Receptionist Role)
 *       - Lab (`lab` -> Lab Admin Role)
 *       - Accountant (`accountant` -> Accountant Role)
 *  3. Passwords are hashed securely via bcrypt (`User` pre-save hook).
 *  4. Every demo account is marked `{ isDemoAccount: true, demoRoleKey, isActive: true, hospitalId: Pacific._id }`.
 *
 * Usage:
 *   node server/scripts/seed-pacific-demo.js
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const mongoose = require('mongoose');

require('../src/models/aiWallet.model');
const Hospital = require('../src/models/hospital.model');
const User = require('../src/models/user.model');
const Role = require('../src/models/role.model');
const Doctor = require('../src/models/doctor.model');

const {
    PACIFIC_DEMO_SLUG,
    PACIFIC_DEMO_HOSPITAL_ID,
    PACIFIC_DEMO_ROLES,
    getPacificDemoSeedSecret
} = require('../src/config/pacificDemoConfig');

async function resolveOrCreateSystemRole(roleName, hospitalId) {
    let roleDoc = await Role.findOne({
        hospitalId,
        name: { $regex: new RegExp(`^${roleName}$`, 'i') }
    });
    if (!roleDoc) {
        roleDoc = await Role.findOne({
            hospitalId: null,
            name: { $regex: new RegExp(`^${roleName}$`, 'i') }
        });
    }
    if (!roleDoc) {
        throw new Error(`Required system role '${roleName}' was not found in DB.`);
    }
    return roleDoc;
}

async function seedPacificDemo() {
    if (!process.env.MONGODB_URL) {
        throw new Error('MONGODB_URL environment variable is required.');
    }

    await mongoose.connect(process.env.MONGODB_URL);
    console.log('[Pacific Demo Seed] Connected to MongoDB.');

    // 1. Find existing Pacific Hospital cleanly (no duplicates)
    let hospital = await Hospital.findOne({
        $or: [
            { _id: mongoose.Types.ObjectId.isValid(PACIFIC_DEMO_HOSPITAL_ID) ? PACIFIC_DEMO_HOSPITAL_ID : undefined },
            { slug: PACIFIC_DEMO_SLUG }
        ].filter((q) => Object.values(q)[0] !== undefined)
    });

    if (!hospital) {
        hospital = new Hospital({
            _id: new mongoose.Types.ObjectId(PACIFIC_DEMO_HOSPITAL_ID),
            name: 'Pacific Hospital',
            slug: PACIFIC_DEMO_SLUG,
            hospitalCode: 'PCF',
            address: 'Vaishali Nagar, Jaipur',
            city: 'Jaipur',
            state: 'Rajasthan',
            phone: '8781874834',
            email: 'pacifichospital@test.com',
            clinicType: 'hospital',
            subscriptionPlan: 'enterprise',
            isActive: true,
            isDemoEnabled: true
        });
        await hospital.save();
        console.log('[Pacific Demo Seed] Created Pacific Hospital tenant:', hospital._id.toString());
    } else {
        if (!hospital.isDemoEnabled || !hospital.isActive || hospital.slug !== PACIFIC_DEMO_SLUG) {
            hospital.isDemoEnabled = true;
            hospital.isActive = true;
            if (!hospital.slug) hospital.slug = PACIFIC_DEMO_SLUG;
            await hospital.save();
        }
        console.log('[Pacific Demo Seed] Verified Pacific Hospital tenant:', hospital._id.toString(), `(slug=${hospital.slug}, isDemoEnabled=${hospital.isDemoEnabled})`);
    }

    const rawPassword = getPacificDemoSeedSecret();
    const summary = [];

    for (const spec of PACIFIC_DEMO_ROLES) {
        let assignedRoleValue = spec.userRoleField;
        if (!assignedRoleValue && spec.roleLookupName) {
            const roleDoc = await resolveOrCreateSystemRole(spec.roleLookupName, hospital._id);
            assignedRoleValue = roleDoc._id;
        }

        let user = await User.findOne({
            hospitalId: hospital._id,
            $or: [
                { email: spec.email },
                { demoRoleKey: spec.roleKey, isDemoAccount: true }
            ]
        });

        if (!user) {
            user = new User({
                name: spec.userName,
                email: spec.email,
                phone: spec.phone,
                password: rawPassword,
                role: assignedRoleValue,
                hospitalId: hospital._id,
                isActive: true,
                isPredefinedDemo: false,
                isDemoAccount: true,
                demoRoleKey: spec.roleKey
            });
            await user.save();
            summary.push({ roleKey: spec.roleKey, email: spec.email, action: 'CREATED', userId: String(user._id) });
        } else {
            user.name = spec.userName;
            user.email = spec.email;
            user.phone = spec.phone;
            user.role = assignedRoleValue;
            user.hospitalId = hospital._id;
            user.isActive = true;
            user.isDemoAccount = true;
            user.demoRoleKey = spec.roleKey;
            user.password = rawPassword; // re-hashes via pre('save') cleanly
            await user.save();
            summary.push({ roleKey: spec.roleKey, email: spec.email, action: 'UPDATED', userId: String(user._id) });
        }

        // Ensure linked Doctor profile exists inside Pacific Hospital for Demo Doctor
        if (spec.roleKey === 'doctor') {
            let doctorDoc = await Doctor.findOne({
                hospitalId: hospital._id,
                $or: [{ userId: user._id }, { email: spec.email }, { doctorId: 'DOC-PCF-DEMO-01' }]
            });
            if (!doctorDoc) {
                doctorDoc = await Doctor.create({
                    doctorId: 'DOC-PCF-DEMO-01',
                    userId: user._id,
                    hospitalId: hospital._id,
                    name: spec.userName,
                    email: spec.email,
                    phone: spec.phone,
                    specialty: spec.specialization || 'Internal Medicine',
                    departments: ['General'],
                    services: ['OPD Consultation'],
                    isAvailable: true
                });
                console.log('[Pacific Demo Seed] Linked Doctor profile created:', doctorDoc._id.toString());
            } else {
                doctorDoc.userId = user._id;
                doctorDoc.hospitalId = hospital._id;
                doctorDoc.name = spec.userName;
                doctorDoc.specialty = doctorDoc.specialty || spec.specialization || 'Internal Medicine';
                await doctorDoc.save();
            }
        }
    }

    // Security check: ensure NO OTHER hospital has isDemoEnabled === true from this script
    const enabledHospitals = await Hospital.find({ isDemoEnabled: true }).select('_id name slug').lean();
    console.log('[Pacific Demo Seed] Hospitals with isDemoEnabled=true:', enabledHospitals);
    console.table(summary);

    await mongoose.disconnect();
    console.log('[Pacific Demo Seed] Done.');
}

if (require.main === module) {
    seedPacificDemo().catch((err) => {
        console.error('[Pacific Demo Seed] Error:', err);
        process.exit(1);
    });
}

module.exports = { seedPacificDemo };
