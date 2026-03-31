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

// Permission helper
const checkAccess = (user, legacyRoles = [], requiredPermission = '') => {
    if (user.role === 'superadmin' || user.role === 'centraladmin') return true;
    if (legacyRoles.includes(user.role)) return true;
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
        const appointments = await Appointment.find({})
            .sort({ appointmentDate: -1, appointmentTime: -1 })
            .lean();

        res.json({ success: true, appointments });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error fetching all appointments', error: error.message });
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

        const { Appointment } = getModels(req);
        const appointment = await Appointment.findById(id);
        if (!appointment) return res.status(404).json({ success: false, message: 'Appointment not found' });

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

        appointment.appointmentDate = new Date(reqDateStr);
        appointment.appointmentTime = time;
        if (appointment.status === 'cancelled') appointment.status = 'confirmed';
        await appointment.save();

        res.json({ success: true, message: 'Appointment rescheduled successfully', appointment });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error rescheduling appointment', error: error.message });
    }
});

// Cancel Appointment
router.patch('/reception/cancel/:id', verifyToken, resolveTenant, async (req, res) => {
    try {
        if (!checkAccess(req.user, ['reception', 'admin', 'hospitaladmin'], 'appointment_manage')) {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }
        const { Appointment } = getModels(req);
        const appointment = await Appointment.findByIdAndUpdate(
            req.params.id, { status: 'cancelled' }, { new: true }
        );
        if (!appointment) return res.status(404).json({ success: false, message: 'Appointment not found' });
        res.json({ success: true, message: 'Appointment cancelled', appointment });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error cancelling appointment', error: error.message });
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

        const savedAppointment = await appointment.save();
        res.status(201).json({ success: true, message: 'Appointment booked successfully', appointment: savedAppointment });

    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error creating appointment', error: error.message });
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