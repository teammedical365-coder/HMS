'use strict';
const abhaService = require('./abha.service');

// Tenant-scoped users: hospital ALWAYS comes from the verified token.
// Only platform admins may pass a hospital explicitly.
function effectiveHospitalId(req) {
    if (req.user && req.user.hospitalId) return String(req.user.hospitalId);
    if (req.user && (req.user.role === 'superadmin' || req.user.role === 'centraladmin')) {
        return req.headers['x-hospital-id'] || (req.body && req.body.hospitalId) || (req.query && req.query.hospitalId) || null;
    }
    return null;
}

const send = (res, fn) => async (req, res2) => {
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
