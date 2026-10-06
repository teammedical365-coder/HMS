/**
 * seed-demo.js — Idempotent Demo Setup & Configuration Script for Medical365
 *
 * Seeds/updates all predefined demo accounts across ALL dashboards:
 *   1. Hospital Admin     : admin@demo.com          (Password: admin@123)
 *   2. Receptionist       : reception@demo.com      (Password: reception@123)
 *   3. Doctor             : doctor@demo.com         (Password: doctor@123)
 *   4. Nurse              : nurse@demo.com          (Password: nurse@123)
 *   5. Accountant         : accountant@demo.com     (Password: accountant@123)
 *   6. Pharmacist         : pharmacy@demo.com       (Password: pharmacy@123)
 *   7. Lab Technician     : lab@demo.com            (Password: lab@123)
 *   8. OT Manager         : ot@demo.com             (Password: ot@123)
 *   9. Doctor Assistant   : assistant@demo.com      (Password: assistant@123)
 *  10. Cashier            : cashier@demo.com        (Password: cashier@123)
 *  11. Patient Portal     : patient@demo.com        (Password: patient@123)
 *  12. Central Admin      : centraladmin@demo.com   (Password: centraladmin@123)
 *  13. Legacy Demo Admin  : demo@medical365.com     (Password: Demo@12345)
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
    DEMO_PHARMACY_EMAIL,
    DEMO_PHARMACY_PASSWORD,
    DEMO_LAB_EMAIL,
    DEMO_LAB_PASSWORD,
    DEMO_OT_EMAIL,
    DEMO_OT_PASSWORD,
    DEMO_ASSISTANT_EMAIL,
    DEMO_ASSISTANT_PASSWORD,
    DEMO_CASHIER_EMAIL,
    DEMO_CASHIER_PASSWORD,
    DEMO_PATIENT_EMAIL,
    DEMO_PATIENT_PASSWORD,
    DEMO_CENTRALADMIN_EMAIL,
    DEMO_CENTRALADMIN_PASSWORD,
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
const Lab = require('../src/models/lab.model');
const Pharmacy = require('../src/models/pharmacy.model');
const PatientAuth = require('../src/models/patientAuth.model');

// Tenant DB Connector
const { getTenantConnection } = require('../src/db/tenantDb');
const { getTenantModels } = require('../src/db/tenantModels');

const MASTER_DB_URI = process.env.MONGODB_URL || process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/crm';
const DEMO_HOSP_OBJ_ID = new mongoose.Types.ObjectId(DEMO_HOSPITAL_ID);

async function runSeed() {
    console.log('====================================================');
    console.log('  MEDICAL365 ALL-DASHBOARD DEMO SETUP (IDEMPOTENT)');
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
    console.log('\n[1/6] Setting up Demo Hospital Tenant...');
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
    // 2. ENSURE ALL STANDARD ROLES EXIST
    // ─────────────────────────────────────────────────────────────
    console.log('\n[2/6] Ensuring standard RBAC Roles exist for all dashboards...');
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
            permissions: ['finance_view', 'billing_view', 'billing_manage'],
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
            name: 'Pharmacist',
            description: 'Pharmacy management, inventory, batches, suppliers and order fulfillment',
            permissions: ['pharmacy_view', 'pharmacy_manage'],
            dashboardPath: '/pharmacy/inventory',
            navLinks: [
                { label: 'Inventory', path: '/pharmacy/inventory' },
                { label: 'Orders', path: '/pharmacy/orders' },
                { label: 'Purchase Invoices', path: '/pharmacy/purchase-invoices' },
                { label: 'Returns', path: '/pharmacy/returns' }
            ],
            isSystemRole: true
        },
        {
            name: 'Lab',
            description: 'Laboratory management, diagnostic tests, assignments and test reports',
            permissions: ['lab_view', 'lab_manage'],
            dashboardPath: '/lab/dashboard',
            navLinks: [
                { label: 'Lab Dashboard', path: '/lab/dashboard' },
                { label: 'Assigned Tests', path: '/lab/tests' },
                { label: 'Completed Reports', path: '/lab/completed' }
            ],
            isSystemRole: true
        },
        {
            name: 'otmanager',
            description: 'Operation Theatre management, surgery scheduling and OT rooms',
            permissions: ['ot_manage', 'ot_view', 'surgery_manage'],
            dashboardPath: '/ot/dashboard',
            navLinks: [
                { label: 'OT Dashboard', path: '/ot/dashboard' },
                { label: 'Planned Surgeries', path: '/ot/planned' },
                { label: 'OT Schedule', path: '/ot/schedule' },
                { label: 'OT Rooms', path: '/ot/rooms' }
            ],
            isSystemRole: true
        },
        {
            name: 'doctor_assistant',
            description: 'Clinical preparation, vital signs intake, question libraries and queue triage',
            permissions: ['assistant_access', 'patient_view', 'visit_intake'],
            dashboardPath: '/assistant/dashboard',
            navLinks: [
                { label: 'Assistant Dashboard', path: '/assistant/dashboard' },
                { label: 'Assistant Queue', path: '/assistant/queue' },
                { label: 'Preparation', path: '/assistant/preparation' },
                { label: 'Question Library', path: '/assistant/question-library' }
            ],
            isSystemRole: true
        },
        {
            name: 'Cashier',
            description: 'Cashier desk, billing, invoices, receipts and payments',
            permissions: ['billing_view', 'billing_manage', 'appointment_manage'],
            dashboardPath: '/cashier/billing',
            navLinks: [
                { label: 'Cashier Billing', path: '/cashier/billing' },
                { label: 'Patient Billing', path: '/billing/patient' }
            ],
            isSystemRole: true
        },
        {
            name: 'Patient',
            description: 'Patient portal access, appointment booking and report viewing',
            permissions: ['appointment_manage', 'reception_access'],
            dashboardPath: '/patient/dashboard',
            navLinks: [
                { label: 'Dashboard', path: '/patient/dashboard' },
                { label: 'Book Appointment', path: '/patient/book-appointment' }
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
            if (roleDef.navLinks && (!role.navLinks || role.navLinks.length === 0)) role.navLinks = roleDef.navLinks;
            await role.save();
        }
        roleMap.set(roleDef.name.toLowerCase(), role);
    }
    console.log(` All RBAC Roles verified: ${standardRoles.map(r => r.name).join(', ')}`);

    // ─────────────────────────────────────────────────────────────
    // 3. SEED PREDEFINED DEMO USERS (WITH REAL PASSWORDS & OTP BYPASS)
    // ─────────────────────────────────────────────────────────────
    console.log('\n[3/6] Seeding Predefined Demo Users for ALL Dashboards...');

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
            objectId: new mongoose.Types.ObjectId('660000000000000000000010'),
            hospitalId: DEMO_HOSP_OBJ_ID
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
            objectId: new mongoose.Types.ObjectId('660000000000000000000020'),
            hospitalId: DEMO_HOSP_OBJ_ID
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
            specialty: 'General Medicine',
            hospitalId: DEMO_HOSP_OBJ_ID
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
            objectId: new mongoose.Types.ObjectId('660000000000000000000040'),
            hospitalId: DEMO_HOSP_OBJ_ID
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
            objectId: new mongoose.Types.ObjectId('660000000000000000000050'),
            hospitalId: DEMO_HOSP_OBJ_ID
        },
        {
            key: 'PHARMACY',
            email: DEMO_PHARMACY_EMAIL,
            rawPassword: DEMO_PHARMACY_PASSWORD,
            name: 'Demo Pharmacist',
            roleStr: null,
            roleDoc: roleMap.get('pharmacist'),
            phone: '9000000006',
            aadhaarNumber: '900000000016',
            objectId: new mongoose.Types.ObjectId('660000000000000000000060'),
            hospitalId: DEMO_HOSP_OBJ_ID
        },
        {
            key: 'LAB',
            email: DEMO_LAB_EMAIL,
            rawPassword: DEMO_LAB_PASSWORD,
            name: 'Demo Lab Technician',
            roleStr: null,
            roleDoc: roleMap.get('lab'),
            phone: '9000000007',
            aadhaarNumber: '900000000017',
            objectId: new mongoose.Types.ObjectId('660000000000000000000070'),
            hospitalId: DEMO_HOSP_OBJ_ID
        },
        {
            key: 'OT',
            email: DEMO_OT_EMAIL,
            rawPassword: DEMO_OT_PASSWORD,
            name: 'Demo OT Manager',
            roleStr: null,
            roleDoc: roleMap.get('otmanager'),
            phone: '9000000008',
            aadhaarNumber: '900000000018',
            objectId: new mongoose.Types.ObjectId('660000000000000000000080'),
            hospitalId: DEMO_HOSP_OBJ_ID
        },
        {
            key: 'ASSISTANT',
            email: DEMO_ASSISTANT_EMAIL,
            rawPassword: DEMO_ASSISTANT_PASSWORD,
            name: 'Demo Clinical Assistant',
            roleStr: null,
            roleDoc: roleMap.get('doctor_assistant'),
            phone: '9000000009',
            aadhaarNumber: '900000000019',
            objectId: new mongoose.Types.ObjectId('660000000000000000000090'),
            hospitalId: DEMO_HOSP_OBJ_ID
        },
        {
            key: 'CASHIER',
            email: DEMO_CASHIER_EMAIL,
            rawPassword: DEMO_CASHIER_PASSWORD,
            name: 'Demo Cashier',
            roleStr: null,
            roleDoc: roleMap.get('cashier'),
            phone: '9000000010',
            aadhaarNumber: '900000000020',
            objectId: new mongoose.Types.ObjectId('660000000000000000000091'),
            hospitalId: DEMO_HOSP_OBJ_ID
        },
        {
            key: 'PATIENT',
            email: DEMO_PATIENT_EMAIL,
            rawPassword: DEMO_PATIENT_PASSWORD,
            name: 'Demo Patient User',
            roleStr: 'patient',
            roleDoc: null,
            phone: '9000000011',
            aadhaarNumber: '900000000021',
            objectId: new mongoose.Types.ObjectId('660000000000000000000092'),
            hospitalId: DEMO_HOSP_OBJ_ID
        },
        {
            key: 'CENTRALADMIN',
            email: DEMO_CENTRALADMIN_EMAIL,
            rawPassword: DEMO_CENTRALADMIN_PASSWORD,
            name: 'Medical365 Central Admin',
            roleStr: 'centraladmin',
            roleDoc: null,
            phone: '9000000012',
            aadhaarNumber: '900000000022',
            objectId: new mongoose.Types.ObjectId('660000000000000000000093'),
            hospitalId: null
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
            objectId: new mongoose.Types.ObjectId('660000000000000000000011'),
            hospitalId: DEMO_HOSP_OBJ_ID
        }
    ];

    const seededUsers = [];

    for (const uConfig of userConfigs) {
        const hashedPassword = await bcrypt.hash(uConfig.rawPassword, 10);
        const assignedRole = uConfig.roleStr || (uConfig.roleDoc ? uConfig.roleDoc._id : 'hospitaladmin');

        // Check if user already exists by email
        let existingUser = await User.findOne({ email: uConfig.email });

        const targetId = existingUser ? existingUser._id : uConfig.objectId;

        const updateData = {
            name: uConfig.name,
            email: uConfig.email,
            password: hashedPassword,
            phone: uConfig.phone,
            aadhaarNumber: uConfig.aadhaarNumber,
            role: assignedRole,
            hospitalId: uConfig.hospitalId,
            isPredefinedDemo: true, // STRICT server-side flag required for OTP bypass
            isDemo: true,
            isDemoUser: true,
            isDemoTenant: uConfig.hospitalId ? true : false
        };

        const savedUser = await User.findByIdAndUpdate(
            targetId,
            { $set: updateData },
            { upsert: true, new: true }
        );

        // Also ensure present in Tenant DB if hospital-scoped
        if (uConfig.hospitalId && tenantModels.User) {
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
    console.log('\n[4/6] Ensuring Doctor Profile for Demo Doctor...');
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
    // 5. ENSURE LAB, PHARMACY & PATIENT AUTH PROFILES
    // ─────────────────────────────────────────────────────────────
    console.log('\n[5/6] Ensuring Lab, Pharmacy & PatientAuth records...');

    // 5a. Demo Lab
    const demoLabUser = seededUsers.find(u => u.email === DEMO_LAB_EMAIL);
    if (demoLabUser) {
        await Lab.findOneAndUpdate(
            { hospitalId: DEMO_HOSP_OBJ_ID },
            {
                $set: {
                    userId: demoLabUser._id,
                    hospitalId: DEMO_HOSP_OBJ_ID,
                    name: 'Medical365 Demo Pathology & Diagnostics',
                    email: demoLabUser.email,
                    phone: demoLabUser.phone,
                    address: 'Ground Floor, Medical365 Demo Hospital',
                    services: ['Complete Blood Count', 'Lipid Profile', 'Liver Function Test', 'Thyroid Profile', 'Urine Routine', 'HbA1c', 'X-Ray Chest']
                }
            },
            { upsert: true, new: true }
        );
        console.log(` Demo Lab record verified for: ${DEMO_LAB_EMAIL}`);
    }

    // 5b. Demo Pharmacy
    const demoPharmacyUser = seededUsers.find(u => u.email === DEMO_PHARMACY_EMAIL);
    if (demoPharmacyUser) {
        await Pharmacy.findOneAndUpdate(
            { hospitalId: DEMO_HOSP_OBJ_ID },
            {
                $set: {
                    userId: demoPharmacyUser._id,
                    hospitalId: DEMO_HOSP_OBJ_ID,
                    name: 'Medical365 Demo Pharmacy',
                    email: demoPharmacyUser.email,
                    phone: demoPharmacyUser.phone,
                    address: '1st Floor, Main Wing, Medical365 Demo Hospital',
                    medications: [
                        { name: 'Paracetamol 650mg', price: 30, stock: 500, category: 'Analgesic' },
                        { name: 'Amoxicillin 500mg', price: 85, stock: 350, category: 'Antibiotic' },
                        { name: 'Pantoprazole 40mg', price: 95, stock: 400, category: 'Antacid' },
                        { name: 'Metformin 500mg', price: 45, stock: 300, category: 'Antidiabetic' },
                        { name: 'Cetirizine 10mg', price: 25, stock: 600, category: 'Antihistamine' }
                    ]
                }
            },
            { upsert: true, new: true }
        );
        console.log(` Demo Pharmacy record verified for: ${DEMO_PHARMACY_EMAIL}`);
    }

    // 5c. Demo PatientAuth
    const demoPatientUser = seededUsers.find(u => u.email === DEMO_PATIENT_EMAIL);
    if (demoPatientUser) {
        let existingPatientAuth = await PatientAuth.findOne({
            $or: [{ email: DEMO_PATIENT_EMAIL }, { mobile: '9000000011' }],
            hospitalId: DEMO_HOSP_OBJ_ID
        });
        const patientHashedPassword = await bcrypt.hash(DEMO_PATIENT_PASSWORD, 10);
        const pAuthData = {
            name: demoPatientUser.name,
            email: demoPatientUser.email,
            mobile: demoPatientUser.phone,
            password: patientHashedPassword,
            hospitalId: DEMO_HOSP_OBJ_ID,
            status: 'Active',
            emailVerified: true,
            mobileVerified: true,
            linkedPatientProfileId: demoPatientUser._id
        };
        if (existingPatientAuth) {
            await PatientAuth.findByIdAndUpdate(existingPatientAuth._id, { $set: pAuthData });
        } else {
            await PatientAuth.create(pAuthData);
        }
        console.log(` Demo PatientAuth verified for: ${DEMO_PATIENT_EMAIL}`);
    }

    // ─────────────────────────────────────────────────────────────
    // 6. ENSURE MASTER DEPARTMENTS & FACILITY BEDS EXIST
    // ─────────────────────────────────────────────────────────────
    console.log('\n[6/6] Ensuring Hospital Departments & Basic Beds exist...');
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
    console.log('  ALL-DASHBOARD DEMO SETUP COMPLETED SUCCESSFULLY');
    console.log('====================================================');
    console.log(`Tenant Name   : ${DEMO_HOSPITAL_NAME}`);
    console.log(`Tenant ID     : ${DEMO_HOSPITAL_ID} (Code: ${DEMO_HOSPITAL_CODE}, Slug: ${DEMO_HOSPITAL_SLUG})`);
    console.log('\nAll Predefined Demo Accounts (Direct Password Login, OTP Bypassed):');
    console.log(` 1. Hospital Admin     : ${DEMO_ADMIN_EMAIL.padEnd(25)} Password: ${DEMO_ADMIN_PASSWORD.padEnd(15)} -> /hospitaladmin`);
    console.log(` 2. Receptionist       : ${DEMO_RECEPTION_EMAIL.padEnd(25)} Password: ${DEMO_RECEPTION_PASSWORD.padEnd(15)} -> /reception/dashboard`);
    console.log(` 3. Doctor             : ${DEMO_DOCTOR_EMAIL.padEnd(25)} Password: ${DEMO_DOCTOR_PASSWORD.padEnd(15)} -> /doctor/patients`);
    console.log(` 4. Nurse              : ${DEMO_NURSE_EMAIL.padEnd(25)} Password: ${DEMO_NURSE_PASSWORD.padEnd(15)} -> /nurse/dashboard`);
    console.log(` 5. Accountant         : ${DEMO_ACCOUNTANT_EMAIL.padEnd(25)} Password: ${DEMO_ACCOUNTANT_PASSWORD.padEnd(15)} -> /accountant/dashboard`);
    console.log(` 6. Pharmacist         : ${DEMO_PHARMACY_EMAIL.padEnd(25)} Password: ${DEMO_PHARMACY_PASSWORD.padEnd(15)} -> /pharmacy/inventory`);
    console.log(` 7. Lab Technician     : ${DEMO_LAB_EMAIL.padEnd(25)} Password: ${DEMO_LAB_PASSWORD.padEnd(15)} -> /lab/dashboard`);
    console.log(` 8. OT Manager         : ${DEMO_OT_EMAIL.padEnd(25)} Password: ${DEMO_OT_PASSWORD.padEnd(15)} -> /ot/dashboard`);
    console.log(` 9. Doctor Assistant   : ${DEMO_ASSISTANT_EMAIL.padEnd(25)} Password: ${DEMO_ASSISTANT_PASSWORD.padEnd(15)} -> /assistant/dashboard`);
    console.log(`10. Cashier            : ${DEMO_CASHIER_EMAIL.padEnd(25)} Password: ${DEMO_CASHIER_PASSWORD.padEnd(15)} -> /cashier/billing`);
    console.log(`11. Patient Portal     : ${DEMO_PATIENT_EMAIL.padEnd(25)} Password: ${DEMO_PATIENT_PASSWORD.padEnd(15)} -> /patient/dashboard`);
    console.log(`12. Central Admin      : ${DEMO_CENTRALADMIN_EMAIL.padEnd(25)} Password: ${DEMO_CENTRALADMIN_PASSWORD.padEnd(15)} -> /supremeadmin`);
    console.log(`13. Demo Admin (Legacy): ${DEMO_EMAIL.padEnd(25)} Password: ${DEMO_PASSWORD.padEnd(15)} -> /hospitaladmin`);
    console.log('\nData Persistence: Persistent MongoDB storage (NO auto-reset / NO scheduled reset).');
    console.log('====================================================\n');

    process.exit(0);
}

runSeed().catch(err => {
    console.error('\n❌ Seed Script Error:', err);
    process.exit(1);
});
