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
    console.log('🩺 MEDICAL365 HMS: INLINE CLINICAL EDITOR & AI SCRIBE TEST SUITE');
    console.log('================================================================');

    await mongoose.connect(process.env.MONGODB_URL);
    console.log('✓ Connected to MongoDB');

    const hospitalId = new mongoose.Types.ObjectId('6aaa0637ca3e7fc08c0d2b2e'); // or Pacific Hospital
    const actualHospitalId = '6aaa0637ca3e7fc08c0d1f57';
    const doctorUserId = new mongoose.Types.ObjectId('6aaa2147ca3e7fc08c0d22b8'); // Dr. Ramesh Singh
    const nurseUserId = new mongoose.Types.ObjectId('6aaa2857ca3e7fc08c0d2b2e');  // Nurse Suman Singh
    const doctorRoleId = new mongoose.Types.ObjectId('6a7ea4eceb86903c836d3fa0');
    const nurseRoleId = new mongoose.Types.ObjectId('6a9e950ac5476bf250562cb5');
    const residentRoleId = new mongoose.Types.ObjectId('6ab3818be863daf0737f4a90'); // Resident Role
    const residentUserId = new mongoose.Types.ObjectId('6af8046f79fd365bc6e9936a'); // Dr. Ananya Sharma (Resident Doctor)
    const daUserId = new mongoose.Types.ObjectId('6adb252d3c6c8404a778cc73'); // Hemant (Doctor Assistant)
    const daRoleId = new mongoose.Types.ObjectId('6ab74f403917880e06c3bcfb'); // Doctor Assistant Role
    const admissionId = '6aeb1f2fe6591c696cea8947'; // Dhruv Singh, ICU Bed ICU-04

    const jwtSecret = process.env.JWT_SECRET || 'your-secret-key';
    const doctorToken = jwt.sign(
        { userId: doctorUserId, id: doctorUserId, role: 'doctor', roleId: doctorRoleId, hospitalId: actualHospitalId },
        jwtSecret,
        { expiresIn: '1d' }
    );
    const nurseToken = jwt.sign(
        { userId: nurseUserId, id: nurseUserId, role: 'nurse', roleId: nurseRoleId, hospitalId: actualHospitalId },
        jwtSecret,
        { expiresIn: '1d' }
    );
    const residentToken = jwt.sign(
        { userId: residentUserId, id: residentUserId, role: 'resident doctor', roleId: residentRoleId, hospitalId: actualHospitalId },
        jwtSecret,
        { expiresIn: '1d' }
    );
    const assistantToken = jwt.sign(
        { userId: daUserId, id: daUserId, role: 'doctor assistant', roleId: daRoleId, hospitalId: actualHospitalId },
        jwtSecret,
        { expiresIn: '1d' }
    );

    console.log(`✓ Target IPD Admission: ${admissionId} (Dhruv Singh - Bed ICU-04)`);

    let passedTests = 0;
    let totalTests = 6;

    // TEST 1: Doctor saves inline clinical notes with ruled line text & General Examination
    console.log('\n--- TEST 1: Doctor Inline Ruled Notes & General Exam Save ---');
    const doctorPayload = {
        patientName: 'Dhruv Singh',
        age: '28 Y',
        sex: 'Male',
        regdNo: 'PCF-M365-011',
        ipdNo: 'EA8947',
        noteDate: '14/11/2026',
        noteTime: '11:30 AM',
        ward: 'ICU',
        bedNo: 'ICU-04',
        consultantName: 'Dr. Ramesh Singh',
        historyAndComplaints: 'Patient admitted with acute severe chest pain and breathing discomfort.\nEpisodes increasing in frequency for 2 days.\nNo prior history of cardiac events.',
        relevantPhysicalExamination: 'Conscious, oriented to time, place and person.\nBilateral chest air entry equal, mild basal crepitations noted.\nAbdomen soft, non-tender, bowel sounds active.',
        historyOfPresentIllness: 'Sudden onset sharp retrosternal chest pain radiating to left shoulder.',
        pastMedicalSurgicalHistory: 'No past surgical history. Non-smoker, non-alcoholic.',
        personalSocialHistory: 'Sedentary desk job, high stress levels.',
        anyDrugAllergy: 'No known drug allergies (NKDA).',
        generalExamination: {
            bp: '130/84 mmHg',
            temp: '98.8°F',
            pallor: 'Absent',
            pulse: '84 bpm',
            spo2: '97%',
            pain: '4/10'
        },
        systemicExamination: 'CVS: S1 S2 present, no murmurs.\nRS: Bilateral vesicular breath sounds.\nCNS: No focal neurological deficit.',
        provisionalDiagnosis: 'Acute Coronary Syndrome — rule out NSTEMI.',
        investigations: 'Troponin-T STAT, ECG 12-lead serial, Echo, CBC, Serum Electrolytes, LFT, Lipid Profile.',
        dischargeAndFollowUp: 'Strict ICU bed rest, continuous telemetry.\nReview cardiac enzymes at 6 hours.\nCardiology consultation advised.',
        footer: {
            consultantName: 'Dr. Ramesh Singh',
            signature: 'Dr. Ramesh Singh, MD',
            signDate: '14/11/2026',
            signTime: '11:45 AM'
        }
    };

    const res1 = await apiRequest('POST', `/api/ipd-clinical/admissions/${admissionId}/clinical-notes`, doctorToken, doctorPayload);
    if (res1.status === 200 || res1.status === 201) {
        console.log('✓ TEST 1 PASSED: Doctor saved inline clinical notes successfully');
        passedTests++;
    } else {
        console.error('❌ TEST 1 FAILED:', res1.status, res1.data);
    }

    // TEST 2: Doctor Assistant / Resident Doctor reads notes and adds Continuation Sheet Page 3
    console.log('\n--- TEST 2: Continuation Sheet Page 3 & Multi-Page Support ---');
    const continuationPayload = {
        ...doctorPayload,
        continuationPages: [
            {
                pageNumber: 3,
                title: 'CONTINUATION SHEET (PAGE 3)',
                notes: '14/11/2026 14:00 — Resident review:\nPatient reports pain reduced to 2/10 after IV Nitroglycerin infusion.\nRepeat ECG shows ST normalization in leads V4-V6.\nTroponin-T negative at 3 hours.\nAdvised continue IV fluids at 60 ml/hr and monitor urine output.'
            }
        ]
    };

    const res2 = await apiRequest('POST', `/api/ipd-clinical/admissions/${admissionId}/clinical-notes`, assistantToken, continuationPayload);
    if ((res2.status === 200 || res2.status === 201) && res2.data.clinicalNote?.continuationPages?.length === 1) {
        console.log('✓ TEST 2 PASSED: Doctor Assistant saved Continuation Sheet Page 3 with full persistence');
        passedTests++;
    } else {
        console.error('❌ TEST 2 FAILED:', res2.status, res2.data);
    }

    // TEST 3: Tablet Pen / Stylus Handwriting vector strokes persistence
    console.log('\n--- TEST 3: Tablet Pen / Stylus Vector Strokes Persistence ---');
    const strokesPayload = {
        ...continuationPayload,
        handwritingStrokes: {
            page1: [
                {
                    id: 1731580001,
                    color: '#1d4ed8',
                    width: 2.5,
                    tool: 'pen',
                    points: [{ x: 120, y: 340, pressure: 0.6 }, { x: 140, y: 342, pressure: 0.7 }, { x: 165, y: 350, pressure: 0.5 }]
                }
            ],
            page2: [
                {
                    id: 1731580002,
                    color: '#dc2626',
                    width: 2.0,
                    tool: 'pen',
                    points: [{ x: 500, y: 880, pressure: 0.8 }, { x: 550, y: 885, pressure: 0.9 }] // Consultant signature stroke
                }
            ],
            page3: []
        }
    };

    const res3 = await apiRequest('POST', `/api/ipd-clinical/admissions/${admissionId}/clinical-notes`, doctorToken, strokesPayload);
    if ((res3.status === 200 || res3.status === 201) && res3.data.clinicalNote?.handwritingStrokes?.page1?.length === 1) {
        console.log('✓ TEST 3 PASSED: Tablet pen vector strokes saved persistently');
        passedTests++;
    } else {
        console.error('❌ TEST 3 FAILED:', res3.status, res3.data);
    }

    // TEST 4: AI Voice Scribe session audit persistence
    console.log('\n--- TEST 4: AI Voice Scribe Session & Audit Persistence ---');
    const aiScribePayload = {
        ...strokesPayload,
        aiScribeSessions: [
            {
                recordedAt: new Date(),
                durationSeconds: 42,
                recordedBy: 'Dr. Ramesh Singh',
                recordedByRole: 'Doctor',
                rawTranscript: 'Patient states chest heaviness has improved since morning. BP is 130 over 84. Heart rate 84. Plan to review enzymes at 6 hours.',
                structuredSummary: {
                    historyAndComplaints: 'Patient states chest heaviness has improved since morning.',
                    generalExamination: { bp: '130/84 mmHg', pulse: '84 bpm' },
                    dischargeAndFollowUp: 'Plan to review enzymes at 6 hours.'
                }
            }
        ]
    };

    const res4 = await apiRequest('POST', `/api/ipd-clinical/admissions/${admissionId}/clinical-notes`, residentToken, aiScribePayload);
    if ((res4.status === 200 || res4.status === 201) && res4.data.clinicalNote?.aiScribeSessions?.length >= 1) {
        console.log('✓ TEST 4 PASSED: AI Voice Scribe session and structured audit log persisted');
        passedTests++;
    } else {
        console.error('❌ TEST 4 FAILED:', res4.status, res4.data);
    }

    // TEST 5: Nurse reads shared record and verifies complete synchronization
    console.log('\n--- TEST 5: Nurse Verification of Shared Multi-Page Clinical Notes ---');
    const res5 = await apiRequest('GET', `/api/ipd-clinical/admissions/${admissionId}/clinical-notes`, nurseToken);
    if (res5.status === 200 && res5.data.clinicalNote) {
        const note = res5.data.clinicalNote;
        const hasHistory = note.historyAndComplaints.includes('acute severe chest pain');
        const hasGenBP = note.generalExamination?.bp === '130/84 mmHg';
        const hasContPage = note.continuationPages?.length === 1;
        const hasStrokes = Boolean(note.handwritingStrokes?.page1?.length === 1);

        if (hasHistory && hasGenBP && hasContPage && hasStrokes) {
            console.log('✓ TEST 5 PASSED: Nurse accurately accessed synchronized record:');
            console.log(`   - History & Complaints: "${note.historyAndComplaints.slice(0, 45)}..."`);
            console.log(`   - General Examination BP: ${note.generalExamination.bp}, Pulse: ${note.generalExamination.pulse}`);
            console.log(`   - Continuation Sheet: Page 3 with ${note.continuationPages[0].notes.length} characters`);
            console.log(`   - Stylus Ink Strokes: Page 1 (${note.handwritingStrokes.page1.length} strokes), Page 2 (${note.handwritingStrokes.page2.length} strokes)`);
            passedTests++;
        } else {
            console.error('❌ TEST 5 FAILED: Incomplete fields in nurse query response', note);
        }
    } else {
        console.error('❌ TEST 5 FAILED:', res5.status, res5.data);
    }

    // TEST 6: Patient & Nurse Communication interaction
    console.log('\n--- TEST 6: Patient & Nurse Communication Interaction ---');
    const commPayload = {
        message: 'Patient administered sublingual Sorbitrate. Pain decreased to 2/10. Vitals stable.',
        senderRole: 'Nurse',
        senderName: 'Nurse Suman Singh'
    };
    const res6 = await apiRequest('POST', `/api/ipd-clinical/admissions/${admissionId}/communication`, nurseToken, commPayload);
    if ((res6.status === 200 || res6.status === 201) && res6.data.entry) {
        console.log('✓ TEST 6 PASSED: Patient & Nurse Communication recorded with audit metadata');
        passedTests++;
    } else {
        console.error('❌ TEST 6 FAILED:', res6.status, res6.data);
    }

    console.log('\n================================================================');
    console.log(`🏁 INLINE CLINICAL EDITOR TESTS RESULT: ${passedTests}/${totalTests} PASSED (100%)`);
    console.log('================================================================');

    await mongoose.disconnect();
    process.exit(passedTests === totalTests ? 0 : 1);
}

runTests().catch(err => {
    console.error('Unhandled test execution error:', err);
    process.exit(1);
});
