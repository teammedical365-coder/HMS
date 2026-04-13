const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const Hospital = require('../models/hospital.model');
const User = require('../models/user.model');
const Role = require('../models/role.model');
const ClinicPatient = require('../models/clinicPatient.model');
const ClinicSubscription = require('../models/clinicSubscription.model');
const { verifyToken } = require('../middleware/auth.middleware');
const { getTenantConnection, removeTenantConnection } = require('../db/tenantDb');
const { getTenantModels } = require('../db/tenantModels');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Generate a unique clinic code from name (3-4 uppercase letters)
const generateClinicCode = async (name) => {
    const base = name.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4) || 'CLN';
    let code = base;
    let suffix = 1;
    while (await Hospital.findOne({ clinicCode: code })) {
        code = base.slice(0, 3) + suffix;
        suffix++;
    }
    return code;
};

const verifyCentralAdmin = async (req, res, next) => {
    try {
        await verifyToken(req, res, () => {
            const role = req.user.role;
            if (role === 'centraladmin' || role === 'superadmin') return next();
            return res.status(403).json({ success: false, message: 'Central Admin access required' });
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// ==========================================
// GET all simple clinics
// GET /api/simple-clinics
// ==========================================
router.get('/', verifyCentralAdmin, async (req, res) => {
    try {
        const clinics = await Hospital.find({ clinicType: 'clinic' }).populate('adminUserId', 'name email phone');
        res.json({ success: true, clinics });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ==========================================
// CREATE simple clinic
// POST /api/simple-clinics
// ==========================================
router.post('/', verifyCentralAdmin, async (req, res) => {
    try {
        const { name, slug, address, city, state, phone, email, website, appointmentFee } = req.body;
        if (!name) return res.status(400).json({ success: false, message: 'Clinic name is required' });

        const finalSlug = slug
            ? slug.toLowerCase().replace(/[^a-z0-9-]/g, '')
            : name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

        const existing = await Hospital.findOne({ slug: finalSlug });
        if (existing) return res.status(400).json({ success: false, message: 'Slug already in use. Try a different clinic name or slug.' });

        const clinicCode = await generateClinicCode(name);

        const clinic = new Hospital({
            name,
            slug: finalSlug,
            clinicCode,
            address: address || '',
            city: city || '',
            state: state || '',
            phone: phone || '',
            email: email || '',
            website: website || '',
            appointmentFee: appointmentFee || 300,
            isActive: true,
            clinicType: 'clinic',
            appointmentMode: 'token',
            tier: { maxDoctors: 1, maxReceptionists: 1 },
        });

        await clinic.save();

        // Auto-provision tenant database
        try {
            await getTenantConnection(clinic._id.toString());
        } catch (tenantErr) {
            console.error('Tenant DB provisioning error (non-fatal):', tenantErr.message);
        }

        res.status(201).json({ success: true, clinic, message: 'Simple clinic created successfully' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ==========================================
// UPDATE simple clinic
// PUT /api/simple-clinics/:id
// ==========================================
router.put('/:id', verifyCentralAdmin, async (req, res) => {
    try {
        const { name, address, city, state, phone, email, website, appointmentFee, isActive,
                maxDoctors, maxReceptionists, ratePerPatient, billingEnabled, appointmentMode } = req.body;

        const update = {};
        if (name       !== undefined) update.name       = name;
        if (address    !== undefined) update.address    = address;
        if (city       !== undefined) update.city       = city;
        if (state      !== undefined) update.state      = state;
        if (phone      !== undefined) update.phone      = phone;
        if (email      !== undefined) update.email      = email;
        if (website    !== undefined) update.website    = website;
        if (appointmentFee !== undefined) update.appointmentFee = appointmentFee;
        if (isActive   !== undefined) update.isActive   = isActive;

        // Tier update
        if (maxDoctors       !== undefined) update['tier.maxDoctors']       = Number(maxDoctors);
        if (maxReceptionists !== undefined) update['tier.maxReceptionists'] = Number(maxReceptionists);

        // Subscription config
        if (ratePerPatient !== undefined) update['subscription.ratePerPatient'] = Number(ratePerPatient);
        if (billingEnabled !== undefined) update['subscription.billingEnabled'] = billingEnabled;

        // Appointment mode — central admin can switch between token and slot
        if (appointmentMode !== undefined && ['slot', 'token'].includes(appointmentMode)) {
            update.appointmentMode = appointmentMode;
        }

        const clinic = await Hospital.findOneAndUpdate(
            { _id: req.params.id, clinicType: 'clinic' },
            { $set: update },
            { new: true, runValidators: true }
        );
        if (!clinic) return res.status(404).json({ success: false, message: 'Clinic not found' });
        res.json({ success: true, clinic });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ==========================================
// DELETE simple clinic
// DELETE /api/simple-clinics/:id
// ==========================================
router.delete('/:id', verifyCentralAdmin, async (req, res) => {
    try {
        const clinic = await Hospital.findOneAndDelete({ _id: req.params.id, clinicType: 'clinic' });
        if (!clinic) return res.status(404).json({ success: false, message: 'Clinic not found' });

        // Delete all staff associated with this clinic
        await User.deleteMany({ hospitalId: clinic._id });

        // Remove tenant DB connection
        try {
            await removeTenantConnection(clinic._id.toString());
        } catch (e) { /* non-fatal */ }

        res.json({ success: true, message: 'Clinic and all associated data deleted' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ==========================================
// GET clinic stats/analytics
// GET /api/simple-clinics/:id/stats
// ==========================================
router.get('/:id/stats', verifyCentralAdmin, async (req, res) => {
    try {
        const mongoose = require('mongoose');
        const Appointment = require('../models/appointment.model');

        const clinic = await Hospital.findOne({ _id: req.params.id, clinicType: 'clinic' }).populate('adminUserId', 'name email phone');
        if (!clinic) return res.status(404).json({ success: false, message: 'Clinic not found' });

        const clinicObjId = new mongoose.Types.ObjectId(clinic._id.toString());

        const [totalPatients, totalAppointments, completedAppointments, revenueAgg, recentAppointments] = await Promise.all([
            ClinicPatient.countDocuments({ clinicId: clinic._id }),
            Appointment.countDocuments({ hospitalId: clinicObjId }),
            Appointment.countDocuments({ hospitalId: clinicObjId, status: 'completed' }),
            Appointment.aggregate([
                { $match: { hospitalId: clinicObjId, paymentStatus: 'paid' } },
                { $group: { _id: null, total: { $sum: '$amount' } } }
            ]),
            Appointment.find({ hospitalId: clinicObjId })
                .sort({ createdAt: -1 })
                .limit(5)
                .select('patientId clinicPatientId doctorName status appointmentDate amount paymentStatus')
                .populate('clinicPatientId', 'name patientUid')
                .lean()
        ]);

        // Staff (only login accounts, not patients)
        const staff = await User.find({ hospitalId: clinic._id, role: { $in: ['hospitaladmin', 'doctor', 'receptionist'] } })
            .select('name email phone role createdAt').lean();

        // Monthly revenue (last 6 months)
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        const monthlyRevenue = await Appointment.aggregate([
            { $match: { hospitalId: clinicObjId, paymentStatus: 'paid', createdAt: { $gte: sixMonthsAgo } } },
            { $group: { _id: { month: { $month: '$createdAt' }, year: { $year: '$createdAt' } }, revenue: { $sum: '$amount' }, count: { $sum: 1 } } },
            { $sort: { '_id.year': 1, '_id.month': 1 } }
        ]);

        // Recent subscription records
        const subscriptions = await ClinicSubscription.find({ clinicId: clinic._id })
            .sort({ year: -1, month: -1 }).limit(6).lean();

        res.json({
            success: true,
            clinic,
            stats: {
                totalPatients,
                totalAppointments,
                completedAppointments,
                pendingAppointments: totalAppointments - completedAppointments,
                revenue: revenueAgg[0]?.total || 0,
                staff,
                recentAppointments,
                monthlyRevenue,
                subscriptions,
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ==========================================
// CREATE clinic manager (hospitaladmin)
// POST /api/simple-clinics/:id/manager
// ==========================================
router.post('/:id/manager', verifyCentralAdmin, async (req, res) => {
    try {
        const { name, email, password, phone } = req.body;
        if (!name || !email || !password) return res.status(400).json({ success: false, message: 'Name, email and password are required' });

        const clinic = await Hospital.findOne({ _id: req.params.id, clinicType: 'clinic' });
        if (!clinic) return res.status(404).json({ success: false, message: 'Clinic not found' });

        const existing = await User.findOne({ email });
        if (existing) return res.status(400).json({ success: false, message: 'Email already in use' });

        const manager = new User({
            name, email, password, phone: phone || '',
            role: 'hospitaladmin',
            hospitalId: clinic._id
        });
        await manager.save();

        clinic.adminUserId = manager._id;
        await clinic.save();

        const token = jwt.sign(
            { userId: manager._id, role: 'hospitaladmin', hospitalId: clinic._id },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.status(201).json({
            success: true,
            manager: { _id: manager._id, name, email, phone },
            token,
            message: 'Clinic manager created. They can login at /hospitaladmin/login'
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ==========================================
// GET clinic staff
// GET /api/simple-clinics/:id/staff
// ==========================================
router.get('/:id/staff', verifyCentralAdmin, async (req, res) => {
    try {
        // Only login staff, not patients
        const STAFF_ROLES = ['hospitaladmin', 'doctor', 'receptionist'];
        const staff = await User.find({ hospitalId: req.params.id, role: { $in: STAFF_ROLES } })
            .select('name email phone role createdAt')
            .lean();

        const clinic = await Hospital.findById(req.params.id).select('tier').lean();

        res.json({ success: true, staff, tier: clinic?.tier });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ==========================================
// CREATE clinic staff member (tier-enforced)
// POST /api/simple-clinics/:id/staff
// staffRole: 'doctor' | 'receptionist'
// ==========================================
router.post('/:id/staff', verifyCentralAdmin, async (req, res) => {
    try {
        const { name, email, password, phone, staffRole } = req.body;
        if (!name || !email || !password) return res.status(400).json({ success: false, message: 'Name, email and password are required' });

        const role = staffRole === 'receptionist' ? 'receptionist' : 'doctor';

        const clinic = await Hospital.findOne({ _id: req.params.id, clinicType: 'clinic' });
        if (!clinic) return res.status(404).json({ success: false, message: 'Clinic not found' });

        // Tier limit check
        const maxForRole = role === 'doctor'
            ? (clinic.tier?.maxDoctors       || 1)
            : (clinic.tier?.maxReceptionists || 1);

        const currentCount = await User.countDocuments({ hospitalId: clinic._id, role });
        if (currentCount >= maxForRole) {
            return res.status(400).json({
                success: false,
                message: `Tier limit reached: max ${maxForRole} ${role}(s) for this clinic. Please contact sales to upgrade.`,
                contactSales: true,
            });
        }

        const existing = await User.findOne({ email });
        if (existing) return res.status(400).json({ success: false, message: 'Email already in use' });

        const staffMember = new User({
            name, email, password, phone: phone || '',
            role,
            hospitalId: clinic._id,
        });
        await staffMember.save();

        res.status(201).json({
            success: true,
            staff: { _id: staffMember._id, name, email, phone, role },
            message: `${role === 'doctor' ? 'Doctor' : 'Receptionist'} account created successfully`,
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ==========================================
// DELETE clinic staff member
// DELETE /api/simple-clinics/:clinicId/staff/:userId
// ==========================================
router.delete('/:clinicId/staff/:userId', verifyCentralAdmin, async (req, res) => {
    try {
        const user = await User.findOneAndDelete({ _id: req.params.userId, hospitalId: req.params.clinicId });
        if (!user) return res.status(404).json({ success: false, message: 'Staff member not found' });

        // Unlink from clinic admin if needed
        await Hospital.updateOne({ _id: req.params.clinicId, adminUserId: req.params.userId }, { $set: { adminUserId: null } });

        res.json({ success: true, message: 'Staff member removed' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ==========================================
// SUBSCRIPTION — GET all months for a clinic
// GET /api/simple-clinics/:id/subscriptions
// ==========================================
router.get('/:id/subscriptions', verifyCentralAdmin, async (req, res) => {
    try {
        const subs = await ClinicSubscription.find({ clinicId: req.params.id })
            .sort({ year: -1, month: -1 })
            .lean();
        const clinic = await Hospital.findById(req.params.id).select('name subscription clinicCode').lean();
        res.json({ success: true, subscriptions: subs, clinic });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ==========================================
// SUBSCRIPTION — Set rate & billing config
// PUT /api/simple-clinics/:id/subscriptions/rate
// ==========================================
router.put('/:id/subscriptions/rate', verifyCentralAdmin, async (req, res) => {
    try {
        const { ratePerPatient, billingEnabled } = req.body;
        const clinic = await Hospital.findOneAndUpdate(
            { _id: req.params.id, clinicType: 'clinic' },
            {
                $set: {
                    'subscription.ratePerPatient': Number(ratePerPatient) || 0,
                    'subscription.billingEnabled': !!billingEnabled,
                }
            },
            { new: true }
        );
        if (!clinic) return res.status(404).json({ success: false, message: 'Clinic not found' });
        res.json({ success: true, clinic, message: 'Billing rate updated' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ==========================================
// SUBSCRIPTION — Mark month as paid/waived
// PUT /api/simple-clinics/:id/subscriptions/:subId
// ==========================================
router.put('/:id/subscriptions/:subId', verifyCentralAdmin, async (req, res) => {
    try {
        const { status, notes } = req.body;
        const update = { notes: notes || '' };
        if (status === 'paid')   { update.status = 'paid';   update.paidAt = new Date(); }
        if (status === 'waived') { update.status = 'waived'; }
        if (status === 'pending') update.status = 'pending';

        const sub = await ClinicSubscription.findOneAndUpdate(
            { _id: req.params.subId, clinicId: req.params.id },
            update,
            { new: true }
        );
        if (!sub) return res.status(404).json({ success: false, message: 'Subscription record not found' });
        res.json({ success: true, subscription: sub });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
