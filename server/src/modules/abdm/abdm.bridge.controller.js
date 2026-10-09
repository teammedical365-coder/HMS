'use strict';
const svc = require('./abdm.bridge.service');

const fail = (res, err) => res.status(err.status || 500).json({ success: false, message: err.message || 'ABDM bridge request failed' });

exports.getConfig = async (req, res) => { try { res.json(await svc.getBridgeConfig()); } catch (e) { fail(res, e); } };

// The URL is taken ONLY from ABDM_BRIDGE_URL. Any body value is ignored on purpose.
exports.registerUrl = async (req, res) => {
    try {
        res.json(await svc.registerBridgeUrl({ userId: req.user && req.user._id, skipProbe: req.body && req.body.skipProbe === true }));
    } catch (e) { fail(res, e); }
};

exports.verify = async (req, res) => { try { res.json(await svc.verifyServices()); } catch (e) { fail(res, e); } };

exports.probe = async (req, res) => {
    try {
        const url = svc.validateBridgeUrl(require('./abdm.config').bridgeUrl);
        res.json({ success: true, bridgeUrl: url, probe: await svc.probeBridge(url) });
    } catch (e) { fail(res, e); }
};

exports.registerHospital = async (req, res) => {
    try {
        res.json(await svc.registerHospitalHip(req.params.hospitalId, req.body || {}, req.user && req.user._id));
    } catch (e) { fail(res, e); }
};

// Hospital admins may only READ their own hospital's status
exports.ownHospitalStatus = async (req, res) => {
    try {
        if (!req.user || !req.user.hospitalId) return res.status(400).json({ success: false, message: 'No hospital on this account' });
        res.json(await svc.getHospitalStatus(req.user.hospitalId));
    } catch (e) { fail(res, e); }
};
