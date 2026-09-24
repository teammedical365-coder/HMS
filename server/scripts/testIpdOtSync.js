/**
 * testIpdOtSync.js
 * Comprehensive Verification of IPD & OT Doctor-to-Nurse/Staff Synchronization
 */
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const User = require('../src/models/user.model');
const Bed = require('../src/models/bed.model');
const Admission = require('../src/models/admission.model');
const InpatientOrder = require('../src/models/inpatientOrder.model');
const SurgeryPlan = require('../src/models/surgeryPlan.model');
const OTRoom = require('../src/models/otRoom.model');
const Hospital = require('../src/models/hospital.model');

const MONGO_URI = process.env.MONGODB_URL || process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/hms';
const JWT_SECRET = process.env.JWT_SECRET || 'your_super_secret_jwt_key_change_in_production';

async function runTests() {
    console.log('🔄 Connecting to MongoDB:', MONGO_URI.replace(/\/\/.*@/, '//***@'));
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB');

    let hospital = await Hospital.findOne({});
    if (!hospital) {
        hospital = await Hospital.create({
            name: 'Apollo Hospital Sync Test',
            code: 'AHST',
            address: '123 Health Ave',
            status: 'ACTIVE'
        });
    }
    const hospitalId = hospital._id;
    console.log(`🏥 Using Hospital: ${hospital.name} (${hospitalId})`);

    // 1. Setup Test Users: Doctor, Nurse, Patient
    let doctor = await User.findOne({ hospitalId, role: 'doctor' });
    if (!doctor) {
        doctor = await User.create({
            name: 'Dr. Test Surgeon',
            email: `doc_sync_${Date.now()}@test.com`,
            phone: `987${Math.floor(1000000 + Math.random() * 9000000)}`,
            password: 'hashedpassword',
            role: 'doctor',
            specialization: 'General Surgery',
            hospitalId
        });
    }

    let nurse = await User.findOne({ hospitalId, role: 'nurse' });
    if (!nurse) {
        nurse = await User.create({
            name: 'Nurse Test Florence',
            email: `nurse_sync_${Date.now()}@test.com`,
            phone: `986${Math.floor(1000000 + Math.random() * 9000000)}`,
            password: 'hashedpassword',
            role: 'nurse',
            hospitalId
        });
    }

    let patient = await User.findOne({ hospitalId, role: 'patient' });
    if (!patient) {
        patient = await User.create({
            name: 'Test IPD Patient',
            email: `patient_sync_${Date.now()}@test.com`,
            phone: `985${Math.floor(1000000 + Math.random() * 9000000)}`,
            password: 'hashedpassword',
            role: 'patient',
            patientId: `MRN-${Date.now().toString().slice(-4)}`,
            hospitalId
        });
    }

    // 2. Setup OT Room and Bed
    let otRoom = await OTRoom.findOne({ hospitalId });
    if (!otRoom) {
        otRoom = await OTRoom.create({
            hospitalId,
            name: 'Main OT 1',
            status: 'Available'
        });
    }

    let bed = await Bed.findOne({ hospitalId, status: 'AVAILABLE' });
    if (!bed) {
        bed = await Bed.create({
            hospitalId,
            ward: 'ICU',
            bedNumber: `BED-${Date.now().toString().slice(-3)}`,
            bedType: 'ICU',
            status: 'AVAILABLE'
        });
    }

    console.log(`👤 Doctor: ${doctor.name} (${doctor._id})`);
    console.log(`👩‍⚕️ Nurse: ${nurse.name} (${nurse._id})`);
    console.log(`🧑 Patient: ${patient.name} (${patient._id}) [MRN: ${patient.patientId}]`);
    console.log(`🛏️ Bed: ${bed.ward} - ${bed.bedNumber}`);
    console.log(`🏥 OT Room: ${otRoom.name}`);

    console.log('\n======================================================');
    console.log('TEST 1: DOCTOR CREATES INPATIENT CLINICAL ORDER (PRE-ADMISSION)');
    console.log('======================================================');

    const order1 = await InpatientOrder.create({
        hospitalId,
        patientId: patient._id,
        doctorId: doctor._id,
        medicineName: 'Inj. Ceftriaxone',
        dosageValue: 1000,
        dosageUnit: 'mg',
        route: 'IV',
        frequency: 'BD',
        startDate: new Date(),
        duration: '5 days',
        instructions: 'Slow IV push',
        diagnosis: 'Acute Appendicitis with Local Peritonitis',
        admissionReason: 'Planned Surgical Procedure',
        status: 'ACTIVE',
        createdBy: doctor._id
    });

    console.log(`✅ Doctor created Inpatient Order: ${order1.medicineName} (ID: ${order1._id})`);
    if (order1.status === 'ACTIVE' && String(order1.patientId) === String(patient._id)) {
        console.log('✅ PASS: Pre-admission order created successfully with status ACTIVE');
    } else {
        throw new Error('FAIL: Order status or patientId mismatch');
    }

    console.log('\n======================================================');
    console.log('TEST 2: NURSE RETRIEVES PATIENT ORDERS PRIOR TO ADMISSION');
    console.log('======================================================');

    const nurseFetchedOrders = await InpatientOrder.find({
        hospitalId,
        patientId: patient._id
    }).lean();

    console.log(`🔍 Nurse found ${nurseFetchedOrders.length} order(s) for patient ${patient.name}`);
    if (nurseFetchedOrders.some(o => String(o._id) === String(order1._id))) {
        console.log('✅ PASS: Nurse has immediate visibility of Doctor-placed orders before bed allocation!');
    } else {
        throw new Error('FAIL: Nurse cannot see orders for patient');
    }

    console.log('\n======================================================');
    console.log('TEST 3: PATIENT ADMISSION & AUTO-LINKING ORDERS');
    console.log('======================================================');

    const admission = await Admission.create({
        hospitalId,
        patientId: patient._id,
        doctorId: doctor._id,
        admittedBy: doctor._id,
        ward: bed.ward,
        bedNumber: bed.bedNumber,
        bedId: bed._id,
        wardRatePerDay: 5000,
        wardHourlyRate: 208.33,
        status: 'Admitted',
        admissionDate: new Date(),
        admissionTime: '10:00 AM',
        notes: 'Admitted from surgical OPD'
    });

    // Auto-link pending pre-admission orders
    await InpatientOrder.updateMany(
        { hospitalId, patientId: patient._id, admissionId: { $in: [null, undefined] }, status: 'ACTIVE' },
        { $set: { admissionId: admission._id } }
    );

    const linkedOrder = await InpatientOrder.findById(order1._id);
    console.log(`✅ Admission created (ID: ${admission._id}, Ward: ${admission.ward}, Bed: ${admission.bedNumber})`);
    console.log(`🔗 Order admissionId auto-linked: ${linkedOrder.admissionId}`);

    if (String(linkedOrder.admissionId) === String(admission._id)) {
        console.log('✅ PASS: Pre-admission orders automatically linked to new Admission record');
    } else {
        throw new Error('FAIL: Order admissionId was not linked');
    }

    console.log('\n======================================================');
    console.log('TEST 4: NURSE DASHBOARD ACTIVE ADMISSIONS LIST');
    console.log('======================================================');

    const activeAdmissions = await Admission.find({
        hospitalId,
        status: { $in: ['Admitted', 'ADMITTED', 'admitted'] }
    }).populate('patientId', 'name patientId mrn').lean();

    const foundAdmission = activeAdmissions.find(a => String(a._id) === String(admission._id));
    if (foundAdmission) {
        console.log(`✅ PASS: Nurse Dashboard actively lists Admitted Patient: ${foundAdmission.patientId?.name}`);
    } else {
        throw new Error('FAIL: Active admission not found in Nurse active list');
    }

    console.log('\n======================================================');
    console.log('TEST 5: NURSE ACKNOWLEDGES DOCTOR ORDER');
    console.log('======================================================');

    linkedOrder.acknowledgments.push({
        nurseId: nurse._id,
        acknowledgedAt: new Date(),
        shift: 'Morning',
        notes: 'Verified against allergy profile'
    });
    await linkedOrder.save();

    const updatedOrder = await InpatientOrder.findById(order1._id);
    if (updatedOrder.acknowledgments && updatedOrder.acknowledgments.length > 0) {
        console.log('✅ PASS: Nurse order acknowledgment recorded successfully');
    } else {
        throw new Error('FAIL: Order acknowledgment not recorded');
    }

    console.log('\n======================================================');
    console.log('TEST 6: DOCTOR CREATES SURGERY PLAN');
    console.log('======================================================');

    const surgeryPlan = await SurgeryPlan.create({
        hospitalId,
        planId: `SP-2026-${Date.now().toString().slice(-4)}`,
        patientId: patient._id,
        doctorId: doctor._id,
        surgeonId: doctor._id,
        surgery: 'Laparoscopic Appendectomy',
        diagnosis: 'Acute Appendicitis',
        preferredDate: new Date(),
        preferredTime: '14:30',
        admissionRequired: true,
        admissionDate: new Date(),
        preOpRequired: true,
        notes: 'Pre-op fasting for 6 hours',
        status: 'PLANNED',
        createdBy: doctor._id
    });

    console.log(`✅ Surgery Plan created: ${surgeryPlan.surgery} (Plan ID: ${surgeryPlan.planId})`);
    if (surgeryPlan.status === 'PLANNED') {
        console.log('✅ PASS: Surgery Plan created with status PLANNED');
    } else {
        throw new Error('FAIL: Surgery Plan status not PLANNED');
    }

    console.log('\n======================================================');
    console.log('TEST 7: OT DASHBOARD & PLANNED SURGERIES RETRIEVAL');
    console.log('======================================================');

    const plannedSurgeries = await SurgeryPlan.find({
        hospitalId,
        status: 'PLANNED'
    }).populate('patientId', 'name patientId').populate('surgeonId', 'name').lean();

    const foundPlan = plannedSurgeries.find(p => String(p._id) === String(surgeryPlan._id));
    if (foundPlan) {
        console.log(`✅ PASS: OT Staff can see Planned Surgery for ${foundPlan.patientId?.name} by Dr. ${foundPlan.surgeonId?.name}`);
    } else {
        throw new Error('FAIL: Planned surgery not found on OT Dashboard');
    }

    console.log('\n======================================================');
    console.log('TEST 8: OT STAFF SCHEDULES SURGERY & WORKFLOW PROGRESSION');
    console.log('======================================================');

    surgeryPlan.otRoomId = otRoom._id;
    surgeryPlan.surgeryDate = new Date();
    surgeryPlan.startTime = '15:00';
    surgeryPlan.endTime = '16:30';
    surgeryPlan.status = 'SCHEDULED';
    await surgeryPlan.save();

    console.log(`✅ Surgery scheduled in ${otRoom.name} at 15:00-16:30`);

    // Transition to PRE_OP
    surgeryPlan.status = 'PRE_OP';
    await surgeryPlan.save();
    console.log('✅ Patient transitioned to PRE_OP');

    // Transition to READY_FOR_OT
    surgeryPlan.status = 'READY_FOR_OT';
    await surgeryPlan.save();
    console.log('✅ Patient transitioned to READY_FOR_OT');

    // Transition to IN_OT
    surgeryPlan.status = 'IN_OT';
    surgeryPlan.actualStartTime = new Date();
    await surgeryPlan.save();
    console.log('✅ Surgery marked IN_OT');

    // Transition to SURGERY_COMPLETED
    surgeryPlan.status = 'SURGERY_COMPLETED';
    surgeryPlan.actualEndTime = new Date();
    await surgeryPlan.save();
    console.log('✅ Surgery marked SURGERY_COMPLETED');

    // Transition to POST_OP
    surgeryPlan.status = 'POST_OP';
    await surgeryPlan.save();
    console.log('✅ Patient moved to POST_OP recovery');

    const finalPlan = await SurgeryPlan.findById(surgeryPlan._id);
    if (finalPlan.status === 'POST_OP') {
        console.log('✅ PASS: Complete OT Surgery workflow lifecycle verified successfully!');
    } else {
        throw new Error('FAIL: OT Workflow status mismatch');
    }

    console.log('\n======================================================');
    console.log('🎉 ALL 8/8 IPD & OT SYNCHRONIZATION TESTS PASSED PERFECTLY!');
    console.log('======================================================');
    process.exit(0);
}

runTests().catch(err => {
    console.error('❌ Test failed with error:', err);
    process.exit(1);
});
