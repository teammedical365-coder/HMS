const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const Hospital = require('../models/hospital.model');
const User = require('../models/user.model');
const Role = require('../models/role.model');
const { verifyToken } = require('../middleware/auth.middleware');
const { getTenantConnection, removeTenantConnection } = require('../db/tenantDb');
const { getTenantModels } = require('../db/tenantModels');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

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

        const clinic = new Hospital({
            name,
            slug: finalSlug,
            address: address || '',
            city: city || '',
            state: state || '',
            phone: phone || '',
            email: email || '',
            website: website || '',
            appointmentFee: appointmentFee || 300,
            isActive: true,
            clinicType: 'clinic',
            appointmentMode: 'token', // clinics are always token-only
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
        const { name, address, city, state, phone, email, website, appointmentFee, isActive } = req.body;
        // appointmentMode is intentionally excluded — clinics are always token-only
        const clinic = await Hospital.findOneAndUpdate(
            { _id: req.params.id, clinicType: 'clinic' },
            { name, address, city, state, phone, email, website, appointmentFee, isActive, appointmentMode: 'token' },
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
        const clinic = await Hospital.findOne({ _id: req.params.id, clinicType: 'clinic' }).populate('adminUserId', 'name email phone');
        if (!clinic) return res.status(404).json({ success: false, message: 'Clinic not found' });

        const tenantDb = await getTenantConnection(clinic._id.toString());
        const { User: TUser, Appointment } = getTenantModels(tenantDb);

        const { startDate, endDate } = req.query;
        const apptFilter = { hospitalId: clinic._id };
        if (startDate || endDate) {
            apptFilter.createdAt = {};
            if (startDate) apptFilter.createdAt.$gte = new Date(startDate);
            if (endDate) apptFilter.createdAt.$lte = new Date(new Date(endDate).setHours(23, 59, 59, 999));
        }

        const [totalPatients, totalAppointments, completedAppointments, revenueAgg, recentAppointments] = await Promise.all([
            TUser.countDocuments({ role: { $not: { $in: ['centraladmin', 'superadmin', 'hospitaladmin'] } } }),
            Appointment.countDocuments(apptFilter),
            Appointment.countDocuments({ ...apptFilter, status: 'completed' }),
            Appointment.aggregate([
                { $match: { ...apptFilter, paymentStatus: 'paid' } },
                { $group: { _id: null, total: { $sum: '$amount' } } }
            ]),
            Appointment.find(apptFilter)
                .sort({ createdAt: -1 })
                .limit(5)
                .select('patientId doctorName status appointmentDate amount paymentStatus')
        ]);

        // Get staff from master DB
        const staff = await User.find({ hospitalId: clinic._id }).select('name email phone role createdAt').lean();

        // Monthly revenue for chart (last 6 months)
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        const monthlyRevenue = await Appointment.aggregate([
            { $match: { hospitalId: clinic._id, paymentStatus: 'paid', createdAt: { $gte: sixMonthsAgo } } },
            { $group: { _id: { month: { $month: '$createdAt' }, year: { $year: '$createdAt' } }, revenue: { $sum: '$amount' }, count: { $sum: 1 } } },
            { $sort: { '_id.year': 1, '_id.month': 1 } }
        ]);

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
                monthlyRevenue
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
        const staff = await User.find({ hospitalId: req.params.id })
            .select('name email phone role createdAt')
            .lean();

        // Populate role names for ObjectId roles
        const staffWithRoles = await Promise.all(staff.map(async (s) => {
            let roleName = s.role;
            if (typeof s.role === 'object' && s.role !== null) {
                try {
                    const roleDoc = await Role.findById(s.role).select('name');
                    roleName = roleDoc?.name || 'Staff';
                } catch { roleName = 'Staff'; }
            }
            return { ...s, roleName };
        }));

        res.json({ success: true, staff: staffWithRoles });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ==========================================
// CREATE clinic staff member
// POST /api/simple-clinics/:id/staff
// ==========================================
router.post('/:id/staff', verifyCentralAdmin, async (req, res) => {
    try {
        const { name, email, password, phone, roleId } = req.body;
        if (!name || !email || !password) return res.status(400).json({ success: false, message: 'Name, email and password are required' });

        const clinic = await Hospital.findOne({ _id: req.params.id, clinicType: 'clinic' });
        if (!clinic) return res.status(404).json({ success: false, message: 'Clinic not found' });

        // Check staff limit (max 4 for simple clinics)
        const currentStaffCount = await User.countDocuments({ hospitalId: clinic._id });
        if (currentStaffCount >= 4) {
            return res.status(400).json({ success: false, message: 'Simple clinics support up to 4 staff members. Upgrade to a full hospital for more.' });
        }

        const existing = await User.findOne({ email });
        if (existing) return res.status(400).json({ success: false, message: 'Email already in use' });

        const staffMember = new User({
            name, email, password, phone: phone || '',
            role: roleId || 'hospitaladmin',
            hospitalId: clinic._id
        });
        await staffMember.save();

        res.status(201).json({
            success: true,
            staff: { _id: staffMember._id, name, email, phone },
            message: 'Staff member created'
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

module.exports = router;
