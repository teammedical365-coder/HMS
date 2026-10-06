/**
 * demoConfig.js — Configuration and Server-Side Identification for Medical365 Demo Tenant
 * 
 * Provides centralized, environment-configurable identity for the dedicated
 * Demo Hospital tenant and predefined role-based demo accounts.
 * 
 * All checks are performed strictly server-side.
 */

const mongoose = require('mongoose');

// Hospital / Tenant Identifiers (configurable via environment variables)
const DEMO_HOSPITAL_ID = process.env.DEMO_HOSPITAL_ID || '660000000000000000000001';
const DEMO_HOSPITAL_CODE = process.env.DEMO_HOSPITAL_CODE || 'DEMO_HOSPITAL';
const DEMO_HOSPITAL_SLUG = (process.env.DEMO_HOSPITAL_SLUG || 'demo').toLowerCase().trim();
const DEMO_HOSPITAL_NAME = process.env.DEMO_HOSPITAL_NAME || 'Medical365 Demo Hospital';

// Predefined Demo User Credentials (configurable via environment variables)
const DEMO_ADMIN_EMAIL = (process.env.DEMO_ADMIN_EMAIL || 'admin@demo.com').toLowerCase().trim();
const DEMO_ADMIN_PASSWORD = process.env.DEMO_ADMIN_PASSWORD || 'admin@123';

const DEMO_RECEPTION_EMAIL = (process.env.DEMO_RECEPTION_EMAIL || 'reception@demo.com').toLowerCase().trim();
const DEMO_RECEPTION_PASSWORD = process.env.DEMO_RECEPTION_PASSWORD || 'reception@123';

const DEMO_DOCTOR_EMAIL = (process.env.DEMO_DOCTOR_EMAIL || 'doctor@demo.com').toLowerCase().trim();
const DEMO_DOCTOR_PASSWORD = process.env.DEMO_DOCTOR_PASSWORD || 'doctor@123';

const DEMO_NURSE_EMAIL = (process.env.DEMO_NURSE_EMAIL || 'nurse@demo.com').toLowerCase().trim();
const DEMO_NURSE_PASSWORD = process.env.DEMO_NURSE_PASSWORD || 'nurse@123';

const DEMO_ACCOUNTANT_EMAIL = (process.env.DEMO_ACCOUNTANT_EMAIL || 'accountant@demo.com').toLowerCase().trim();
const DEMO_ACCOUNTANT_PASSWORD = process.env.DEMO_ACCOUNTANT_PASSWORD || 'accountant@123';

// Central / Legacy Demo Account
const DEMO_EMAIL = (process.env.DEMO_EMAIL || 'demo@medical365.com').toLowerCase().trim();
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || 'Demo@12345';

/**
 * Predefined Demo Users Specification
 */
const PREDEFINED_DEMO_USERS = [
    {
        key: 'ADMIN',
        email: DEMO_ADMIN_EMAIL,
        password: DEMO_ADMIN_PASSWORD,
        name: 'Demo Hospital Administrator',
        roleType: 'hospitaladmin',
        roleName: 'hospitaladmin',
        dashboardPath: '/hospitaladmin',
        phone: '9000000001'
    },
    {
        key: 'RECEPTION',
        email: DEMO_RECEPTION_EMAIL,
        password: DEMO_RECEPTION_PASSWORD,
        name: 'Demo Receptionist',
        roleType: 'Receptionist',
        roleName: 'Receptionist',
        dashboardPath: '/reception/dashboard',
        phone: '9000000002'
    },
    {
        key: 'DOCTOR',
        email: DEMO_DOCTOR_EMAIL,
        password: DEMO_DOCTOR_PASSWORD,
        name: 'Dr. Demo Physician',
        roleType: 'Doctor',
        roleName: 'Doctor',
        dashboardPath: '/doctor/patients',
        phone: '9000000003',
        specialty: 'General Medicine'
    },
    {
        key: 'NURSE',
        email: DEMO_NURSE_EMAIL,
        password: DEMO_NURSE_PASSWORD,
        name: 'Demo Staff Nurse',
        roleType: 'Nurse',
        roleName: 'Nurse',
        dashboardPath: '/nurse/dashboard',
        phone: '9000000004'
    },
    {
        key: 'ACCOUNTANT',
        email: DEMO_ACCOUNTANT_EMAIL,
        password: DEMO_ACCOUNTANT_PASSWORD,
        name: 'Demo Accountant',
        roleType: 'Accountant',
        roleName: 'Accountant',
        dashboardPath: '/accountant/dashboard',
        phone: '9000000005'
    },
    {
        key: 'LEGACY_DEMO',
        email: DEMO_EMAIL,
        password: DEMO_PASSWORD,
        name: 'Medical365 Demo Admin',
        roleType: 'hospitaladmin',
        roleName: 'hospitaladmin',
        dashboardPath: '/hospitaladmin',
        phone: '9000000000'
    }
];

/**
 * Check if a given hospital ID, code, or slug matches the dedicated demo hospital tenant.
 */
function isDemoHospital(hospitalId) {
    if (!hospitalId) return false;
    const str = String(hospitalId).trim();
    return str === String(DEMO_HOSPITAL_ID) ||
           str.toUpperCase() === DEMO_HOSPITAL_CODE ||
           str.toLowerCase() === DEMO_HOSPITAL_SLUG;
}

/**
 * Resolve any representation of the demo hospital identifier to the canonical ObjectId string.
 */
function resolveDemoHospitalId(hospitalIdentifier) {
    if (isDemoHospital(hospitalIdentifier)) {
        return DEMO_HOSPITAL_ID;
    }
    return hospitalIdentifier;
}

/**
 * Check if a given email is in the server-side predefined demo user allowlist.
 */
function isPredefinedDemoEmail(email) {
    if (!email || typeof email !== 'string') return false;
    const clean = email.toLowerCase().trim();
    return PREDEFINED_DEMO_USERS.some(u => u.email === clean);
}

/**
 * Backward-compatible helper: checks if email belongs to any demo user.
 */
function isDemoAccount(email) {
    return isPredefinedDemoEmail(email);
}

/**
 * Strict server-side verification: Is this user an authorized PREDEFINED Demo User
 * entitled to OTP bypass?
 * 
 * Must satisfy ALL THREE criteria:
 * 1. User belongs to DEMO_HOSPITAL
 * 2. User email is in the server-side predefined allowlist
 * 3. User document in DB has explicit isPredefinedDemo === true
 * 
 * Any new user created inside Demo Hospital (e.g. newstaff@demo.com) will FAIL
 * criteria #2 and #3, and MUST follow the normal authentication / OTP flow.
 */
function isPredefinedDemoUser(user) {
    if (!user || !user.email) return false;
    
    // 1. Must belong to DEMO_HOSPITAL
    if (!isDemoHospital(user.hospitalId)) return false;

    // 2. Must match server-side predefined allowlist
    const cleanEmail = String(user.email).toLowerCase().trim();
    const inAllowlist = PREDEFINED_DEMO_USERS.some(u => u.email === cleanEmail);
    if (!inAllowlist) return false;

    // 3. Must have explicit isPredefinedDemo flag on DB user record
    if (user.isPredefinedDemo !== true && user.isPredefinedDemo !== 'true') {
        return false;
    }

    return true;
}

/**
 * Check if an active request originates from the demo user or demo tenant.
 */
function isDemoRequest(req) {
    if (!req) return false;
    if (req.isDemo || req.user?.isDemo || req.user?.isDemoUser || req.user?.isDemoTenant) return true;
    if (req.user?.email && isPredefinedDemoEmail(req.user.email)) return true;
    if (req.user?.hospitalId && isDemoHospital(req.user.hospitalId)) return true;
    if (req.hospitalId && isDemoHospital(req.hospitalId)) return true;
    return false;
}

module.exports = {
    DEMO_HOSPITAL_ID,
    DEMO_HOSPITAL_CODE,
    DEMO_HOSPITAL_SLUG,
    DEMO_HOSPITAL_NAME,
    DEMO_ADMIN_EMAIL,
    DEMO_ADMIN_PASSWORD,
    DEMO_RECEPTION_EMAIL,
    DEMO_RECEPTION_PASSWORD,
    DEMO_DOCTOR_EMAIL,
    DEMO_DOCTOR_PASSWORD,
    DEMO_NURSE_EMAIL,
    DEMO_NURSE_PASSWORD,
    DEMO_ACCOUNTANT_EMAIL,
    DEMO_ACCOUNTANT_PASSWORD,
    DEMO_EMAIL,
    DEMO_PASSWORD,
    PREDEFINED_DEMO_USERS,
    isDemoHospital,
    resolveDemoHospitalId,
    isPredefinedDemoEmail,
    isPredefinedDemoUser,
    isDemoAccount,
    isDemoRequest
};
