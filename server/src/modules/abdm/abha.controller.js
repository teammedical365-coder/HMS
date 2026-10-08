/**
 * abha.controller.js — Request Handlers for ABDM ABHA Endpoints
 */

const abhaService = require('./abha.service');

function getEffectiveHospitalId(req) {
    // Never trust hospitalId from client body/query for tenant-scoped users
    if (req.user?.hospitalId) {
        return String(req.user.hospitalId);
    }
    // Central Admins / Superadmins can specify hospitalId in header/query if managing across hospitals
    if (req.user?.role === 'centraladmin' || req.user?.role === 'superadmin') {
        return req.headers['x-hospital-id'] || req.body?.hospitalId || req.query?.hospitalId || null;
    }
    return null;
}

exports.getStatus = async (req, res) => {
    try {
        const hospitalId = getEffectiveHospitalId(req);
        const { patientId } = req.params;

        const result = await abhaService.getStatus(hospitalId, patientId);
        return res.json(result);
    } catch (err) {
        const status = err.status || 500;
        return res.status(status).json({
            success: false,
            message: err.message || 'Failed to retrieve ABHA status'
        });
    }
};

exports.startLink = async (req, res) => {
    try {
        const hospitalId = getEffectiveHospitalId(req);
        const { patientId, abhaIdentifier, authMethod } = req.body;

        const result = await abhaService.startLink(hospitalId, patientId, { abhaIdentifier, authMethod });
        if (result.configured === false) {
            return res.status(503).json(result);
        }
        return res.json(result);
    } catch (err) {
        const status = err.status || 500;
        return res.status(status).json({
            success: false,
            message: err.message || 'Failed to start ABHA linking flow'
        });
    }
};

exports.verifyLink = async (req, res) => {
    try {
        const hospitalId = getEffectiveHospitalId(req);
        const { patientId, txnId, otp } = req.body;

        const result = await abhaService.verifyLink(hospitalId, patientId, { txnId, otp });
        if (result.configured === false) {
            return res.status(503).json(result);
        }
        return res.json(result);
    } catch (err) {
        const status = err.status || 500;
        return res.status(status).json({
            success: false,
            message: err.message || 'Failed to verify and link ABHA'
        });
    }
};

exports.startCreate = async (req, res) => {
    try {
        const hospitalId = getEffectiveHospitalId(req);
        const { patientId, aadhaarNumber } = req.body;

        const result = await abhaService.startCreate(hospitalId, patientId, { aadhaarNumber });
        if (result.configured === false) {
            return res.status(503).json(result);
        }
        return res.json(result);
    } catch (err) {
        const status = err.status || 500;
        return res.status(status).json({
            success: false,
            message: err.message || 'Failed to start ABHA creation flow'
        });
    }
};

exports.verifyCreate = async (req, res) => {
    try {
        const hospitalId = getEffectiveHospitalId(req);
        const { patientId, txnId, otp } = req.body;

        const result = await abhaService.verifyCreate(hospitalId, patientId, { txnId, otp });
        if (result.configured === false) {
            return res.status(503).json(result);
        }
        return res.json(result);
    } catch (err) {
        const status = err.status || 500;
        return res.status(status).json({
            success: false,
            message: err.message || 'Failed to verify and create ABHA'
        });
    }
};
