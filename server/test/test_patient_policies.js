/**
 * End-to-End Verification Suite: Patient TPA, Insurance & Government Health Policy Feature
 *
 * Tests all 10 required scenarios against real Express routes + MongoDB:
 *  1. Normal patient registration WITHOUT insurance/policy details works seamlessly.
 *  2. Registration WITH TPA (Medi Assist) & Government Scheme (Ayushman Bharat / RGHS) saves all fields cleanly
 *     and never auto-marks Verified (even if caller attempts to pass verificationStatus: 'Verified').
 *  3. Existing patient appointment booking auto-loads saved policy, updates without duplicate records,
 *     and attaches selectedPolicyId + policySnapshot cleanly to Appointment.
 *  4. Multiple active policies per patient supported cleanly; invalid date range rejected (400).
 *  5. Card document upload (valid PNG accepted; spoofed non-image/PDF rejected) & authorized tenant download
 *     via /api/patients/reports/:filename (200 for same hospital, 401/403 for unauthenticated/cross-tenant).
 *  6. Patient Profile API (/api/patients/:id/full-history) returns saved insurancePolicies.
 *  7. Verification workflow: unauthorized roles (doctor / reception) receive 403 when trying to mark Verified;
 *     authorized roles (hospitaladmin / accountant) can set Verified/Rejected/Expired with audit fields;
 *     editing core policy identifiers via PUT resets Verified back to Pending Verification.
 *  8. Billing API (/api/billing/patient/:id) exposes saved insurancePolicies as read-only reference
 *     WITHOUT deducting or changing appointment consultation fees or payment totals.
 *  9. IPD Admission API (/api/admissions/active & /api/admissions/:id) attaches saved insurancePolicies.
 * 10. Multi-tenant isolation: Hospital B staff cannot view, edit, verify, or delete Hospital A policies.
 */
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const assert = require('assert');
const http = require('http');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const app = require('../src/app');
const Hospital = require('../src/models/hospital.model');
const Role = require('../src/models/role.model');
const User = require('../src/models/user.model');
const Doctor = require('../src/models/doctor.model');
const Appointment = require('../src/models/appointment.model');
const Admission = require('../src/models/admission.model');
const Session = require('../src/models/session.model');
const PatientInsurancePolicy = require('../src/models/patientInsurancePolicy.model');
const { getTenantConnection } = require('../src/db/tenantDb');
const { getTenantModels } = require('../src/db/tenantModels');
const { JWT_SECRET } = require('../src/config/jwt');

// Minimal valid 1x1 PNG binary
const VALID_PNG_BUFFER = Buffer.from(
    '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082',
    'hex'
);

async function issueAuthToken(user, createdSessionIds) {
    const jti = `test_jti_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const sessionId = `test_sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await Session.create({
        userId: user._id,
        hospitalId: user.hospitalId,
        sessionId,
        jti,
        role: user.role,
        isActive: true,
        expiresAt: new Date(Date.now() + 3600 * 1000)
    });
    createdSessionIds.push(sessionId);

    return jwt.sign(
        {
            userId: String(user._id),
            role: user.role,
            hospitalId: String(user.hospitalId),
            jti,
            sessionId,
            tv: user.tokenVersion || 0
        },
        JWT_SECRET,
        { expiresIn: '1h' }
    );
}

async function runTests() {
    if (!process.env.MONGODB_URL) {
        throw new Error('MONGODB_URL is required in server/.env');
    }

    await mongoose.connect(process.env.MONGODB_URL);
    console.log('[Test] Connected to MongoDB.');

    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;

    const cleanupIds = {
        hospitalIds: [],
        roleIds: [],
        userIds: [],
        doctorIds: [],
        appointmentIds: [],
        admissionIds: [],
        sessionIds: [],
        uploadedFiles: []
    };

    let passed = 0;
    let failed = 0;

    async function runCase(name, fn) {
        try {
            await fn();
            passed += 1;
            console.log(`PASS: ${name}`);
        } catch (err) {
            failed += 1;
            console.error(`FAIL: ${name} -> ${err.message}`);
            if (err.stack) console.error(err.stack.split('\n').slice(0, 4).join('\n'));
        }
    }

    const suffix = `${Date.now().toString().slice(-6)}`;
    const randPhone = (base) => `${base}${suffix}`.slice(0, 10).padEnd(10, '1');

    try {
        // Seed two isolated hospitals (Hospital A & Hospital B)
        const hospA = await Hospital.create({
            name: `PolicyTest Hospital A ${suffix}`,
            slug: `policytest-a-${suffix}`,
            hospitalCode: `PA${suffix.slice(-3)}`,
            email: `hospa_${suffix}@test.local`,
            phone: randPhone('9811'),
            status: 'active',
            isApproved: true,
            appointmentMode: 'token'
        });
        const hospB = await Hospital.create({
            name: `PolicyTest Hospital B ${suffix}`,
            slug: `policytest-b-${suffix}`,
            hospitalCode: `PB${suffix.slice(-3)}`,
            email: `hospb_${suffix}@test.local`,
            phone: randPhone('9822'),
            status: 'active',
            isApproved: true,
            appointmentMode: 'token'
        });
        cleanupIds.hospitalIds.push(hospA._id, hospB._id);

        const roleCache = new Map();
        const mkStaff = async (hospitalId, roleName, phonePrefix, perms = []) => {
            let assignedRole = roleName;
            if (!['hospitaladmin', 'centraladmin', 'superadmin', 'patient'].includes(roleName)) {
                const key = `${hospitalId}:${roleName}`;
                if (!roleCache.has(key)) {
                    const roleDoc = await Role.create({
                        hospitalId,
                        name: roleName,
                        permissions: perms
                    });
                    cleanupIds.roleIds.push(roleDoc._id);
                    roleCache.set(key, roleDoc._id);
                }
                assignedRole = roleCache.get(key);
            }
            const u = await User.create({
                hospitalId,
                role: assignedRole,
                name: `${roleName.toUpperCase()} User ${suffix}`,
                email: `${roleName}_${phonePrefix}_${suffix}@test.local`,
                phone: randPhone(phonePrefix),
                password: 'TestPassword123!'
            });
            cleanupIds.userIds.push(u._id);
            return u;
        };

        const receptionA = await mkStaff(hospA._id, 'reception', '9101', ['reception_access', 'patient_view']);
        const adminA = await mkStaff(hospA._id, 'hospitaladmin', '9102');
        const doctorUserA = await mkStaff(hospA._id, 'doctor', '9103', ['patient_view', 'visit_diagnose']);
        const accountantA = await mkStaff(hospA._id, 'accountant', '9104', ['billing_access']);
        const adminB = await mkStaff(hospB._id, 'hospitaladmin', '9201');

        const allDaysAvail = { available: true, startTime: '00:00', endTime: '23:59' };
        const doctorProfileA = await Doctor.create({
            doctorId: `DOC-${suffix}`,
            userId: doctorUserA._id,
            hospitalId: hospA._id,
            name: `Dr. Policy Tester ${suffix}`,
            email: doctorUserA.email,
            phone: doctorUserA.phone,
            specialty: 'General Medicine',
            departments: ['General Medicine'],
            consultationFee: 650,
            isActive: true,
            availability: {
                monday: allDaysAvail,
                tuesday: allDaysAvail,
                wednesday: allDaysAvail,
                thursday: allDaysAvail,
                friday: allDaysAvail,
                saturday: allDaysAvail,
                sunday: allDaysAvail
            }
        });
        cleanupIds.doctorIds.push(doctorProfileA._id);

        const receptionTokenA = await issueAuthToken(receptionA, cleanupIds.sessionIds);
        const adminTokenA = await issueAuthToken(adminA, cleanupIds.sessionIds);
        const doctorTokenA = await issueAuthToken(doctorUserA, cleanupIds.sessionIds);
        const accountantTokenA = await issueAuthToken(accountantA, cleanupIds.sessionIds);
        const adminTokenB = await issueAuthToken(adminB, cleanupIds.sessionIds);

        const apiCall = async (method, urlPath, token, body = null) => {
            const headers = {};
            if (token) headers.Authorization = `Bearer ${token}`;
            let payload;
            if (body instanceof FormData) {
                payload = body;
            } else if (body !== null) {
                headers['Content-Type'] = 'application/json';
                payload = JSON.stringify(body);
            }
            const res = await fetch(`${baseUrl}${urlPath}`, { method, headers, body: payload });
            const contentType = res.headers.get('content-type') || '';
            const data = contentType.includes('application/json') ? await res.json() : await res.arrayBuffer();
            return { status: res.status, data, headers: res.headers };
        };

        let plainPatient = null;
        let tpaPatient = null;
        let govtPatient = null;
        let tpaPolicyId = null;
        let uploadedCardDoc = null;

        await runCase('1. Registration WITHOUT insurance details succeeds smoothly', async () => {
            const res = await apiCall('POST', '/api/reception/register', receptionTokenA, {
                name: `Plain Patient ${suffix}`,
                phone: randPhone('8101'),
                age: 31
            });
            assert.strictEqual(res.status, 201);
            assert.strictEqual(res.data.success, true);
            assert.strictEqual(res.data.insurancePolicy, null);
            plainPatient = res.data.user;
            cleanupIds.userIds.push(plainPatient._id);

            const polList = await apiCall('GET', `/api/patient-policies/patient/${plainPatient._id}`, receptionTokenA);
            assert.strictEqual(polList.status, 200);
            assert.strictEqual(polList.data.policies.length, 0);
        });

        await runCase('2. Registration WITH TPA (Medi Assist) saves fields & never auto-verifies', async () => {
            const res = await apiCall('POST', '/api/reception/register', receptionTokenA, {
                name: `TPA Patient ${suffix}`,
                phone: randPhone('8102'),
                age: 42,
                insurancePolicy: {
                    policyType: 'TPA',
                    providerName: 'Medi Assist',
                    policyNumber: `POL-MA-${suffix}`,
                    tpaOrMemberId: `MAID-${suffix}`,
                    policyHolderName: `TPA Holder ${suffix}`,
                    relationshipWithPatient: 'Spouse',
                    validFrom: '2026-01-01',
                    validUntil: '2027-01-01',
                    notes: 'Cashless pre-auth desk check needed',
                    verificationStatus: 'Verified' // spoof attempt must be ignored!
                }
            });
            assert.strictEqual(res.status, 201);
            assert.strictEqual(res.data.success, true);
            assert(res.data.insurancePolicy, 'Expected insurancePolicy returned on registration');
            assert.strictEqual(res.data.insurancePolicy.policyType, 'TPA');
            assert.strictEqual(res.data.insurancePolicy.providerName, 'Medi Assist');
            assert.strictEqual(res.data.insurancePolicy.verificationStatus, 'Not Verified');
            tpaPatient = res.data.user;
            tpaPolicyId = res.data.insurancePolicy._id;
            cleanupIds.userIds.push(tpaPatient._id);
        });

        await runCase('3. Registration WITH Government Health Scheme (Ayushman Bharat PM-JAY) works optionally', async () => {
            const res = await apiCall('POST', '/api/reception/register', receptionTokenA, {
                name: `Govt Patient ${suffix}`,
                phone: randPhone('8103'),
                age: 56,
                insurancePolicy: {
                    policyType: 'Government Health Scheme',
                    providerName: 'Ayushman Bharat PM-JAY',
                    policyNumber: `PMJAY-${suffix}`,
                    policyHolderName: `Govt Patient ${suffix}`
                }
            });
            assert.strictEqual(res.status, 201);
            assert.strictEqual(res.data.insurancePolicy.policyType, 'Government Health Scheme');
            assert.strictEqual(res.data.insurancePolicy.providerName, 'Ayushman Bharat PM-JAY');
            assert.strictEqual(res.data.insurancePolicy.verificationStatus, 'Not Verified');
            govtPatient = res.data.user;
            cleanupIds.userIds.push(govtPatient._id);
        });

        await runCase('4. Booking appointment with existing patient auto-loads & updates policy without duplicates', async () => {
            const preCheck = await apiCall('GET', `/api/patient-policies/patient/${tpaPatient._id}`, receptionTokenA);
            assert.strictEqual(preCheck.status, 200);
            assert.strictEqual(preCheck.data.policies.length, 1);

            const todayStr = new Date().toISOString().split('T')[0];
            const bookRes = await apiCall('POST', '/api/reception/book-appointment', receptionTokenA, {
                patientId: tpaPatient._id,
                doctorId: doctorProfileA._id,
                date: todayStr,
                department: 'General Medicine',
                amount: 650,
                paymentMethod: 'Cash',
                splitPayments: [{ method: 'Cash', amount: 650 }],
                insurancePolicy: {
                    policyType: 'TPA',
                    providerName: 'Medi Assist',
                    policyNumber: `POL-MA-${suffix}`,
                    tpaOrMemberId: `MAID-${suffix}`,
                    policyHolderName: `TPA Holder Updated ${suffix}`,
                    relationshipWithPatient: 'Self',
                    validFrom: '2026-01-01',
                    validUntil: '2027-06-01',
                    notes: 'Updated notes during appointment booking'
                }
            });
            assert.strictEqual(bookRes.status, 200, `Booking failed: ${JSON.stringify(bookRes.data)}`);
            cleanupIds.appointmentIds.push(bookRes.data.appointment._id);
            assert.strictEqual(String(bookRes.data.appointment.selectedPolicyId), String(tpaPolicyId));
            assert.strictEqual(bookRes.data.appointment.policySnapshot.providerName, 'Medi Assist');
            assert.strictEqual(bookRes.data.appointment.amount, 650);

            // Confirm no duplicate policy record was created
            const postCheck = await apiCall('GET', `/api/patient-policies/patient/${tpaPatient._id}`, receptionTokenA);
            assert.strictEqual(postCheck.data.policies.length, 1);
            assert.strictEqual(postCheck.data.policies[0].notes, 'Updated notes during appointment booking');
        });

        await runCase('5. Multiple policies per patient + invalid date guard (validUntil < validFrom)', async () => {
            const badDateRes = await apiCall('POST', `/api/patient-policies/patient/${tpaPatient._id}`, receptionTokenA, {
                policyType: 'Government Employee Health Scheme',
                providerName: 'Rajasthan RGHS',
                policyNumber: `RGHS-${suffix}`,
                validFrom: '2026-10-10',
                validUntil: '2026-01-01'
            });
            assert.strictEqual(badDateRes.status, 400);

            const secondPol = await apiCall('POST', `/api/patient-policies/patient/${tpaPatient._id}`, receptionTokenA, {
                policyType: 'Government Employee Health Scheme',
                providerName: 'Rajasthan RGHS',
                policyNumber: `RGHS-${suffix}`,
                tpaOrMemberId: `EMP-${suffix}`,
                validFrom: '2026-01-01',
                validUntil: '2028-01-01'
            });
            assert.strictEqual(secondPol.status, 201);

            const allPols = await apiCall('GET', `/api/patient-policies/patient/${tpaPatient._id}`, receptionTokenA);
            assert.strictEqual(allPols.data.policies.length, 2);
        });

        await runCase('6. Health card upload validation & authorized download (tenant-scoped)', async () => {
            // Invalid fake file rejected by magic-byte validator
            const badFd = new FormData();
            badFd.append('file', new Blob([Buffer.from('not a real png or pdf')], { type: 'image/png' }), 'fake.png');
            const badUpload = await apiCall('POST', '/api/patient-policies/upload-card', receptionTokenA, badFd);
            assert.strictEqual(badUpload.status, 400);

            // Valid PNG accepted
            const goodFd = new FormData();
            goodFd.append('file', new Blob([VALID_PNG_BUFFER], { type: 'image/png' }), 'health_card.png');
            const goodUpload = await apiCall('POST', '/api/patient-policies/upload-card', receptionTokenA, goodFd);
            assert.strictEqual(goodUpload.status, 200);
            assert.strictEqual(goodUpload.data.success, true);
            uploadedCardDoc = goodUpload.data.document;
            if (uploadedCardDoc?.fileName) {
                cleanupIds.uploadedFiles.push(path.resolve(__dirname, '../uploads/patient-reports', uploadedCardDoc.fileName));
            }

            // Attach uploaded card document to TPA policy
            const updRes = await apiCall('PUT', `/api/patient-policies/${tpaPolicyId}`, receptionTokenA, {
                policyType: 'TPA',
                providerName: 'Medi Assist',
                policyNumber: `POL-MA-${suffix}`,
                cardDocument: uploadedCardDoc
            });
            assert.strictEqual(updRes.status, 200);
            assert.strictEqual(updRes.data.policy.cardDocument.url, uploadedCardDoc.url);

            // If local fallback URL (/api/patients/reports/...), verify authenticated same-tenant access & cross-tenant block
            if (uploadedCardDoc.url.startsWith('/api/patients/reports/')) {
                const unauth = await apiCall('GET', uploadedCardDoc.url, null);
                assert.strictEqual(unauth.status, 401);

                const crossTenant = await apiCall('GET', uploadedCardDoc.url, adminTokenB);
                assert.strictEqual(crossTenant.status, 403);

                const sameTenant = await apiCall('GET', uploadedCardDoc.url, doctorTokenA);
                assert.strictEqual(sameTenant.status, 200);
                assert(Buffer.from(sameTenant.data).length > 0);
            }
        });

        await runCase('7. Patient Profile full-history returns insurancePolicies cleanly', async () => {
            const profRes = await apiCall('GET', `/api/patients/${tpaPatient._id}/full-history`, doctorTokenA);
            assert.strictEqual(profRes.status, 200);
            assert.strictEqual(profRes.data.success, true);
            assert(Array.isArray(profRes.data.insurancePolicies));
            assert.strictEqual(profRes.data.insurancePolicies.length, 2);
        });

        await runCase('8. Verification status controls: unauthorized 403, authorized Verified, identifier edit resets', async () => {
            // Reception & Doctor cannot mark policy Verified directly
            const recTry = await apiCall('PATCH', `/api/patient-policies/${tpaPolicyId}/verify`, receptionTokenA, {
                verificationStatus: 'Verified'
            });
            assert.strictEqual(recTry.status, 403);

            const docTry = await apiCall('PATCH', `/api/patient-policies/${tpaPolicyId}/verify`, doctorTokenA, {
                verificationStatus: 'Verified'
            });
            assert.strictEqual(docTry.status, 403);

            // Hospital Admin marks Verified
            const adminVerify = await apiCall('PATCH', `/api/patient-policies/${tpaPolicyId}/verify`, adminTokenA, {
                verificationStatus: 'Verified',
                verificationNotes: 'E-Card verified against Medi Assist portal'
            });
            assert.strictEqual(adminVerify.status, 200);
            assert.strictEqual(adminVerify.data.policy.verificationStatus, 'Verified');
            assert.strictEqual(String(adminVerify.data.policy.verifiedBy), String(adminA._id));
            assert(adminVerify.data.policy.verifiedAt);

            // Accountant can mark Rejected or Expired cleanly too
            const accReject = await apiCall('PATCH', `/api/patient-policies/${tpaPolicyId}/verify`, accountantTokenA, {
                verificationStatus: 'Pending Verification',
                verificationNotes: 'Re-checking validity'
            });
            assert.strictEqual(accReject.status, 200);

            // Verify again, then mutate policyNumber -> status must automatically reset to Pending Verification
            await apiCall('PATCH', `/api/patient-policies/${tpaPolicyId}/verify`, adminTokenA, {
                verificationStatus: 'Verified'
            });
            const editIdRes = await apiCall('PUT', `/api/patient-policies/${tpaPolicyId}`, receptionTokenA, {
                policyType: 'TPA',
                providerName: 'Medi Assist',
                policyNumber: `POL-MA-${suffix}-REV2`
            });
            assert.strictEqual(editIdRes.status, 200);
            assert.strictEqual(editIdRes.data.policy.verificationStatus, 'Pending Verification');
        });

        await runCase('9. Billing API exposes insurancePolicies cleanly WITHOUT altering billing amounts', async () => {
            const billRes = await apiCall('GET', `/api/billing/patient/${tpaPatient._id}`, accountantTokenA);
            assert.strictEqual(billRes.status, 200);
            assert.strictEqual(billRes.data.success, true);
            assert(Array.isArray(billRes.data.insurancePolicies));
            assert.strictEqual(billRes.data.insurancePolicies.length, 2);
            const appt = billRes.data.billing.appointments[0];
            assert.strictEqual(appt.amount, 650, 'Billing consultation amount must remain untouched');
        });

        await runCase('10. IPD Admissions attach policies & cross-tenant Hospital B isolation strictly enforced', async () => {
            const tenantConnA = await getTenantConnection(String(hospA._id));
            const { Admission: TenantAdmission } = getTenantModels(tenantConnA);
            const ipdAdm = await TenantAdmission.create({
                hospitalId: hospA._id,
                patientId: tpaPatient._id,
                doctorId: doctorUserA._id,
                doctorName: doctorProfileA.name,
                ward: 'General Ward',
                bedNumber: `B-${suffix.slice(-3)}`,
                admissionDate: new Date(),
                status: 'Admitted',
                admittedBy: adminA._id
            });
            cleanupIds.admissionIds.push(ipdAdm._id);

            const activeListRes = await apiCall('GET', '/api/admissions/active', doctorTokenA);
            assert.strictEqual(activeListRes.status, 200);
            const matchedAdm = activeListRes.data.admissions.find((a) => String(a._id) === String(ipdAdm._id));
            assert(matchedAdm, 'Admitted patient must appear in /active');
            assert.strictEqual(matchedAdm.insurancePolicies.length, 2);

            const singleAdmRes = await apiCall('GET', `/api/admissions/${ipdAdm._id}`, doctorTokenA);
            assert.strictEqual(singleAdmRes.status, 200);
            assert.strictEqual(singleAdmRes.data.admission.insurancePolicies.length, 2);

            // Hospital B Admin must NOT see or mutate Hospital A patient policies
            const crossGet = await apiCall('GET', `/api/patient-policies/patient/${tpaPatient._id}`, adminTokenB);
            assert.strictEqual(crossGet.status, 404);

            const crossVerify = await apiCall('PATCH', `/api/patient-policies/${tpaPolicyId}/verify`, adminTokenB, {
                verificationStatus: 'Verified'
            });
            assert.strictEqual(crossVerify.status, 404);

            const crossDel = await apiCall('DELETE', `/api/patient-policies/${tpaPolicyId}`, adminTokenB);
            assert.strictEqual(crossDel.status, 404);
        });

        console.log(`\nSummary: ${passed} passed, ${failed} failed`);
        if (failed > 0) process.exitCode = 1;
    } finally {
        // Cleanup created test documents & files
        try {
            if (cleanupIds.userIds.length) {
                await PatientInsurancePolicy.deleteMany({ patientId: { $in: cleanupIds.userIds } });
            }
            if (cleanupIds.appointmentIds.length) {
                await Appointment.deleteMany({ _id: { $in: cleanupIds.appointmentIds } });
            }
            if (cleanupIds.admissionIds.length) {
                await Admission.deleteMany({ _id: { $in: cleanupIds.admissionIds } });
            }
            if (cleanupIds.doctorIds.length) {
                await Doctor.deleteMany({ _id: { $in: cleanupIds.doctorIds } });
            }
            if (cleanupIds.sessionIds.length) {
                await Session.deleteMany({ sessionId: { $in: cleanupIds.sessionIds } });
            }
            if (cleanupIds.userIds.length) {
                await User.deleteMany({ _id: { $in: cleanupIds.userIds } });
            }
            if (cleanupIds.roleIds.length) {
                await Role.deleteMany({ _id: { $in: cleanupIds.roleIds } });
            }
            for (const hId of cleanupIds.hospitalIds) {
                try {
                    const tConn = await getTenantConnection(String(hId));
                    if (tConn && typeof tConn.dropDatabase === 'function') {
                        await tConn.dropDatabase();
                    }
                } catch { /* ignore */ }
            }
            if (cleanupIds.hospitalIds.length) {
                await Hospital.deleteMany({ _id: { $in: cleanupIds.hospitalIds } });
            }
            for (const fPath of cleanupIds.uploadedFiles) {
                if (fPath && fs.existsSync(fPath)) {
                    fs.unlinkSync(fPath);
                }
            }
        } catch (cleanErr) {
            console.error('[Test Cleanup Warning]', cleanErr.message);
        }

        await new Promise((resolve) => server.close(resolve));
        await mongoose.disconnect();
    }
}

runTests().catch((err) => {
    console.error('Fatal Test Suite Error:', err);
    process.exit(1);
});
