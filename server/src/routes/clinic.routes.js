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
const TreatmentPlan = require('../models/treatmentPlan.model');
const Notification = require('../models/notification.model');

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
            planRevenueAgg,
            planTodayRevenueAgg,
            planMonthRevenueAgg,
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
            // Treatment plan revenue — sum of all amountPaid across visits
            TreatmentPlan.aggregate([
                { $match: { hospitalId } },
                { $unwind: '$visits' },
                { $group: { _id: null, total: { $sum: '$visits.amountPaid' } } }
            ]),
            TreatmentPlan.aggregate([
                { $match: { hospitalId } },
                { $unwind: '$visits' },
                { $match: { 'visits.completedAt': { $gte: today, $lte: todayEnd } } },
                { $group: { _id: null, total: { $sum: '$visits.amountPaid' } } }
            ]),
            TreatmentPlan.aggregate([
                { $match: { hospitalId, createdAt: { $gte: firstOfMonth } } },
                { $unwind: '$visits' },
                { $group: { _id: null, total: { $sum: '$visits.amountPaid' } } }
            ]),
        ]);

        // Monthly revenue trend (last 6 months) — appointments + treatment plans combined
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        const [apptTrend, planTrend] = await Promise.all([
            Appointment.aggregate([
                { $match: { hospitalId, paymentStatus: 'paid', createdAt: { $gte: sixMonthsAgo } } },
                { $group: { _id: { month: { $month: '$createdAt' }, year: { $year: '$createdAt' } }, revenue: { $sum: '$amount' }, count: { $sum: 1 } } },
                { $sort: { '_id.year': 1, '_id.month': 1 } }
            ]),
            TreatmentPlan.aggregate([
                { $match: { hospitalId, createdAt: { $gte: sixMonthsAgo } } },
                { $unwind: '$visits' },
                { $match: { 'visits.amountPaid': { $gt: 0 } } },
                { $group: { _id: { month: { $month: '$visits.completedAt' }, year: { $year: '$visits.completedAt' } }, revenue: { $sum: '$visits.amountPaid' } } },
                { $sort: { '_id.year': 1, '_id.month': 1 } }
            ]),
        ]);
        // Merge the two trend arrays by month/year key
        const trendMap = {};
        for (const t of apptTrend) {
            const key = `${t._id.year}-${t._id.month}`;
            trendMap[key] = { ...t, revenue: t.revenue };
        }
        for (const t of planTrend) {
            if (!t._id.month) continue; // skip if completedAt was null
            const key = `${t._id.year}-${t._id.month}`;
            if (trendMap[key]) trendMap[key].revenue += t.revenue;
            else trendMap[key] = { _id: t._id, revenue: t.revenue, count: 0 };
        }
        const monthlyTrend = Object.values(trendMap).sort((a, b) =>
            a._id.year !== b._id.year ? a._id.year - b._id.year : a._id.month - b._id.month
        );

        const apptRevenue      = revenueAgg[0]?.total || 0;
        const apptTodayRevenue = todayRevenueAgg[0]?.total || 0;
        const apptMonthRevenue = monthRevenueAgg[0]?.total || 0;
        const planRevenue      = planRevenueAgg[0]?.total || 0;
        const planTodayRevenue = planTodayRevenueAgg[0]?.total || 0;
        const planMonthRevenue = planMonthRevenueAgg[0]?.total || 0;

        // Total pending balance across all active plans
        const pendingPlansAgg = await TreatmentPlan.aggregate([
            { $match: { hospitalId, status: 'active' } },
            { $group: { _id: null, total: { $sum: '$pendingBalance' } } }
        ]);
        const treatmentPlanPending = pendingPlansAgg[0]?.total || 0;

        res.json({
            success: true,
            stats: {
                totalPatients,
                todayPatients,
                totalAppointments,
                todayAppointments,
                completedAppointments,
                pendingAppointments,
                totalRevenue:          apptRevenue + planRevenue,
                todayRevenue:          apptTodayRevenue + planTodayRevenue,
                monthRevenue:          apptMonthRevenue + planMonthRevenue,
                treatmentPlanRevenue:  planRevenue,
                treatmentPlanPending,
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
        const { name, phone, email, dob, gender, address, bloodGroup, allergies, chronicConditions, relatives } = req.body;
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

        const cleanRelatives = Array.isArray(relatives)
            ? relatives.filter(r => r.name?.trim() || r.phone?.trim()).map(r => ({
                name: (r.name || '').trim(),
                relation: (r.relation || '').trim(),
                phone: (r.phone || '').trim(),
            }))
            : [];

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
            relatives: cleanRelatives,
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
        const { name, email, dob, gender, address, bloodGroup, allergies, chronicConditions, medicalNotes, relatives } = req.body;
        const updateData = { name, email, dob, gender, address, bloodGroup, allergies, chronicConditions, medicalNotes };
        if (Array.isArray(relatives)) {
            updateData.relatives = relatives.filter(r => r.name?.trim() || r.phone?.trim()).map(r => ({
                name: (r.name || '').trim(),
                relation: (r.relation || '').trim(),
                phone: (r.phone || '').trim(),
            }));
        }
        const patient = await ClinicPatient.findOneAndUpdate(
            { _id: req.params.id, clinicId: hid(req) },
            updateData,
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
        const { diagnosis, notes, medicines, labTests, paymentStatus, amount, vitals } = req.body;

        const appt = await Appointment.findOne({ _id: req.params.id, hospitalId: hid(req) });
        if (!appt) return res.status(404).json({ success: false, message: 'Appointment not found' });

        appt.status        = 'completed';
        appt.diagnosis     = diagnosis     || appt.diagnosis;
        appt.doctorNotes   = notes         || appt.doctorNotes;
        if (vitals && typeof vitals === 'object') appt.vitals = vitals;
        if (medicines && Array.isArray(medicines)) appt.pharmacy = medicines.map(m => ({
            medicineName: m.medicineName || m.name || '',
            saltName:     m.saltName || '',
            frequency:    m.frequency || m.dose || m.dosage || '',
            duration:     m.duration || m.days || '',
        }));
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
                    medicineName: m.medicineName || m.name,
                    saltName:     m.saltName || '',
                    frequency:    m.frequency || m.dose || m.dosage || '',
                    duration:     m.duration || m.days || '',
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

// ══════════════════════════════════════════════════════════
// TREATMENT PLANS
// ══════════════════════════════════════════════════════════

// CREATE treatment plan
router.post('/treatment-plans', verifyClinicAdmin, async (req, res) => {
    try {
        const { clinicPatientId, title, description, totalDurationDays, visits } = req.body;
        if (!clinicPatientId || !title || !visits || !visits.length) {
            return res.status(400).json({ success: false, message: 'Patient, title and at least one visit are required.' });
        }

        // Compute carry-forwards and totals
        let carry = 0;
        let totalAmount = 0;
        const processedVisits = visits.map((v, i) => {
            const amountDue = Number(v.amountDue) || 0;
            const carryForward = carry;
            const totalDue = amountDue + carryForward;
            // On creation, no payment yet
            const balance = totalDue;
            carry = balance;
            totalAmount += amountDue;
            return {
                visitNumber: i + 1,
                scheduledDate: new Date(v.scheduledDate),
                scheduledTime: v.scheduledTime || '',
                procedure: v.procedure || '',
                amountDue,
                carryForward,
                totalDue,
                amountPaid: 0,
                balance,
                status: 'scheduled',
                alertSent: false,
            };
        });

        const plan = await TreatmentPlan.create({
            hospitalId: hid(req),
            clinicPatientId,
            createdBy: req.user.id,
            title,
            description: description || '',
            totalDurationDays: Number(totalDurationDays) || 0,
            visits: processedVisits,
            totalAmount,
            pendingBalance: totalAmount,
            totalPaid: 0,
            status: 'active',
        });

        await plan.populate('clinicPatientId', 'name patientUid phone');
        res.json({ success: true, plan });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// LIST all treatment plans for hospital
router.get('/treatment-plans', verifyClinicAdmin, async (req, res) => {
    try {
        const plans = await TreatmentPlan.find({ hospitalId: hid(req) })
            .populate('clinicPatientId', 'name patientUid phone gender')
            .sort({ createdAt: -1 });
        res.json({ success: true, plans });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// TODAY'S DUE VISITS — also fires notifications (call this on dashboard load)
router.get('/treatment-plans/today-due', verifyClinicAdmin, async (req, res) => {
    try {
        const { start, end } = todayRange();
        const plans = await TreatmentPlan.find({
            hospitalId: hid(req),
            status: 'active',
            'visits.scheduledDate': { $gte: start, $lte: end },
            'visits.status': 'scheduled',
        }).populate('clinicPatientId', 'name patientUid phone');

        // Fire notifications for un-alerted visits
        const io = req.app.get('io');
        for (const plan of plans) {
            for (const visit of plan.visits) {
                const vDate = new Date(visit.scheduledDate);
                const isToday = vDate >= start && vDate <= end;
                if (isToday && visit.status === 'scheduled' && !visit.alertSent) {
                    const patName = plan.clinicPatientId?.name || 'Patient';
                    const notif = await Notification.create({
                        senderId: req.user.id,
                        hospitalId: hid(req),
                        recipientRole: 'hospitaladmin',
                        message: `📅 ${patName} — Visit ${visit.visitNumber} of "${plan.title}" is due today${visit.scheduledTime ? ' at ' + visit.scheduledTime : ''}.`,
                        status: 'Unread',
                        referenceType: 'TreatmentPlan',
                        referenceId: plan._id,
                        patientId: (plan.clinicPatientId?.patientUid || plan.clinicPatientId?._id || 'N/A').toString(),
                    });
                    if (io) io.to('hospitaladmin').emit('new_notification', notif);
                    visit.alertSent = true;
                }
            }
            await plan.save();
        }

        res.json({ success: true, plans });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET single plan
router.get('/treatment-plans/:id', verifyClinicAdmin, async (req, res) => {
    try {
        const plan = await TreatmentPlan.findOne({ _id: req.params.id, hospitalId: hid(req) })
            .populate('clinicPatientId', 'name patientUid phone gender age');
        if (!plan) return res.status(404).json({ success: false, message: 'Plan not found' });
        res.json({ success: true, plan });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// RECORD PAYMENT for a visit
router.put('/treatment-plans/:id/visits/:visitId/pay', verifyClinicAdmin, async (req, res) => {
    try {
        const { amountPaid, paymentMethod, notes } = req.body;
        const plan = await TreatmentPlan.findOne({ _id: req.params.id, hospitalId: hid(req) });
        if (!plan) return res.status(404).json({ success: false, message: 'Plan not found' });

        const visit = plan.visits.id(req.params.visitId);
        if (!visit) return res.status(404).json({ success: false, message: 'Visit not found' });

        const paid = Number(amountPaid) || 0;
        visit.amountPaid = paid;
        visit.balance = Math.max(0, visit.totalDue - paid);
        visit.paymentMethod = paymentMethod || 'Cash';
        if (notes) visit.notes = notes;

        // Propagate remaining balance as carryForward to the next scheduled visit
        const nextVisit = plan.visits.find(v => v.visitNumber === visit.visitNumber + 1 && v.status === 'scheduled');
        if (nextVisit) {
            nextVisit.carryForward = visit.balance;
            nextVisit.totalDue = nextVisit.amountDue + nextVisit.carryForward;
            nextVisit.balance = Math.max(0, nextVisit.totalDue - (nextVisit.amountPaid || 0));
        }

        // Recalculate plan totals — pendingBalance is simply totalAmount - totalPaid (never negative)
        plan.totalPaid = plan.visits.reduce((s, v) => s + (v.amountPaid || 0), 0);
        plan.pendingBalance = Math.max(0, plan.totalAmount - plan.totalPaid);

        await plan.save();
        await plan.populate('clinicPatientId', 'name patientUid phone gender');
        res.json({ success: true, plan });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// COMPLETE a visit
router.put('/treatment-plans/:id/visits/:visitId/complete', verifyClinicAdmin, async (req, res) => {
    try {
        const { notes } = req.body;
        const plan = await TreatmentPlan.findOne({ _id: req.params.id, hospitalId: hid(req) });
        if (!plan) return res.status(404).json({ success: false, message: 'Plan not found' });

        const visit = plan.visits.id(req.params.visitId);
        if (!visit) return res.status(404).json({ success: false, message: 'Visit not found' });

        visit.status = 'completed';
        visit.completedAt = new Date();
        if (notes) visit.notes = notes;

        // If all visits done, complete the plan
        const allDone = plan.visits.every(v => v.status === 'completed' || v.status === 'missed');
        if (allDone) plan.status = 'completed';

        await plan.save();
        await plan.populate('clinicPatientId', 'name patientUid phone gender');
        res.json({ success: true, plan });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// MARK visit as missed
router.put('/treatment-plans/:id/visits/:visitId/miss', verifyClinicAdmin, async (req, res) => {
    try {
        const plan = await TreatmentPlan.findOne({ _id: req.params.id, hospitalId: hid(req) });
        if (!plan) return res.status(404).json({ success: false, message: 'Plan not found' });

        const visit = plan.visits.id(req.params.visitId);
        if (!visit) return res.status(404).json({ success: false, message: 'Visit not found' });

        visit.status = 'missed';
        // Carry missed visit's totalDue to the next scheduled visit
        const nextVisit = plan.visits.find(v => v.visitNumber === visit.visitNumber + 1 && v.status === 'scheduled');
        if (nextVisit) {
            nextVisit.carryForward = (nextVisit.carryForward || 0) + visit.totalDue;
            nextVisit.totalDue = nextVisit.amountDue + nextVisit.carryForward;
            nextVisit.balance = nextVisit.totalDue - nextVisit.amountPaid;
        }

        plan.totalPaid = plan.visits.reduce((s, v) => s + (v.amountPaid || 0), 0);
        plan.pendingBalance = Math.max(0, plan.totalAmount - plan.totalPaid);
        await plan.save();
        await plan.populate('clinicPatientId', 'name patientUid phone gender');
        res.json({ success: true, plan });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// CANCEL plan
router.put('/treatment-plans/:id/cancel', verifyClinicAdmin, async (req, res) => {
    try {
        const plan = await TreatmentPlan.findOneAndUpdate(
            { _id: req.params.id, hospitalId: hid(req) },
            { status: 'cancelled' },
            { new: true }
        ).populate('clinicPatientId', 'name patientUid phone');
        if (!plan) return res.status(404).json({ success: false, message: 'Plan not found' });
        res.json({ success: true, plan });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
