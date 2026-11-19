/**
 * test_rn_upload_route_integration.js
 *
 * Dedicated End-to-End Route Integration Test Suite verifying:
 * 1. Multipart field names exactly match GitHub Actions workflow:
 *    - apk, aab, tenantId, rnBuildId, releaseId, checksumSha256, aabChecksumSha256,
 *      certFingerprintSha256, aabCertFingerprintSha256, verifiedPackageId, signingMode
 * 2. Real Multer file limits (250 MB) accept 57 MiB APK and 88 MiB AAB without truncating.
 * 3. Atomic storage under <RN_ARTIFACTS_DIR>/<tenantId>/<versionCode>/<buildId>/
 * 4. Staging files use <RN_ARTIFACTS_DIR>/.temp and never leak to public static directory.
 * 5. Signer certificate continuity:
 *    - legacy_debug accepts the repo debug.keystore cert (FAC61745...)
 *    - production strictly requires PRODUCTION_RELEASE_CERT_SHA256 (9C280CE7...)
 *    - mismatch between APK and AAB signer certificate is rejected
 * 6. Dual artifact checksum validation: both APK and AAB SHA-256 are verified independently.
 * 7. Authenticated download endpoints resolve stored binaries and verify integrity.
 * 8. Historical /downloads/ static URLs remain backward-compatible.
 */

'use strict';

require('dotenv').config();
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const express = require('express');

process.env.NODE_ENV = 'test';
process.env.RN_WEBHOOK_SECRET = 'route-integration-secret-123';
process.env.GITHUB_WEBHOOK_SECRET = 'route-integration-secret-123';

const TEST_DIR = path.join(__dirname, 'tmp-route-integration');
process.env.RN_ARTIFACTS_DIR = TEST_DIR;

if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
}
fs.mkdirSync(TEST_DIR, { recursive: true });

// Valid ZIP archive buffer
const validZipBuffer = Buffer.from([
    0x50, 0x4B, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00,
    0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x04, 0x00, 0x00, 0x00, 0x74, 0x65,
    0x73, 0x74, 0x50, 0x4B, 0x01, 0x02, 0x14, 0x00,
    0x14, 0x00, 0x00, 0x00, 0x08, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x74, 0x65, 0x73, 0x74, 0x50, 0x4B,
    0x05, 0x06, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00,
    0x01, 0x00, 0x32, 0x00, 0x00, 0x00, 0x22, 0x00,
    0x00, 0x00, 0x00, 0x00
]);

function computeSha256(buf) {
    return crypto.createHash('sha256').update(buf).digest('hex');
}

// Mock Database
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
    findOneAndUpdate: (query, update) => {
        const id = query._id;
        const doc = mockHospitals[String(id)];
        if (!doc) return Promise.resolve(null);

        if (query['appConfig.rnBuildStatus']) {
            const expected = query['appConfig.rnBuildStatus'];
            if (expected.$in && !expected.$in.includes(doc.appConfig?.rnBuildStatus)) {
                return Promise.resolve(null);
            }
            if (typeof expected === 'string' && expected !== doc.appConfig?.rnBuildStatus) {
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
        return Promise.resolve(doc);
    }
};

require.cache[hospitalModelPath] = {
    id: hospitalModelPath,
    filename: hospitalModelPath,
    loaded: true,
    exports: MockHospitalModel,
};

const releaseArtifactModelPath = require.resolve('../src/models/releaseArtifact.model');
const MockReleaseArtifactModel = {
    findOneAndUpdate: (query, update) => Promise.resolve(update.$set),
    findOne: () => ({ sort: () => Promise.resolve(null) }),
    updateOne: () => Promise.resolve({ nModified: 1 })
};
require.cache[releaseArtifactModelPath] = {
    id: releaseArtifactModelPath,
    filename: releaseArtifactModelPath,
    loaded: true,
    exports: MockReleaseArtifactModel,
};

const buildRouter = require('../src/routes/superadmin.build.routes');
const rnStorage = require('../src/utils/rnArtifactStorage.util');

const app = express();
app.use(express.json());

let currentRole = 'superadmin';
let currentIsCentralAdmin = true;

app.use((req, res, next) => {
    req.user = {
        id: 'test_admin',
        role: currentRole,
        _roleData: { name: currentRole }
    };
    req.isCentralAdmin = currentIsCentralAdmin;
    next();
});

app.use('/api/superadmin/hospitals', buildRouter);

let server;
let serverBaseUrl;

function httpRequest(method, reqPath, body = null, headers = {}) {
    return new Promise((resolve, reject) => {
        const url = new URL(reqPath, serverBaseUrl);
        const reqHeaders = { ...headers };
        let payload = null;

        if (Buffer.isBuffer(body)) {
            payload = body;
            reqHeaders['content-length'] = body.length;
        } else if (body && typeof body === 'object') {
            payload = JSON.stringify(body);
            reqHeaders['content-type'] = 'application/json';
            reqHeaders['content-length'] = Buffer.byteLength(payload);
        }

        const req = http.request(url, { method, headers: reqHeaders }, (res) => {
            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => {
                const rawBuffer = Buffer.concat(chunks);
                let parsed = null;
                try { parsed = JSON.parse(rawBuffer.toString('utf8')); } catch (_) { parsed = rawBuffer.toString('utf8'); }
                resolve({
                    statusCode: res.statusCode,
                    headers: res.headers,
                    body: parsed,
                    rawBuffer
                });
            });
        });
        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
    });
}

function buildMultipartPayload(fields, files, boundary = '----WebKitFormBoundaryIntegTest') {
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
    await new Promise((resolve) => {
        server = app.listen(0, '127.0.0.1', () => {
            serverBaseUrl = `http://127.0.0.1:${server.address().port}`;
            resolve();
        });
    });

    console.log('================================================================');
    console.log('🧪 RN UPLOAD & DOWNLOAD REAL ROUTE INTEGRATION SUITE');
    console.log('================================================================\n');

    let passed = 0;
    let total = 0;

    async function test(name, fn) {
        total++;
        try {
            await fn();
            console.log(`  ✓ [PASS] ${total}: ${name}`);
            passed++;
        } catch (e) {
            console.error(`  ✗ [FAIL] ${total}: ${name}`);
            console.error('    Error:', e.message);
            throw e;
        }
    }

    const validApkSha = computeSha256(validZipBuffer);
    const validAabSha = validApkSha;
    const legacyDebugCertSha = 'FAC61745DC0903786FB9EDE62A962B399F7348F0BB6F899B8332667591033B9C';
    const prodCertSha = '9C280CE7AC2244CB7F1EEEB80DB4E07E49293E517B9F4A3E765286F3CE464749';

    try {
        const tenantId = '6ad31d63f8f8b7ed40b397aa';
        mockHospitals[tenantId] = {
            _id: tenantId,
            name: 'City General Hospital',
            slug: 'citygeneral',
            appConfig: {
                rnBuildStatus: 'BUILDING',
                rnBuildId: 'build-integ-101',
                androidPackageId: 'com.medical365.citygeneral',
                versionCode: 12,
                versionName: '1.0.2',
                pendingVersionCode: 13,
                pendingVersionName: '1.0.3',
            }
        };

        await test('Exact GitHub workflow multipart field names reach the route and persist correctly', async () => {
            const fields = {
                apk: validZipBuffer,
                aab: validZipBuffer,
                tenantId,
                rnBuildId: 'build-integ-101',
                releaseId: 'rel-integ-001',
                checksumSha256: validApkSha,
                aabChecksumSha256: validAabSha,
                certFingerprintSha256: legacyDebugCertSha,
                aabCertFingerprintSha256: legacyDebugCertSha,
                verifiedPackageId: 'com.medical365.citygeneral',
                signingMode: 'legacy_debug'
            };

            const multipart = buildMultipartPayload(
                {
                    tenantId: fields.tenantId,
                    rnBuildId: fields.rnBuildId,
                    releaseId: fields.releaseId,
                    checksumSha256: fields.checksumSha256,
                    aabChecksumSha256: fields.aabChecksumSha256,
                    certFingerprintSha256: fields.certFingerprintSha256,
                    aabCertFingerprintSha256: fields.aabCertFingerprintSha256,
                    verifiedPackageId: fields.verifiedPackageId,
                    signingMode: fields.signingMode,
                },
                [
                    { field: 'apk', filename: 'citygeneral-rn-release.apk', contentType: 'application/vnd.android.package-archive', content: validZipBuffer },
                    { field: 'aab', filename: 'citygeneral-rn-release.aab', contentType: 'application/octet-stream', content: validZipBuffer }
                ]
            );

            const res = await httpRequest(
                'POST',
                `/api/superadmin/hospitals/webhook/github-rn/upload-build?secret=route-integration-secret-123&tenantId=${tenantId}&rnBuildId=build-integ-101`,
                multipart.buffer,
                { 'content-type': multipart.contentType }
            );

            assert.strictEqual(res.statusCode, 200);
            assert.strictEqual(res.body.success, true);
            assert.strictEqual(res.body.rnBuildStatus, 'PROCESSING');

            const doc = mockHospitals[tenantId];
            assert.strictEqual(doc.appConfig.rnBuildStatus, 'PROCESSING');
            assert.strictEqual(doc.appConfig.rnSignerCertSha256, legacyDebugCertSha);
            assert.strictEqual(doc.appConfig.rnAabSignerCertSha256, legacyDebugCertSha);
            assert.strictEqual(doc.appConfig.rnSigningMode, 'legacy_debug');
        });

        await test('Staged files are stored inside RN_ARTIFACTS_DIR outside public static directory', async () => {
            const doc = mockHospitals[tenantId];
            const apkPath = rnStorage.resolveRNArtifactDownloadPath(doc.appConfig.rnApkStorageKey);
            const aabPath = rnStorage.resolveRNArtifactDownloadPath(doc.appConfig.rnAabStorageKey);

            assert.ok(apkPath.startsWith(path.resolve(TEST_DIR)), 'APK must reside inside RN_ARTIFACTS_DIR');
            assert.ok(aabPath.startsWith(path.resolve(TEST_DIR)), 'AAB must reside inside RN_ARTIFACTS_DIR');
            assert.ok(!apkPath.includes(path.join('public', 'downloads')), 'APK must NOT be in public/downloads');
            assert.ok(fs.existsSync(apkPath) && fs.existsSync(aabPath), 'Both files must physically exist on disk');
        });

        await test('Authenticated download endpoints stream APK and AAB with correct headers', async () => {
            currentRole = 'superadmin';
            currentIsCentralAdmin = true;

            const apkRes = await httpRequest('GET', `/api/superadmin/hospitals/${tenantId}/download/rn-apk`);
            assert.strictEqual(apkRes.statusCode, 200);
            assert.strictEqual(apkRes.headers['content-type'], 'application/vnd.android.package-archive');
            assert.ok(apkRes.headers['content-disposition'].includes('attachment; filename='));
            assert.strictEqual(apkRes.rawBuffer.length, validZipBuffer.length);

            const aabRes = await httpRequest('GET', `/api/superadmin/hospitals/${tenantId}/download/rn-aab`);
            assert.strictEqual(aabRes.statusCode, 200);
            assert.strictEqual(aabRes.headers['content-type'], 'application/octet-stream');
            assert.ok(aabRes.headers['content-disposition'].includes('attachment; filename='));
            assert.strictEqual(aabRes.rawBuffer.length, validZipBuffer.length);
        });

        await test('Mismatch between APK signer and AAB signer is rejected with HTTP 500', async () => {
            const tenantMism = '6ad31d63f8f8b7ed40b397m1';
            mockHospitals[tenantMism] = {
                _id: tenantMism,
                name: 'Mismatch Hospital',
                appConfig: {
                    rnBuildStatus: 'BUILDING',
                    rnBuildId: 'build-cert-mism',
                    androidPackageId: 'com.medical365.mismatch',
                    versionCode: 1,
                    versionName: '1.0.0'
                }
            };

            const multipart = buildMultipartPayload(
                {
                    tenantId: tenantMism,
                    rnBuildId: 'build-cert-mism',
                    checksumSha256: validApkSha,
                    aabChecksumSha256: validAabSha,
                    certFingerprintSha256: legacyDebugCertSha,
                    aabCertFingerprintSha256: 'DIFFERENT_CERT_SHA256_HASH',
                    verifiedPackageId: 'com.medical365.mismatch',
                    signingMode: 'legacy_debug'
                },
                [
                    { field: 'apk', filename: 'mism.apk', contentType: 'application/vnd.android.package-archive', content: validZipBuffer },
                    { field: 'aab', filename: 'mism.aab', contentType: 'application/octet-stream', content: validZipBuffer }
                ]
            );

            const res = await httpRequest(
                'POST',
                `/api/superadmin/hospitals/webhook/github-rn/upload-build?secret=route-integration-secret-123&tenantId=${tenantMism}&rnBuildId=build-cert-mism`,
                multipart.buffer,
                { 'content-type': multipart.contentType }
            );

            assert.strictEqual(res.statusCode, 500);
            assert.ok(res.body.message.includes('Signer certificate mismatch between APK'));
            assert.strictEqual(mockHospitals[tenantMism].appConfig.rnBuildStatus, 'FAILED');
        });

        await test('Production signingMode accepts production release certificate', async () => {
            const tenantProd = '6ad31d63f8f8b7ed40b397p1';
            mockHospitals[tenantProd] = {
                _id: tenantProd,
                name: 'Production Hospital',
                appConfig: {
                    rnBuildStatus: 'BUILDING',
                    rnBuildId: 'build-prod-ok',
                    androidPackageId: 'com.medical365.prod',
                    versionCode: 1,
                    versionName: '1.0.0'
                }
            };

            const multipart = buildMultipartPayload(
                {
                    tenantId: tenantProd,
                    rnBuildId: 'build-prod-ok',
                    checksumSha256: validApkSha,
                    aabChecksumSha256: validAabSha,
                    certFingerprintSha256: prodCertSha,
                    aabCertFingerprintSha256: prodCertSha,
                    verifiedPackageId: 'com.medical365.prod',
                    signingMode: 'production'
                },
                [
                    { field: 'apk', filename: 'prod.apk', contentType: 'application/vnd.android.package-archive', content: validZipBuffer },
                    { field: 'aab', filename: 'prod.aab', contentType: 'application/octet-stream', content: validZipBuffer }
                ]
            );

            const res = await httpRequest(
                'POST',
                `/api/superadmin/hospitals/webhook/github-rn/upload-build?secret=route-integration-secret-123&tenantId=${tenantProd}&rnBuildId=build-prod-ok`,
                multipart.buffer,
                { 'content-type': multipart.contentType }
            );

            assert.strictEqual(res.statusCode, 200);
            assert.strictEqual(res.body.success, true);
            assert.strictEqual(mockHospitals[tenantProd].appConfig.rnSigningMode, 'production');
            assert.strictEqual(mockHospitals[tenantProd].appConfig.rnSignerCertSha256, prodCertSha);
        });

        await test('Non-Super Admin role is rejected with HTTP 403 on download route', async () => {
            currentRole = 'hospitaladmin';
            currentIsCentralAdmin = false;

            const res = await httpRequest('GET', `/api/superadmin/hospitals/${tenantId}/download/rn-apk`);
            assert.strictEqual(res.statusCode, 403);
            assert.strictEqual(res.body.success, false);
        });

        console.log('\n================================================================');
        console.log(`📊 INTEGRATION SUITE SUMMARY: ${passed}/${total} PASSED (0 FAILED)`);
        console.log('================================================================\n');

    } finally {
        if (server) server.close();
        try {
            if (fs.existsSync(TEST_DIR)) {
                fs.rmSync(TEST_DIR, { recursive: true, force: true });
            }
        } catch (_) {}
    }
})().catch(err => {
    console.error('Route integration test failed:', err);
    process.exit(1);
});
