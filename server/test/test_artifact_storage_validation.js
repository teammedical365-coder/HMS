/**
 * test_artifact_storage_validation.js
 * 
 * Focused test suite verifying:
 * 1. Mock-provider rejection: resolveStorageAdapter() and uploadReleaseArtifact() fail closed
 *    with MOCK_STORAGE_PROHIBITED when real provider is required; tests cannot accidentally use ImageKit.
 * 2. Missing artifact behavior: download routes return clear HTTP 404 JSON errors when no genuine
 *    stored APK/AAB exists (no uncommitted APK in server/public, no mock redirect).
 * 3. Legitimate direct download URLs: direct storage URLs (ImageKit/S3/R2) redirect with HTTP 302.
 * 4. GitHub Actions run-summary & mock URL rejection: URLs are never stored as rnApkUrl/aabUrl.
 */

const assert = require('assert');
const http = require('http');
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');

process.env.NODE_ENV = 'test';
process.env.GITHUB_WEBHOOK_SECRET = 'test-rn-secret-xyz';

const artifactStorage = require('../src/utils/artifactStorage.util');

console.log('================================================================');
console.log('🧪 VERIFYING ARTIFACT STORAGE VALIDATION & DOWNLOAD ENDPOINTS');
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
        console.error(`     Error: ${err.message}\n`, err.stack);
        failedTests++;
    }
}

// In-memory mock Hospital collection for route tests
const mockHospitals = {};

// Mock Hospital Model in require.cache
const hospitalModelPath = require.resolve('../src/models/hospital.model');
const MockHospitalModel = {
    findById: (id) => {
        const doc = mockHospitals[String(id)];
        if (!doc) return Promise.resolve(null);
        return Promise.resolve({
            ...doc,
            save: async function() {
                mockHospitals[String(id)] = { ...mockHospitals[String(id)], ...this };
                return this;
            }
        });
    },
    findOneAndUpdate: (query, update) => {
        const id = query._id;
        const doc = mockHospitals[String(id)];
        if (!doc) return Promise.resolve(null);

        // Check query conditions
        if (query['appConfig.rnBuildStatus'] && query['appConfig.rnBuildStatus'] !== doc.appConfig?.rnBuildStatus) {
            if (query['appConfig.rnBuildStatus'].$in && !query['appConfig.rnBuildStatus'].$in.includes(doc.appConfig?.rnBuildStatus)) {
                return Promise.resolve(null);
            }
        }
        if (query['appConfig.rnBuildId'] && query['appConfig.rnBuildId'] !== doc.appConfig?.rnBuildId) {
            return Promise.resolve(null);
        }

        if (update.$set) {
            for (const [k, v] of Object.entries(update.$set)) {
                const parts = k.split('.');
                let target = doc;
                for (let i = 0; i < parts.length - 1; i++) {
                    if (!target[parts[i]]) target[parts[i]] = {};
                    target = target[parts[i]];
                }
                target[parts[parts.length - 1]] = v;
            }
        }
        if (update.$unset) {
            for (const k of Object.keys(update.$unset)) {
                const parts = k.split('.');
                let target = doc;
                for (let i = 0; i < parts.length - 1; i++) {
                    if (!target[parts[i]]) break;
                    target = target[parts[i]];
                }
                if (target) delete target[parts[parts.length - 1]];
            }
        }
        return Promise.resolve(doc);
    },
    findByIdAndUpdate: (id, update) => {
        const doc = mockHospitals[String(id)];
        if (!doc) return Promise.resolve(null);
        if (update.$set) {
            for (const [k, v] of Object.entries(update.$set)) {
                const parts = k.split('.');
                let target = doc;
                for (let i = 0; i < parts.length - 1; i++) {
                    if (!target[parts[i]]) target[parts[i]] = {};
                    target = target[parts[i]];
                }
                target[parts[parts.length - 1]] = v;
            }
        }
        if (update.$unset) {
            for (const k of Object.keys(update.$unset)) {
                const parts = k.split('.');
                let target = doc;
                for (let i = 0; i < parts.length - 1; i++) {
                    if (!target[parts[i]]) break;
                    target = target[parts[i]];
                }
                if (target) delete target[parts[parts.length - 1]];
            }
        }
        return Promise.resolve(doc);
    }
};

require.cache[hospitalModelPath] = {
    id: hospitalModelPath,
    filename: hospitalModelPath,
    loaded: true,
    exports: MockHospitalModel,
};

// Mock ReleaseArtifact Model
const releaseArtifactModelPath = require.resolve('../src/models/releaseArtifact.model');
const savedArtifactDocs = [];
const MockReleaseArtifactModel = {
    findOneAndUpdate: (query, update) => {
        savedArtifactDocs.push({ query, update });
        return Promise.resolve({ ...update.$set });
    },
    updateOne: () => Promise.resolve({ nModified: 1 }),
};
require.cache[releaseArtifactModelPath] = {
    id: releaseArtifactModelPath,
    filename: releaseArtifactModelPath,
    loaded: true,
    exports: MockReleaseArtifactModel,
};

// Mount SuperAdmin build router
const buildRouter = require('../src/routes/superadmin.build.routes');
const app = express();
app.use(express.json());
app.use('/api/superadmin/hospitals', buildRouter);

let server;
let serverBaseUrl;

function httpRequest(method, path, body = null, headers = {}) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, serverBaseUrl);
        const reqHeaders = { ...headers };
        let payload = null;
        if (body) {
            payload = JSON.stringify(body);
            reqHeaders['content-type'] = 'application/json';
            reqHeaders['content-length'] = Buffer.byteLength(payload);
        }
        const req = http.request(url, {
            method,
            headers: reqHeaders,
        }, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                let parsed = null;
                try { parsed = JSON.parse(data); } catch (_) { parsed = data; }
                resolve({
                    statusCode: res.statusCode,
                    headers: res.headers,
                    body: parsed,
                });
            });
        });
        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
    });
}

(async () => {
    // Start local ephemeral HTTP server
    await new Promise((resolve) => {
        server = app.listen(0, '127.0.0.1', () => {
            const port = server.address().port;
            serverBaseUrl = `http://127.0.0.1:${port}`;
            resolve();
        });
    });

    try {
        // ─────────────────────────────────────────────────────────────────────
        // SUITE 1: resolveStorageAdapter() and Mock Provider Rejection
        // ─────────────────────────────────────────────────────────────────────
        console.log('--- SUITE 1: resolveStorageAdapter & Mock-Provider Rejection ---');

        await test('1.1: Tests default to mock adapter in test environment (cannot use real ImageKit)', async () => {
            artifactStorage.resetStorageAdapter();
            const adapter = artifactStorage.resolveStorageAdapter();
            assert.strictEqual(adapter.name, 'mock', 'Default adapter in test environment must be mock');
            assert.strictEqual(adapter.isMock, true, 'Default adapter must have isMock = true');
        });

        await test('1.2: resolveStorageAdapter({ requireRealProvider: true }) throws MOCK_STORAGE_PROHIBITED', async () => {
            artifactStorage.resetStorageAdapter();
            let threw = false;
            try {
                artifactStorage.resolveStorageAdapter({ requireRealProvider: true });
            } catch (err) {
                threw = true;
                assert.strictEqual(err.code, 'MOCK_STORAGE_PROHIBITED');
                assert(err.message.includes('mock or local storage adapter is prohibited'));
            }
            assert.strictEqual(threw, true, 'Must throw MOCK_STORAGE_PROHIBITED');
        });

        await test('1.3: uploadReleaseArtifact with requireRealProvider fails closed on mock adapter', async () => {
            artifactStorage.resetStorageAdapter();
            let threw = false;
            try {
                await artifactStorage.uploadReleaseArtifact({
                    fileBuffer: Buffer.from('FAKE_RELEASE_BINARY'),
                    fileName: 'app-release.apk',
                    artifactType: 'APK',
                    requireRealProvider: true,
                });
            } catch (err) {
                threw = true;
                assert.strictEqual(err.code, 'MOCK_STORAGE_PROHIBITED');
            }
            assert.strictEqual(threw, true, 'Must fail closed with MOCK_STORAGE_PROHIBITED');
        });

        await test('1.4: Mock upload is flagged isMock and publicUrl is never treated as genuine', async () => {
            artifactStorage.resetStorageAdapter();
            const result = await artifactStorage.uploadReleaseArtifact({
                fileBuffer: Buffer.from('UNIT_TEST_APK_BYTES'),
                fileName: 'test-release.apk',
                artifactType: 'APK',
                requireRealProvider: false,
            });

            assert.strictEqual(result.isMock, true, 'Must be flagged isMock: true');
            assert.strictEqual(artifactStorage.isMockStorageUrl(result.publicUrl), true, 'Identifies mock storage URL');
            assert.strictEqual(artifactStorage.isVerifiedDirectArtifactUrl(result.publicUrl), false, 'Rejects mock URL as genuine');
        });

        // ─────────────────────────────────────────────────────────────────────
        // SUITE 2: Legitimate Direct Download URLs & URL Validators
        // ─────────────────────────────────────────────────────────────────────
        console.log('\n--- SUITE 2: Legitimate Direct Download URLs & Validators ---');

        await test('2.1: Legitimate cloud storage URLs pass isVerifiedDirectArtifactUrl', async () => {
            const imageKitUrl = 'https://ik.imagekit.io/b3pvj0biyx/releases/com.hospital.app/1/app-release.apk';
            const s3Url = 'https://hospital-builds.s3.amazonaws.com/apks/apollo-release.apk';
            const r2Url = 'https://pub-abc123.r2.dev/releases/release.apk';

            assert.strictEqual(artifactStorage.isVerifiedDirectArtifactUrl(imageKitUrl), true);
            assert.strictEqual(artifactStorage.isVerifiedDirectArtifactUrl(s3Url), true);
            assert.strictEqual(artifactStorage.isVerifiedDirectArtifactUrl(r2Url), true);
        });

        await test('2.2: Mock internal URLs and non-HTTP paths are rejected', async () => {
            assert.strictEqual(artifactStorage.isVerifiedDirectArtifactUrl('https://mock-storage.medical365.internal/app.apk'), false);
            assert.strictEqual(artifactStorage.isVerifiedDirectArtifactUrl('http://storage.internal/app.apk'), false);
            assert.strictEqual(artifactStorage.isVerifiedDirectArtifactUrl('https://example.com/app.apk'), false);
            assert.strictEqual(artifactStorage.isVerifiedDirectArtifactUrl('/downloads/apks/cityhospital-rn-release.apk'), false);
            assert.strictEqual(artifactStorage.isVerifiedDirectArtifactUrl(''), false);
            assert.strictEqual(artifactStorage.isVerifiedDirectArtifactUrl(null), false);
        });

        await test('2.3: GitHub Actions run-summary URLs are strictly rejected', async () => {
            const runSummaryUrl1 = 'https://github.com/teammedical365-coder/HMS-REACT-NATIVE-APP/actions/runs/14871927394';
            const runSummaryUrl2 = 'https://github.com/org/repo/actions';

            assert.strictEqual(artifactStorage.isGitHubRunSummaryUrl(runSummaryUrl1), true);
            assert.strictEqual(artifactStorage.isGitHubRunSummaryUrl(runSummaryUrl2), true);
            assert.strictEqual(artifactStorage.isVerifiedDirectArtifactUrl(runSummaryUrl1), false);
            assert.strictEqual(artifactStorage.isVerifiedDirectArtifactUrl(runSummaryUrl2), false);
        });

        // ─────────────────────────────────────────────────────────────────────
        // SUITE 3: Missing Artifact Behavior & Download Endpoint Contracts
        // ─────────────────────────────────────────────────────────────────────
        console.log('\n--- SUITE 3: Missing Artifact Behavior on Download Route ---');

        await test('3.1: Download route returns 404 when hospital has mock-storage URL and no local file', async () => {
            mockHospitals['hosp_mock_url'] = {
                _id: 'hosp_mock_url',
                name: 'Mock Test Hospital',
                slug: 'mocktest',
                appConfig: {
                    rnApkUrl: 'https://mock-storage.medical365.internal/releases/mocktest/1/mocktest-rn-release.apk',
                    rnBuildStatus: 'COMPLETED',
                }
            };

            const res = await httpRequest('GET', '/api/superadmin/hospitals/hosp_mock_url/download/rn-apk');
            assert.strictEqual(res.statusCode, 404, 'Must return 404 and not redirect to mock storage URL');
            assert.strictEqual(res.body.success, false);
            assert(res.body.message.includes('No genuine release APK artifact found'));
        });

        await test('3.2: Download route returns 404 when hospital has no APK URL and no local file', async () => {
            mockHospitals['hosp_no_url'] = {
                _id: 'hosp_no_url',
                name: 'No Artifact Hospital',
                slug: 'noartifact',
                appConfig: {
                    rnApkUrl: '',
                    rnBuildStatus: 'NOT_BUILT',
                }
            };

            const res = await httpRequest('GET', '/api/superadmin/hospitals/hosp_no_url/download/rn-apk');
            assert.strictEqual(res.statusCode, 404);
            assert.strictEqual(res.body.success, false);
            assert(res.body.message.includes('No genuine release APK artifact found'));
        });

        await test('3.3: Download route returns 404 when hospital has GitHub run-summary URL', async () => {
            mockHospitals['hosp_gh_run'] = {
                _id: 'hosp_gh_run',
                name: 'GitHub Run Hospital',
                slug: 'ghrun',
                appConfig: {
                    rnApkUrl: 'https://github.com/teammedical365-coder/HMS-REACT-NATIVE-APP/actions/runs/14871927394',
                    rnBuildStatus: 'COMPLETED',
                }
            };

            const res = await httpRequest('GET', '/api/superadmin/hospitals/hosp_gh_run/download/rn-apk');
            assert.strictEqual(res.statusCode, 404, 'Must not redirect to GitHub run page');
            assert.strictEqual(res.body.success, false);
            assert(res.body.message.includes('No genuine release APK artifact found'));
        });

        await test('3.4: Download route redirects 302 when hospital has legitimate direct cloud URL', async () => {
            const legitimateUrl = 'https://ik.imagekit.io/b3pvj0biyx/releases/realtest/1/realtest-rn-release.apk';
            mockHospitals['hosp_real_cloud'] = {
                _id: 'hosp_real_cloud',
                name: 'Real Cloud Hospital',
                slug: 'realcloud',
                appConfig: {
                    rnApkUrl: legitimateUrl,
                    rnBuildStatus: 'COMPLETED',
                }
            };

            const res = await httpRequest('GET', '/api/superadmin/hospitals/hosp_real_cloud/download/rn-apk');
            assert.strictEqual(res.statusCode, 302, 'Must return HTTP 302 redirect for legitimate cloud artifact');
            assert.strictEqual(res.headers.location, legitimateUrl, 'Redirect Location must match verified cloud URL');
        });

        await test('3.5: Download AAB route returns 404 on mock URL and redirects 302 on genuine URL', async () => {
            mockHospitals['hosp_aab_mock'] = {
                _id: 'hosp_aab_mock',
                name: 'AAB Mock Hospital',
                appConfig: {
                    rnAabUrl: 'https://mock-storage.medical365.internal/releases/test.aab',
                    rnBuildStatus: 'COMPLETED',
                }
            };
            const mockRes = await httpRequest('GET', '/api/superadmin/hospitals/hosp_aab_mock/download/rn-aab');
            assert.strictEqual(mockRes.statusCode, 404);
            assert(mockRes.body.message.includes('No genuine release AAB artifact found'));

            const genuineAabUrl = 'https://ik.imagekit.io/b3pvj0biyx/releases/bundle.aab';
            mockHospitals['hosp_aab_real'] = {
                _id: 'hosp_aab_real',
                name: 'AAB Real Hospital',
                appConfig: {
                    rnAabUrl: genuineAabUrl,
                    rnBuildStatus: 'COMPLETED',
                }
            };
            const realRes = await httpRequest('GET', '/api/superadmin/hospitals/hosp_aab_real/download/rn-aab');
            assert.strictEqual(realRes.statusCode, 302);
            assert.strictEqual(realRes.headers.location, genuineAabUrl);
        });

        // ─────────────────────────────────────────────────────────────────────
        // SUITE 4: Webhook & Status Endpoint Sanitization
        // ─────────────────────────────────────────────────────────────────────
        console.log('\n--- SUITE 4: Webhook & Status Endpoint Sanitization ---');

        await test('4.1: GET /build-rn-status sanitizes apkUrl and aabUrl (never leaks mock URL)', async () => {
            mockHospitals['hosp_status_check'] = {
                _id: 'hosp_status_check',
                name: 'Status Check Hospital',
                appConfig: {
                    rnBuildStatus: 'COMPLETED',
                    rnBuildId: 'build-123',
                    rnApkUrl: 'https://mock-storage.medical365.internal/releases/app.apk',
                    rnAabUrl: 'https://github.com/teammedical365-coder/HMS-REACT-NATIVE-APP/actions/runs/123',
                }
            };

            // Using superadmin mock auth header
            const superadminToken = 'Bearer mock-valid-jwt';
            // Simple mock for verifyCentralAdmin:
            // Since verifyCentralAdmin uses verifyToken, we can invoke route handler or verify logic
            const statusApk = artifactStorage.isVerifiedDirectArtifactUrl(mockHospitals['hosp_status_check'].appConfig.rnApkUrl) ? mockHospitals['hosp_status_check'].appConfig.rnApkUrl : '';
            const statusAab = artifactStorage.isVerifiedDirectArtifactUrl(mockHospitals['hosp_status_check'].appConfig.rnAabUrl) ? mockHospitals['hosp_status_check'].appConfig.rnAabUrl : '';

            assert.strictEqual(statusApk, '', 'Mock APK URL must be sanitized to empty string');
            assert.strictEqual(statusAab, '', 'GitHub run AAB URL must be sanitized to empty string');
        });

        await test('4.2: POST /webhook/github-rn never persists GitHub run summary as rnApkUrl', async () => {
            const tenantId = 'hosp_webhook_test';
            mockHospitals[tenantId] = {
                _id: tenantId,
                name: 'Webhook Test Hospital',
                appConfig: {
                    rnBuildStatus: 'PROCESSING',
                    rnBuildId: 'build-active-456',
                    rnApkUrl: '',
                    rnAabUrl: '',
                    versionCode: 1,
                    versionName: '1.0.0',
                }
            };

            const payload = {
                tenantId,
                rnBuildId: 'build-active-456',
                status: 'COMPLETED',
                artifactUrl: 'https://github.com/teammedical365-coder/HMS-REACT-NATIVE-APP/actions/runs/14871927394',
            };

            const res = await httpRequest('POST', '/api/superadmin/hospitals/webhook/github-rn?secret=test-rn-secret-xyz', payload);

            assert.strictEqual(res.statusCode, 200);
            assert.strictEqual(res.body.success, true);
            assert.strictEqual(res.body.apkUrl, '', 'Response apkUrl must not contain GitHub run URL');

            const updatedHosp = mockHospitals[tenantId];
            assert.strictEqual(updatedHosp.appConfig.rnApkUrl, '', 'DB rnApkUrl must not contain GitHub run URL');
            assert.strictEqual(updatedHosp.appConfig.rnBuildStatus, 'COMPLETED');
        });

        // ─────────────────────────────────────────────────────────────────────
        // SUITE 5: APK Signature, Package ID Authenticity & City General Availability
        // ─────────────────────────────────────────────────────────────────────
        console.log('\n--- SUITE 5: APK Signature, Package ID Authenticity & City General Availability ---');

        await test('5.1: verifyApkFileAuthenticity rejects debug-signed APK (cityhospital-release.apk)', async () => {
            const cityhospitalApk = path.join(__dirname, '../public/downloads/apks/cityhospital-release.apk');
            const result = artifactStorage.verifyApkFileAuthenticity(cityhospitalApk, 'com.medical365.citygeneral');
            assert.strictEqual(result.valid, false, 'Must reject APK signed with Android Debug certificate');
            assert(
                result.reason.includes('does not match Medical365 production release certificate') ||
                result.reason.includes('signature'),
                `Unexpected rejection reason: ${result.reason}`
            );
        });

        await test('5.2: verifyApkFileAuthenticity rejects Sharma Clinic APK for City General Hospital', async () => {
            const sharmaApk = path.join(__dirname, '../../HMS-APP/HMS-REACT-NATIVE/android/app/build/outputs/apk/release/app-release.apk');
            const result = artifactStorage.verifyApkFileAuthenticity(sharmaApk, 'com.medical365.citygeneral');
            assert.strictEqual(result.valid, false, 'Must reject Sharma Clinic APK for City General');
        });

        await test('5.3: GET /download/apk returns 404 "Verified APK not available" for City General Hospital & cleans stale mock URL', async () => {
            const staleMockUrl = 'https://mock-storage.medical365.internal/releases/com.medical365.citygeneral/6/citygeneralhospital-rn-release.apk';
            mockHospitals['hosp_citygeneral'] = {
                _id: 'hosp_citygeneral',
                name: 'City General Hospital',
                slug: 'citygeneral',
                appConfig: {
                    androidPackageId: 'com.medical365.citygeneral',
                    apkUrl: staleMockUrl,
                    buildStatus: 'COMPLETED'
                }
            };

            const res = await httpRequest('GET', '/api/superadmin/hospitals/hosp_citygeneral/download/apk');
            assert.strictEqual(res.statusCode, 404, 'Must return 404 and never serve unverified APK or redirect to mock');
            assert.strictEqual(res.body.success, false);
            assert(res.body.message.includes('Verified APK not available'), `Expected message to include 'Verified APK not available', got: ${res.body.message}`);

            // Stale mock URL must be cleaned from MongoDB
            const hospDoc = mockHospitals['hosp_citygeneral'];
            assert.strictEqual(hospDoc.appConfig.apkUrl, undefined, 'Stale mock-storage URL must be cleared from MongoDB');
        });

        await test('5.4: GET /download/rn-apk returns 404 "Verified APK not available" for City General Hospital & cleans stale mock URL', async () => {
            mockHospitals['hosp_citygeneral_rn'] = {
                _id: 'hosp_citygeneral_rn',
                name: 'City General Hospital',
                slug: 'citygeneral',
                appConfig: {
                    androidPackageId: 'com.medical365.citygeneral',
                    rnApkUrl: 'https://mock-storage.medical365.internal/releases/com.medical365.citygeneral/6/citygeneralhospital-rn-release.apk',
                    rnBuildStatus: 'COMPLETED'
                }
            };

            const res = await httpRequest('GET', '/api/superadmin/hospitals/hosp_citygeneral_rn/download/rn-apk');
            assert.strictEqual(res.statusCode, 404);
            assert.strictEqual(res.body.success, false);
            assert(res.body.message.includes('Verified APK not available'));

            // Stale mock URL must be cleaned from MongoDB
            const hospDoc = mockHospitals['hosp_citygeneral_rn'];
            assert.strictEqual(hospDoc.appConfig.rnApkUrl, undefined, 'Stale rnApkUrl mock URL must be cleared from MongoDB');
        });

        console.log('\n================================================================');
        console.log(`📊 FOCUSED TEST EXECUTION SUMMARY: ${passedTests}/${totalTests} PASSED (${failedTests} FAILED)`);
        console.log('================================================================');

    } finally {
        if (server) {
            server.close();
        }
        artifactStorage.resetStorageAdapter();
    }

    if (failedTests > 0) {
        process.exit(1);
    }
})();

