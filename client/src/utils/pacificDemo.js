/**
 * pacificDemo.js — Frontend Hostname Guard & Role Metadata Helpers
 * Strictly scoped to Pacific Hospital (`https://pacifichospital.medical365.in/`).
 */

export const PACIFIC_DEMO_HOST = (import.meta.env.VITE_PACIFIC_DEMO_HOST || 'pacifichospital.medical365.in').toLowerCase();

export function isPacificDemoHost() {
    if (typeof window === 'undefined') return false;
    const host = (window.location.hostname || '').toLowerCase().trim();
    if (host === PACIFIC_DEMO_HOST) return true;
    if (import.meta.env.DEV && host === 'pacifichospital.localhost') return true;
    return false;
}

export const PACIFIC_ROLE_FILTERS = [
    { key: 'all', label: 'All' },
    { key: 'hospitaladmin', label: 'Admin' },
    { key: 'doctor', label: 'Doctors' },
    { key: 'reception', label: 'Reception' },
    { key: 'lab', label: 'Lab' },
    { key: 'accountant', label: 'Accountant' },
    { key: 'nurse', label: 'Nurse' },
    { key: 'pharmacy', label: 'Pharmacy' },
    { key: 'other', label: 'Other Staff' }
];

export const PACIFIC_CATEGORY_STYLE = {
    hospitaladmin: { accent: '#0f766e', badge: 'ADMIN' },
    doctor: { accent: '#2563eb', badge: 'DOCTOR' },
    reception: { accent: '#0284c7', badge: 'RECEPTION' },
    lab: { accent: '#7c3aed', badge: 'LAB' },
    accountant: { accent: '#059669', badge: 'ACCOUNTANT' },
    nurse: { accent: '#db2777', badge: 'NURSE' },
    pharmacy: { accent: '#d97706', badge: 'PHARMACY' },
    billing: { accent: '#0891b2', badge: 'BILLING' },
    ot: { accent: '#dc2626', badge: 'OT' },
    staff: { accent: '#475569', badge: 'STAFF' }
};

export function getDemoDashboardPath(roleKeyOrPath, fallbackUserPath) {
    if (fallbackUserPath && String(fallbackUserPath).startsWith('/')) {
        return fallbackUserPath;
    }
    const cleanKey = String(roleKeyOrPath || '').toLowerCase().trim();
    const map = {
        hospitaladmin: '/hospitaladmin',
        doctor: '/doctor/dashboard',
        reception: '/reception/dashboard',
        lab: '/lab/dashboard',
        accountant: '/accountant/dashboard',
        nurse: '/nurse/dashboard',
        pharmacy: '/pharmacy/inventory',
        billing: '/cashier/billing',
        ot: '/ot/dashboard'
    };
    return map[cleanKey] || '/my-dashboard';
}
