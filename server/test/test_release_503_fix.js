/**
 * test_release_503_fix.js — Comprehensive verification suite for Releases & OTA 503 fix
 * 
 * Verifies:
 * 1. Root Cause Resolution: Real Super Admin JWT does NOT produce HTTP 503 (TypeError: verifyCentralAdmin is not a function).
 * 2. Authorization Security: Unauthenticated (401), invalid token (401), and unauthorized roles (403) are preserved.
 * 3. Contract Matching for Healthy Empty State: Returns { success: true, total: 0, releases: [] } and zero metrics, not 503.
 * 4. Contract Matching for Populated State: Returns paginated releases and aggregated telemetry matching releaseAPI & console.
 * 5. Failure Preservation: Genuine database outages and connection drops correctly return HTTP 503.
 */

const assert = require('assert');
const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

process.env.NODE_ENV = 'test';
const { JWT_SECRET } = require('../src/config/jwt');

console.log('================================================================');
console.log('🧪 VERIFYING FIX FOR RELEASES & OTA API HTTP 503');
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

// Mock User storage for token verification
const mockUsers = {
    '507f1f77bcf86cd799439011': { _id: '507f1f77bcf86cd799439011', role: 'superadmin', name: 'Global SuperAdmin' },
    '507f1f77bcf86cd799439012': { _id: '507f1f77bcf86cd799439012', role: 'centraladmin', name: 'Central Admin Staff' },
    '507f1f77bcf86cd799439013': { _id: '507f1f77bcf86cd799439013', role: 'doctor', name: 'Dr. Test Physician' },
    '507f1f77bcf86cd799439014': { _id: '507f1f77bcf86cd799439014', role: 'patient', name: 'Test Patient' },
};

let simulateDbOutage = false;

// Mock User Model in require.cache
const userModelPath = require.resolve('../src/models/user.model');
const MockUserModel = {
    findById: (id) => {
        if (simulateDbOutage) {
            return Promise.reject(new Error('MongoServerSelectionError: connection timed out'));
        }
        return Promise.resolve(mockUsers[id] || null);
    },
    updateOne: () => Promise.resolve({ nModified: 1 })
};

require.cache[userModelPath] = {
    id: userModelPath,
    filename: userModelPath,
    loaded: true,
    exports: MockUserModel
};

// Mock Role Model in require.cache
const roleModelPath = require.resolve('../src/models/role.model');
const MockRoleModel = {
    findById: () => Promise.resolve({ name: 'doctor', permissions: ['doctor_access'] }),
    findOne: () => Promise.resolve({ name: 'doctor', permissions: ['doctor_access'] }),
};
require.cache[roleModelPath] = {
    id: roleModelPath,
    filename: roleModelPath,
    loaded: true,
    exports: MockRoleModel
};

// Mock Release storage
let mockReleases = [];

const MockReleaseModel = {
    find: (query) => {
        if (simulateDbOutage) {
            return {
                sort: () => ({
                    skip: () => ({
                        limit: () => ({
                            lean: () => Promise.reject(new Error('MongoNetworkError: connection closed'))
                        })
                    })
                })
            };
        }
        let results = [...mockReleases];
        if (query.channel) results = results.filter(r => r.channel === query.channel);
        if (query.type) results = results.filter(r => r.type === query.type);
        if (query.status) results = results.filter(r => r.status === query.status);

        return {
            sort: () => ({
                skip: (skipCount) => ({
                    limit: (limitCount) => ({
                        lean: () => Promise.resolve(results.slice(skipCount, skipCount + limitCount))
                    })
                })
            })
        };
    },
    countDocuments: (query = {}) => {
        if (simulateDbOutage) {
            return Promise.reject(new Error('MongoNetworkError: connection closed'));
        }
        let results = [...mockReleases];
        if (query.channel) results = results.filter(r => r.channel === query.channel);
        if (query.type) results = results.filter(r => r.type === query.type);
        if (query.status) results = results.filter(r => r.status === query.status);
        return Promise.resolve(results.length);
    },
    distinct: (field, query = {}) => {
        if (simulateDbOutage) {
            return Promise.reject(new Error('MongoNetworkError: connection closed'));
        }
        let results = [...mockReleases];
        if (query.status) results = results.filter(r => r.status === query.status);
        const values = Array.from(new Set(results.map(r => r[field]).filter(Boolean)));
        return Promise.resolve(values);
    },
    aggregate: (pipeline) => {
        if (simulateDbOutage) {
            return Promise.reject(new Error('MongoNetworkError: connection closed'));
        }
        const total = mockReleases.reduce((acc, r) => acc + (r.downloadCount || 0), 0);
        return Promise.resolve([{ _id: null, total }]);
    },
    findOne: (query = {}) => {
        if (simulateDbOutage) {
            return {
                sort: () => ({
                    lean: () => Promise.reject(new Error('MongoNetworkError: connection closed'))
                })
            };
        }
        const found = mockReleases.find(r => (!query.status || r.status === query.status));
        return {
            sort: () => ({
                lean: () => Promise.resolve(found || null)
            })
        };
    },
    create: (data) => {
        if (simulateDbOutage) {
            return Promise.reject(new Error('MongoNetworkError: connection closed'));
        }
        mockReleases.push(data);
        return Promise.resolve(data);
    },
    updateOne: (query, update) => {
        const item = mockReleases.find(r => r.releaseId === query.releaseId);
        if (item && update.$set) {
            Object.assign(item, update.$set);
        }
        return Promise.resolve({ nModified: item ? 1 : 0 });
    }
};

const releaseModelPath = require.resolve('../src/models/release.model');
require.cache[releaseModelPath] = {
    id: releaseModelPath,
    filename: releaseModelPath,
    loaded: true,
    exports: MockReleaseModel
};

// Mount Release Router on Express Test App
const releaseRouter = require('../src/routes/release.routes');
const app = express();
app.use(express.json());
app.use('/api/superadmin/releases', releaseRouter);

function request(method, url, headers = {}, body = null) {
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
        let responseBody = null;

        const req = {
            method: method.toUpperCase(),
            url,
            path: pathPart,
            query,
            body: body || {},
            headers: {}
        };

        for (const [k, v] of Object.entries(headers)) {
            req.headers[k.toLowerCase()] = v;
        }

        let responseHeaders = {};
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

        app.handle(req, res, (err) => {
            if (err) {
                console.error('[TEST HANDLE ERROR]', err);
                resolve({ statusCode: 500, body: { success: false, error: err.message } });
            } else {
                resolve({ statusCode: 404, body: null });
            }
        });
    });
}

function makeToken(userId) {
    return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '1h' });
}

(async () => {
    // Make mongoose connection state report 1 (connected) by default
    Object.defineProperty(mongoose.connection, 'readyState', {
        value: 1,
        configurable: true,
        writable: true
    });

    console.log('--- SUITE A: Authentication & Super Admin Role Verification ---');

    await test('Unauthenticated GET /releases returns HTTP 401 (not 503)', async () => {
        const res = await request('GET', '/api/superadmin/releases');
        assert.strictEqual(res.statusCode, 401);
        assert.strictEqual(res.body.success, false);
        assert.strictEqual(res.body.message, 'No token provided');
    });

    await test('Invalid Bearer token returns HTTP 401 (not 503)', async () => {
        const res = await request('GET', '/api/superadmin/releases', {
            'Authorization': 'Bearer totally.invalid.token'
        });
        assert.strictEqual(res.statusCode, 401);
        assert.strictEqual(res.body.success, false);
        assert.strictEqual(res.body.message, 'Invalid token');
    });

    await test('Expired JWT token returns HTTP 401 with sessionExpired flag', async () => {
        const expiredToken = jwt.sign({ userId: '507f1f77bcf86cd799439011' }, JWT_SECRET, { expiresIn: -10 });
        const res = await request('GET', '/api/superadmin/releases', {
            'Authorization': `Bearer ${expiredToken}`
        });
        assert.strictEqual(res.statusCode, 401);
        assert.strictEqual(res.body.success, false);
        assert.strictEqual(res.body.sessionExpired, true);
    });

    await test('Non-admin user (doctor role) returns HTTP 403 Central Admin access required', async () => {
        const docToken = makeToken('507f1f77bcf86cd799439013');
        const res = await request('GET', '/api/superadmin/releases', {
            'Authorization': `Bearer ${docToken}`
        });
        assert.strictEqual(res.statusCode, 403);
        assert.strictEqual(res.body.success, false);
        assert.strictEqual(res.body.message, 'Central Admin access required');
    });

    console.log('\n--- SUITE B: Healthy Empty State Contracts (The Reported 503 Scenarios) ---');

    mockReleases = []; // Empty DB

    await test('SuperAdmin GET /api/superadmin/releases?limit=50 returns HTTP 200 with empty list (FIXED)', async () => {
        const superToken = makeToken('507f1f77bcf86cd799439011');
        const res = await request('GET', '/api/superadmin/releases?limit=50', {
            'Authorization': `Bearer ${superToken}`
        });
        assert.strictEqual(res.statusCode, 200, `Expected 200, received ${res.statusCode}`);
        assert.strictEqual(res.body.success, true);
        assert.strictEqual(res.body.total, 0);
        assert.strictEqual(res.body.limit, 50);
        assert.strictEqual(res.body.page, 1);
        assert.deepStrictEqual(res.body.releases, []);
    });

    await test('SuperAdmin GET /api/superadmin/releases/metrics returns HTTP 200 with zero metrics (FIXED)', async () => {
        const superToken = makeToken('507f1f77bcf86cd799439011');
        const res = await request('GET', '/api/superadmin/releases/metrics', {
            'Authorization': `Bearer ${superToken}`
        });
        assert.strictEqual(res.statusCode, 200, `Expected 200, received ${res.statusCode}`);
        assert.strictEqual(res.body.success, true);
        assert.strictEqual(typeof res.body.metrics, 'object');
        assert.strictEqual(res.body.metrics.totalReleases, 0);
        assert.strictEqual(res.body.metrics.completedOta, 0);
        assert.strictEqual(res.body.metrics.completedApk, 0);
        assert.strictEqual(res.body.metrics.totalDownloads, 0);
        assert.deepStrictEqual(res.body.metrics.activeCohorts, []);
        assert.strictEqual(res.body.metrics.latestRelease, null);
    });

    await test('CentralAdmin role also passes authorization and receives HTTP 200', async () => {
        const centralToken = makeToken('507f1f77bcf86cd799439012');
        const res = await request('GET', '/api/superadmin/releases', {
            'Authorization': `Bearer ${centralToken}`
        });
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.body.success, true);
    });

    console.log('\n--- SUITE C: Populated Results Contract Matching ---');

    mockReleases = [
        {
            releaseId: 'rel-apk-001',
            type: 'APK_BUILD',
            channel: 'production',
            versionCode: 1,
            versionName: '1.0.0',
            runtimeVersion: '1.0.0',
            status: 'COMPLETED',
            downloadCount: 10,
            createdAt: new Date('2026-10-01T10:00:00Z')
        },
        {
            releaseId: 'rel-ota-002',
            type: 'OTA_UPDATE',
            channel: 'production',
            versionCode: 1,
            versionName: '1.0.1',
            runtimeVersion: '1.0.0',
            status: 'COMPLETED',
            downloadCount: 5,
            createdAt: new Date('2026-10-02T10:00:00Z')
        }
    ];

    await test('GET /releases returns populated catalog with pagination metadata', async () => {
        const superToken = makeToken('507f1f77bcf86cd799439011');
        const res = await request('GET', '/api/superadmin/releases?page=1&limit=10', {
            'Authorization': `Bearer ${superToken}`
        });
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.body.success, true);
        assert.strictEqual(res.body.total, 2);
        assert.strictEqual(res.body.releases.length, 2);
        assert.strictEqual(res.body.releases[0].releaseId, 'rel-apk-001');
    });

    await test('GET /releases/metrics returns aggregated telemetry matching populated records', async () => {
        const superToken = makeToken('507f1f77bcf86cd799439011');
        const res = await request('GET', '/api/superadmin/releases/metrics', {
            'Authorization': `Bearer ${superToken}`
        });
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.body.success, true);
        assert.strictEqual(res.body.metrics.totalReleases, 2);
        assert.strictEqual(res.body.metrics.completedOta, 1);
        assert.strictEqual(res.body.metrics.completedApk, 1);
        assert.strictEqual(res.body.metrics.totalDownloads, 15);
        assert.deepStrictEqual(res.body.metrics.activeCohorts, ['1.0.0']);
        assert.strictEqual(res.body.metrics.latestRelease.status, 'COMPLETED');
    });

    console.log('\n--- SUITE D: Real Database Outages Visible as HTTP 503 ---');

    await test('When MongoDB connection drops (readyState === 0), GET /releases returns genuine HTTP 503', async () => {
        mongoose.connection.readyState = 0; // Disconnected
        const superToken = makeToken('507f1f77bcf86cd799439011');
        const res = await request('GET', '/api/superadmin/releases', {
            'Authorization': `Bearer ${superToken}`
        });
        assert.strictEqual(res.statusCode, 503);
        assert.strictEqual(res.body.success, false);
        assert.strictEqual(res.body.message, 'Database temporarily unavailable');
        mongoose.connection.readyState = 1; // Restore
    });

    await test('When MongoDB connection drops (readyState === 0), GET /metrics returns genuine HTTP 503', async () => {
        mongoose.connection.readyState = 0; // Disconnected
        const superToken = makeToken('507f1f77bcf86cd799439011');
        const res = await request('GET', '/api/superadmin/releases/metrics', {
            'Authorization': `Bearer ${superToken}`
        });
        assert.strictEqual(res.statusCode, 503);
        assert.strictEqual(res.body.success, false);
        assert.strictEqual(res.body.message, 'Database temporarily unavailable');
        mongoose.connection.readyState = 1; // Restore
    });

    await test('When database queries encounter timeout/error, returns genuine HTTP 503', async () => {
        simulateDbOutage = true;
        const superToken = makeToken('507f1f77bcf86cd799439011');
        const res = await request('GET', '/api/superadmin/releases', {
            'Authorization': `Bearer ${superToken}`
        });
        assert.strictEqual(res.statusCode, 503);
        assert.strictEqual(res.body.success, false);
        assert.strictEqual(res.body.message, 'Database temporarily unavailable');
        simulateDbOutage = false;
    });

    console.log('\n================================================================');
    console.log(`📊 TEST EXECUTION SUMMARY: ${passedTests}/${totalTests} PASSED (${failedTests} FAILED)`);
    console.log('================================================================\n');

    if (failedTests > 0) {
        process.exit(1);
    }
})();
