/**
 * test_rn_upload_regression_fix.js
 *
 * Comprehensive regression tests verifying:
 * 1. Storage adapter resolution under NODE_ENV=test (ImageKit selection, unconfigured storage, mock behavior).
 * 2. Failure recovery in /webhook/github-rn/upload-build (rnBuildId scoping, BUILDING/PROCESSING -> FAILED transition, preserving existing URLs).
 * 3. GitHub FAILED webhook handling (PROCESSING -> FAILED, BUILDING -> FAILED, idempotency, COMPLETED protection, stale build rejection).
 * 4. Backup restoration and staging cleanup.
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const http = require('http');
const express = require('express');

// Set test environment
process.env.NODE_ENV = 'test';
process.env.GITHUB_WEBHOOK_SECRET = 'test-rn-secret-xyz';
process.env.JWT_SECRET = 'test-jwt-secret-long-enough-32-chars';

let passedCount = 0;
let failedCount = 0;

async function test(name, fn) {
    try {
        await fn();
        console.log(`  ✓ [PASS] ${name}`);
        passedCount++;
    } catch (err) {
        console.error(`  ✗ [FAIL] ${name}`);
        console.error(`     Error: ${err.message}`);
        console.error(err.stack);
        failedCount++;
    }
}

// ─────────────────────────────────────────────────────────────────────
// In-Memory Mock Hospital Store and Model
// ─────────────────────────────────────────────────────────────────────
const mockHospitals = {};
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
    findOneAndUpdate: (query, update, options) => {
        const id = query._id;
        const doc = mockHospitals[String(id)];
        if (!doc) return Promise.resolve(null);

        // Check query conditions
        if (query['appConfig.rnBuildStatus']) {
            const expected = query['appConfig.rnBuildStatus'];
            const actual = doc.appConfig?.rnBuildStatus;
            if (typeof expected === 'string' && expected !== actual) {
                return Promise.resolve(null);
            }
            if (expected.$in && !expected.$in.includes(actual)) {
                return Promise.resolve(null);
            }
            if (expected.$nin && expected.$nin.includes(actual)) {
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
        return MockHospitalModel.findOneAndUpdate({ _id: id }, update);
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
const MockReleaseArtifactModel = {
    findOneAndUpdate: () => Promise.resolve({ _id: 'mock_artifact_doc' }),
    create: () => Promise.resolve({ _id: 'mock_artifact_doc' }),
};
require.cache[releaseArtifactModelPath] = {
    id: releaseArtifactModelPath,
    filename: releaseArtifactModelPath,
    loaded: true,
    exports: MockReleaseArtifactModel,
};

// Require artifactStorage util after mocks
const artifactStorage = require('../src/utils/artifactStorage.util');

// Mount SuperAdmin build router
const buildRouter = require('../src/routes/superadmin.build.routes');
const app = express();
app.use(express.json());
app.use('/api/superadmin/hospitals', buildRouter);

let server;
let serverBaseUrl;

function httpRequest(method, reqPath, body = null, headers = {}) {
    return new Promise((resolve, reject) => {
        const url = new URL(reqPath, serverBaseUrl);
        const reqHeaders = { ...headers };
        let payload = null;
        if (body && !headers['content-type']?.includes('multipart/form-data')) {
            payload = typeof body === 'string' ? body : JSON.stringify(body);
            reqHeaders['content-type'] = 'application/json';
            reqHeaders['content-length'] = Buffer.byteLength(payload);
        } else if (body && Buffer.isBuffer(body)) {
            payload = body;
            reqHeaders['content-length'] = body.length;
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

function buildMultipartPayload(fields, files, boundary = '----WebKitFormBoundaryXyZ123') {
    const buffers = [];
    const crlf = Buffer.from('\r\n');

    for (const [key, val] of Object.entries(fields)) {
        buffers.push(Buffer.from(`--${boundary}\r\n`));
        buffers.push(Buffer.from(`Content-Disposition: form-data; name="${key}"\r\n\r\n`));
        buffers.push(Buffer.from(String(val)));
        buffers.push(crlf);
    }

    for (const file of files) {
        buffers.push(Buffer.from(`--${boundary}\r\n`));
        buffers.push(Buffer.from(`Content-Disposition: form-data; name="${file.field}"; filename="${file.filename}"\r\n`));
        buffers.push(Buffer.from(`Content-Type: ${file.contentType}\r\n\r\n`));
        buffers.push(file.content);
        buffers.push(crlf);
    }

    buffers.push(Buffer.from(`--${boundary}--\r\n`));
    return {
        buffer: Buffer.concat(buffers),
        contentType: `multipart/form-data; boundary=${boundary}`
    };
}

(async () => {
    // Start local test HTTP server
    await new Promise((resolve) => {
        server = app.listen(0, '127.0.0.1', () => {
            const port = server.address().port;
            serverBaseUrl = `http://127.0.0.1:${port}`;
            resolve();
        });
    });

    try {
        console.log('================================================================');
        console.log('🧪 RN APK UPLOAD REGRESSION & RESILIENCY VERIFICATION SUITE');
        console.log('================================================================\n');

        // ─────────────────────────────────────────────────────────────────────
        // SUITE 1: Storage Adapter Resolution Under NODE_ENV=test
        // ─────────────────────────────────────────────────────────────────────
        console.log('--- SUITE 1: Storage Adapter Resolution Under NODE_ENV=test ---');

        await test('1.1: ImageKit env vars set + requireRealProvider: true -> selects ImageKitStorageAdapter', async () => {
            artifactStorage.resetStorageAdapter();
            const prevPub = process.env.IMAGEKIT_PUBLIC_KEY;
            const prevPriv = process.env.IMAGEKIT_PRIVATE_KEY;
            const prevUrl = process.env.IMAGEKIT_URL_ENDPOINTS;

            process.env.IMAGEKIT_PUBLIC_KEY = 'public_test_key_123';
            process.env.IMAGEKIT_PRIVATE_KEY = 'private_test_key_456';
            process.env.IMAGEKIT_URL_ENDPOINTS = 'https://ik.imagekit.io/medical365test';

            try {
                const adapter = artifactStorage.resolveStorageAdapter({ requireRealProvider: true });
                assert.strictEqual(adapter.name, 'imagekit', 'Must resolve ImageKit adapter');
                assert.strictEqual(adapter.isMock, undefined, 'ImageKit adapter must not be marked isMock');
            } finally {
                process.env.IMAGEKIT_PUBLIC_KEY = prevPub;
                process.env.IMAGEKIT_PRIVATE_KEY = prevPriv;
                process.env.IMAGEKIT_URL_ENDPOINTS = prevUrl;
            }
        });

        await test('1.2: ImageKit env vars unset + requireRealProvider: true -> throws UNCONFIGURED_STORAGE', async () => {
            artifactStorage.resetStorageAdapter();
            const prevPub = process.env.IMAGEKIT_PUBLIC_KEY;
            const prevPriv = process.env.IMAGEKIT_PRIVATE_KEY;
            const prevUrl = process.env.IMAGEKIT_URL_ENDPOINTS;

            delete process.env.IMAGEKIT_PUBLIC_KEY;
            delete process.env.IMAGEKIT_PRIVATE_KEY;
            delete process.env.IMAGEKIT_URL_ENDPOINTS;

            let threw = false;
            try {
                artifactStorage.resolveStorageAdapter({ requireRealProvider: true });
            } catch (err) {
                threw = true;
                assert.strictEqual(err.code, 'UNCONFIGURED_STORAGE', 'Must throw UNCONFIGURED_STORAGE');
                assert(err.message.includes('No durable cloud storage provider is configured'));
            } finally {
                process.env.IMAGEKIT_PUBLIC_KEY = prevPub;
                process.env.IMAGEKIT_PRIVATE_KEY = prevPriv;
                process.env.IMAGEKIT_URL_ENDPOINTS = prevUrl;
            }
            assert.strictEqual(threw, true, 'Must throw error when unconfigured');
        });

        await test('1.3: requireRealProvider: false -> preserves mock adapter under NODE_ENV=test', async () => {
            artifactStorage.resetStorageAdapter();
            const adapter = artifactStorage.resolveStorageAdapter({ requireRealProvider: false });
            assert.strictEqual(adapter.name, 'mock', 'Default test resolution without requireRealProvider must be mock');
            assert.strictEqual(adapter.isMock, true, 'Must have isMock = true');
        });

        await test('1.4: Explicitly injected mock adapter + requireRealProvider: true -> throws MOCK_STORAGE_PROHIBITED', async () => {
            artifactStorage.setStorageAdapter(new artifactStorage.MockStorageAdapter());
            let threw = false;
            try {
                artifactStorage.resolveStorageAdapter({ requireRealProvider: true });
            } catch (err) {
                threw = true;
                assert.strictEqual(err.code, 'MOCK_STORAGE_PROHIBITED', 'Must throw MOCK_STORAGE_PROHIBITED on injected mock adapter');
                assert(err.message.includes('mock or local storage adapter is prohibited'));
            } finally {
                artifactStorage.resetStorageAdapter();
            }
            assert.strictEqual(threw, true, 'Must throw when mock adapter injected with requireRealProvider: true');
        });

        await test('1.5: Explicitly injected valid real adapter double + requireRealProvider: true -> returns injected adapter', async () => {
            const fakeRealAdapter = {
                name: 'imagekit',
                isMock: false,
                upload: async () => ({ publicUrl: 'https://ik.imagekit.io/medical365/releases/apk.apk' }),
            };
            artifactStorage.setStorageAdapter(fakeRealAdapter);
            try {
                const adapter = artifactStorage.resolveStorageAdapter({ requireRealProvider: true });
                assert.strictEqual(adapter, fakeRealAdapter, 'Must return injected real adapter');
            } finally {
                artifactStorage.resetStorageAdapter();
            }
        });

        // ─────────────────────────────────────────────────────────────────────
        // SUITE 2: Failure Recovery in Upload Webhook (/webhook/github-rn/upload-build)
        // ─────────────────────────────────────────────────────────────────────
        console.log('\n--- SUITE 2: Upload Webhook Failure Recovery & Scoping ---');

        // Valid zip binary buffer with header (0x50 0x4B 0x03 0x04)
        const validZipBuffer = Buffer.from([
            0x50, 0x4B, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00,
            0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00
        ]);

        await test('2.1: On cloud upload failure: BUILDING hospital transitions to FAILED with error', async () => {
            // Setup hospital in BUILDING state
            const tenantId = 'hosp_recovery_building';
            mockHospitals[tenantId] = {
                _id: tenantId,
                name: 'City Care Hospital',
                appConfig: {
                    rnBuildStatus: 'BUILDING',
                    rnBuildId: 'build-building-101',
                    versionCode: 2,
                    versionName: '1.0.1',
                    pendingVersionCode: 3,
                    pendingVersionName: '1.0.2',
                    rnApkUrl: 'https://ik.imagekit.io/medical365/releases/existing-valid.apk',
                    rnAabUrl: 'https://ik.imagekit.io/medical365/releases/existing-valid.aab',
                }
            };

            // Force upload to fail: unset ImageKit env vars so requireRealProvider: true throws UNCONFIGURED_STORAGE
            const prevPub = process.env.IMAGEKIT_PUBLIC_KEY;
            delete process.env.IMAGEKIT_PUBLIC_KEY;
            artifactStorage.resetStorageAdapter();

            try {
                const multipart = buildMultipartPayload(
                    {
                        tenantId,
                        rnBuildId: 'build-building-101',
                        checksumSha256: 'invalid_sha_to_force_failure_500',
                    },
                    [
                        { field: 'apk', filename: 'app-release.apk', contentType: 'application/vnd.android.package-archive', content: validZipBuffer },
                        { field: 'aab', filename: 'app-release.aab', contentType: 'application/octet-stream', content: validZipBuffer }
                    ]
                );

                const res = await httpRequest(
                    'POST',
                    `/api/superadmin/hospitals/webhook/github-rn/upload-build?secret=test-rn-secret-xyz&tenantId=${tenantId}&rnBuildId=build-building-101`,
                    multipart.buffer,
                    { 'content-type': multipart.contentType }
                );

                assert.strictEqual(res.statusCode, 500, 'Must return 500 on upload failure');
                assert.strictEqual(res.body.success, false);

                // Verify DB hospital state
                const updatedDoc = mockHospitals[tenantId];
                assert.strictEqual(updatedDoc.appConfig.rnBuildStatus, 'FAILED', 'Hospital status must transition to FAILED');
                assert(updatedDoc.appConfig.rnBuildError.includes('Artifact replacement failed') || updatedDoc.appConfig.rnBuildError.includes('Artifact storage failed'), 'Must record failure error');
                assert.strictEqual(updatedDoc.appConfig.pendingVersionCode, null, 'Pending version code must be cleared');
                assert.strictEqual(updatedDoc.appConfig.pendingVersionName, null, 'Pending version name must be cleared');
                // Previous valid release URLs MUST NOT be wiped
                assert.strictEqual(updatedDoc.appConfig.rnApkUrl, 'https://ik.imagekit.io/medical365/releases/existing-valid.apk', 'Existing valid APK URL must be preserved');
                assert.strictEqual(updatedDoc.appConfig.rnAabUrl, 'https://ik.imagekit.io/medical365/releases/existing-valid.aab', 'Existing valid AAB URL must be preserved');
            } finally {
                process.env.IMAGEKIT_PUBLIC_KEY = prevPub;
            }
        });

        await test('2.2: rnBuildId is accessible in catch block and does not crash with ReferenceError', async () => {
            const tenantId = 'hosp_scope_check';
            mockHospitals[tenantId] = {
                _id: tenantId,
                name: 'Scope Check Hospital',
                appConfig: {
                    rnBuildStatus: 'PROCESSING',
                    rnBuildId: 'build-scope-202',
                    pendingVersionCode: 5,
                    pendingVersionName: '1.0.5',
                }
            };

            // Inject mock adapter which will be rejected by requireRealProvider: true -> throws MOCK_STORAGE_PROHIBITED
            artifactStorage.setStorageAdapter(new artifactStorage.MockStorageAdapter());

            try {
                const multipart = buildMultipartPayload(
                    {
                        tenantId,
                        rnBuildId: 'build-scope-202',
                        checksumSha256: 'force_scope_catch_block_sha',
                    },
                    [
                        { field: 'apk', filename: 'test.apk', contentType: 'application/vnd.android.package-archive', content: validZipBuffer },
                        { field: 'aab', filename: 'test.aab', contentType: 'application/octet-stream', content: validZipBuffer }
                    ]
                );

                const res = await httpRequest(
                    'POST',
                    `/api/superadmin/hospitals/webhook/github-rn/upload-build?secret=test-rn-secret-xyz&tenantId=${tenantId}&rnBuildId=build-scope-202`,
                    multipart.buffer,
                    { 'content-type': multipart.contentType }
                );

                assert.strictEqual(res.statusCode, 500);

                const updatedDoc = mockHospitals[tenantId];
                // If rnBuildId had a ReferenceError in catch block, status would still be PROCESSING
                assert.strictEqual(updatedDoc.appConfig.rnBuildStatus, 'FAILED', 'Catch block must successfully update status to FAILED');
                assert(updatedDoc.appConfig.rnBuildError.includes('MOCK_STORAGE_PROHIBITED') || updatedDoc.appConfig.rnBuildError.includes('mock or local storage adapter is prohibited') || updatedDoc.appConfig.rnBuildError.includes('Artifact storage failed'));
            } finally {
                artifactStorage.resetStorageAdapter();
            }
        });

        // ─────────────────────────────────────────────────────────────────────
        // SUITE 3: GitHub FAILED Webhook State Transitions (/webhook/github-rn)
        // ─────────────────────────────────────────────────────────────────────
        console.log('\n--- SUITE 3: GitHub FAILED Webhook State Transitions ---');

        await test('3.1: status: FAILED transitions PROCESSING hospital to FAILED', async () => {
            const tenantId = 'hosp_failed_proc';
            mockHospitals[tenantId] = {
                _id: tenantId,
                name: 'Processing Fail Hospital',
                appConfig: {
                    rnBuildStatus: 'PROCESSING',
                    rnBuildId: 'build-proc-303',
                    pendingVersionCode: 4,
                    pendingVersionName: '1.0.4',
                }
            };

            const res = await httpRequest(
                'POST',
                '/api/superadmin/hospitals/webhook/github-rn?secret=test-rn-secret-xyz',
                {
                    tenantId,
                    rnBuildId: 'build-proc-303',
                    status: 'FAILED',
                    error: 'Gradle build failed: out of memory'
                }
            );

            assert.strictEqual(res.statusCode, 200);
            assert.strictEqual(res.body.success, true);

            const updated = mockHospitals[tenantId];
            assert.strictEqual(updated.appConfig.rnBuildStatus, 'FAILED', 'Must transition to FAILED');
            assert.strictEqual(updated.appConfig.rnBuildError, 'Gradle build failed: out of memory');
            assert.strictEqual(updated.appConfig.pendingVersionCode, null);
            assert.strictEqual(updated.appConfig.pendingVersionName, null);
        });

        await test('3.2: status: FAILED transitions BUILDING hospital to FAILED', async () => {
            const tenantId = 'hosp_failed_bld';
            mockHospitals[tenantId] = {
                _id: tenantId,
                name: 'Building Fail Hospital',
                appConfig: {
                    rnBuildStatus: 'BUILDING',
                    rnBuildId: 'build-bld-404',
                    pendingVersionCode: 7,
                    pendingVersionName: '1.0.7',
                }
            };

            const res = await httpRequest(
                'POST',
                '/api/superadmin/hospitals/webhook/github-rn?secret=test-rn-secret-xyz',
                {
                    tenantId,
                    rnBuildId: 'build-bld-404',
                    status: 'FAILED',
                    error: 'Action runner cancelled'
                }
            );

            assert.strictEqual(res.statusCode, 200);
            assert.strictEqual(res.body.success, true);

            const updated = mockHospitals[tenantId];
            assert.strictEqual(updated.appConfig.rnBuildStatus, 'FAILED');
            assert.strictEqual(updated.appConfig.rnBuildError, 'Action runner cancelled');
        });

        await test('3.3: Repeated FAILED callback is idempotent (200 OK without error)', async () => {
            const tenantId = 'hosp_failed_idempotent';
            mockHospitals[tenantId] = {
                _id: tenantId,
                name: 'Already Failed Hospital',
                appConfig: {
                    rnBuildStatus: 'FAILED',
                    rnBuildId: 'build-idem-505',
                    rnBuildError: 'Original failure reason',
                }
            };

            const res = await httpRequest(
                'POST',
                '/api/superadmin/hospitals/webhook/github-rn?secret=test-rn-secret-xyz',
                {
                    tenantId,
                    rnBuildId: 'build-idem-505',
                    status: 'FAILED',
                    error: 'Secondary failure'
                }
            );

            assert.strictEqual(res.statusCode, 200);
            assert.strictEqual(res.body.success, true);
            assert(res.body.message.includes('idempotent'));

            const doc = mockHospitals[tenantId];
            assert.strictEqual(doc.appConfig.rnBuildStatus, 'FAILED');
            assert.strictEqual(doc.appConfig.rnBuildError, 'Original failure reason', 'Must not overwrite original error');
        });

        await test('3.4: Stale or mismatched rnBuildId callback is rejected with 409 conflict', async () => {
            const tenantId = 'hosp_mismatched';
            mockHospitals[tenantId] = {
                _id: tenantId,
                name: 'Mismatched Hospital',
                appConfig: {
                    rnBuildStatus: 'BUILDING',
                    rnBuildId: 'active-build-999',
                }
            };

            const res = await httpRequest(
                'POST',
                '/api/superadmin/hospitals/webhook/github-rn?secret=test-rn-secret-xyz',
                {
                    tenantId,
                    rnBuildId: 'stale-old-build-111',
                    status: 'FAILED',
                    error: 'Old build failure'
                }
            );

            assert.strictEqual(res.statusCode, 409, 'Must reject mismatched build ID with 409');
            assert.strictEqual(res.body.success, false);

            const doc = mockHospitals[tenantId];
            assert.strictEqual(doc.appConfig.rnBuildStatus, 'BUILDING', 'Active status must remain untouched');
            assert.strictEqual(doc.appConfig.rnBuildId, 'active-build-999');
        });

        await test('3.5: Late FAILED callback cannot overwrite COMPLETED build (strictly protected)', async () => {
            const tenantId = 'hosp_protect_completed';
            mockHospitals[tenantId] = {
                _id: tenantId,
                name: 'Completed Hospital',
                appConfig: {
                    rnBuildStatus: 'COMPLETED',
                    rnBuildId: 'build-comp-777',
                    versionCode: 10,
                    versionName: '2.0.0',
                    rnApkUrl: 'https://ik.imagekit.io/medical365/releases/release.apk',
                    rnAabUrl: 'https://ik.imagekit.io/medical365/releases/release.aab',
                }
            };

            const res = await httpRequest(
                'POST',
                '/api/superadmin/hospitals/webhook/github-rn?secret=test-rn-secret-xyz',
                {
                    tenantId,
                    rnBuildId: 'build-comp-777',
                    status: 'FAILED',
                    error: 'Late failure callback from stalled runner'
                }
            );

            assert.strictEqual(res.statusCode, 409, 'Must reject FAILED transition for COMPLETED build');
            assert.strictEqual(res.body.success, false);

            const doc = mockHospitals[tenantId];
            assert.strictEqual(doc.appConfig.rnBuildStatus, 'COMPLETED', 'Build status must remain COMPLETED');
            assert.strictEqual(doc.appConfig.rnApkUrl, 'https://ik.imagekit.io/medical365/releases/release.apk');
            assert.strictEqual(doc.appConfig.versionCode, 10);
        });

        await test('3.6: Legitimate PROCESSING -> COMPLETED transition succeeds and stores artifacts', async () => {
            const tenantId = 'hosp_complete_flow';
            mockHospitals[tenantId] = {
                _id: tenantId,
                name: 'Complete Flow Hospital',
                appConfig: {
                    rnBuildStatus: 'PROCESSING',
                    rnBuildId: 'build-flow-888',
                    pendingVersionCode: 11,
                    pendingVersionName: '2.1.0',
                    rnApkUrl: 'https://ik.imagekit.io/medical365/releases/staged.apk',
                    rnAabUrl: 'https://ik.imagekit.io/medical365/releases/staged.aab',
                }
            };

            const res = await httpRequest(
                'POST',
                '/api/superadmin/hospitals/webhook/github-rn?secret=test-rn-secret-xyz',
                {
                    tenantId,
                    rnBuildId: 'build-flow-888',
                    status: 'COMPLETED',
                    releaseId: 'rel-github-999',
                    checksumSha256: 'a1b2c3d4e5f6'
                }
            );

            assert.strictEqual(res.statusCode, 200);
            assert.strictEqual(res.body.success, true);
            assert.strictEqual(res.body.rnBuildStatus, 'COMPLETED');

            const doc = mockHospitals[tenantId];
            assert.strictEqual(doc.appConfig.rnBuildStatus, 'COMPLETED');
            assert.strictEqual(doc.appConfig.versionCode, 11);
            assert.strictEqual(doc.appConfig.versionName, '2.1.0');
            assert.strictEqual(doc.appConfig.pendingVersionCode, null);
            assert.strictEqual(doc.appConfig.rnApkUrl, 'https://ik.imagekit.io/medical365/releases/staged.apk');
        });

        // ─────────────────────────────────────────────────────────────────────
        // SUITE 4: Backup & Restoration Verification
        // ─────────────────────────────────────────────────────────────────────
        console.log('\n--- SUITE 4: Backup & Restoration On Upload Failure ---');

        await test('4.1: Existing destination APK restored from backup if cloud upload fails', async () => {
            const apkDir = path.join(__dirname, '../public/downloads/apks');
            if (!fs.existsSync(apkDir)) fs.mkdirSync(apkDir, { recursive: true });

            const safeName = 'restorehospital';
            const destApk = path.join(apkDir, `${safeName}-rn-release.apk`);
            const originalContent = 'ORIGINAL_PREVIOUS_RELEASE_APK_CONTENT';
            fs.writeFileSync(destApk, originalContent);

            const tenantId = 'hosp_backup_restore';
            mockHospitals[tenantId] = {
                _id: tenantId,
                name: 'Restore Hospital',
                appConfig: {
                    rnBuildStatus: 'PROCESSING',
                    rnBuildId: 'build-backup-909',
                }
            };

            // Force failure by unsetting ImageKit
            const prevPub = process.env.IMAGEKIT_PUBLIC_KEY;
            delete process.env.IMAGEKIT_PUBLIC_KEY;
            artifactStorage.resetStorageAdapter();

            try {
                const multipart = buildMultipartPayload(
                    {
                        tenantId,
                        rnBuildId: 'build-backup-909',
                    },
                    [
                        { field: 'apk', filename: 'new.apk', contentType: 'application/vnd.android.package-archive', content: validZipBuffer },
                        { field: 'aab', filename: 'new.aab', contentType: 'application/octet-stream', content: validZipBuffer }
                    ]
                );

                await httpRequest(
                    'POST',
                    `/api/superadmin/hospitals/webhook/github-rn/upload-build?secret=test-rn-secret-xyz&tenantId=${tenantId}&rnBuildId=build-backup-909`,
                    multipart.buffer,
                    { 'content-type': multipart.contentType }
                );

                // Dest APK must be restored to original content
                assert(fs.existsSync(destApk), 'Destination APK must exist');
                const restoredContent = fs.readFileSync(destApk, 'utf8');
                assert.strictEqual(restoredContent, originalContent, 'Previous APK must be restored from backup');
            } finally {
                process.env.IMAGEKIT_PUBLIC_KEY = prevPub;
                if (fs.existsSync(destApk)) fs.unlinkSync(destApk);
            }
        });

        // ─────────────────────────────────────────────────────────────────────
        // Summary
        // ─────────────────────────────────────────────────────────────────────
        console.log('\n================================================================');
        console.log(`📊 TEST EXECUTION SUMMARY: ${passedCount}/${passedCount + failedCount} PASSED (${failedCount} FAILED)`);
        console.log('================================================================\n');

        if (failedCount > 0) {
            process.exit(1);
        }
    } finally {
        if (server) {
            server.close();
        }
    }
})();
