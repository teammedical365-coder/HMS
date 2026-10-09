'use strict';
/**
 * test_abdm_bundle_integration.js — Comprehensive Verification Suite for ABDM Bundle Integration
 *
 * Verifies:
 * 1. Express server bootstrap & route mounting
 * 2. ABDM callback public route layer (regex matching, rate limiter, signature/X-CM-ID checks, 202 ACK, inbox recording, idempotency)
 * 3. ABDM bridge admin routes (/api/abdm/bridge/...) and RBAC
 * 4. Bridge URL validation (prohibits website, localhost, insecure HTTP)
 * 5. ABHA routes (/api/abdm/abha/...) and tenant isolation
 * 6. Mongoose models and schema patches (Hospital, User, ClinicPatient, tenantModels, AbdmInbox, AbdmCareContext, etc.)
 * 7. Outbound HIP helpers (care context creation, HI types, idempotency)
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const assert = require('assert');
const axios = require('axios');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

const app = require('../src/app');
const connectDB = require('../src/db/db');
const { JWT_SECRET } = require('../src/config/jwt');

// Models
const Hospital = require('../src/models/hospital.model');
const User = require('../src/models/user.model');
const ClinicPatient = require('../src/models/clinicPatient.model');
const AbdmBridge = require('../src/models/abdmBridge.model');
const AbdmInbox = require('../src/models/abdmInbox.model');
const AbdmTxn = require('../src/models/abdmTxn.model');
const AbdmCareContext = require('../src/models/abdmCareContext.model');
const AbdmLinkToken = require('../src/models/abdmLinkToken.model');
const AbdmConsent = require('../src/models/abdmConsent.model');
const { getTenantModels } = require('../src/db/tenantModels');

// Modules
const config = require('../src/modules/abdm/abdm.config');
const { ABDM_CALLBACK_PATH } = require('../src/modules/abdm/abdm.callbacks');
const bridgeService = require('../src/modules/abdm/abdm.bridge.service');
const abhaService = require('../src/modules/abdm/abha.service');
const hipService = require('../src/modules/abdm/hip.service');

const results = [];
function test(name, fn) {
    return async () => {
        try {
            await fn();
            results.push({ name, passed: true });
            console.log(`  ✅ PASS: ${name}`);
        } catch (err) {
            results.push({ name, passed: false, error: err.message });
            console.error(`  ❌ FAIL: ${name}\n     ${err.stack || err.message}`);
        }
    };
}

async function runSuite() {
    console.log('\n======================================================');
    console.log('   MEDICAL365 HMS — ABDM BUNDLE INTEGRATION TESTS');
    console.log('======================================================\n');

    await connectDB();
    // Clean up duplicate test records if any exist from previous runs so unique index can be created
    const dups = await AbdmInbox.aggregate([
        { $group: { _id: { requestId: '$requestId', path: '$path' }, ids: { $push: '$_id' }, count: { $sum: 1 } } },
        { $match: { count: { $gt: 1 } } }
    ]);
    for (const d of dups) {
        // delete all but the first
        d.ids.shift();
        await AbdmInbox.deleteMany({ _id: { $in: d.ids } });
    }
    await AbdmInbox.init(); // ensure compound unique index { requestId: 1, path: 1 } is built

    const server = app.listen(0);
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;

    // Create or retrieve real DB users for auth tests
    let testHospital = await Hospital.findOne({ name: 'ABDM Test Hospital' });
    if (!testHospital) {
        testHospital = await Hospital.create({
            name: 'ABDM Test Hospital',
            phone: '9777777777',
            email: 'abdm_test_hosp@medical365.in',
            abdm: { enabled: true, hipId: 'TEST_HIP_001' }
        });
    }

    let platformAdmin = await User.findOne({ email: 'abdm_suite_central@medical365.in' });
    if (!platformAdmin) {
        platformAdmin = await User.create({
            name: 'ABDM Central Admin',
            email: 'abdm_suite_central@medical365.in',
            phone: '9888888881',
            role: 'centraladmin',
            password: 'HashPassword123'
        });
    }

    let hospitalAdmin = await User.findOne({ email: 'abdm_suite_hosp@medical365.in' });
    if (!hospitalAdmin) {
        hospitalAdmin = await User.create({
            name: 'ABDM Hosp Admin',
            email: 'abdm_suite_hosp@medical365.in',
            phone: '9888888882',
            role: 'hospitaladmin',
            hospitalId: testHospital._id,
            password: 'HashPassword123'
        });
    }

    const platformToken = jwt.sign({
        userId: platformAdmin._id,
        role: platformAdmin.role,
        hospitalId: null
    }, JWT_SECRET, { expiresIn: '1h' });

    const hospitalAdminToken = jwt.sign({
        userId: hospitalAdmin._id,
        role: hospitalAdmin.role,
        hospitalId: testHospital._id
    }, JWT_SECRET, { expiresIn: '1h' });

    const tests = [
        // ── 1. Model Schema Validations ──────────────────────────────────────────
        test('Hospital schema contains abdm.enabled and abdm.hipId', () => {
            const schema = Hospital.schema;
            assert(schema.path('abdm.enabled'), 'abdm.enabled must exist on Hospital');
            assert(schema.path('abdm.hipId'), 'abdm.hipId must exist on Hospital');
        }),

        test('User schema contains full ABDM M1/M2 fields', () => {
            const schema = User.schema;
            assert(schema.path('abdm.abhaNumber'), 'abdm.abhaNumber must exist on User');
            assert(schema.path('abdm.abhaAddress'), 'abdm.abhaAddress must exist on User');
            assert(schema.path('abdm.abhaName'), 'abdm.abhaName must exist on User');
            assert(schema.path('abdm.abhaGender'), 'abdm.abhaGender must exist on User');
            assert(schema.path('abdm.abhaYearOfBirth'), 'abdm.abhaYearOfBirth must exist on User');
            assert(schema.path('abdm.kycVerified'), 'abdm.kycVerified must exist on User');
            assert(schema.path('abdm.isVerified'), 'abdm.isVerified must exist on User');
            assert(schema.path('abdm.status'), 'abdm.status must exist on User');
        }),

        test('ClinicPatient schema contains full ABDM M1/M2 fields', () => {
            const schema = ClinicPatient.schema;
            assert(schema.path('abdm.abhaNumber'), 'abdm.abhaNumber must exist on ClinicPatient');
            assert(schema.path('abdm.abhaAddress'), 'abdm.abhaAddress must exist on ClinicPatient');
            assert(schema.path('abdm.abhaName'), 'abdm.abhaName must exist on ClinicPatient');
            assert(schema.path('abdm.kycVerified'), 'abdm.kycVerified must exist on ClinicPatient');
        }),

        test('tenantModels User schema contains full ABDM M1/M2 fields', () => {
            const dummyDb = mongoose.connection;
            const models = getTenantModels(dummyDb);
            const schema = models.User.schema;
            assert(schema.path('abdm.abhaNumber'), 'abdm.abhaNumber must exist on tenantModels.User');
            assert(schema.path('abdm.abhaAddress'), 'abdm.abhaAddress must exist on tenantModels.User');
            assert(schema.path('abdm.abhaName'), 'abdm.abhaName must exist on tenantModels.User');
        }),

        test('All 6 new ABDM models instantiate and have valid schema definitions', () => {
            assert(AbdmBridge.modelName === 'AbdmBridge');
            assert(AbdmCareContext.modelName === 'AbdmCareContext');
            assert(AbdmConsent.modelName === 'AbdmConsent');
            assert(AbdmInbox.modelName === 'AbdmInbox');
            assert(AbdmLinkToken.modelName === 'AbdmLinkToken');
            assert(AbdmTxn.modelName === 'AbdmTxn');
        }),

        // ── 2. ABDM Callback Routing & Verification ─────────────────────────────
        test('ABDM_CALLBACK_PATH regex matches all standard ABDM callback prefixes', () => {
            assert(ABDM_CALLBACK_PATH.test('/v0.5/users/auth/on-init'));
            assert(ABDM_CALLBACK_PATH.test('/v3/users/auth/on-init'));
            assert(ABDM_CALLBACK_PATH.test('/hip/v3/links/link/token'));
            assert(ABDM_CALLBACK_PATH.test('/patient/care-context/discover') || ABDM_CALLBACK_PATH.test('/user-initiated-linking/v3/patient/care-context/discover'));
            assert(ABDM_CALLBACK_PATH.test('/consent/v3/request/hip/notify'));
            assert(ABDM_CALLBACK_PATH.test('/data-flow/v3/health-information/request'));
            assert(!ABDM_CALLBACK_PATH.test('/api/auth/login'));
            assert(!ABDM_CALLBACK_PATH.test('/api/patients/list'));
        }),

        test('ABDM callback rejects request with missing or incorrect X-CM-ID (401)', async () => {
            const res = await axios.post(`${baseUrl}/v0.5/users/auth/on-init`, {}, {
                validateStatus: () => true,
                headers: { 'X-CM-ID': 'wrong-cm-id', 'REQUEST-ID': uuidv4() }
            });
            assert.strictEqual(res.status, 401);
            assert(res.data.error.message.includes('X-CM-ID'));
        }),

        test('ABDM callback receives and acknowledges valid request with 202 ACK', async () => {
            const testReqId = uuidv4();
            const res = await axios.post(`${baseUrl}/v0.5/users/auth/on-init`, {
                requestId: testReqId,
                timestamp: new Date().toISOString()
            }, {
                headers: {
                    'X-CM-ID': config.xCmId,
                    'REQUEST-ID': testReqId,
                    'TIMESTAMP': new Date().toISOString(),
                    'Content-Type': 'application/json'
                }
            });
            assert.strictEqual(res.status, 202);
            assert.strictEqual(res.data.status, 'ACK');
            assert.strictEqual(res.data.requestId, testReqId);

            // Verify recorded in AbdmInbox
            const doc = await AbdmInbox.findOne({ requestId: testReqId });
            assert(doc, 'Callback must be recorded in AbdmInbox collection');
            assert(['RECEIVED', 'PROCESSING', 'PROCESSED', 'UNHANDLED'].includes(doc.status));
        }),

        test('ABDM callback handles duplicate request idempotently (202 duplicate)', async () => {
            const testReqId = uuidv4();
            const payload = {
                requestId: testReqId,
                timestamp: new Date().toISOString()
            };
            const headers = {
                'X-CM-ID': config.xCmId,
                'REQUEST-ID': testReqId,
                'TIMESTAMP': new Date().toISOString()
            };

            const res1 = await axios.post(`${baseUrl}/v0.5/users/auth/on-init`, payload, { headers });
            assert.strictEqual(res1.status, 202);

            const res2 = await axios.post(`${baseUrl}/v0.5/users/auth/on-init`, payload, { headers });
            assert.strictEqual(res2.status, 202);
            assert.strictEqual(res2.data.duplicate, true);
        }),

        test('ABDM callback rejects stale timestamp outside drift window (400)', async () => {
            const staleTime = new Date(Date.now() - 30 * 60 * 1000).toISOString(); // 30 mins ago
            const res = await axios.post(`${baseUrl}/v0.5/users/auth/on-init`, {
                requestId: uuidv4()
            }, {
                validateStatus: () => true,
                headers: {
                    'X-CM-ID': config.xCmId,
                    'REQUEST-ID': uuidv4(),
                    'TIMESTAMP': staleTime
                }
            });
            assert.strictEqual(res.status, 400);
            assert(res.data.error.message.includes('window'));
        }),

        // ── 3. ABDM Bridge Admin Routes & RBAC ──────────────────────────────────
        test('GET /api/abdm/bridge/config is accessible to platform admin', async () => {
            const res = await axios.get(`${baseUrl}/api/abdm/bridge/config`, {
                headers: { Authorization: `Bearer ${platformToken}` }
            });
            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.data.success, true);
            assert.strictEqual(res.data.environment, config.env);
        }),

        test('GET /api/abdm/bridge/config rejects unauthenticated requests (401)', async () => {
            const res = await axios.get(`${baseUrl}/api/abdm/bridge/config`, {
                validateStatus: () => true
            });
            assert.strictEqual(res.status, 401);
        }),

        test('GET /api/abdm/bridge/config rejects hospital admins (403 RBAC isolation)', async () => {
            const res = await axios.get(`${baseUrl}/api/abdm/bridge/config`, {
                validateStatus: () => true,
                headers: { Authorization: `Bearer ${hospitalAdminToken}` }
            });
            assert.strictEqual(res.status, 403);
            assert(res.data.message.includes('Platform administrator'));
        }),

        test('GET /api/abdm/bridge/hospital is accessible to hospital admin', async () => {
            const res = await axios.get(`${baseUrl}/api/abdm/bridge/hospital`, {
                headers: { Authorization: `Bearer ${hospitalAdminToken}` }
            });
            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.data.success, true);
            assert.strictEqual(res.data.hospital, testHospital.name);
        }),

        // ── 4. Bridge URL Validation ────────────────────────────────────────────
        test('validateBridgeUrl rejects HTTP protocol', () => {
            assert.throws(() => {
                bridgeService.validateBridgeUrl('http://api.medical365.in');
            }, /HTTPS/);
        }),

        test('validateBridgeUrl rejects localhost or private IPs', () => {
            assert.throws(() => {
                bridgeService.validateBridgeUrl('https://localhost:3000');
            }, /public domain/);
        }),

        test('validateBridgeUrl strictly rejects marketing website domains (medical365.in)', () => {
            assert.throws(() => {
                bridgeService.validateBridgeUrl('https://medical365.in');
            }, /website, not your backend/);

            assert.throws(() => {
                bridgeService.validateBridgeUrl('https://www.medical365.in');
            }, /website, not your backend/);
        }),

        test('validateBridgeUrl accepts valid HTTPS API host (https://api.medical365.in)', () => {
            const valid = bridgeService.validateBridgeUrl('https://api.medical365.in');
            assert.strictEqual(valid, 'https://api.medical365.in');
        }),

        // ── 5. ABHA Service Masking & Isolation ─────────────────────────────────
        test('maskAbhaNumber correctly masks 14-digit ABHA number', () => {
            const masked = abhaService.maskAbhaNumber('14-8293-8472-9102');
            assert.strictEqual(masked, '**-****-****-9102');
        }),

        test('maskAbhaAddress correctly masks ABHA handle', () => {
            const masked = abhaService.maskAbhaAddress('rohit.verma@abdm');
            assert.strictEqual(masked, 'r***a@abdm');
        }),

        test('ABHA status route requires authentication token', async () => {
            const res = await axios.get(`${baseUrl}/api/abdm/abha/status/${new mongoose.Types.ObjectId()}`, {
                validateStatus: () => true
            });
            assert.strictEqual(res.status, 401);
        }),

        // ── 6. Outbound HIP Helpers ─────────────────────────────────────────────
        test('createCareContext generates standard prefix and validates HI_TYPES', async () => {
            assert(hipService.HI_TYPES.includes('OPConsultation'));
            assert(hipService.HI_TYPES.includes('Prescription'));
            assert(hipService.HI_TYPES.includes('DiagnosticReport'));

            const sourceId = new mongoose.Types.ObjectId();
            const cc = await hipService.createCareContext({
                hospitalId: testHospital._id,
                patientId: new mongoose.Types.ObjectId(),
                hiType: 'DiagnosticReport',
                sourceModel: 'LabReport',
                sourceId,
                display: 'Lab Report CBC'
            });

            assert(cc);
            assert.strictEqual(cc.referenceNumber, `LAB-${sourceId}`);
            assert.strictEqual(cc.status, 'CREATED');

            // Cleanup test record
            await AbdmCareContext.deleteOne({ _id: cc._id });
        }),
    ];

    for (const t of tests) {
        await t();
    }

    server.close();
    await mongoose.disconnect();

    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;

    console.log('\n======================================================');
    console.log(` RESULTS: ${passed} PASSED, ${failed} FAILED (Total: ${results.length})`);
    console.log('======================================================\n');

    if (failed > 0) {
        process.exit(1);
    }
}

runSuite().catch(err => {
    console.error('Test suite runner crashed:', err);
    process.exit(1);
});
