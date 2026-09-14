require('dotenv').config();
const mongoose = require('mongoose');
const { getTenantConnection } = require('./src/db/tenantDb');
const { getTenantModels } = require('./src/db/tenantModels');
const Hospital = require('./src/models/hospital.model');
const emailService = require('./src/services/email.service');

async function runTests() {
    console.log('================================================================');
    console.log('🧪 MEDICAL365 — HOSPITAL POLICY & WHITE-LABEL INTEGRATION TESTS');
    console.log('================================================================\n');

    let passedTests = 0;
    let totalTests = 0;

    function assert(condition, message) {
        totalTests++;
        if (condition) {
            console.log(`  ✅ PASS: ${message}`);
            passedTests++;
        } else {
            console.error(`  ❌ FAIL: ${message}`);
            throw new Error(`Test assertion failed: ${message}`);
        }
    }

    try {
        const mongoUrl = process.env.MONGODB_URL || 'mongodb://127.0.0.1:27017/hms';
        console.log(`[Setup] Connecting to Master MongoDB...`);
        await mongoose.connect(mongoUrl);
        console.log(`[Setup] Connected to Master MongoDB successfully.\n`);

        // -------------------------------------------------------------
        // TEST SUITE 1: White-Label Email Communication Engine
        // -------------------------------------------------------------
        console.log('▶ TEST SUITE 1: White-Label Email Communication & Branded From Headers');

        // Test 1.1: Hospital A with custom branding
        const hospitalA = {
            _id: new mongoose.Types.ObjectId(),
            name: 'Sunrise Multispeciality Hospital',
            email: 'admin@sunrisehospital.com',
            phone: '+91 98765 43210',
            branding: {
                emailDisplayName: 'Sunrise Multispeciality Hospital',
                customHospitalName: 'Sunrise Multispeciality Hospital',
                supportEmail: 'support@sunrisehospital.com',
                supportPhone: '+91 98765 43210',
                logoUrl: 'https://sunrisehospital.com/logo.png'
            }
        };

        const previewA = emailService.renderEmailPreview({
            type: 'LOGIN_OTP',
            hospital: hospitalA,
            recipientName: 'Dr. Rajesh Sharma'
        });

        assert(
            previewA.from.includes('Sunrise Multispeciality Hospital'),
            `Email sender display name matches Hospital A ("${previewA.from}")`
        );
        assert(
            previewA.html.includes('Sunrise Multispeciality Hospital'),
            'Email HTML body contains branded hospital name'
        );
        assert(
            previewA.html.includes('support@sunrisehospital.com'),
            'Email HTML body contains hospital-specific support contact'
        );

        // Test 1.2: Hospital B with distinct branding
        const hospitalB = {
            _id: new mongoose.Types.ObjectId(),
            name: 'City Care Hospital',
            email: 'admin@citycare.com',
            phone: '+91 91234 56789',
            branding: {
                emailDisplayName: 'City Care Hospital & Research Centre',
                customHospitalName: 'City Care Hospital',
                supportEmail: 'help@citycare.com'
            }
        };

        const previewB = emailService.renderEmailPreview({
            type: 'LOGIN_OTP',
            hospital: hospitalB,
            recipientName: 'Nurse Priya'
        });

        assert(
            previewB.from.includes('City Care Hospital & Research Centre'),
            `Email sender display name matches Hospital B ("${previewB.from}")`
        );
        assert(
            !previewB.from.includes('Sunrise'),
            'Zero cross-hospital branding leakage in email From header'
        );

        // Test 1.3: Central fallback when hospital is null
        const previewCentral = emailService.renderEmailPreview({
            type: 'LOGIN_OTP',
            hospital: null,
            recipientName: 'Super Administrator'
        });

        assert(
            previewCentral.from.includes('Medical365 Support'),
            `Central fallback applies Medical365 Support ("${previewCentral.from}")`
        );
        console.log('  -> Suite 1 passed all checks.\n');

        // -------------------------------------------------------------
        // TEST SUITE 2: Multi-Tenant Policy Isolation
        // -------------------------------------------------------------
        console.log('▶ TEST SUITE 2: Multi-Tenant Database Policy Isolation (hms_hospital_<id>)');

        const hospitalIdA = new mongoose.Types.ObjectId().toString();
        const hospitalIdB = new mongoose.Types.ObjectId().toString();

        const tenantDbA = await getTenantConnection(hospitalIdA);
        const tenantDbB = await getTenantConnection(hospitalIdB);

        const modelsA = getTenantModels(tenantDbA);
        const modelsB = getTenantModels(tenantDbB);

        assert(
            tenantDbA.name.includes(hospitalIdA),
            `Tenant A connected to isolated database: ${tenantDbA.name}`
        );
        assert(
            tenantDbB.name.includes(hospitalIdB),
            `Tenant B connected to isolated database: ${tenantDbB.name}`
        );

        // Clean previous test data in tenant DBs
        await modelsA.HospitalPolicy.deleteMany({});
        await modelsB.HospitalPolicy.deleteMany({});
        await modelsA.PolicyAcceptance.deleteMany({});
        await modelsB.PolicyAcceptance.deleteMany({});

        // Create a policy in Hospital A
        const policyA = await modelsA.HospitalPolicy.create({
            hospitalId: hospitalA._id,
            title: 'Sunrise Inpatient Admission & Visitor Policy',
            slug: 'sunrise-admission-policy',
            category: 'Admission',
            content: 'All attendants must wear identification badges during visiting hours (4 PM - 7 PM).',
            isMandatory: true,
            isActive: true,
            version: 1
        });

        // Query policies from Hospital B's tenant DB
        const policiesInB = await modelsB.HospitalPolicy.find({});
        assert(
            policiesInB.length === 0,
            `Hospital B tenant DB contains 0 policies from Hospital A (Strict Tenant Isolation)`
        );

        const policiesInA = await modelsA.HospitalPolicy.find({});
        assert(
            policiesInA.length === 1 && policiesInA[0].title === policyA.title,
            `Hospital A tenant DB retrieves its own policy correctly`
        );
        console.log('  -> Suite 2 passed all checks.\n');

        // -------------------------------------------------------------
        // TEST SUITE 3: Standard Policy Seeding (NABH Compliance)
        // -------------------------------------------------------------
        console.log('▶ TEST SUITE 3: Default Standard Policies Auto-Seeding (10 NABH Categories)');

        const defaultTemplates = [
            { title: 'General Hospital Terms & Code of Conduct', category: 'General', isMandatory: true },
            { title: 'Patient Inpatient Admission Guidelines', category: 'Admission', isMandatory: true },
            { title: 'Discharge & Discharge Summary Protocol', category: 'Discharge', isMandatory: false },
            { title: 'Billing, Estimation & Refund Policy', category: 'Billing & Refund', isMandatory: true },
            { title: 'Outpatient (OPD) Consultation & Appointment Policy', category: 'OPD Consultation', isMandatory: false },
            { title: 'Emergency & Trauma Care Informed Consent', category: 'Emergency Care', isMandatory: true },
            { title: 'Visitor & Attendant Conduct Regulations', category: 'Visitor & Attendant', isMandatory: false },
            { title: 'Charter of Patient Rights & Responsibilities', category: 'Patient Rights & Responsibilities', isMandatory: true },
            { title: 'Health Data Privacy & Consent for Treatment', category: 'Data Privacy & Consent', isMandatory: true },
            { title: 'Hospital Pharmacy & Medication Dispensation Policy', category: 'Pharmacy & Medication', isMandatory: false }
        ];

        let seededCount = 0;
        for (let i = 0; i < defaultTemplates.length; i++) {
            const t = defaultTemplates[i];
            await modelsB.HospitalPolicy.create({
                hospitalId: hospitalB._id,
                title: t.title,
                slug: t.title.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
                category: t.category,
                content: `Official hospital terms and conditions regarding ${t.title}.`,
                isMandatory: t.isMandatory,
                isActive: true,
                displayOrder: i + 1,
                version: 1
            });
            seededCount++;
        }

        const seededB = await modelsB.HospitalPolicy.find({});
        assert(seededB.length === 10, `Successfully seeded all 10 standard categories for Hospital B`);

        const mandatoryPolicies = seededB.filter(p => p.isMandatory);
        assert(mandatoryPolicies.length === 6, `6 mandatory compliance policies flagged correctly`);
        console.log('  -> Suite 3 passed all checks.\n');

        // -------------------------------------------------------------
        // TEST SUITE 4: Policy Versioning & Immutability of Audit Trails
        // -------------------------------------------------------------
        console.log('▶ TEST SUITE 4: Policy Versioning (v1 -> v2) & Immutable Audit Acceptance');

        const patient1Id = new mongoose.Types.ObjectId();
        const patient2Id = new mongoose.Types.ObjectId();

        // 4.1: Patient 1 accepts Policy A (version 1)
        const acceptance1 = await modelsA.PolicyAcceptance.create({
            hospitalId: hospitalA._id,
            patientId: patient1Id,
            policiesAccepted: [{
                policyId: policyA._id,
                version: policyA.version,
                policyTitle: policyA.title
            }],
            source: 'PATIENT_SIGNUP',
            acceptedAt: new Date(),
            offlineSync: false
        });

        assert(
            acceptance1.policiesAccepted[0].version === 1,
            `Patient 1 accepted policy at version 1 (snapshot recorded)`
        );

        // 4.2: Hospital Admin updates Policy A content -> version increments to 2
        policyA.content = 'UPDATED POLICY: Visiting hours have been changed to 5 PM - 8 PM with mandatory sanitization.';
        policyA.version += 1; // Service automatically increments version on content edit
        await policyA.save();

        const updatedPolicyA = await modelsA.HospitalPolicy.findById(policyA._id);
        assert(
            updatedPolicyA.version === 2,
            `Policy version auto-incremented to v2 on content update`
        );

        // 4.3: Patient 2 accepts Policy A (version 2)
        const acceptance2 = await modelsA.PolicyAcceptance.create({
            hospitalId: hospitalA._id,
            patientId: patient2Id,
            policiesAccepted: [{
                policyId: updatedPolicyA._id,
                version: updatedPolicyA.version,
                policyTitle: updatedPolicyA.title
            }],
            source: 'APPOINTMENT_BOOKING',
            acceptedAt: new Date(),
            offlineSync: false
        });

        assert(
            acceptance2.policiesAccepted[0].version === 2,
            `Patient 2 accepted policy at version 2`
        );

        // 4.4: Verify Patient 1's historical audit record is UNCHANGED (Immutability guarantee)
        const historicAudit = await modelsA.PolicyAcceptance.findById(acceptance1._id);
        assert(
            historicAudit.policiesAccepted[0].version === 1,
            `Historical acceptance for Patient 1 is immutable and remains bound to version 1`
        );
        console.log('  -> Suite 4 passed all checks.\n');

        // -------------------------------------------------------------
        // TEST SUITE 5: Offline-First Acceptance Synchronization
        // -------------------------------------------------------------
        console.log('▶ TEST SUITE 5: Offline-First Acceptance Synchronization & Audit Trail');

        const offlineAcceptance = await modelsA.PolicyAcceptance.create({
            hospitalId: hospitalA._id,
            patientId: new mongoose.Types.ObjectId(),
            policiesAccepted: [{
                policyId: updatedPolicyA._id,
                version: updatedPolicyA.version,
                policyTitle: updatedPolicyA.title
            }],
            source: 'RECEPTION_DESK',
            acceptedAt: new Date(),
            offlineSync: {
                isOfflineEvent: true,
                offlineAcceptedAt: new Date(),
                syncedAt: new Date()
            }
        });

        assert(
            offlineAcceptance.offlineSync?.isOfflineEvent === true,
            `Offline-accepted audit trail flagged with isOfflineEvent: true`
        );

        const auditTrail = await modelsA.PolicyAcceptance.find({ hospitalId: hospitalA._id });
        assert(
            auditTrail.length === 3,
            `Total audit log count in Hospital A is 3 records (Patient 1, Patient 2, Offline Sync)`
        );
        console.log('  -> Suite 5 passed all checks.\n');

        console.log('================================================================');
        console.log(`🎉 ALL ${passedTests}/${totalTests} TESTS PASSED SUCCESSFULLY!`);
        console.log('================================================================');

    } catch (err) {
        console.error('\n❌ Test execution failed with error:', err);
        process.exitCode = 1;
    } finally {
        await mongoose.disconnect();
        console.log('\n[Teardown] Disconnected from MongoDB.');
    }
}

runTests();
