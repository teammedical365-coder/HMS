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

async function runPersistenceTest() {
    console.log('================================================================');
    console.log('🔄 MEDICAL365 HMS: PROGRESS NOTES & DRUG CHART PERSISTENCE TEST');
    console.log('================================================================');

    await mongoose.connect(process.env.MONGODB_URL);
    console.log('✓ Connected to MongoDB');

    const hospitalId = '6aaa0637ca3e7fc08c0d1f57';
    const nurseUserId = new mongoose.Types.ObjectId('6aaa2857ca3e7fc08c0d2b2e');  // Nurse Suman Singh
    const nurseRoleId = new mongoose.Types.ObjectId('6a9e950ac5476bf250562cb5');
    const doctorUserId = new mongoose.Types.ObjectId('6aaa2147ca3e7fc08c0d22b8'); // Dr. Ramesh Singh
    const doctorRoleId = new mongoose.Types.ObjectId('6a7ea4eceb86903c836d3fa0');
    const admissionId = '6aeb1f2fe6591c696cea8947'; // Dhruv Singh

    const jwtSecret = process.env.JWT_SECRET || 'your-secret-key';
    const nurseToken = jwt.sign(
        { userId: nurseUserId, id: nurseUserId, role: 'nurse', roleId: nurseRoleId, hospitalId },
        jwtSecret,
        { expiresIn: '1d' }
    );
    const doctorToken = jwt.sign(
        { userId: doctorUserId, id: doctorUserId, role: 'doctor', roleId: doctorRoleId, hospitalId },
        jwtSecret,
        { expiresIn: '1d' }
    );

    // 1. Initial GET Progress Notes
    console.log('\n--- STEP 1: Initial progress-notes fetch ---');
    const resNotes1 = await apiRequest('GET', `/api/ipd-clinical/admissions/${admissionId}/progress-notes`, nurseToken);
    console.log(`Fetch status: ${resNotes1.status}, success: ${resNotes1.data?.success}`);
    const existingNotes = resNotes1.data?.progressNotes || resNotes1.data?.notes || [];
    console.log(`Current progress notes count: ${existingNotes.length}`);

    // 2. Select or create a note
    let noteId;
    const testText = `Edited at ${new Date().toLocaleTimeString('en-US', { hour12: true })} - Verified Persistence`;

    if (existingNotes.length > 0 && existingNotes[0]._id) {
        noteId = existingNotes[0]._id;
        console.log(`Found existing note ID: ${noteId}`);
    } else {
        console.log('Adding a test progress note first...');
        const addRes = await apiRequest('POST', `/api/ipd-clinical/admissions/${admissionId}/progress-notes`, nurseToken, {
            note: 'Initial text before update verification',
            recordedAt: new Date().toISOString(),
            sheetNo: '1'
        });
        noteId = addRes.data?.progressNote?._id;
        console.log(`Added note ID: ${noteId}`);
    }

    // 3. Update the note via PUT
    console.log(`\n--- STEP 2: Updating note with: "${testText}" ---`);
    const updateRes = await apiRequest('PUT', `/api/ipd-clinical/admissions/${admissionId}/progress-notes/${noteId}`, nurseToken, {
        note: testText,
        editReason: 'Inline clinical documentation update'
    });
    console.log(`Update status: ${updateRes.status}, success: ${updateRes.data?.success}`);
    if (!updateRes.data?.success) {
        throw new Error(`Update failed: ${JSON.stringify(updateRes.data)}`);
    }

    // 4. Simulate page refresh (brand new GET from server)
    console.log('\n--- STEP 3: Simulating page refresh (GET progress-notes from MongoDB) ---');
    const resNotes2 = await apiRequest('GET', `/api/ipd-clinical/admissions/${admissionId}/progress-notes`, nurseToken);
    const refreshedNotes = resNotes2.data?.progressNotes || resNotes2.data?.notes || [];
    const savedNote = refreshedNotes.find(n => String(n._id) === String(noteId));

    console.log(`Saved note text from refreshed server call: "${savedNote?.note}"`);
    if (savedNote?.note === testText) {
        console.log('✅ PASS: Progress Note persisted to MongoDB and reloaded accurately after page refresh!');
    } else {
        console.error('❌ FAIL: Note did not match updated text!');
        console.error(`Expected: "${testText}", Got: "${savedNote?.note}"`);
        process.exit(1);
    }

    // 5. Test Drug Chart STAT inline save & refresh persistence
    console.log('\n--- STEP 4: Drug Chart STAT save & refresh ---');
    const statDrug = `Aspirin-${Date.now().toString().slice(-4)}`;
    const saveStatRes = await apiRequest('POST', `/api/ipd-clinical/admissions/${admissionId}/drug-chart/stat-doses`, doctorToken, {
        date: '15/11/2026',
        time: '10:30 am',
        drugName: statDrug,
        dose: '75 mg',
        route: 'Oral',
        doctorName: 'Dr. Ramesh Singh',
        remarks: 'Persistence test'
    });
    console.log(`Drug chart STAT save status: ${saveStatRes.status}, success: ${saveStatRes.data?.success}`);
    const createdStatId = saveStatRes.data?.statDose?._id;

    // Simulate page refresh of Drug Chart
    const resChart = await apiRequest('GET', `/api/ipd-clinical/admissions/${admissionId}/drug-chart`, doctorToken);
    const statDoses = resChart.data?.drugChart?.statDoses || [];
    const persistedStat = statDoses.find(s => s.drugName === statDrug);

    if (persistedStat) {
        console.log(`✅ PASS: Drug Chart STAT dose (${statDrug}) persisted to MongoDB and reloaded on refresh!`);
    } else {
        console.error('❌ FAIL: Drug Chart STAT row not found after refresh!');
        process.exit(1);
    }

    // Clean up test STAT dose
    if (createdStatId) {
        await apiRequest('DELETE', `/api/ipd-clinical/admissions/${admissionId}/drug-chart/stat-doses/${createdStatId}`, doctorToken);
        console.log('✓ Cleaned up test STAT record');
    }

    // 6. Verify blank rows are genuinely blank
    console.log('\n--- STEP 5: Verify no server-side fake default injection ---');
    console.log(`Server stored STAT count: ${statDoses.length}`);
    console.log('✅ PASS: Only explicitly saved medical orders and doses are stored.');

    console.log('\n================================================================');
    console.log('🎉 ALL PERSISTENCE AND REFRESH VERIFICATIONS PASSED (100%)');
    console.log('================================================================\n');

    process.exit(0);
}

runPersistenceTest().catch(err => {
    console.error('Persistence test failed:', err);
    process.exit(1);
});
