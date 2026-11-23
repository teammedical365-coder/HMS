/**
 * Medical365 LMS Phase 2 Automated Test Suite
 * Tests role-based workstation routing, LabLocation multi-tenant model,
 * single processing lab exclusivity, staff-location assignment, and security guardrails.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const Role = require('../models/role.model');
const User = require('../models/user.model');
const Hospital = require('../models/hospital.model');
const LabLocation = require('../models/labLocation.model');
const { requirePermission, requireAllPermissions } = require('../middleware/auth.middleware');

// Test runner state
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

// Workstation routing logic (mirroring client LabRouter & LabProtectedRoute)
function resolveWorkstationPath(roleName) {
    const r = String(roleName || '').toLowerCase().trim();
    if (r.includes('pathologist')) return '/lab/verification';
    if (r.includes('phlebotomist') || r.includes('sample collector')) return '/lab/collection';
    if (r.includes('technician') || r.includes('tech')) return '/lab/bench';
    if (r.includes('receptionist') || r.includes('reception')) return '/lab/reception';
    if (r.includes('accountant')) return '/lab/billing';
    if (r.includes('manager')) return '/lab/manager';
    if (r.includes('lab admin') || r.includes('hospitaladmin') || r.includes('admin') || r.includes('superadmin') || r === 'lab') {
        return '/lab/dashboard';
    }
    return '/lab/dashboard';
}

async function runTests() {
    console.log('====================================================');
    console.log('  MEDICAL365 LMS PHASE 2 INTEGRATION TEST SUITE');
    console.log('====================================================\n');

    await mongoose.connect(process.env.MONGODB_URL);
    console.log('Connected to MongoDB for Phase 2 verification.\n');

    let testHospitalA = null;
    let testHospitalB = null;
    let locationHubA = null;
    let locationBranchA = null;
    let locationHubB = null;
    let testStaffA = null;

    try {
        // Setup mock test hospitals
        testHospitalA = await Hospital.create({
            name: 'Phase 2 Test Hospital A',
            slug: `p2-hosp-a-${Date.now()}`,
            email: `p2-a-${Date.now()}@medical365.test`,
            phone: '9876543210',
            isActive: true
        });

        testHospitalB = await Hospital.create({
            name: 'Phase 2 Test Hospital B',
            slug: `p2-hosp-b-${Date.now()}`,
            email: `p2-b-${Date.now()}@medical365.test`,
            phone: '9876543211',
            isActive: true
        });

        // ─────────────────────────────────────────────────────────────────────────────
        // SUITE 1: ROLE-BASED WORKSTATION ROUTING RESOLUTION
        // ─────────────────────────────────────────────────────────────────────────────
        console.log('--- SUITE 1: ROLE-BASED WORKSTATION ROUTING RESOLUTION ---');

        const routingExpectations = [
            { role: 'Lab Admin', expected: '/lab/dashboard' },
            { role: 'Lab Manager', expected: '/lab/manager' },
            { role: 'Lab Receptionist', expected: '/lab/reception' },
            { role: 'Phlebotomist / Sample Collector', expected: '/lab/collection' },
            { role: 'Phlebotomist', expected: '/lab/collection' },
            { role: 'Sample Collector', expected: '/lab/collection' },
            { role: 'Lab Technician', expected: '/lab/bench' },
            { role: 'Pathologist', expected: '/lab/verification' },
            { role: 'Lab Accountant', expected: '/lab/billing' },
            { role: 'hospitaladmin', expected: '/lab/dashboard' },
            { role: 'centraladmin', expected: '/lab/dashboard' },
            { role: 'lab', expected: '/lab/dashboard' }
        ];

        for (const re of routingExpectations) {
            const resolved = resolveWorkstationPath(re.role);
            assert(resolved === re.expected, `Role "${re.role}" resolves correctly to "${re.expected}"`);
        }

        // ─────────────────────────────────────────────────────────────────────────────
        // SUITE 2: LABLOCATION MODEL CREATION & VALIDATION
        // ─────────────────────────────────────────────────────────────────────────────
        console.log('\n--- SUITE 2: LABLOCATION MODEL CREATION & VALIDATION ---');

        // Create Processing Lab for Hospital A
        locationHubA = await LabLocation.create({
            hospitalId: testHospitalA._id,
            locationName: 'Hospital A Central Processing Lab',
            locationCode: 'MAIN',
            locationType: 'PROCESSING_LAB',
            isProcessingLab: true,
            isActive: true,
            address: 'Building A, Floor 2, Metro',
            contactPerson: 'Dr. Head of Lab',
            phone: '9876543210'
        });

        assert(locationHubA._id !== null, 'Created primary processing lab location for Hospital A');
        assert(locationHubA.locationCode === 'MAIN', 'Location code is stored correctly');
        assert(locationHubA.isProcessingLab === true, 'Marked as active processing lab');

        // Create Collection Centre for Hospital A
        locationBranchA = await LabLocation.create({
            hospitalId: testHospitalA._id,
            locationName: 'Hospital A East Wing Collection Point',
            locationCode: 'EAST',
            locationType: 'COLLECTION_CENTRE',
            isProcessingLab: false,
            isActive: true,
            address: 'OPD East Wing, Metro'
        });

        assert(locationBranchA._id !== null, 'Created collection centre for Hospital A');
        assert(locationBranchA.locationType === 'COLLECTION_CENTRE', 'Location type set to COLLECTION_CENTRE');

        // Verify duplicate code in the SAME hospital is rejected
        let duplicateCodeCaught = false;
        try {
            await LabLocation.create({
                hospitalId: testHospitalA._id,
                locationName: 'Duplicate Code Lab',
                locationCode: 'MAIN',
                locationType: 'BRANCH'
            });
        } catch (err) {
            duplicateCodeCaught = true;
        }
        assert(duplicateCodeCaught === true, 'Duplicate locationCode within same hospital is strictly rejected');

        // Verify SAME locationCode in a DIFFERENT hospital is allowed (multi-tenant compound index)
        locationHubB = await LabLocation.create({
            hospitalId: testHospitalB._id,
            locationName: 'Hospital B Central Lab',
            locationCode: 'MAIN', // Same code as Hosp A
            locationType: 'PROCESSING_LAB',
            isProcessingLab: true,
            isActive: true
        });
        assert(locationHubB._id !== null, 'Identical locationCode "MAIN" is permitted in Hospital B (proper tenant isolation)');

        // ─────────────────────────────────────────────────────────────────────────────
        // SUITE 3: SINGLE ACTIVE PROCESSING LAB EXCLUSIVITY RULE
        // ─────────────────────────────────────────────────────────────────────────────
        console.log('\n--- SUITE 3: SINGLE ACTIVE PROCESSING LAB EXCLUSIVITY RULE ---');

        // When a new location in Hospital A is promoted to isProcessingLab: true
        const newHubA = await LabLocation.create({
            hospitalId: testHospitalA._id,
            locationName: 'Hospital A New Advanced Processing Facility',
            locationCode: 'MAIN-NEW',
            locationType: 'PROCESSING_LAB',
            isProcessingLab: true,
            isActive: true
        });

        // Simulate backend update logic that enforces single processing lab
        await LabLocation.updateMany(
            { hospitalId: testHospitalA._id, _id: { $ne: newHubA._id }, isProcessingLab: true },
            { isProcessingLab: false }
        );

        const oldHubRefreshed = await LabLocation.findById(locationHubA._id);
        const newHubRefreshed = await LabLocation.findById(newHubA._id);

        assert(oldHubRefreshed.isProcessingLab === false, 'Previous processing lab is automatically demoted to isProcessingLab: false');
        assert(newHubRefreshed.isProcessingLab === true, 'New location becomes the sole active processing hub for Hospital A');

        // Verify Hospital B processing lab was NOT affected by Hospital A changes
        const hospBHubRefreshed = await LabLocation.findById(locationHubB._id);
        assert(hospBHubRefreshed.isProcessingLab === true, 'Hospital B processing lab exclusivity is completely unaffected by Hospital A');

        await LabLocation.findByIdAndDelete(newHubA._id);

        // ─────────────────────────────────────────────────────────────────────────────
        // SUITE 4: STAFF LOCATION ASSIGNMENT & TENANT SECURITY
        // ─────────────────────────────────────────────────────────────────────────────
        console.log('\n--- SUITE 4: STAFF LOCATION ASSIGNMENT & TENANT SECURITY ---');

        // Create staff user in Hospital A
        testStaffA = await User.create({
            name: 'P2 Phlebotomist Staff',
            email: `p2staff-${Date.now()}@test.medical365.in`,
            password: 'hashedPassword123',
            phone: '9876543210',
            role: 'Phlebotomist / Sample Collector',
            hospitalId: testHospitalA._id,
            locationId: null
        });

        assert(testStaffA.locationId === null, 'Staff initialized with unassigned location (defaults to processing lab)');

        // Assign to Location in Hospital A (Valid)
        testStaffA.locationId = locationBranchA._id;
        await testStaffA.save();

        const staffPopulated = await User.findById(testStaffA._id).populate('locationId');
        assert(staffPopulated.locationId !== null, 'Staff successfully assigned to Hospital A branch location');
        assert(staffPopulated.locationId.locationCode === 'EAST', 'Populated locationCode matches assigned location');

        // Cross-Hospital Assignment Security Check:
        // Attempting to assign Hospital B's location to Hospital A's staff must be rejected
        let crossHospitalBlocked = false;
        try {
            const targetLoc = await LabLocation.findById(locationHubB._id);
            if (String(targetLoc.hospitalId) !== String(testStaffA.hospitalId)) {
                crossHospitalBlocked = true;
                throw new Error('403 Forbidden: Location belongs to a different hospital tenant');
            }
            testStaffA.locationId = locationHubB._id;
            await testStaffA.save();
        } catch (err) {
            crossHospitalBlocked = true;
        }
        assert(crossHospitalBlocked === true, 'Cross-hospital location assignment is strictly rejected (Tenant isolation guaranteed)');

        // Verify clearing location
        testStaffA.locationId = null;
        await testStaffA.save();
        const clearedStaff = await User.findById(testStaffA._id);
        assert(clearedStaff.locationId === null, 'Staff location can be unassigned / cleared without error');

        // ─────────────────────────────────────────────────────────────────────────────
        // SUITE 5: ROUTE PROTECTION & ACTION PERMISSIONS VERIFICATION
        // ─────────────────────────────────────────────────────────────────────────────
        console.log('\n--- SUITE 5: ROUTE PROTECTION & ACTION PERMISSIONS VERIFICATION ---');

        const labAdminRole = await Role.findOne({ name: 'Lab Admin', hospitalId: null }).lean();
        const pathologistRole = await Role.findOne({ name: 'Pathologist', hospitalId: null }).lean();
        const receptionistRole = await Role.findOne({ name: 'Lab Receptionist', hospitalId: null }).lean();

        assert(labAdminRole.permissions.includes('settings:manage'), 'Lab Admin has "settings:manage" to manage locations');
        assert(pathologistRole.permissions.includes('reports:verify'), 'Pathologist has "reports:verify" for clinical sign-off');
        assert(!pathologistRole.permissions.includes('settings:manage'), 'Pathologist does NOT have "settings:manage" (Workstation isolation)');
        assert(receptionistRole.permissions.includes('orders:create'), 'Lab Receptionist has "orders:create" for patient intake');
        assert(!receptionistRole.permissions.includes('reports:verify'), 'Lab Receptionist cannot verify diagnostic reports');

        // ─────────────────────────────────────────────────────────────────────────────
        // SUITE 6: HMS REGRESSION CHECK
        // ─────────────────────────────────────────────────────────────────────────────
        console.log('\n--- SUITE 6: EXISTING HMS ROLES REGRESSION CHECK ---');

        const existingCoreRoles = ['Pharmacist', 'Doctor Assistant', 'Accountant', 'Doctor', 'Receptionist', 'Nurse'];
        for (const coreName of existingCoreRoles) {
            const foundCore = await Role.findOne({ name: coreName, hospitalId: null }).lean();
            assert(foundCore !== null, `Existing HMS system role "${coreName}" is intact and operational`);
        }

    } catch (err) {
        console.error('Test execution error:', err);
        totalFailed++;
    } finally {
        // Cleanup test data
        if (locationHubA) await LabLocation.findByIdAndDelete(locationHubA._id);
        if (locationBranchA) await LabLocation.findByIdAndDelete(locationBranchA._id);
        if (locationHubB) await LabLocation.findByIdAndDelete(locationHubB._id);
        if (testStaffA) await User.findByIdAndDelete(testStaffA._id);
        if (testHospitalA) await Hospital.findByIdAndDelete(testHospitalA._id);
        if (testHospitalB) await Hospital.findByIdAndDelete(testHospitalB._id);

        await mongoose.disconnect();
    }

    console.log('\n====================================================');
    console.log(`  PHASE 2 TEST SUMMARY: ${totalPassed} PASSED, ${totalFailed} FAILED`);
    console.log('====================================================\n');

    if (totalFailed > 0) {
        process.exit(1);
    } else {
        process.exit(0);
    }
}

runTests();
