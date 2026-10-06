/**
 * demoConfig.js — Configuration and Server-Side Identification for Medical365 Demo Tenant
 * 
 * Provides centralized, environment-configurable identity for the dedicated
 * demo account and demo hospital/tenant.
 * 
 * All checks are performed strictly server-side.
 */

const mongoose = require('mongoose');

// Default Demo Credentials & Identifiers (configurable via environment variables)
const DEMO_EMAIL = (process.env.DEMO_EMAIL || 'demo@medical365.com').toLowerCase().trim();
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || 'Demo@12345';

// Stable 24-character hexadecimal ObjectId for the demo hospital
const DEMO_HOSPITAL_ID = process.env.DEMO_HOSPITAL_ID || '660000000000000000000001';
const DEMO_HOSPITAL_SLUG = (process.env.DEMO_HOSPITAL_SLUG || 'demo').toLowerCase().trim();
const DEMO_HOSPITAL_NAME = process.env.DEMO_HOSPITAL_NAME || 'Medical365 Demo Hospital';

/**
 * Check if a given email is the designated demo account.
 * Server-side evaluation only — never trusts frontend parameters.
 */
function isDemoAccount(email) {
    if (!email || typeof email !== 'string') return false;
    return email.toLowerCase().trim() === DEMO_EMAIL;
}

/**
 * Check if a given hospital ID matches the dedicated demo hospital tenant.
 */
function isDemoHospital(hospitalId) {
    if (!hospitalId) return false;
    return String(hospitalId) === String(DEMO_HOSPITAL_ID);
}

/**
 * Check if an active request originates from the demo user or demo tenant.
 */
function isDemoRequest(req) {
    if (!req) return false;
    if (req.isDemo || req.user?.isDemo || req.user?.isDemoUser) return true;
    if (req.user?.email && isDemoAccount(req.user.email)) return true;
    if (req.user?.hospitalId && isDemoHospital(req.user.hospitalId)) return true;
    if (req.hospitalId && isDemoHospital(req.hospitalId)) return true;
    return false;
}

module.exports = {
    DEMO_EMAIL,
    DEMO_PASSWORD,
    DEMO_HOSPITAL_ID,
    DEMO_HOSPITAL_SLUG,
    DEMO_HOSPITAL_NAME,
    isDemoAccount,
    isDemoHospital,
    isDemoRequest
};
