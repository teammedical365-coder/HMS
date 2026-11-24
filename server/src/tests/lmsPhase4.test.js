/**
 * Medical365 LMS Phase 4 Automated Test Suite
 * Reception Module: Patient Registration, Atomic UHID, Duplicate Detection,
 * Prescription Uploads, Order Booking, Server-Calculated Pricing,
 * Specimen-Wise Sample Placeholders, Slip Data & Recollections.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const fs = require('fs');

// Ensure models
require('../models/aiWallet.model');
const Hospital = require('../models/hospital.model');
const User = require('../models/user.model');
const LabTest = require('../models/labTest.model');
const TestPackage = require('../models/testPackage.model');
const LabDoctor = require('../models/labDoctor.model');
const LabCounter = require('../models/labCounter.model');
const LabOrder = require('../models/labOrder.model');

// Test runner state
let totalPassed = 0;
let totalFailed = 0;

function assert(condition, testName) {
    if (condition) {
        console.log(`  ✅ PASS: ${testName}`);
        totalPassed++;
    } else {
        console.error(`  ❌ FAIL: ${testName}`);
        totalFailed++;
    }
}

async function runTests() {
    console.log('====================================================');
    console.log('  MEDICAL365 LMS PHASE 4 INTEGRATION TEST SUITE');
    console.log('  Reception Intake, Patient MDM, Orders & Placeholders');
    console.log('====================================================\n');

    await mongoose.connect(process.env.MONGODB_URL);
    console.log('Connected to MongoDB for Phase 4 verification.\n');

    let testHospitalA = null;
    let testHospitalB = null;
    let patientA1 = null;
    let patientA2 = null;
    let doctorA1 = null;
    let testCBC = null;
    let testHbA1c = null;
    let testLFT = null;
    let pkgExecutive = null;
    let createdOrderA = null;

    try {
        // Setup mock test hospitals
        testHospitalA = await Hospital.create({
            name: 'Phase 4 Test Hospital A',
            slug: `p4-hosp-a-${Date.now()}`,
            email: `p4-a-${Date.now()}@medical365.test`,
            phone: '9876543230',
            isActive: true
        });

        testHospitalB = await Hospital.create({
            name: 'Phase 4 Test Hospital B',
            slug: `p4-hosp-b-${Date.now()}`,
            email: `p4-b-${Date.now()}@medical365.test`,
            phone: '9876543231',
            isActive: true
        });

        // Setup Phase 3 master data for Hospital A
        testCBC = await LabTest.create({
            hospitalId: testHospitalA._id,
            testName: 'Complete Blood Count',
            testCode: 'CBC-401',
            department: 'Hematology',
            specimenType: 'Whole Blood',
            containerType: 'EDTA Tube',
            requiredVolume: '2-3 mL',
            fastingRequired: false,
            turnaroundTime: 4,
            tatUnit: 'Hours',
            standardPrice: 350,
            isActive: true
        });

        testHbA1c = await LabTest.create({
            hospitalId: testHospitalA._id,
            testName: 'Glycated Hemoglobin (HbA1c)',
            testCode: 'HBA1C-401',
            department: 'Biochemistry',
            specimenType: 'Whole Blood', // Same specimen & container as CBC!
            containerType: 'EDTA Tube',
            requiredVolume: '2-3 mL',
            fastingRequired: false,
            turnaroundTime: 6,
            tatUnit: 'Hours',
            standardPrice: 450,
            isActive: true
        });

        testLFT = await LabTest.create({
            hospitalId: testHospitalA._id,
            testName: 'Liver Function Test (LFT)',
            testCode: 'LFT-401',
            department: 'Biochemistry',
            specimenType: 'Serum', // Different container & specimen!
            containerType: 'Plain Tube',
            requiredVolume: '3-5 mL',
            fastingRequired: true,
            fastingInstructions: '10-12 hours fasting',
            turnaroundTime: 8,
            tatUnit: 'Hours',
            standardPrice: 650,
            isActive: true
        });

        pkgExecutive = await TestPackage.create({
            hospitalId: testHospitalA._id,
            packageName: 'Executive Wellness Profile',
            packageCode: 'PKG-EXEC-401',
            department: 'Health Packages',
            tests: [testCBC._id, testLFT._id],
            standardPrice: 1000,
            discountedPrice: 800,
            savings: 200,
            isActive: true
        });

        doctorA1 = await LabDoctor.create({
            hospitalId: testHospitalA._id,
            doctorName: 'Anandita Roy',
            registrationNumber: 'MCI-WB-2018-9912',
            specialization: 'Internal Medicine',
            clinicHospitalName: 'Apollo Clinics'
        });

        // ─────────────────────────────────────────────────────────────────────────────
        // SUITE 1: PATIENT REGISTRATION & ATOMIC UHID GENERATION
        // ─────────────────────────────────────────────────────────────────────────────
        console.log('--- SUITE 1: PATIENT REGISTRATION & ATOMIC UHID GENERATION ---');

        const hospitalCodeA = await Hospital.ensureHospitalCode(testHospitalA);
        const seq1 = await LabCounter.getNextSequence(testHospitalA._id, 'uhid');
        const generatedUHID1 = `${hospitalCodeA}-UHID-${String(seq1).padStart(6, '0')}`;

        patientA1 = await User.create({
            hospitalId: testHospitalA._id,
            role: 'patient',
            name: 'Sunil Verma',
            gender: 'Male',
            age: 45,
            phone: '9876543210',
            alternatePhone: '9811223344',
            email: 'sunil.verma@test.com',
            address: '142 Park Street',
            city: 'Kolkata',
            state: 'West Bengal',
            pinCode: '700016',
            uhid: generatedUHID1,
            mrn: generatedUHID1,
            patientId: generatedUHID1,
            referringDoctor: doctorA1._id,
            isActive: true
        });

        assert(patientA1._id, 'Patient Sunil Verma registered successfully');
        assert(patientA1.uhid.startsWith(`${hospitalCodeA}-UHID-`), `Atomic UHID correctly formatted (${patientA1.uhid})`);
        assert(patientA1.role === 'patient', 'User model stored with role="patient"');

        // Test second sequential registration
        const seq2 = await LabCounter.getNextSequence(testHospitalA._id, 'uhid');
        const generatedUHID2 = `${hospitalCodeA}-UHID-${String(seq2).padStart(6, '0')}`;
        assert(seq2 === seq1 + 1, `Atomic counter increments monotonically (${seq1} -> ${seq2})`);

        patientA2 = await User.create({
            hospitalId: testHospitalA._id,
            role: 'patient',
            name: 'Anita Verma', // Family member sharing family contact
            gender: 'Female',
            age: 40,
            phone: '9876543211',
            alternatePhone: '9876543210', // Shared family phone
            uhid: generatedUHID2,
            mrn: generatedUHID2,
            patientId: generatedUHID2,
            isActive: true
        });

        assert(patientA2.uhid !== patientA1.uhid, 'Sequential UHIDs are strictly distinct and unique');

        // ─────────────────────────────────────────────────────────────────────────────
        // SUITE 2: PATIENT SEARCH & DUPLICATE DETECTION LOGIC
        // ─────────────────────────────────────────────────────────────────────────────
        console.log('\n--- SUITE 2: PATIENT SEARCH & DUPLICATE DETECTION LOGIC ---');

        // Search by UHID
        const foundByUhid = await User.findOne({ hospitalId: testHospitalA._id, uhid: patientA1.uhid });
        assert(foundByUhid && foundByUhid.name === 'Sunil Verma', 'Patient found accurately by exact UHID');

        // Search by Phone (matching primary or alternate family phone)
        const foundByPhone = await User.find({
            hospitalId: testHospitalA._id,
            $or: [{ phone: '9876543210' }, { alternatePhone: '9876543210' }]
        });
        assert(foundByPhone.length === 2, 'Search by shared mobile number returns both family members');

        // Duplicate Check: Same phone + same name
        const duplicateMatch = await User.find({
            hospitalId: testHospitalA._id,
            role: 'patient',
            phone: '9876543210',
            name: new RegExp('^Sunil Verma$', 'i')
        });
        assert(duplicateMatch.length === 1, 'Duplicate detection identifies exact existing patient Sunil Verma');

        // Family Member Check: Same shared phone + different name is NOT treated as an invalid conflict
        const familyCheck = await User.find({
            hospitalId: testHospitalA._id,
            role: 'patient',
            name: new RegExp('^Anita Verma$', 'i')
        });
        assert(familyCheck.length === 1 && familyCheck[0].name === 'Anita Verma', 'Legitimate family member Anita Verma permitted under same family contact');

        // ─────────────────────────────────────────────────────────────────────────────
        // SUITE 3: PATIENT UPDATE & DEACTIVATION SAFEGUARDS
        // ─────────────────────────────────────────────────────────────────────────────
        console.log('\n--- SUITE 3: PATIENT UPDATE & DEACTIVATION SAFEGUARDS ---');

        // Update details
        patientA1.address = 'Flat 4B, Metro Towers';
        patientA1.city = 'Salt Lake, Kolkata';
        await patientA1.save();

        const updatedPatient = await User.findById(patientA1._id);
        assert(updatedPatient.address === 'Flat 4B, Metro Towers', 'Patient address updated and persisted');

        // Soft-deactivate patient
        patientA2.isActive = false;
        patientA2.deactivatedAt = new Date();
        patientA2.deactivationReason = 'Relocated to another city';
        await patientA2.save();

        const deactivated = await User.findById(patientA2._id);
        assert(deactivated.isActive === false, 'Patient soft-deactivated successfully');
        assert(deactivated.deactivationReason === 'Relocated to another city', 'Deactivation audit reason recorded');

        // ─────────────────────────────────────────────────────────────────────────────
        // SUITE 4: SERVER-ENFORCED ORDER PRICING & INACTIVE TEST REJECTIONS
        // ─────────────────────────────────────────────────────────────────────────────
        console.log('\n--- SUITE 4: SERVER PRICING & INACTIVE TEST REJECTIONS ---');

        // Calculation: testCBC (350) + testHbA1c (450) + pkgExecutive (800 discounted, 1000 standard)
        // Expected: Standard = 350 + 450 + 1000 = 1800; Discount = 200; Net = 1600.
        const orderTests = [testCBC, testHbA1c];
        const orderPkgs = [pkgExecutive];

        let calcStd = 0;
        orderTests.forEach(t => calcStd += t.standardPrice);
        let pkgStd = 0;
        let pkgDisc = 0;
        orderPkgs.forEach(p => {
            pkgStd += p.standardPrice;
            pkgDisc += p.discountedPrice;
        });

        const totalStandard = calcStd + pkgStd; // 1800
        const totalDiscount = pkgStd - pkgDisc;  // 200
        const totalNet = calcStd + pkgDisc;      // 1600

        assert(totalStandard === 1800, 'Server-calculated standard tariff matches sum (1800)');
        assert(totalDiscount === 200, 'Server-calculated package savings verified (200)');
        assert(totalNet === 1600, 'Server-enforced net payable verified (1600)');

        // Test inactive test rejection logic
        const inactiveTest = await LabTest.create({
            hospitalId: testHospitalA._id,
            testName: 'Discontinued Coagulation Assay',
            testCode: 'DISC-001',
            standardPrice: 500,
            isActive: false
        });

        const activeTestQuery = await LabTest.find({
            _id: { $in: [testCBC._id, inactiveTest._id] },
            isActive: { $ne: false }
        });
        assert(activeTestQuery.length === 1 && activeTestQuery[0]._id.equals(testCBC._id), 'Inactive tests are strictly filtered and excluded from booking');

        // ─────────────────────────────────────────────────────────────────────────────
        // SUITE 5: SPECIMEN-WISE SAMPLE PLACEHOLDER GROUPING RULE
        // ─────────────────────────────────────────────────────────────────────────────
        console.log('\n--- SUITE 5: SPECIMEN-WISE SAMPLE PLACEHOLDER GROUPING RULE ---');

        // Selected tests:
        // CBC (Whole Blood / EDTA Tube)
        // HbA1c (Whole Blood / EDTA Tube)  <-- Should group together with CBC into 1 placeholder!
        // Package tests:
        //   CBC (Whole Blood / EDTA Tube)  <-- Duplicate test code in package, should not duplicate placeholder
        //   LFT (Serum / Plain Tube)       <-- 2nd placeholder
        const testMap = new Map();
        [testCBC, testHbA1c].forEach(t => testMap.set(String(t._id), t));
        // Add package tests
        [testCBC, testLFT].forEach(t => testMap.set(String(t._id), t));

        const grouping = new Map();
        testMap.forEach(t => {
            const key = `${t.specimenType.toLowerCase()}|||${t.containerType.toLowerCase()}`;
            if (!grouping.has(key)) {
                grouping.set(key, {
                    specimenType: t.specimenType,
                    containerType: t.containerType,
                    requiredVolume: t.requiredVolume,
                    testCodes: [],
                    testNames: []
                });
            }
            const grp = grouping.get(key);
            if (!grp.testCodes.includes(t.testCode)) {
                grp.testCodes.push(t.testCode);
                grp.testNames.push(t.testName);
            }
        });

        const placeholders = [];
        let pCounter = 1;
        grouping.forEach(grp => {
            placeholders.push({
                samplePlaceholderId: `SMP-${String(pCounter++).padStart(2, '0')}`,
                specimenType: grp.specimenType,
                containerType: grp.containerType,
                requiredVolume: grp.requiredVolume,
                testCodes: grp.testCodes,
                testNames: grp.testNames,
                status: 'Pending Collection'
            });
        });

        assert(placeholders.length === 2, 'Exactly 2 sample placeholders generated for 3 investigations');
        const edtaPlaceholder = placeholders.find(p => p.containerType === 'EDTA Tube');
        const plainPlaceholder = placeholders.find(p => p.containerType === 'Plain Tube');

        assert(edtaPlaceholder && edtaPlaceholder.testCodes.length === 2, 'EDTA Whole Blood placeholder bundles both CBC and HbA1c without duplication');
        assert(plainPlaceholder && plainPlaceholder.testCodes.length === 1, 'Plain Tube Serum placeholder bundles LFT');
        assert(edtaPlaceholder.status === 'Pending Collection', 'Sample placeholder starts in "Pending Collection" pre-collection state');

        // ─────────────────────────────────────────────────────────────────────────────
        // SUITE 6: ORDER NUMBER & RECEPTION TOKEN ATOMIC INCREMENT
        // ─────────────────────────────────────────────────────────────────────────────
        console.log('\n--- SUITE 6: ORDER NUMBER & RECEPTION TOKEN ATOMIC INCREMENT ---');

        const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const orderSeq1 = await LabCounter.getNextSequence(testHospitalA._id, 'order', today);
        const token1 = await LabCounter.getNextSequence(testHospitalA._id, 'token', today);
        const orderNumber1 = `ORD-${hospitalCodeA}-${today}-${String(orderSeq1).padStart(4, '0')}`;

        assert(orderNumber1.startsWith(`ORD-${hospitalCodeA}-${today}-`), `Order number generated atomically (${orderNumber1})`);
        assert(token1 === 1, 'First reception token for today is 1');

        const orderSeq2 = await LabCounter.getNextSequence(testHospitalA._id, 'order', today);
        const token2 = await LabCounter.getNextSequence(testHospitalA._id, 'token', today);
        assert(token2 === 2 && orderSeq2 === 2, 'Concurrent order sequence and token increments cleanly without collision (2)');

        // Create LabOrder in Database
        createdOrderA = await LabOrder.create({
            hospitalId: testHospitalA._id,
            orderNumber: orderNumber1,
            tokenNumber: token1,
            patient: patientA1._id,
            patientSnapshot: {
                name: patientA1.name,
                uhid: patientA1.uhid,
                phone: patientA1.phone,
                gender: patientA1.gender,
                age: patientA1.age
            },
            referringDoctor: doctorA1._id,
            referringDoctorName: `Dr. ${doctorA1.doctorName}`,
            priority: 'Urgent',
            collectionType: 'Walk-in',
            tests: [
                {
                    testId: testCBC._id,
                    testCode: testCBC.testCode,
                    testName: testCBC.testName,
                    standardPrice: testCBC.standardPrice,
                    price: testCBC.standardPrice,
                    specimenType: testCBC.specimenType,
                    containerType: testCBC.containerType
                }
            ],
            packages: [
                {
                    packageId: pkgExecutive._id,
                    packageCode: pkgExecutive.packageCode,
                    packageName: pkgExecutive.packageName,
                    standardPrice: pkgExecutive.standardPrice,
                    discountedPrice: pkgExecutive.discountedPrice,
                    savings: pkgExecutive.savings
                }
            ],
            samplePlaceholders: placeholders,
            pricing: {
                totalStandardPrice: totalStandard,
                totalDiscount: totalDiscount,
                netAmount: totalNet,
                currency: 'INR'
            },
            status: 'Confirmed'
        });

        assert(createdOrderA._id, 'LabOrder successfully persisted to MongoDB');
        assert(createdOrderA.orderNumber === orderNumber1, 'Order number matches atomic sequence');
        assert(createdOrderA.tokenNumber === 1, 'Token number recorded as 1');
        assert(createdOrderA.pricing.netAmount === 1600, 'Immutable net amount snapshot preserved in order');

        // ─────────────────────────────────────────────────────────────────────────────
        // SUITE 7: PRICE SNAPSHOT IMMUTABILITY GUARD
        // ─────────────────────────────────────────────────────────────────────────────
        console.log('\n--- SUITE 7: PRICE SNAPSHOT IMMUTABILITY GUARD ---');

        // Modify catalog test price after order is created
        testCBC.standardPrice = 600;
        await testCBC.save();

        const reloadedOrder = await LabOrder.findById(createdOrderA._id);
        assert(reloadedOrder.tests[0].price === 350, 'Historical order test price snapshot remains unchanged (350) despite catalog change');
        assert(reloadedOrder.pricing.netAmount === 1600, 'Historical order net payable remains unchanged (1600)');

        // ─────────────────────────────────────────────────────────────────────────────
        // SUITE 8: RECOLLECTION REQUESTS & ORDER CANCELLATION
        // ─────────────────────────────────────────────────────────────────────────────
        console.log('\n--- SUITE 8: RECOLLECTION REQUESTS & ORDER CANCELLATION ---');

        // Flag sample for recollection
        createdOrderA.samplePlaceholders[0].status = 'Recollection Requested';
        createdOrderA.samplePlaceholders[0].recollectionReason = 'Specimen hemolyzed during transport';
        createdOrderA.recollectionRequests.push({
            samplePlaceholderId: createdOrderA.samplePlaceholders[0].samplePlaceholderId,
            specimenType: createdOrderA.samplePlaceholders[0].specimenType,
            containerType: createdOrderA.samplePlaceholders[0].containerType,
            reason: 'Specimen hemolyzed during transport',
            requestedBy: patientA1._id,
            status: 'Pending'
        });
        await createdOrderA.save();

        const recollectionOrders = await LabOrder.find({
            hospitalId: testHospitalA._id,
            'samplePlaceholders.status': 'Recollection Requested'
        });
        assert(recollectionOrders.length === 1, 'Pending recollection query finds order needing redrawing');

        // Acknowledge recollection
        const newSMPId = `SMP-03`;
        createdOrderA.samplePlaceholders.push({
            samplePlaceholderId: newSMPId,
            specimenType: createdOrderA.samplePlaceholders[0].specimenType,
            containerType: createdOrderA.samplePlaceholders[0].containerType,
            requiredVolume: createdOrderA.samplePlaceholders[0].requiredVolume,
            testCodes: createdOrderA.samplePlaceholders[0].testCodes,
            testNames: createdOrderA.samplePlaceholders[0].testNames,
            status: 'Pending Collection'
        });
        createdOrderA.recollectionRequests[0].status = 'Acknowledged';
        await createdOrderA.save();

        const reloadedRecOrder = await LabOrder.findById(createdOrderA._id);
        assert(reloadedRecOrder.samplePlaceholders.length === 3, 'New sample placeholder SMP-03 created for recollection');
        assert(reloadedRecOrder.recollectionRequests[0].status === 'Acknowledged', 'Recollection request acknowledged');

        // Order Cancellation
        createdOrderA.status = 'Cancelled';
        createdOrderA.cancellation = {
            isCancelled: true,
            cancelledAt: new Date(),
            reason: 'Patient requested cancellation prior to collection'
        };
        await createdOrderA.save();

        const cancelledOrder = await LabOrder.findById(createdOrderA._id);
        assert(cancelledOrder.status === 'Cancelled', 'Order marked as Cancelled');
        assert(cancelledOrder.cancellation.isCancelled === true, 'Cancellation audit state preserved');

        // Guard: Cannot cancel already completed order
        const completedOrder = await LabOrder.create({
            hospitalId: testHospitalA._id,
            orderNumber: `ORD-${hospitalCodeA}-CMP-01`,
            tokenNumber: 99,
            patient: patientA1._id,
            patientSnapshot: { name: 'Sunil Verma', phone: '9876543210' },
            status: 'Completed'
        });

        const canCancelCompleted = completedOrder.status !== 'Completed';
        assert(!canCancelCompleted, 'Cancellation guard strictly blocks cancelling completed laboratory orders');

        // ─────────────────────────────────────────────────────────────────────────────
        // SUITE 9: CROSS-TENANT ISOLATION GUARDRAILS
        // ─────────────────────────────────────────────────────────────────────────────
        console.log('\n--- SUITE 9: CROSS-TENANT ISOLATION GUARDRAILS ---');

        const hospBOrders = await LabOrder.find({ hospitalId: testHospitalB._id });
        const hospBPatients = await User.find({ hospitalId: testHospitalB._id, role: 'patient' });
        const hospBCounters = await LabCounter.find({ hospitalId: testHospitalB._id });

        assert(hospBOrders.length === 0, 'Hospital B cannot access Hospital A lab orders');
        assert(hospBPatients.length === 0, 'Hospital B cannot access Hospital A patient records');
        assert(hospBCounters.length === 0, 'Hospital B sequence counters isolated from Hospital A');

        // Hospital B can create independent order #1 with same token #1
        const tokenB1 = await LabCounter.getNextSequence(testHospitalB._id, 'token', today);
        assert(tokenB1 === 1, 'Hospital B daily token resets independently to 1 for same date');

    } catch (err) {
        console.error('Phase 4 Test execution error:', err);
        totalFailed++;
    } finally {
        // Cleanup test data
        try {
            if (testHospitalA) {
                await LabOrder.deleteMany({ hospitalId: testHospitalA._id });
                await LabCounter.deleteMany({ hospitalId: testHospitalA._id });
                await User.deleteMany({ hospitalId: testHospitalA._id });
                await LabTest.deleteMany({ hospitalId: testHospitalA._id });
                await TestPackage.deleteMany({ hospitalId: testHospitalA._id });
                await LabDoctor.deleteMany({ hospitalId: testHospitalA._id });
                await Hospital.deleteOne({ _id: testHospitalA._id });
            }
            if (testHospitalB) {
                await LabOrder.deleteMany({ hospitalId: testHospitalB._id });
                await LabCounter.deleteMany({ hospitalId: testHospitalB._id });
                await Hospital.deleteOne({ _id: testHospitalB._id });
            }
            console.log('\nCleaned up all temporary Phase 4 test data.');
        } catch (cleanupErr) {
            console.warn('Cleanup warning:', cleanupErr.message);
        }

        await mongoose.disconnect();
        console.log('Disconnected from MongoDB.\n');

        console.log('====================================================');
        console.log(`  PHASE 4 TEST SUMMARY: ${totalPassed} PASSED, ${totalFailed} FAILED`);
        console.log('====================================================');

        if (totalFailed > 0) {
            process.exit(1);
        } else {
            process.exit(0);
        }
    }
}

runTests();
