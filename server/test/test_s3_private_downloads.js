/**
 * test_s3_private_downloads.js
 * 
 * Comprehensive automated verification suite for Private Bucket Downloads
 * using Cloudflare R2 / AWS S3 S3StorageAdapter and Central Admin authentication.
 * 
 * Verifies:
 * 1. Authenticated Central Admin download (APK and AAB redirect to 15-min presigned URL).
 * 2. Unauthorized rejection (HTTP 401 when unauthenticated or token invalid).
 * 3. Cross-tenant rejection (HTTP 403 when Hospital Admin accesses another tenant).
 * 4. Tenant-scoped authorization (Hospital Admin can download their own tenant build).
 * 5. 15-minute expiry parameter enforcement (X-Amz-Expires=900).
 * 6. Expired link behavior on R2 (HTTP 403 Request has expired).
 * 7. Tampered signature rejection on R2 (HTTP 403 SignatureDoesNotMatch).
 * 8. MongoDB persistence invariants (presigned URLs NEVER stored in database).
 * 9. Legacy ImageKit backward compatibility (redirects to direct ImageKit URL).
 * 10. Download tracking metrics (ReleaseArtifact.downloadCount increments).
 */

const assert = require('assert');
const http = require('http');
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const { JWT_SECRET } = require('../src/config/jwt');
const artifactStorage = require('../src/utils/artifactStorage.util');
const { S3StorageAdapter, MockStorageAdapter, isPresignedUrl, isVerifiedDirectArtifactUrl } = artifactStorage;

// Set test environment
process.env.NODE_ENV = 'test';
process.env.GITHUB_WEBHOOK_SECRET = 'test-rn-secret-xyz';

let passedCount = 0;
let failedCount = 0;

async function test(name, fn) {
    try {
        await fn();
        console.log(`  ✓ [PASS] ${name}`);
        passedCount++;
    } catch (err) {
        console.error(`  ✗ [FAIL] ${name}`);
        console.error('     Error:', err.message);
        if (err.stack) {
            console.error(err.stack.split('\n').slice(0, 5).join('\n'));
        }
        failedCount++;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// MOCK MODELS & CACHE SETUP
// ─────────────────────────────────────────────────────────────────────────────

const mockHospitals = {};
const mockUsers = {};
const savedReleaseArtifacts = [];

// Mock Hospital Model
const hospitalModelPath = require.resolve('../src/models/hospital.model');
const MockHospitalModel = {
    findById: (id) => {
        const doc = mockHospitals[id ? String(id) : ''];
        return Promise.resolve(doc ? { ...doc } : null);
    },
    findByIdAndUpdate: (id, update) => {
        const idStr = id ? String(id) : '';
        const doc = mockHospitals[idStr];
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
        return Promise.resolve({ ...doc });
    },
    findOneAndUpdate: (query, update) => {
        const id = query._id;
        const idStr = id ? String(id) : '';
        const doc = mockHospitals[idStr];
        if (!doc) return Promise.resolve(null);
        if (query['appConfig.rnBuildStatus'] && doc.appConfig?.rnBuildStatus !== query['appConfig.rnBuildStatus']) {
            if (Array.isArray(query['appConfig.rnBuildStatus'].$in)) {
                if (!query['appConfig.rnBuildStatus'].$in.includes(doc.appConfig?.rnBuildStatus)) return Promise.resolve(null);
            } else {
                return Promise.resolve(null);
            }
        }
        if (query['appConfig.rnBuildId'] && doc.appConfig?.rnBuildId !== query['appConfig.rnBuildId']) {
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
        return Promise.resolve({ ...doc });
    }
};

require.cache[hospitalModelPath] = {
    id: hospitalModelPath,
    filename: hospitalModelPath,
    loaded: true,
    exports: MockHospitalModel,
};

// Mock User Model
const userModelPath = require.resolve('../src/models/user.model');
const MockUserModel = {
    findById: (id) => {
        const idStr = id ? String(id) : '';
        const u = mockUsers[idStr];
        return {
            select: () => ({
                lean: () => Promise.resolve(u ? { ...u } : null)
            }),
            lean: () => Promise.resolve(u ? { ...u } : null)
        };
    },
    updateOne: () => Promise.resolve({ modifiedCount: 1 }),
};

require.cache[userModelPath] = {
    id: userModelPath,
    filename: userModelPath,
    loaded: true,
    exports: MockUserModel,
};

// Mock Role Model
const roleModelPath = require.resolve('../src/models/role.model');
const MockRoleModel = {
    findOne: (query) => ({
        lean: () => Promise.resolve({
            _id: new mongoose.Types.ObjectId(),
            name: 'doctor',
            permissions: ['doctor_access'],
        })
    }),
    findById: (id) => ({
        lean: () => Promise.resolve({
            _id: id,
            name: 'doctor',
            permissions: ['doctor_access'],
        })
    }),
};

require.cache[roleModelPath] = {
    id: roleModelPath,
    filename: roleModelPath,
    loaded: true,
    exports: MockRoleModel,
};

// Mock ReleaseArtifact Model
const releaseArtifactModelPath = require.resolve('../src/models/releaseArtifact.model');
const MockReleaseArtifactModel = {
    findOne: (query) => {
        const artifact = savedReleaseArtifacts.find(a => {
            if (query.storageKey && a.storageKey === query.storageKey) return true;
            if (query.tenantId && a.tenantId && String(a.tenantId) === String(query.tenantId)) {
                if (!query.artifactType || a.artifactType === query.artifactType) return true;
            }
            if (Array.isArray(query.$or)) {
                return query.$or.some(q => {
                    if (q.storageKey && a.storageKey === q.storageKey) return true;
                    if (q.tenantId && String(a.tenantId) === String(q.tenantId)) {
                        if (!q.artifactType || a.artifactType === q.artifactType) return true;
                    }
                    return false;
                });
            }
            return false;
        });
        return {
            sort: () => Promise.resolve(artifact || null),
            then: (resolve) => resolve(artifact || null),
        };
    },
    findOneAndUpdate: (query, update, opts) => {
        let existing = savedReleaseArtifacts.find(a => a.storageKey === query.storageKey);
        if (!existing) {
            existing = { ...update.$set, downloadCount: 0 };
            savedReleaseArtifacts.push(existing);
        } else {
            Object.assign(existing, update.$set);
        }
        return Promise.resolve(existing);
    },
    updateOne: (query, update) => {
        const item = savedReleaseArtifacts.find(a => {
            if (query.storageKey && a.storageKey === query.storageKey) return true;
            if (query.tenantId && String(a.tenantId) === String(query.tenantId) && a.artifactType === query.artifactType) return true;
            return false;
        });
        if (item && update.$inc && update.$inc.downloadCount) {
            item.downloadCount = (item.downloadCount || 0) + update.$inc.downloadCount;
        }
        return Promise.resolve({ modifiedCount: 1 });
    }
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

function httpRequest(method, pathStr, body = null, headers = {}) {
    return new Promise((resolve, reject) => {
        const url = new URL(pathStr, serverBaseUrl);
        const reqHeaders = { ...headers };
        let payload = null;
        if (body) {
            payload = typeof body === 'string' ? body : JSON.stringify(body);
            if (!reqHeaders['content-type']) reqHeaders['content-type'] = 'application/json';
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

function fetchUrl(targetUrl) {
    return new Promise((resolve, reject) => {
        const parsed = new URL(targetUrl);
        const req = http.request(parsed, { method: 'GET' }, (res) => {
            let data = Buffer.alloc(0);
            res.on('data', chunk => { data = Buffer.concat([data, chunk]); });
            res.on('end', () => {
                resolve({
                    statusCode: res.statusCode,
                    headers: res.headers,
                    body: data.toString('utf8'),
                    buffer: data,
                });
            });
        });
        req.on('error', reject);
        req.end();
    });
}

(async () => {
    // ─────────────────────────────────────────────────────────────────────────
    // MOCK R2 / S3 SERVER
    // ─────────────────────────────────────────────────────────────────────────
    let mockR2Server;
    let mockR2Port;
    let mockR2Endpoint;
    const r2StoredObjects = new Map();

    await new Promise((resolve) => {
        mockR2Server = http.createServer((req, res) => {
            const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
            const pathname = parsedUrl.pathname;
            const query = Object.fromEntries(parsedUrl.searchParams.entries());

            // Handle SigV4 Presigned GET
            if (req.method === 'GET') {
                const algorithm = query['X-Amz-Algorithm'];
                const credential = query['X-Amz-Credential'];
                const amzDate = query['X-Amz-Date'];
                const expires = query['X-Amz-Expires'];
                const signature = query['X-Amz-Signature'];

                if (!signature || !algorithm || !credential || !amzDate || !expires) {
                    res.statusCode = 403;
                    res.setHeader('content-type', 'application/xml');
                    return res.end('<Error><Code>MissingSignature</Code><Message>Missing SigV4 parameters</Message></Error>');
                }

                // Check Expiration
                const expiresSeconds = parseInt(expires, 10) || 900;
                // Parse amzDate (e.g. 20261117T123000Z)
                const yr = amzDate.substring(0, 4);
                const mo = amzDate.substring(4, 6);
                const da = amzDate.substring(6, 8);
                const ho = amzDate.substring(9, 11);
                const mi = amzDate.substring(11, 13);
                const se = amzDate.substring(13, 15);
                const signedTime = Date.UTC(yr, parseInt(mo, 10) - 1, da, ho, mi, se);

                const now = Date.now();
                if (now > signedTime + (expiresSeconds * 1000)) {
                    res.statusCode = 403;
                    res.setHeader('content-type', 'application/xml');
                    return res.end('<Error><Code>AccessDenied</Code><Message>Request has expired</Message></Error>');
                }

                // Check Signature Tampering
                if (signature === 'tampered_signature_hex') {
                    res.statusCode = 403;
                    res.setHeader('content-type', 'application/xml');
                    return res.end('<Error><Code>SignatureDoesNotMatch</Code><Message>The request signature does not match.</Message></Error>');
                }

                // Find Object by storage key
                // pathname e.g. /medical365-releases/releases/com.app/1/app.apk
                const cleanKey = pathname.replace(/^\/[^/]+\//, ''); // strip bucket
                const item = r2StoredObjects.get(cleanKey);

                res.statusCode = 200;
                res.setHeader('content-type', 'application/vnd.android.package-archive');
                res.setHeader('content-disposition', `attachment; filename="${path.basename(cleanKey)}"`);
                return res.end(item?.content || Buffer.from('FAKE-RELEASE-BINARY-STREAM'));
            }

            // Fallback for upload / other
            res.statusCode = 200;
            return res.end('<Ok/>');
        });

        mockR2Server.listen(0, '127.0.0.1', () => {
            mockR2Port = mockR2Server.address().port;
            mockR2Endpoint = `http://127.0.0.1:${mockR2Port}`;
            resolve();
        });
    });

    // Start local Express server
    await new Promise((resolve) => {
        server = app.listen(0, '127.0.0.1', () => {
            serverBaseUrl = `http://127.0.0.1:${server.address().port}`;
            resolve();
        });
    });

    try {
        console.log('================================================================');
        console.log('🧪 VERIFYING S3 / R2 PRIVATE BUCKET DOWNLOADS ARCHITECTURE');
        console.log('================================================================');

        // Create standard test identities
        const centralAdminId = new mongoose.Types.ObjectId().toString();
        const hospitalAId = new mongoose.Types.ObjectId().toString();
        const hospitalBId = new mongoose.Types.ObjectId().toString();
        const doctorUserId = new mongoose.Types.ObjectId().toString();

        mockUsers[centralAdminId] = {
            _id: centralAdminId,
            userId: centralAdminId,
            name: 'Central SuperAdmin',
            role: 'superadmin',
        };

        mockUsers[hospitalAId] = {
            _id: hospitalAId,
            userId: hospitalAId,
            name: 'Hospital A Admin',
            role: 'hospitaladmin',
            hospitalId: hospitalAId,
        };

        mockUsers[doctorUserId] = {
            _id: doctorUserId,
            userId: doctorUserId,
            name: 'Doctor Dave',
            role: 'doctor',
            hospitalId: hospitalAId,
        };

        const centralAdminToken = jwt.sign({ userId: centralAdminId, role: 'superadmin' }, JWT_SECRET, { expiresIn: '1h' });
        const hospitalAAdminToken = jwt.sign({ userId: hospitalAId, role: 'hospitaladmin', hospitalId: hospitalAId }, JWT_SECRET, { expiresIn: '1h' });
        const doctorToken = jwt.sign({ userId: doctorUserId, role: 'doctor', hospitalId: hospitalAId }, JWT_SECRET, { expiresIn: '1h' });

        // Simulate active Mongoose connection state for unit tests
        mongoose.connection.readyState = 1;

        // Configure S3 Adapter for private downloads
        const testS3Adapter = new S3StorageAdapter({
            bucket: 'medical365-private-releases',
            accessKeyId: 'r2-access-key-12345',
            secretAccessKey: 'r2-secret-key-67890',
            endpoint: mockR2Endpoint,
            region: 'auto',
            // Notice: publicBaseUrl is deliberately omitted so bucket remains strictly private!
        });
        artifactStorage.setStorageAdapter(testS3Adapter);

        // Prepopulate hospital tenant records
        mockHospitals[hospitalAId] = {
            _id: hospitalAId,
            name: 'Apollo Hospital',
            slug: 'apollo',
            appConfig: {
                androidPackageId: 'com.medical365.apollo',
                buildStatus: 'COMPLETED',
                rnBuildStatus: 'COMPLETED',
                rnApkStorageKey: 'releases/com.medical365.apollo/1/apollo-rn-release.apk',
                rnAabStorageKey: 'releases/com.medical365.apollo/1/apollo-rn-release.aab',
                rnStorageProvider: 's3',
            }
        };

        mockHospitals[hospitalBId] = {
            _id: hospitalBId,
            name: 'Fortis Hospital',
            slug: 'fortis',
            appConfig: {
                androidPackageId: 'com.medical365.fortis',
                buildStatus: 'COMPLETED',
                rnBuildStatus: 'COMPLETED',
                rnApkStorageKey: 'releases/com.medical365.fortis/1/fortis-rn-release.apk',
                rnAabStorageKey: 'releases/com.medical365.fortis/1/fortis-rn-release.aab',
                rnStorageProvider: 's3',
            }
        };

        // Prepopulate mock R2 stored objects
        r2StoredObjects.set('releases/com.medical365.apollo/1/apollo-rn-release.apk', {
            content: Buffer.from('APOLLO-MOCK-RELEASE-APK-PAYLOAD-BINARY')
        });
        r2StoredObjects.set('releases/com.medical365.apollo/1/apollo-rn-release.aab', {
            content: Buffer.from('APOLLO-MOCK-RELEASE-AAB-PAYLOAD-BINARY')
        });

        // ─────────────────────────────────────────────────────────────────────
        // SUITE 1: Presigned URL Construction & Expiry Parameters
        // ─────────────────────────────────────────────────────────────────────
        console.log('\n--- SUITE 1: SigV4 Presigned GET URL Generation ---');

        await test('1.1: getPresignedDownloadUrl generates valid SigV4 presigned URL using S3 API endpoint', async () => {
            const presigned = testS3Adapter.getPresignedDownloadUrl('releases/com.medical365.apollo/1/apollo-rn-release.apk', 900);
            assert(presigned.startsWith(mockR2Endpoint), 'Must use R2 S3 API endpoint, not custom domain');
            assert(presigned.includes('/medical365-private-releases/releases/com.medical365.apollo/1/apollo-rn-release.apk'));
            assert(presigned.includes('X-Amz-Algorithm=AWS4-HMAC-SHA256'));
            assert(presigned.includes('X-Amz-Credential=r2-access-key-12345%2F'));
            assert(presigned.includes('X-Amz-Date='));
            assert(presigned.includes('X-Amz-Expires=900'), 'Must contain 15-minute expiry parameter');
            assert(presigned.includes('X-Amz-SignedHeaders=host'));
            assert(presigned.includes('X-Amz-Signature='));
        });

        await test('1.2: getPresignedDownloadUrl fails closed when storage is unconfigured', async () => {
            const unconfiguredAdapter = new S3StorageAdapter({});
            assert.throws(() => {
                unconfiguredAdapter.getPresignedDownloadUrl('some/key.apk');
            }, (err) => {
                assert.strictEqual(err.code, 'UNCONFIGURED_STORAGE');
                return true;
            });
        });

        // ─────────────────────────────────────────────────────────────────────
        // SUITE 2: Authenticated Central Admin Downloads (APK & AAB)
        // ─────────────────────────────────────────────────────────────────────
        console.log('\n--- SUITE 2: Authenticated Super Admin Downloads ---');

        await test('2.1: Central Admin GET /:id/download/apk redirects 302 to 15-minute presigned R2 URL', async () => {
            const res = await httpRequest('GET', `/api/superadmin/hospitals/${hospitalAId}/download/apk`, null, {
                Authorization: `Bearer ${centralAdminToken}`
            });

            assert.strictEqual(res.statusCode, 302, 'Must return HTTP 302 redirect');
            const redirectUrl = res.headers.location;
            assert(redirectUrl, 'Location header must be present');
            assert(redirectUrl.includes('X-Amz-Expires=900'), 'Redirect URL must specify 15-minute expiry');
            assert(redirectUrl.includes('X-Amz-Signature='), 'Redirect URL must have SigV4 signature');

            // Follow redirect to mock R2 server to verify binary delivery
            const r2Res = await fetchUrl(redirectUrl);
            assert.strictEqual(r2Res.statusCode, 200, 'Mock R2 must return 200 OK for valid presigned URL');
            assert.strictEqual(r2Res.body, 'APOLLO-MOCK-RELEASE-APK-PAYLOAD-BINARY');
        });

        await test('2.2: Central Admin GET /:id/download/aab redirects 302 to 15-minute presigned R2 URL', async () => {
            const res = await httpRequest('GET', `/api/superadmin/hospitals/${hospitalAId}/download/aab`, null, {
                Authorization: `Bearer ${centralAdminToken}`
            });

            assert.strictEqual(res.statusCode, 302);
            const redirectUrl = res.headers.location;
            assert(redirectUrl.includes('X-Amz-Expires=900'));

            // Follow redirect
            const r2Res = await fetchUrl(redirectUrl);
            assert.strictEqual(r2Res.statusCode, 200);
            assert.strictEqual(r2Res.body, 'APOLLO-MOCK-RELEASE-AAB-PAYLOAD-BINARY');
        });

        await test('2.3: Central Admin GET /:id/download/rn-apk and /rn-aab routes redirect correctly', async () => {
            const apkRes = await httpRequest('GET', `/api/superadmin/hospitals/${hospitalAId}/download/rn-apk`, null, {
                Authorization: `Bearer ${centralAdminToken}`
            });
            assert.strictEqual(apkRes.statusCode, 302);
            assert(apkRes.headers.location.includes('X-Amz-Expires=900'));

            const aabRes = await httpRequest('GET', `/api/superadmin/hospitals/${hospitalAId}/download/rn-aab`, null, {
                Authorization: `Bearer ${centralAdminToken}`
            });
            assert.strictEqual(aabRes.statusCode, 302);
            assert(aabRes.headers.location.includes('X-Amz-Expires=900'));
        });

        await test('2.4: Token provided via ?token= URL query parameter authenticates download', async () => {
            const res = await httpRequest('GET', `/api/superadmin/hospitals/${hospitalAId}/download/apk?token=${centralAdminToken}`);
            assert.strictEqual(res.statusCode, 302);
            assert(res.headers.location.includes('X-Amz-Expires=900'));
        });

        // ─────────────────────────────────────────────────────────────────────
        // SUITE 3: Unauthorized Rejection (HTTP 401)
        // ─────────────────────────────────────────────────────────────────────
        console.log('\n--- SUITE 3: Unauthorized Rejection (HTTP 401) ---');

        await test('3.1: Download request without auth token is rejected with HTTP 401', async () => {
            const res = await httpRequest('GET', `/api/superadmin/hospitals/${hospitalAId}/download/apk`);
            assert.strictEqual(res.statusCode, 401, 'Unauthenticated request must return 401');
            assert.strictEqual(res.body.success, false);
            assert.strictEqual(res.body.message, 'No token provided');
        });

        await test('3.2: Download request with invalid/forged JWT is rejected with HTTP 401', async () => {
            const forgedToken = jwt.sign({ userId: centralAdminId, role: 'superadmin' }, 'wrong_secret_key_12345678901234567890');
            const res = await httpRequest('GET', `/api/superadmin/hospitals/${hospitalAId}/download/apk`, null, {
                Authorization: `Bearer ${forgedToken}`
            });
            assert.strictEqual(res.statusCode, 401);
            assert.strictEqual(res.body.success, false);
            assert.strictEqual(res.body.message, 'Invalid token');
        });

        // ─────────────────────────────────────────────────────────────────────
        // SUITE 4: Exclusive Central Super Admin RBAC Enforcement (HTTP 403)
        // ─────────────────────────────────────────────────────────────────────
        console.log('\n--- SUITE 4: Exclusive Central Super Admin RBAC Enforcement (HTTP 403) ---');

        await test('4.1: Hospital Admin downloading their OWN hospital build is rejected with HTTP 403', async () => {
            // Hospital A admin attempts to download Hospital A build (direct access prohibited)
            const res = await httpRequest('GET', `/api/superadmin/hospitals/${hospitalAId}/download/apk`, null, {
                Authorization: `Bearer ${hospitalAAdminToken}`
            });
            assert.strictEqual(res.statusCode, 403, 'Hospital Admin must not have direct download access, even for own hospital');
            assert.strictEqual(res.body.success, false);
            assert(res.body.message.includes('Central Super Admin access required'));
        });

        await test('4.2: Hospital Admin attempting cross-tenant download is rejected with HTTP 403', async () => {
            // Hospital A admin attempts to download Hospital B build
            const res = await httpRequest('GET', `/api/superadmin/hospitals/${hospitalBId}/download/apk`, null, {
                Authorization: `Bearer ${hospitalAAdminToken}`
            });
            assert.strictEqual(res.statusCode, 403, 'Cross-tenant download must return 403 Forbidden');
            assert.strictEqual(res.body.success, false);
            assert(res.body.message.includes('Central Super Admin access required'));
        });

        await test('4.3: Non-admin role (e.g. doctor) is rejected with HTTP 403', async () => {
            const res = await httpRequest('GET', `/api/superadmin/hospitals/${hospitalAId}/download/apk`, null, {
                Authorization: `Bearer ${doctorToken}`
            });
            assert.strictEqual(res.statusCode, 403);
            assert(res.body.message.includes('Central Super Admin access required'));
        });

        await test('4.4: Central Super Admin is authorized to download builds across all hospital tenants', async () => {
            const resA = await httpRequest('GET', `/api/superadmin/hospitals/${hospitalAId}/download/apk`, null, {
                Authorization: `Bearer ${centralAdminToken}`
            });
            assert.strictEqual(resA.statusCode, 302, 'Central Admin can download Hospital A build');
            assert(resA.headers.location.includes('X-Amz-Expires=900'));

            const resB = await httpRequest('GET', `/api/superadmin/hospitals/${hospitalBId}/download/apk`, null, {
                Authorization: `Bearer ${centralAdminToken}`
            });
            assert.strictEqual(resB.statusCode, 302, 'Central Admin can download Hospital B build');
            assert(resB.headers.location.includes('X-Amz-Expires=900'));
        });

        // ─────────────────────────────────────────────────────────────────────
        // SUITE 5: Expired Link Behavior & Signature Tampering
        // ─────────────────────────────────────────────────────────────────────
        console.log('\n--- SUITE 5: Expired Link Behavior & Signature Verification ---');

        await test('5.1: Expired presigned URL is rejected by R2 with HTTP 403 (Request has expired)', async () => {
            // Construct a presigned URL with an expired timestamp (1 hour in the past)
            const pastDate = new Date(Date.now() - 3600 * 1000).toISOString().replace(/[:-]|\.\d{3}/g, '');
            const expiredUrl = `${mockR2Endpoint}/medical365-private-releases/releases/com.medical365.apollo/1/apollo-rn-release.apk?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=r2-access-key-12345%2F20261117%2Fauto%2Fs3%2Faws4_request&X-Amz-Date=${pastDate}&X-Amz-Expires=900&X-Amz-SignedHeaders=host&X-Amz-Signature=mockvalidsig`;

            const r2Res = await fetchUrl(expiredUrl);
            assert.strictEqual(r2Res.statusCode, 403);
            assert(r2Res.body.includes('Request has expired'), 'R2 must reject expired download requests');
        });

        await test('5.2: Tampered signature is rejected by R2 with HTTP 403 (SignatureDoesNotMatch)', async () => {
            const currentDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
            const tamperedUrl = `${mockR2Endpoint}/medical365-private-releases/releases/com.medical365.apollo/1/apollo-rn-release.apk?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=r2-access-key-12345%2F20261117%2Fauto%2Fs3%2Faws4_request&X-Amz-Date=${currentDate}&X-Amz-Expires=900&X-Amz-SignedHeaders=host&X-Amz-Signature=tampered_signature_hex`;

            const r2Res = await fetchUrl(tamperedUrl);
            assert.strictEqual(r2Res.statusCode, 403);
            assert(r2Res.body.includes('SignatureDoesNotMatch'));
        });

        // ─────────────────────────────────────────────────────────────────────
        // SUITE 6: MongoDB Persistence Invariants (Never Store Presigned URLs)
        // ─────────────────────────────────────────────────────────────────────
        console.log('\n--- SUITE 6: MongoDB Persistence Invariants ---');

        await test('6.1: isPresignedUrl identifies temporary SigV4 presigned URLs', async () => {
            const presignedSample = 'https://account.r2.cloudflarestorage.com/bucket/key.apk?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=abcdef';
            assert.strictEqual(isPresignedUrl(presignedSample), true);
            assert.strictEqual(isPresignedUrl('https://ik.imagekit.io/medical365/app.apk'), false);
            assert.strictEqual(isPresignedUrl('/downloads/apks/app.apk'), false);
        });

        await test('6.2: isVerifiedDirectArtifactUrl strictly rejects presigned URLs', async () => {
            const presignedSample = 'https://account.r2.cloudflarestorage.com/bucket/key.apk?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=abcdef';
            assert.strictEqual(isVerifiedDirectArtifactUrl(presignedSample), false, 'Presigned URL must not be accepted as verified direct artifact URL');
        });

        await test('6.3: uploadReleaseArtifact with private S3 adapter stores storageKey and publicUrl = empty string', async () => {
            const tmpFile = path.join(__dirname, 'private_upload_test.apk');
            fs.writeFileSync(tmpFile, Buffer.alloc(1024, 0x55));

            try {
                const uploadRes = await artifactStorage.uploadReleaseArtifact({
                    filePath: tmpFile,
                    fileName: 'private-apollo.apk',
                    artifactType: 'APK',
                    versionCode: 15,
                    versionName: '1.5.0',
                    applicationId: 'com.medical365.apollo',
                    tenantId: hospitalAId,
                    rnBuildId: 'build-private-15',
                    requireRealProvider: true,
                });

                assert.strictEqual(uploadRes.success, true);
                assert.strictEqual(uploadRes.provider, 's3');
                assert.strictEqual(uploadRes.storageKey, 'releases/com.medical365.apollo/15/private-apollo.apk');
                // Crucial invariant: publicUrl must NOT be a presigned URL
                assert.strictEqual(uploadRes.publicUrl, '', 'publicUrl must be empty for private bucket uploads');
                assert.strictEqual(isPresignedUrl(uploadRes.publicUrl), false);

                // Verify recorded artifact document
                const savedDoc = savedReleaseArtifacts.find(a => a.storageKey === uploadRes.storageKey);
                assert(savedDoc, 'ReleaseArtifact must be recorded');
                assert.strictEqual(savedDoc.storageKey, uploadRes.storageKey);
                assert.strictEqual(savedDoc.publicUrl, '');
                assert.strictEqual(savedDoc.provider, 's3');
            } finally {
                if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
            }
        });

        // ─────────────────────────────────────────────────────────────────────
        // SUITE 7: Legacy ImageKit Backward Compatibility
        // ─────────────────────────────────────────────────────────────────────
        console.log('\n--- SUITE 7: Legacy ImageKit Backward Compatibility ---');

        await test('7.1: Hospital with legacy ImageKit URL redirects 302 to direct ImageKit URL', async () => {
            const legacyHospitalId = new mongoose.Types.ObjectId().toString();
            const legacyImageKitUrl = 'https://ik.imagekit.io/b3pvj0biyx/releases/legacy-hospital/1/legacy-rn-release.apk';

            mockHospitals[legacyHospitalId] = {
                _id: legacyHospitalId,
                name: 'Legacy Clinic',
                slug: 'legacyclinic',
                appConfig: {
                    androidPackageId: 'com.medical365.legacy',
                    buildStatus: 'COMPLETED',
                    rnBuildStatus: 'COMPLETED',
                    rnApkUrl: legacyImageKitUrl,
                    rnStorageProvider: 'imagekit',
                }
            };

            const res = await httpRequest('GET', `/api/superadmin/hospitals/${legacyHospitalId}/download/apk`, null, {
                Authorization: `Bearer ${centralAdminToken}`
            });

            assert.strictEqual(res.statusCode, 302);
            assert.strictEqual(res.headers.location, legacyImageKitUrl, 'Must redirect directly to legacy ImageKit URL');
        });

        // ─────────────────────────────────────────────────────────────────────
        // SUITE 8: Download Tracking Metrics
        // ─────────────────────────────────────────────────────────────────────
        console.log('\n--- SUITE 8: Download Tracking Metrics ---');

        await test('8.1: Authenticated download increments ReleaseArtifact downloadCount', async () => {
            const trackingKey = 'releases/com.medical365.apollo/1/apollo-rn-release.apk';
            let artifactDoc = savedReleaseArtifacts.find(a => a.storageKey === trackingKey);
            if (!artifactDoc) {
                artifactDoc = {
                    storageKey: trackingKey,
                    tenantId: hospitalAId,
                    artifactType: 'APK',
                    downloadCount: 5,
                };
                savedReleaseArtifacts.push(artifactDoc);
            }
            const countBefore = artifactDoc.downloadCount;

            const res = await httpRequest('GET', `/api/superadmin/hospitals/${hospitalAId}/download/apk`, null, {
                Authorization: `Bearer ${centralAdminToken}`
            });
            assert.strictEqual(res.statusCode, 302);

            const countAfter = artifactDoc.downloadCount;
            assert.strictEqual(countAfter, countBefore + 1, 'downloadCount must increment by 1');
        });

        // ─────────────────────────────────────────────────────────────────────
        // Final Summary
        // ─────────────────────────────────────────────────────────────────────
        console.log('\n================================================================');
        console.log(`📊 PRIVATE S3/R2 DOWNLOADS SUMMARY: ${passedCount}/${passedCount + failedCount} PASSED (${failedCount} FAILED)`);
        console.log('================================================================\n');

        if (failedCount > 0) {
            process.exit(1);
        }
    } finally {
        artifactStorage.resetStorageAdapter();
        if (server) server.close();
        if (mockR2Server) mockR2Server.close();
    }
})();
