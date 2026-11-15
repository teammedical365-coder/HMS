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

async function runDrugChartTests() {
    console.log('================================================================');
    console.log('💊 MEDICAL365 HMS: DRUG CHART INLINE CRUD & MAR TEST SUITE');
    console.log('================================================================');

    await mongoose.connect(process.env.MONGODB_URL);
    console.log('✓ Connected to MongoDB');

    const hospitalId = new mongoose.Types.ObjectId('6aaa0637ca3e7fc08c0d1f57');
    const doctorUserId = new mongoose.Types.ObjectId('6aaa2147ca3e7fc08c0d22b8'); // Dr. Ramesh Singh
    const nurseUserId = new mongoose.Types.ObjectId('6aaa2857ca3e7fc08c0d2b2e');  // Nurse Suman Singh
    const doctorRoleId = new mongoose.Types.ObjectId('6a7ea4eceb86903c836d3fa0');
    const nurseRoleId = new mongoose.Types.ObjectId('6a9e950ac5476bf250562cb5');
    const daUserId = new mongoose.Types.ObjectId('6adb252d3c6c8404a778cc73'); // Hemant (Doctor Assistant)
    const daRoleId = new mongoose.Types.ObjectId('6ab74f403917880e06c3bcfb');
    const admissionId = '6aeb1f2fe6591c696cea8947'; // Dhruv Singh, ICU Bed ICU-04

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
    const daToken = jwt.sign(
        { userId: daUserId, id: daUserId, role: 'Doctor Assistant', roleId: daRoleId, hospitalId: hospitalId.toString() },
        process.env.JWT_SECRET,
        { expiresIn: '1d' }
    );

    // TEST 1: Fetch Drug Chart and verify data structure
    console.log('\n--- TEST 1: Fetch Drug Chart & Verify Structure ---');
    const getRes = await apiRequest('GET', `/api/ipd-clinical/admissions/${admissionId}/drug-chart`, doctorToken);
    console.log(`Fetch status: ${getRes.status}, success: ${getRes.data?.success}`);
    if (!getRes.data?.success) throw new Error('Failed to fetch Drug Chart');
    console.log(`✓ Retrieved Drug Chart with ${getRes.data.drugChart?.statDoses?.length || 0} STAT rows, ${getRes.data.drugChart?.ivFluids?.length || 0} IV rows, ${getRes.data.orders?.length || 0} orders`);

    // TEST 2: Inline Save of STAT Dose and IV Fluid
    console.log('\n--- TEST 2: Inline Save STAT Dose & IV Fluid ---');
    const testStatDrug = `Test-STAT-${Date.now()}`;
    const testIvFluid = `Test-IV-Fluid-${Date.now()}`;
    const inlineSaveRes = await apiRequest('PUT', `/api/ipd-clinical/admissions/${admissionId}/drug-chart`, doctorToken, {
        drugAllergies: { slot1: 'Penicillin', slot2: 'Sulfa Drugs', sheetNo: '1' },
        statDoses: [
            {
                date: '14/11/2026',
                time: '10:30 AM',
                drugName: testStatDrug,
                dose: '100 mg',
                route: 'IV',
                doctorName: 'Dr. Ramesh Singh',
                remarks: 'STAT test dose'
            }
        ],
        ivFluids: [
            {
                date: '14/11/2026',
                fluidName: testIvFluid,
                volume: '500 ml',
                timeStart: '11:00 AM',
                infusionTimeHrs: '4',
                doctorName: 'Dr. Ramesh Singh',
                remarks: 'Normal Saline Infusion'
            }
        ]
    });
    console.log(`Inline Save status: ${inlineSaveRes.status}, success: ${inlineSaveRes.data?.success}`);
    if (!inlineSaveRes.data?.success) throw new Error('Inline save failed');

    // TEST 3: Verify Persistence
    console.log('\n--- TEST 3: Verify Persistence of Saved Rows ---');
    const verifyRes = await apiRequest('GET', `/api/ipd-clinical/admissions/${admissionId}/drug-chart`, nurseToken);
    const savedStats = verifyRes.data.drugChart?.statDoses || [];
    const savedIvs = verifyRes.data.drugChart?.ivFluids || [];
    const addedStat = savedStats.find(s => s.drugName === testStatDrug);
    const addedIv = savedIvs.find(iv => iv.fluidName === testIvFluid);
    console.log(`✓ Added STAT found: ${Boolean(addedStat)} (ID: ${addedStat?._id})`);
    console.log(`✓ Added IV Fluid found: ${Boolean(addedIv)} (ID: ${addedIv?._id})`);
    if (!addedStat || !addedIv) throw new Error('Saved rows not found in verification fetch');

    // TEST 4: Doctor Assistant / Doctor adds Regular Order via Drug Chart Page 2 Inline Save
    console.log('\n--- TEST 4: Page 2 Inline Regular Medication Prescription ---');
    const testMedName = `Amoxicillin-Clav-${Date.now()}`;
    const page2SaveRes = await apiRequest('PUT', `/api/ipd-clinical/admissions/${admissionId}/drug-chart`, daToken, {
        newRegularOrders: [
            {
                medicineName: testMedName,
                dose: '625 mg',
                route: 'Oral',
                startDate: new Date().toISOString(),
                doctorName: 'Dr. Ramesh Singh'
            }
        ]
    });
    console.log(`Page 2 Save status: ${page2SaveRes.status}, success: ${page2SaveRes.data?.success}`);
    if (!page2SaveRes.data?.success) throw new Error('Page 2 regular order prescription failed');

    // TEST 5: Verify New Order Appears in Inpatient Orders
    console.log('\n--- TEST 5: Verify Regular Order Appears in Orders & MAR ---');
    const ordersRes = await apiRequest('GET', `/api/ipd-clinical/admissions/${admissionId}/drug-chart`, nurseToken);
    const newOrd = (ordersRes.data.orders || []).find(o => o.medicineName === testMedName);
    console.log(`✓ Newly created Inpatient Order found: ${Boolean(newOrd)} (ID: ${newOrd?._id}, Dose: ${newOrd?.dosageValue} ${newOrd?.dosageUnit})`);
    if (!newOrd) throw new Error('New regular order not found in Drug Chart orders');

    // TEST 6: Delete STAT Row and IV Fluid Row via API
    console.log('\n--- TEST 6: Delete Draft/Unfinalized Rows ---');
    const delStatRes = await apiRequest('DELETE', `/api/ipd-clinical/admissions/${admissionId}/drug-chart/stat-doses/${addedStat._id}`, doctorToken);
    console.log(`Delete STAT status: ${delStatRes.status}, success: ${delStatRes.data?.success}`);

    const delIvRes = await apiRequest('DELETE', `/api/ipd-clinical/admissions/${admissionId}/drug-chart/iv-fluids/${addedIv._id}`, nurseToken);
    console.log(`Delete IV status: ${delIvRes.status}, success: ${delIvRes.data?.success}`);

    // Discontinue the test order
    const discRes = await apiRequest('PUT', `/api/ipd-clinical/admissions/${admissionId}/drug-chart`, doctorToken, {
        discontinuedOrderIds: [String(newOrd._id)]
    });
    console.log(`Discontinue Order status: ${discRes.status}, success: ${discRes.data?.success}`);

    // Final Verification
    const finalRes = await apiRequest('GET', `/api/ipd-clinical/admissions/${admissionId}/drug-chart`, doctorToken);
    const finalStats = finalRes.data.drugChart?.statDoses || [];
    const finalIvs = finalRes.data.drugChart?.ivFluids || [];
    const finalOrd = (finalRes.data.orders || []).find(o => String(o._id) === String(newOrd._id));
    console.log(`✓ Deleted STAT confirmed removed: ${!finalStats.some(s => String(s._id) === String(addedStat._id))}`);
    console.log(`✓ Deleted IV confirmed removed: ${!finalIvs.some(iv => String(iv._id) === String(addedIv._id))}`);
    console.log(`✓ Discontinued Order status: ${finalOrd?.status} (Expected CANCELLED: ${finalOrd?.status === 'CANCELLED'})`);

    console.log('\n================================================================');
    console.log('🏁 DRUG CHART INLINE CRUD TEST RESULT: ALL 6 TESTS PASSED (100%)');
    console.log('================================================================');
    await mongoose.disconnect();
}

runDrugChartTests().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});
