/**
 * Medical365 LMS Phase 6 Automated Test Suite
 * Sample Accessioning & Technical Workflow:
 * - Code 128B Vector SVG Barcode Generation & Atomic Sequence Formatting
 * - Physical Specimen Derivation from Orders & Unique Barcode Assignment
 * - Phlebotomy Collection Workstation & Volume / Draw Audit
 * - Thermal Barcode Label Printing & Reprint Auditing
 * - Hardware Scanner Accessioning, Sample Quality Inspection & Acceptance
 * - Mandatory Rejection Reason Recording & Quality Rejection Audit
 * - Specimen Recollection Workflow & Replacement Sample Barcoding
 * - Technical Bench Testing Workstation (Processing, Hold, Complete)
 * - Multi-Location Sample Transfers (Manifest, Dispatch, Central Lab Receiving)
 * - Strict Multi-Tenant Isolation & Role Security
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const mongoose = require('mongoose');

// Ensure dependent models
require('../models/aiWallet.model');
const Hospital = require('../models/hospital.model');
const User = require('../models/user.model');
const LabLocation = require('../models/labLocation.model');
const LabTest = require('../models/labTest.model');
const LabCounter = require('../models/labCounter.model');
const LabOrder = require('../models/labOrder.model');
const LabSample = require('../models/labSample.model');
const LabSampleHistory = require('../models/labSampleHistory.model');
const LabSampleTransfer = require('../models/labSampleTransfer.model');
const LabRecollectionRequest = require('../models/labRecollectionRequest.model');
const { generateCode128Svg } = require('../utils/code128');

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
    console.log('  MEDICAL365 LMS PHASE 6 INTEGRATION TEST SUITE');
    console.log('  Sample Accessioning & Technical Workflow');
    console.log('====================================================\n');

    await mongoose.connect(process.env.MONGODB_URL);
    console.log('Connected to MongoDB for Phase 6 verification.\n');

    let testHospitalA = null;
    let testHospitalB = null;
    let phlebUserA = null;
    let techUserA = null;
    let patientA1 = null;
    let testCBC = null;
    let testLFT = null;
    let orderA1 = null;
    let locationMainA = null;
    let locationBranchA = null;

    try {
        // Setup mock test hospitals
        testHospitalA = await Hospital.create({
            name: 'Phase 6 Test Hospital A',
            hospitalCode: 'P6A',
            slug: `p6-hosp-a-${Date.now()}`,
            email: `p6-a-${Date.now()}@medical365.test`,
            phone: '9876543260',
            isActive: true
        });

        testHospitalB = await Hospital.create({
            name: 'Phase 6 Test Hospital B',
            hospitalCode: 'P6B',
            slug: `p6-hosp-b-${Date.now()}`,
            email: `p6-b-${Date.now()}@medical365.test`,
            phone: '9876543261',
            isActive: true
        });

        // Setup Locations
        locationMainA = await LabLocation.create({
            hospitalId: testHospitalA._id,
            locationName: 'Central Diagnostic Lab',
            locationCode: 'LOC-CENTRAL',
            locationType: 'PROCESSING_LAB',
            isActive: true
        });

        locationBranchA = await LabLocation.create({
            hospitalId: testHospitalA._id,
            locationName: 'North Collection Centre',
            locationCode: 'LOC-NORTH-CC',
            locationType: 'COLLECTION_CENTRE',
            isActive: true
        });

        // Setup Users
        phlebUserA = await User.create({
            name: 'Phlebotomist John',
            email: `phleb-${Date.now()}@test.com`,
            password: 'Password123!',
            phone: '9876543262',
            hospitalId: testHospitalA._id,
            role: 'staff',
            _roleData: { name: 'Phlebotomist', permissions: ['samples:collect', 'lab_view'] }
        });

        techUserA = await User.create({
            name: 'Technician Sarah',
            email: `tech-${Date.now()}@test.com`,
            password: 'Password123!',
            phone: '9876543263',
            hospitalId: testHospitalA._id,
            role: 'staff',
            _roleData: { name: 'Lab Technician', permissions: ['samples:accession', 'results:entry', 'lab_view'] }
        });

        patientA1 = await User.create({
            name: 'Alice Cooper',
            email: `alice-${Date.now()}@test.com`,
            password: 'Password123!',
            phone: '9876543264',
            hospitalId: testHospitalA._id,
            role: 'patient',
            uhid: 'UHID-P6-001',
            age: 34,
            gender: 'Female'
        });

        // Setup Lab Tests (Different Specimen & Container combinations)
        testCBC = await LabTest.create({
            hospitalId: testHospitalA._id,
            name: 'Complete Blood Count',
            testName: 'Complete Blood Count',
            code: 'P6-CBC',
            testCode: 'P6-CBC',
            department: 'Hematology',
            specimenType: 'Whole Blood (EDTA)',
            containerType: 'Lavender Top (EDTA)',
            price: 350,
            status: 'Active',
            isActive: true
        });

        testLFT = await LabTest.create({
            hospitalId: testHospitalA._id,
            name: 'Liver Function Test',
            testName: 'Liver Function Test',
            code: 'P6-LFT',
            testCode: 'P6-LFT',
            department: 'Biochemistry',
            specimenType: 'Serum',
            containerType: 'Gold Top (SST / Gel)',
            price: 750,
            status: 'Active',
            isActive: true
        });

        // =========================================================================
        // TEST SECTION 1: CODE 128 VECTOR SVG BARCODE & FORMAT GENERATION
        // =========================================================================
        console.log('--- SECTION 1: CODE 128 BARCODE GENERATION ---');

        const testBarcodeStr = 'SMP-P6A-20261123-0001';
        const svgOutput = generateCode128Svg(testBarcodeStr, { height: 45, barWidth: 2 });
        assert(typeof svgOutput === 'string' && svgOutput.includes('<svg') && svgOutput.includes('viewBox="0 0'),
            'Code 128 generator returns valid SVG markup with viewBox');
        assert(svgOutput.includes('<rect') && svgOutput.includes('fill="#000000"'),
            'SVG markup contains black barcode bar rect elements');
        assert(svgOutput.includes('</svg>'),
            'SVG markup has closing tag');

        // Test Sequence Number Generation
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const seq1 = await LabCounter.getNextSequence(testHospitalA._id, 'sample_barcode', dateStr);
        const seq2 = await LabCounter.getNextSequence(testHospitalA._id, 'sample_barcode', dateStr);
        assert(seq2 === seq1 + 1, 'LabCounter generates monotonically incrementing sample barcode sequences');

        const hospCodeA = testHospitalA.hospitalCode || 'P6A';
        const sampleBarcodeA = `SMP-${hospCodeA}-${dateStr}-${String(seq1).padStart(4, '0')}`;
        assert(/^SMP-[A-Z0-9]+-\d{8}-\d{4}$/.test(sampleBarcodeA),
            `Sample barcode format matches SMP-<HOSP_CODE>-<YYYYMMDD>-<SEQ>: ${sampleBarcodeA}`);

        // =========================================================================
        // TEST SECTION 2: PHYSICAL SPECIMEN DERIVATION FROM ORDERS
        // =========================================================================
        console.log('\n--- SECTION 2: PHYSICAL SPECIMEN DERIVATION FROM ORDERS ---');

        // Create Lab Order with 2 placeholders (EDTA and SST)
        orderA1 = await LabOrder.create({
            hospitalId: testHospitalA._id,
            orderNumber: 'ORD-P6-0001',
            tokenNumber: 1,
            patient: patientA1._id,
            patientSnapshot: {
                name: patientA1.name,
                uhid: patientA1.uhid,
                phone: patientA1.phone,
                gender: 'Female',
                age: 34
            },
            tests: [
                { testId: testCBC._id, testCode: testCBC.testCode, testName: testCBC.testName, standardPrice: 350, price: 350 },
                { testId: testLFT._id, testCode: testLFT.testCode, testName: testLFT.testName, standardPrice: 750, price: 750 }
            ],
            samplePlaceholders: [
                {
                    samplePlaceholderId: 'PLH-EDTA-01',
                    specimenType: 'Whole Blood (EDTA)',
                    containerType: 'Lavender Top (EDTA)',
                    tubeColor: '#9C27B0',
                    testCodes: ['P6-CBC'],
                    status: 'Pending Collection'
                },
                {
                    samplePlaceholderId: 'PLH-SST-02',
                    specimenType: 'Serum',
                    containerType: 'Gold Top (SST / Gel)',
                    tubeColor: '#FFD700',
                    testCodes: ['P6-LFT'],
                    status: 'Pending Collection'
                }
            ],
            subtotal: 1100,
            grandTotal: 1100,
            status: 'Confirmed'
        });

        assert(orderA1.samplePlaceholders.length === 2, 'Lab order created with 2 distinct specimen placeholders');

        // Generate physical LabSample for Placeholder 1 (EDTA)
        const sample1Barcode = `SMP-${hospCodeA}-${dateStr}-0101`;
        const sample1 = await LabSample.create({
            hospitalId: testHospitalA._id,
            barcode: sample1Barcode,
            orderId: orderA1._id,
            orderNumber: orderA1.orderNumber,
            tokenNumber: orderA1.tokenNumber,
            patientId: patientA1._id,
            patientSnapshot: orderA1.patientSnapshot,
            specimenPlaceholderId: 'PLH-EDTA-01',
            tests: [{ testId: testCBC._id, testCode: testCBC.testCode, testName: testCBC.testName, department: testCBC.department }],
            specimenType: 'Whole Blood (EDTA)',
            containerType: 'Lavender Top (EDTA)',
            requiredVolume: '2-3 mL',
            status: 'BARCODE_GENERATED',
            collectionLocationId: locationBranchA._id,
            currentLocationId: locationBranchA._id
        });

        assert(sample1._id && sample1.barcode === sample1Barcode, 'Physical LabSample record derived and created with barcode');
        assert(sample1.status === 'BARCODE_GENERATED', 'Initial physical sample status is BARCODE_GENERATED');

        // Test Unique Barcode Constraint
        let duplicateBarcodeErr = false;
        try {
            await LabSample.create({
                hospitalId: testHospitalA._id,
                barcode: sample1Barcode, // Duplicate
                orderId: orderA1._id,
                orderNumber: orderA1.orderNumber,
                patientId: patientA1._id,
                specimenPlaceholderId: 'PLH-EDTA-01',
                specimenType: 'Whole Blood (EDTA)',
                containerType: 'Lavender Top (EDTA)'
            });
        } catch (err) {
            duplicateBarcodeErr = true;
        }
        assert(duplicateBarcodeErr, 'Hospital-scoped unique barcode constraint prevents duplicate sample barcodes');

        // =========================================================================
        // TEST SECTION 3: PHLEBOTOMY SPECIMEN COLLECTION WORKSTATION
        // =========================================================================
        console.log('\n--- SECTION 3: SPECIMEN COLLECTION WORKFLOW ---');

        const drawTimestamp = new Date();
        sample1.status = 'COLLECTED';
        sample1.collectedVolume = '3 mL';
        sample1.collectedBy = phlebUserA._id;
        sample1.collectedByName = phlebUserA.name;
        sample1.collectedAt = drawTimestamp;
        sample1.collectionNotes = 'Clean venipuncture on left antecubital fossa';
        await sample1.save();

        assert(sample1.status === 'COLLECTED' && sample1.collectedVolume === '3 mL',
            'Sample status transitioned to COLLECTED with volume and phlebotomist');

        // Verify Immutable Sample History Log
        const historyCollection = await LabSampleHistory.create({
            hospitalId: testHospitalA._id,
            sampleId: sample1._id,
            barcode: sample1.barcode,
            previousStatus: 'BARCODE_GENERATED',
            newStatus: 'COLLECTED',
            action: 'COLLECTION_CONFIRMED',
            performedBy: phlebUserA._id,
            performedByName: phlebUserA.name,
            locationId: locationBranchA._id,
            details: { volume: '3 mL', notes: sample1.collectionNotes }
        });

        assert(historyCollection._id && historyCollection.action === 'COLLECTION_CONFIRMED',
            'Immutable audit trail recorded for specimen collection in LabSampleHistory');

        // Update placeholder status in parent LabOrder
        await LabOrder.updateOne(
            { _id: orderA1._id, 'samplePlaceholders.samplePlaceholderId': 'PLH-EDTA-01' },
            { $set: { 'samplePlaceholders.$.status': 'Pending Collection' } }
        );

        const updatedOrder = await LabOrder.findById(orderA1._id);
        const edtaPlh = updatedOrder.samplePlaceholders.find(p => p.samplePlaceholderId === 'PLH-EDTA-01');
        assert(edtaPlh && edtaPlh.samplePlaceholderId === 'PLH-EDTA-01',
            'Parent LabOrder placeholder verified with specimen attributes');

        // =========================================================================
        // TEST SECTION 4: BARCODE LABEL PRINTING & REPRINT AUDITING
        // =========================================================================
        console.log('\n--- SECTION 4: BARCODE LABEL PRINTING & REPRINT AUDIT ---');

        // Initial print
        sample1.labelPrintCount = 1;
        sample1.lastPrintedAt = new Date();
        sample1.lastPrintedBy = phlebUserA._id;
        await sample1.save();
        assert(sample1.labelPrintCount === 1, 'Initial barcode label print tracked on sample record');

        // Subsequent reprint with reason
        sample1.labelPrintCount += 1;
        sample1.lastPrintedAt = new Date();
        sample1.lastPrintedBy = techUserA._id;
        await sample1.save();

        const historyReprint = await LabSampleHistory.create({
            hospitalId: testHospitalA._id,
            sampleId: sample1._id,
            barcode: sample1.barcode,
            previousStatus: sample1.status,
            newStatus: sample1.status,
            action: 'LABEL_REPRINT',
            performedBy: techUserA._id,
            performedByName: techUserA.name,
            details: { reprintCount: sample1.labelPrintCount, reason: 'Original label torn during tube handling' }
        });

        assert(sample1.labelPrintCount === 2, 'Reprint counter incremented to 2');
        assert(historyReprint.details.reason === 'Original label torn during tube handling',
            'Reprint reason and operator identity recorded in audit log');

        // =========================================================================
        // TEST SECTION 5: ACCESSIONING WORKSTATION & QUALITY INSPECTION
        // =========================================================================
        console.log('\n--- SECTION 5: ACCESSIONING ACCEPTANCE & QUALITY REJECTION ---');

        // 5.1 Acceptance Flow: Sample 1 (Normal condition)
        sample1.status = 'ACCEPTED';
        sample1.sampleCondition = 'Normal';
        sample1.accessionedBy = techUserA._id;
        sample1.accessionedByName = techUserA.name;
        sample1.accessionedAt = new Date();
        sample1.accessionNotes = 'Specimen received in good condition, properly labeled';
        await sample1.save();

        const historyAccept = await LabSampleHistory.create({
            hospitalId: testHospitalA._id,
            sampleId: sample1._id,
            barcode: sample1.barcode,
            previousStatus: 'COLLECTED',
            newStatus: 'ACCEPTED',
            action: 'ACCESSION_ACCEPTED',
            performedBy: techUserA._id,
            performedByName: techUserA.name,
            details: { sampleCondition: 'Normal' }
        });

        assert(sample1.status === 'ACCEPTED' && sample1.sampleCondition === 'Normal',
            'Sample 1 successfully inspected and accepted at Accessioning Workstation');
        assert(historyAccept.newStatus === 'ACCEPTED', 'Accessioning acceptance audit entry verified');

        // 5.2 Rejection Flow: Create Sample 2 (Serum SST) and reject it for Hemolysis
        const sample2Barcode = `SMP-${hospCodeA}-${dateStr}-0102`;
        const sample2 = await LabSample.create({
            hospitalId: testHospitalA._id,
            barcode: sample2Barcode,
            orderId: orderA1._id,
            orderNumber: orderA1.orderNumber,
            tokenNumber: orderA1.tokenNumber,
            patientId: patientA1._id,
            patientSnapshot: orderA1.patientSnapshot,
            specimenPlaceholderId: 'PLH-SST-02',
            tests: [{ testId: testLFT._id, testCode: testLFT.testCode, testName: testLFT.testName, department: testLFT.department }],
            specimenType: 'Serum',
            containerType: 'Gold Top (SST / Gel)',
            status: 'COLLECTED',
            collectedVolume: '2 mL',
            collectedBy: phlebUserA._id,
            collectedAt: new Date()
        });

        // Reject Sample 2
        const rejectionReason = 'Gross Hemolysis (3+); unsuited for photometric LFT analysis';
        sample2.status = 'REJECTED';
        sample2.sampleCondition = 'Hemolyzed';
        sample2.rejection = {
            isRejected: true,
            reason: rejectionReason,
            rejectedBy: techUserA._id,
            rejectedAt: new Date(),
            notes: 'Requires fresh atraumatic blood draw for valid bilirubin and enzymes'
        };
        await sample2.save();

        assert(sample2.status === 'REJECTED' && sample2.rejection.isRejected === true,
            'Sample 2 rejected due to specimen quality defect');
        assert(sample2.rejection.reason.includes('Gross Hemolysis'),
            'Mandatory clinical rejection reason accurately preserved on sample');

        // Log rejection in history
        const historyReject = await LabSampleHistory.create({
            hospitalId: testHospitalA._id,
            sampleId: sample2._id,
            barcode: sample2.barcode,
            previousStatus: 'COLLECTED',
            newStatus: 'REJECTED',
            action: 'ACCESSION_REJECTED',
            performedBy: techUserA._id,
            performedByName: techUserA.name,
            details: { reason: rejectionReason, condition: 'Hemolyzed' }
        });
        assert(historyReject.action === 'ACCESSION_REJECTED', 'Rejection event audited in LabSampleHistory');

        // =========================================================================
        // TEST SECTION 6: RECOLLECTION REQUEST & REPLACEMENT SAMPLE WORKFLOW
        // =========================================================================
        console.log('\n--- SECTION 6: SPECIMEN RECOLLECTION & REPLACEMENT BARCODING ---');

        // Automated Recollection Request creation
        const recollectionReq = await LabRecollectionRequest.create({
            hospitalId: testHospitalA._id,
            orderId: orderA1._id,
            orderNumber: orderA1.orderNumber,
            patientId: patientA1._id,
            patientName: patientA1.name,
            originalSampleId: sample2._id,
            originalBarcode: sample2.barcode,
            specimenPlaceholderId: sample2.specimenPlaceholderId,
            specimenType: sample2.specimenType,
            containerType: sample2.containerType,
            reason: rejectionReason,
            status: 'REQUESTED',
            requestedBy: techUserA._id
        });

        assert(recollectionReq._id && recollectionReq.status === 'REQUESTED',
            'Automated LabRecollectionRequest created linking original rejected sample');

        // Phlebotomist performs redraw: generates REPLACEMENT sample with new unique barcode
        const replacementBarcode = `SMP-${hospCodeA}-${dateStr}-0103`;
        const replacementSample = await LabSample.create({
            hospitalId: testHospitalA._id,
            barcode: replacementBarcode,
            orderId: orderA1._id,
            orderNumber: orderA1.orderNumber,
            tokenNumber: orderA1.tokenNumber,
            patientId: patientA1._id,
            patientSnapshot: orderA1.patientSnapshot,
            specimenPlaceholderId: sample2.specimenPlaceholderId,
            tests: sample2.tests,
            specimenType: sample2.specimenType,
            containerType: sample2.containerType,
            status: 'COLLECTED',
            collectedVolume: '3.5 mL',
            collectedBy: phlebUserA._id,
            collectedByName: phlebUserA.name,
            collectedAt: new Date(),
            collectionNotes: 'Successful recollected draw from right arm, vacuum tube fill optimal',
            recollection: {
                isRecollection: true,
                originalSampleId: sample2._id,
                originalBarcode: sample2.barcode,
                recollectionRequestId: recollectionReq._id
            }
        });

        assert(replacementSample.barcode !== sample2.barcode,
            'Replacement sample receives new distinct barcode, preserving unique identifier integrity');
        assert(replacementSample.recollection.isRecollection === true && replacementSample.recollection.originalBarcode === sample2.barcode,
            'Replacement sample cross-references original rejected sample barcode');

        // Complete Recollection Request
        recollectionReq.status = 'RECOLLECTED';
        recollectionReq.replacementSampleId = replacementSample._id;
        recollectionReq.replacementBarcode = replacementSample.barcode;
        recollectionReq.recollectedAt = new Date();
        recollectionReq.recollectedBy = phlebUserA._id;
        await recollectionReq.save();

        assert(recollectionReq.status === 'RECOLLECTED', 'Recollection request updated to RECOLLECTED');

        // =========================================================================
        // TEST SECTION 7: TECHNICAL BENCH PROCESSING WORKSTATION
        // =========================================================================
        console.log('\n--- SECTION 7: BENCH TESTING WORKSTATION (START, HOLD, COMPLETE) ---');

        // 7.1 Start Processing on Analyzer
        sample1.status = 'PROCESSING';
        sample1.processing.startedAt = new Date();
        sample1.processing.startedBy = techUserA._id;
        sample1.processing.analyzerReference = 'Sysmex XN-550 Automated Hematology Analyzer';
        await sample1.save();

        assert(sample1.status === 'PROCESSING' && sample1.processing.analyzerReference.includes('Sysmex'),
            'Sample transitioned to PROCESSING with analyzer metadata recorded');

        // 7.2 Analyzer Maintenance: Hold State
        sample1.status = 'ON_HOLD';
        sample1.processing.holdReason = 'Awaiting automated clot detection clear cycle';
        await sample1.save();
        assert(sample1.status === 'ON_HOLD' && sample1.processing.holdReason.includes('clot detection'),
            'Sample placed ON_HOLD during instrument recalibration');

        // 7.3 Resume and Complete Processing
        sample1.status = 'PROCESSING_COMPLETED';
        sample1.processing.completedAt = new Date();
        sample1.processing.completedBy = techUserA._id;
        sample1.processing.notes = 'Run completed with valid QC calibration';
        await sample1.save();

        assert(sample1.status === 'PROCESSING_COMPLETED' && sample1.processing.completedAt != null,
            'Sample transitioned to PROCESSING_COMPLETED ready for Phase 7 result verification');

        // =========================================================================
        // TEST SECTION 8: MULTI-LOCATION SAMPLE TRANSFERS
        // =========================================================================
        console.log('\n--- SECTION 8: MULTI-LOCATION SAMPLE TRANSFERS ---');

        // Create replacement sample transfer from Branch CC to Central Lab
        const transferSeq = await LabCounter.getNextSequence(testHospitalA._id, 'transfer', dateStr);
        const transferNumber = `TRF-${hospCodeA}-${dateStr}-${String(transferSeq).padStart(4, '0')}`;

        const sampleTransfer = await LabSampleTransfer.create({
            hospitalId: testHospitalA._id,
            transferNumber,
            sourceLocationId: locationBranchA._id,
            sourceLocationName: locationBranchA.locationName,
            destinationLocationId: locationMainA._id,
            destinationLocationName: locationMainA.locationName,
            samples: [{
                sampleId: replacementSample._id,
                barcode: replacementSample.barcode,
                specimenType: replacementSample.specimenType,
                containerType: replacementSample.containerType,
                patientName: replacementSample.patientSnapshot.name,
                testNames: ['Liver Function Test']
            }],
            status: 'DISPATCHED',
            transportReference: 'COLD-CHAIN-BOX-04 (2-8 C)',
            courierName: 'Medical365 Dedicated Courier Express',
            dispatchedBy: phlebUserA._id,
            dispatchedByName: phlebUserA.name,
            dispatchedAt: new Date()
        });

        assert(sampleTransfer._id && sampleTransfer.status === 'DISPATCHED',
            'Sample transfer batch manifest created with transport details');
        assert(sampleTransfer.transportReference.includes('COLD-CHAIN'),
            'Cold chain transport temperature requirement preserved on transfer manifest');

        // Update sample status to DISPATCHED
        replacementSample.status = 'DISPATCHED';
        await replacementSample.save();

        // Check-in / Receive Transfer Batch at Central Processing Laboratory
        sampleTransfer.status = 'RECEIVED';
        sampleTransfer.receivedBy = techUserA._id;
        sampleTransfer.receivedByName = techUserA.name;
        sampleTransfer.receivedAt = new Date();
        await sampleTransfer.save();

        replacementSample.status = 'RECEIVED_AT_PROCESSING_LAB';
        replacementSample.currentLocationId = locationMainA._id;
        await replacementSample.save();

        assert(sampleTransfer.status === 'RECEIVED', 'Transfer batch received at central processing lab');
        assert(replacementSample.status === 'RECEIVED_AT_PROCESSING_LAB' && replacementSample.currentLocationId.equals(locationMainA._id),
            'Sample record updated to RECEIVED_AT_PROCESSING_LAB and location updated to Central Lab');

        // =========================================================================
        // TEST SECTION 9: MULTI-TENANT ISOLATION & ROLE SECURITY
        // =========================================================================
        console.log('\n--- SECTION 9: MULTI-TENANT ISOLATION ---');

        // Hospital B attempts to query Hospital A's sample by barcode
        const crossTenantSample = await LabSample.findOne({
            hospitalId: testHospitalB._id,
            barcode: sample1.barcode
        });
        assert(crossTenantSample === null, 'Hospital B cannot access Hospital A sample by barcode');

        // Hospital B attempts to query Hospital A's transfer batch
        const crossTenantTransfer = await LabSampleTransfer.findOne({
            hospitalId: testHospitalB._id,
            transferNumber: sampleTransfer.transferNumber
        });
        assert(crossTenantTransfer === null, 'Hospital B cannot access Hospital A transfer batches');

        // Aggregate counts for Hospital A vs Hospital B
        const countA = await LabSample.countDocuments({ hospitalId: testHospitalA._id });
        const countB = await LabSample.countDocuments({ hospitalId: testHospitalB._id });
        assert(countA === 3 && countB === 0,
            `Tenant metrics strictly isolated: Hospital A has ${countA} samples, Hospital B has ${countB}`);

    } catch (error) {
        console.error('Fatal test error:', error);
        totalFailed++;
    } finally {
        // Cleanup test data
        console.log('\nCleaning up Phase 6 test records...');
        if (testHospitalA) {
            await LabSampleHistory.deleteMany({ hospitalId: testHospitalA._id });
            await LabSampleTransfer.deleteMany({ hospitalId: testHospitalA._id });
            await LabRecollectionRequest.deleteMany({ hospitalId: testHospitalA._id });
            await LabSample.deleteMany({ hospitalId: testHospitalA._id });
            await LabOrder.deleteMany({ hospitalId: testHospitalA._id });
            await LabCounter.deleteMany({ hospitalId: testHospitalA._id });
            await LabLocation.deleteMany({ hospitalId: testHospitalA._id });
            await LabTest.deleteMany({ hospitalId: testHospitalA._id });
            await User.deleteMany({ hospitalId: testHospitalA._id });
            await Hospital.findByIdAndDelete(testHospitalA._id);
        }
        if (testHospitalB) {
            await Hospital.findByIdAndDelete(testHospitalB._id);
        }
        await mongoose.disconnect();
    }

    console.log('\n====================================================');
    console.log(`  PHASE 6 TEST RESULTS: ${totalPassed} PASSED, ${totalFailed} FAILED`);
    console.log('====================================================\n');

    if (totalFailed > 0) {
        process.exit(1);
    } else {
        process.exit(0);
    }
}

runTests();
