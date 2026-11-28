'use strict';
const mongoose = require('mongoose');
const abhaService = require('./abha.service');
const PatientAuth = require('../../models/patientAuth.model');

const DENIED_ROLE_COMPACTS = new Set([
    'accountant', 'pharmacist', 'pharmacy', 'lab', 'labadmin', 'labmanager',
    'labreceptionist', 'labtechnician', 'technician', 'pathologist',
    'phlebotomist', 'samplecollector', 'samplecollection', 'labaccountant',
    'cashier', 'billing', 'otmanager', 'otstaff', 'doctorassistant', 'assistant', 'clinicalassistant'
]);

const ALLOWED_STAFF_ROLE_COMPACTS = new Set([
    'hospitaladmin', 'doctor', 'clinicdoctor', 'resident', 'residentdoctor',
    'reception', 'receptionist', 'nurse', 'staffnurse', 'headnurse'
]);

const CUSTOM_ABHA_PERMISSIONS = [
    'abdm_manage', 'abha_manage', 'visit_intake', 'visit_diagnose', 'appointment_manage'
];

function resolveNormalizedRole(user) {
    if (!user) return '';
    return String((user._roleData && user._roleData.name) || user.role || '')
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ' ');
}

function isPlatformAdmin(user) {
    if (!user) return false;
    if (user.isPacificDemo || user.isDemoAccount) return false;
    if (user.hospitalId) return false;
    if (user._roleData && user._roleData.hospitalId) return false;
    const role = resolveNormalizedRole(user);
    return role === 'superadmin' || role === 'centraladmin';
}

function getTargetPatientId(req) {
    return (req.params && req.params.patientId) || (req.body && req.body.patientId) || null;
}

// Tenant-scoped users: hospital ALWAYS comes from the verified token.
// Only verified platform admins without hospital scoping may pass an explicit hospitalId.
function effectiveHospitalId(req) {
    if (req.user && req.user.hospitalId) return String(req.user.hospitalId);
    if (isPlatformAdmin(req.user)) {
        return req.headers['x-hospital-id'] || (req.body && req.body.hospitalId) || (req.query && req.query.hospitalId) || null;
    }
    return null;
}

async function verifyPatientSelfAccess(req, targetPatientId) {
    const authUserId = req.user && (req.user._id || req.user.id || req.user.userId);
    if (!authUserId || !req.user.hospitalId) return false;
    if (String(authUserId) === String(targetPatientId)) return true;

    // For PatientAuth portal accounts that map to a single server-linked clinical profile ID
    const patientAuth = await PatientAuth.findOne({
        _id: authUserId,
        hospitalId: req.user.hospitalId,
        status: 'Active'
    }).select('linkedPatientProfileId').lean();

    if (patientAuth && patientAuth.linkedPatientProfileId &&
        String(patientAuth.linkedPatientProfileId) === String(targetPatientId)) {
        return true;
    }
    return false;
}

exports.authorizeAbhaAccess = async (req, res, next) => {
    try {
        if (!req.user) {
            return res.status(401).json({ success: false, message: 'Authentication required' });
        }

        const role = resolveNormalizedRole(req.user);
        const roleCompact = role.replace(/[\s_]+/g, '');
        const perms = (req.user._roleData && Array.isArray(req.user._roleData.permissions))
            ? req.user._roleData.permissions
            : [];

        const targetPatientId = getTargetPatientId(req);
        if (!targetPatientId || !mongoose.Types.ObjectId.isValid(String(targetPatientId))) {
            return res.status(400).json({ success: false, message: 'Valid patientId is required' });
        }

        // 1. Verified platform admins (must pass explicit target hospital context)
        if (isPlatformAdmin(req.user)) {
            if (!effectiveHospitalId(req)) {
                return res.status(400).json({ success: false, message: 'hospitalId is required for platform admin ABHA access' });
            }
            return next();
        }

        // Reject platform-admin impersonation via hospital-scoped custom role names
        if (role === 'superadmin' || role === 'centraladmin') {
            return res.status(403).json({ success: false, message: 'Invalid tenant role configuration' });
        }

        // 2. Authorized patient self-access only
        if (roleCompact === 'patient') {
            const isOwner = await verifyPatientSelfAccess(req, targetPatientId);
            if (!isOwner) {
                return res.status(403).json({
                    success: false,
                    message: 'Forbidden: Patients can only access their own ABHA profile'
                });
            }
            return next();
        }

        // 3. Explicitly block non-clinical & unrelated departments (accountant, pharmacist, lab, billing, OT, assistant)
        const isExplicitlyDenied =
            DENIED_ROLE_COMPACTS.has(roleCompact) ||
            role.includes('accountant') ||
            role.includes('pharmac') ||
            role.includes('patholog') ||
            role.includes('phlebotom') ||
            role.includes('lab') ||
            role.includes('sample') ||
            role.includes('billing') ||
            role.includes('cashier');

        if (isExplicitlyDenied) {
            return res.status(403).json({
                success: false,
                message: 'Access denied: Your role is not authorized for ABHA operations'
            });
        }

        // Must have a verified hospital/clinic context from JWT/DB (never request body)
        if (!req.user.hospitalId) {
            return res.status(403).json({ success: false, message: 'Hospital or clinic context is required' });
        }

        const isAllowedCoreRole = ALLOWED_STAFF_ROLE_COMPACTS.has(roleCompact);
        const isAllowedAdminRole = roleCompact === 'admin' &&
            (perms.includes('admin_manage_roles') || perms.includes('admin_view_stats'));
        const isAllowedCustomClinicalRole = Boolean(
            req.user._roleData &&
            CUSTOM_ABHA_PERMISSIONS.some((p) => perms.includes(p))
        );

        if (!isAllowedCoreRole && !isAllowedAdminRole && !isAllowedCustomClinicalRole) {
            return res.status(403).json({
                success: false,
                message: 'Access denied: Authorized clinical, reception, or hospital admin role required'
            });
        }

        return next();
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Authorization check failed' });
    }
};

const send = (_unused, fn) => async (req, res2) => {
    try {
        const result = await fn(req);
        if (result && result.configured === false) return res2.status(503).json(result);
        return res2.json(result);
    } catch (err) {
        return res2.status(err.status || 500).json({ success: false, message: err.message || 'ABHA request failed' });
    }
};

exports.getStatus = send(null, (req) => abhaService.getStatus(effectiveHospitalId(req), req.params.patientId));

exports.startLink = send(null, (req) => abhaService.startLink(
    effectiveHospitalId(req), req.body.patientId, req.user._id,
    { abhaIdentifier: req.body.abhaIdentifier, authMethod: req.body.authMethod }));

exports.verifyLink = send(null, (req) => abhaService.verifyLink(
    effectiveHospitalId(req), req.body.patientId, req.user._id,
    { txnId: req.body.txnId, otp: req.body.otp }));

exports.startCreate = send(null, (req) => abhaService.startCreate(
    effectiveHospitalId(req), req.body.patientId, req.user._id,
    { aadhaarNumber: req.body.aadhaarNumber }));

exports.verifyCreate = send(null, (req) => abhaService.verifyCreate(
    effectiveHospitalId(req), req.body.patientId, req.user._id,
    { txnId: req.body.txnId, otp: req.body.otp, mobile: req.body.mobile }));

exports.effectiveHospitalId = effectiveHospitalId;
exports.resolveNormalizedRole = resolveNormalizedRole;
exports.isPlatformAdmin = isPlatformAdmin;
