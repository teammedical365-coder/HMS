/**
 * seed-demo.js — Production-Safe Idempotent Demo Seeder for Medical365
 *
 * Usage:
 *   npm run seed:demo
 *   or: node scripts/seed-demo.js
 *
 * Configurable via environment variables (or defaults from demoConfig.js):
 *   DEMO_EMAIL       (default: demo@medical365.com)
 *   DEMO_PASSWORD    (default: Demo@12345)
 *   DEMO_HOSPITAL_ID (default: 660000000000000000000001)
 *
 * IDEMPOTENCY:
 *   Running this script multiple times will NEVER create duplicate records.
 *   All records use deterministic, stable demo IDs and unique identifiers.
 *   NO auto-reset or scheduled reset is configured; data persists across restarts.
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const {
    DEMO_EMAIL,
    DEMO_PASSWORD,
    DEMO_HOSPITAL_ID,
    DEMO_HOSPITAL_SLUG,
    DEMO_HOSPITAL_NAME,
} = require('../src/config/demoConfig');

// Master Models
const Hospital = require('../src/models/hospital.model');
const User = require('../src/models/user.model');
const Role = require('../src/models/role.model');
const Department = require('../src/models/department.model');
const Doctor = require('../src/models/doctor.model');
const ClinicPatient = require('../src/models/clinicPatient.model');
const Bed = require('../src/models/bed.model');
const Admission = require('../src/models/admission.model');
const Appointment = require('../src/models/appointment.model');
const IPDVitals = require('../src/models/ipdVitals.model');
const InpatientOrder = require('../src/models/inpatientOrder.model');
const NursingTask = require('../src/models/nursingTask.model');
const MARRecord = require('../src/models/marRecord.model');
const PaymentTransaction = require('../src/models/paymentTransaction.model');
const Inventory = require('../src/models/inventory.model');
const HospitalPackage = require('../src/models/hospitalPackage.model');

// Tenant DB Connector
const { getTenantConnection } = require('../src/db/tenantDb');
const { getTenantModels } = require('../src/db/tenantModels');

const MASTER_DB_URI = process.env.MONGODB_URL || process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/crm';

const DEMO_HOSP_OBJ_ID = new mongoose.Types.ObjectId(DEMO_HOSPITAL_ID);

async function runSeed() {
    console.log('====================================================');
    console.log('  MEDICAL365 DEMO TENANT & DATA SEEDER');
    console.log('====================================================');
    console.log(`Connecting to Master DB: ${MASTER_DB_URI.replace(/:[^:@]+@/, ':****@')}`);

    await mongoose.connect(MASTER_DB_URI);
    console.log(' Connected to Master Database');

    // Also connect to tenant DB for multi-tenant isolation parity
    const tenantDb = await getTenantConnection(String(DEMO_HOSP_OBJ_ID));
    const tenantModels = getTenantModels(tenantDb);
    console.log(` Connected to Tenant Database: hms_hospital_${DEMO_HOSPITAL_ID}`);

    const hashedPassword = await bcrypt.hash(DEMO_PASSWORD, 10);

    // ─────────────────────────────────────────────────────────────
    // 1. SEED / UPDATE DEMO HOSPITAL
    // ─────────────────────────────────────────────────────────────
    console.log('\n[1/12] Seeding Demo Hospital Tenant...');
    const hospitalData = {
        _id: DEMO_HOSP_OBJ_ID,
        name: DEMO_HOSPITAL_NAME,
        slug: DEMO_HOSPITAL_SLUG,
        hospitalCode: 'DEMO',
        phone: '9876543210',
        email: 'hospital@medical365.com',
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
    console.log(` Demo Hospital confirmed: ${demoHospital.name} (ID: ${demoHospital._id})`);

    // ─────────────────────────────────────────────────────────────
    // 2. SEED / UPDATE DEMO ADMIN USER
    // ─────────────────────────────────────────────────────────────
    console.log('\n[2/12] Seeding Demo Administrator User...');
    const demoAdminId = new mongoose.Types.ObjectId('660000000000000000000010');
    const demoUserData = {
        _id: demoAdminId,
        name: 'Dr. Rajesh Mehta (Demo Admin)',
        email: DEMO_EMAIL,
        password: hashedPassword,
        phone: '9876543210',
        role: 'hospitaladmin',
        hospitalId: DEMO_HOSP_OBJ_ID,
        aadhaarNumber: '999988887777',
        age: 46,
        isDemo: true,
        isDemoUser: true,
        isDemoTenant: true
    };

    const demoUser = await User.findByIdAndUpdate(
        demoAdminId,
        { $set: demoUserData },
        { upsert: true, new: true }
    );

    // Link demo hospital admin user id
    await Hospital.findByIdAndUpdate(DEMO_HOSP_OBJ_ID, { $set: { adminUserId: demoUser._id } });
    console.log(` Demo User confirmed: ${demoUser.email} (Role: ${demoUser.role})`);

    // ─────────────────────────────────────────────────────────────
    // 3. SEED DEPARTMENTS
    // ─────────────────────────────────────────────────────────────
    console.log('\n[3/12] Seeding Hospital Departments...');
    const departments = [
        { _id: new mongoose.Types.ObjectId('660000000000000000000101'), name: 'General Medicine', description: 'Primary and internal care' },
        { _id: new mongoose.Types.ObjectId('660000000000000000000102'), name: 'Cardiology', description: 'Comprehensive heart & vascular care' },
        { _id: new mongoose.Types.ObjectId('660000000000000000000103'), name: 'Gynecology', description: 'Women health and maternity' },
        { _id: new mongoose.Types.ObjectId('660000000000000000000104'), name: 'Orthopedics', description: 'Bones, joints and sports medicine' },
        { _id: new mongoose.Types.ObjectId('660000000000000000000105'), name: 'Pediatrics', description: 'Child health and neonatal care' }
    ];

    for (const dept of departments) {
        await Department.findByIdAndUpdate(
            dept._id,
            { $set: { ...dept, hospitalId: DEMO_HOSP_OBJ_ID, isActive: true } },
            { upsert: true, new: true }
        );
    }
    console.log(` ${departments.length} Departments seeded.`);

    // ─────────────────────────────────────────────────────────────
    // 4. SEED CLINICAL DOCTORS & STAFF USERS
    // ─────────────────────────────────────────────────────────────
    console.log('\n[4/12] Seeding Doctors & Staff Accounts...');
    const staffList = [
        {
            userId: new mongoose.Types.ObjectId('660000000000000000000201'),
            docProfileId: new mongoose.Types.ObjectId('660000000000000000000211'),
            name: 'Dr. Sneha Iyer',
            email: 'sneha.iyer.demo@medical365.com',
            phone: '9876540101',
            role: 'doctor',
            doctorId: 'DOC-DEMO-001',
            specialty: 'Senior Interventional Cardiologist',
            departments: ['Cardiology'],
            consultationFee: 800,
            experience: '14 years',
            education: 'MD, DM (Cardiology), FACC'
        },
        {
            userId: new mongoose.Types.ObjectId('660000000000000000000202'),
            docProfileId: new mongoose.Types.ObjectId('660000000000000000000212'),
            name: 'Dr. Vikram Joshi',
            email: 'vikram.joshi.demo@medical365.com',
            phone: '9876540102',
            role: 'doctor',
            doctorId: 'DOC-DEMO-002',
            specialty: 'Internal Medicine & Critical Care',
            departments: ['General Medicine'],
            consultationFee: 500,
            experience: '12 years',
            education: 'MBBS, MD (General Medicine)'
        },
        {
            userId: new mongoose.Types.ObjectId('660000000000000000000203'),
            docProfileId: new mongoose.Types.ObjectId('660000000000000000000213'),
            name: 'Dr. Ananya Sen',
            email: 'ananya.sen.demo@medical365.com',
            phone: '9876540103',
            role: 'doctor',
            doctorId: 'DOC-DEMO-003',
            specialty: 'Obstetrics & Gynecology Specialist',
            departments: ['Gynecology'],
            consultationFee: 700,
            experience: '10 years',
            education: 'MS (OBG), DNB'
        },
        {
            userId: new mongoose.Types.ObjectId('660000000000000000000204'),
            docProfileId: new mongoose.Types.ObjectId('660000000000000000000214'),
            name: 'Dr. Rohan Verma',
            email: 'rohan.verma.demo@medical365.com',
            phone: '9876540104',
            role: 'doctor',
            doctorId: 'DOC-DEMO-004',
            specialty: 'Orthopedic & Joint Replacement Surgeon',
            departments: ['Orthopedics'],
            consultationFee: 750,
            experience: '15 years',
            education: 'MS (Ortho), MCh (Ortho)'
        },
        // Non-doctor Staff
        {
            userId: new mongoose.Types.ObjectId('660000000000000000000221'),
            name: 'Sister Priya Nair',
            email: 'priya.nair.demo@medical365.com',
            phone: '9876540105',
            role: 'nurse'
        },
        {
            userId: new mongoose.Types.ObjectId('660000000000000000000231'),
            name: 'Amit Kumar (Reception)',
            email: 'amit.kumar.demo@medical365.com',
            phone: '9876540106',
            role: 'receptionist'
        },
        {
            userId: new mongoose.Types.ObjectId('660000000000000000000241'),
            name: 'Pooja Kulkarni (Pharmacy)',
            email: 'pooja.kulkarni.demo@medical365.com',
            phone: '9876540107',
            role: 'pharmacist'
        },
        {
            userId: new mongoose.Types.ObjectId('660000000000000000000251'),
            name: 'Ramesh Patel (Accounts)',
            email: 'ramesh.patel.demo@medical365.com',
            phone: '9876540108',
            role: 'accountant'
        }
    ];

    for (const staff of staffList) {
        // Upsert User
        await User.findByIdAndUpdate(
            staff.userId,
            {
                $set: {
                    _id: staff.userId,
                    name: staff.name,
                    email: staff.email,
                    password: hashedPassword,
                    phone: staff.phone,
                    role: staff.role,
                    hospitalId: DEMO_HOSP_OBJ_ID,
                    aadhaarNumber: `8888${staff.phone}`,
                    age: 35,
                    isActive: true,
                    isDemo: true
                }
            },
            { upsert: true, new: true }
        );

        // Upsert Doctor Profile if applicable
        if (staff.docProfileId) {
            await Doctor.findByIdAndUpdate(
                staff.docProfileId,
                {
                    $set: {
                        _id: staff.docProfileId,
                        doctorId: staff.doctorId,
                        userId: staff.userId,
                        hospitalId: DEMO_HOSP_OBJ_ID,
                        name: staff.name,
                        email: staff.email,
                        phone: staff.phone,
                        specialty: staff.specialty,
                        departments: staff.departments,
                        consultationFee: staff.consultationFee,
                        experience: staff.experience,
                        education: staff.education,
                        status: 'Active',
                        isAvailable: true,
                        availability: {
                            monday: { available: true, startTime: '09:00', endTime: '17:00' },
                            tuesday: { available: true, startTime: '09:00', endTime: '17:00' },
                            wednesday: { available: true, startTime: '09:00', endTime: '17:00' },
                            thursday: { available: true, startTime: '09:00', endTime: '17:00' },
                            friday: { available: true, startTime: '09:00', endTime: '17:00' },
                            saturday: { available: true, startTime: '09:00', endTime: '14:00' }
                        }
                    }
                },
                { upsert: true, new: true }
            );
        }
    }
    console.log(` ${staffList.length} Staff members (including 4 clinical doctors) seeded.`);

    // ─────────────────────────────────────────────────────────────
    // 5. SEED FICTIONAL DEMO PATIENTS
    // ─────────────────────────────────────────────────────────────
    console.log('\n[5/12] Seeding Fictional Demo Patients...');
    const patients = [
        {
            _id: new mongoose.Types.ObjectId('660000000000000000000301'),
            name: 'Aarav Sharma',
            mrn: 'DEMO-M365-001',
            patientId: 'DEMO-P-001',
            email: 'aarav.sharma.demo@medical365.com',
            phone: '9876540001',
            aadhaarNumber: '111122223331',
            gender: 'Male',
            age: 38,
            bloodGroup: 'B+',
            city: 'Bengaluru',
            address: '42 Orchid Residency, Indiranagar'
        },
        {
            _id: new mongoose.Types.ObjectId('660000000000000000000302'),
            name: 'Sunita Devi',
            mrn: 'DEMO-M365-002',
            patientId: 'DEMO-P-002',
            email: 'sunita.devi.demo@medical365.com',
            phone: '9876540002',
            aadhaarNumber: '111122223332',
            gender: 'Female',
            age: 54,
            bloodGroup: 'O+',
            city: 'Bengaluru',
            address: '15 Green Glen Layout, Bellandur'
        },
        {
            _id: new mongoose.Types.ObjectId('660000000000000000000303'),
            name: 'Rohit Malhotra',
            mrn: 'DEMO-M365-003',
            patientId: 'DEMO-P-003',
            email: 'rohit.malhotra.demo@medical365.com',
            phone: '9876540003',
            aadhaarNumber: '111122223333',
            gender: 'Male',
            age: 29,
            bloodGroup: 'A+',
            city: 'Bengaluru',
            address: '88 Tech Park View, Whitefield'
        },
        {
            _id: new mongoose.Types.ObjectId('660000000000000000000304'),
            name: 'Meera Nambiar',
            mrn: 'DEMO-M365-004',
            patientId: 'DEMO-P-004',
            email: 'meera.nambiar.demo@medical365.com',
            phone: '9876540004',
            aadhaarNumber: '111122223334',
            gender: 'Female',
            age: 62,
            bloodGroup: 'AB+',
            city: 'Bengaluru',
            address: '104 Palm Meadows, Koramangala'
        },
        {
            _id: new mongoose.Types.ObjectId('660000000000000000000305'),
            name: 'Kabir Khanna',
            mrn: 'DEMO-M365-005',
            patientId: 'DEMO-P-005',
            email: 'kabir.khanna.demo@medical365.com',
            phone: '9876540005',
            aadhaarNumber: '111122223335',
            gender: 'Male',
            age: 7,
            bloodGroup: 'O+',
            city: 'Bengaluru',
            address: '21 Sunrise Enclave, HSR Layout'
        },
        {
            _id: new mongoose.Types.ObjectId('660000000000000000000306'),
            name: 'Deepa Reddy',
            mrn: 'DEMO-M365-006',
            patientId: 'DEMO-P-006',
            email: 'deepa.reddy.demo@medical365.com',
            phone: '9876540006',
            aadhaarNumber: '111122223336',
            gender: 'Female',
            age: 41,
            bloodGroup: 'B-',
            city: 'Bengaluru',
            address: '77 Lake Breeze, Sarjapur Road'
        },
        {
            _id: new mongoose.Types.ObjectId('660000000000000000000307'),
            name: 'Manoj Tiwari',
            mrn: 'DEMO-M365-007',
            patientId: 'DEMO-P-007',
            email: 'manoj.tiwari.demo@medical365.com',
            phone: '9876540007',
            aadhaarNumber: '111122223337',
            gender: 'Male',
            age: 48,
            bloodGroup: 'A-',
            city: 'Bengaluru',
            address: '56 Silicon Town, Electronic City'
        },
        {
            _id: new mongoose.Types.ObjectId('660000000000000000000308'),
            name: 'Kavita Deshmukh',
            mrn: 'DEMO-M365-008',
            patientId: 'DEMO-P-008',
            email: 'kavita.deshmukh.demo@medical365.com',
            phone: '9876540008',
            aadhaarNumber: '111122223338',
            gender: 'Female',
            age: 33,
            bloodGroup: 'O-',
            city: 'Bengaluru',
            address: '12 Gardenia Heights, Jayanagar'
        }
    ];

    for (const p of patients) {
        // Master User representation (used by Reception, EMR, Auth)
        await User.findByIdAndUpdate(
            p._id,
            {
                $set: {
                    ...p,
                    role: 'patient',
                    hospitalId: DEMO_HOSP_OBJ_ID,
                    isActive: true,
                    isAadhaarVerified: true,
                    isDemo: true
                }
            },
            { upsert: true, new: true }
        );

        // ClinicPatient representation (used by clinic routes)
        await ClinicPatient.findByIdAndUpdate(
            p._id,
            {
                $set: {
                    _id: p._id,
                    clinicId: DEMO_HOSP_OBJ_ID,
                    hospitalId: DEMO_HOSP_OBJ_ID,
                    patientUid: p.patientId,
                    mrn: p.mrn,
                    name: p.name,
                    email: p.email,
                    phone: p.phone,
                    aadhaarNumber: p.aadhaarNumber,
                    gender: p.gender,
                    age: p.age,
                    bloodGroup: p.bloodGroup,
                    city: p.city,
                    address: p.address,
                    isActive: true
                }
            },
            { upsert: true, new: true }
        );

        // Tenant DB User
        await tenantModels.User.findByIdAndUpdate(
            p._id,
            {
                $set: {
                    ...p,
                    role: 'patient',
                    hospitalId: DEMO_HOSP_OBJ_ID,
                    isActive: true,
                    isAadhaarVerified: true
                }
            },
            { upsert: true, new: true }
        );
    }
    console.log(` ${patients.length} Fictional demo patients seeded in Master and Tenant databases.`);

    // ─────────────────────────────────────────────────────────────
    // 6. SEED BEDS & WARD ALLOCATION
    // ─────────────────────────────────────────────────────────────
    console.log('\n[6/12] Seeding Hospital Beds & Wards...');
    const beds = [
        { _id: new mongoose.Types.ObjectId('660000000000000000000401'), bedNumber: 'B-101', ward: 'General Ward', bedType: 'General', status: 'OCCUPIED', currentPatient: patients[1]._id },
        { _id: new mongoose.Types.ObjectId('660000000000000000000402'), bedNumber: 'B-102', ward: 'General Ward', bedType: 'General', status: 'OCCUPIED', currentPatient: patients[3]._id },
        { _id: new mongoose.Types.ObjectId('660000000000000000000403'), bedNumber: 'B-103', ward: 'General Ward', bedType: 'General', status: 'AVAILABLE', currentPatient: null },
        { _id: new mongoose.Types.ObjectId('660000000000000000000404'), bedNumber: 'B-104', ward: 'General Ward', bedType: 'General', status: 'AVAILABLE', currentPatient: null },
        { _id: new mongoose.Types.ObjectId('660000000000000000000405'), bedNumber: 'ICU-201', ward: 'ICU', bedType: 'ICU', status: 'OCCUPIED', currentPatient: patients[6]._id },
        { _id: new mongoose.Types.ObjectId('660000000000000000000406'), bedNumber: 'ICU-202', ward: 'ICU', bedType: 'ICU', status: 'AVAILABLE', currentPatient: null },
        { _id: new mongoose.Types.ObjectId('660000000000000000000407'), bedNumber: 'DLX-301', ward: 'Private Deluxe', bedType: 'Private', status: 'OCCUPIED', currentPatient: patients[5]._id },
        { _id: new mongoose.Types.ObjectId('660000000000000000000408'), bedNumber: 'DLX-302', ward: 'Private Deluxe', bedType: 'Private', status: 'AVAILABLE', currentPatient: null },
        { _id: new mongoose.Types.ObjectId('660000000000000000000409'), bedNumber: 'SEMI-401', ward: 'Semi-Private', bedType: 'Semi-Private', status: 'AVAILABLE', currentPatient: null },
        { _id: new mongoose.Types.ObjectId('660000000000000000000410'), bedNumber: 'SEMI-402', ward: 'Semi-Private', bedType: 'Semi-Private', status: 'MAINTENANCE', currentPatient: null }
    ];

    for (const b of beds) {
        await Bed.findByIdAndUpdate(
            b._id,
            { $set: { ...b, hospitalId: DEMO_HOSP_OBJ_ID } },
            { upsert: true, new: true }
        );
        await tenantModels.Bed.findByIdAndUpdate(
            b._id,
            { $set: { ...b, hospitalId: DEMO_HOSP_OBJ_ID } },
            { upsert: true, new: true }
        );
    }
    console.log(` ${beds.length} Beds seeded (4 Occupied, 5 Available, 1 Maintenance).`);

    // ─────────────────────────────────────────────────────────────
    // 7. SEED IPD ADMISSIONS
    // ─────────────────────────────────────────────────────────────
    console.log('\n[7/12] Seeding IPD Admissions...');
    const now = new Date();
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const admissions = [
        {
            _id: new mongoose.Types.ObjectId('660000000000000000000501'),
            patientId: patients[1]._id, // Sunita Devi
            doctorId: staffList[1].userId, // Dr. Vikram Joshi
            ward: 'General Ward',
            bedNumber: 'B-101',
            bedId: beds[0]._id,
            admissionDate: threeDaysAgo,
            admissionTime: '10:30 AM',
            wardRatePerDay: 800,
            status: 'Admitted',
            totalAmount: 4800,
            paymentStatus: 'Pending',
            notes: 'Admitted for acute exacerbation of COPD with pneumonia. IV antibiotics underway.'
        },
        {
            _id: new mongoose.Types.ObjectId('660000000000000000000502'),
            patientId: patients[3]._id, // Meera Nambiar
            doctorId: staffList[0].userId, // Dr. Sneha Iyer
            ward: 'General Ward',
            bedNumber: 'B-102',
            bedId: beds[1]._id,
            admissionDate: twoDaysAgo,
            admissionTime: '02:15 PM',
            wardRatePerDay: 800,
            status: 'Admitted',
            totalAmount: 6200,
            paymentStatus: 'Paid',
            notes: 'Congestive heart failure management. Vitals stabilizing, oral transition scheduled.'
        },
        {
            _id: new mongoose.Types.ObjectId('660000000000000000000503'),
            patientId: patients[6]._id, // Manoj Tiwari
            doctorId: staffList[0].userId, // Dr. Sneha Iyer
            ward: 'ICU',
            bedNumber: 'ICU-201',
            bedId: beds[4]._id,
            admissionDate: yesterday,
            admissionTime: '11:00 PM',
            wardRatePerDay: 3500,
            status: 'Admitted',
            totalAmount: 14500,
            paymentStatus: 'Pending',
            notes: 'Post-NSTEMI intensive cardiac observation. Continuous ECG and cardiac telemetry monitoring.'
        },
        {
            _id: new mongoose.Types.ObjectId('660000000000000000000504'),
            patientId: patients[5]._id, // Deepa Reddy
            doctorId: staffList[3].userId, // Dr. Rohan Verma
            ward: 'Private Deluxe',
            bedNumber: 'DLX-301',
            bedId: beds[6]._id,
            admissionDate: yesterday,
            admissionTime: '08:45 AM',
            wardRatePerDay: 2200,
            status: 'Admitted',
            totalAmount: 18000,
            paymentStatus: 'Paid',
            notes: 'Elective right knee arthroscopic repair. Post-op physiotherapy initiated.'
        }
    ];

    for (const adm of admissions) {
        await Admission.findByIdAndUpdate(
            adm._id,
            { $set: { ...adm, hospitalId: DEMO_HOSP_OBJ_ID } },
            { upsert: true, new: true }
        );
        await tenantModels.Admission.findByIdAndUpdate(
            adm._id,
            { $set: { ...adm, hospitalId: DEMO_HOSP_OBJ_ID } },
            { upsert: true, new: true }
        );

        // Update bed with current admission
        await Bed.findByIdAndUpdate(adm.bedId, { $set: { currentAdmission: adm._id } });
        await tenantModels.Bed.findByIdAndUpdate(adm.bedId, { $set: { currentAdmission: adm._id } });
    }
    console.log(` ${admissions.length} IPD Admissions seeded.`);

    // ─────────────────────────────────────────────────────────────
    // 8. SEED CLINICAL IPD DATA (VITALS, ORDERS, MAR, NURSING TASKS)
    // ─────────────────────────────────────────────────────────────
    console.log('\n[8/12] Seeding IPD Clinical Data (Vitals, Orders, MAR, Tasks)...');
    
    // Vitals records
    const vitalsRecords = [
        {
            _id: new mongoose.Types.ObjectId('660000000000000000000601'),
            admissionId: admissions[0]._id,
            patientId: admissions[0].patientId,
            recordedBy: staffList[4].userId,
            systolicBP: 128,
            diastolicBP: 82,
            pulse: 76,
            temperature: 98.6,
            spo2: 97,
            respiratoryRate: 18,
            painScore: 2,
            notes: 'Patient resting comfortably. Lung sounds clearing.'
        },
        {
            _id: new mongoose.Types.ObjectId('660000000000000000000602'),
            admissionId: admissions[2]._id,
            patientId: admissions[2].patientId,
            recordedBy: staffList[4].userId,
            systolicBP: 135,
            diastolicBP: 88,
            pulse: 82,
            temperature: 98.4,
            spo2: 99,
            respiratoryRate: 16,
            painScore: 1,
            notes: 'Normal sinus rhythm on telemetry. Pain free at rest.'
        }
    ];

    for (const v of vitalsRecords) {
        await IPDVitals.findByIdAndUpdate(
            v._id,
            { $set: { ...v, hospitalId: DEMO_HOSP_OBJ_ID, recordedAt: now } },
            { upsert: true, new: true }
        );
        await tenantModels.IPDVitals.findByIdAndUpdate(
            v._id,
            { $set: { ...v, hospitalId: DEMO_HOSP_OBJ_ID, recordedAt: now } },
            { upsert: true, new: true }
        );
    }

    // Inpatient Orders
    const orders = [
        {
            _id: new mongoose.Types.ObjectId('660000000000000000000701'),
            admissionId: admissions[0]._id,
            patientId: admissions[0].patientId,
            doctorId: staffList[1].userId,
            medicineName: 'Inj. Ceftriaxone 1g',
            dosageValue: 1,
            dosageUnit: 'g',
            route: 'IV',
            frequency: 'BD',
            duration: '5 days',
            instructions: 'Slow IV push in 100ml NS',
            clinicalNotes: 'Pneumonia therapy'
        },
        {
            _id: new mongoose.Types.ObjectId('660000000000000000000702'),
            admissionId: admissions[2]._id,
            patientId: admissions[2].patientId,
            doctorId: staffList[0].userId,
            medicineName: 'Tab. Telmisartan 40mg',
            dosageValue: 40,
            dosageUnit: 'mg',
            route: 'Oral',
            frequency: 'OD',
            duration: 'Continuous',
            instructions: 'Post-breakfast with water',
            clinicalNotes: 'Blood pressure control'
        }
    ];

    for (const o of orders) {
        await InpatientOrder.findByIdAndUpdate(
            o._id,
            { $set: { ...o, hospitalId: DEMO_HOSP_OBJ_ID, startDate: now } },
            { upsert: true, new: true }
        );
        await tenantModels.InpatientOrder.findByIdAndUpdate(
            o._id,
            { $set: { ...o, hospitalId: DEMO_HOSP_OBJ_ID, startDate: now } },
            { upsert: true, new: true }
        );
    }

    // MAR Records
    const marRecords = [
        {
            _id: new mongoose.Types.ObjectId('660000000000000000000801'),
            orderId: orders[0]._id,
            admissionId: admissions[0]._id,
            patientId: admissions[0].patientId,
            scheduledTime: new Date(Date.now() - 2 * 60 * 60 * 1000),
            administeredTime: new Date(Date.now() - 2 * 60 * 60 * 1000),
            administeredBy: staffList[4].userId,
            status: 'ADMINISTERED',
            actualDoseValue: 1,
            actualDoseUnit: 'g',
            notes: 'Infused over 20 mins without adverse event.'
        },
        {
            _id: new mongoose.Types.ObjectId('660000000000000000000802'),
            orderId: orders[1]._id,
            admissionId: admissions[2]._id,
            patientId: admissions[2].patientId,
            scheduledTime: new Date(Date.now() + 2 * 60 * 60 * 1000),
            status: 'SCHEDULED',
            actualDoseValue: 40,
            actualDoseUnit: 'mg',
            notes: 'Due at 2:00 PM.'
        }
    ];

    for (const m of marRecords) {
        await MARRecord.findByIdAndUpdate(
            m._id,
            { $set: { ...m, hospitalId: DEMO_HOSP_OBJ_ID } },
            { upsert: true, new: true }
        );
        await tenantModels.MARRecord.findByIdAndUpdate(
            m._id,
            { $set: { ...m, hospitalId: DEMO_HOSP_OBJ_ID } },
            { upsert: true, new: true }
        );
    }

    // Nursing Tasks
    const tasks = [
        {
            _id: new mongoose.Types.ObjectId('660000000000000000000901'),
            admissionId: admissions[0]._id,
            patientId: admissions[0].patientId,
            assignedTo: staffList[4].userId,
            taskType: 'VITALS_CHECK',
            title: 'Q4H Vitals & SpO2 Monitoring',
            description: 'Check pulse, blood pressure, temperature and pulse oximetry.',
            priority: 'HIGH',
            status: 'COMPLETED',
            scheduledAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
            completedAt: new Date(Date.now() - 2 * 60 * 60 * 1000)
        },
        {
            _id: new mongoose.Types.ObjectId('660000000000000000000902'),
            admissionId: admissions[2]._id,
            patientId: admissions[2].patientId,
            assignedTo: staffList[4].userId,
            taskType: 'POST_OP_MONITORING',
            title: 'Continuous ECG Strip Verification',
            description: 'Record 12-lead ECG rhythm strip and inspect ST segment.',
            priority: 'URGENT',
            status: 'IN_PROGRESS',
            scheduledAt: new Date(Date.now() + 30 * 60 * 1000)
        }
    ];

    for (const t of tasks) {
        await NursingTask.findByIdAndUpdate(
            t._id,
            { $set: { ...t, hospitalId: DEMO_HOSP_OBJ_ID } },
            { upsert: true, new: true }
        );
        await tenantModels.NursingTask.findByIdAndUpdate(
            t._id,
            { $set: { ...t, hospitalId: DEMO_HOSP_OBJ_ID } },
            { upsert: true, new: true }
        );
    }
    console.log(` Vitals, Inpatient Orders, MAR records and Nursing Tasks seeded.`);

    // ─────────────────────────────────────────────────────────────
    // 9. SEED APPOINTMENTS (TODAY, UPCOMING, PAST)
    // ─────────────────────────────────────────────────────────────
    console.log('\n[9/12] Seeding Appointments (Dynamic Today/Upcoming/Completed)...');
    const todayDate = new Date();
    todayDate.setHours(0, 0, 0, 0);

    const tomorrowDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
    tomorrowDate.setHours(0, 0, 0, 0);

    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
    pastDate.setHours(0, 0, 0, 0);

    const appointments = [
        // Today's Appointments
        {
            _id: new mongoose.Types.ObjectId('660000000000000000001001'),
            patientId: patients[0]._id,
            userId: patients[0]._id,
            doctorId: staffList[0].userId,
            doctorName: staffList[0].name,
            department: 'Cardiology',
            serviceName: 'Cardiology Consultation',
            appointmentDate: todayDate,
            date: todayDate,
            appointmentTime: '10:00 AM',
            time: '10:00 AM',
            tokenNumber: 1,
            fee: 800,
            amount: 800,
            paymentStatus: 'Paid',
            status: 'Completed',
            notes: 'Routine hypertension follow-up. BP 124/80. Well controlled.'
        },
        {
            _id: new mongoose.Types.ObjectId('660000000000000000001002'),
            patientId: patients[2]._id,
            userId: patients[2]._id,
            doctorId: staffList[1].userId,
            doctorName: staffList[1].name,
            department: 'General Medicine',
            serviceName: 'General Consultation',
            appointmentDate: todayDate,
            date: todayDate,
            appointmentTime: '11:30 AM',
            time: '11:30 AM',
            tokenNumber: 2,
            fee: 500,
            amount: 500,
            paymentStatus: 'Paid',
            status: 'Scheduled',
            notes: 'Seasonal viral flu and mild dry cough for 3 days.'
        },
        {
            _id: new mongoose.Types.ObjectId('660000000000000000001003'),
            patientId: patients[4]._id,
            userId: patients[4]._id,
            doctorId: staffList[2].userId,
            doctorName: staffList[2].name,
            department: 'Gynecology',
            serviceName: 'Antenatal Checkup',
            appointmentDate: todayDate,
            date: todayDate,
            appointmentTime: '02:00 PM',
            time: '02:00 PM',
            tokenNumber: 3,
            fee: 700,
            amount: 700,
            paymentStatus: 'Pending',
            status: 'Scheduled',
            notes: 'Second trimester ultrasound scan review.'
        },
        {
            _id: new mongoose.Types.ObjectId('660000000000000000001004'),
            patientId: patients[7]._id,
            userId: patients[7]._id,
            doctorId: staffList[3].userId,
            doctorName: staffList[3].name,
            department: 'Orthopedics',
            serviceName: 'Orthopedic Consultation',
            appointmentDate: todayDate,
            date: todayDate,
            appointmentTime: '03:30 PM',
            time: '03:30 PM',
            tokenNumber: 4,
            fee: 750,
            amount: 750,
            paymentStatus: 'Paid',
            status: 'Scheduled',
            notes: 'Lumbar spondylosis review, MRI lumbosacral spine.'
        },
        // Tomorrow / Upcoming Appointments
        {
            _id: new mongoose.Types.ObjectId('660000000000000000001005'),
            patientId: patients[0]._id,
            userId: patients[0]._id,
            doctorId: staffList[1].userId,
            doctorName: staffList[1].name,
            department: 'General Medicine',
            serviceName: 'Preventive Health Review',
            appointmentDate: tomorrowDate,
            date: tomorrowDate,
            appointmentTime: '09:30 AM',
            time: '09:30 AM',
            tokenNumber: 1,
            fee: 500,
            amount: 500,
            paymentStatus: 'Paid',
            status: 'Scheduled',
            notes: 'Annual corporate health checkup.'
        },
        {
            _id: new mongoose.Types.ObjectId('660000000000000000001006'),
            patientId: patients[7]._id,
            userId: patients[7]._id,
            doctorId: staffList[0].userId,
            doctorName: staffList[0].name,
            department: 'Cardiology',
            serviceName: 'Echocardiogram Review',
            appointmentDate: tomorrowDate,
            date: tomorrowDate,
            appointmentTime: '11:00 AM',
            time: '11:00 AM',
            tokenNumber: 2,
            fee: 800,
            amount: 800,
            paymentStatus: 'Pending',
            status: 'Scheduled',
            notes: 'Follow-up 2D Echo report discussion.'
        },
        // Past Completed Appointments
        {
            _id: new mongoose.Types.ObjectId('660000000000000000001007'),
            patientId: patients[1]._id,
            userId: patients[1]._id,
            doctorId: staffList[1].userId,
            doctorName: staffList[1].name,
            department: 'General Medicine',
            serviceName: 'Initial Consultation',
            appointmentDate: pastDate,
            date: pastDate,
            appointmentTime: '10:00 AM',
            time: '10:00 AM',
            tokenNumber: 1,
            fee: 500,
            amount: 500,
            paymentStatus: 'Paid',
            status: 'Completed',
            notes: 'Patient examined and subsequently admitted for pneumonia.'
        }
    ];

    for (const app of appointments) {
        await Appointment.findByIdAndUpdate(
            app._id,
            { $set: { ...app, hospitalId: DEMO_HOSP_OBJ_ID } },
            { upsert: true, new: true }
        );
        await tenantModels.Appointment.findByIdAndUpdate(
            app._id,
            { $set: { ...app, hospitalId: DEMO_HOSP_OBJ_ID } },
            { upsert: true, new: true }
        );
    }
    console.log(` ${appointments.length} Appointments seeded (Today's, Upcoming, Completed).`);

    // ─────────────────────────────────────────────────────────────
    // 10. SEED BILLING & FINANCIAL TRANSACTIONS
    // ─────────────────────────────────────────────────────────────
    console.log('\n[10/12] Seeding Billing & Financial Records...');
    const billingTxns = [
        {
            _id: new mongoose.Types.ObjectId('660000000000000000001101'),
            patientId: patients[0]._id,
            paymentMode: 'UPI',
            paymentStatus: 'Paid',
            amount: 800,
            transactionId: 'TXN-DEMO-UPI-001',
            upiId: 'aarav.sharma@okaxis',
            paymentDate: todayDate,
            description: 'Cardiology Consultation Fee - Dr. Sneha Iyer',
            addedBy: staffList[5].userId
        },
        {
            _id: new mongoose.Types.ObjectId('660000000000000000001102'),
            patientId: patients[2]._id,
            paymentMode: 'Cash',
            paymentStatus: 'Paid',
            amount: 500,
            transactionId: 'TXN-DEMO-CSH-002',
            paymentDate: todayDate,
            description: 'General Medicine Consultation Fee - Dr. Vikram Joshi',
            addedBy: staffList[5].userId
        },
        {
            _id: new mongoose.Types.ObjectId('660000000000000000001103'),
            patientId: patients[5]._id,
            paymentMode: 'Card',
            paymentStatus: 'Paid',
            amount: 18000,
            transactionId: 'TXN-DEMO-CRD-003',
            cardDetails: 'HDFC Bank Visa ending 4129',
            paymentDate: yesterday,
            description: 'IPD Knee Arthroscopy Advance & Package Deposit',
            addedBy: staffList[7].userId
        },
        {
            _id: new mongoose.Types.ObjectId('660000000000000000001104'),
            patientId: patients[3]._id,
            paymentMode: 'UPI',
            paymentStatus: 'Paid',
            amount: 6200,
            transactionId: 'TXN-DEMO-UPI-004',
            upiId: 'meera.nambiar@okhdfc',
            paymentDate: twoDaysAgo,
            description: 'IPD Ward Bed & Medical Management Settlement',
            addedBy: staffList[7].userId
        }
    ];

    for (const txn of billingTxns) {
        await PaymentTransaction.findByIdAndUpdate(
            txn._id,
            { $set: { ...txn, hospitalId: DEMO_HOSP_OBJ_ID } },
            { upsert: true, new: true }
        );
    }
    console.log(` ${billingTxns.length} Billing transactions seeded.`);

    // ─────────────────────────────────────────────────────────────
    // 11. SEED PHARMACY INVENTORY
    // ─────────────────────────────────────────────────────────────
    console.log('\n[11/12] Seeding Pharmacy & Clinical Inventory...');
    const inventoryItems = [
        { _id: new mongoose.Types.ObjectId('660000000000000000001201'), name: 'Paracetamol 650mg (Dolo)', category: 'Tablet', currentStock: 850, minStock: 200, unitPrice: 3.5, sellingPrice: 5.0, batchNumber: 'BAT-2026-A1', expiryDate: new Date('2028-12-31'), supplier: 'Cipla Ltd' },
        { _id: new mongoose.Types.ObjectId('660000000000000000001202'), name: 'Amoxicillin + Clavulanic Acid 625mg', category: 'Tablet', currentStock: 420, minStock: 100, unitPrice: 18.0, sellingPrice: 24.0, batchNumber: 'BAT-2026-A2', expiryDate: new Date('2027-10-31'), supplier: 'GlaxoSmithKline' },
        { _id: new mongoose.Types.ObjectId('660000000000000000001203'), name: 'Pantoprazole 40mg (Pan-40)', category: 'Tablet', currentStock: 620, minStock: 150, unitPrice: 8.5, sellingPrice: 12.0, batchNumber: 'BAT-2026-A3', expiryDate: new Date('2028-06-30'), supplier: 'Alkem Laboratories' },
        { _id: new mongoose.Types.ObjectId('660000000000000000001204'), name: 'Telmisartan 40mg (Telma)', category: 'Tablet', currentStock: 510, minStock: 120, unitPrice: 7.2, sellingPrice: 10.5, batchNumber: 'BAT-2026-A4', expiryDate: new Date('2028-04-30'), supplier: 'Glenmark' },
        { _id: new mongoose.Types.ObjectId('660000000000000000001205'), name: 'Atorvastatin 20mg (Atorva)', category: 'Tablet', currentStock: 340, minStock: 80, unitPrice: 14.0, sellingPrice: 19.5, batchNumber: 'BAT-2026-A5', expiryDate: new Date('2027-08-31'), supplier: 'Zydus Cadila' },
        { _id: new mongoose.Types.ObjectId('660000000000000000001206'), name: 'Ceftriaxone 1g Injection (Monocef)', category: 'Injectable', currentStock: 180, minStock: 50, unitPrice: 42.0, sellingPrice: 65.0, batchNumber: 'BAT-2026-I1', expiryDate: new Date('2027-11-30'), supplier: 'Aristo Pharma' },
        { _id: new mongoose.Types.ObjectId('660000000000000000001207'), name: 'Normal Saline (0.9% NaCl) 500ml', category: 'IV Fluid', currentStock: 220, minStock: 60, unitPrice: 30.0, sellingPrice: 45.0, batchNumber: 'BAT-2026-IV1', expiryDate: new Date('2029-01-31'), supplier: 'Baxter India' },
        { _id: new mongoose.Types.ObjectId('660000000000000000001208'), name: 'Low Stock Demo: Azithromycin 500mg', category: 'Tablet', currentStock: 12, minStock: 100, unitPrice: 22.0, sellingPrice: 32.0, batchNumber: 'BAT-2026-LOW1', expiryDate: new Date('2027-05-31'), supplier: 'Sun Pharma' },
        { _id: new mongoose.Types.ObjectId('660000000000000000001209'), name: 'Insulin Glargine (Lantus SoloStar)', category: 'Injectable', currentStock: 45, minStock: 25, unitPrice: 480.0, sellingPrice: 580.0, batchNumber: 'BAT-2026-INS1', expiryDate: new Date('2027-09-30'), supplier: 'Sanofi' },
        { _id: new mongoose.Types.ObjectId('660000000000000000001210'), name: 'Sterile Surgical Gloves (Size 7.5)', category: 'Consumable', currentStock: 1200, minStock: 300, unitPrice: 15.0, sellingPrice: 25.0, batchNumber: 'BAT-2026-GLV1', expiryDate: new Date('2030-01-31'), supplier: 'Kanam Latex' }
    ];

    for (const item of inventoryItems) {
        await Inventory.findByIdAndUpdate(
            item._id,
            {
                $set: {
                    ...item,
                    hospitalId: DEMO_HOSP_OBJ_ID,
                    status: item.currentStock <= item.minStock ? 'Low Stock' : 'In Stock'
                }
            },
            { upsert: true, new: true }
        );
    }
    console.log(` ${inventoryItems.length} Pharmacy inventory items seeded (including 1 low-stock item for widget demo).`);

    // ─────────────────────────────────────────────────────────────
    // 12. SEED PACKAGES & MASTER PROCEDURES
    // ─────────────────────────────────────────────────────────────
    console.log('\n[12/12] Seeding Hospital Care Packages...');
    const packages = [
        {
            _id: new mongoose.Types.ObjectId('660000000000000000001301'),
            name: 'Comprehensive Heart Checkup',
            code: 'PKG-CARD-01',
            department: 'Cardiology',
            price: 3499,
            durationDays: 1,
            description: 'Lipid profile, ECG, 2D Echocardiogram, TMT, and Senior Cardiologist consultation.',
            isActive: true
        },
        {
            _id: new mongoose.Types.ObjectId('660000000000000000001302'),
            name: 'Executive Whole Body Wellness',
            code: 'PKG-EXEC-02',
            department: 'General Medicine',
            price: 4999,
            durationDays: 1,
            description: '64 diagnostic parameters, Ultrasound Abdomen, Chest X-Ray, HbA1c, and Physician consultation.',
            isActive: true
        },
        {
            _id: new mongoose.Types.ObjectId('660000000000000000001303'),
            name: 'Maternity Antenatal Care Package',
            code: 'PKG-MAT-03',
            department: 'Gynecology',
            price: 18500,
            durationDays: 270,
            description: 'Complete 9-month prenatal care, 4 targeted ultrasounds, routine labs, and nutritional guidance.',
            isActive: true
        },
        {
            _id: new mongoose.Types.ObjectId('660000000000000000001304'),
            name: 'Orthopedic Joint Mobility Screening',
            code: 'PKG-ORTHO-04',
            department: 'Orthopedics',
            price: 2499,
            durationDays: 1,
            description: 'Bilateral knee/hip digital X-Rays, Serum Calcium, Vitamin D3, and Orthopedic Surgeon evaluation.',
            isActive: true
        }
    ];

    for (const pkg of packages) {
        await HospitalPackage.findByIdAndUpdate(
            pkg._id,
            { $set: { ...pkg, hospitalId: DEMO_HOSP_OBJ_ID } },
            { upsert: true, new: true }
        );
    }
    console.log(` ${packages.length} Care Packages seeded.`);

    console.log('\n====================================================');
    console.log('🎉 DEMO TENANT SEEDING COMPLETED SUCCESSFULLY!');
    console.log('====================================================');
    console.log(`Demo Hospital : ${DEMO_HOSPITAL_NAME} (ID: ${DEMO_HOSPITAL_ID})`);
    console.log(`Demo Email    : ${DEMO_EMAIL}`);
    console.log(`Demo Password : ${DEMO_PASSWORD}`);
    console.log('OTP Bypass    : Active ONLY for this demo account');
    console.log('Data State    : Persistent (NO auto-reset scheduled)');
    console.log('====================================================\n');

    await mongoose.disconnect();
    if (tenantDb) await tenantDb.close().catch(() => {});
}

if (require.main === module) {
    runSeed()
        .then(() => process.exit(0))
        .catch((err) => {
            console.error('\n❌ Error during demo seeding:', err);
            process.exit(1);
        });
}

module.exports = runSeed;
