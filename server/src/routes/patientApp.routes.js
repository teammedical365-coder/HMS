/**
 * patientApp.routes.js — patient mobile/PWA app API.
 *
 * Auth flow (runs on CLOUD):
 *   POST /api/patient-app/auth/request-otp   { phone, clinicId }
 *   POST /api/patient-app/auth/verify-otp    { phone, clinicId, otp }
 *   POST /api/patient-app/auth/logout
 *
 * Data routes — work in TWO modes:
 *   1. If clinic has tunnel connected → forward to LOCAL server in real-time
 *   2. If clinic offline              → serve synced copies from cloud DB
 *
 *   GET  /api/patient-app/:clinicId/me
 *   GET  /api/patient-app/:clinicId/queue
 *   GET  /api/patient-app/:clinicId/prescriptions
 *   GET  /api/patient-app/:clinicId/bills
 *   POST /api/patient-app/:clinicId/book
 */

const express  = require('express');
const jwt      = require('jsonwebtoken');
const mongoose = require('mongoose');
const router   = express.Router();

const PatientSession = require('../models/patientSession.model');
const SyncedRecord   = require('../models/syncedRecord.model');
const Hospital       = require('../models/hospital.model');
const { sendOTP, hashOTP, verifyOTP } = require('../utils/otpService');

const JWT_SECRET  = process.env.JWT_SECRET;
const JWT_EXPIRES = process.env.PATIENT_JWT_EXPIRES_IN || '8h';

// ─── Patient JWT middleware ───────────────────────────────────────────────────

const verifyPatientToken = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, message: 'Login required' });
    }
    try {
        const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
        if (decoded.sub !== 'patient') {
            return res.status(403).json({ success: false, message: 'Not a patient token' });
        }
        req.patient = decoded;   // { sub, phone, clinicId, patientId, jti }
        next();
    } catch {
        res.status(401).json({ success: false, message: 'Session expired. Please login again.' });
    }
};

// ─── POST /auth/request-otp ───────────────────────────────────────────────────
router.post('/auth/request-otp', async (req, res) => {
    try {
        const { phone, clinicId } = req.body;
        if (!phone || phone.replace(/\D/g, '').length !== 10) {
            return res.status(400).json({ success: false, message: 'Valid 10-digit phone number required' });
        }

        const cleanPhone = phone.replace(/\D/g, '');

        // Rate limit: max 3 OTP requests per 10 minutes
        const recentSession = await PatientSession.findOne({
            phone: cleanPhone,
            updatedAt: { $gte: new Date(Date.now() - 10 * 60 * 1000) },
        });

        if (recentSession && recentSession.otpAttempts >= 3) {
            return res.status(429).json({
                success: false,
                message: 'Too many OTP requests. Please wait 10 minutes.',
            });
        }

        // Send OTP
        const { otp } = await sendOTP(cleanPhone);
        const hashedOtp = await hashOTP(otp);

        // Upsert session
        await PatientSession.findOneAndUpdate(
            { phone: cleanPhone },
            {
                $set: {
                    phone:        cleanPhone,
                    clinicId:     clinicId ? new mongoose.Types.ObjectId(clinicId) : null,
                    otp:          hashedOtp,
                    otpExpiresAt: new Date(Date.now() + 10 * 60 * 1000),  // 10 min
                    isVerified:   false,
                },
                $inc: { otpAttempts: 1 },
            },
            { upsert: true, new: true }
        );

        res.json({ success: true, message: 'OTP sent to your phone number' });
    } catch (err) {
        console.error('[PatientApp] OTP send error:', err.message);
        res.status(500).json({ success: false, message: 'Failed to send OTP. Please try again.' });
    }
});

// ─── POST /auth/verify-otp ────────────────────────────────────────────────────
router.post('/auth/verify-otp', async (req, res) => {
    try {
        const { phone, otp, clinicId } = req.body;
        if (!phone || !otp) {
            return res.status(400).json({ success: false, message: 'Phone and OTP required' });
        }

        const cleanPhone = phone.replace(/\D/g, '');
        const session = await PatientSession.findOne({ phone: cleanPhone });

        if (!session || !session.otp) {
            return res.status(400).json({ success: false, message: 'No OTP requested. Please request a new one.' });
        }

        if (new Date() > session.otpExpiresAt) {
            return res.status(400).json({ success: false, message: 'OTP expired. Please request a new one.' });
        }

        const valid = await verifyOTP(otp, session.otp);
        if (!valid) {
            return res.status(400).json({ success: false, message: 'Incorrect OTP' });
        }

        // Generate JWT
        const jti = require('crypto').randomUUID();
        const effectiveClinicId = clinicId || session.clinicId?.toString();

        const token = jwt.sign(
            {
                sub:      'patient',
                phone:    cleanPhone,
                clinicId: effectiveClinicId,
                patientId: session.patientId?.toString() || null,
                jti,
            },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES }
        );

        // Mark verified, clear OTP, store session
        await PatientSession.findByIdAndUpdate(session._id, {
            $set: {
                isVerified:   true,
                otp:          null,
                otpExpiresAt: null,
                otpAttempts:  0,
            },
            $push: {
                activeSessions: {
                    jti,
                    issuedAt:   new Date(),
                    expiresAt:  new Date(Date.now() + 8 * 60 * 60 * 1000),
                    deviceInfo: req.headers['user-agent'] || '',
                },
            },
        });

        res.json({
            success: true,
            token,
            patient: { phone: cleanPhone, clinicId: effectiveClinicId },
        });
    } catch (err) {
        console.error('[PatientApp] OTP verify error:', err.message);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── POST /auth/logout ────────────────────────────────────────────────────────
router.post('/auth/logout', verifyPatientToken, async (req, res) => {
    try {
        // Revoke this session's JTI
        await PatientSession.findOneAndUpdate(
            { phone: req.patient.phone },
            { $pull: { activeSessions: { jti: req.patient.jti } } }
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── Data routes helper — try tunnel first, fall back to synced copies ─────────

const tunnelOrFallback = async (req, res, localPath, fallback) => {
    const tunnelServer = require('../utils/tunnelServer');
    const { clinicId } = req.params;

    if (tunnelServer.isClinicOnline(clinicId)) {
        try {
            const result = await tunnelServer.forward(
                clinicId,
                'GET',
                localPath,
                { authorization: req.headers.authorization || '' },
                null
            );
            return res.status(result.status).json(result.body);
        } catch (err) {
            console.warn('[PatientApp] Tunnel forward failed, falling back to synced data:', err.message);
        }
    }

    // Clinic offline — serve from synced cloud data
    return fallback();
};

// ─── GET /:clinicId/prescriptions ─────────────────────────────────────────────
router.get('/:clinicId/prescriptions', verifyPatientToken, async (req, res) => {
    await tunnelOrFallback(
        req, res,
        `/api/patient-local/prescriptions?phone=${req.patient.phone}`,
        async () => {
            const records = await SyncedRecord.find({
                clinicId:     new mongoose.Types.ObjectId(req.params.clinicId),
                patientPhone: req.patient.phone,
                type:         'prescription',
            }).sort({ syncedAt: -1 }).limit(50).lean();

            res.json({
                success: true,
                prescriptions: records.map(r => ({ ...r.data, _id: r.localId, syncedAt: r.syncedAt })),
                source: 'cloud-cache',
            });
        }
    );
});

// ─── GET /:clinicId/bills ──────────────────────────────────────────────────────
router.get('/:clinicId/bills', verifyPatientToken, async (req, res) => {
    await tunnelOrFallback(
        req, res,
        `/api/patient-local/bills?phone=${req.patient.phone}`,
        async () => {
            const records = await SyncedRecord.find({
                clinicId:     new mongoose.Types.ObjectId(req.params.clinicId),
                patientPhone: req.patient.phone,
                type:         'bill',
            }).sort({ syncedAt: -1 }).limit(50).lean();

            res.json({
                success: true,
                bills: records.map(r => ({ ...r.data, _id: r.localId, syncedAt: r.syncedAt })),
                source: 'cloud-cache',
            });
        }
    );
});

// ─── GET /:clinicId/queue — LIVE only (tunnel required) ───────────────────────
router.get('/:clinicId/queue', verifyPatientToken, async (req, res) => {
    const tunnelServer = require('../utils/tunnelServer');
    const { clinicId } = req.params;

    if (!tunnelServer.isClinicOnline(clinicId)) {
        return res.json({
            success: true,
            offline: true,
            message: 'Clinic is offline. Queue information unavailable.',
        });
    }

    try {
        const result = await tunnelServer.forward(
            clinicId, 'GET',
            `/api/patient-local/queue?phone=${req.patient.phone}`,
            { authorization: req.headers.authorization || '' },
            null
        );
        res.status(result.status).json(result.body);
    } catch (err) {
        res.status(504).json({ success: false, message: 'Could not reach clinic server' });
    }
});

// ─── GET /:clinicId/me — patient profile ──────────────────────────────────────
router.get('/:clinicId/me', verifyPatientToken, async (req, res) => {
    await tunnelOrFallback(
        req, res,
        `/api/patient-local/me?phone=${req.patient.phone}`,
        async () => {
            // Offline fallback — return basic profile from JWT
            res.json({
                success: true,
                patient: { phone: req.patient.phone },
                source: 'jwt',
            });
        }
    );
});

// ─── POST /:clinicId/book — book appointment ──────────────────────────────────
router.post('/:clinicId/book', verifyPatientToken, async (req, res) => {
    const tunnelServer = require('../utils/tunnelServer');
    const { clinicId } = req.params;

    if (!tunnelServer.isClinicOnline(clinicId)) {
        return res.status(503).json({
            success: false,
            message: 'Clinic is currently offline. Please call the clinic to book.',
            offline: true,
        });
    }

    try {
        const result = await tunnelServer.forward(
            clinicId, 'POST',
            '/api/patient-local/book',
            { authorization: req.headers.authorization || '', 'content-type': 'application/json' },
            req.body
        );
        res.status(result.status).json(result.body);
    } catch (err) {
        res.status(504).json({ success: false, message: 'Could not reach clinic server' });
    }
});

// ─── GET /:clinicId/status — is clinic online? ────────────────────────────────
router.get('/:clinicId/status', async (req, res) => {
    const tunnelServer = require('../utils/tunnelServer');
    const clinic = await Hospital.findById(req.params.clinicId)
        .select('name localServer isActive').lean();

    if (!clinic) return res.status(404).json({ success: false, message: 'Clinic not found' });

    res.json({
        success: true,
        name:       clinic.name,
        isActive:   clinic.isActive,
        tunnelLive: tunnelServer.isClinicOnline(req.params.clinicId),
        lastSeenAt: clinic.localServer?.lastSeenAt || null,
    });
});

module.exports = router;
