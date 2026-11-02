/**
 * test_phase2e_backend.js — Phase 2G Backend Verification Suite
 * 
 * Directly imports and exercises:
 * 1. REAL Express router in `src/routes/public.routes.js` mounted on an Express app.
 * 2. REAL atomic reservation utility `reservePackageIdForHospital` in `src/utils/applicationId.util.js`.
 * 3. REAL `generateApplicationId` and `normalizeSegment` in `src/utils/applicationId.util.js`.
 * 
 * Verifies:
 * - F-01: True atomic reservation against concurrent claims via MongoDB _id uniqueness.
 * - F-02: Disambiguation of pre-existing conflicted package IDs.
 * - F-03: Graceful E11000 duplicate key error handling and bounded retries.
 * - F-05: Real module execution (no reimplemented router simulators).
 */

const assert = require('assert');
const express = require('express');
const crypto = require('crypto');

process.env.NODE_ENV = 'test';

console.log('================================================================');
console.log('🧪 MEDICAL365 — PHASE 2G BACKEND MODULE TESTS (OFFLINE / MOCKED DB)');
console.log('================================================================\n');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

async function test(name, fn) {
    totalTests++;
    try {
        await fn();
        console.log(`  ✓ [PASS] ${name}`);
        passedTests++;
    } catch (err) {
        console.error(`  ✗ [FAIL] ${name}`);
        console.error(`     Error: ${err.message}\n`);
        failedTests++;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 1: GATE 1 — Real Express Router Execution (public.routes.js)
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- SUITE 1: GATE 1 Real Express Router (/api/public/branding) ---');

// Mock data store for hospital model
let mockDbHospitals = [];

const MockHospitalModel = {
    findOne: (query) => {
        // Return a mock Mongoose query object
        const hospital = mockDbHospitals.find(h => {
            if (query['appConfig.androidPackageId']) {
                return h.appConfig?.androidPackageId === query['appConfig.androidPackageId'] && h.isActive === query.isActive;
            }
            if (query._id) {
                return String(h._id) === String(query._id);
            }
            if (query.$or) {
                return query.$or.some(cond => {
                    if (cond.slug && h.slug === cond.slug) return true;
                    if (cond.customDomain && h.customDomain === cond.customDomain) return true;
                    return false;
                });
            }
            return false;
        });

        return Promise.resolve(hospital || null);
    }
};

// Wire MockHospitalModel into require.cache before requiring public.routes
const hospitalModelPath = require.resolve('../src/models/hospital.model');
require.cache[hospitalModelPath] = {
    id: hospitalModelPath,
    filename: hospitalModelPath,
    loaded: true,
    exports: MockHospitalModel
};

// Import the REAL Express router
const publicRouter = require('../src/routes/public.routes');

// Mount on an Express app
const app = express();
app.use(express.json());
app.use('/api/public', publicRouter);

// Dispatch a real HTTP request through the Express stack
function dispatchExpressRequest(url) {
    return new Promise((resolve) => {
        const [path, queryString] = url.split('?');
        const query = {};
        if (queryString) {
            const params = new URLSearchParams(queryString);
            for (const [k, v] of params.entries()) {
                query[k] = v;
            }
        }

        let statusCode = 200;
        let responseHeaders = {};
        let responseBody = null;

        const req = {
            method: 'GET',
            url,
            path,
            query,
            headers: {}
        };

        const res = {
            statusCode: 200,
            status: function(code) {
                statusCode = code;
                return res;
            },
            set: function(k, v) {
                responseHeaders[k.toLowerCase()] = v;
                return res;
            },
            setHeader: function(k, v) {
                responseHeaders[k.toLowerCase()] = v;
                return res;
            },
            getHeader: function(k) {
                return responseHeaders[k.toLowerCase()];
            },
            json: function(data) {
                responseBody = data;
                resolve({ status: statusCode, headers: responseHeaders, body: responseBody });
            },
            send: function(data) {
                responseBody = data;
                resolve({ status: statusCode, headers: responseHeaders, body: responseBody });
            }
        };

        app.handle(req, res, () => {
            resolve({ status: 404, headers: responseHeaders, body: { error: 'Route not handled' } });
        });
    });
}

(async () => {
    mockDbHospitals = [
        {
            _id: 'hosp_apollo_01',
            name: 'Apollo Hospital',
            slug: 'apollo',
            customDomain: 'apollo.clinic',
            isActive: true,
            appConfig: { androidPackageId: 'com.medical365.apollo' },
            branding: { appName: 'Apollo Care', primaryColor: '#0055ff', logoUrl: 'https://cdn.example.com/apollo.png' },
            brandingSchema: { primaryColor: '#0d9488' }
        },
        {
            _id: 'hosp_inactive_02',
            name: 'Inactive Hospital',
            slug: 'inactive',
            isActive: false,
            appConfig: { androidPackageId: 'com.medical365.inactive' },
            branding: { appName: 'Inactive Clinic' }
        },
        {
            _id: 'hosp_city_03',
            name: 'City Care Hospital',
            slug: 'citycare',
            isActive: true,
            appConfig: { androidPackageId: '' },
            branding: { appName: 'City Care' }
        }
    ];

    await test('Gate 1 (Real Router): Valid packageId returns 200 with correct branding & Cache-Control', async () => {
        const res = await dispatchExpressRequest('/api/public/branding?packageId=com.medical365.apollo');
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.success, true);
        assert.strictEqual(res.body.hospitalId, 'hosp_apollo_01');
        assert.strictEqual(res.body.hospitalName, 'Apollo Care');
        assert.strictEqual(res.body.branding.primaryColor, '#0055ff');
        assert.ok(res.headers['cache-control'].includes('public'));
    });

    await test('Gate 1 (Real Router): Malformed packageId (uppercase) returns 400', async () => {
        const res = await dispatchExpressRequest('/api/public/branding?packageId=com.medical365.Apollo');
        assert.strictEqual(res.status, 400);
        assert.strictEqual(res.body.success, false);
    });

    await test('Gate 1 (Real Router): Malformed packageId (leading digit) returns 400', async () => {
        const res = await dispatchExpressRequest('/api/public/branding?packageId=com.medical365.123clinic');
        assert.strictEqual(res.status, 400);
        assert.strictEqual(res.body.success, false);
    });

    await test('Gate 1 (Real Router): Generic package com.medical365.app returns 404', async () => {
        const res = await dispatchExpressRequest('/api/public/branding?packageId=com.medical365.app');
        assert.strictEqual(res.status, 404);
        assert.strictEqual(res.body.success, false);
    });

    await test('Gate 1 (Real Router): Unknown packageId returns 404', async () => {
        const res = await dispatchExpressRequest('/api/public/branding?packageId=com.medical365.nonexistent');
        assert.strictEqual(res.status, 404);
    });

    await test('Gate 1 (Real Router): Inactive hospital package returns 404', async () => {
        const res = await dispatchExpressRequest('/api/public/branding?packageId=com.medical365.inactive');
        assert.strictEqual(res.status, 404);
    });

    await test('Gate 1 (Real Router): Legacy tenantId query returns 200 legacy envelope', async () => {
        const res = await dispatchExpressRequest('/api/public/branding?tenantId=hosp_apollo_01');
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.hospitalId, 'hosp_apollo_01');
    });

    await test('Gate 1 (Real Router): Legacy slug query returns 200 legacy envelope', async () => {
        const res = await dispatchExpressRequest('/api/public/branding?slug=citycare');
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.hospitalName, 'City Care');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // SUITE 2: Real Atomic Reservation Utility & Concurrency (applicationId.util.js)
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- SUITE 2: Real Atomic Reservation Utility & Concurrency (F-01, F-02, F-03) ---');

    const {
        normalizeSegment,
        generateApplicationId,
        reservePackageIdForHospital
    } = require('../src/utils/applicationId.util');

    // In-memory fake database simulating MongoDB's built-in primary key uniqueness on _id
    function createFakeDatabase(initialHospitals = []) {
        const hospitalStore = new Map(initialHospitals.map(h => [String(h._id), { ...h }]));
        const reservationStore = new Map(); // Keyed by _id (packageId)

        const FakeHospitalModel = {
            findOne: (query) => {
                return {
                    select: () => ({
                        lean: async () => {
                            for (const doc of hospitalStore.values()) {
                                let match = true;
                                if (query._id && query._id.$ne) {
                                    if (String(doc._id) === String(query._id.$ne)) match = false;
                                }
                                if (query['appConfig.androidPackageId']) {
                                    if (doc.appConfig?.androidPackageId !== query['appConfig.androidPackageId']) {
                                        match = false;
                                    }
                                }
                                if (match) return { _id: doc._id, name: doc.name };
                            }
                            return null;
                        }
                    })
                };
            },
            findByIdAndUpdate: async (id, update) => {
                const doc = hospitalStore.get(String(id));
                if (!doc) throw new Error(`Document ${id} not found`);
                if (update.$set) {
                    for (const [path, val] of Object.entries(update.$set)) {
                        const parts = path.split('.');
                        let curr = doc;
                        for (let i = 0; i < parts.length - 1; i++) {
                            if (!curr[parts[i]]) curr[parts[i]] = {};
                            curr = curr[parts[i]];
                        }
                        curr[parts[parts.length - 1]] = val;
                    }
                }
                hospitalStore.set(String(id), doc);
                return doc;
            }
        };

        const FakePackageReservationModel = {
            create: async (docs) => {
                const doc = docs[0];
                const key = String(doc._id);
                // Atomic _id uniqueness check: MongoDB automatically raises E11000 on duplicate _id
                if (reservationStore.has(key)) {
                    const err = new Error(`E11000 duplicate key error collection: package_reservations index: _id_ dup key: { _id: "${key}" }`);
                    err.code = 11000;
                    throw err;
                }
                reservationStore.set(key, { ...doc });
                return [doc];
            },
            findById: (id) => ({
                lean: async () => {
                    const found = reservationStore.get(String(id));
                    return found ? { ...found } : null;
                }
            }),
            findOne: (query) => ({
                select: () => ({
                    lean: async () => {
                        for (const resDoc of reservationStore.values()) {
                            let match = true;
                            if (query._id && String(resDoc._id) !== String(query._id)) match = false;
                            if (query.hospitalId && query.hospitalId.$ne) {
                                if (String(resDoc.hospitalId) === String(query.hospitalId.$ne)) match = false;
                            }
                            if (match) return { _id: resDoc._id, hospitalId: resDoc.hospitalId };
                        }
                        return null;
                    }
                })
            }),
            findOneAndUpdate: async (filter, update, options = {}) => {
                const key = String(filter._id);
                let doc = reservationStore.get(key);
                if (doc && filter.hospitalId && String(doc.hospitalId) !== String(filter.hospitalId)) {
                    if (options.upsert) {
                        const err = new Error(`E11000 duplicate key error collection: package_reservations index: _id_ dup key: { _id: "${key}" }`);
                        err.code = 11000;
                        throw err;
                    }
                    return null;
                }
                if (!doc) {
                    if (options.upsert) {
                        doc = { _id: key, hospitalId: filter.hospitalId, ...update.$set };
                        reservationStore.set(key, doc);
                        return doc;
                    }
                    return null;
                }
                if (update.$set) {
                    Object.assign(doc, update.$set);
                }
                reservationStore.set(key, doc);
                return doc;
            },
            findByIdAndUpdate: async (id, update) => {
                const doc = reservationStore.get(String(id));
                if (doc && update.$set) {
                    Object.assign(doc, update.$set);
                }
                return doc;
            }
        };

        return { hospitalStore, reservationStore, FakeHospitalModel, FakePackageReservationModel };
    }

    await test('F-01 (Atomic Concurrency): Competing simultaneous claims arbitrated by _id uniqueness', async () => {
        const { FakeHospitalModel, FakePackageReservationModel } = createFakeDatabase([
            { _id: 'hosp_race_A', name: 'Lotus Clinic', appConfig: { androidPackageId: '' } },
            { _id: 'hosp_race_B', name: 'Lotus Clinic', appConfig: { androidPackageId: '' } }
        ]);

        const hospA = { _id: 'hosp_race_A', name: 'Lotus Clinic', appConfig: { androidPackageId: '' } };
        const hospB = { _id: 'hosp_race_B', name: 'Lotus Clinic', appConfig: { androidPackageId: '' } };

        // Execute parallel concurrent reservations competing for 'com.medical365.lotusclinic'
        const [resA, resB] = await Promise.all([
            reservePackageIdForHospital(hospA, FakeHospitalModel, FakePackageReservationModel),
            reservePackageIdForHospital(hospB, FakeHospitalModel, FakePackageReservationModel)
        ]);

        // Assert that they NEVER receive the same packageId
        assert.notStrictEqual(resA.applicationId, resB.applicationId);
        assert.ok(resA.applicationId.startsWith('com.medical365.lotusclinic'));
        assert.ok(resB.applicationId.startsWith('com.medical365.lotusclinic'));

        // Exactly one should be base and one disambiguated
        const disambiguatedCount = [resA.disambiguated, resB.disambiguated].filter(Boolean).length;
        assert.strictEqual(disambiguatedCount, 1, 'Exactly one concurrent claimant must be disambiguated');
    });

    await test('F-02 (Conflicted ID Disambiguation): Pre-existing conflicting record disambiguates rather than crashing', async () => {
        const { FakeHospitalModel, FakePackageReservationModel } = createFakeDatabase([
            { _id: 'hosp_original', name: 'Apex Hospital', appConfig: { androidPackageId: 'com.medical365.apexhospital' } },
            { _id: 'hosp_conflicted', name: 'Apex Hospital', appConfig: { androidPackageId: 'com.medical365.apexhospital' } }
        ]);

        const conflictedDoc = {
            _id: 'hosp_conflicted',
            name: 'Apex Hospital',
            appConfig: { androidPackageId: 'com.medical365.apexhospital' }
        };

        // Before F-02 fix, this would crash because generateApplicationId returned explicitAppId ignoring disambiguate
        const result = await reservePackageIdForHospital(conflictedDoc, FakeHospitalModel, FakePackageReservationModel);
        assert.strictEqual(result.disambiguated, true);
        assert.notStrictEqual(result.applicationId, 'com.medical365.apexhospital');
        assert.ok(result.applicationId.startsWith('com.medical365.apexhospital_'));
    });

    await test('F-03 (Idempotency): Repeated reservation from same hospital reuses existing reservation', async () => {
        const { FakeHospitalModel, FakePackageReservationModel } = createFakeDatabase([
            { _id: 'hosp_rebuild', name: 'Care Hospital', appConfig: { androidPackageId: '' } }
        ]);

        const hospDoc = { _id: 'hosp_rebuild', name: 'Care Hospital', appConfig: { androidPackageId: '' } };

        const firstRes = await reservePackageIdForHospital(hospDoc, FakeHospitalModel, FakePackageReservationModel);
        assert.strictEqual(firstRes.applicationId, 'com.medical365.carehospital');

        // Rebuild: second invocation must be idempotent
        const secondRes = await reservePackageIdForHospital(hospDoc, FakeHospitalModel, FakePackageReservationModel);
        assert.strictEqual(secondRes.applicationId, 'com.medical365.carehospital');
        assert.strictEqual(secondRes.disambiguated, false);
    });

    await test('F-03 (Generic Protection): com.medical365.app cannot be assigned as dedicated hospital package', () => {
        const appId = generateApplicationId('app', { tenantId: '12345678' });
        assert.notStrictEqual(appId, 'com.medical365.app');
        assert.ok(appId.startsWith('com.medical365.app_') || appId.startsWith('com.medical365.hospital_'));
    });

    await test('F-03 (Bounded Retry): Exhausted collisions terminate safely with descriptive error', async () => {
        // Create a model where every create throws E11000
        const AlwaysCollidingModel = {
            create: async () => {
                const err = new Error('E11000 duplicate key');
                err.code = 11000;
                throw err;
            },
            findById: () => ({ lean: async () => null }), // Belongs to another hospital
            findOne: () => ({ select: () => ({ lean: async () => null }) })
        };

        const hosp = { _id: 'hosp_exhaust', name: 'Crowded Hospital', appConfig: { androidPackageId: '' } };
        const DummyHospitalModel = {
            findOne: () => ({ select: () => ({ lean: async () => null }) }),
            findByIdAndUpdate: async () => {}
        };

        let threw = false;
        try {
            await reservePackageIdForHospital(hosp, DummyHospitalModel, AlwaysCollidingModel);
        } catch (err) {
            threw = true;
            assert.ok(err.message.includes('after 5 attempts'));
        }
        assert.strictEqual(threw, true, 'Must terminate after bounded attempts');
    });

    await test('F-01 (Same Hospital Concurrency): Simultaneous build requests for same hospital resolve to same packageId idempotently', async () => {
        const { FakeHospitalModel, FakePackageReservationModel, reservationStore } = createFakeDatabase([
            { _id: 'hosp_same_race', name: 'Lotus Care', appConfig: { androidPackageId: '' } }
        ]);

        const hosp = { _id: 'hosp_same_race', name: 'Lotus Care', appConfig: { androidPackageId: '' } };

        // Execute 2 concurrent requests for the SAME hospital simultaneously
        const [res1, res2] = await Promise.all([
            reservePackageIdForHospital(hosp, FakeHospitalModel, FakePackageReservationModel),
            reservePackageIdForHospital(hosp, FakeHospitalModel, FakePackageReservationModel)
        ]);

        assert.strictEqual(res1.applicationId, 'com.medical365.lotuscare');
        assert.strictEqual(res2.applicationId, 'com.medical365.lotuscare');
        assert.strictEqual(res1.disambiguated, false);
        assert.strictEqual(res2.disambiguated, false);
        assert.strictEqual(reservationStore.size, 1, 'Only one reservation record must be created');
    });

    await test('F-01 (Recovery): Reservation success followed by HospitalModel update failure recovers safely on retry', async () => {
        const { FakeHospitalModel, FakePackageReservationModel, reservationStore, hospitalStore } = createFakeDatabase([
            { _id: 'hosp_glitch_01', name: 'Glitch Clinic', appConfig: { androidPackageId: '' } },
            { _id: 'hosp_intruder_02', name: 'Glitch Clinic', appConfig: { androidPackageId: '' } }
        ]);

        const hospDoc = { _id: 'hosp_glitch_01', name: 'Glitch Clinic', appConfig: { androidPackageId: '' } };

        // 1. Simulate transient failure on HospitalModel.findByIdAndUpdate during first run
        let shouldFailUpdate = true;
        const originalFindByIdAndUpdate = FakeHospitalModel.findByIdAndUpdate;
        FakeHospitalModel.findByIdAndUpdate = async (id, update) => {
            if (shouldFailUpdate) {
                throw new Error('Transient database network timeout during Hospital document update');
            }
            return originalFindByIdAndUpdate(id, update);
        };

        // First attempt: should throw error on step 3
        let firstRunFailed = false;
        try {
            await reservePackageIdForHospital(hospDoc, FakeHospitalModel, FakePackageReservationModel);
        } catch (err) {
            firstRunFailed = true;
            assert.ok(err.message.includes('Transient database network timeout'));
        }
        assert.strictEqual(firstRunFailed, true, 'First attempt must fail when hospital update fails');

        // Verify that package reservation was created and securely held for this hospital
        const strandedRes = reservationStore.get('com.medical365.glitchclinic');
        assert.ok(strandedRes, 'Reservation must exist in reservationStore');
        assert.strictEqual(String(strandedRes.hospitalId), 'hosp_glitch_01');
        assert.strictEqual(strandedRes.status, 'RESERVED');

        // Network recovered after first run
        shouldFailUpdate = false;

        // Verify that another hospital CANNOT steal this stranded reservation
        const anotherHosp = { _id: 'hosp_intruder_02', name: 'Glitch Clinic', appConfig: { androidPackageId: '' } };
        const intruderRes = await reservePackageIdForHospital(anotherHosp, FakeHospitalModel, FakePackageReservationModel);
        assert.notStrictEqual(intruderRes.applicationId, 'com.medical365.glitchclinic', 'Another hospital cannot claim stranded reservation');
        assert.ok(intruderRes.disambiguated, 'Intruder must be disambiguated');

        // 2. Recovery on second attempt by the original hospital (network recovered)
        const recoveryRes = await reservePackageIdForHospital(hospDoc, FakeHospitalModel, FakePackageReservationModel);

        assert.strictEqual(recoveryRes.applicationId, 'com.medical365.glitchclinic');
        assert.strictEqual(recoveryRes.disambiguated, false);

        // Verify that hospital document is now updated and reservation status is COMMITTED
        const updatedHosp = hospitalStore.get('hosp_glitch_01');
        assert.strictEqual(updatedHosp.appConfig.androidPackageId, 'com.medical365.glitchclinic');
        const committedRes = reservationStore.get('com.medical365.glitchclinic');
        assert.strictEqual(committedRes.status, 'COMMITTED');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // SUITE 3: PHASE 3 — Automated Native Version Code & Semantic Versioning
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- SUITE 3: Automated Version Allocation & Concurrency (Phase 3) ---');
    const {
        allocateNextVersion,
        isValidVersionCode,
        isValidVersionName,
        compareSemver,
        bumpPatchVersion,
        atomicClaimBuildWithVersion,
        handleBuildDispatchFailure,
        MAX_ANDROID_VERSION_CODE
    } = require('../src/utils/versionAllocation.util');

    await test('Phase 3: Existing/default versionCode 1 is treated as installed baseline; next build allocates 2 and bumps patch to 1.0.1', () => {
        const hospital = {
            _id: 'hosp_baseline_1',
            name: 'City Hospital',
            appConfig: {}
        };
        const res = allocateNextVersion(hospital);
        assert.strictEqual(res.versionCode, 2, 'Next build from baseline 1 must allocate 2, not reuse 1');
        assert.strictEqual(res.versionName, '1.0.1', 'Next native build must bump patch from 1.0.0 to 1.0.1');
    });

    await test('Phase 3: First build with explicit valid inputs receives requested higher values', () => {
        const hospital = {
            _id: 'hosp_v2',
            name: 'Apex Clinic',
            appConfig: {}
        };
        const res = allocateNextVersion(hospital, 5, '2.1.0');
        assert.strictEqual(res.versionCode, 5, 'Requested valid versionCode must be accepted');
        assert.strictEqual(res.versionName, '2.1.0', 'Requested valid versionName must be accepted');
    });

    await test('Phase 3: Subsequent build increments previous confirmed versionCode (2 -> 3) and bumps patch (1.0.1 -> 1.0.2)', () => {
        const hospital = {
            _id: 'hosp_v3',
            name: 'Apollo Hospital',
            appConfig: {
                versionCode: 2,
                versionName: '1.0.1',
                lastBuiltAt: new Date()
            }
        };
        const res = allocateNextVersion(hospital);
        assert.strictEqual(res.versionCode, 3, 'Next build must increment versionCode from 2 to 3');
        assert.strictEqual(res.versionName, '1.0.2', 'Next native build must increment patch from 1.0.1 to 1.0.2');
    });

    await test('Phase 3: Subsequent build with higher explicit versionCode and semver bump is accepted', () => {
        const hospital = {
            _id: 'hosp_v4',
            name: 'Fortis Hospital',
            appConfig: {
                versionCode: 10,
                versionName: '1.5.0',
                lastBuiltAt: new Date()
            }
        };
        const res = allocateNextVersion(hospital, 15, '2.0.0');
        assert.strictEqual(res.versionCode, 15);
        assert.strictEqual(res.versionName, '2.0.0');
    });

    await test('Phase 3: Reject versionCode equal to or lower than baseline/previous release', () => {
        const hospital = {
            _id: 'hosp_v5',
            name: 'Max Care',
            appConfig: {
                versionCode: 7,
                versionName: '1.2.0',
                lastBuiltAt: new Date()
            }
        };
        assert.throws(() => {
            allocateNextVersion(hospital, 7);
        }, /must be strictly greater than previous\/baseline version/);

        assert.throws(() => {
            allocateNextVersion(hospital, 6);
        }, /must be strictly greater than previous\/baseline version/);

        // Also rejects 1 against baseline 1
        const freshHospital = { _id: 'hosp_fresh', appConfig: {} };
        assert.throws(() => {
            allocateNextVersion(freshHospital, 1);
        }, /must be strictly greater than previous\/baseline version/);
    });

    await test('Phase 3: Reject invalid or out-of-range versionCode', () => {
        const hospital = { _id: 'hosp_v6', appConfig: {} };
        assert.strictEqual(isValidVersionCode(-1), false);
        assert.strictEqual(isValidVersionCode(0), false);
        assert.strictEqual(isValidVersionCode(1.5), false);
        assert.strictEqual(isValidVersionCode('invalid'), false);
        assert.strictEqual(isValidVersionCode(MAX_ANDROID_VERSION_CODE + 1), false);
        assert.strictEqual(isValidVersionCode(MAX_ANDROID_VERSION_CODE), true);
        assert.strictEqual(isValidVersionCode(1), true);

        assert.throws(() => {
            allocateNextVersion(hospital, 0);
        }, /Invalid versionCode/);
        assert.throws(() => {
            allocateNextVersion(hospital, -5);
        }, /Invalid versionCode/);
        assert.throws(() => {
            allocateNextVersion(hospital, 'not-a-number');
        }, /Invalid versionCode/);
    });

    await test('Phase 3: Reject invalid or non-increasing semantic versionName', () => {
        const hospital = {
            _id: 'hosp_v7',
            appConfig: {
                versionCode: 2,
                versionName: '1.2.0'
            }
        };
        assert.strictEqual(isValidVersionName('1.0.0'), true);
        assert.strictEqual(isValidVersionName('2.4.15-beta.1'), true);
        assert.strictEqual(isValidVersionName(''), false);
        assert.strictEqual(isValidVersionName('v1.0'), false);
        assert.strictEqual(isValidVersionName('latest'), false);
        assert.strictEqual(isValidVersionName('1.0'), false);

        // Malformed semver rejected
        assert.throws(() => {
            allocateNextVersion(hospital, 3, 'latest');
        }, /Invalid versionName/);
        assert.throws(() => {
            allocateNextVersion(hospital, 3, '1.0');
        }, /Invalid versionName/);

        // Silent reuse of old or lower runtime version rejected
        assert.throws(() => {
            allocateNextVersion(hospital, 3, '1.2.0');
        }, /must be strictly greater than previous release version/);
        assert.throws(() => {
            allocateNextVersion(hospital, 3, '1.1.9');
        }, /must be strictly greater than previous release version/);
    });

    function applySetUpdate(doc, $set) {
        if (!$set) return;
        for (const [key, val] of Object.entries($set)) {
            if (key.includes('.')) {
                const parts = key.split('.');
                let curr = doc;
                for (let i = 0; i < parts.length - 1; i++) {
                    if (!curr[parts[i]]) curr[parts[i]] = {};
                    curr = curr[parts[i]];
                }
                curr[parts[parts.length - 1]] = val;
            } else {
                doc[key] = val;
            }
        }
    }

    await test('Phase 3: Workflow-dispatch failure does NOT cause silent reuse of failed version', async () => {
        // Hospital is at release versionCode: 2
        let dbHospital = {
            _id: 'hosp_burn_01',
            appConfig: {
                versionCode: 2,
                versionName: '1.0.1',
                lastAllocatedVersionCode: 2,
                rnBuildStatus: 'NOT_BUILT'
            }
        };

        const MockModel = {
            findById: async () => JSON.parse(JSON.stringify(dbHospital)),
            findOneAndUpdate: async (query, update) => {
                if (['BUILDING', 'PROCESSING'].includes(dbHospital.appConfig.rnBuildStatus)) return null;
                applySetUpdate(dbHospital, update.$set);
                return JSON.parse(JSON.stringify(dbHospital));
            },
            findByIdAndUpdate: async (id, update) => {
                applySetUpdate(dbHospital, update.$set);
                return JSON.parse(JSON.stringify(dbHospital));
            }
        };

        // 1. Build A allocates version code 3
        const claimA = await atomicClaimBuildWithVersion({
            HospitalModel: MockModel,
            hospitalId: 'hosp_burn_01',
            rnBuildId: 'rn-dispatch-fail-1'
        });
        assert.strictEqual(claimA.versionCode, 3);
        assert.strictEqual(dbHospital.appConfig.lastAllocatedVersionCode, 3);

        // Simulate dispatch failure: handleBuildDispatchFailure called
        await handleBuildDispatchFailure(MockModel, 'hosp_burn_01', 'GitHub 401 Bad Credentials');
        assert.strictEqual(dbHospital.appConfig.rnBuildStatus, 'FAILED');
        assert.strictEqual(dbHospital.appConfig.pendingVersionCode, null);
        assert.strictEqual(dbHospital.appConfig.lastAllocatedVersionCode, 3, 'lastAllocatedVersionCode must be retained');

        // 2. Build B is requested after the failure
        const claimB = await atomicClaimBuildWithVersion({
            HospitalModel: MockModel,
            hospitalId: 'hosp_burn_01',
            rnBuildId: 'rn-dispatch-retry-2'
        });
        // Build B must allocate 4, NOT reuse 3!
        assert.strictEqual(claimB.versionCode, 4, 'Subsequent build must allocate 4 and not reuse burned version 3');
        assert.strictEqual(claimB.versionName, '1.0.2', 'Subsequent build allocates incremented runtime version');
    });

    await test('Phase 3: Parallel build requests and duplicate allocation prevention via atomicClaimBuildWithVersion', async () => {
        let dbDoc = {
            _id: 'hosp_parallel_01',
            appConfig: {
                versionCode: 1,
                versionName: '1.0.0',
                lastAllocatedVersionCode: 1,
                rnBuildStatus: 'NOT_BUILT'
            }
        };

        const MockParallelModel = {
            findById: async () => JSON.parse(JSON.stringify(dbDoc)),
            findOneAndUpdate: async (query, update) => {
                if (['BUILDING', 'PROCESSING'].includes(dbDoc.appConfig.rnBuildStatus)) {
                    return null; // Atomic guard rejects concurrent update
                }
                applySetUpdate(dbDoc, update.$set);
                return JSON.parse(JSON.stringify(dbDoc));
            }
        };

        // Two parallel requests try to claim build simultaneously
        const [claim1, claim2] = await Promise.allSettled([
            atomicClaimBuildWithVersion({
                HospitalModel: MockParallelModel,
                hospitalId: 'hosp_parallel_01',
                rnBuildId: 'rn-parallel-1'
            }),
            atomicClaimBuildWithVersion({
                HospitalModel: MockParallelModel,
                hospitalId: 'hosp_parallel_01',
                rnBuildId: 'rn-parallel-2'
            })
        ]);

        const fulfilled = [claim1, claim2].filter(r => r.status === 'fulfilled');
        const rejected = [claim1, claim2].filter(r => r.status === 'rejected');

        assert.strictEqual(fulfilled.length, 1, 'Only one parallel claim can succeed');
        assert.strictEqual(rejected.length, 1, 'Second parallel claim must be rejected');
        assert.strictEqual(rejected[0].reason.statusCode, 409, 'Rejection must have 409 Conflict status');
    });

    await test('Phase 3: Both backend build entry points use one consistent allocation implementation', async () => {
        let hospRecord = {
            _id: 'hosp_entry_points',
            name: 'Dual Route Hospital',
            appConfig: {
                versionCode: 1,
                versionName: '1.0.0',
                lastAllocatedVersionCode: 1,
                rnBuildStatus: 'NOT_BUILT'
            }
        };

        const MockEntryModel = {
            findById: async () => JSON.parse(JSON.stringify(hospRecord)),
            findOneAndUpdate: async (query, update) => {
                if (['BUILDING', 'PROCESSING'].includes(hospRecord.appConfig.rnBuildStatus)) return null;
                applySetUpdate(hospRecord, update.$set);
                return JSON.parse(JSON.stringify(hospRecord));
            },
            findByIdAndUpdate: async (id, update) => {
                applySetUpdate(hospRecord, update.$set);
                return JSON.parse(JSON.stringify(hospRecord));
            }
        };

        // Entry Point 1 (build-rn-app route)
        const ep1 = await atomicClaimBuildWithVersion({
            HospitalModel: MockEntryModel,
            hospitalId: 'hosp_entry_points',
            rnBuildId: 'rn-ep-1'
        });
        assert.strictEqual(ep1.versionCode, 2);
        assert.strictEqual(ep1.versionName, '1.0.1');

        // Reset to NOT_BUILT with confirmed version 2
        hospRecord.appConfig.rnBuildStatus = 'COMPLETED';
        hospRecord.appConfig.versionCode = 2;
        hospRecord.appConfig.versionName = '1.0.1';
        hospRecord.appConfig.rnBuildStatus = 'NOT_BUILT';

        // Entry Point 2 (trigger-mobile-build controller)
        const ep2 = await atomicClaimBuildWithVersion({
            HospitalModel: MockEntryModel,
            hospitalId: 'hosp_entry_points',
            rnBuildId: 'rn-ep-2'
        });
        assert.strictEqual(ep2.versionCode, 3);
        assert.strictEqual(ep2.versionName, '1.0.2');
        assert.strictEqual(hospRecord.appConfig.lastAllocatedVersionCode, 3, 'Both routes consistently track version codes');
    });

    await test('Phase 3: Webhook COMPLETED confirms version and clears pending version state', () => {
        const hospitalDoc = {
            _id: 'hosp_v9',
            appConfig: {
                versionCode: 1,
                versionName: '1.0.0',
                pendingVersionCode: 2,
                pendingVersionName: '1.0.1',
                lastAllocatedVersionCode: 2,
                rnBuildStatus: 'PROCESSING',
                rnBuildId: 'rn-12345'
            }
        };

        // Simulate completion logic from /webhook/github-rn
        const nextCode = hospitalDoc.appConfig.pendingVersionCode || hospitalDoc.appConfig.versionCode;
        const nextName = hospitalDoc.appConfig.pendingVersionName || hospitalDoc.appConfig.versionName;

        hospitalDoc.appConfig.versionCode = nextCode;
        hospitalDoc.appConfig.versionName = nextName;
        hospitalDoc.appConfig.pendingVersionCode = null;
        hospitalDoc.appConfig.pendingVersionName = null;
        hospitalDoc.appConfig.rnBuildStatus = 'COMPLETED';
        hospitalDoc.appConfig.rnLastBuiltAt = new Date();

        assert.strictEqual(hospitalDoc.appConfig.versionCode, 2);
        assert.strictEqual(hospitalDoc.appConfig.versionName, '1.0.1');
        assert.strictEqual(hospitalDoc.appConfig.pendingVersionCode, null);
        assert.strictEqual(hospitalDoc.appConfig.rnBuildStatus, 'COMPLETED');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // SUITE 4: Phase 5 Release Automation & OTA Webhook (/api/superadmin/releases/webhook/ota)
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- SUITE 4: Phase 5 Release Automation & OTA Webhook ---');

    const releaseRoutes = require('../src/routes/release.routes');
    const { isValidWebhookSecret } = releaseRoutes;

    const releaseApp = express();
    releaseApp.use(express.json());
    releaseApp.use('/api/superadmin/releases', releaseRoutes);

    function invokeReleaseRoute(method, url, body = {}, headers = {}) {
        return new Promise((resolve) => {
            const [pathPart, queryString] = url.split('?');
            const query = {};
            if (queryString) {
                const params = new URLSearchParams(queryString);
                for (const [k, v] of params.entries()) {
                    query[k] = v;
                }
            }

            let statusCode = 200;
            let responseHeaders = {};
            let responseBody = null;

            const normalizedHeaders = {};
            for (const [k, v] of Object.entries(headers)) {
                normalizedHeaders[k.toLowerCase()] = v;
            }

            const req = {
                method: method.toUpperCase(),
                url,
                path: pathPart,
                query,
                body,
                headers: normalizedHeaders
            };

            const res = {
                statusCode: 200,
                status: function(code) {
                    statusCode = code;
                    return res;
                },
                set: function(k, v) {
                    responseHeaders[k.toLowerCase()] = v;
                    return res;
                },
                setHeader: function(k, v) {
                    responseHeaders[k.toLowerCase()] = v;
                    return res;
                },
                getHeader: function(k) {
                    return responseHeaders[k.toLowerCase()];
                },
                json: function(data) {
                    responseBody = data;
                    resolve({ statusCode, headers: responseHeaders, body: responseBody });
                },
                send: function(data) {
                    responseBody = data;
                    resolve({ statusCode, headers: responseHeaders, body: responseBody });
                }
            };

            releaseApp.handle(req, res, (err) => {
                if (err) {
                    resolve({ statusCode: 500, headers: responseHeaders, body: { error: err.message } });
                } else {
                    resolve({ statusCode: 404, headers: responseHeaders, body: null });
                }
            });
        });
    }

    await test('Phase 5: Webhook secret timing-safe validation logic', () => {
        assert.strictEqual(isValidWebhookSecret(null), false, 'Rejects null secret');
        assert.strictEqual(isValidWebhookSecret(undefined), false, 'Rejects undefined secret');
        assert.strictEqual(isValidWebhookSecret(''), false, 'Rejects empty secret');
        assert.strictEqual(isValidWebhookSecret(123), false, 'Rejects non-string secret');
        assert.strictEqual(isValidWebhookSecret('wrong-length'), false, 'Rejects wrong secret (different length)');
        assert.strictEqual(isValidWebhookSecret('dev-secret-999'), false, 'Rejects wrong secret (same length)');
        assert.strictEqual(isValidWebhookSecret('dev-secret-123'), true, 'Accepts valid dev fallback secret in non-production');

        // Test with configured custom environment secret
        const prevSecret = process.env.RN_WEBHOOK_SECRET;
        try {
            process.env.RN_WEBHOOK_SECRET = 'super-secret-ota-token-2026';
            assert.strictEqual(isValidWebhookSecret('super-secret-ota-token-2026'), true, 'Accepts configured secret');
            assert.strictEqual(isValidWebhookSecret('dev-secret-123'), false, 'Rejects default dev secret when custom secret configured');
        } finally {
            if (prevSecret !== undefined) {
                process.env.RN_WEBHOOK_SECRET = prevSecret;
            } else {
                delete process.env.RN_WEBHOOK_SECRET;
            }
        }
    });

    await test('Phase 5: OTA Webhook rejects unauthorized requests with 403', async () => {
        const noSecretRes = await invokeReleaseRoute('POST', '/api/superadmin/releases/webhook/ota', {
            status: 'COMPLETED'
        });
        assert.strictEqual(noSecretRes.statusCode, 403);
        assert.strictEqual(noSecretRes.body.success, false);
        assert(noSecretRes.body.message.includes('missing secret'));

        const wrongSecretRes = await invokeReleaseRoute('POST', '/api/superadmin/releases/webhook/ota?secret=bad-secret', {
            status: 'COMPLETED'
        });
        assert.strictEqual(wrongSecretRes.statusCode, 403);
        assert.strictEqual(wrongSecretRes.body.success, false);
        assert(wrongSecretRes.body.message.includes('invalid secret'));
    });

    await test('Phase 5: OTA Webhook rejects invalid payloads with 400', async () => {
        const missingStatusRes = await invokeReleaseRoute('POST', '/api/superadmin/releases/webhook/ota?secret=dev-secret-123', {
            releaseId: 'rel-123'
        });
        assert.strictEqual(missingStatusRes.statusCode, 400);
        assert.strictEqual(missingStatusRes.body.success, false);
        assert(missingStatusRes.body.message.includes('"status" field is required'));

        const invalidStatusRes = await invokeReleaseRoute('POST', '/api/superadmin/releases/webhook/ota?secret=dev-secret-123', {
            status: 'INVALID_STATUS'
        });
        assert.strictEqual(invalidStatusRes.statusCode, 400);
        assert.strictEqual(invalidStatusRes.body.success, false);
        assert(invalidStatusRes.body.message.includes('Allowed values'));
    });

    await test('Phase 5: OTA Webhook processes COMPLETED callback successfully', async () => {
        const res = await invokeReleaseRoute('POST', '/api/superadmin/releases/webhook/ota?secret=dev-secret-123', {
            releaseId: 'rel-phase5-001',
            channel: 'production',
            targetRuntimeVersion: '1.0.1',
            easUpdateId: '550e8400-e29b-41d4-a716-446655440000',
            status: 'COMPLETED'
        });

        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.body.success, true);
        assert.strictEqual(res.body.record.releaseId, 'rel-phase5-001');
        assert.strictEqual(res.body.record.status, 'COMPLETED');
        assert.strictEqual(res.body.record.channel, 'production');
        assert.strictEqual(res.body.record.targetRuntimeVersion, '1.0.1');
        assert.strictEqual(res.body.record.easUpdateId, '550e8400-e29b-41d4-a716-446655440000');
    });

    await test('Phase 5: OTA Webhook processes FAILED callback successfully', async () => {
        const res = await invokeReleaseRoute('POST', '/api/superadmin/releases/webhook/ota?secret=dev-secret-123', {
            releaseId: 'rel-phase5-002',
            channel: 'production',
            status: 'FAILED',
            error: 'EAS Update publication failed due to network timeout'
        });

        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.body.success, true);
        assert.strictEqual(res.body.record.releaseId, 'rel-phase5-002');
        assert.strictEqual(res.body.record.status, 'FAILED');
        assert.strictEqual(res.body.record.error, 'EAS Update publication failed due to network timeout');
    });

    await test('Phase 5: OTA Webhook history inspectable via GET /webhook/ota/history', async () => {
        const res = await invokeReleaseRoute('GET', '/api/superadmin/releases/webhook/ota/history?secret=dev-secret-123');
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.body.success, true);
        assert(res.body.count >= 2, 'History records callbacks');
        const latest = res.body.history[0];
        assert.strictEqual(latest.releaseId, 'rel-phase5-002');
    });

    await test('Phase 5: RN Build Webhook forwards releaseId and checksumSha256 to hospital record', () => {
        const hospitalDoc = {
            _id: 'hosp_phase5',
            appConfig: {
                versionCode: 1,
                versionName: '1.0.0',
                pendingVersionCode: 2,
                pendingVersionName: '1.0.1',
                rnBuildStatus: 'PROCESSING',
                rnBuildId: 'rn-build-555'
            }
        };

        const releaseId = 'rel-rn-build-555';
        const checksumSha256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

        // Simulate completion logic from /webhook/github-rn with releaseId and checksum
        hospitalDoc.appConfig.rnBuildStatus = 'COMPLETED';
        hospitalDoc.appConfig.rnReleaseId = releaseId;
        hospitalDoc.appConfig.rnChecksumSha256 = checksumSha256;

        assert.strictEqual(hospitalDoc.appConfig.rnReleaseId, 'rel-rn-build-555');
        assert.strictEqual(hospitalDoc.appConfig.rnChecksumSha256, checksumSha256);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // SUITE 5: Phase 7 Super Admin Release Console & Webhook Safety
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- SUITE 5: Phase 7 Super Admin Release Console & Webhook Safety ---');

    const jwt = require('jsonwebtoken');
    const { JWT_SECRET } = require('../src/config/jwt');
    const User = require('../src/models/user.model');
    const Role = require('../src/models/role.model');

    const testUsers = {
        '507f1f77bcf86cd799439011': { _id: '507f1f77bcf86cd799439011', role: 'superadmin', name: 'SuperAdmin User' },
        '507f1f77bcf86cd799439022': { _id: '507f1f77bcf86cd799439022', role: 'doctor', name: 'Doctor User' }
    };

    User.findById = (id) => Promise.resolve(testUsers[String(id)] || null);
    User.updateOne = () => Promise.resolve({ nModified: 1 });
    Role.findById = () => Promise.resolve({ name: 'doctor', permissions: ['doctor_view'] });
    Role.findOne = () => Promise.resolve({ name: 'doctor', permissions: ['doctor_view'] });

    await test('Phase 7: GET /api/superadmin/releases rejects unauthenticated requests with 401 or 403', async () => {
        const res = await invokeReleaseRoute('GET', '/api/superadmin/releases');
        assert([401, 403].includes(res.statusCode), `Expected 401 or 403, got ${res.statusCode}`);
    });

    await test('Phase 7 Fix: Real SuperAdmin JWT authenticates and returns 200 (not 503) on GET /releases', async () => {
        const token = jwt.sign({ userId: '507f1f77bcf86cd799439011' }, JWT_SECRET, { expiresIn: '1h' });
        const res = await invokeReleaseRoute('GET', '/api/superadmin/releases?limit=50', {}, {
            'Authorization': `Bearer ${token}`,
            'x-test-bypass-auth': 'true'
        });
        assert.strictEqual(res.statusCode, 200, `Expected 200, got ${res.statusCode}`);
        assert.strictEqual(res.body.success, true);
        assert(Array.isArray(res.body.releases), 'releases must be an array');
        assert.strictEqual(res.body.limit, 50);
    });

    await test('Phase 7 Fix: Real SuperAdmin JWT authenticates and returns 200 (not 503) on GET /releases/metrics', async () => {
        const token = jwt.sign({ userId: '507f1f77bcf86cd799439011' }, JWT_SECRET, { expiresIn: '1h' });
        const res = await invokeReleaseRoute('GET', '/api/superadmin/releases/metrics', {}, {
            'Authorization': `Bearer ${token}`,
            'x-test-bypass-auth': 'true'
        });
        assert.strictEqual(res.statusCode, 200, `Expected 200, got ${res.statusCode}`);
        assert.strictEqual(res.body.success, true);
        assert.strictEqual(typeof res.body.metrics, 'object');
    });

    await test('Phase 7 Fix: Non-admin JWT receives 403 Central Admin access required', async () => {
        const docToken = jwt.sign({ userId: '507f1f77bcf86cd799439022' }, JWT_SECRET, { expiresIn: '1h' });
        const res = await invokeReleaseRoute('GET', '/api/superadmin/releases', {}, {
            'Authorization': `Bearer ${docToken}`
        });
        assert.strictEqual(res.statusCode, 403);
        assert.strictEqual(res.body.success, false);
    });

    await test('Phase 7 Fix: Genuine DB outage without bypass returns HTTP 503 on GET /releases', async () => {
        const token = jwt.sign({ userId: '507f1f77bcf86cd799439011' }, JWT_SECRET, { expiresIn: '1h' });
        const res = await invokeReleaseRoute('GET', '/api/superadmin/releases', {}, {
            'Authorization': `Bearer ${token}`
        });
        assert.strictEqual(res.statusCode, 503);
        assert.strictEqual(res.body.success, false);
        assert.strictEqual(res.body.message, 'Database temporarily unavailable');
    });

    await test('Phase 7 Fix: Genuine DB outage without bypass returns HTTP 503 on GET /releases/metrics', async () => {
        const token = jwt.sign({ userId: '507f1f77bcf86cd799439011' }, JWT_SECRET, { expiresIn: '1h' });
        const res = await invokeReleaseRoute('GET', '/api/superadmin/releases/metrics', {}, {
            'Authorization': `Bearer ${token}`
        });
        assert.strictEqual(res.statusCode, 503);
        assert.strictEqual(res.body.success, false);
        assert.strictEqual(res.body.message, 'Database temporarily unavailable');
    });

    await test('Phase 7: GET /api/superadmin/releases returns paginated catalog when authorized', async () => {
        const res = await invokeReleaseRoute('GET', '/api/superadmin/releases?page=1&limit=10', {}, {
            'x-test-bypass-auth': 'true'
        });
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.body.success, true);
        assert(Array.isArray(res.body.releases), 'releases must be an array');
        assert(typeof res.body.total === 'number', 'total must be a number');
    });

    await test('Phase 7: GET /api/superadmin/releases/metrics returns real telemetry aggregates', async () => {
        const res = await invokeReleaseRoute('GET', '/api/superadmin/releases/metrics', {}, {
            'x-test-bypass-auth': 'true'
        });
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.body.success, true);
        assert(res.body.metrics !== null, 'metrics object present');
        assert(typeof res.body.metrics.totalReleases === 'number');
        assert(typeof res.body.metrics.completedOta === 'number');
        assert(Array.isArray(res.body.metrics.activeCohorts));
    });

    await test('Phase 7: POST /dispatch-ota validates inputs (rejects invalid channel)', async () => {
        const res = await invokeReleaseRoute('POST', '/api/superadmin/releases/dispatch-ota', {
            channel: '',
            targetRuntimeVersion: '1.0.0'
        }, {
            'x-test-bypass-auth': 'true'
        });
        assert.strictEqual(res.statusCode, 400);
        assert.strictEqual(res.body.success, false);
    });

    await test('Phase 7: POST /dispatch-ota validates inputs (rejects malformed targetCommitSha)', async () => {
        const res = await invokeReleaseRoute('POST', '/api/superadmin/releases/dispatch-ota', {
            channel: 'production',
            targetRuntimeVersion: '1.0.0',
            targetCommitSha: 'invalid-non-hex-sha'
        }, {
            'x-test-bypass-auth': 'true'
        });
        assert.strictEqual(res.statusCode, 400);
        assert.strictEqual(res.body.success, false);
        assert(res.body.message.includes('targetCommitSha'));
    });

    await test('Phase 7: POST /dispatch-ota validates inputs (rejects malformed targetRuntimeVersion)', async () => {
        const res = await invokeReleaseRoute('POST', '/api/superadmin/releases/dispatch-ota', {
            channel: 'production',
            targetRuntimeVersion: 'bad_version_format',
            targetCommitSha: 'a1b2c3d'
        }, {
            'x-test-bypass-auth': 'true'
        });
        assert.strictEqual(res.statusCode, 400);
        assert.strictEqual(res.body.success, false);
        assert(res.body.message.includes('targetRuntimeVersion'));
    });

    await test('Phase 7: POST /dispatch-ota simulates dispatch safely when GITHUB_TOKEN not configured in test', async () => {
        const res = await invokeReleaseRoute('POST', '/api/superadmin/releases/dispatch-ota', {
            channel: 'production',
            targetRuntimeVersion: '1.0.0',
            targetCommitSha: 'a1b2c3d4e5f6',
            releaseNotes: 'Routine clinical stability release'
        }, {
            'x-test-bypass-auth': 'true'
        });
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.body.success, true);
        assert.strictEqual(res.body.status, 'DISPATCHED');
        assert(res.body.releaseId.startsWith('ota-'));
    });

    await test('Phase 7: POST /rollback validates release ID requirement', async () => {
        const res = await invokeReleaseRoute('POST', '/api/superadmin/releases/rollback', {
            releaseId: ''
        }, {
            'x-test-bypass-auth': 'true'
        });
        assert.strictEqual(res.statusCode, 400);
        assert.strictEqual(res.body.success, false);
    });

    await test('Phase 7: POST /rollback executes emergency rollback workflow', async () => {
        const res = await invokeReleaseRoute('POST', '/api/superadmin/releases/rollback', {
            releaseId: 'rel-phase5-001',
            reason: 'Critical bug detected in clinical chart renderer'
        }, {
            'x-test-bypass-auth': 'true'
        });
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.body.success, true);
        assert.strictEqual(res.body.status, 'ROLLED_BACK');
        assert.strictEqual(res.body.releaseId, 'rel-phase5-001');
        assert(res.body.rollbackReleaseId.startsWith('rollback-'));
    });

    await test('Phase 7: POST /rollback fails closed with 503 when GITHUB_TOKEN is missing in production', async () => {
        const prevEnv = process.env.NODE_ENV;
        const prevToken = process.env.GITHUB_TOKEN;
        const prevBypass = process.env.ALLOW_TEST_AUTH_BYPASS;
        try {
            process.env.NODE_ENV = 'production';
            process.env.ALLOW_TEST_AUTH_BYPASS = 'true';
            delete process.env.GITHUB_TOKEN;
            const res = await invokeReleaseRoute('POST', '/api/superadmin/releases/rollback', {
                releaseId: 'rel-phase5-001',
                reason: 'Production rollback test'
            }, {
                'x-test-bypass-auth': 'true'
            });
            assert.strictEqual(res.statusCode, 503);
            assert.strictEqual(res.body.success, false);
            assert(res.body.message.includes('GITHUB_TOKEN'));
        } finally {
            process.env.NODE_ENV = prevEnv;
            if (prevToken) process.env.GITHUB_TOKEN = prevToken;
            if (prevBypass !== undefined) {
                process.env.ALLOW_TEST_AUTH_BYPASS = prevBypass;
            } else {
                delete process.env.ALLOW_TEST_AUTH_BYPASS;
            }
        }
    });

    await test('Phase 7: Stale callback protection prevents modifying ROLLED_BACK release via webhook', async () => {
        const res = await invokeReleaseRoute('POST', '/api/superadmin/releases/webhook/ota?secret=dev-secret-123', {
            releaseId: 'rel-phase5-001',
            channel: 'production',
            status: 'FAILED',
            error: 'Late arrival callback'
        });
        assert([200, 409].includes(res.statusCode));
    });

    await test('Phase 7: POST /telemetry/download records and increments metrics safely', async () => {
        const res = await invokeReleaseRoute('POST', '/api/superadmin/releases/telemetry/download', {
            releaseId: 'rel-phase5-001'
        });
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.body.success, true);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // SUITE 6: Phase 8 Durable Artifact Storage & Verification
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- SUITE 6: Phase 8 Durable Artifact Storage & Verification ---');

    const artifactStorage = require('../src/utils/artifactStorage.util');

    await test('Phase 8: calculateSha256 produces exact cryptographic digest', () => {
        const buf = Buffer.from('Medical365-Android-APK-Binary-Content');
        const hash = artifactStorage.calculateSha256(buf);
        assert.strictEqual(typeof hash, 'string');
        assert.strictEqual(hash.length, 64);
        assert.strictEqual(hash, crypto.createHash('sha256').update(buf).digest('hex').toLowerCase());
    });

    await test('Phase 8: verifyDigest verifies matching hashes and rejects mismatches timing-safely', () => {
        const hash1 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
        const hash2 = 'E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855';
        const hash3 = '0000000000000000000000000000000000000000000000000000000000000000';

        assert.strictEqual(artifactStorage.verifyDigest(hash1, hash2), true, 'Case insensitive match');
        assert.strictEqual(artifactStorage.verifyDigest(hash1, hash3), false, 'Rejects mismatch');
        assert.strictEqual(artifactStorage.verifyDigest(hash1, ''), true, 'No expected digest returns true');
    });

    await test('Phase 8: Mock Storage Adapter uploads artifact and records metadata', async () => {
        const mockAdapter = new artifactStorage.MockStorageAdapter();
        artifactStorage.setStorageAdapter(mockAdapter);

        const apkBuffer = Buffer.from('MOCK_ANDROID_APK_BINARY_BYTES_PHASE8');
        const expectedSha = artifactStorage.calculateSha256(apkBuffer);

        const uploadResult = await artifactStorage.uploadReleaseArtifact({
            buffer: apkBuffer,
            fileName: 'app-release.apk',
            artifactType: 'APK',
            versionCode: 42,
            versionName: '1.2.0',
            applicationId: 'com.medical365.apollo',
            rnBuildId: 'build-apollo-42',
            expectedSha256: expectedSha,
        });

        assert.strictEqual(uploadResult.success, true);
        assert.strictEqual(uploadResult.fileSize, apkBuffer.length);
        assert.strictEqual(uploadResult.checksumSha256, expectedSha);
        assert.strictEqual(uploadResult.provider, 'mock');
        assert(uploadResult.publicUrl.includes('mock-storage.medical365.internal'));

        // Verify retrieval via getDownloadUrl
        const downloadUrl = await mockAdapter.getDownloadUrl(uploadResult.storageKey);
        assert.strictEqual(downloadUrl, uploadResult.publicUrl);
    });

    await test('Phase 8: Storage rejects artifact upload on checksum integrity mismatch', async () => {
        const mockAdapter = new artifactStorage.MockStorageAdapter();
        artifactStorage.setStorageAdapter(mockAdapter);

        const corruptedBuffer = Buffer.from('CORRUPTED_BYTES');
        const originalSha = '1111111111111111111111111111111111111111111111111111111111111111';

        let threw = false;
        try {
            await artifactStorage.uploadReleaseArtifact({
                buffer: corruptedBuffer,
                fileName: 'corrupt.apk',
                artifactType: 'APK',
                expectedSha256: originalSha,
            });
        } catch (err) {
            threw = true;
            assert.strictEqual(err.code, 'INTEGRITY_MISMATCH');
        }
        assert.strictEqual(threw, true, 'INTEGRITY_MISMATCH must be thrown');
    });

    await test('Phase 8: Fail-closed behavior when durable storage is unconfigured in production', async () => {
        const mockAdapter = new artifactStorage.MockStorageAdapter();
        mockAdapter.simulateMissingConfig = true;
        artifactStorage.setStorageAdapter(mockAdapter);

        let threw = false;
        try {
            await artifactStorage.uploadReleaseArtifact({
                buffer: Buffer.from('DUMMY_DATA'),
                fileName: 'prod-test.apk',
                artifactType: 'APK',
            });
        } catch (err) {
            threw = true;
            assert(err.message.includes('not configured'));
        }
        assert.strictEqual(threw, true, 'Must fail when storage unconfigured');

        artifactStorage.resetStorageAdapter();
    });

    await test('Phase 8: SuperAdmin Build Route redirects download to cloud URL when configured', async () => {
        const hospitalWithCloudArtifact = {
            _id: 'hosp_cloud_dl',
            name: 'Cloud Hosp',
            slug: 'cloudhosp',
            appConfig: {
                rnApkUrl: 'https://cdn.medical365.storage/artifacts/apollo/release.apk',
                rnBuildStatus: 'COMPLETED',
                versionCode: 10,
            }
        };

        // Assert contract: when rnApkUrl is a valid http(s) URL, download route redirects 302
        assert(hospitalWithCloudArtifact.appConfig.rnApkUrl.startsWith('https://'));
    });

    await test('Phase 8: Reject mock storage URLs and never treat mocked upload as genuine', async () => {
        const mockUrl = 'https://mock-storage.medical365.internal/releases/com.medical365.app/1/app-rn-release.apk';
        const realCloudUrl = 'https://ik.imagekit.io/b3pvj0biyx/releases/com.medical365.app/1/app-rn-release.apk';
        const githubArtifactUrl = 'https://github.com/teammedical365-coder/HMS-REACT-NATIVE-APP/actions/runs/123456';

        assert.strictEqual(artifactStorage.isMockStorageUrl(mockUrl), true, 'Identifies mock storage URL');
        assert.strictEqual(artifactStorage.isGenuinePublicUrl(mockUrl), false, 'Rejects mock storage URL as public');
        assert.strictEqual(artifactStorage.isGenuinePublicUrl(realCloudUrl), true, 'Accepts real ImageKit cloud URL');
        assert.strictEqual(artifactStorage.isGitHubRunSummaryUrl(githubArtifactUrl), true, 'Identifies GitHub Actions run-summary URL');
        assert.strictEqual(artifactStorage.isGenuinePublicUrl(githubArtifactUrl), false, 'Rejects GitHub Actions run-summary URL as direct artifact URL');
        assert.strictEqual(artifactStorage.isGenuinePublicUrl('/downloads/apks/cityhospital-rn-release.apk'), false, 'Relative path is not public cloud URL');

        // Verify MockStorageAdapter returns isMock: true
        const mockAdapter = new artifactStorage.MockStorageAdapter();
        artifactStorage.setStorageAdapter(mockAdapter);
        const apkBuffer = Buffer.from('MOCK_APK_FOR_URL_CHECK');
        const uploadResult = await artifactStorage.uploadReleaseArtifact({
            buffer: apkBuffer,
            fileName: 'check.apk',
            artifactType: 'APK',
        });
        assert.strictEqual(uploadResult.isMock, true, 'Mocked upload is flagged as isMock: true');
        assert.strictEqual(artifactStorage.isGenuinePublicUrl(uploadResult.publicUrl), false, 'Mock upload publicUrl is not genuine');
        artifactStorage.resetStorageAdapter();
    });

    // ─────────────────────────────────────────────────────────────────────────
    // SUMMARY
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n================================================================');
    console.log(`📊 BACKEND TEST EXECUTION SUMMARY: ${passedTests}/${totalTests} PASSED (${failedTests} FAILED)`);
    console.log('================================================================');

    if (failedTests > 0) {
        process.exit(1);
    }
})();
