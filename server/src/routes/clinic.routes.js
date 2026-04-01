/**
 * /api/clinic — Dedicated routes for simple clinics (clinicType = 'clinic')
 * Works for hospitaladmin role without needing Doctor profile documents.
 * All data is scoped to req.user.hospitalId.
 */

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { verifyToken } = require('../middleware/auth.middleware');
const Hospital = require('../models/hospital.model');
const User = require('../models/user.model');
const Appointment = require('../models/appointment.model');
const Inventory = require('../models/inventory.model');
const PharmacyOrder = require('../models/pharmacyOrder.model');

// ─────────────────────────────────────────────
// Middleware: must be hospitaladmin of a clinic
// ─────────────────────────────────────────────
const verifyClinicAdmin = async (req, res, next) => {
    try {
        await verifyToken(req, res, async () => {
            const role = req.user.role;
            if (role !== 'hospitaladmin') {
                return res.status(403).json({ success: false, message: 'Clinic admin access required' });
            }
            if (!req.user.hospitalId) {
                return res.status(403).json({ success: false, message: 'No clinic assigned to your account' });
            }
            next();
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

const hid = (req) => req.user.hospitalId;

// ─────────────────────────────────────────────
// STATS — GET /api/clinic/stats
// ─────────────────────────────────────────────
router.get('/stats', verifyClinicAdmin, async (req, res) => {
    try {
        const hospitalId = hid(req);

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);

        const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

        const [
            totalPatients,
            todayPatients,
            totalAppointments,
            todayAppointments,
            completedAppointments,
            pendingAppointments,
            revenueAgg,
            todayRevenueAgg,
            monthRevenueAgg,
            recentAppointments,
            lowStockItems,
        ] = await Promise.all([
            User.countDocuments({ hospitalId: new mongoose.Types.ObjectId(hospitalId.toString()), patientId: { $exists: true, $ne: null } }),
            User.countDocuments({ hospitalId: new mongoose.Types.ObjectId(hospitalId.toString()), patientId: { $exists: true, $ne: null }, createdAt: { $gte: today } }),
            Appointment.countDocuments({ hospitalId }),
            Appointment.countDocuments({ hospitalId, appointmentDate: { $gte: today, $lte: todayEnd } }),
            Appointment.countDocuments({ hospitalId, status: 'completed' }),
            Appointment.countDocuments({ hospitalId, status: { $in: ['pending', 'confirmed'] } }),
            Appointment.aggregate([
                { $match: { hospitalId: new mongoose.Types.ObjectId(hospitalId), paymentStatus: 'paid' } },
                { $group: { _id: null, total: { $sum: '$amount' } } }
            ]),
            Appointment.aggregate([
                { $match: { hospitalId: new mongoose.Types.ObjectId(hospitalId), paymentStatus: 'paid', appointmentDate: { $gte: today, $lte: todayEnd } } },
                { $group: { _id: null, total: { $sum: '$amount' } } }
            ]),
            Appointment.aggregate([
                { $match: { hospitalId: new mongoose.Types.ObjectId(hospitalId), paymentStatus: 'paid', createdAt: { $gte: firstOfMonth } } },
                { $group: { _id: null, total: { $sum: '$amount' } } }
            ]),
            Appointment.find({ hospitalId })
                .populate('userId', 'name phone patientId')
                .sort({ createdAt: -1 })
                .limit(10)
                .lean(),
            Inventory.find({ hospitalId, stock: { $lt: 10 } }).select('name stock unit').limit(5).lean(),
        ]);

        // Monthly trend (last 6 months)
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        const monthlyTrend = await Appointment.aggregate([
            { $match: { hospitalId: new mongoose.Types.ObjectId(hospitalId), paymentStatus: 'paid', createdAt: { $gte: sixMonthsAgo } } },
            { $group: { _id: { month: { $month: '$createdAt' }, year: { $year: '$createdAt' } }, revenue: { $sum: '$amount' }, count: { $sum: 1 } } },
            { $sort: { '_id.year': 1, '_id.month': 1 } }
        ]);

        res.json({
            success: true,
            stats: {
                totalPatients,
                todayPatients,
                totalAppointments,
                todayAppointments,
                completedAppointments,
                pendingAppointments,
                totalRevenue: revenueAgg[0]?.total || 0,
                todayRevenue: todayRevenueAgg[0]?.total || 0,
                monthRevenue: monthRevenueAgg[0]?.total || 0,
                recentAppointments,
                lowStockItems,
                monthlyTrend,
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─────────────────────────────────────────────
// PATIENTS — GET /api/clinic/patients
// ─────────────────────────────────────────────
router.get('/patients', verifyClinicAdmin, async (req, res) => {
    try {
        const { search } = req.query;
        // Query by patientId existence — all registered clinic patients have a P-xxx ID
        const query = {
            hospitalId: new mongoose.Types.ObjectId(hid(req).toString()),
            patientId: { $exists: true, $nin: [null, ''] },
        };

        if (search && search.trim().length >= 2) {
            const s = search.trim();
            query.$or = [
                { name: { $regex: s, $options: 'i' } },
                { phone: { $regex: s, $options: 'i' } },
                { patientId: { $regex: s, $options: 'i' } },
            ];
        }

        const patients = await User.find(query)
            .select('name phone email patientId dob gender address createdAt')
            .sort({ createdAt: -1 })
            .limit(200)
            .lean();

        res.json({ success: true, patients });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─────────────────────────────────────────────
// REGISTER PATIENT — POST /api/clinic/patients
// ─────────────────────────────────────────────
router.post('/patients', verifyClinicAdmin, async (req, res) => {
    try {
        const { name, phone, email, dob, gender, address } = req.body;
        if (!name || !phone) {
            return res.status(400).json({ success: false, message: 'Name and phone are required' });
        }
        const cleanPhone = phone.replace(/\D/g, '');
        if (cleanPhone.length !== 10) {
            return res.status(400).json({ success: false, message: 'Phone must be exactly 10 digits' });
        }

        const hospitalId = hid(req);

        // Check if already exists in this clinic
        const existing = await User.findOne({ phone: cleanPhone, hospitalId });
        if (existing) {
            return res.status(200).json({ success: true, patient: existing, message: 'Patient already exists — returning existing record', existing: true });
        }

        // Generate patient ID
        const lastPatient = await User.findOne({ hospitalId, patientId: { $exists: true, $ne: null } }).sort({ createdAt: -1 });
        let patientId = 'P-101';
        if (lastPatient?.patientId) {
            const parts = lastPatient.patientId.split('-');
            if (parts.length === 2 && !isNaN(parts[1])) {
                patientId = `P-${parseInt(parts[1]) + 1}`;
            }
        }

        const userData = { name, phone: cleanPhone, hospitalId, role: 'patient', patientId };
        if (email) userData.email = email;
        if (dob) userData.dob = dob;
        if (gender) userData.gender = gender;
        if (address) userData.address = address;

        const patient = new User(userData);
        await patient.save();

        res.status(201).json({ success: true, patient, message: 'Patient registered successfully' });
    } catch (err) {
        if (err.code === 11000) {
            const field = Object.keys(err.keyPattern || {})[0] || 'field';
            return res.status(400).json({ success: false, message: `A patient with this ${field} already exists` });
        }
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─────────────────────────────────────────────
// APPOINTMENTS — GET /api/clinic/appointments
// ─────────────────────────────────────────────
router.get('/appointments', verifyClinicAdmin, async (req, res) => {
    try {
        const { date, status } = req.query;
        const query = { hospitalId: hid(req) };

        if (date) {
            const d = new Date(date);
            d.setHours(0, 0, 0, 0);
            const dEnd = new Date(date);
            dEnd.setHours(23, 59, 59, 999);
            query.appointmentDate = { $gte: d, $lte: dEnd };
        }

        if (status) query.status = status;

        const appointments = await Appointment.find(query)
            .populate('userId', 'name phone patientId')
            .sort({ tokenNumber: 1, createdAt: -1 })
            .lean();

        res.json({ success: true, appointments });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─────────────────────────────────────────────
// BOOK APPOINTMENT (token) — POST /api/clinic/appointments
// No Doctor document needed — uses clinic admin as doctor
// ─────────────────────────────────────────────
router.post('/appointments', verifyClinicAdmin, async (req, res) => {
    try {
        const { patientUserId, patientId, amount, notes, serviceName } = req.body;
        if (!patientUserId) {
            return res.status(400).json({ success: false, message: 'patientUserId is required' });
        }

        const patient = await User.findById(patientUserId);
        if (!patient) return res.status(404).json({ success: false, message: 'Patient not found' });

        const hospitalId = hid(req);

        // Auto-assign next token for today
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);

        const count = await Appointment.countDocuments({
            hospitalId,
            appointmentDate: { $gte: today, $lte: todayEnd },
            status: { $ne: 'cancelled' }
        });
        const tokenNumber = count + 1;

        const appointment = new Appointment({
            userId: patient._id,
            patientId: patient.patientId,
            hospitalId,
            doctorUserId: req.user._id, // clinic admin acts as doctor
            doctorName: req.user.name,
            serviceName: serviceName || 'General Consultation',
            appointmentDate: new Date(),
            appointmentTime: new Date().toTimeString().slice(0, 5),
            tokenNumber,
            status: 'confirmed',
            paymentStatus: 'pending',
            amount: amount || 0,
            notes: notes || '',
            bookedBy: req.user._id,
        });

        await appointment.save();

        res.status(201).json({
            success: true,
            appointment,
            message: `Token #${tokenNumber} assigned to ${patient.name}`
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─────────────────────────────────────────────
// COMPLETE APPOINTMENT — PUT /api/clinic/appointments/:id/complete
// ─────────────────────────────────────────────
router.put('/appointments/:id/complete', verifyClinicAdmin, async (req, res) => {
    try {
        const { diagnosis, notes, medicines, labTests, paymentStatus, amount } = req.body;

        const appt = await Appointment.findOne({ _id: req.params.id, hospitalId: hid(req) });
        if (!appt) return res.status(404).json({ success: false, message: 'Appointment not found' });

        appt.status = 'completed';
        appt.diagnosis = diagnosis || appt.diagnosis;
        appt.doctorNotes = notes || appt.doctorNotes;
        if (medicines && Array.isArray(medicines)) appt.pharmacy = medicines;
        if (labTests && Array.isArray(labTests)) appt.labTests = labTests;
        if (paymentStatus) appt.paymentStatus = paymentStatus;
        if (amount !== undefined) appt.amount = amount;

        await appt.save();

        // Create pharmacy order if medicines prescribed
        if (medicines && medicines.length > 0) {
            await PharmacyOrder.create({
                userId: appt.userId,
                patientId: appt.patientId || appt._id.toString(),
                hospitalId: hid(req),
                appointmentId: appt._id,
                doctorId: req.user._id,
                items: medicines.map(m => ({
                    medicineName: m.name || m.medicineName,
                    frequency: m.dosage || m.frequency,
                    duration: m.duration || '',
                })),
                orderStatus: 'Upcoming',
            });
        }

        res.json({ success: true, appointment: appt, message: 'Appointment completed' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─────────────────────────────────────────────
// PAY APPOINTMENT — PUT /api/clinic/appointments/:id/pay
// ─────────────────────────────────────────────
router.put('/appointments/:id/pay', verifyClinicAdmin, async (req, res) => {
    try {
        const { paymentMethod } = req.body;
        const appt = await Appointment.findOneAndUpdate(
            { _id: req.params.id, hospitalId: hid(req) },
            { paymentStatus: 'paid', paymentMethod: paymentMethod || 'Cash' },
            { new: true }
        );
        if (!appt) return res.status(404).json({ success: false, message: 'Appointment not found' });
        res.json({ success: true, appointment: appt });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─────────────────────────────────────────────
// CANCEL APPOINTMENT — PUT /api/clinic/appointments/:id/cancel
// ─────────────────────────────────────────────
router.put('/appointments/:id/cancel', verifyClinicAdmin, async (req, res) => {
    try {
        const appt = await Appointment.findOneAndUpdate(
            { _id: req.params.id, hospitalId: hid(req) },
            { status: 'cancelled' },
            { new: true }
        );
        if (!appt) return res.status(404).json({ success: false, message: 'Appointment not found' });
        res.json({ success: true, appointment: appt });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─────────────────────────────────────────────
// PATIENT HISTORY — GET /api/clinic/patients/:userId/history
// ─────────────────────────────────────────────
router.get('/patients/:userId/history', verifyClinicAdmin, async (req, res) => {
    try {
        const patient = await User.findOne({ _id: req.params.userId, hospitalId: hid(req) })
            .select('name phone email patientId dob gender address createdAt')
            .lean();
        if (!patient) return res.status(404).json({ success: false, message: 'Patient not found' });

        const appointments = await Appointment.find({ userId: req.params.userId, hospitalId: hid(req) })
            .sort({ appointmentDate: -1 })
            .lean();

        res.json({ success: true, patient, appointments });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─────────────────────────────────────────────
// INVENTORY — GET /api/clinic/inventory
// ─────────────────────────────────────────────
router.get('/inventory', verifyClinicAdmin, async (req, res) => {
    try {
        const inventory = await Inventory.find({ hospitalId: hid(req) }).sort({ name: 1 }).lean();
        res.json({ success: true, inventory });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─────────────────────────────────────────────
// ADD INVENTORY ITEM — POST /api/clinic/inventory
// ─────────────────────────────────────────────
router.post('/inventory', verifyClinicAdmin, async (req, res) => {
    try {
        const { name, category, stock, unit, buyingPrice, sellingPrice, expiryDate } = req.body;
        if (!name) return res.status(400).json({ success: false, message: 'Medicine name required' });
        if (!expiryDate) return res.status(400).json({ success: false, message: 'Expiry date is required' });
        const item = new Inventory({
            hospitalId: hid(req),
            name, category: category || 'General',
            stock: Number(stock) || 0, unit: unit || 'Tablets',
            buyingPrice: Number(buyingPrice) || 0,
            sellingPrice: Number(sellingPrice) || 0,
            expiryDate: new Date(expiryDate),
        });
        await item.save();
        res.status(201).json({ success: true, item });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─────────────────────────────────────────────
// PHARMACY ORDERS — GET /api/clinic/pharmacy-orders
// ─────────────────────────────────────────────
router.get('/pharmacy-orders', verifyClinicAdmin, async (req, res) => {
    try {
        const orders = await PharmacyOrder.find({ hospitalId: hid(req) })
            .populate('userId', 'name patientId')
            .sort({ createdAt: -1 })
            .lean();
        res.json({ success: true, orders });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─────────────────────────────────────────────
// COMPLETE PHARMACY ORDER — PUT /api/clinic/pharmacy-orders/:id/dispense
// ─────────────────────────────────────────────
router.put('/pharmacy-orders/:id/dispense', verifyClinicAdmin, async (req, res) => {
    try {
        const order = await PharmacyOrder.findOneAndUpdate(
            { _id: req.params.id, hospitalId: hid(req) },
            { orderStatus: 'Completed' },
            { new: true }
        );
        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
        res.json({ success: true, order });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
