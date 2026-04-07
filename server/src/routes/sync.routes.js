/**
 * sync.routes.js — CLOUD SERVER ONLY
 *
 * Receives data pushed from local clinic servers:
 *   POST /api/sync/stats          ← aggregate stats (no PII)
 *   POST /api/sync/prescription   ← read-only prescription copy for patient app
 *   POST /api/sync/bill           ← read-only bill copy for patient app
 *   POST /api/sync/heartbeat      ← clinic online indicator
 *
 * Also exposes the tunnel proxy:
 *   ALL  /api/tunnel/:clinicId/*  ← forwarded to local clinic via WebSocket tunnel
 */

const express   = require('express');
const mongoose  = require('mongoose');
const bcrypt    = require('bcryptjs');
const router    = express.Router();

const Hospital           = require('../models/hospital.model');
const ClinicSubscription = require('../models/clinicSubscription.model');
const SyncLog            = require('../models/syncLog.model');

// ─── Auth middleware for local servers ───────────────────────────────────────
// Local clinic servers send: x-api-key + x-clinic-id headers

const verifyLocalServer = async (req, res, next) => {
    const clinicId = req.headers['x-clinic-id'];
    const apiKey   = req.headers['x-api-key'];

    if (!clinicId || !apiKey) {
        return res.status(401).json({ success: false, message: 'Missing clinic credentials' });
    }

    try {
        const clinic = await Hospital.findById(clinicId).select('clinicApiKey isActive name');
        if (!clinic || !clinic.isActive) {
            return res.status(403).json({ success: false, message: 'Clinic not found or inactive' });
        }

        // Compare against hashed key stored on Hospital document
        const valid = await bcrypt.compare(apiKey, clinic.clinicApiKey || '');
        if (!valid) {
            return res.status(403).json({ success: false, message: 'Invalid API key' });
        }

        req.clinic   = clinic;
        req.clinicId = new mongoose.Types.ObjectId(clinicId);
        next();
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// ─── POST /api/sync/heartbeat ─────────────────────────────────────────────────
router.post('/heartbeat', verifyLocalServer, async (req, res) => {
    try {
        // Update last seen on Hospital record
        await Hospital.findByIdAndUpdate(req.clinicId, {
            $set: {
                'localServer.lastSeenAt':     new Date(),
                'localServer.serverVersion':  req.headers['x-server-version'] || '',
                'localServer.isOnline':       true,
            },
        });
        res.json({ success: true, serverTime: new Date().toISOString() });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── POST /api/sync/stats ─────────────────────────────────────────────────────
router.post('/stats', verifyLocalServer, async (req, res) => {
    try {
        const { month, year, stats, serverVersion } = req.body;
        const { newPatients = 0, totalPatients = 0, totalAppointments = 0, totalRevenue = 0 } = stats || {};

        // Update subscription billing record
        const rate = req.clinic.subscription?.ratePerPatient || 0;
        await ClinicSubscription.findOneAndUpdate(
            { clinicId: req.clinicId, month, year },
            {
                $set: {
                    newPatientCount:   newPatients,
                    totalPatientCount: totalPatients,
                    totalAmount:       newPatients * rate,
                    ratePerPatient:    rate,
                },
            },
            { upsert: true, new: true }
        );

        // Log the sync
        await SyncLog.create({
            clinicId: req.clinicId,
            type: 'stats',
            stats: { newPatients, totalPatients, totalAppointments, totalRevenue, month, year },
            serverVersion: serverVersion || '',
            success: true,
        });

        // Update hospital last-seen
        await Hospital.findByIdAndUpdate(req.clinicId, {
            $set: {
                'localServer.lastSeenAt':    new Date(),
                'localServer.serverVersion': serverVersion || '',
                'localServer.isOnline':      true,
            },
        });

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── POST /api/sync/prescription ──────────────────────────────────────────────
// Stores a lightweight copy of prescription for patient app — no sensitive fields
router.post('/prescription', verifyLocalServer, async (req, res) => {
    try {
        const { appointment } = req.body;
        if (!appointment) return res.status(400).json({ success: false, message: 'No appointment data' });

        // Store in SyncedRecord collection (upsert so re-syncs are idempotent)
        const SyncedRecord = require('../models/syncedRecord.model');
        await SyncedRecord.findOneAndUpdate(
            { clinicId: req.clinicId, localId: appointment._id, type: 'prescription' },
            {
                $set: {
                    clinicId:  req.clinicId,
                    localId:   appointment._id,
                    type:      'prescription',
                    patientPhone: appointment.patientPhone,
                    patientUid:   appointment.patientUid,
                    data: {
                        tokenNumber:  appointment.tokenNumber,
                        serviceName:  appointment.serviceName,
                        diagnosis:    appointment.diagnosis,
                        notes:        appointment.notes,
                        medicines:    appointment.medicines,
                        labTests:     appointment.labTests,
                        appointmentDate: appointment.appointmentDate,
                        patientName:  appointment.patientName,
                    },
                    syncedAt: new Date(),
                },
            },
            { upsert: true, new: true }
        );

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── POST /api/sync/bill ──────────────────────────────────────────────────────
router.post('/bill', verifyLocalServer, async (req, res) => {
    try {
        const { bill } = req.body;
        if (!bill) return res.status(400).json({ success: false, message: 'No bill data' });

        const SyncedRecord = require('../models/syncedRecord.model');
        await SyncedRecord.findOneAndUpdate(
            { clinicId: req.clinicId, localId: bill._id, type: 'bill' },
            {
                $set: {
                    clinicId:  req.clinicId,
                    localId:   bill._id,
                    type:      'bill',
                    patientPhone: bill.patientPhone,
                    patientUid:   bill.patientUid,
                    data: {
                        tokenNumber:     bill.tokenNumber,
                        serviceName:     bill.serviceName,
                        amount:          bill.amount,
                        paymentMethod:   bill.paymentMethod,
                        paymentStatus:   bill.paymentStatus,
                        appointmentDate: bill.appointmentDate,
                        patientName:     bill.patientName,
                    },
                    syncedAt: new Date(),
                },
            },
            { upsert: true, new: true }
        );

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── ALL /api/tunnel/:clinicId/* — Patient app tunnel proxy ──────────────────
// Patient app hits this endpoint → cloud forwards to local clinic via WebSocket tunnel
router.all('/tunnel/:clinicId/*', async (req, res) => {
    const { clinicId } = req.params;
    const tunnelServer = require('../utils/tunnelServer');

    if (!tunnelServer.isClinicOnline(clinicId)) {
        return res.status(503).json({
            success: false,
            message: 'Clinic is currently offline. Please try again later or visit during clinic hours.',
            offline: true,
        });
    }

    // Strip /api/tunnel/:clinicId from path — forward the rest to local server
    const localPath = req.path.replace(`/tunnel/${clinicId}`, '') || '/';
    const query     = Object.keys(req.query).length ? '?' + new URLSearchParams(req.query).toString() : '';

    try {
        const result = await tunnelServer.forward(
            clinicId,
            req.method,
            localPath + query,
            {
                authorization: req.headers.authorization || '',
                'content-type': 'application/json',
                'x-forwarded-for': req.ip,
            },
            req.body
        );

        res.status(result.status).json(result.body);
    } catch (err) {
        res.status(504).json({ success: false, message: err.message });
    }
});

module.exports = router;
