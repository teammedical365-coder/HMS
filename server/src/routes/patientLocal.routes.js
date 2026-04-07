/**
 * patientLocal.routes.js — runs on LOCAL clinic server.
 *
 * These routes are called by the tunnel — a patient's request comes in from
 * the cloud, gets forwarded here, and the real local data is returned.
 *
 * All routes require a valid patient JWT (same secret shared between cloud and local).
 *
 *   GET  /api/patient-local/me
 *   GET  /api/patient-local/queue
 *   GET  /api/patient-local/prescriptions
 *   GET  /api/patient-local/bills
 *   POST /api/patient-local/book
 */

const express   = require('express');
const jwt       = require('jsonwebtoken');
const mongoose  = require('mongoose');
const router    = express.Router();

const ClinicPatient = require('../models/clinicPatient.model');
const Appointment   = require('../models/appointment.model');

const JWT_SECRET = process.env.JWT_SECRET;

// ─── Patient JWT verification (same as cloud side — shared secret) ─────────────
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
        req.patient = decoded;
        next();
    } catch {
        res.status(401).json({ success: false, message: 'Session expired' });
    }
};

const clinicId = () => {
    if (!process.env.CLINIC_ID) return null;
    return new mongoose.Types.ObjectId(process.env.CLINIC_ID);
};

// ─── GET /me — patient profile ────────────────────────────────────────────────
router.get('/me', verifyPatientToken, async (req, res) => {
    try {
        const patient = await ClinicPatient.findOne({
            clinicId: clinicId(),
            phone:    req.patient.phone,
        }).lean();

        if (!patient) {
            return res.json({
                success: true,
                patient: { phone: req.patient.phone, registered: false },
            });
        }

        res.json({ success: true, patient });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── GET /queue — patient's position in today's queue ─────────────────────────
router.get('/queue', verifyPatientToken, async (req, res) => {
    try {
        const patient = await ClinicPatient.findOne({
            clinicId: clinicId(),
            phone:    req.patient.phone,
        }).lean();

        if (!patient) {
            return res.json({ success: true, hasToken: false, message: 'Not registered at this clinic' });
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        // Find patient's token today
        const myAppt = await Appointment.findOne({
            clinicPatientId: patient._id,
            appointmentDate: { $gte: today, $lt: tomorrow },
            status: { $in: ['pending', 'confirmed'] },
        }).lean();

        if (!myAppt) {
            return res.json({ success: true, hasToken: false });
        }

        // Count how many tokens are ahead (lower token number, same status)
        const ahead = await Appointment.countDocuments({
            hospitalId:      clinicId(),
            appointmentDate: { $gte: today, $lt: tomorrow },
            status:          { $in: ['pending', 'confirmed'] },
            tokenNumber:     { $lt: myAppt.tokenNumber },
        });

        // Find the currently-being-served token
        const currentlyServing = await Appointment.findOne({
            hospitalId:      clinicId(),
            appointmentDate: { $gte: today, $lt: tomorrow },
            status:          'in-progress',
        }).sort({ tokenNumber: 1 }).lean();

        res.json({
            success: true,
            hasToken:          true,
            tokenNumber:       myAppt.tokenNumber,
            aheadCount:        ahead,
            currentlyServing:  currentlyServing?.tokenNumber || null,
            estimatedWaitMins: ahead * 10,    // rough estimate: 10 min per patient
            serviceName:       myAppt.serviceName,
            status:            myAppt.status,
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── GET /prescriptions ────────────────────────────────────────────────────────
router.get('/prescriptions', verifyPatientToken, async (req, res) => {
    try {
        const patient = await ClinicPatient.findOne({
            clinicId: clinicId(),
            phone:    req.patient.phone,
        }).lean();

        if (!patient) return res.json({ success: true, prescriptions: [] });

        const appts = await Appointment.find({
            clinicPatientId: patient._id,
            status:          'completed',
            diagnosis:       { $exists: true, $ne: '' },
        })
        .sort({ appointmentDate: -1 })
        .limit(20)
        .lean();

        const prescriptions = appts.map(a => ({
            _id:             a._id,
            tokenNumber:     a.tokenNumber,
            serviceName:     a.serviceName,
            diagnosis:       a.diagnosis,
            notes:           a.notes,
            medicines:       a.medicines || [],
            labTests:        a.labTests || [],
            appointmentDate: a.appointmentDate,
        }));

        res.json({ success: true, prescriptions, source: 'local' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── GET /bills ────────────────────────────────────────────────────────────────
router.get('/bills', verifyPatientToken, async (req, res) => {
    try {
        const patient = await ClinicPatient.findOne({
            clinicId: clinicId(),
            phone:    req.patient.phone,
        }).lean();

        if (!patient) return res.json({ success: true, bills: [] });

        const appts = await Appointment.find({
            clinicPatientId: patient._id,
            paymentStatus:   'Paid',
        })
        .sort({ appointmentDate: -1 })
        .limit(20)
        .lean();

        const bills = appts.map(a => ({
            _id:             a._id,
            tokenNumber:     a.tokenNumber,
            serviceName:     a.serviceName,
            amount:          a.amount,
            paymentMethod:   a.paymentMethod,
            paymentStatus:   a.paymentStatus,
            appointmentDate: a.appointmentDate,
        }));

        res.json({ success: true, bills, source: 'local' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── POST /book — book an appointment ─────────────────────────────────────────
router.post('/book', verifyPatientToken, async (req, res) => {
    try {
        const patient = await ClinicPatient.findOne({
            clinicId: clinicId(),
            phone:    req.patient.phone,
        }).lean();

        if (!patient) {
            return res.status(404).json({
                success: false,
                message: 'You are not registered at this clinic. Please visit in person to register.',
            });
        }

        const { serviceName = 'General Consultation', notes = '' } = req.body;

        // Check for existing token today
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);

        const existing = await Appointment.findOne({
            clinicPatientId: patient._id,
            appointmentDate: { $gte: today, $lt: tomorrow },
            status:          { $in: ['pending', 'confirmed'] },
        });

        if (existing) {
            return res.status(409).json({
                success: false,
                message: `You already have Token #${existing.tokenNumber} for today.`,
                appointment: existing,
            });
        }

        // Assign next token number
        const lastToken = await Appointment.findOne({
            hospitalId:      clinicId(),
            appointmentDate: { $gte: today, $lt: tomorrow },
        }).sort({ tokenNumber: -1 }).lean();

        const tokenNumber = (lastToken?.tokenNumber || 0) + 1;

        const appt = await Appointment.create({
            hospitalId:      clinicId(),
            clinicPatientId: patient._id,
            tokenNumber,
            serviceName,
            notes,
            appointmentDate: new Date(),
            status:          'pending',
            paymentStatus:   'Unpaid',
            amount:          0,
        });

        res.status(201).json({
            success: true,
            appointment: appt,
            message: `Token #${tokenNumber} booked for ${patient.name}`,
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
