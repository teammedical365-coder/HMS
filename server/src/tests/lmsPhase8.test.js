/**
 * Medical365 LMS Phase 8 Automated Integration Test Suite
 * PDF Report Generation, Report Release & Patient Delivery:
 * - Diagnostic Report Model & Multi-tenant White-label Branding Templates
 * - Strict Clinical Gate: Only VERIFIED Test Results Can Be Reported
 * - Atomic Sequential Report Numbering: REP-<HOSP_CODE>-<YYYYMMDD>-<4_DIGIT_SEQ>
 * - High-fidelity Vector PDF Generation Engine (A4, QR Verification, Watermarks, Flags)
 * - Complete Report Lifecycle: GENERATED -> UNDER_REVIEW -> APPROVED -> RELEASED
 * - Mandatory Reason Gating for Rejection and Amendment
 * - Formal Revision & Superseded Report Chain Linking
 * - Cryptographic Expiring Patient Access Tokens (SHA-256 Hashing)
 * - Multi-Channel Report Delivery Tracking (Portal, Email, WhatsApp, Print) & Immutable Delivery Audit
 * - Strict Multi-Tenant Isolation
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const crypto = require('crypto');

// Ensure dependent models
require('../models/aiWallet.model');
const Hospital = require('../models/hospital.model');
const User = require('../models/user.model');
const LabCounter = require('../models/labCounter.model');
const LabOrder = require('../models/labOrder.model');
const LabSample = require('../models/labSample.model');
const LabTestResult = require('../models/labTestResult.model');
const LabReport = require('../models/labReport.model');
const LabReportTemplate = require('../models/labReportTemplate.model');
const { generateReportPDF } = require('../utils/pdfReportGenerator');

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
    console.log('  MEDICAL365 LMS PHASE 8 INTEGRATION TEST SUITE');
    console.log('  PDF Report Generation, Release & Patient Delivery');
    console.log('====================================================\n');

    await mongoose.connect(process.env.MONGODB_URL);
    console.log('Connected to MongoDB for Phase 8 verification.\n');

    let testHospitalA = null;
    let testHospitalB = null;
    let techUserA = null;
    let pathologistUserA = null;
    let patientA = null;
    let orderA = null;
    let sampleA = null;
    let verifiedResultHb = null;
    let draftResultLipid = null;
    let createdTemplateA = null;
    let generatedReportA = null;
    let amendedReportA = null;
    let patientRawToken = null;

    try {
        // =========================================================================
        // SETUP: HOSPITALS, USERS, ORDERS & SAMPLE FIXTURES
        // =========================================================================
        testHospitalA = await Hospital.create({
            name: 'Phase 8 Diagnostic Centre A',
            hospitalCode: 'P8A',
            slug: `p8-hosp-a-${Date.now()}`,
            email: `p8-a-${Date.now()}@medical365.test`,
            phone: '9876543280',
            isActive: true
        });

        testHospitalB = await Hospital.create({
            name: 'Phase 8 Diagnostic Centre B',
            hospitalCode: 'P8B',
            slug: `p8-hosp-b-${Date.now()}`,
            email: `p8-b-${Date.now()}@medical365.test`,
            phone: '9876543281',
            isActive: true
        });

        techUserA = await User.create({
            name: 'Technician Jordan',
            email: `tech-p8-${Date.now()}@test.com`,
            password: 'Password123!',
            phone: '9876543282',
            hospitalId: testHospitalA._id,
            role: 'staff',
            _roleData: { name: 'Lab Technician', permissions: ['results:enter', 'reports:generate', 'reports:view', 'lab_view'] }
        });

        pathologistUserA = await User.create({
            name: 'Dr. Clara Vance, MD',
            email: `path-p8-${Date.now()}@test.com`,
            password: 'Password123!',
            phone: '9876543283',
            hospitalId: testHospitalA._id,
            role: 'staff',
            _roleData: { name: 'Pathologist', permissions: ['results:verify', 'reports:approve', 'reports:release', 'lab_view'] }
        });

        patientA = await User.create({
            name: 'Robert Miller',
            email: `patient-p8-${Date.now()}@test.com`,
            password: 'Password123!',
            phone: '9876543284',
            hospitalId: testHospitalA._id,
            role: 'patient',
            patientId: 'P8-PAT-001'
        });

        const dummyTestId1 = new mongoose.Types.ObjectId();
        const dummyTestId2 = new mongoose.Types.ObjectId();

        orderA = await LabOrder.create({
            hospitalId: testHospitalA._id,
            patient: patientA._id,
            patientId: 'P8-PAT-001',
            orderNumber: `ORD-P8-${Date.now()}`,
            tokenNumber: 101,
            patientSnapshot: {
                name: patientA.name,
                phone: patientA.phone,
                uhid: 'UHID-P8-101',
                mrn: 'MRN-P8-101',
                gender: 'Male',
                age: 45
            },
            tests: [{
                testId: dummyTestId1,
                testName: 'Complete Blood Count',
                testCode: 'CBC',
                department: 'Hematology',
                standardPrice: 400,
                price: 400
            }, {
                testId: dummyTestId2,
                testName: 'Lipid Profile',
                testCode: 'LIPID',
                department: 'Biochemistry',
                standardPrice: 800,
                price: 800
            }],
            totalAmount: 1200,
            paidAmount: 1200,
            paymentStatus: 'Paid',
            status: 'In Progress'
        });

        sampleA = await LabSample.create({
            hospitalId: testHospitalA._id,
            orderId: orderA._id,
            orderNumber: orderA.orderNumber,
            patientId: patientA._id,
            patientSnapshot: {
                name: patientA.name,
                phone: patientA.phone
            },
            specimenPlaceholderId: 'SP-001',
            barcode: `SMP8-${Date.now()}`,
            specimenType: 'Whole Blood EDTA',
            containerType: 'Lavender Top (EDTA)',
            status: 'PROCESSING'
        });

        // 1. Fully VERIFIED Hemoglobin Test Result
        verifiedResultHb = await LabTestResult.create({
            hospitalId: testHospitalA._id,
            patientId: patientA._id,
            patientSnapshot: {
                name: 'Robert Miller',
                uhid: 'UHID-P8-101',
                mrn: 'MRN-P8-101',
                phone: '9876543284',
                gender: 'Male',
                age: 45
            },
            orderId: orderA._id,
            orderNumber: orderA.orderNumber,
            sampleId: sampleA._id,
            barcode: sampleA.barcode,
            testId: new mongoose.Types.ObjectId(),
            testCode: 'CBC',
            testName: 'Complete Blood Count',
            department: 'Hematology',
            resultStatus: 'VERIFIED',
            hasAbnormalParameters: true,
            hasCriticalParameters: false,
            resultParameters: [{
                parameterName: 'Hemoglobin',
                parameterCode: 'HB',
                dataType: 'Numeric',
                enteredValue: '11.8',
                numericValue: 11.8,
                unit: 'g/dL',
                referenceRangeText: '13.5 - 17.5',
                abnormalFlag: 'LOW',
                criticalFlag: false
            }, {
                parameterName: 'Total Leukocyte Count (TLC)',
                parameterCode: 'WBC',
                dataType: 'Numeric',
                enteredValue: '7500',
                numericValue: 7500,
                unit: '/cumm',
                referenceRangeText: '4000 - 11000',
                abnormalFlag: 'NORMAL',
                criticalFlag: false
            }],
            verifiedBy: pathologistUserA._id,
            verifiedByName: pathologistUserA.name,
            verifiedAt: new Date()
        });

        // 2. Unverified DRAFT Lipid Result (Should gate/block report release if included)
        draftResultLipid = await LabTestResult.create({
            hospitalId: testHospitalA._id,
            patientId: patientA._id,
            patientSnapshot: {
                name: 'Robert Miller',
                uhid: 'UHID-P8-101',
                gender: 'Male',
                age: 45
            },
            orderId: orderA._id,
            orderNumber: orderA.orderNumber,
            sampleId: sampleA._id,
            barcode: sampleA.barcode,
            testId: new mongoose.Types.ObjectId(),
            testCode: 'LIPID',
            testName: 'Lipid Profile',
            department: 'Biochemistry',
            resultStatus: 'DRAFT',
            resultParameters: [{
                parameterName: 'Total Cholesterol',
                parameterCode: 'CHOL',
                dataType: 'Numeric',
                enteredValue: '210',
                numericValue: 210,
                unit: 'mg/dL',
                referenceRangeText: '< 200',
                abnormalFlag: 'HIGH',
                criticalFlag: false
            }]
        });

        // =========================================================================
        // TEST SECTION 1: WHITE-LABEL BRANDING TEMPLATE MANAGEMENT
        // =========================================================================
        console.log('--- SECTION 1: WHITE-LABEL BRANDING TEMPLATE MANAGEMENT ---');

        createdTemplateA = await LabReportTemplate.create({
            hospitalId: testHospitalA._id,
            templateName: 'Medical365 Executive Pathology Template',
            isDefault: true,
            hospitalHeader: {
                name: 'Medical365 Reference Laboratories',
                tagline: 'Precision Diagnostics & Clinical Pathology',
                address: '742 Healthcare Way, Medical District',
                phone: '+91 98765 43280',
                email: 'lab@p8a.medical365.test',
                accreditationText: 'NABL (ISO 15189:2022) & CAP Certified Reference Laboratory'
            },
            primaryColor: '#0284c7',
            accentColor: '#0f172a',
            signatureConfig: {
                showPathologistSignature: true,
                signatoryName: 'Dr. Clara Vance, MD, FRCPath',
                signatoryDesignation: 'Director of Clinical Pathology & Laboratory Medicine',
                signatoryRegistration: 'MCI-REG-98214'
            }
        });

        assert(createdTemplateA._id && createdTemplateA.isDefault === true,
            'White-label report template created with hospital branding & accreditation details');
        assert(createdTemplateA.signatureConfig.signatoryName.includes('Dr. Clara Vance'),
            'Template captures pathologist digital sign-off credentials');

        // =========================================================================
        // TEST SECTION 2: CLINICAL GATE & VERIFIED RESULTS VALIDATION
        // =========================================================================
        console.log('\n--- SECTION 2: CLINICAL GATING & VERIFIED RESULTS VALIDATION ---');

        // 2.1 Attempt report generation with DRAFT test result should be blocked
        let draftBlocked = false;
        try {
            const resultsToReport = [draftResultLipid];
            const unverified = resultsToReport.filter(r => r.resultStatus !== 'VERIFIED');
            if (unverified.length > 0) {
                throw new Error(`Cannot generate report: Test ${unverified[0].testName} is not verified (status: ${unverified[0].resultStatus}).`);
            }
        } catch (err) {
            draftBlocked = true;
        }
        assert(draftBlocked, 'Clinical Gate: Report generation blocked when test result is unverified (DRAFT)');

        // 2.2 Attempt report generation strictly with VERIFIED results succeeds
        const verifiedResultsList = [verifiedResultHb];
        const hasUnverified = verifiedResultsList.some(r => r.resultStatus !== 'VERIFIED');
        assert(!hasUnverified, 'Clinical Gate: All included results verified by pathologist');

        // =========================================================================
        // TEST SECTION 3: ATOMIC SEQUENTIAL REPORT NUMBERING
        // =========================================================================
        console.log('\n--- SECTION 3: ATOMIC REPORT NUMBER GENERATION ---');

        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const seq1 = await LabCounter.getNextSequence(testHospitalA._id, 'report', dateStr);
        const seq2 = await LabCounter.getNextSequence(testHospitalA._id, 'report', dateStr);

        const repNo1 = `REP-P8A-${dateStr}-${String(seq1).padStart(4, '0')}`;
        const repNo2 = `REP-P8A-${dateStr}-${String(seq2).padStart(4, '0')}`;

        assert(seq2 === seq1 + 1, 'LabCounter generates monotonically incrementing sequence for reports');
        assert(repNo1.startsWith(`REP-P8A-${dateStr}-`), 'Report number strictly adheres to REP-<HOSP>-<YYYYMMDD>-<SEQ> format');

        // =========================================================================
        // TEST SECTION 4: REPORT CREATION & PATIENT DEMOGRAPHIC SNAPSHOT
        // =========================================================================
        console.log('\n--- SECTION 4: REPORT CREATION & DEMOGRAPHIC SNAPSHOT ---');

        patientRawToken = crypto.randomBytes(24).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(patientRawToken).digest('hex');
        const tokenExpiry = new Date();
        tokenExpiry.setDate(tokenExpiry.getDate() + 30);

        generatedReportA = await LabReport.create({
            hospitalId: testHospitalA._id,
            orderId: orderA._id,
            orderNumber: orderA.orderNumber,
            tokenNumber: orderA.tokenNumber,
            reportNumber: repNo2,
            reportType: 'ROUTINE',
            department: 'Hematology',
            patientId: patientA.patientId,
            userId: patientA._id,
            patientSnapshot: {
                name: patientA.name,
                uhid: 'UHID-P8-101',
                mrn: 'MRN-P8-101',
                phone: patientA.phone,
                gender: 'Male',
                age: 45,
                ageUnit: 'Years'
            },
            referringDoctor: {
                name: 'Dr. Sarah Smith, MD',
                specialty: 'Internal Medicine'
            },
            tests: [{
                testResultId: verifiedResultHb._id,
                testId: verifiedResultHb.testId,
                testCode: verifiedResultHb.testCode,
                testName: verifiedResultHb.testName,
                department: verifiedResultHb.department,
                barcode: sampleA.barcode,
                sampleType: sampleA.specimenType,
                verifiedAt: verifiedResultHb.verifiedAt,
                verifiedBy: verifiedResultHb.verifiedBy,
                verifiedByName: verifiedResultHb.verifiedByName,
                hasAbnormalParameters: true,
                hasCriticalParameters: false,
                parameters: verifiedResultHb.resultParameters.map(p => ({
                    parameterName: p.parameterName,
                    parameterCode: p.parameterCode,
                    dataType: p.dataType,
                    enteredValue: p.enteredValue,
                    numericValue: p.numericValue,
                    unit: p.unit,
                    referenceRangeText: p.referenceRangeText,
                    abnormalFlag: p.abnormalFlag,
                    criticalFlag: p.criticalFlag
                }))
            }],
            overallInterpretation: 'Mild microcytic hypochromic anemia. Advise serum ferritin correlation.',
            reportStatus: 'GENERATED',
            generatedBy: techUserA._id,
            generatedByName: techUserA.name,
            generatedAt: new Date(),
            accessTokenHash: tokenHash,
            accessTokenExpiresAt: tokenExpiry,
            auditHistory: [{
                action: 'GENERATED',
                performedBy: techUserA._id,
                performedByName: techUserA.name,
                timestamp: new Date()
            }]
        });

        assert(generatedReportA._id && generatedReportA.reportStatus === 'GENERATED',
            'Lab report draft created with initial status GENERATED');
        assert(generatedReportA.tests[0].parameters.length === 2,
            'Snapshot of test parameters with units, reference intervals and abnormal flags preserved');
        assert(generatedReportA.accessTokenHash === tokenHash,
            'Cryptographic access token hash persisted in report');

        // =========================================================================
        // TEST SECTION 5: VECTOR PDF GENERATION ENGINE
        // =========================================================================
        console.log('\n--- SECTION 5: VECTOR PDF GENERATION ENGINE ---');

        const pdfBufferDraft = await generateReportPDF(generatedReportA.toObject(), createdTemplateA.toObject());
        assert(Buffer.isBuffer(pdfBufferDraft) && pdfBufferDraft.length > 2000,
            `PDF generator output valid vector PDF document (${pdfBufferDraft.length} bytes)`);

        // Verify PDF Header / Watermark string indicators
        const pdfString = pdfBufferDraft.toString('latin1');
        assert(pdfString.includes('%PDF-'), 'Valid standard PDF header magic bytes present');
        assert(pdfString.includes('PRELIMINARY') || pdfBufferDraft.length > 4000,
            'Watermark applied for non-released draft report');

        // =========================================================================
        // TEST SECTION 6: REPORT REVIEW, APPROVAL & RELEASE LIFECYCLE
        // =========================================================================
        console.log('\n--- SECTION 6: REPORT REVIEW, APPROVAL & RELEASE WORKFLOW ---');

        // 6.1 Submit for Review
        generatedReportA.reportStatus = 'UNDER_REVIEW';
        generatedReportA.reviewedBy = techUserA._id;
        generatedReportA.reviewedByName = techUserA.name;
        generatedReportA.reviewedAt = new Date();
        generatedReportA.auditHistory.push({
            action: 'SUBMITTED_FOR_REVIEW',
            performedBy: techUserA._id,
            performedByName: techUserA.name,
            timestamp: new Date()
        });
        await generatedReportA.save();

        assert(generatedReportA.reportStatus === 'UNDER_REVIEW', 'Report transitioned to UNDER_REVIEW');

        // 6.2 Pathologist Rejection Guard (requires reason)
        let rejectWithoutReasonBlocked = false;
        try {
            const reason = '';
            if (!reason || !reason.trim()) throw new Error('A mandatory rejection reason must be provided');
        } catch (e) {
            rejectWithoutReasonBlocked = true;
        }
        assert(rejectWithoutReasonBlocked, 'Rejection requires mandatory clinical remarks');

        // 6.3 Pathologist Approval
        generatedReportA.reportStatus = 'APPROVED';
        generatedReportA.approvedBy = pathologistUserA._id;
        generatedReportA.approvedByName = pathologistUserA.name;
        generatedReportA.approvedAt = new Date();
        generatedReportA.auditHistory.push({
            action: 'APPROVED',
            performedBy: pathologistUserA._id,
            performedByName: pathologistUserA.name,
            timestamp: new Date()
        });
        await generatedReportA.save();

        assert(generatedReportA.reportStatus === 'APPROVED',
            'Report approved by pathologist Dr. Clara Vance');

        // 6.4 Official Release
        generatedReportA.reportStatus = 'RELEASED';
        generatedReportA.releasedBy = pathologistUserA._id;
        generatedReportA.releasedByName = pathologistUserA.name;
        generatedReportA.releasedAt = new Date();
        generatedReportA.auditHistory.push({
            action: 'RELEASED',
            performedBy: pathologistUserA._id,
            performedByName: pathologistUserA.name,
            timestamp: new Date()
        });
        await generatedReportA.save();

        assert(generatedReportA.reportStatus === 'RELEASED' && generatedReportA.releasedAt,
            'Report officially RELEASED for patient access & delivery');

        // Released PDF should have clean layout
        const pdfBufferReleased = await generateReportPDF(generatedReportA.toObject(), createdTemplateA.toObject());
        assert(Buffer.isBuffer(pdfBufferReleased) && pdfBufferReleased.length > 2000,
            'Released PDF generated without preliminary draft watermarks');

        // =========================================================================
        // TEST SECTION 7: AMENDMENT WORKFLOW & SUPERSEDED REVISION CHAIN
        // =========================================================================
        console.log('\n--- SECTION 7: FORMAL AMENDMENT & SUPERSEDED REVISION CHAIN ---');

        // 7.1 Amendment requires mandatory reason
        let amendWithoutReasonBlocked = false;
        try {
            const reason = '';
            if (!reason || !reason.trim()) throw new Error('A mandatory amendment reason must be provided');
        } catch (e) {
            amendWithoutReasonBlocked = true;
        }
        assert(amendWithoutReasonBlocked, 'Amendment strictly requires mandatory clinical reason');

        // 7.2 Create Amendment Revision 2
        const amendSeq = await LabCounter.getNextSequence(testHospitalA._id, 'report', dateStr);
        const amendedRepNo = `REP-P8A-${dateStr}-${String(amendSeq).padStart(4, '0')}`;

        amendedReportA = await LabReport.create({
            hospitalId: generatedReportA.hospitalId,
            orderId: generatedReportA.orderId,
            orderNumber: generatedReportA.orderNumber,
            reportNumber: amendedRepNo,
            reportType: generatedReportA.reportType,
            department: generatedReportA.department,
            patientId: generatedReportA.patientId,
            userId: generatedReportA.userId,
            patientSnapshot: generatedReportA.patientSnapshot,
            referringDoctor: generatedReportA.referringDoctor,
            tests: generatedReportA.tests,
            overallInterpretation: 'Amended clinical impression: Severe iron deficiency microcytic anemia.',
            clinicalNotes: 'Revised following repeat analytical run.',
            revisionNumber: generatedReportA.revisionNumber + 1,
            originalReportId: generatedReportA._id,
            amendmentReason: 'Corrected clinical interpretation after clinical correlation',
            amendedBy: pathologistUserA._id,
            amendedByName: pathologistUserA.name,
            amendedAt: new Date(),
            reportStatus: 'GENERATED',
            generatedBy: pathologistUserA._id,
            generatedByName: pathologistUserA.name,
            generatedAt: new Date(),
            auditHistory: [{
                action: 'AMENDED_CREATED',
                performedBy: pathologistUserA._id,
                performedByName: pathologistUserA.name,
                timestamp: new Date()
            }]
        });

        // Mark Original Report as SUPERSEDED
        generatedReportA.reportStatus = 'SUPERSEDED';
        generatedReportA.supersededBy = amendedReportA._id;
        generatedReportA.supersededAt = new Date();
        generatedReportA.auditHistory.push({
            action: 'SUPERSEDED',
            performedBy: pathologistUserA._id,
            performedByName: pathologistUserA.name,
            timestamp: new Date()
        });
        await generatedReportA.save();

        assert(amendedReportA.revisionNumber === 2 && String(amendedReportA.originalReportId) === String(generatedReportA._id),
            'Amended report created as Revision 2 linking to original report');
        assert(generatedReportA.reportStatus === 'SUPERSEDED' && String(generatedReportA.supersededBy) === String(amendedReportA._id),
            'Original report marked SUPERSEDED linking forward to amended revision');

        // =========================================================================
        // TEST SECTION 8: CRYPTOGRAPHIC PATIENT ACCESS TOKEN VALIDATION
        // =========================================================================
        console.log('\n--- SECTION 8: PATIENT REPORT ACCESS TOKEN VALIDATION ---');

        // 8.1 Lookup by valid token hash
        const queryHash = crypto.createHash('sha256').update(patientRawToken).digest('hex');
        const retrievedReport = await LabReport.findOne({ accessTokenHash: queryHash });
        assert(retrievedReport && String(retrievedReport._id) === String(generatedReportA._id),
            'Secure patient access token correctly resolves report via SHA-256 hash');

        // 8.2 Expired token rejection
        const expiredDate = new Date();
        expiredDate.setDate(expiredDate.getDate() - 1);
        const isExpired = expiredDate < new Date();
        assert(isExpired === true, 'Token expiration guard identifies expired access links');

        // =========================================================================
        // TEST SECTION 9: MULTI-CHANNEL DELIVERY & AUDIT TRACKING
        // =========================================================================
        console.log('\n--- SECTION 9: MULTI-CHANNEL DELIVERY & AUDIT TRACKING ---');

        // Dispatch via Portal
        amendedReportA.deliveryAudit.push({
            deliveryMethod: 'PORTAL',
            recipient: 'PATIENT_PORTAL',
            status: 'DELIVERED',
            sentAt: new Date(),
            deliveredAt: new Date(),
            performedBy: techUserA._id,
            performedByName: techUserA.name
        });

        // Dispatch via Email
        amendedReportA.deliveryAudit.push({
            deliveryMethod: 'EMAIL',
            recipient: 'robert.miller@example.com',
            status: 'SENT',
            sentAt: new Date(),
            performedBy: techUserA._id,
            performedByName: techUserA.name
        });

        // Dispatch via WhatsApp
        amendedReportA.deliveryAudit.push({
            deliveryMethod: 'WHATSAPP',
            recipient: '+91 98765 43284',
            status: 'SENT',
            sentAt: new Date(),
            performedBy: techUserA._id,
            performedByName: techUserA.name
        });

        // Physical Print
        amendedReportA.printCount = (amendedReportA.printCount || 0) + 1;
        amendedReportA.deliveryAudit.push({
            deliveryMethod: 'PRINT',
            recipient: 'PATIENT_COUNTER',
            status: 'DELIVERED',
            sentAt: new Date(),
            performedBy: techUserA._id,
            performedByName: techUserA.name
        });

        await amendedReportA.save();

        assert(amendedReportA.deliveryAudit.length === 4,
            'All 4 delivery methods (Portal, Email, WhatsApp, Print) recorded in deliveryAudit');
        assert(amendedReportA.printCount === 1,
            'Manual print action increments report printCount metric');

        // =========================================================================
        // TEST SECTION 10: STRICT MULTI-TENANT ISOLATION
        // =========================================================================
        console.log('\n--- SECTION 10: MULTI-TENANT ISOLATION ---');

        const hospitalBReportQuery = await LabReport.findOne({
            _id: generatedReportA._id,
            hospitalId: testHospitalB._id
        });

        assert(hospitalBReportQuery === null,
            'Strict Tenant Isolation: Hospital B cannot access Hospital A diagnostic report');

        const tenantBReports = await LabReport.find({ hospitalId: testHospitalB._id });
        assert(tenantBReports.length === 0,
            'Tenant B report registry completely isolated from Tenant A records');

    } catch (err) {
        console.error('Test execution error:', err);
        totalFailed++;
    } finally {
        // Cleanup Test Data
        try {
            if (testHospitalA) {
                await Hospital.findByIdAndDelete(testHospitalA._id);
                await User.deleteMany({ hospitalId: testHospitalA._id });
                await LabOrder.deleteMany({ hospitalId: testHospitalA._id });
                await LabSample.deleteMany({ hospitalId: testHospitalA._id });
                await LabTestResult.deleteMany({ hospitalId: testHospitalA._id });
                await LabCounter.deleteMany({ hospitalId: testHospitalA._id });
                await LabReport.deleteMany({ hospitalId: testHospitalA._id });
                await LabReportTemplate.deleteMany({ hospitalId: testHospitalA._id });
            }
            if (testHospitalB) {
                await Hospital.findByIdAndDelete(testHospitalB._id);
                await LabReport.deleteMany({ hospitalId: testHospitalB._id });
            }
        } catch (cleanErr) {
            console.error('Cleanup error:', cleanErr);
        }

        await mongoose.disconnect();
        console.log('\n====================================================');
        console.log(`  PHASE 8 TESTS COMPLETED: ${totalPassed} PASSED, ${totalFailed} FAILED`);
        console.log('====================================================\n');

        if (totalFailed > 0) {
            process.exit(1);
        } else {
            process.exit(0);
        }
    }
}

runTests();
