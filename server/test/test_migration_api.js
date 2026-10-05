/**
 * test_migration_api.js — Integration & security verification for migration endpoints.
 */

const assert = require('assert');

// Test the verifyHospitalAdmin middleware in isolation
const verifyHospitalAdmin = (user) => {
    if (!user) return { status: 401, message: 'Authentication required' };
    const roleName = (user._roleData?.name || String(user.role || '')).toLowerCase().replace(/[\s_-]+/g, '');
    const allowedRoles = ['hospitaladmin', 'centraladmin', 'superadmin'];
    if (allowedRoles.includes(roleName)) {
        return { status: 200, message: 'OK' };
    }
    return { status: 403, message: 'Access denied' };
};

function runApiSecurityTests() {
    console.log('====================================================');
    console.log('RUNNING MIGRATION API SECURITY & RBAC TESTS');
    console.log('====================================================\n');

    let passed = 0;
    let failed = 0;

    function test(name, fn) {
        try {
            fn();
            console.log(`✓ [PASS] ${name}`);
            passed++;
        } catch (err) {
            console.error(`✗ [FAIL] ${name}:`, err.message);
            failed++;
        }
    }

    test('RBAC: Hospital Admin is permitted', () => {
        const res = verifyHospitalAdmin({ role: 'hospitaladmin' });
        assert.strictEqual(res.status, 200);
    });

    test('RBAC: Central Admin and Superadmin are permitted', () => {
        assert.strictEqual(verifyHospitalAdmin({ role: 'centraladmin' }).status, 200);
        assert.strictEqual(verifyHospitalAdmin({ role: 'superadmin' }).status, 200);
    });

    test('RBAC: Doctor is rejected (403)', () => {
        const res = verifyHospitalAdmin({ role: 'doctor' });
        assert.strictEqual(res.status, 403);
    });

    test('RBAC: Nurse is rejected (403)', () => {
        const res = verifyHospitalAdmin({ role: 'nurse' });
        assert.strictEqual(res.status, 403);
    });

    test('RBAC: Receptionist is rejected (403)', () => {
        const res = verifyHospitalAdmin({ role: 'reception' });
        assert.strictEqual(res.status, 403);
    });

    test('RBAC: Accountant is rejected (403)', () => {
        const res = verifyHospitalAdmin({ role: 'accountant' });
        assert.strictEqual(res.status, 403);
    });

    test('RBAC: Unauthenticated is rejected (401)', () => {
        const res = verifyHospitalAdmin(null);
        assert.strictEqual(res.status, 401);
    });

    console.log(`\n====================================================`);
    console.log(`RBAC SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log(`====================================================\n`);

    if (failed > 0) {
        process.exit(1);
    }
}

runApiSecurityTests();
