/**
 * pacificDemoConfig.js — Isolated Server-Side Configuration & Context Guards
 * for ONLY the Pacific Hospital CodeCanyon-style Interactive Demo.
 *
 * Target Domain: https://pacifichospital.medical365.in/
 *
 * SECURITY INVARIANTS:
 * 1. Scoped strictly to Pacific Hospital (`slug: 'pacifichospital'`).
 * 2. Never modifies or bypasses OTP for any other hospital tenant or normal staff account.
 * 3. Validates request origin/host context AND DB tenant `isDemoEnabled` flag AND user `isDemoAccount`.
 * 4. Keeps all external notification/payment suppression strictly isolated to verified Pacific demo sessions.
 */
const { AsyncLocalStorage } = require('async_hooks');
const crypto = require('crypto');

const PACIFIC_DEMO_HOST = (process.env.PACIFIC_DEMO_HOST || 'pacifichospital.medical365.in').toLowerCase().trim();
const PACIFIC_DEMO_SLUG = 'pacifichospital';
const PACIFIC_DEMO_HOSPITAL_ID = process.env.PACIFIC_DEMO_HOSPITAL_ID || '6aaa0637ca3e7fc08c0d1f57';
const PACIFIC_DEMO_JWT_EXPIRES_IN = process.env.PACIFIC_DEMO_JWT_EXPIRES_IN || '2h';
const PACIFIC_DEMO_SESSION_TTL_MS = Number(process.env.PACIFIC_DEMO_SESSION_TTL_MS) || 2 * 60 * 60 * 1000; // 2 hours

// Non-guessable per-deployment demo credential hash input when PACIFIC_DEMO_PASSWORD env is omitted.
// Demo accounts never expose plaintext passwords to frontend code or public API responses.
const getPacificDemoSeedSecret = () => (
    process.env.PACIFIC_DEMO_PASSWORD ||
    crypto.createHmac('sha256', process.env.JWT_SECRET || 'pacific-hospital-demo-secret')
        .update('pacifichospital.medical365.in:demo-seed-v1')
        .digest('hex')
);

// AsyncLocalStorage sandbox flag so downstream notification helpers can detect active demo sessions
const pacificDemoAls = new AsyncLocalStorage();

function isInPacificDemoSandbox() {
    const store = pacificDemoAls.getStore();
    return Boolean(store && store.isPacificDemo === true);
}

/**
 * Fixed 5-Role Definition for Pacific Hospital Demo ONLY.
 */
const PACIFIC_DEMO_ROLES = [
    {
        roleKey: 'hospitaladmin',
        label: 'Hospital Admin',
        subtitle: 'Hospital overview, staff management, billing & settings',
        badge: 'ADMIN',
        email: 'demo.admin@pacifichospital.medical365.in',
        phone: '9000001001',
        userName: 'Vikramjit Grewal (Demo Admin)',
        userRoleField: 'hospitaladmin',
        roleLookupName: null,
        dashboardPath: '/hospitaladmin'
    },
    {
        roleKey: 'doctor',
        label: 'Doctor',
        subtitle: 'OPD consultations, IPD clinical notes, EMR & e-Rx',
        badge: 'DOCTOR',
        email: 'demo.doctor@pacifichospital.medical365.in',
        phone: '9000001002',
        userName: 'Dr. Ananya Deshmukh (Demo)',
        userRoleField: null,
        roleLookupName: 'Doctor',
        dashboardPath: '/doctor/dashboard',
        specialization: 'Internal Medicine'
    },
    {
        roleKey: 'reception',
        label: 'Reception',
        subtitle: 'Patient registration, appointments, OPD tokens & billing',
        badge: 'RECEPTION',
        email: 'demo.reception@pacifichospital.medical365.in',
        phone: '9000001003',
        userName: 'Priya Nair (Demo Reception)',
        userRoleField: null,
        roleLookupName: 'Receptionist',
        dashboardPath: '/reception/dashboard'
    },
    {
        roleKey: 'lab',
        label: 'Lab',
        subtitle: 'Diagnostic orders, sample collection, analyzer & reports',
        badge: 'LAB',
        email: 'demo.lab@pacifichospital.medical365.in',
        phone: '9000001004',
        userName: 'Arjun Verma (Demo Lab Admin)',
        userRoleField: null,
        roleLookupName: 'Lab Admin',
        dashboardPath: '/lab/dashboard'
    },
    {
        roleKey: 'accountant',
        label: 'Accountant',
        subtitle: 'Collections ledger, financial records & refund reviews',
        badge: 'ACCOUNTANT',
        email: 'demo.accountant@pacifichospital.medical365.in',
        phone: '9000001005',
        userName: 'Sneha Kulkarni (Demo Accountant)',
        userRoleField: null,
        roleLookupName: 'Accountant',
        dashboardPath: '/accountant/dashboard'
    }
];

const PACIFIC_ROLE_MAP = new Map(PACIFIC_DEMO_ROLES.map((r) => [r.roleKey, r]));
const PACIFIC_EMAIL_SET = new Set(PACIFIC_DEMO_ROLES.map((r) => r.email));

function getPacificRoleSpec(roleKey) {
    if (!roleKey || typeof roleKey !== 'string') return null;
    return PACIFIC_ROLE_MAP.get(roleKey.toLowerCase().trim()) || null;
}

function isPacificDemoEmail(email) {
    if (!email || typeof email !== 'string') return false;
    return PACIFIC_EMAIL_SET.has(email.toLowerCase().trim());
}

/**
 * Categorize any Medical365 role name into a normalized filter key for Pacific Demo UI.
 */
function categorizePacificRole(roleName) {
    const clean = String(roleName || '').toLowerCase().trim();
    if (!clean) return 'staff';
    if (clean === 'hospitaladmin' || clean === 'hospital admin') return 'hospitaladmin';
    if (clean === 'doctor_assistant' || clean === 'doctor assistant' || clean === 'clinical assistant' || clean.includes('assistant')) return 'staff';
    if (clean === 'doctor' || clean === 'clinic doctor' || clean === 'clinicdoctor' || clean.includes('resident') || clean.includes('doctor')) return 'doctor';
    if (clean === 'reception' || clean === 'receptionist' || clean.includes('reception')) return 'reception';
    if (clean.includes('lab') || clean.includes('pathologist') || clean.includes('phlebotomist') || clean.includes('sample')) return 'lab';
    if (clean === 'accountant' || clean.includes('accountant')) return 'accountant';
    if (clean.includes('pharmac')) return 'pharmacy';
    if (clean.includes('nurse')) return 'nurse';
    if (clean === 'cashier' || clean === 'billing') return 'billing';
    if (clean.startsWith('ot ') || clean === 'otmanager' || clean === 'otstaff') return 'ot';
    return 'staff';
}

/**
 * Resolve the ORIGINAL Medical365 dashboard path for any role name / role document.
 * Matches standard Login.jsx and DashboardLayout.jsx routing exactly.
 */
function resolveOriginalDashboardPath(roleName, roleDocDashboardPath = null) {
    const raw = String(roleName || '').toLowerCase().trim();
    const compact = raw.replace(/\s+/g, '');

    if (compact === 'hospitaladmin') return '/hospitaladmin';
    if (compact === 'otmanager' || compact === 'otstaff') return '/ot/dashboard';
    if (compact.includes('phlebotomist') || compact.includes('samplecollector') || compact.includes('samplecollection')) return '/lab/collection';
    if (compact === 'pathologist') return '/lab/results/verification';
    if (compact === 'labmanager') return '/lab/manager';
    if (compact === 'labtechnician' || compact === 'technician') return '/lab/bench';
    if (compact.includes('lab')) return '/lab/dashboard';
    if (raw === 'doctor_assistant' || raw === 'doctor assistant' || raw === 'clinical assistant' || raw.includes('assistant')) return '/assistant/dashboard';
    if (compact === 'doctor' || compact === 'clinicdoctor' || raw.includes('resident') || (raw.includes('doctor') && !raw.includes('assistant'))) return '/doctor/dashboard';
    if (compact === 'reception' || compact === 'receptionist') return '/reception/dashboard';
    if (raw.includes('pharmac')) return '/pharmacy/inventory';
    if (compact === 'accountant') return '/accountant/dashboard';
    if (compact === 'cashier' || compact === 'billing') return '/cashier/billing';
    if (compact === 'nurse' || compact === 'staffnurse' || compact === 'headnurse') return '/nurse/dashboard';

    return roleDocDashboardPath || '/my-dashboard';
}

/**
 * Parse hostname cleanly from an Origin, Referer, or Host header.
 */
function parseHostname(headerVal) {
    if (!headerVal || typeof headerVal !== 'string') return '';
    const trimmed = headerVal.trim();
    if (!trimmed) return '';
    try {
        if (/^https?:\/\//i.test(trimmed)) {
            return new URL(trimmed).hostname.toLowerCase();
        }
        return trimmed.split('/')[0].split(':')[0].toLowerCase();
    } catch (_) {
        return '';
    }
}

/**
 * Check whether a hostname strictly matches ONLY the Pacific Hospital tenant portal.
 * - Production: ONLY 'pacifichospital.medical365.in'
 * - Non-production (dev/test): 'pacifichospital.medical365.in' OR 'pacifichospital.localhost'
 */
function isAllowedPacificHostname(hostname) {
    if (!hostname) return false;
    const clean = hostname.toLowerCase().trim();
    if (clean === PACIFIC_DEMO_HOST) return true;
    if (process.env.NODE_ENV !== 'production' && clean === 'pacifichospital.localhost') {
        return true;
    }
    return false;
}

/**
 * Verify that the incoming HTTP request originates from Pacific Hospital tenant context.
 * Uses only trusted HTTP transport context (Origin, Referer, Host, resolved req.tenant)
 * NEVER frontend body flags like `isDemo` or client headers like `x-tenant-subdomain`.
 */
function verifyPacificRequestContext(req) {
    if (!req) return { ok: false, reason: 'Missing request object' };

    const originHost = parseHostname(req.headers?.origin);
    const refererHost = parseHostname(req.headers?.referer);
    const httpHost = parseHostname(req.headers?.host);
    const resolvedSlug = req.tenant?.slug ? String(req.tenant.slug).toLowerCase().trim() : '';

    // If a browser sends an explicit Origin or Referer from another site/hospital, reject immediately
    if (originHost && !isAllowedPacificHostname(originHost)) {
        return { ok: false, reason: `Cross-tenant or unauthorized origin rejected: ${originHost}` };
    }
    if (!originHost && refererHost && !isAllowedPacificHostname(refererHost)) {
        return { ok: false, reason: `Cross-tenant or unauthorized referer rejected: ${refererHost}` };
    }

    // If tenantResolver resolved a tenant from Host and it is NOT Pacific Hospital, reject
    if (resolvedSlug && resolvedSlug !== PACIFIC_DEMO_SLUG) {
        return { ok: false, reason: `Unauthorized tenant host resolved: ${resolvedSlug}` };
    }

    const hasValidOrigin = isAllowedPacificHostname(originHost);
    const hasValidReferer = isAllowedPacificHostname(refererHost);
    const hasValidHost = isAllowedPacificHostname(httpHost);
    const hasValidTenant = resolvedSlug === PACIFIC_DEMO_SLUG;

    if (hasValidOrigin || hasValidReferer || hasValidHost || hasValidTenant) {
        return {
            ok: true,
            sourceHost: originHost || refererHost || httpHost || PACIFIC_DEMO_HOST
        };
    }

    return {
        ok: false,
        reason: `Request must originate from ${PACIFIC_DEMO_HOST}`
    };
}

module.exports = {
    PACIFIC_DEMO_HOST,
    PACIFIC_DEMO_SLUG,
    PACIFIC_DEMO_HOSPITAL_ID,
    PACIFIC_DEMO_JWT_EXPIRES_IN,
    PACIFIC_DEMO_SESSION_TTL_MS,
    PACIFIC_DEMO_ROLES,
    pacificDemoAls,
    isInPacificDemoSandbox,
    getPacificDemoSeedSecret,
    getPacificRoleSpec,
    isPacificDemoEmail,
    categorizePacificRole,
    resolveOriginalDashboardPath,
    parseHostname,
    isAllowedPacificHostname,
    verifyPacificRequestContext
};
