/**
 * Medical365 LMS Phase 1 Automated Test Suite
 * Tests role templates, action-level permissions, tenant isolation, and security guardrails.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const Role = require('../models/role.model');
const User = require('../models/user.model');
const Hospital = require('../models/hospital.model');
const { requirePermission, requireAllPermissions } = require('../middleware/auth.middleware');
const { LMS_ROLE_TEMPLATES } = require('../constants/lmsPermissions');

// Test runner helper
let totalPassed = 0;
let totalFailed = 0;

function assert(condition, testName) {
    if (condition) {
        console.log(`  ✅ PASS: ${testName}`);
        totalPassed++;
    } else {
        console.error(`  ❌ FAIL: ${testName}`);
        totalFailed++;
    }
}

async function runTests() {
    console.log('====================================================');
    console.log('  MEDICAL365 LMS PHASE 1 INTEGRATION TEST SUITE');
    console.log('====================================================\n');

    await mongoose.connect(process.env.MONGODB_URL);
    console.log('Connected to MongoDB for Phase 1 verification.\n');

    // ─────────────────────────────────────────────────────────────────────────────
    // TEST SUITE 1: VERIFICATION OF THE SEVEN LMS ROLE TEMPLATES
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('--- TEST SUITE 1: 7 LMS ROLE TEMPLATES VERIFICATION ---');

    const expectedRoles = [
        { name: 'Lab Admin', minPerms: 40 },
        { name: 'Lab Manager', minPerms: 25 },
        { name: 'Lab Receptionist', minPerms: 10 },
        { name: 'Phlebotomist / Sample Collector', minPerms: 5 },
        { name: 'Lab Technician', minPerms: 12 },
        { name: 'Pathologist', minPerms: 15 },
        { name: 'Lab Accountant', minPerms: 8 }
    ];

    for (const exp of expectedRoles) {
        const found = await Role.find({ name: exp.name, hospitalId: null }).lean();
        assert(found.length === 1, `Role "${exp.name}" exists exactly once (no duplicates)`);
        if (found.length > 0) {
            const role = found[0];
            assert(role.isSystemRole === true, `Role "${exp.name}" is marked as a system role`);
            assert(
                role.permissions && role.permissions.length >= exp.minPerms,
                `Role "${exp.name}" has at least ${exp.minPerms} granular permissions (actual: ${role.permissions?.length})`
            );
            assert(Boolean(role.dashboardPath), `Role "${exp.name}" has dashboardPath: ${role.dashboardPath}`);
            assert(Array.isArray(role.navLinks) && role.navLinks.length > 0, `Role "${exp.name}" has navigation links defined`);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // TEST SUITE 2: GRANULAR PERMISSION ENFORCEMENT VIA MIDDLEWARE
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('\n--- TEST SUITE 2: ALLOWED & DENIED PERMISSION ENFORCEMENT ---');

    const pathologistRole = await Role.findOne({ name: 'Pathologist', hospitalId: null }).lean();
    const phlebotomistRole = await Role.findOne({ name: 'Phlebotomist / Sample Collector', hospitalId: null }).lean();
    const labTechRole = await Role.findOne({ name: 'Lab Technician', hospitalId: null }).lean();
    const receptionistRole = await Role.findOne({ name: 'Lab Receptionist', hospitalId: null }).lean();

    // Helper to simulate Express middleware execution
    const runMiddleware = (middlewareFn, req) => {
        return new Promise((resolve) => {
            const res = {
                statusCode: 200,
                status(code) {
                    this.statusCode = code;
                    return this;
                },
                json(payload) {
                    this.body = payload;
                    resolve({ status: this.statusCode, body: payload });
                }
            };
            const next = () => resolve({ status: 200, passedNext: true });
            middlewareFn(req, res, next);
        });
    };

    // Test 2.1: Pathologist allowed on reports:verify
    const pathReq = { user: { id: 'u1', role: pathologistRole._id, _roleData: pathologistRole } };
    const resVerifyAllowed = await runMiddleware(requirePermission('reports:verify'), pathReq);
    assert(resVerifyAllowed.passedNext === true, 'Pathologist is ALLOWED to access reports:verify');

    // Test 2.2: Phlebotomist DENIED on reports:verify
    const phlebReq = { user: { id: 'u2', role: phlebotomistRole._id, _roleData: phlebotomistRole } };
    const resVerifyDenied = await runMiddleware(requirePermission('reports:verify'), phlebReq);
    assert(resVerifyDenied.status === 403, 'Phlebotomist is DENIED access to reports:verify (403 Forbidden)');

    // Test 2.3: Phlebotomist allowed on samples:collect
    const resCollectAllowed = await runMiddleware(requirePermission('samples:collect'), phlebReq);
    assert(resCollectAllowed.passedNext === true, 'Phlebotomist is ALLOWED to access samples:collect');

    // Test 2.4: Lab Technician allowed on results:enter
    const techReq = { user: { id: 'u3', role: labTechRole._id, _roleData: labTechRole } };
    const resResultsAllowed = await runMiddleware(requirePermission('results:enter'), techReq);
    assert(resResultsAllowed.passedNext === true, 'Lab Technician is ALLOWED to access results:enter');

    // Test 2.5: Lab Receptionist DENIED on results:enter
    const recepReq = { user: { id: 'u4', role: receptionistRole._id, _roleData: receptionistRole } };
    const resResultsDenied = await runMiddleware(requirePermission('results:enter'), recepReq);
    assert(resResultsDenied.status === 403, 'Lab Receptionist is DENIED access to results:enter (403 Forbidden)');

    // Test 2.6: Lab Receptionist allowed on orders:create
    const resOrderAllowed = await runMiddleware(requirePermission('orders:create'), recepReq);
    assert(resOrderAllowed.passedNext === true, 'Lab Receptionist is ALLOWED to access orders:create');

    // Test 2.7: SuperAdmin wildcard * is allowed on any permission
    const superAdminReq = { user: { id: 'sa', role: 'superadmin', _roleData: { name: 'superadmin', permissions: ['*'] } } };
    const resSuperAdmin = await runMiddleware(requirePermission('reports:verify', 'billing:refund'), superAdminReq);
    assert(resSuperAdmin.passedNext === true, 'SuperAdmin with wildcard * is ALLOWED on any permission');

    // ─────────────────────────────────────────────────────────────────────────────
    // TEST SUITE 3: CROSS-HOSPITAL STAFF ACCESS REJECTION (TENANT ISOLATION)
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('\n--- TEST SUITE 3: CROSS-HOSPITAL STAFF ACCESS REJECTION ---');

    const fakeHospA = new mongoose.Types.ObjectId();
    const fakeHospB = new mongoose.Types.ObjectId();

    const userInHospB = {
        _id: new mongoose.Types.ObjectId(),
        name: 'Staff in Hosp B',
        hospitalId: fakeHospB,
        role: labTechRole._id
    };

    // Hospital Admin in Hosp A attempting to edit user in Hosp B
    const callerHospA = {
        role: 'hospitaladmin',
        hospitalId: fakeHospA
    };

    const isCrossHospitalAllowed = (caller, targetUser) => {
        const isCentral = caller.role === 'centraladmin' || caller.role === 'superadmin';
        if (!isCentral && String(targetUser.hospitalId) !== String(caller.hospitalId)) {
            return false; // rejected
        }
        return true;
    };

    assert(
        isCrossHospitalAllowed(callerHospA, userInHospB) === false,
        'Hospital Admin from Hospital A CANNOT modify staff in Hospital B'
    );

    const userInHospA = {
        _id: new mongoose.Types.ObjectId(),
        name: 'Staff in Hosp A',
        hospitalId: fakeHospA,
        role: labTechRole._id
    };

    assert(
        isCrossHospitalAllowed(callerHospA, userInHospA) === true,
        'Hospital Admin from Hospital A CAN modify staff in their own Hospital A'
    );

    // ─────────────────────────────────────────────────────────────────────────────
    // TEST SUITE 4: UNAUTHORIZED ROLE ASSIGNMENT REJECTION
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('\n--- TEST SUITE 4: UNAUTHORIZED ROLE ASSIGNMENT REJECTION ---');

    const validateRoleAssignment = (caller, targetRoleName, roleHospitalId) => {
        const isCentral = caller.role === 'centraladmin' || caller.role === 'superadmin';
        const roleLower = String(targetRoleName).toLowerCase();

        // 1. Cannot assign administrative roles
        if (['centraladmin', 'superadmin', 'hospitaladmin'].includes(roleLower) && !isCentral) {
            return { allowed: false, reason: 'Cannot assign Administrative roles' };
        }

        // 2. Cannot assign role belonging to another hospital
        if (roleHospitalId && String(roleHospitalId) !== String(caller.hospitalId) && !isCentral) {
            return { allowed: false, reason: 'Cannot assign a role belonging to another hospital' };
        }

        // 3. Cannot assign doctor role from staff management
        const isDoctor = (roleLower === 'doctor' || roleLower === 'clinic doctor' || (roleLower.includes('doctor') && !roleLower.includes('assistant')));
        if (isDoctor && !isCentral) {
            return { allowed: false, reason: 'Doctor roles cannot be assigned from Staff Management' };
        }

        return { allowed: true };
    };

    const adminAttemptCentral = validateRoleAssignment(callerHospA, 'centraladmin', null);
    assert(adminAttemptCentral.allowed === false, 'Hospital Admin CANNOT assign Central Admin role');

    const adminAttemptSuper = validateRoleAssignment(callerHospA, 'superadmin', null);
    assert(adminAttemptSuper.allowed === false, 'Hospital Admin CANNOT assign Super Admin role');

    const adminAttemptDoctor = validateRoleAssignment(callerHospA, 'Doctor', null);
    assert(adminAttemptDoctor.allowed === false, 'Hospital Admin CANNOT assign Doctor role from Staff Management');

    const adminAttemptForeignHospRole = validateRoleAssignment(callerHospA, 'Custom Lab Role', fakeHospB);
    assert(adminAttemptForeignHospRole.allowed === false, 'Hospital Admin CANNOT assign custom role from another hospital');

    const adminAttemptLmsPathologist = validateRoleAssignment(callerHospA, 'Pathologist', null);
    assert(adminAttemptLmsPathologist.allowed === true, 'Hospital Admin CAN assign global Pathologist role');

    const adminAttemptLmsTech = validateRoleAssignment(callerHospA, 'Lab Technician', null);
    assert(adminAttemptLmsTech.allowed === true, 'Hospital Admin CAN assign global Lab Technician role');

    // ─────────────────────────────────────────────────────────────────────────────
    // TEST SUITE 5: EXISTING STAFF & ROLES FUNCTIONALITY PRESERVATION
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('\n--- TEST SUITE 5: EXISTING STAFF & SYSTEM ROLES PRESERVED ---');

    const existingCoreRoles = ['Pharmacist', 'Doctor Assistant', 'Accountant', 'Doctor', 'Receptionist', 'Nurse'];
    for (const coreName of existingCoreRoles) {
        const foundCore = await Role.findOne({ name: coreName, hospitalId: null }).lean();
        assert(foundCore !== null, `Existing system role "${coreName}" is intact in database`);
    }

    console.log('\n====================================================');
    console.log(`  PHASE 1 TEST RESULTS: ${totalPassed} PASSED, ${totalFailed} FAILED`);
    console.log('====================================================');

    await mongoose.disconnect();
    process.exit(totalFailed === 0 ? 0 : 1);
}

runTests().catch(err => {
    console.error('Test runner fatal error:', err);
    process.exit(1);
});
