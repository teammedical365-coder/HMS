/**
 * seed-demo.js — Idempotent Demo Setup & Configuration Script for Medical365
 *
 * Usage:
 *   npm run seed:demo
 *   or: node scripts/seed-demo.js
 *
 * Configurable via environment variables (or defaults from demoConfig.js):
 *   DEMO_ADMIN_EMAIL       (default: admin@demo.com)
 *   DEMO_ADMIN_PASSWORD    (default: admin@123)
 *   DEMO_RECEPTION_EMAIL   (default: reception@demo.com)
 *   DEMO_RECEPTION_PASSWORD(default: reception@123)
 *   DEMO_DOCTOR_EMAIL      (default: doctor@demo.com)
 *   DEMO_DOCTOR_PASSWORD   (default: doctor@123)
 *   DEMO_NURSE_EMAIL       (default: nurse@demo.com)
 *   DEMO_NURSE_PASSWORD    (default: nurse@123)
 *   DEMO_ACCOUNTANT_EMAIL  (default: accountant@demo.com)
 *   DEMO_ACCOUNTANT_PASSWORD(default: accountant@123)
 *   DEMO_HOSPITAL_ID       (default: 660000000000000000000001)
 *
 * IDEMPOTENCY & DATA SAFETY:
 *   Running this script multiple times will NEVER create duplicate users or records.
 *   Running this script will NEVER delete or erase user-created business data
 *   (patients, appointments, admissions, clinical records, billing, inventory).
 *   NO auto-reset or scheduled reset is configured.
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const {
    DEMO_HOSPITAL_ID,
    DEMO_HOSPITAL_CODE,
    DEMO_HOSPITAL_SLUG,
    DEMO_HOSPITAL_NAME,
    DEMO_ADMIN_EMAIL,
    DEMO_ADMIN_PASSWORD,
    DEMO_RECEPTION_EMAIL,
    DEMO_RECEPTION_PASSWORD,
    DEMO_DOCTOR_EMAIL,
    DEMO_DOCTOR_PASSWORD,
    DEMO_NURSE_EMAIL,
    DEMO_NURSE_PASSWORD,
    DEMO_ACCOUNTANT_EMAIL,
    DEMO_ACCOUNTANT_PASSWORD,
    DEMO_EMAIL,
    DEMO_PASSWORD,
    PREDEFINED_DEMO_USERS
} = require('../src/config/demoConfig');

// Master Models
const Hospital = require('../src/models/hospital.model');
const User = require('../src/models/user.model');
const Role = require('../src/models/role.model');
const Department = require('../src/models/department.model');
const Doctor = require('../src/models/doctor.model');
const Bed = require('../src/models/bed.model');

// Tenant DB Connector
const { getTenantConnection } = require('../src/db/tenantDb');
const { getTenantModels } = require('../src/db/tenantModels');

const MASTER_DB_URI = process.env.MONGODB_URL || process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/crm';
const DEMO_HOSP_OBJ_ID = new mongoose.Types.ObjectId(DEMO_HOSPITAL_ID);

async function runSeed() {
    console.log('====================================================');
    console.log('  MEDICAL365 DEMO HOSPITAL SETUP (IDEMPOTENT)');
    console.log('====================================================');
    console.log(`Master DB: ${MASTER_DB_URI.replace(/:[^:@]+@/, ':****@')}`);

    await mongoose.connect(MASTER_DB_URI);
    console.log(' Connected to Master Database');

    // Also connect to tenant DB for multi-tenant isolation parity
    const tenantDb = await getTenantConnection(String(DEMO_HOSP_OBJ_ID));
    const tenantModels = getTenantModels(tenantDb);
    console.log(` Connected to Tenant Database: hms_hospital_${DEMO_HOSPITAL_ID}`);

    // ─────────────────────────────────────────────────────────────
    // 1. SEED / UPDATE DEMO HOSPITAL TENANT
    // ─────────────────────────────────────────────────────────────
    console.log('\n[1/5] Setting up Demo Hospital Tenant...');
    const hospitalData = {
        _id: DEMO_HOSP_OBJ_ID,
        name: DEMO_HOSPITAL_NAME,
        slug: DEMO_HOSPITAL_SLUG,
        code: DEMO_HOSPITAL_CODE,
        hospitalCode: 'DEMO',
        phone: '9876543210',
        email: 'hospital@demo.com',
        website: 'https://demo.medical365.com',
        address: '100 Medical Innovation Boulevard, Tech Health City',
        city: 'Bengaluru',
        state: 'Karnataka',
        clinicType: 'hospital',
        subscriptionPlan: 'enterprise',
        isActive: true,
        departments: ['General Medicine', 'Cardiology', 'Gynecology', 'Orthopedics', 'Pediatrics'],
        departmentFees: new Map([
            ['General Medicine', 500],
            ['Cardiology', 800],
            ['Gynecology', 700],
            ['Orthopedics', 750],
            ['Pediatrics', 600]
        ]),
        facilities: [
            { name: 'General Ward Bed', pricePerDay: 800 },
            { name: 'ICU Bed', pricePerDay: 3500 },
            { name: 'Private Deluxe Room', pricePerDay: 2200 },
            { name: 'Semi-Private Bed', pricePerDay: 1400 }
        ],
        branding: {
            appName: DEMO_HOSPITAL_NAME,
            tagline: 'Excellence in Modern Healthcare',
            primaryColor: '#0ea5e9',
            secondaryColor: '#0f172a',
            accentColor: '#38bdf8',
            emailDisplayName: DEMO_HOSPITAL_NAME,
            supportEmail: 'demo-support@medical365.com',
            supportPhone: '9876543210'
        },
        appointmentMode: 'slot'
    };

    const demoHospital = await Hospital.findByIdAndUpdate(
        DEMO_HOSP_OBJ_ID,
        { $set: hospitalData },
        { upsert: true, new: true }
    );
    console.log(` Demo Hospital active: "${demoHospital.name}" (ID: ${demoHospital._id}, Code: ${DEMO_HOSPITAL_CODE})`);

    // ─────────────────────────────────────────────────────────────
    // 2. ENSURE STANDARD ROLES EXIST
    // ─────────────────────────────────────────────────────────────
    console.log('\n[2/5] Ensuring standard RBAC Roles exist...');
    const standardRoles = [
        {
            name: 'Receptionist',
            description: 'Patient registration, appointment scheduling, queue and frontdesk operations',
            permissions: [
                'appointment_manage',
                'appointment_view_all',
                'patient_search',
                'patient_create',
                'patient_view',
                'visit_intake',
                'reception_access'
            ],
            dashboardPath: '/reception/dashboard',
            navLinks: [
                { label: 'Reception Dashboard', path: '/reception/dashboard' },
                { label: 'Patient Registration', path: '/reception/dashboard?view=intake' },
                { label: 'Patient Billing', path: '/billing/patient' },
                { label: 'Cash Refunds', path: '/reception/refunds' }
            ],
            isSystemRole: true
        },
        {
            name: 'Doctor',
            description: 'Clinical consultations, diagnoses, e-prescriptions and patient history',
            permissions: [
                'visit_diagnose',
                'patient_view',
                'clinical_history_view',
                'lab_view',
                'pharmacy_view',
                'doctor_access',
                'doctor_dashboard'
            ],
            dashboardPath: '/doctor/patients',
            navLinks: [
                { label: 'Dashboard', path: '/my-dashboard' },
                { label: 'My Patients', path: '/doctor/patients' },
                { label: 'AI Assistant', path: '/doctor/ai-assistant' },
                { label: 'Surgeries', path: '/doctor/surgeries' }
            ],
            isSystemRole: true
        },
        {
            name: 'Nurse',
            description: 'IPD command center, vitals recording, nursing tasks, MAR and patient care',
            permissions: [
                'patient_search',
                'visit_intake',
                'clinical_history_view',
                'appointment_view_all',
                'lab_view',
                'pharmacy_view',
                'nurse_access'
            ],
            dashboardPath: '/nurse/dashboard',
            navLinks: [
                { label: 'Nurse Dashboard', path: '/nurse/dashboard' },
                { label: 'OPD Queue', path: '/nurse/queue' },
                { label: 'IPD Center', path: '/nurse/ipd' }
            ],
            isSystemRole: true
        },
        {
            name: 'Accountant',
            description: 'Hospital finance, financial records, refund management and accounting',
            permissions: ['finance_view'],
            dashboardPath: '/accountant/dashboard',
            navLinks: [
                { label: 'Dashboard', path: '/accountant/dashboard' },
                { label: 'Financial Records', path: '/accountant/financial-records' },
                { label: 'Refunds', path: '/accountant/refunds' },
                { label: 'History', path: '/accountant/history' }
            ],
            isSystemRole: true
        },
        {
            name: 'Admin',
            description: 'Hospital administrator management and reports',
            permissions: [
                'admin_manage_roles',
                'admin_view_stats',
                'patient_search',
                'patient_create',
                'patient_view',
                'patient_edit',
                'appointment_view_all',
                'appointment_manage',
                'lab_view',
                'lab_manage',
                'pharmacy_view',
                'pharmacy_manage',
                'visit_intake',
                'visit_diagnose',
                'clinical_history_view'
            ],
            dashboardPath: '/hospitaladmin',
            navLinks: [],
            isSystemRole: true
        }
    ];

    const roleMap = new Map();
    for (const roleDef of standardRoles) {
        let role = await Role.findOne({ name: { $regex: new RegExp(`^${roleDef.name}$`, 'i') } });
        if (!role) {
            role = await Role.create(roleDef);
            console.log(` Created missing role: ${roleDef.name}`);
        } else {
            // Ensure permissions and dashboardPath are complete
            const mergedPerms = [...new Set([...(role.permissions || []), ...(roleDef.permissions || [])])];
            role.permissions = mergedPerms;
            if (!role.dashboardPath) role.dashboardPath = roleDef.dashboardPath;
            await role.save();
        }
        roleMap.set(roleDef.name.toLowerCase(), role);
    }
    console.log(` Roles verified: Receptionist, Doctor, Nurse, Accountant, Admin.`);

    // ─────────────────────────────────────────────────────────────
    // 3. SEED PREDEFINED DEMO USERS (WITH REAL PASSWORDS & OTP BYPASS)
    // ─────────────────────────────────────────────────────────────
    console.log('\n[3/5] Seeding Predefined Demo Role Users...');

    // Drop stale non-sparse index on aadhaarNumber in tenant database if present
    try {
        if (tenantModels.User) {
            await tenantModels.User.collection.dropIndex('aadhaarNumber_1').catch(() => {});
        }
    } catch (_) {}

    const userConfigs = [
        {
            key: 'ADMIN',
            email: DEMO_ADMIN_EMAIL,
            rawPassword: DEMO_ADMIN_PASSWORD,
            name: 'Demo Hospital Administrator',
            roleStr: 'hospitaladmin',
            roleDoc: null,
            phone: '9000000001',
            aadhaarNumber: '900000000001',
            objectId: new mongoose.Types.ObjectId('660000000000000000000010')
        },
        {
            key: 'RECEPTION',
            email: DEMO_RECEPTION_EMAIL,
            rawPassword: DEMO_RECEPTION_PASSWORD,
            name: 'Demo Receptionist',
            roleStr: null,
            roleDoc: roleMap.get('receptionist'),
            phone: '9000000002',
            aadhaarNumber: '900000000002',
            objectId: new mongoose.Types.ObjectId('660000000000000000000020')
        },
        {
            key: 'DOCTOR',
            email: DEMO_DOCTOR_EMAIL,
            rawPassword: DEMO_DOCTOR_PASSWORD,
            name: 'Dr. Demo Physician',
            roleStr: null,
            roleDoc: roleMap.get('doctor'),
            phone: '9000000003',
            aadhaarNumber: '900000000003',
            objectId: new mongoose.Types.ObjectId('660000000000000000000030'),
            specialty: 'General Medicine'
        },
        {
            key: 'NURSE',
            email: DEMO_NURSE_EMAIL,
            rawPassword: DEMO_NURSE_PASSWORD,
            name: 'Demo Staff Nurse',
            roleStr: null,
            roleDoc: roleMap.get('nurse'),
            phone: '9000000004',
            aadhaarNumber: '900000000004',
            objectId: new mongoose.Types.ObjectId('660000000000000000000040')
        },
        {
            key: 'ACCOUNTANT',
            email: DEMO_ACCOUNTANT_EMAIL,
            rawPassword: DEMO_ACCOUNTANT_PASSWORD,
            name: 'Demo Accountant',
            roleStr: null,
            roleDoc: roleMap.get('accountant'),
            phone: '9000000005',
            aadhaarNumber: '900000000005',
            objectId: new mongoose.Types.ObjectId('660000000000000000000050')
        },
        {
            key: 'LEGACY_DEMO',
            email: DEMO_EMAIL,
            rawPassword: DEMO_PASSWORD,
            name: 'Medical365 Demo Admin',
            roleStr: 'hospitaladmin',
            roleDoc: null,
            phone: '9000000000',
            aadhaarNumber: '900000000006',
            objectId: new mongoose.Types.ObjectId('660000000000000000000011')
        }
    ];

    const seededUsers = [];

    for (const uConfig of userConfigs) {
        const hashedPassword = await bcrypt.hash(uConfig.rawPassword, 10);
        const assignedRole = uConfig.roleStr || (uConfig.roleDoc ? uConfig.roleDoc._id : 'hospitaladmin');

        // Check if user already exists by email (either master or demo)
        let existingUser = await User.findOne({ email: uConfig.email, hospitalId: DEMO_HOSP_OBJ_ID });
        if (!existingUser) {
            existingUser = await User.findOne({ email: uConfig.email });
        }

        const targetId = existingUser ? existingUser._id : uConfig.objectId;

        const updateData = {
            name: uConfig.name,
            email: uConfig.email,
            password: hashedPassword,
            phone: uConfig.phone,
            aadhaarNumber: uConfig.aadhaarNumber,
            role: assignedRole,
            hospitalId: DEMO_HOSP_OBJ_ID,
            isPredefinedDemo: true, // STRICT server-side flag required for OTP bypass
            isDemo: true,
            isDemoUser: true,
            isDemoTenant: true
        };

        const savedUser = await User.findByIdAndUpdate(
            targetId,
            { $set: updateData },
            { upsert: true, new: true }
        );

        // Also ensure present in Tenant DB for complete dual-store multi-tenant isolation
        if (tenantModels.User) {
            await tenantModels.User.findByIdAndUpdate(
                targetId,
                { $set: updateData },
                { upsert: true, new: true }
            );
        }

        seededUsers.push(savedUser);
        console.log(` Demo User [${uConfig.key}]: ${savedUser.email} (Role: ${uConfig.roleStr || (uConfig.roleDoc?.name)} | OTP Bypass: YES)`);
    }

    // Set demo admin user ID on Hospital record
    await Hospital.findByIdAndUpdate(DEMO_HOSP_OBJ_ID, { $set: { adminUserId: seededUsers[0]._id } });

    // ─────────────────────────────────────────────────────────────
    // 4. ENSURE DOCTOR PROFILE FOR DEMO DOCTOR
    // ─────────────────────────────────────────────────────────────
    console.log('\n[4/5] Ensuring Doctor Profile for Demo Doctor...');
    const demoDoctorUser = seededUsers.find(u => u.email === DEMO_DOCTOR_EMAIL);
    if (demoDoctorUser) {
        const docProfileData = {
            doctorId: 'DOC-DEMO-001',
            userId: demoDoctorUser._id,
            hospitalId: DEMO_HOSP_OBJ_ID,
            name: demoDoctorUser.name,
            email: demoDoctorUser.email,
            phone: demoDoctorUser.phone,
            specialty: 'General Medicine',
            experience: '12 Years',
            education: 'MBBS, MD (General Medicine)',
            departments: ['General Medicine'],
            services: ['General Consultation', 'Preventive Health Checkup'],
            consultationFee: 500,
            availability: {
                monday: { available: true, startTime: '09:00', endTime: '18:00' },
                tuesday: { available: true, startTime: '09:00', endTime: '18:00' },
                wednesday: { available: true, startTime: '09:00', endTime: '18:00' },
                thursday: { available: true, startTime: '09:00', endTime: '18:00' },
                friday: { available: true, startTime: '09:00', endTime: '18:00' },
                saturday: { available: true, startTime: '09:00', endTime: '14:00' }
            }
        };

        let existingDoc = await Doctor.findOne({
            $or: [{ userId: demoDoctorUser._id }, { email: demoDoctorUser.email }]
        });
        const doctorIdToUse = existingDoc?.doctorId || 'DOC-DEMO-PHYSICIAN';
        docProfileData.doctorId = doctorIdToUse;

        const targetDocId = existingDoc ? existingDoc._id : new mongoose.Types.ObjectId('660000000000000000000210');

        await Doctor.findByIdAndUpdate(
            targetDocId,
            { $set: docProfileData },
            { upsert: true, new: true }
        );

        if (tenantModels.Doctor) {
            await tenantModels.Doctor.findByIdAndUpdate(
                targetDocId,
                { $set: docProfileData },
                { upsert: true, new: true }
            );
        }
        console.log(` Doctor Profile linked for: ${demoDoctorUser.email} (ID: ${doctorIdToUse})`);
    }

    // ─────────────────────────────────────────────────────────────
    // 5. ENSURE MASTER DEPARTMENTS & FACILITY BEDS EXIST
    // ─────────────────────────────────────────────────────────────
    console.log('\n[5/5] Ensuring Hospital Departments & Basic Beds exist...');
    const departments = [
        { name: 'General Medicine', description: 'Primary and internal care' },
        { name: 'Cardiology', description: 'Comprehensive heart & vascular care' },
        { name: 'Gynecology', description: 'Women health and maternity' },
        { name: 'Orthopedics', description: 'Bones, joints and sports medicine' },
        { name: 'Pediatrics', description: 'Child health and neonatal care' }
    ];

    for (const dept of departments) {
        await Department.findOneAndUpdate(
            { hospitalId: DEMO_HOSP_OBJ_ID, name: dept.name },
            { $set: { ...dept, hospitalId: DEMO_HOSP_OBJ_ID, isActive: true } },
            { upsert: true, new: true }
        );
        if (tenantModels.Department) {
            await tenantModels.Department.findOneAndUpdate(
                { hospitalId: DEMO_HOSP_OBJ_ID, name: dept.name },
                { $set: { ...dept, hospitalId: DEMO_HOSP_OBJ_ID, isActive: true } },
                { upsert: true, new: true }
            );
        }
    }
    console.log(` 5 Departments verified.`);

    // Ensure a few basic beds exist for admission testing if none exist
    const existingBedsCount = await Bed.countDocuments({ hospitalId: DEMO_HOSP_OBJ_ID });
    if (existingBedsCount === 0) {
        const initialBeds = [
            { bedNumber: 'B-101', ward: 'General Ward', type: 'Standard', dailyRate: 800, status: 'Available', hospitalId: DEMO_HOSP_OBJ_ID },
            { bedNumber: 'B-102', ward: 'General Ward', type: 'Standard', dailyRate: 800, status: 'Available', hospitalId: DEMO_HOSP_OBJ_ID },
            { bedNumber: 'ICU-01', ward: 'ICU', type: 'Ventilator', dailyRate: 3500, status: 'Available', hospitalId: DEMO_HOSP_OBJ_ID },
            { bedNumber: 'DLX-01', ward: 'Private Deluxe', type: 'Deluxe Suite', dailyRate: 2200, status: 'Available', hospitalId: DEMO_HOSP_OBJ_ID }
        ];
        for (const b of initialBeds) {
            await Bed.findOneAndUpdate(
                { hospitalId: DEMO_HOSP_OBJ_ID, bedNumber: b.bedNumber },
                { $set: b },
                { upsert: true, new: true }
            );
            if (tenantModels.Bed) {
                await tenantModels.Bed.findOneAndUpdate(
                    { hospitalId: DEMO_HOSP_OBJ_ID, bedNumber: b.bedNumber },
                    { $set: b },
                    { upsert: true, new: true }
                );
            }
        }
        console.log(` Initial ward beds verified.`);
    } else {
        console.log(` ${existingBedsCount} existing beds preserved.`);
    }

    console.log('\n====================================================');
    console.log('  DEMO SETUP COMPLETED SUCCESSFULLY');
    console.log('====================================================');
    console.log(`Tenant Name   : ${DEMO_HOSPITAL_NAME}`);
    console.log(`Tenant ID     : ${DEMO_HOSPITAL_ID} (Code: ${DEMO_HOSPITAL_CODE}, Slug: ${DEMO_HOSPITAL_SLUG})`);
    console.log('\nPredefined Demo Accounts (Password-only, No OTP required):');
    console.log(` 1. Admin      : ${DEMO_ADMIN_EMAIL}       (Role: hospitaladmin)`);
    console.log(` 2. Reception  : ${DEMO_RECEPTION_EMAIL}   (Role: Receptionist)`);
    console.log(` 3. Doctor     : ${DEMO_DOCTOR_EMAIL}      (Role: Doctor)`);
    console.log(` 4. Nurse      : ${DEMO_NURSE_EMAIL}       (Role: Nurse)`);
    console.log(` 5. Accountant : ${DEMO_ACCOUNTANT_EMAIL}  (Role: Accountant)`);
    console.log('\nNote: Any newly created user inside Demo Hospital will require regular OTP.');
    console.log('Data Persistence: Persistent MongoDB storage (NO auto-reset / NO scheduled reset).');
    console.log('====================================================\n');

    process.exit(0);
}

runSeed().catch(err => {
    console.error('\n❌ Seed Script Error:', err);
    process.exit(1);
});
