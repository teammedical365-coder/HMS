/**
 * pacificDemoSeed.js — Strictly Tenant-Scoped, Idempotent Demo Data Seeder
 * Exclusively for Pacific Hospital (`slug: 'pacifichospital'`, `_id: 6aaa0637ca3e7fc08c0d1f57`).
 *
 * INVARIANTS:
 * - Never modifies or reads any other hospital tenant.
 * - Never deletes or overwrites existing hospital users, appointments, admissions, or billing.
 * - Safe & idempotent on repeated invocations across restarts/deploys.
 */
const mongoose = require('mongoose');
const Hospital = require('../models/hospital.model');
const User = require('../models/user.model');
const Doctor = require('../models/doctor.model');
const Role = require('../models/role.model');
const Appointment = require('../models/appointment.model');
const PaymentTransaction = require('../models/paymentTransaction.model');
const LabTest = require('../models/labTest.model');
const LabOrder = require('../models/labOrder.model');
const LabSample = require('../models/labSample.model');
const LabTestResult = require('../models/labTestResult.model');
const LabReport = require('../models/labReport.model');
const LabLocation = require('../models/labLocation.model');
const PharmacyOrder = require('../models/pharmacyOrder.model');
const { getTenantConnection } = require('../db/tenantDb');
const { getTenantModels } = require('../db/tenantModels');
const {
    PACIFIC_DEMO_SLUG,
    PACIFIC_DEMO_HOSPITAL_ID,
    PACIFIC_DEMO_ROLES,
    getPacificDemoSeedSecret
} = require('../config/pacificDemoConfig');

let seedPromise = null;
let lastSeedDateKey = null;

const FULL_WEEK_AVAILABILITY = {
    monday: { available: true, startTime: '09:00', endTime: '20:00' },
    tuesday: { available: true, startTime: '09:00', endTime: '20:00' },
    wednesday: { available: true, startTime: '09:00', endTime: '20:00' },
    thursday: { available: true, startTime: '09:00', endTime: '20:00' },
    friday: { available: true, startTime: '09:00', endTime: '20:00' },
    saturday: { available: true, startTime: '09:00', endTime: '18:00' },
    sunday: { available: true, startTime: '10:00', endTime: '14:00' }
};

function getTodayDateUtc() {
    const now = new Date();
    const y = now.getUTCFullYear();
    const m = String(now.getUTCMonth() + 1).padStart(2, '0');
    const d = String(now.getUTCDate()).padStart(2, '0');
    return { dateStr: `${y}-${m}-${d}`, midnightUtc: new Date(`${y}-${m}-${d}T00:00:00.000Z`) };
}

function getOffsetDateUtc(daysOffset) {
    const dt = new Date();
    dt.setUTCDate(dt.getUTCDate() + daysOffset);
    const y = dt.getUTCFullYear();
    const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const d = String(dt.getUTCDate()).padStart(2, '0');
    return { dateStr: `${y}-${m}-${d}`, midnightUtc: new Date(`${y}-${m}-${d}T00:00:00.000Z`) };
}

async function resolveRoleMap(hospitalId) {
    const roles = await Role.find({
        $or: [{ hospitalId }, { hospitalId: null }]
    }).lean();
    const map = new Map();
    for (const r of roles) {
        map.set(String(r.name).toLowerCase().trim(), r._id);
    }
    return map;
}

async function ensurePacificHospitalSeeded({ force = false } = {}) {
    const todayKey = getTodayDateUtc().dateStr;
    if (!force && lastSeedDateKey === todayKey) {
        return { skipped: true };
    }
    if (seedPromise) return seedPromise;

    seedPromise = (async () => {
        try {
            const hospital = await Hospital.findOne({
                _id: PACIFIC_DEMO_HOSPITAL_ID,
                slug: PACIFIC_DEMO_SLUG
            });
            if (!hospital) return { skipped: true, reason: 'Pacific Hospital tenant not found' };

            const hid = hospital._id;
            const roleMap = await resolveRoleMap(hid);
            const demoPassword = getPacificDemoSeedSecret();

            // 1. Ensure rich Departments & Fees on Pacific Hospital
            const desiredDepts = ['General', 'Oncology', 'Cardiology', 'Pediatrics', 'Gynecology & Obstetrics', 'Orthopedics', 'ENT', 'Neurology'];
            const mergedDepts = Array.from(new Set([...(hospital.departments || []), ...desiredDepts]));
            let hospitalDirty = false;
            if (mergedDepts.length !== (hospital.departments || []).length) {
                hospital.departments = mergedDepts;
                hospitalDirty = true;
            }
            const defaultFees = {
                General: 500, Oncology: 700, Cardiology: 800, Pediatrics: 550,
                'Gynecology & Obstetrics': 650, Orthopedics: 700, ENT: 600, Neurology: 750
            };
            if (!hospital.departmentFees) hospital.departmentFees = new Map();
            for (const [dept, fee] of Object.entries(defaultFees)) {
                if (!hospital.departmentFees.get(dept)) {
                    hospital.departmentFees.set(dept, fee);
                    hospitalDirty = true;
                }
            }
            if (!hospital.isDemoEnabled) {
                hospital.isDemoEnabled = true;
                hospitalDirty = true;
            }
            if (hospitalDirty) await hospital.save();

            // 2. Ensure the 5 core demo login accounts exist
            for (const spec of PACIFIC_DEMO_ROLES) {
                const existing = await User.findOne({ hospitalId: hid, email: spec.email });
                if (!existing) {
                    const roleVal = spec.userRoleField || roleMap.get(String(spec.roleLookupName || '').toLowerCase());
                    if (roleVal) {
                        await User.create({
                            hospitalId: hid,
                            name: spec.userName,
                            email: spec.email,
                            phone: spec.phone,
                            password: demoPassword,
                            role: roleVal,
                            isDemoAccount: true,
                            demoRoleKey: spec.roleKey,
                            isActive: true
                        });
                    }
                }
            }

            // 3. Ensure multiple realistic Doctors with full 7-day availability + non-zero fees
            const doctorRoleId = roleMap.get('doctor');
            const doctorsSeed = [
                {
                    email: 'demo.doctor@pacifichospital.medical365.in',
                    name: 'Dr. Ananya Deshmukh (Demo)',
                    phone: '9000001002',
                    specialty: 'Internal Medicine',
                    departments: ['General', 'Oncology'],
                    consultationFee: 600,
                    experience: '11 Years',
                    education: 'MBBS, MD (Internal Medicine)'
                },
                {
                    email: 'dr.kabir.malhotra@pacifichospital.medical365.in',
                    name: 'Dr. Kabir Malhotra',
                    phone: '9000002011',
                    specialty: 'Cardiology',
                    departments: ['Cardiology', 'General'],
                    consultationFee: 800,
                    experience: '14 Years',
                    education: 'MBBS, MD, DM (Cardiology)'
                },
                {
                    email: 'dr.meera.iyer@pacifichospital.medical365.in',
                    name: 'Dr. Meera Iyer',
                    phone: '9000002012',
                    specialty: 'Pediatrics',
                    departments: ['Pediatrics', 'General'],
                    consultationFee: 550,
                    experience: '9 Years',
                    education: 'MBBS, MD (Pediatrics)'
                },
                {
                    email: 'dr.kavita.sharma@pacifichospital.medical365.in',
                    name: 'Dr. Kavita Sharma',
                    phone: '9000002013',
                    specialty: 'Gynecology & Obstetrics',
                    departments: ['Gynecology & Obstetrics'],
                    consultationFee: 650,
                    experience: '12 Years',
                    education: 'MBBS, MS (OBG)'
                },
                {
                    email: 'dr.rohan.kapoor@pacifichospital.medical365.in',
                    name: 'Dr. Rohan Kapoor',
                    phone: '9000002014',
                    specialty: 'Orthopedics & Neurology',
                    departments: ['Orthopedics', 'Neurology'],
                    consultationFee: 700,
                    experience: '10 Years',
                    education: 'MBBS, MS (Ortho)'
                }
            ];

            for (const docSpec of doctorsSeed) {
                let docUser = await User.findOne({ hospitalId: hid, email: docSpec.email });
                if (!docUser && doctorRoleId) {
                    docUser = await User.create({
                        hospitalId: hid,
                        name: docSpec.name,
                        email: docSpec.email,
                        phone: docSpec.phone,
                        password: demoPassword,
                        role: doctorRoleId,
                        departments: docSpec.departments,
                        isActive: true
                    });
                }
                if (docUser) {
                    let docProfile = await Doctor.findOne({ hospitalId: hid, userId: docUser._id });
                    if (!docProfile) {
                        docProfile = await Doctor.create({
                            doctorId: `DOC-PCF-${String(docUser._id).slice(-5).toUpperCase()}`,
                            userId: docUser._id,
                            hospitalId: hid,
                            name: docSpec.name,
                            email: docSpec.email,
                            phone: docSpec.phone,
                            specialty: docSpec.specialty,
                            departments: docSpec.departments,
                            consultationFee: docSpec.consultationFee,
                            experience: docSpec.experience,
                            education: docSpec.education,
                            availability: FULL_WEEK_AVAILABILITY,
                            status: 'Active',
                            isAvailable: true
                        });
                    } else {
                        let dirty = false;
                        if (!docProfile.consultationFee || docProfile.consultationFee === 0) {
                            docProfile.consultationFee = docSpec.consultationFee;
                            dirty = true;
                        }
                        if (!docProfile.availability?.friday?.available || !docProfile.availability?.monday?.available) {
                            docProfile.availability = FULL_WEEK_AVAILABILITY;
                            dirty = true;
                        }
                        if (!Array.isArray(docProfile.departments) || docProfile.departments.length < docSpec.departments.length) {
                            docProfile.departments = Array.from(new Set([...(docProfile.departments || []), ...docSpec.departments]));
                            dirty = true;
                        }
                        if (dirty) await docProfile.save();
                    }
                }
            }

            // Ensure ALL existing Pacific doctors (like Ramesh Singh) have full 7-day availability so Reception can book anytime
            await Doctor.updateMany(
                { hospitalId: hid, 'availability.friday.available': { $ne: true } },
                { $set: { availability: FULL_WEEK_AVAILABILITY, status: 'Active', isAvailable: true } }
            );

            // 4. Ensure additional multi-department hospital staff (Reception, Lab Tech, Nurse, Pharmacist, Accountant)
            const staffSeeds = [
                { email: 'rahul.verma.rec@pacifichospital.medical365.in', name: 'Rahul Verma (Front Desk)', phone: '9000003001', roleKeyName: 'receptionist', departments: ['General'] },
                { email: 'neha.joshi.lab@pacifichospital.medical365.in', name: 'Neha Joshi (Lab Tech)', phone: '9000003002', roleKeyName: 'lab technician', departments: ['Pathology'] },
                { email: 'pooja.patel.nurse@pacifichospital.medical365.in', name: 'Pooja Patel (Head Nurse)', phone: '9000003003', roleKeyName: 'nurse', departments: ['ICU', 'General'] },
                { email: 'amit.saxena.acc@pacifichospital.medical365.in', name: 'Amit Saxena (Billing & Accounts)', phone: '9000003004', roleKeyName: 'accountant', departments: ['Billing'] },
                { email: 'kiran.bhatt.pharm@pacifichospital.medical365.in', name: 'Kiran Bhatt (Pharmacy Lead)', phone: '9000003005', roleKeyName: 'pharmacist', departments: ['Pharmacy'] }
            ];
            for (const st of staffSeeds) {
                const rid = roleMap.get(st.roleKeyName);
                if (!rid) continue;
                const exists = await User.findOne({ hospitalId: hid, email: st.email }).select('_id').lean();
                if (!exists) {
                    await User.create({
                        hospitalId: hid,
                        name: st.name,
                        email: st.email,
                        phone: st.phone,
                        password: demoPassword,
                        role: rid,
                        departments: st.departments,
                        isActive: true
                    });
                }
            }

            // 5. Ensure demo Patients exist in Pacific Hospital
            const patientSeeds = [
                { name: 'Aarav Sharma', phone: '9829001001', age: 34, gender: 'Male', bloodGroup: 'O+', mrn: 'PCF-M365-D01', city: 'Jaipur' },
                { name: 'PriyankaChoudhary', nameFix: 'Priyanka Choudhary', phone: '9829001002', age: 29, gender: 'Female', bloodGroup: 'A+', mrn: 'PCF-M365-D02', city: 'Jaipur' },
                { name: 'Rajeshwar Rathore', phone: '9829001003', age: 58, gender: 'Male', bloodGroup: 'B+', mrn: 'PCF-M365-D03', city: 'Ajmer' },
                { name: 'Sunita Agarwal', phone: '9829001004', age: 46, gender: 'Female', bloodGroup: 'AB+', mrn: 'PCF-M365-D04', city: 'Jaipur' },
                { name: 'Devansh Khandelwal', phone: '9829001005', age: 9, gender: 'Male', bloodGroup: 'O-', mrn: 'PCF-M365-D05', city: 'Kota' },
                { name: 'Nandini Kulkarni', phone: '9829001006', age: 37, gender: 'Female', bloodGroup: 'B-', mrn: 'PCF-M365-D06', city: 'Udaipur' }
            ];
            const demoPatients = [];
            for (const ps of patientSeeds) {
                let p = await User.findOne({ hospitalId: hid, $or: [{ patientId: ps.mrn }, { phone: ps.phone }] });
                if (!p) {
                    p = await User.create({
                        hospitalId: hid,
                        role: 'patient',
                        name: ps.nameFix || ps.name,
                        phone: ps.phone,
                        age: ps.age,
                        gender: ps.gender,
                        bloodGroup: ps.bloodGroup,
                        patientId: ps.mrn,
                        mrn: ps.mrn,
                        city: ps.city,
                        state: 'Rajasthan',
                        isActive: true
                    });
                }
                demoPatients.push(p);
            }

            // 6. Ensure Today's + Upcoming + Completed Per-Doctor Appointments & PaymentTransactions
            const { midnightUtc: todayDate } = getTodayDateUtc();
            const { midnightUtc: tomorrowDate } = getOffsetDateUtc(1);
            const allDoctors = await Doctor.find({ hospitalId: hid, status: { $ne: 'Inactive' } }).sort({ createdAt: 1 }).lean();
            const receptionUser = await User.findOne({ hospitalId: hid, email: 'demo.reception@pacifichospital.medical365.in' }).select('_id').lean();
            const addedBy = receptionUser?._id || hid;

            const appointmentPlans = [
                { docEmail: 'demo.doctor@pacifichospital.medical365.in', ptIdx: 0, date: todayDate, time: '10:00', token: 1, status: 'confirmed', dept: 'General', fee: 600, notes: 'Persistent mild fever & fatigue evaluation' },
                { docEmail: 'demo.doctor@pacifichospital.medical365.in', ptIdx: 1, date: todayDate, time: '10:30', token: 2, status: 'completed', dept: 'General', fee: 600, notes: 'Annual preventive health follow-up — vitals stable' },
                { docEmail: 'demo.doctor@pacifichospital.medical365.in', ptIdx: 2, date: tomorrowDate, time: '11:00', token: 3, status: 'confirmed', dept: 'General', fee: 600, notes: 'Follow-up hypertension and lipid profile review' },
                { docEmail: 'noreply.productr@gmail.com', ptIdx: 3, date: todayDate, time: '11:30', token: 1, status: 'confirmed', dept: 'Oncology', fee: 700, notes: 'Scheduled Oncology consultation' },
                { docEmail: 'dr.kabir.malhotra@pacifichospital.medical365.in', ptIdx: 2, date: todayDate, time: '12:00', token: 1, status: 'confirmed', dept: 'Cardiology', fee: 800, notes: 'ECG & Cardiology evaluation' },
                { docEmail: 'dr.meera.iyer@pacifichospital.medical365.in', ptIdx: 4, date: todayDate, time: '12:30', token: 1, status: 'confirmed', dept: 'Pediatrics', fee: 550, notes: 'Pediatric immunization & growth checkup' },
                { docEmail: 'dr.kavita.sharma@pacifichospital.medical365.in', ptIdx: 5, date: todayDate, time: '15:00', token: 1, status: 'completed', dept: 'Gynecology & Obstetrics', fee: 650, notes: 'Antenatal trimester wellness check' },
                { docEmail: 'dr.rohan.kapoor@pacifichospital.medical365.in', ptIdx: 0, date: tomorrowDate, time: '16:00', token: 1, status: 'confirmed', dept: 'Orthopedics', fee: 700, notes: 'Knee physiotherapy follow-up' }
            ];

            for (const plan of appointmentPlans) {
                const docObj = allDoctors.find((d) => String(d.email || '').toLowerCase() === plan.docEmail);
                const ptObj = demoPatients[plan.ptIdx];
                if (!docObj || !ptObj) continue;

                const exists = await Appointment.findOne({
                    hospitalId: hid,
                    doctorId: docObj._id,
                    appointmentDate: plan.date,
                    appointmentTime: plan.time,
                    status: { $ne: 'cancelled' }
                }).select('_id').lean();

                if (!exists) {
                    const createdAppt = await Appointment.create({
                        userId: ptObj._id,
                        hospitalId: hid,
                        patientId: ptObj.patientId || ptObj.mrn,
                        doctorId: docObj._id,
                        doctorUserId: docObj.userId,
                        doctorName: docObj.name,
                        serviceId: 'general',
                        serviceName: 'Walk-in Visit',
                        department: plan.dept,
                        visitType: 'New Consultation',
                        appointmentDate: plan.date,
                        appointmentTime: plan.time,
                        tokenNumber: plan.token,
                        amount: plan.fee,
                        status: plan.status,
                        paymentStatus: 'Paid',
                        paymentMethod: plan.token % 2 === 0 ? 'UPI' : 'Cash',
                        splitPayments: [{ method: plan.token % 2 === 0 ? 'UPI' : 'Cash', amount: plan.fee }],
                        notes: plan.notes,
                        vitals: { weight: '68 kg', height: '168 cm', bp: '120/80', pulse: '76 bpm', temperature: '98.4 F', spo2: '99%' },
                        bookedBy: addedBy
                    });

                    await PaymentTransaction.create({
                        hospitalId: hid,
                        patientId: ptObj._id,
                        paymentMode: plan.token % 2 === 0 ? 'UPI' : 'Cash',
                        paymentStatus: 'Paid',
                        amount: plan.fee,
                        splitPayments: [{ method: plan.token % 2 === 0 ? 'UPI' : 'Cash', amount: plan.fee }],
                        description: `OPD Consultation - ${docObj.name}`,
                        billedItems: { appointments: [createdAppt._id] },
                        addedBy
                    });
                }
            }

            // 7. Ensure Pacific Lab Location + Lab Test Catalog + Today's Orders, Samples, Results & Reports
            let labLoc = await LabLocation.findOne({ hospitalId: hid, isActive: true });
            if (labLoc && !labLoc.isProcessingLab) {
                labLoc.isProcessingLab = true;
                if (!labLoc.instruments?.length) {
                    labLoc.instruments = [{ name: 'Sysmex XN-550 Hematology Analyzer', instrumentCode: 'SYSMEX-01', department: 'Hematology', operationalStatus: 'ACTIVE' }];
                }
                await labLoc.save();
            }

            const cbcTest = await LabTest.findOne({ code: 'CBC' }).lean() || await LabTest.findOne({ isActive: { $ne: false } }).lean();
            const labStaff = await User.findOne({ hospitalId: hid, email: 'demo.lab@pacifichospital.medical365.in' }).select('_id name').lean();
            const todayTag = getTodayDateUtc().dateStr.replace(/-/g, '');
            const todayOrderNo1 = `ORD-PCF-${todayTag}-101`;
            const todayOrderNo2 = `ORD-PCF-${todayTag}-102`;

            if (cbcTest) {
                const ordersToSeed = [
                    { orderNumber: todayOrderNo1, patient: demoPatients[0], sampleStatus: 'PENDING_COLLECTION', orderStatus: 'Confirmed', barcode: `SMP-PCF-${todayTag}-101` },
                    { orderNumber: todayOrderNo2, patient: demoPatients[1], sampleStatus: 'PROCESSING', orderStatus: 'In Progress', barcode: `SMP-PCF-${todayTag}-102` }
                ];
                for (const oSpec of ordersToSeed) {
                    let ord = await LabOrder.findOne({ hospitalId: hid, orderNumber: oSpec.orderNumber });
                    if (!ord && oSpec.patient) {
                        ord = await LabOrder.create({
                            hospitalId: hid,
                            orderNumber: oSpec.orderNumber,
                            tokenNumber: 101,
                            patient: oSpec.patient._id,
                            patientSnapshot: {
                                name: oSpec.patient.name,
                                uhid: oSpec.patient.patientId || '',
                                mrn: oSpec.patient.mrn || oSpec.patient.patientId || '',
                                phone: oSpec.patient.phone || '9829001001',
                                gender: oSpec.patient.gender || 'Male',
                                age: oSpec.patient.age || 30
                            },
                            referringDoctorName: 'Dr. Ananya Deshmukh (Demo)',
                            prescribingDoctorUserId: allDoctors[0]?.userId || null,
                            sourceModule: 'HMS_RECEPTION',
                            priority: 'Routine',
                            collectionType: 'Walk-in',
                            locationId: labLoc?._id || null,
                            tests: [{
                                testId: cbcTest._id,
                                testCode: cbcTest.code || 'CBC',
                                testName: cbcTest.name || 'Complete Blood Count',
                                department: cbcTest.category || 'Hematology',
                                specimenType: 'Whole Blood',
                                containerType: 'EDTA Tube',
                                price: cbcTest.price || 400,
                                standardPrice: cbcTest.price || 400
                            }],
                            samplePlaceholders: [{
                                samplePlaceholderId: `PH-${oSpec.barcode}`,
                                specimenType: 'Whole Blood',
                                containerType: 'EDTA Tube',
                                testCodes: [cbcTest.code || 'CBC'],
                                testNames: [cbcTest.name || 'Complete Blood Count'],
                                status: 'Pending Collection'
                            }],
                            status: oSpec.orderStatus,
                            pricing: { subtotal: cbcTest.price || 400, netAmount: cbcTest.price || 400, paidAmount: cbcTest.price || 400, paymentStatus: 'PAID' },
                            createdBy: addedBy
                        });
                    }

                    if (ord) {
                        const sampExists = await LabSample.findOne({ hospitalId: hid, barcode: oSpec.barcode }).select('_id').lean();
                        if (!sampExists) {
                            await LabSample.create({
                                hospitalId: hid,
                                barcode: oSpec.barcode,
                                orderId: ord._id,
                                orderNumber: ord.orderNumber,
                                tokenNumber: ord.tokenNumber,
                                patientId: oSpec.patient._id,
                                patientSnapshot: ord.patientSnapshot,
                                specimenPlaceholderId: `PH-${oSpec.barcode}`,
                                tests: [{
                                    testId: cbcTest._id,
                                    testCode: cbcTest.code || 'CBC',
                                    testName: cbcTest.name || 'Complete Blood Count',
                                    department: cbcTest.category || 'Hematology'
                                }],
                                specimenType: 'Whole Blood',
                                containerType: 'EDTA Tube',
                                status: oSpec.sampleStatus,
                                collectionLocationId: labLoc?._id || null,
                                processingLocationId: labLoc?._id || null,
                                currentLocationId: labLoc?._id || null,
                                collectedBy: oSpec.sampleStatus === 'PROCESSING' ? (labStaff?._id || addedBy) : null,
                                collectedByName: oSpec.sampleStatus === 'PROCESSING' ? (labStaff?.name || 'Lab Staff') : '',
                                collectedAt: oSpec.sampleStatus === 'PROCESSING' ? new Date() : null
                            });
                        }
                    }
                }
            }

            // 8. Ensure at least one today's LabReport & PharmacyOrder & Tenant Bed/Admission exist
            const todayLegacyRepCount = await LabReport.countDocuments({
                hospitalId: hid,
                createdAt: { $gte: todayDate }
            });
            if (todayLegacyRepCount === 0 && demoPatients[1]) {
                await LabReport.create({
                    hospitalId: hid,
                    userId: demoPatients[1]._id,
                    patientId: demoPatients[1]._id,
                    patientName: demoPatients[1].name,
                    doctorId: allDoctors[0]?.userId || addedBy,
                    testName: 'Complete Blood Count (CBC)',
                    amount: 400,
                    paymentStatus: 'Paid',
                    reportStatus: 'RELEASED',
                    releasedAt: new Date()
                }).catch(() => {});
            }

            const rxCount = await PharmacyOrder.countDocuments({ hospitalId: hid });
            if (rxCount === 0 && demoPatients[0]) {
                await PharmacyOrder.create({
                    hospitalId: hid,
                    userId: demoPatients[0]._id,
                    patientId: demoPatients[0].patientId || demoPatients[0].mrn,
                    doctorId: allDoctors[0]?.userId || addedBy,
                    items: [{ name: 'Paracetamol 650mg', quantity: 10, price: 35, total: 35 }],
                    totalAmount: 35,
                    status: 'Completed',
                    paymentStatus: 'Paid'
                }).catch(() => {});
            }

            // Verify tenant DB has beds + admissions
            try {
                const tConn = await getTenantConnection(String(hid));
                if (tConn) {
                    const { Bed: TenantBed, Admission: TenantAdmission } = getTenantModels(tConn);
                    const bedCount = await TenantBed.countDocuments({ hospitalId: hid });
                    if (bedCount === 0) {
                        await TenantBed.create([
                            { hospitalId: hid, bedNumber: 'GW-101', ward: 'General Ward', bedType: 'General', status: 'OCCUPIED', dailyRate: 2000 },
                            { hospitalId: hid, bedNumber: 'GW-102', ward: 'General Ward', bedType: 'General', status: 'AVAILABLE', dailyRate: 2000 },
                            { hospitalId: hid, bedNumber: 'ICU-201', ward: 'ICU', bedType: 'ICU', status: 'OCCUPIED', dailyRate: 17000 }
                        ]).catch(() => {});
                    }
                    const admCount = await TenantAdmission.countDocuments({ hospitalId: hid, status: 'Admitted' });
                    if (admCount === 0 && demoPatients[2] && allDoctors[0]?.userId) {
                        await TenantAdmission.create({
                            hospitalId: hid,
                            patientId: demoPatients[2]._id,
                            doctorId: allDoctors[0].userId,
                            doctorName: allDoctors[0].name,
                            ward: 'General Ward',
                            bedNumber: 'GW-101',
                            admissionDate: todayDate,
                            status: 'Admitted',
                            admittedBy: addedBy
                        }).catch(() => {});
                    }
                }
            } catch (_) {}

            lastSeedDateKey = todayKey;
            return { seeded: true, hospitalId: String(hid) };
        } finally {
            seedPromise = null;
        }
    })();

    return seedPromise;
}

module.exports = { ensurePacificHospitalSeeded };
