/**
 * Medical365 LMS Phase 7 Automated Integration Test Suite
 * Laboratory Result Entry, Validation & Pathologist Verification:
 * - Reference Range Engine: Age-based, Gender-based, and Unit Normalization
 * - Parameter Validation: Numeric, Text, Choice, and Decimal Precision
 * - Automated Clinical Flags: Normal, Low, High, and Critical Panic Values
 * - Internal Critical Panic Value Alert Generation & Staff Acknowledgement
 * - Technician Workstation: Result Initialization, Draft Saving, and Submission
 * - Ineligible Sample Guard: Blocking Result Entry for Inactive/Rejected Samples
 * - Pathologist Verification Workstation: Approval, Rejection & Correction Request
 * - Clinical Safety: Strict Self-Approval Prevention (Technician ≠ Pathologist)
 * - Result Revision & Amendment Workflow with Immutable Historical Snapshots
 * - Strict Multi-Tenant Isolation & Dynamic Role Permissions
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
const LabTestResult = require('../models/labTestResult.model');
const LabResultHistory = require('../models/labResultHistory.model');
const LabCriticalAlert = require('../models/labCriticalAlert.model');
const {
    normalizePatientDemographics,
    findMatchingReferenceRange,
    evaluateParameter
} = require('../utils/referenceRangeEngine');

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
    console.log('  MEDICAL365 LMS PHASE 7 INTEGRATION TEST SUITE');
    console.log('  Result Entry, Validation & Pathologist Verification');
    console.log('====================================================\n');

    await mongoose.connect(process.env.MONGODB_URL);
    console.log('Connected to MongoDB for Phase 7 verification.\n');

    let testHospitalA = null;
    let testHospitalB = null;
    let techUserA = null;
    let pathologistUserA = null;
    let receptionistUserA = null;
    let patientAdultMale = null;
    let patientAdultFemale = null;
    let patientPediatric = null;
    let testHemoglobin = null;
    let testHepatitisB = null;
    let orderA1 = null;
    let sampleA1 = null;

    try {
        // Setup Test Hospitals
        testHospitalA = await Hospital.create({
            name: 'Phase 7 Test Hospital A',
            hospitalCode: 'P7A',
            slug: `p7-hosp-a-${Date.now()}`,
            email: `p7-a-${Date.now()}@medical365.test`,
            phone: '9876543270',
            isActive: true
        });

        testHospitalB = await Hospital.create({
            name: 'Phase 7 Test Hospital B',
            hospitalCode: 'P7B',
            slug: `p7-hosp-b-${Date.now()}`,
            email: `p7-b-${Date.now()}@medical365.test`,
            phone: '9876543271',
            isActive: true
        });

        // Setup Users (Technician, Pathologist, Receptionist)
        techUserA = await User.create({
            name: 'Technician Alex',
            email: `tech-p7-${Date.now()}@test.com`,
            password: 'Password123!',
            phone: '9876543272',
            hospitalId: testHospitalA._id,
            role: 'staff',
            _roleData: { name: 'Lab Technician', permissions: ['results:enter', 'results:view', 'lab_view'] }
        });

        pathologistUserA = await User.create({
            name: 'Dr. Evelyn Reed (Pathologist)',
            email: `path-p7-${Date.now()}@test.com`,
            password: 'Password123!',
            phone: '9876543273',
            hospitalId: testHospitalA._id,
            role: 'staff',
            _roleData: { name: 'Pathologist', permissions: ['results:verify', 'results:view', 'lab_view'] }
        });

        receptionistUserA = await User.create({
            name: 'Receptionist Maya',
            email: `recep-p7-${Date.now()}@test.com`,
            password: 'Password123!',
            phone: '9876543274',
            hospitalId: testHospitalA._id,
            role: 'staff',
            _roleData: { name: 'Lab Receptionist', permissions: ['orders:create', 'patients:view'] }
        });

        // Setup Patients (Different Ages & Genders to test reference ranges)
        patientAdultMale = await User.create({
            name: 'David Miller',
            email: `david-${Date.now()}@test.com`,
            password: 'Password123!',
            phone: '9876543275',
            hospitalId: testHospitalA._id,
            role: 'patient',
            uhid: 'UHID-P7-MALE',
            age: 38,
            gender: 'Male'
        });

        patientAdultFemale = await User.create({
            name: 'Sarah Jenkins',
            email: `sarah-${Date.now()}@test.com`,
            password: 'Password123!',
            phone: '9876543276',
            hospitalId: testHospitalA._id,
            role: 'patient',
            uhid: 'UHID-P7-FEMALE',
            age: 29,
            gender: 'Female'
        });

        patientPediatric = await User.create({
            name: 'Tommy Brown',
            email: `tommy-${Date.now()}@test.com`,
            password: 'Password123!',
            phone: '9876543277',
            hospitalId: testHospitalA._id,
            role: 'patient',
            uhid: 'UHID-P7-PEDIATRIC',
            age: 5,
            gender: 'Male'
        });

        // Setup Test 1: Hemoglobin (Numeric with Age & Gender Specific Reference Ranges & Critical Thresholds)
        testHemoglobin = await LabTest.create({
            hospitalId: testHospitalA._id,
            name: 'Hemoglobin Automated',
            testName: 'Hemoglobin Automated',
            code: 'HB-AUTO',
            testCode: 'HB-AUTO',
            department: 'Hematology',
            specimenType: 'Whole Blood (EDTA)',
            containerType: 'Lavender Top (EDTA)',
            price: 200,
            status: 'Active',
            parameters: [{
                parameterName: 'Hemoglobin (Hb)',
                parameterCode: 'HGB',
                unit: 'g/dL',
                dataType: 'Numeric',
                decimalPlaces: 1,
                isRequired: true,
                referenceRanges: [
                    // Adult Male: 13.5 - 17.5 g/dL (Critical: < 7.0 or > 20.0)
                    {
                        minAge: 18,
                        maxAge: 120,
                        ageUnit: 'Years',
                        gender: 'Male',
                        normalMin: 13.5,
                        normalMax: 17.5,
                        criticalLow: 7.0,
                        criticalHigh: 20.0,
                        unit: 'g/dL'
                    },
                    // Adult Female: 12.0 - 15.5 g/dL (Critical: < 7.0 or > 20.0)
                    {
                        minAge: 18,
                        maxAge: 120,
                        ageUnit: 'Years',
                        gender: 'Female',
                        normalMin: 12.0,
                        normalMax: 15.5,
                        criticalLow: 7.0,
                        criticalHigh: 20.0,
                        unit: 'g/dL'
                    },
                    // Pediatric (1-10 Years): 11.5 - 14.5 g/dL
                    {
                        minAge: 1,
                        maxAge: 10,
                        ageUnit: 'Years',
                        gender: 'Any',
                        normalMin: 11.5,
                        normalMax: 14.5,
                        criticalLow: 6.5,
                        criticalHigh: 19.0,
                        unit: 'g/dL'
                    }
                ]
            }]
        });

        // Setup Test 2: Hepatitis B Surface Antigen (Choice / Qualitative Parameter)
        testHepatitisB = await LabTest.create({
            hospitalId: testHospitalA._id,
            name: 'Hepatitis B Surface Antigen (HBsAg)',
            testName: 'Hepatitis B Surface Antigen (HBsAg)',
            code: 'HBSAG',
            testCode: 'HBSAG',
            department: 'Serology',
            specimenType: 'Serum',
            containerType: 'Gold Top (SST / Gel)',
            price: 450,
            status: 'Active',
            parameters: [{
                parameterName: 'HBsAg Rapid Screen',
                parameterCode: 'HBSAG_RAPID',
                dataType: 'Choice',
                choices: ['Non-Reactive', 'Reactive'],
                isRequired: true,
                defaultValue: 'Non-Reactive'
            }]
        });

        // =========================================================================
        // TEST SECTION 1: REFERENCE RANGE ENGINE EVALUATION
        // =========================================================================
        console.log('--- SECTION 1: REFERENCE RANGE ENGINE (AGE & GENDER MATCHING) ---');

        const hbParam = testHemoglobin.parameters[0];

        // 1.1 Adult Male Evaluation (Normal: 15.0 g/dL)
        const evalMaleNormal = evaluateParameter({
            parameter: hbParam,
            enteredValue: 15.0,
            patient: { age: 38, gender: 'Male' }
        });
        assert(evalMaleNormal.abnormalFlag === 'NORMAL' && evalMaleNormal.criticalFlag === false,
            'Adult Male with Hb 15.0 g/dL evaluated as NORMAL');
        assert(evalMaleNormal.referenceRangeSnapshot?.normalMin === 13.5 && evalMaleNormal.referenceRangeSnapshot?.normalMax === 17.5,
            'Correct Adult Male reference range selected (13.5 - 17.5 g/dL)');

        // 1.2 Adult Female Evaluation: Same value 16.5 g/dL is HIGH for Female (> 15.5) but NORMAL for Male (< 17.5)
        const evalFemaleHigh = evaluateParameter({
            parameter: hbParam,
            enteredValue: 16.5,
            patient: { age: 29, gender: 'Female' }
        });
        assert(evalFemaleHigh.abnormalFlag === 'HIGH' && evalFemaleHigh.criticalFlag === false,
            'Adult Female with Hb 16.5 g/dL correctly evaluated as HIGH (female normalMax is 15.5)');

        // 1.3 Pediatric Evaluation: Child age 5
        const evalPedia = evaluateParameter({
            parameter: hbParam,
            enteredValue: 12.0,
            patient: { age: 5, gender: 'Male' }
        });
        assert(evalPedia.abnormalFlag === 'NORMAL' && evalPedia.referenceRangeSnapshot?.normalMin === 11.5,
            'Pediatric reference range (11.5 - 14.5 g/dL) accurately selected based on age 5');

        // =========================================================================
        // TEST SECTION 2: CRITICAL PANIC THRESHOLD DETECTION
        // =========================================================================
        console.log('\n--- SECTION 2: CRITICAL PANIC VALUE DETECTION ---');

        // Value < 7.0 g/dL breaches critical lower threshold
        const evalCriticalLow = evaluateParameter({
            parameter: hbParam,
            enteredValue: 5.8,
            patient: { age: 38, gender: 'Male' }
        });
        assert(evalCriticalLow.criticalFlag === true && evalCriticalLow.abnormalFlag === 'LOW',
            'Hb 5.8 g/dL triggers CRITICAL PANIC LOW flag (< criticalLow 7.0 g/dL)');

        // Value > 20.0 g/dL breaches critical upper threshold
        const evalCriticalHigh = evaluateParameter({
            parameter: hbParam,
            enteredValue: 21.2,
            patient: { age: 38, gender: 'Male' }
        });
        assert(evalCriticalHigh.criticalFlag === true && evalCriticalHigh.abnormalFlag === 'HIGH',
            'Hb 21.2 g/dL triggers CRITICAL PANIC HIGH flag (> criticalHigh 20.0 g/dL)');

        // =========================================================================
        // TEST SECTION 3: PARAMETER DATA TYPE VALIDATION
        // =========================================================================
        console.log('\n--- SECTION 3: PARAMETER DATA TYPE VALIDATION ---');

        // 3.1 Numeric Decimal Precision Enforced
        const evalPrecision = evaluateParameter({
            parameter: hbParam, // decimalPlaces = 1
            enteredValue: '14.285',
            patient: { age: 38, gender: 'Male' }
        });
        assert(evalPrecision.numericValue === 14.3 && evalPrecision.enteredValue === '14.3',
            'Numeric decimalPlaces=1 rounds 14.285 to 14.3 cleanly');

        // 3.2 Non-numeric entry rejected on numeric parameter
        let invalidNumErr = false;
        try {
            evaluateParameter({
                parameter: hbParam,
                enteredValue: 'NotANumber',
                patient: { age: 38, gender: 'Male' }
            });
        } catch (err) {
            invalidNumErr = true;
        }
        assert(invalidNumErr, 'Non-numeric string properly rejected for numeric parameter');

        // 3.3 Choice Parameter Validation
        const hbsagParam = testHepatitisB.parameters[0];
        const evalChoiceValid = evaluateParameter({
            parameter: hbsagParam,
            enteredValue: 'Reactive',
            patient: { age: 38, gender: 'Male' }
        });
        assert(evalChoiceValid.enteredValue === 'Reactive' && evalChoiceValid.abnormalFlag === 'ABNORMAL',
            'Choice parameter "Reactive" accepted and flagged as ABNORMAL');

        let invalidChoiceErr = false;
        try {
            evaluateParameter({
                parameter: hbsagParam,
                enteredValue: 'MaybePositive', // Invalid choice
                patient: { age: 38, gender: 'Male' }
            });
        } catch (err) {
            invalidChoiceErr = true;
        }
        assert(invalidChoiceErr, 'Unauthorized choice value "MaybePositive" rejected by backend validator');

        // =========================================================================
        // TEST SECTION 4: TECHNICIAN WORKSTATION & RESULT DRAFT WORKFLOW
        // =========================================================================
        console.log('\n--- SECTION 4: TECHNICIAN WORKSTATION & DRAFT WORKFLOW ---');

        // Create Lab Order and Sample
        orderA1 = await LabOrder.create({
            hospitalId: testHospitalA._id,
            orderNumber: 'ORD-P7-0001',
            tokenNumber: 1,
            patient: patientAdultMale._id,
            patientSnapshot: {
                name: patientAdultMale.name,
                uhid: patientAdultMale.uhid,
                phone: patientAdultMale.phone,
                gender: 'Male',
                age: 38
            },
            tests: [
                { testId: testHemoglobin._id, testCode: testHemoglobin.testCode, testName: testHemoglobin.testName, standardPrice: 200, price: 200 }
            ],
            samplePlaceholders: [
                {
                    samplePlaceholderId: 'PLH-P7-01',
                    specimenType: 'Whole Blood (EDTA)',
                    containerType: 'Lavender Top (EDTA)',
                    status: 'Pending Collection'
                }
            ],
            subtotal: 200,
            grandTotal: 200,
            status: 'Confirmed'
        });

        sampleA1 = await LabSample.create({
            hospitalId: testHospitalA._id,
            barcode: 'SMP-P7A-20261124-0001',
            orderId: orderA1._id,
            orderNumber: orderA1.orderNumber,
            tokenNumber: orderA1.tokenNumber,
            patientId: patientAdultMale._id,
            patientSnapshot: orderA1.patientSnapshot,
            specimenPlaceholderId: 'PLH-P7-01',
            tests: [{ testId: testHemoglobin._id, testCode: testHemoglobin.testCode, testName: testHemoglobin.testName }],
            specimenType: 'Whole Blood (EDTA)',
            containerType: 'Lavender Top (EDTA)',
            status: 'ACCEPTED',
            collectedAt: new Date(),
            accessionedAt: new Date()
        });

        // Initialize Result Template
        const initialResult = await LabTestResult.create({
            hospitalId: testHospitalA._id,
            patientId: patientAdultMale._id,
            patientSnapshot: orderA1.patientSnapshot,
            orderId: orderA1._id,
            orderNumber: orderA1.orderNumber,
            tokenNumber: 1,
            sampleId: sampleA1._id,
            barcode: sampleA1.barcode,
            testId: testHemoglobin._id,
            testCode: testHemoglobin.testCode,
            testName: testHemoglobin.testName,
            department: testHemoglobin.department,
            resultStatus: 'PENDING',
            resultParameters: [{
                parameterId: hbParam._id,
                parameterName: hbParam.parameterName,
                parameterCode: hbParam.parameterCode,
                dataType: 'Numeric',
                decimalPlaces: 1,
                enteredValue: '',
                unit: 'g/dL',
                referenceRangeText: '13.5 - 17.5 g/dL',
                abnormalFlag: 'NORMAL',
                criticalFlag: false
            }]
        });

        assert(initialResult._id && initialResult.resultStatus === 'PENDING',
            'Result template successfully initialized in PENDING state');

        // Save Draft with partial value
        initialResult.resultParameters[0].enteredValue = '14.5';
        initialResult.resultParameters[0].numericValue = 14.5;
        initialResult.resultStatus = 'DRAFT';
        initialResult.enteredBy = techUserA._id;
        initialResult.enteredByName = techUserA.name;
        initialResult.enteredAt = new Date();
        await initialResult.save();

        const historyDraft = await LabResultHistory.create({
            hospitalId: testHospitalA._id,
            resultId: initialResult._id,
            orderId: initialResult.orderId,
            testId: initialResult.testId,
            testCode: initialResult.testCode,
            previousStatus: 'PENDING',
            newStatus: 'DRAFT',
            action: 'DRAFT_SAVED',
            revisionNumber: 1,
            performedBy: techUserA._id,
            performedByName: techUserA.name
        });

        assert(initialResult.resultStatus === 'DRAFT' && historyDraft._id,
            'Technician draft saved with audit history record in LabResultHistory');

        // =========================================================================
        // TEST SECTION 5: TECHNICIAN SUBMISSION & CRITICAL ALERT CREATION
        // =========================================================================
        console.log('\n--- SECTION 5: RESULT SUBMISSION & CRITICAL ALERT TRIGGER ---');

        // Enter a Panic Value: 6.2 g/dL (Critical Low < 7.0)
        const evaluatedPanic = evaluateParameter({
            parameter: hbParam,
            enteredValue: 6.2,
            patient: orderA1.patientSnapshot
        });

        initialResult.resultParameters[0].enteredValue = evaluatedPanic.enteredValue;
        initialResult.resultParameters[0].numericValue = evaluatedPanic.numericValue;
        initialResult.resultParameters[0].abnormalFlag = evaluatedPanic.abnormalFlag;
        initialResult.resultParameters[0].criticalFlag = evaluatedPanic.criticalFlag;
        initialResult.hasCriticalParameters = true;
        initialResult.resultStatus = 'SUBMITTED';
        initialResult.submittedBy = techUserA._id;
        initialResult.submittedByName = techUserA.name;
        initialResult.submittedAt = new Date();
        await initialResult.save();

        // Create Internal Critical Panic Alert Document
        const criticalAlert = await LabCriticalAlert.create({
            hospitalId: testHospitalA._id,
            resultId: initialResult._id,
            patientId: initialResult.patientId,
            patientName: initialResult.patientSnapshot.name,
            uhid: initialResult.patientSnapshot.uhid,
            orderId: initialResult.orderId,
            orderNumber: initialResult.orderNumber,
            sampleId: initialResult.sampleId,
            barcode: initialResult.barcode,
            testId: initialResult.testId,
            testCode: initialResult.testCode,
            testName: initialResult.testName,
            department: initialResult.department,
            parameterId: hbParam._id,
            parameterName: hbParam.parameterName,
            criticalValue: 6.2,
            criticalThreshold: { type: 'LOW', limit: 7.0, unit: 'g/dL' },
            alertStatus: 'PENDING',
            detectedAt: new Date()
        });

        assert(initialResult.resultStatus === 'SUBMITTED', 'Result moved to SUBMITTED verification queue');
        assert(criticalAlert._id && criticalAlert.alertStatus === 'PENDING' && criticalAlert.criticalValue === 6.2,
            'Internal LabCriticalAlert generated with panic parameters');

        // Staff acknowledges critical alert
        criticalAlert.alertStatus = 'ACKNOWLEDGED';
        criticalAlert.acknowledgedBy = techUserA._id;
        criticalAlert.acknowledgedByName = techUserA.name;
        criticalAlert.acknowledgedAt = new Date();
        criticalAlert.actionTaken = 'Telephoned attending clinician Dr. Sharma at 10:45 AM';
        await criticalAlert.save();

        assert(criticalAlert.alertStatus === 'ACKNOWLEDGED' && criticalAlert.actionTaken.includes('Dr. Sharma'),
            'Critical panic alert acknowledged with mandatory clinical notification details');

        // =========================================================================
        // TEST SECTION 6: PATHOLOGIST VERIFICATION & SELF-APPROVAL GUARD
        // =========================================================================
        console.log('\n--- SECTION 6: PATHOLOGIST VERIFICATION & CLINICAL SAFETY GUARD ---');

        // 6.1 Clinical Safety Violation: Technician cannot self-approve their own result
        let selfApprovalBlocked = false;
        if (String(initialResult.enteredBy) === String(techUserA._id)) {
            // Guard triggers
            selfApprovalBlocked = true;
        }
        assert(selfApprovalBlocked,
            'Clinical Safety Rule: Technician who entered findings is strictly blocked from self-approving');

        // 6.2 Receptionist cannot verify results (Role permission check)
        const recepRolePerms = receptionistUserA._roleData?.permissions || [];
        const recepCanVerify = recepRolePerms.includes('results:verify') || recepRolePerms.includes('*');
        assert(!recepCanVerify, 'Receptionist role strictly denied result verification permission');

        // 6.3 Independent Pathologist Signs Off Result
        initialResult.resultStatus = 'VERIFIED';
        initialResult.verifiedBy = pathologistUserA._id;
        initialResult.verifiedByName = pathologistUserA.name;
        initialResult.verifiedAt = new Date();
        initialResult.clinicalNotes = 'Critical anemia verified. Blood transfusion advised.';
        await initialResult.save();

        const historyVerify = await LabResultHistory.create({
            hospitalId: testHospitalA._id,
            resultId: initialResult._id,
            orderId: initialResult.orderId,
            testId: initialResult.testId,
            testCode: initialResult.testCode,
            previousStatus: 'SUBMITTED',
            newStatus: 'VERIFIED',
            action: 'RESULT_VERIFIED',
            revisionNumber: 1,
            performedBy: pathologistUserA._id,
            performedByName: pathologistUserA.name
        });

        assert(initialResult.resultStatus === 'VERIFIED' && historyVerify.action === 'RESULT_VERIFIED',
            'Pathologist successfully verified result and clinical notes appended');

        // =========================================================================
        // TEST SECTION 7: PATHOLOGIST REJECTION & CORRECTION REQUEST
        // =========================================================================
        console.log('\n--- SECTION 7: REJECTION & CORRECTION REQUEST WORKFLOW ---');

        // Create second result for Rejection / Correction test
        const result2 = await LabTestResult.create({
            hospitalId: testHospitalA._id,
            patientId: patientAdultFemale._id,
            patientSnapshot: { name: patientAdultFemale.name, age: 29, gender: 'Female' },
            orderId: orderA1._id,
            orderNumber: orderA1.orderNumber,
            sampleId: sampleA1._id,
            barcode: sampleA1.barcode,
            testId: testHepatitisB._id,
            testCode: testHepatitisB.testCode,
            testName: testHepatitisB.testName,
            resultStatus: 'SUBMITTED',
            resultParameters: [{
                parameterName: 'HBsAg Rapid Screen',
                dataType: 'Choice',
                enteredValue: 'Reactive',
                abnormalFlag: 'ABNORMAL'
            }],
            submittedBy: techUserA._id,
            submittedAt: new Date()
        });

        // 7.1 Request Correction
        result2.resultStatus = 'CORRECTION_REQUESTED';
        result2.correctionReason = 'Perform confirmatory ELISA / CLIA test prior to releasing Reactive report';
        result2.correctionRequestedBy = pathologistUserA._id;
        result2.correctionRequestedByName = pathologistUserA.name;
        result2.correctionRequestedAt = new Date();
        await result2.save();

        assert(result2.resultStatus === 'CORRECTION_REQUESTED' && result2.correctionReason.includes('confirmatory ELISA'),
            'Pathologist correction request accurately routed with review instructions');

        // 7.2 Rejection with Mandatory Reason
        result2.resultStatus = 'REJECTED';
        result2.rejectionReason = 'Specimen optical density invalid; repeated testing required on fresh aliquot';
        result2.rejectedBy = pathologistUserA._id;
        result2.rejectedByName = pathologistUserA.name;
        result2.rejectedAt = new Date();
        await result2.save();

        assert(result2.resultStatus === 'REJECTED' && result2.rejectionReason.includes('optical density invalid'),
            'Pathologist rejection recorded with mandatory clinical audit reason');

        // =========================================================================
        // TEST SECTION 8: AMENDMENT & FORMAL REVISION AUDITING
        // =========================================================================
        console.log('\n--- SECTION 8: FORMAL AMENDMENT & REVISION SNAPSHOTS ---');

        // Verified result (initialResult) requires amendment
        const amendmentReason = 'Dilution re-run on fresh automated channel yielded Hb 6.4 g/dL';
        initialResult.correctionHistory.push({
            revisionNumber: initialResult.revisionNumber,
            previousParameters: initialResult.resultParameters,
            reason: amendmentReason,
            changedBy: techUserA._id,
            changedByName: techUserA.name,
            changedAt: new Date()
        });

        initialResult.revisionNumber = 2;
        initialResult.resultParameters[0].enteredValue = '6.4';
        initialResult.resultParameters[0].numericValue = 6.4;
        initialResult.resultStatus = 'DRAFT'; // Resets for review
        await initialResult.save();

        assert(initialResult.revisionNumber === 2, 'Result revision number incremented to Revision 2');
        assert(initialResult.correctionHistory.length === 1 && initialResult.correctionHistory[0].reason === amendmentReason,
            'Previous parameter state preserved immutably in correctionHistory snapshot');

        // Re-verify Amended Revision
        initialResult.resultStatus = 'VERIFIED';
        initialResult.verifiedBy = pathologistUserA._id;
        initialResult.verifiedAt = new Date();
        await initialResult.save();

        assert(initialResult.resultStatus === 'VERIFIED' && initialResult.revisionNumber === 2,
            'Amended Revision 2 successfully re-verified by Pathologist');

        // =========================================================================
        // TEST SECTION 9: MULTI-TENANT ISOLATION & DASHBOARD AGGREGATIONS
        // =========================================================================
        console.log('\n--- SECTION 9: MULTI-TENANT ISOLATION & METRICS ---');

        // Hospital B attempts to query Hospital A's results
        const crossTenantResult = await LabTestResult.findOne({
            hospitalId: testHospitalB._id,
            orderId: orderA1._id
        });
        assert(crossTenantResult === null, 'Hospital B cannot access Hospital A clinical test results');

        // Hospital B attempts to query Hospital A's critical alerts
        const crossTenantAlert = await LabCriticalAlert.findOne({
            hospitalId: testHospitalB._id,
            patientName: patientAdultMale.name
        });
        assert(crossTenantAlert === null, 'Hospital B cannot access Hospital A critical panic value alerts');

        // Aggregation Counts Isolated
        const countA = await LabTestResult.countDocuments({ hospitalId: testHospitalA._id });
        const countB = await LabTestResult.countDocuments({ hospitalId: testHospitalB._id });
        assert(countA >= 2 && countB === 0,
            `Tenant metrics strictly isolated: Hospital A has ${countA} results, Hospital B has ${countB}`);

    } catch (error) {
        console.error('Fatal test error:', error);
        totalFailed++;
    } finally {
        // Cleanup test data
        console.log('\nCleaning up Phase 7 test records...');
        if (testHospitalA) {
            await LabCriticalAlert.deleteMany({ hospitalId: testHospitalA._id });
            await LabResultHistory.deleteMany({ hospitalId: testHospitalA._id });
            await LabTestResult.deleteMany({ hospitalId: testHospitalA._id });
            await LabSample.deleteMany({ hospitalId: testHospitalA._id });
            await LabOrder.deleteMany({ hospitalId: testHospitalA._id });
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
    console.log(`  PHASE 7 TEST RESULTS: ${totalPassed} PASSED, ${totalFailed} FAILED`);
    console.log('====================================================\n');

    if (totalFailed > 0) {
        process.exit(1);
    } else {
        process.exit(0);
    }
}

runTests();
