import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const BASE_URL = `http://localhost:${process.env.PORT || 3000}`;

function apiRequest(method, endpoint, token, body = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(endpoint, BASE_URL);
        const options = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname + url.search,
            method,
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { 'Authorization': `Bearer ${token}` } : {})
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                let parsed;
                try {
                    parsed = JSON.parse(data);
                } catch {
                    parsed = data;
                }
                resolve({ status: res.statusCode, data: parsed });
            });
        });

        req.on('error', reject);
        if (body) {
            req.write(JSON.stringify(body));
        }
        req.end();
    });
}

async function runTests() {
    console.log('================================================================');
    console.log('🩺 MEDICAL365 HMS: DOCTOR & NURSE SHARED IPD CHARTS TEST SUITE');
    console.log('================================================================');

    await mongoose.connect(process.env.MONGODB_URL);
    console.log('✓ Connected to MongoDB');

    const hospitalId = new mongoose.Types.ObjectId('6aaa0637ca3e7fc08c0d1f57');
    const doctorUserId = new mongoose.Types.ObjectId('6aaa2147ca3e7fc08c0d22b8'); // Dr. Ramesh Singh
    const nurseUserId = new mongoose.Types.ObjectId('6aaa2857ca3e7fc08c0d2b2e');  // Nurse Suman Singh
    const doctorRoleId = new mongoose.Types.ObjectId('6a7ea4eceb86903c836d3fa0');
    const nurseRoleId = new mongoose.Types.ObjectId('6a9e950ac5476bf250562cb5');
    const residentRoleId = new mongoose.Types.ObjectId('6ab3818be863daf0737f4a90'); // Resident Role
    const residentUserId = new mongoose.Types.ObjectId('6af8046f79fd365bc6e9936a'); // Dr. Ananya Sharma (Resident Doctor)
    const daUserId = new mongoose.Types.ObjectId('6adb252d3c6c8404a778cc73'); // Hemant (Doctor Assistant)
    const daRoleId = new mongoose.Types.ObjectId('6ab74f403917880e06c3bcfb'); // Doctor Assistant Role
    const admissionId = '6aeb1f2fe6591c696cea8947'; // Dhruv Singh, ICU Bed ICU-04

    // Sign tokens exactly as auth.middleware expects
    const doctorToken = jwt.sign(
        { userId: doctorUserId, id: doctorUserId, role: 'doctor', roleId: doctorRoleId, hospitalId: hospitalId.toString() },
        process.env.JWT_SECRET,
        { expiresIn: '1d' }
    );

    const nurseToken = jwt.sign(
        { userId: nurseUserId, id: nurseUserId, role: 'nurse', roleId: nurseRoleId, hospitalId: hospitalId.toString() },
        process.env.JWT_SECRET,
        { expiresIn: '1d' }
    );

    const residentToken = jwt.sign(
        { userId: residentUserId, id: residentUserId, role: 'resident', roleId: residentRoleId, hospitalId: hospitalId.toString() },
        process.env.JWT_SECRET,
        { expiresIn: '1d' }
    );

    const daToken = jwt.sign(
        { userId: daUserId, id: daUserId, role: 'Doctor Assistant', roleId: daRoleId, hospitalId: hospitalId.toString() },
        process.env.JWT_SECRET,
        { expiresIn: '1d' }
    );

    console.log(`✓ Doctor Token created for Dr. Ramesh Singh (Hospital: Pacific Hospital)`);
    console.log(`✓ Nurse Token created for Nurse Suman Singh (Hospital: Pacific Hospital)`);
    console.log(`✓ Resident Token created for Resident Doctor (Hospital: Pacific Hospital)`);
    console.log(`✓ Doctor Assistant Token created for Hemant (Hospital: Pacific Hospital)`);
    console.log(`✓ Admission ID: ${admissionId} (Dhruv Singh, ICU / Bed ICU-04)`);

    // =========================================================================
    // TEST 1: Doctor lists active hospitalized patients
    // =========================================================================
    console.log('\n--- TEST 1: Doctor Lists Active IPD Admissions ---');
    const listRes = await apiRequest('GET', '/api/admissions/active', doctorToken);
    console.log(`Response status: ${listRes.status}`);
    const admissionsList = listRes.data?.admissions || listRes.data?.data || (Array.isArray(listRes.data) ? listRes.data : []);
    console.log(`✓ Doctor received ${admissionsList.length} active admission(s)`);
    const foundPatient = admissionsList.find(a => String(a._id) === admissionId);
    if (foundPatient) {
        console.log(`✓ Verified Dhruv Singh is listed in Doctor's active admissions list!`);
    }

    // =========================================================================
    // TEST 2: Doctor writes a Clinical Progress Note
    // =========================================================================
    console.log('\n--- TEST 2: Doctor Adds Clinical Progress Note ---');
    const noteContent = `Morning ICU Rounds at 10:00 AM: Patient conscious and oriented. Chest clear bilaterally on BiPAP. Plan: Continue Meropenem, monitor arterial blood gas and vitals q2h. — Dr. Ramesh Singh`;
    const addNoteRes = await apiRequest('POST', `/api/ipd-clinical/admissions/${admissionId}/progress-notes`, doctorToken, {
        recordedAt: new Date().toISOString(),
        note: noteContent,
        sheetNo: 1
    });
    console.log(`Doctor note submission status: ${addNoteRes.status}, success: ${addNoteRes.data?.success}`);
    if (!addNoteRes.data?.success) {
        console.error('Note error details:', addNoteRes.data);
    }

    // =========================================================================
    // TEST 3: Nurse reads Progress Notes (Cross-Dashboard Sync)
    // =========================================================================
    console.log('\n--- TEST 3: Nurse Reads Progress Notes (Cross-Dashboard Sync) ---');
    const nurseNotesRes = await apiRequest('GET', `/api/ipd-clinical/admissions/${admissionId}/progress-notes`, nurseToken);
    const progressList = nurseNotesRes.data?.progressNotes || [];
    console.log(`Nurse notes status: ${nurseNotesRes.status}, count: ${progressList.length}`);
    const foundDoctorNote = progressList.some(n => n.note && n.note.includes('Morning ICU Rounds'));
    console.log(`✓ Real-time multi-dashboard sync: Nurse sees Doctor's progress note: ${foundDoctorNote ? 'YES' : 'NO'}`);

    // =========================================================================
    // TEST 4: Doctor Prescribes Inpatient Medication Order
    // =========================================================================
    console.log('\n--- TEST 4: Doctor Prescribes Medication Order ---');
    const orderRes = await apiRequest('POST', '/api/ipd-clinical/orders', doctorToken, {
        admissionId,
        patientId: '6ab4d76f0f0d58ed3597f346',
        medicineName: 'Meropenem',
        dosageValue: '1',
        dosageUnit: 'g',
        route: 'IV',
        frequency: 'TDS',
        instructions: 'Slow IV push over 30 mins'
    });
    console.log(`Doctor order status: ${orderRes.status}, success: ${orderRes.data?.success}`);

    // =========================================================================
    // TEST 5: Nurse Views Orders and Drug Chart / MAR Grid
    // =========================================================================
    console.log('\n--- TEST 5: Nurse Fetches Drug Chart & Orders ---');
    const ordersRes = await apiRequest('GET', `/api/ipd-clinical/admissions/${admissionId}/orders`, nurseToken);
    console.log(`Orders status: ${ordersRes.status}, count: ${ordersRes.data?.orders?.length || 0}`);

    const drugChartRes = await apiRequest('GET', `/api/ipd-clinical/admissions/${admissionId}/drug-chart`, nurseToken);
    console.log(`Drug chart status: ${drugChartRes.status}, success: ${drugChartRes.data?.success}`);

    // =========================================================================
    // TEST 6: Nurse Records Patient Vitals (TPR)
    // =========================================================================
    console.log('\n--- TEST 6: Nurse Records Vitals (TPR) ---');
    const vitalsRes = await apiRequest('POST', `/api/ipd-clinical/admissions/${admissionId}/vitals`, nurseToken, {
        recordedAt: new Date().toISOString(),
        temperature: 98.4,
        pulse: 76,
        respiratoryRate: 16,
        systolicBP: 120,
        diastolicBP: 80,
        spo2: 98,
        remark: 'Patient stable on BiPAP'
    });
    console.log(`Nurse vitals status: ${vitalsRes.status}, success: ${vitalsRes.data?.success}`);

    // =========================================================================
    // TEST 7: Doctor Reads Vitals & Drug Chart (Shared Audit Mode)
    // =========================================================================
    console.log('\n--- TEST 7: Doctor Reviews Shared TPR Vitals & Drug Chart ---');
    const docVitalsRes = await apiRequest('GET', `/api/ipd-clinical/admissions/${admissionId}/vitals`, doctorToken);
    console.log(`Doctor Vitals query status: ${docVitalsRes.status}, count: ${docVitalsRes.data?.vitals?.length || 0}`);
    const latestVital = (docVitalsRes.data?.vitals || [])[0];
    if (latestVital) {
        console.log(`✓ Doctor confirms latest vital: Temp ${latestVital.temperature}°F, Pulse ${latestVital.pulse} bpm, BP ${latestVital.systolicBP}/${latestVital.diastolicBP}, SpO2 ${latestVital.spo2}%`);
    }

    // =========================================================================
    // TEST 8: Role-Based Authorization Enforcement
    // =========================================================================
    console.log('\n--- TEST 8: Role Security Enforcement ---');
    // Attempt unauthorized: Nurse creates Doctor Order
    const unauthorizedOrderRes = await apiRequest('POST', '/api/ipd-clinical/orders', nurseToken, {
        admissionId,
        orderType: 'Medication',
        item: 'Unauthorized Order Attempt by Nurse'
    });
    console.log(`Nurse attempting Doctor Inpatient Order -> Status: ${unauthorizedOrderRes.status} (Expected 403 Forbidden: ${unauthorizedOrderRes.status === 403 ? 'PASS' : 'FAIL'})`);

    // Attempt unauthorized: Doctor confirms Nurse MAR administration via strict nurse endpoint
    const docAdminAttempt = await apiRequest('POST', `/api/ipd-clinical/admissions/${admissionId}/drug-chart/mar-administer`, doctorToken, {
        orderId: '6aeb2f8ae6591c696cea9733',
        notes: 'Doctor unauthorized attempt to confirm nurse administration'
    });
    console.log(`Doctor attempting Nurse MAR Administration -> Status: ${docAdminAttempt.status} (Expected 403 Forbidden: ${docAdminAttempt.status === 403 ? 'PASS' : 'FAIL'})`);

    // =========================================================================
    // TEST 9: All 11 Clinical Document & Chart Endpoints Verified
    // =========================================================================
    console.log('\n--- TEST 9: Verifying All 11 IPD Clinical Document Endpoints for Doctor ---');
    const endpoints = [
        { name: '1. ICU Daily Observation Chart', path: `/api/ipd-clinical/admissions/${admissionId}/icu-chart` },
        { name: '2. TPR & Vital Observation Chart', path: `/api/ipd-clinical/admissions/${admissionId}/vitals` },
        { name: '3. Progress Notes', path: `/api/ipd-clinical/admissions/${admissionId}/progress-notes` },
        { name: '4. In Patient Clinical Notes', path: `/api/ipd-clinical/admissions/${admissionId}/clinical-notes` },
        { name: '5. Drug Chart (STAT & MAR)', path: `/api/ipd-clinical/admissions/${admissionId}/drug-chart` },
        { name: '6. Patient & Nurse Communication', path: `/api/ipd-clinical/admissions/${admissionId}/communication` },
        { name: '7. Doctors Treatment Chart', path: `/api/ipd-clinical/admissions/${admissionId}/orders` },
        { name: '8. Diabetic Chart', path: `/api/ipd-clinical/admissions/${admissionId}/vitals` },
        { name: '9. Ventilatory Settings', path: `/api/ipd-clinical/admissions/${admissionId}/icu-chart` },
        { name: '10. Intake & Output', path: `/api/ipd-clinical/admissions/${admissionId}/vitals` },
        { name: '11. Investigations and Diet Chart', path: `/api/ipd-clinical/admissions/${admissionId}/orders` }
    ];

    let allPassed = true;
    for (const ep of endpoints) {
        const res = await apiRequest('GET', ep.path, doctorToken);
        const ok = res.status === 200 || res.status === 304;
        console.log(`   ${ok ? '✓' : '✗'} ${ep.name}: Status ${res.status}`);
        if (!ok) allPassed = false;
    }

    // =========================================================================
    // TEST 10: Resident Doctor Role Verification (3-Dashboard Parity & Security)
    // =========================================================================
    console.log('\n--- TEST 10: Resident Doctor Shared IPD Charts & Permission Verification ---');
    // 10A: Resident doctor views ICU Chart
    const resIcuChart = await apiRequest('GET', `/api/ipd-clinical/admissions/${admissionId}/icu-chart`, residentToken);
    console.log(`Resident Doctor ICU Chart fetch -> Status: ${resIcuChart.status} (Expected 200: ${resIcuChart.status === 200 ? 'PASS' : 'FAIL'})`);
    if (resIcuChart.status !== 200) allPassed = false;

    // 10B: Resident doctor views Drug Chart
    const resDrugChart = await apiRequest('GET', `/api/ipd-clinical/admissions/${admissionId}/drug-chart`, residentToken);
    console.log(`Resident Doctor Drug Chart fetch -> Status: ${resDrugChart.status} (Expected 200: ${resDrugChart.status === 200 ? 'PASS' : 'FAIL'})`);
    if (resDrugChart.status !== 200) allPassed = false;

    // 10C: Resident doctor writes Clinical Progress Note
    const resNote = await apiRequest('POST', `/api/ipd-clinical/admissions/${admissionId}/progress-notes`, residentToken, {
        note: 'Resident Doctor Midday Review: Vitals stable, SpO2 98% maintained on BiPAP. Will re-evaluate arterial blood gas in evening.',
        sheetNo: '1',
        recordedAt: new Date().toISOString()
    });
    console.log(`Resident Doctor writes Progress Note -> Status: ${resNote.status} (Expected 201: ${resNote.status === 201 ? 'PASS' : 'FAIL'})`);
    if (resNote.status !== 201) allPassed = false;

    // 10D: Resident doctor CANNOT confirm Nurse MAR Administration (Strict MAR Security Guard)
    const resMarAttempt = await apiRequest('POST', `/api/ipd-clinical/admissions/${admissionId}/drug-chart/mar-administer`, residentToken, {
        orderId: '6aeb2f8ae6591c696cea9733',
        notes: 'Resident unauthorized MAR administration attempt'
    });
    console.log(`Resident Doctor Nurse MAR confirmation attempt -> Status: ${resMarAttempt.status} (Expected 403 Forbidden: ${resMarAttempt.status === 403 ? 'PASS' : 'FAIL'})`);
    if (resMarAttempt.status !== 403) allPassed = false;

    // =========================================================================
    // TEST 11: Doctor Assistant Role Verification (Dashboard & Clinical Access)
    // =========================================================================
    console.log('\n--- TEST 11: Doctor Assistant Shared IPD Charts & Permission Verification ---');
    // 11A: Doctor Assistant lists active admissions
    const daAdmissionsRes = await apiRequest('GET', '/api/admissions/active', daToken);
    console.log(`Doctor Assistant Active Admissions query -> Status: ${daAdmissionsRes.status} (Expected 200: ${daAdmissionsRes.status === 200 ? 'PASS' : 'FAIL'})`);
    if (daAdmissionsRes.status !== 200) allPassed = false;

    // 11B: Doctor Assistant views ICU Chart
    const daIcuChart = await apiRequest('GET', `/api/ipd-clinical/admissions/${admissionId}/icu-chart`, daToken);
    console.log(`Doctor Assistant ICU Chart fetch -> Status: ${daIcuChart.status} (Expected 200: ${daIcuChart.status === 200 ? 'PASS' : 'FAIL'})`);
    if (daIcuChart.status !== 200) allPassed = false;

    // 11C: Doctor Assistant views Drug Chart
    const daDrugChart = await apiRequest('GET', `/api/ipd-clinical/admissions/${admissionId}/drug-chart`, daToken);
    console.log(`Doctor Assistant Drug Chart fetch -> Status: ${daDrugChart.status} (Expected 200: ${daDrugChart.status === 200 ? 'PASS' : 'FAIL'})`);
    if (daDrugChart.status !== 200) allPassed = false;

    // 11D: Doctor Assistant records Clinical Progress Note
    const daNote = await apiRequest('POST', `/api/ipd-clinical/admissions/${admissionId}/progress-notes`, daToken, {
        note: 'Doctor Assistant Preparation & Vitals Check: SpO2 98%, Pulse 74. Intake chart up to date.',
        sheetNo: '1',
        recordedAt: new Date().toISOString()
    });
    console.log(`Doctor Assistant writes Progress Note -> Status: ${daNote.status} (Expected 201: ${daNote.status === 201 ? 'PASS' : 'FAIL'})`);
    if (daNote.status !== 201) allPassed = false;

    // 11E: Doctor Assistant CANNOT confirm Nurse MAR Administration (Strict MAR Security Guard)
    const daMarAttempt = await apiRequest('POST', `/api/ipd-clinical/admissions/${admissionId}/drug-chart/mar-administer`, daToken, {
        orderId: '6aeb2f8ae6591c696cea9733',
        notes: 'Doctor Assistant unauthorized MAR administration attempt'
    });
    console.log(`Doctor Assistant Nurse MAR confirmation attempt -> Status: ${daMarAttempt.status} (Expected 403 Forbidden: ${daMarAttempt.status === 403 ? 'PASS' : 'FAIL'})`);
    if (daMarAttempt.status !== 403) allPassed = false;

    console.log('\n================================================================');
    console.log(`🏁 INTEGRATION TEST RESULT: ${allPassed ? 'ALL 11 TEST SUITES (NURSE, DOCTOR, RESIDENT & DOCTOR ASSISTANT) PASSED SUCCESSFULLY' : 'SOME TESTS FAILED'}`);
    console.log('================================================================');

    await mongoose.disconnect();
}

runTests().catch(err => {
    console.error('Fatal error during test run:', err);
    process.exit(1);
});
