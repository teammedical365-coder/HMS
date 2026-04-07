/**
 * syncService.js — runs on LOCAL clinic server only.
 *
 * Two responsibilities:
 *  1. STATS SYNC  — every SYNC_INTERVAL_MS, count local data and push
 *                   aggregate numbers (no PII) to the cloud.
 *  2. EVENT SYNC  — called immediately when a prescription or bill is saved,
 *                   so the patient app can read it via cloud.
 *
 * On cloud (DEPLOYMENT_MODE=cloud) this module does nothing.
 */

const axios = require('axios');

const DEPLOYMENT_MODE = process.env.DEPLOYMENT_MODE || 'cloud';
const CLOUD_URL       = process.env.CLOUD_URL || 'https://medical365.in';
const CLINIC_ID       = process.env.CLINIC_ID || '';
const CLOUD_API_KEY   = process.env.CLOUD_API_KEY || '';
const SYNC_INTERVAL   = parseInt(process.env.SYNC_INTERVAL_MS || '900000', 10);
const SERVER_VERSION  = require('../../package.json').version || '1.0.0';

// Lazy-load models so this file can be required before DB connects
let ClinicPatient, Appointment, SyncLog;
const loadModels = () => {
    if (!ClinicPatient) ClinicPatient = require('../models/clinicPatient.model');
    if (!Appointment)   Appointment   = require('../models/appointment.model');
    if (!SyncLog)       SyncLog       = require('../models/syncLog.model');
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const startOfMonth = () => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
};

const cloudHeaders = () => ({
    'x-api-key':        CLOUD_API_KEY,
    'x-clinic-id':      CLINIC_ID,
    'x-server-version': SERVER_VERSION,
    'Content-Type':     'application/json',
});

// ─── Stats Sync ──────────────────────────────────────────────────────────────

const pushStats = async () => {
    if (DEPLOYMENT_MODE !== 'local') return;
    if (!CLINIC_ID || !CLOUD_API_KEY) {
        console.warn('[Sync] CLINIC_ID or CLOUD_API_KEY not set — skipping stats sync');
        return;
    }

    loadModels();

    try {
        const now   = new Date();
        const month = now.getMonth() + 1;
        const year  = now.getFullYear();
        const since = startOfMonth();

        const mongoose = require('mongoose');
        const cid = new mongoose.Types.ObjectId(CLINIC_ID);

        const [newPatients, totalPatients, totalAppointments, revenueResult] = await Promise.all([
            ClinicPatient.countDocuments({ clinicId: cid, createdAt: { $gte: since } }),
            ClinicPatient.countDocuments({ clinicId: cid, isActive: true }),
            Appointment.countDocuments({
                hospitalId: cid,
                appointmentDate: { $gte: since },
            }),
            Appointment.aggregate([
                {
                    $match: {
                        hospitalId: cid,
                        paymentStatus: 'Paid',
                        appointmentDate: { $gte: since },
                    },
                },
                { $group: { _id: null, total: { $sum: '$amount' } } },
            ]),
        ]);

        const totalRevenue = revenueResult[0]?.total || 0;

        const payload = {
            clinicId: CLINIC_ID,
            month,
            year,
            stats: { newPatients, totalPatients, totalAppointments, totalRevenue },
            serverVersion: SERVER_VERSION,
        };

        await axios.post(`${CLOUD_URL}/api/sync/stats`, payload, {
            headers: cloudHeaders(),
            timeout: 10000,
        });

        // Log success locally
        await SyncLog.create({
            clinicId: cid,
            type: 'stats',
            stats: { newPatients, totalPatients, totalAppointments, totalRevenue, month, year },
            serverVersion: SERVER_VERSION,
            success: true,
        });

        console.log(`[Sync] Stats pushed to cloud — patients: ${newPatients}, revenue: ${totalRevenue}`);
    } catch (err) {
        console.error('[Sync] Stats push failed:', err.message);

        // Log failure — non-fatal, will retry on next interval
        try {
            const mongoose = require('mongoose');
            await SyncLog.create({
                clinicId: new mongoose.Types.ObjectId(CLINIC_ID),
                type: 'stats',
                success: false,
                errorMessage: err.message,
                serverVersion: SERVER_VERSION,
            });
        } catch (_) { /* don't crash on log failure */ }
    }
};

// ─── Event Sync (called directly from route handlers) ─────────────────────────

/**
 * syncPrescription — call this right after a prescription is saved locally.
 * Pushes a read-only copy to cloud so the patient app can fetch it.
 * PII is included here because the patient app needs it — but it goes over
 * HTTPS and is stored in an isolated patient-app collection on cloud.
 */
const syncPrescription = async (appointment) => {
    if (DEPLOYMENT_MODE !== 'local') return;
    if (!CLINIC_ID || !CLOUD_API_KEY) return;

    try {
        await axios.post(`${CLOUD_URL}/api/sync/prescription`, {
            clinicId: CLINIC_ID,
            appointment: {
                _id:          appointment._id,
                tokenNumber:  appointment.tokenNumber,
                serviceName:  appointment.serviceName,
                diagnosis:    appointment.diagnosis,
                notes:        appointment.notes,
                medicines:    appointment.medicines,
                labTests:     appointment.labTests,
                appointmentDate: appointment.appointmentDate,
                patientName:  appointment.clinicPatientId?.name || '',
                patientPhone: appointment.clinicPatientId?.phone || '',
                patientUid:   appointment.clinicPatientId?.patientUid || '',
            },
        }, { headers: cloudHeaders(), timeout: 8000 });

        console.log(`[Sync] Prescription synced for appointment ${appointment._id}`);
    } catch (err) {
        // Non-fatal — patient app will show "data pending sync"
        console.warn('[Sync] Prescription sync failed (will retry on next interval):', err.message);
    }
};

/**
 * syncBill — call this right after a payment is confirmed locally.
 */
const syncBill = async (appointment) => {
    if (DEPLOYMENT_MODE !== 'local') return;
    if (!CLINIC_ID || !CLOUD_API_KEY) return;

    try {
        await axios.post(`${CLOUD_URL}/api/sync/bill`, {
            clinicId: CLINIC_ID,
            bill: {
                _id:           appointment._id,
                tokenNumber:   appointment.tokenNumber,
                serviceName:   appointment.serviceName,
                amount:        appointment.amount,
                paymentMethod: appointment.paymentMethod,
                paymentStatus: appointment.paymentStatus,
                appointmentDate: appointment.appointmentDate,
                patientName:   appointment.clinicPatientId?.name || '',
                patientPhone:  appointment.clinicPatientId?.phone || '',
                patientUid:    appointment.clinicPatientId?.patientUid || '',
            },
        }, { headers: cloudHeaders(), timeout: 8000 });

        console.log(`[Sync] Bill synced for appointment ${appointment._id}`);
    } catch (err) {
        console.warn('[Sync] Bill sync failed:', err.message);
    }
};

// ─── Heartbeat ────────────────────────────────────────────────────────────────

const sendHeartbeat = async () => {
    if (DEPLOYMENT_MODE !== 'local') return;
    if (!CLINIC_ID || !CLOUD_API_KEY) return;

    try {
        await axios.post(`${CLOUD_URL}/api/sync/heartbeat`, {
            clinicId: CLINIC_ID,
            serverVersion: SERVER_VERSION,
            timestamp: new Date().toISOString(),
        }, { headers: cloudHeaders(), timeout: 5000 });
    } catch (_) { /* silent — heartbeat failure is expected when internet is down */ }
};

// ─── Start (called from server.js) ───────────────────────────────────────────

let syncInterval = null;
let heartbeatInterval = null;

const start = () => {
    if (DEPLOYMENT_MODE !== 'local') {
        console.log('[Sync] Running in cloud mode — sync service disabled');
        return;
    }

    if (!CLINIC_ID || !CLOUD_API_KEY) {
        console.warn('[Sync] CLINIC_ID / CLOUD_API_KEY not configured — sync disabled');
        return;
    }

    console.log(`[Sync] Starting sync service → ${CLOUD_URL} (interval: ${SYNC_INTERVAL / 1000}s)`);

    // Push stats immediately on startup, then on interval
    setTimeout(pushStats, 5000);  // 5s delay to let DB connect first
    syncInterval = setInterval(pushStats, SYNC_INTERVAL);

    // Heartbeat every 2 minutes
    heartbeatInterval = setInterval(sendHeartbeat, 2 * 60 * 1000);
};

const stop = () => {
    if (syncInterval)     clearInterval(syncInterval);
    if (heartbeatInterval) clearInterval(heartbeatInterval);
};

module.exports = { start, stop, pushStats, syncPrescription, syncBill };
