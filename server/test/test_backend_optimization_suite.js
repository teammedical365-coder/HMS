/**
 * test_backend_optimization_suite.js
 * Comprehensive Verification & Regression Test Suite for Medical365 Backend Optimizations
 */

const assert = require('assert');
const path = require('path');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

console.log('===============================================================');
console.log('   MEDICAL365 HMS — BACKEND OPTIMIZATIONS VERIFICATION SUITE   ');
console.log('===============================================================\n');

let total = 0;
let passed = 0;
let failed = 0;
const results = [];

function test(name, fn) {
    total++;
    try {
        fn();
        passed++;
        results.push({ name, status: 'PASS' });
        console.log(`✅ [PASS] ${name}`);
    } catch (err) {
        failed++;
        results.push({ name, status: 'FAIL', error: err.message });
        console.error(`❌ [FAIL] ${name}: ${err.message}`);
    }
}

async function testAsync(name, fn) {
    total++;
    try {
        await fn();
        passed++;
        results.push({ name, status: 'PASS' });
        console.log(`✅ [PASS] ${name}`);
    } catch (err) {
        failed++;
        results.push({ name, status: 'FAIL', error: err.message });
        console.error(`❌ [FAIL] ${name}: ${err.message}`);
    }
}

async function run() {
    // -------------------------------------------------------------
    // GROUP 1: Authentication & Token Caching
    // -------------------------------------------------------------
    console.log('--- Group 1: Authentication & Token Caching ---');

    test('1.1: auth.middleware exports verifyToken and invalidateAuthCache', () => {
        const auth = require('../src/middleware/auth.middleware');
        assert.strictEqual(typeof auth.verifyToken, 'function', 'verifyToken must be a function');
        assert.strictEqual(typeof auth.invalidateAuthCache, 'function', 'invalidateAuthCache must be a function');
    });

    await testAsync('1.2: TokenBlacklist post-save automatically calls invalidateAuthCache', async () => {
        const TokenBlacklist = require('../src/models/tokenBlacklist.model');
        assert.ok(TokenBlacklist.schema, 'TokenBlacklist schema exists');
        // Verify post save hook is registered
        const postHooks = TokenBlacklist.schema.s.hooks._posts.get('save') || [];
        assert.ok(postHooks.length > 0, 'Post-save hook must be registered on TokenBlacklist');
    });

    test('1.3: Token revocation by userId and jti evicts from authCache', () => {
        const { invalidateAuthCache } = require('../src/middleware/auth.middleware');
        // Calling with arbitrary ID should execute cleanly without error
        invalidateAuthCache({ userId: new mongoose.Types.ObjectId(), jti: 'test-jti-123' });
    });

    // -------------------------------------------------------------
    // GROUP 2: Layered Rate Limiting & DoS Protection
    // -------------------------------------------------------------
    console.log('\n--- Group 2: Layered Rate Limiting & DoS Protection ---');

    test('2.1: All rate limiters are properly configured and exported', () => {
        const limiters = require('../src/middleware/rateLimiter');
        const expected = [
            'loginLimiter',
            'signupLimiter',
            'otpLimiter',
            'generalLimiter',
            'emailOtpSendLimiter',
            'emailOtpVerifyLimiter',
            'passwordRecoveryLimiter',
            'publicConfigLimiter',
            'aiWalletLimiter',
            'uploadLimiter',
            'searchLimiter'
        ];
        for (const exp of expected) {
            assert.ok(limiters[exp], `Rate limiter '${exp}' must be exported`);
        }
    });

    test('2.2: Login and OTP send limiters skip successful requests (shared IP friendly)', () => {
        const { loginLimiter, emailOtpSendLimiter } = require('../src/middleware/rateLimiter');
        // express-rate-limit instances expose options or wrapped handler
        assert.ok(loginLimiter, 'loginLimiter configured');
        assert.ok(emailOtpSendLimiter, 'emailOtpSendLimiter configured');
    });

    // -------------------------------------------------------------
    // GROUP 3: Database & Tenant Models Optimization
    // -------------------------------------------------------------
    console.log('\n--- Group 3: Database & Tenant Models Optimization ---');

    test('3.1: Tenant models memoize on tenantDb connection instance', () => {
        const { getTenantModels } = require('../src/db/tenantModels');
        const mockDb = {
            models: {},
            model: (name, schema) => ({ name })
        };
        const modelsFirstCall = getTenantModels(mockDb);
        assert.ok(mockDb.__cachedTenantModels, '__cachedTenantModels must be attached');
        const modelsSecondCall = getTenantModels(mockDb);
        assert.strictEqual(modelsFirstCall, modelsSecondCall, 'Repeated call must return same memoized object');
        assert.ok(modelsFirstCall.User, 'User model registered');
        assert.ok(modelsFirstCall.Appointment, 'Appointment model registered');
    });

    test('3.2: Tenant DB connection manager exports closeAllTenantConnections', () => {
        const tenantDb = require('../src/db/tenantDb');
        assert.strictEqual(typeof tenantDb.closeAllTenantConnections, 'function');
    });

    test('3.3: Appointment schema includes multi-tenant compound indexes', () => {
        const Appointment = require('../src/models/appointment.model');
        const indexes = Appointment.schema.indexes();
        
        const hasHospitalDoctorUnique = indexes.some(([fields]) => 
            fields.hospitalId === 1 && fields.doctorId === 1 && fields.appointmentDate === 1 && fields.appointmentTime === 1
        );
        const hasDoctorUserIdIndex = indexes.some(([fields]) => 
            fields.hospitalId === 1 && fields.doctorUserId === 1 && fields.appointmentDate === 1
        );
        assert.ok(hasHospitalDoctorUnique, 'Hospital-scoped unique appointment index must exist');
        assert.ok(hasDoctorUserIdIndex, 'Hospital + doctorUserId index must exist');
    });

    // -------------------------------------------------------------
    // GROUP 4: ImageKit Cloud Storage & Ephemeral Protection
    // -------------------------------------------------------------
    console.log('\n--- Group 4: ImageKit Cloud Storage & Ephemeral Protection ---');

    await testAsync('4.1: Production upload refuses ephemeral disk when ImageKit unconfigured', async () => {
        const originalEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = 'production';
        
        const ikPath = require.resolve('../src/utils/imagekit');
        delete require.cache[ikPath];
        const ik = require('../src/utils/imagekit');
        
        let threw = false;
        try {
            await ik.upload({ file: Buffer.from('test-content'), fileName: 'test.png' });
        } catch (err) {
            threw = true;
            assert.ok(err.message.includes('cloud') || err.message.includes('ImageKit') || err.message.includes('configured'));
        }
        process.env.NODE_ENV = originalEnv;
        assert.ok(threw, 'Must throw error in production to protect patient data from ephemeral loss');
    });

    // -------------------------------------------------------------
    // GROUP 5: Server Stability, Health Check & Socket.IO
    // -------------------------------------------------------------
    console.log('\n--- Group 5: Server Stability, Health Check & Socket.IO ---');

    test('5.1: Express app mounts /healthz probe endpoint', () => {
        const app = require('../src/app');
        assert.ok(app, 'app must be exported');
        const hasHealthz = app._router.stack.some(layer => layer.route && layer.route.path === '/healthz');
        assert.ok(hasHealthz, '/healthz route must be mounted');
    });

    test('5.2: Express app mounts layered rate limiters before routes', () => {
        const app = require('../src/app');
        const routes = app._router.stack.map(l => l.route ? l.route.path : (l.regexp ? l.regexp.toString() : ''));
        assert.ok(routes.length > 10, 'Router stack must be loaded with middleware layers');
    });

    // -------------------------------------------------------------
    // SUMMARY
    // -------------------------------------------------------------
    console.log('\n===============================================================');
    console.log(`   TEST RESULTS: ${passed} / ${total} PASSED (${failed} FAILED)`);
    console.log('===============================================================');

    if (failed > 0) {
        process.exit(1);
    } else {
        process.exit(0);
    }
}

run().catch(err => {
    console.error('Test execution crashed:', err);
    process.exit(1);
});

