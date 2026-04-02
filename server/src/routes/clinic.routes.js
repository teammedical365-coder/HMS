/**
 * /api/clinic — Dedicated routes for simple clinics (clinicType = 'clinic')
 * Uses ClinicPatient model (separate from User/staff).
 * All data is scoped to req.user.hospitalId.
 */

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { verifyToken } = require('../middleware/auth.middleware');
const Hospital = require('../models/hospital.model');
const Appointment = require('../models/appointment.model');
const Inventory = require('../models/inventory.model');
const PharmacyOrder = require('../models/pharmacyOrder.model');
const ClinicPatient = require('../models/clinicPatient.model');
const ClinicSubscription = require('../models/clinicSubscription.model');

// ─────────────────────────────────────────────
// Middleware: must be hospitaladmin of a clinic
// ─────────────────────────────────────────────
const verifyClinicAdmin = async (req, res, next) => {
    try {
        await verifyToken(req, res, async () => {
            if (req.user.role !== 'hospitaladmin') {
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

const hid = (req) => new mongoose.Types.ObjectId(req.user.hospitalId.toString());

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
const todayRange = () => {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const end   = new Date(); end.setHours(23, 59, 59, 999);
    return { start, end };
};

// Get or ensure clinic code (fallback if not set)
const getClinicCode = async (hospitalId) => {
    const clinic = await Hospital.findById(hospitalId).select('clinicCode name');
    if (clinic.clinicCode) return clinic.clinicCode;
    // Auto-generate from name
    const code = clinic.name.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4) || 'CLN';
    await Hospital.findByIdAndUpdate(hospitalId, { clinicCode: code });
    return code;
};

// Upsert subscription record and increment new patient count
const trackNewPatient = async (clinicId) => {
    const now = new Date();
    const month = now.getMonth() + 1;
    const year  = now.getFullYear();
    const clinic = await Hospital.findById(clinicId).select('subscription');
    const rate   = clinic?.subscription?.ratePerPatient || 0;
    const total  = await ClinicPatient.countDocuments({ clinicId });

    await ClinicSubscription.findOneAndUpdate(
        { clinicId, month, year },
        {
            $inc: { newPatientCount: 1 },
            $set: { totalPatientCount: total, ratePerPatient: rate },
        },
        { upsert: true, new: true }
    ).then(sub => {
        sub.totalAmount = sub.newPatientCount * sub.ratePerPatient;
        return sub.save();
    }).catch(() => {}); // non-fatal
};

// ─────────────────────────────────────────────
// STATS — GET /api/clinic/stats
// ─────────────────────────────────────────────
router.get('/stats', verifyClinicAdmin, async (req, res) => {
    try {
        const hospitalId = hid(req);
        const { start: today, end: todayEnd } = todayRange();
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
            ClinicPatient.countDocuments({ clinicId: hospitalId }),
            ClinicPatient.countDocuments({ clinicId: hospitalId, createdAt: { $gte: today } }),
            Appointment.countDocuments({ hospitalId }),
            Appointment.countDocuments({ hospitalId, appointmentDate: { $gte: today, $lte: todayEnd } }),
            Appointment.countDocuments({ hospitalId, status: 'completed' }),
            Appointment.countDocuments({ hospitalId, status: { $in: ['pending', 'confirmed'] } }),
            Appointment.aggregate([
                { $match: { hospitalId, paymentStatus: 'paid' } },
                { $group: { _id: null, total: { $sum: '$amount' } } }
            ]),
            Appointment.aggregate([
                { $match: { hospitalId, paymentStatus: 'paid', appointmentDate: { $gte: today, $lte: todayEnd } } },
                { $group: { _id: null, total: { $sum: '$amount' } } }
            ]),
            Appointment.aggregate([
                { $match: { hospitalId, paymentStatus: 'paid', createdAt: { $gte: firstOfMonth } } },
                { $group: { _id: null, total: { $sum: '$amount' } } }
            ]),
            Appointment.find({ hospitalId })
                .populate('clinicPatientId', 'name phone patientUid')
                .sort({ createdAt: -1 })
                .limit(10)
                .lean(),
            Inventory.find({ hospitalId, stock: { $lt: 10 } }).select('name stock unit').limit(5).lean(),
        ]);

        // Monthly revenue trend (last 6 months)
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        const monthlyTrend = await Appointment.aggregate([
            { $match: { hospitalId, paymentStatus: 'paid', createdAt: { $gte: sixMonthsAgo } } },
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
                totalRevenue:  revenueAgg[0]?.total || 0,
                todayRevenue:  todayRevenueAgg[0]?.total || 0,
                monthRevenue:  monthRevenueAgg[0]?.total || 0,
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
// LIST PATIENTS — GET /api/clinic/patients
// ─────────────────────────────────────────────
router.get('/patients', verifyClinicAdmin, async (req, res) => {
    try {
        const { search } = req.query;
        const query = { clinicId: hid(req), isActive: true };

        if (search && search.trim().length >= 2) {
            const s = search.trim();
            query.$or = [
                { name:       { $regex: s, $options: 'i' } },
                { phone:      { $regex: s, $options: 'i' } },
                { patientUid: { $regex: s, $options: 'i' } },
            ];
        }

        const patients = await ClinicPatient.find(query)
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
        const { name, phone, email, dob, gender, address, bloodGroup, allergies, chronicConditions } = req.body;
        if (!name || !phone) return res.status(400).json({ success: false, message: 'Name and phone are required' });

        const cleanPhone = phone.replace(/\D/g, '');
        if (cleanPhone.length !== 10) return res.status(400).json({ success: false, message: 'Phone must be exactly 10 digits' });

        const clinicId = hid(req);

        // Duplicate check within this clinic
        const existing = await ClinicPatient.findOne({ clinicId, phone: cleanPhone });
        if (existing) {
            return res.status(200).json({ success: true, patient: existing, existing: true, message: `Patient already registered — ${existing.patientUid}` });
        }

        // Clinic-scoped patient UID: e.g. "RAM-001"
        const code  = await getClinicCode(clinicId);
        const count = await ClinicPatient.countDocuments({ clinicId });
        const patientUid = `${code}-${String(count + 1).padStart(3, '0')}`;

        const patient = await ClinicPatient.create({
            clinicId,
            patientUid,
            name: name.trim(),
            phone: cleanPhone,
            email: email || '',
            dob: dob ? new Date(dob) : null,
            gender: gender || 'Male',
            bloodGroup: bloodGroup || '',
            address: address || '',
            allergies: allergies || '',
            chronicConditions: chronicConditions || '',
        });

        // Track in subscription (non-blocking)
        trackNewPatient(clinicId);

        res.status(201).json({ success: true, patient, message: `Patient registered — ${patientUid}` });
    } catch (err) {
        if (err.code === 11000) {
            return res.status(400).json({ success: false, message: 'A patient with this phone already exists in this clinic' });
        }
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─────────────────────────────────────────────
// PATIENT HISTORY — GET /api/clinic/patients/:id/history
// ─────────────────────────────────────────────
router.get('/patients/:id/history', verifyClinicAdmin, async (req, res) => {
    try {
        const patient = await ClinicPatient.findOne({ _id: req.params.id, clinicId: hid(req) }).lean();
        if (!patient) return res.status(404).json({ success: false, message: 'Patient not found' });

        const appointments = await Appointment.find({ clinicPatientId: patient._id, hospitalId: hid(req) })
            .sort({ appointmentDate: -1 })
            .lean();

        res.json({ success: true, patient, appointments });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─────────────────────────────────────────────
// UPDATE PATIENT — PUT /api/clinic/patients/:id
// ─────────────────────────────────────────────
router.put('/patients/:id', verifyClinicAdmin, async (req, res) => {
    try {
        const { name, email, dob, gender, address, bloodGroup, allergies, chronicConditions, medicalNotes } = req.body;
        const patient = await ClinicPatient.findOneAndUpdate(
            { _id: req.params.id, clinicId: hid(req) },
            { name, email, dob, gender, address, bloodGroup, allergies, chronicConditions, medicalNotes },
            { new: true, runValidators: true }
        );
        if (!patient) return res.status(404).json({ success: false, message: 'Patient not found' });
        res.json({ success: true, patient });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─────────────────────────────────────────────
// LIST APPOINTMENTS — GET /api/clinic/appointments
// ─────────────────────────────────────────────
router.get('/appointments', verifyClinicAdmin, async (req, res) => {
    try {
        const { date, status } = req.query;
        const query = { hospitalId: hid(req) };

        if (date) {
            const d = new Date(date); d.setHours(0, 0, 0, 0);
            const e = new Date(date); e.setHours(23, 59, 59, 999);
            query.appointmentDate = { $gte: d, $lte: e };
        }
        if (status) query.status = status;

        const appointments = await Appointment.find(query)
            .populate('clinicPatientId', 'name phone patientUid gender bloodGroup')
            .sort({ tokenNumber: 1, createdAt: -1 })
            .lean();

        res.json({ success: true, appointments });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─────────────────────────────────────────────
// BOOK APPOINTMENT (token) — POST /api/clinic/appointments
// ─────────────────────────────────────────────
router.post('/appointments', verifyClinicAdmin, async (req, res) => {
    try {
        const { patientId, amount, notes, serviceName } = req.body;
        // patientId here is ClinicPatient._id
        if (!patientId) return res.status(400).json({ success: false, message: 'patientId is required' });

        const clinicId = hid(req);
        const patient  = await ClinicPatient.findOne({ _id: patientId, clinicId });
        if (!patient) return res.status(404).json({ success: false, message: 'Patient not found in this clinic' });

        const { start: today, end: todayEnd } = todayRange();
        const count = await Appointment.countDocuments({
            hospitalId: clinicId,
            appointmentDate: { $gte: today, $lte: todayEnd },
            status: { $ne: 'cancelled' }
        });
        const tokenNumber = count + 1;

        const appointment = new Appointment({
            clinicPatientId: patient._id,
            patientId:       patient.patientUid, // display ID
            hospitalId:      clinicId,
            doctorUserId:    req.user._id,
            doctorName:      req.user.name,
            serviceName:     serviceName || 'General Consultation',
            appointmentDate: new Date(),
            appointmentTime: new Date().toTimeString().slice(0, 5),
            tokenNumber,
            status:        'confirmed',
            paymentStatus: 'pending',
            amount:        amount || 0,
            notes:         notes || '',
            bookedBy:      req.user._id,
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

        appt.status        = 'completed';
        appt.diagnosis     = diagnosis     || appt.diagnosis;
        appt.doctorNotes   = notes         || appt.doctorNotes;
        if (medicines  && Array.isArray(medicines))  appt.pharmacy  = medicines;
        if (labTests   && Array.isArray(labTests))   appt.labTests  = labTests;
        if (paymentStatus) appt.paymentStatus = paymentStatus;
        if (amount !== undefined) appt.amount = amount;

        await appt.save();

        // Create pharmacy order if medicines prescribed
        if (medicines && medicines.length > 0) {
            await PharmacyOrder.create({
                userId:        appt.userId || req.user._id, // fallback to admin
                patientId:     appt.patientId || appt._id.toString(),
                hospitalId:    hid(req),
                appointmentId: appt._id,
                doctorId:      req.user._id,
                items: medicines.map(m => ({
                    medicineName: m.name || m.medicineName,
                    frequency:    m.dosage || m.frequency || '',
                    duration:     m.duration || '',
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
// ADD INVENTORY — POST /api/clinic/inventory
// ─────────────────────────────────────────────
router.post('/inventory', verifyClinicAdmin, async (req, res) => {
    try {
        const { name, category, stock, unit, buyingPrice, sellingPrice, expiryDate } = req.body;
        if (!name)       return res.status(400).json({ success: false, message: 'Medicine name required' });
        if (!expiryDate) return res.status(400).json({ success: false, message: 'Expiry date is required' });

        const item = new Inventory({
            hospitalId:   hid(req),
            name,
            category:     category    || 'General',
            stock:        Number(stock)       || 0,
            unit:         unit         || 'Tablets',
            buyingPrice:  Number(buyingPrice)  || 0,
            sellingPrice: Number(sellingPrice) || 0,
            expiryDate:   new Date(expiryDate),
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
            .sort({ createdAt: -1 })
            .lean();
        res.json({ success: true, orders });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─────────────────────────────────────────────
// DISPENSE PHARMACY ORDER — PUT /api/clinic/pharmacy-orders/:id/dispense
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
