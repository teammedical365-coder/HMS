const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth.middleware');
const { resolveTenant } = require('../middleware/tenantMiddleware');
const { getTenantModels } = require('../db/tenantModels');
// Master fallbacks
const MasterAppointment = require('../models/appointment.model');
const MasterUser = require('../models/user.model');
const Doctor = require('../models/doctor.model');
const Hospital = require('../models/hospital.model');
const quotaService = require('../services/appointmentQuota.service');
const { checkPatientDoubleBooking } = require('../utils/appointmentValidator');

// Permission helper
const checkAccess = (user, legacyRoles = [], requiredPermission = '') => {
    if (user.role === 'superadmin' || user.role === 'centraladmin') return true;
    if (legacyRoles.includes(user.role) || (user.role === 'receptionist' && legacyRoles.includes('reception'))) return true;
    const roleData = user._roleData;
    if (roleData?.permissions?.includes('*')) return true;
    if (roleData?.permissions?.includes(requiredPermission)) return true;
    return false;
};

// Helper to get tenant-aware models
const getModels = (req) => {
    if (req.tenantDb) {
        const m = getTenantModels(req.tenantDb);
        return { Appointment: m.Appointment, User: m.User };
    }
    return { Appointment: MasterAppointment, User: MasterUser };
};

// ==========================================
// 1. RECEPTION & ADMIN ROUTES
// ==========================================

// GET All Appointments — scoped to this hospital's tenant DB
router.get('/reception/all', verifyToken, resolveTenant, async (req, res) => {
    try {
        if (!checkAccess(req.user, ['reception', 'admin', 'hospitaladmin'], 'appointment_view_all')) {
            return res.status(403).json({ success: false, message: 'Access denied. Requires Reception or Admin privileges.' });
        }

        const { Appointment } = getModels(req);
        const page  = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(200, parseInt(req.query.limit) || 100);
        const hFilter = req.user.hospitalId ? { hospitalId: req.user.hospitalId } : {};
        const appointments = await Appointment.find(hFilter)
            .sort({ appointmentDate: -1, appointmentTime: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean();

        res.json({ success: true, appointments, page, limit });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error fetching all appointments' });
    }
});

// Reschedule Appointment
router.patch('/reception/reschedule/:id', verifyToken, resolveTenant, async (req, res) => {
    try {
        if (!checkAccess(req.user, ['reception', 'admin', 'hospitaladmin'], 'appointment_manage')) {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        const { id } = req.params;
        const { date, time } = req.body;
        if (!date || !time) return res.status(400).json({ success: false, message: 'Date and time are required' });

        const effectiveHospitalId = req.hospitalId || req.user?.hospitalId;
        const isCentral = req.user?.role === 'centraladmin' || req.user?.role === 'superadmin';

        const { Appointment } = getModels(req);
        let appointment = await Appointment.findById(id);
        if (!appointment && MasterAppointment !== Appointment) {
            const masterAppt = await MasterAppointment.findById(id);
            if (masterAppt) {
                if (!isCentral && effectiveHospitalId && masterAppt.hospitalId && String(masterAppt.hospitalId) !== String(effectiveHospitalId)) {
                    return res.status(403).json({ success: false, message: 'Access denied: Appointment belongs to another hospital facility' });
                }
                appointment = masterAppt;
            }
        }
        if (!appointment) return res.status(404).json({ success: false, message: 'Appointment not found' });

        // Security Control (FINDING-06): Verify tenant boundary
        if (!isCentral && effectiveHospitalId && appointment.hospitalId && String(appointment.hospitalId) !== String(effectiveHospitalId)) {
            return res.status(403).json({ success: false, message: 'Access denied: Appointment belongs to another hospital facility' });
        }

        const today = new Date();
        const reqDate = new Date(date);
        const todayStr = today.toISOString().split('T')[0];
        const reqDateStr = reqDate.toISOString().split('T')[0];

        if (reqDateStr < todayStr) {
            return res.status(400).json({ success: false, message: 'Cannot reschedule to the past.' });
        }

        const doctorDoc = await Doctor.findById(appointment.doctorId);
        if (doctorDoc) {
            const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
            const dayName = days[reqDate.getDay()];
            if (doctorDoc.availability?.[dayName]) {
                const daySchedule = doctorDoc.availability[dayName];
                if (!daySchedule.available) {
                    return res.status(400).json({ success: false, message: `Doctor is not available on ${dayName}s.` });
                }
            }
            const existingAppointment = await Appointment.findOne({
                doctorId: doctorDoc._id,
                appointmentDate: new Date(reqDateStr),
                appointmentTime: time,
                status: { $ne: 'cancelled' },
                _id: { $ne: id }
            });
            if (existingAppointment) {
                return res.status(400).json({ success: false, message: 'This slot is already booked.' });
            }
        }

        const patientConflict = await checkPatientDoubleBooking({
            userId: appointment.userId,
            patientId: appointment.patientId,
            date: reqDateStr,
            time,
            excludeAppointmentId: appointment._id
        });
        if (patientConflict && patientConflict.conflict) {
            return res.status(400).json({ success: false, message: patientConflict.message });
        }

        // Atomic Daily Appointment Quota check & reservation for rescheduling
        const quotaResched = await quotaService.rescheduleAppointmentSlot({
            hospitalId: appointment.hospitalId || effectiveHospitalId,
            doctorId: appointment.doctorId,
            oldDate: appointment.appointmentDate,
            newDate: reqDateStr,
            AppointmentModel: Appointment
        });
        if (!quotaResched.allowed) {
            return res.status(403).json({ success: false, message: quotaResched.message });
        }

        appointment.appointmentDate = new Date(reqDateStr);
        appointment.appointmentTime = time;
        if (appointment.status === 'cancelled') appointment.status = 'confirmed';
        await appointment.save();

        if (MasterAppointment !== Appointment) {
            await MasterAppointment.findByIdAndUpdate(id, {
                appointmentDate: new Date(reqDateStr),
                appointmentTime: time,
                status: appointment.status
            });
        }

        res.json({ success: true, message: 'Appointment rescheduled successfully', appointment });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error rescheduling appointment' });
    }
});

// Cancel Appointment (FINDING-06 Remediation)
router.patch('/reception/cancel/:id', verifyToken, resolveTenant, async (req, res) => {
    try {
        if (!checkAccess(req.user, ['reception', 'admin', 'hospitaladmin'], 'appointment_manage')) {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        const effectiveHospitalId = req.hospitalId || req.user?.hospitalId;
        const isCentral = req.user?.role === 'centraladmin' || req.user?.role === 'superadmin';

        const { Appointment } = getModels(req);
        let appointment = await Appointment.findById(req.params.id);
        if (!appointment && MasterAppointment !== Appointment) {
            const masterAppt = await MasterAppointment.findById(req.params.id);
            if (masterAppt) {
                if (!isCentral && effectiveHospitalId && masterAppt.hospitalId && String(masterAppt.hospitalId) !== String(effectiveHospitalId)) {
                    return res.status(403).json({ success: false, message: 'Access denied: Appointment belongs to another hospital facility' });
                }
                appointment = masterAppt;
            }
        }
        if (!appointment) return res.status(404).json({ success: false, message: 'Appointment not found' });

        // Security Control (FINDING-06): Verify tenant boundary
        if (!isCentral && effectiveHospitalId && appointment.hospitalId && String(appointment.hospitalId) !== String(effectiveHospitalId)) {
            return res.status(403).json({ success: false, message: 'Access denied: Appointment belongs to another hospital facility' });
        }

        // Prevent duplicate quota release on already cancelled appointments
        if (appointment.status === 'cancelled') {
            return res.json({ success: true, message: 'Appointment already cancelled', appointment });
        }

        appointment.status = 'cancelled';
        await appointment.save();

        if (MasterAppointment !== Appointment) {
            await MasterAppointment.findByIdAndUpdate(req.params.id, { status: 'cancelled' });
        }

        // Release daily quota slot
        await quotaService.releaseAppointmentSlot({
            hospitalId: appointment.hospitalId || effectiveHospitalId,
            doctorId: appointment.doctorId,
            appointmentDate: appointment.appointmentDate
        });

        res.json({ success: true, message: 'Appointment cancelled', appointment });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error cancelling appointment' });
    }
});

// ==========================================
// 2. GENERAL APPOINTMENT ROUTES
// ==========================================

// Create Appointment — saved to tenant DB
router.post('/create', verifyToken, resolveTenant, async (req, res) => {
    try {
        const {
            doctorId, serviceId, serviceName, appointmentDate, appointmentTime, amount,
            notes, doctorNotes, symptoms, diagnosis, prescriptionDescription, pharmacy, labTests, dietPlan
        } = req.body;

        const userId = req.user._id || req.user.userId;
        if (!doctorId || !appointmentDate) {
            return res.status(400).json({ success: false, message: 'Missing required fields (doctorId or date)' });
        }

        const { User, Appointment } = getModels(req);
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        let doctorDoc = await Doctor.findOne({
            $or: [
                { _id: (doctorId.match(/^[0-9a-fA-F]{24}$/) ? doctorId : null) },
                { userId: (doctorId.match(/^[0-9a-fA-F]{24}$/) ? doctorId : null) },
                { doctorId: doctorId }
            ]
        });
        if (!doctorDoc) return res.status(400).json({ success: false, message: 'Doctor not found.' });

        const today = new Date();
        const reqDate = new Date(appointmentDate);
        const reqDateStr = reqDate.toISOString().split('T')[0];
        const todayStr = today.toISOString().split('T')[0];

        if (reqDateStr < todayStr) {
            return res.status(400).json({ success: false, message: 'Cannot book appointments in the past.' });
        }

        // Determine appointment mode for this hospital
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const hospital = hospitalId ? await Hospital.findById(hospitalId).select('appointmentMode') : null;
        const isTokenMode = hospital?.appointmentMode === 'token';

        let finalTime = appointmentTime;
        let tokenNumber = null;

        if (isTokenMode) {
            // Token mode: ignore time slot, assign sequential token per doctor per day
            const startOfDay = new Date(reqDateStr);
            startOfDay.setUTCHours(0, 0, 0, 0);
            const endOfDay = new Date(reqDateStr);
            endOfDay.setUTCHours(23, 59, 59, 999);

            const count = await Appointment.countDocuments({
                doctorId: doctorDoc._id,
                appointmentDate: { $gte: startOfDay, $lte: endOfDay },
                status: { $ne: 'cancelled' }
            });
            tokenNumber = count + 1;
            finalTime = `token-${tokenNumber}`;
        } else {
            // Slot mode: time is required and must not be double-booked
            if (!appointmentTime) {
                return res.status(400).json({ success: false, message: 'Appointment time is required for slot-based booking' });
            }
            const existingAppointment = await Appointment.findOne({
                doctorId: doctorDoc._id,
                appointmentDate: new Date(reqDateStr),
                appointmentTime,
                status: { $ne: 'cancelled' }
            });
            if (existingAppointment) {
                return res.status(400).json({ success: false, message: 'This slot is already booked.' });
            }
        }

        const patientConflict = await checkPatientDoubleBooking({
            userId,
            patientId: user?.patientId || user?.mrn,
            date: reqDateStr,
            time: finalTime || appointmentTime
        });
        if (patientConflict && patientConflict.conflict) {
            return res.status(400).json({ success: false, message: patientConflict.message });
        }

        // Atomic Daily Appointment Quota Reservation (Free Doctor OPD Plan)
        const quotaResult = await quotaService.reserveAppointmentSlot({
            hospitalId,
            doctorId: doctorDoc._id,
            appointmentDate: reqDateStr,
            AppointmentModel: Appointment
        });
        if (!quotaResult.allowed) {
            return res.status(403).json({ success: false, message: quotaResult.message });
        }

        const appointment = new Appointment({
            userId,
            patientId: user.patientId,
            hospitalId,
            doctorId: doctorDoc._id,
            doctorName: doctorDoc.name,
            serviceId: serviceId || 'general',
            serviceName: serviceName || 'General Consultation',
            appointmentDate: new Date(reqDateStr),
            appointmentTime: finalTime || '',
            tokenNumber,
            amount: amount || doctorDoc.consultationFee || 500,
            notes: notes || '',
            prescriptionDescription: prescriptionDescription || '',
            doctorNotes: doctorNotes || '',
            symptoms: symptoms || '',
            diagnosis: diagnosis || '',
            pharmacy: pharmacy || [],
            labTests: labTests || [],
            dietPlan: dietPlan || [],
            status: 'pending',
            paymentStatus: 'Pending'
        });

        let savedAppointment;
        try {
            savedAppointment = await appointment.save();
        } catch (saveErr) {
            if (quotaResult.reserved) {
                await quotaService.releaseAppointmentSlot({
                    hospitalId,
                    doctorId: doctorDoc._id,
                    appointmentDate: reqDateStr
                });
            }
            throw saveErr;
        }

        res.status(201).json({ success: true, message: 'Appointment booked successfully', appointment: savedAppointment });

    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error creating appointment' });
    }
});

// Get My Appointments
router.get('/my-appointments', verifyToken, resolveTenant, async (req, res) => {
    try {
        const userId = req.user._id || req.user.userId;
        const { Appointment } = getModels(req);
        const appointments = await Appointment.find({ userId })
            .sort({ appointmentDate: -1 })
            .lean();
        res.status(200).json({ success: true, appointments });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error fetching appointments' });
    }
});

module.exports = router;