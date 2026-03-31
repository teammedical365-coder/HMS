const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth.middleware');
const { resolveTenant } = require('../middleware/tenantMiddleware');
const MasterAdmission = require('../models/admission.model');
const { getTenantModels } = require('../db/tenantModels');

// Admission access: reception, accountant, admin
const verifyAdmissionAccess = async (req, res, next) => {
    try {
        await verifyToken(req, res, async () => {
            const roleName = (req.user._roleData?.name || String(req.user.role || '')).toLowerCase();
            const perms = req.user._roleData?.permissions || [];
            const allowed = ['reception', 'receptionist', 'accountant', 'cashier', 'hospitaladmin', 'centraladmin', 'superadmin', 'admin'];

            if (allowed.includes(roleName) ||
                perms.includes('billing_manage') ||
                perms.includes('admission_manage') ||
                perms.includes('appointment_manage') ||
                perms.includes('*')) {
                await resolveTenant(req, res, next);
            } else {
                return res.status(403).json({ success: false, message: 'Admission access required' });
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

const getAdmission = (req) => {
    if (req.tenantDb) return getTenantModels(req.tenantDb).Admission;
    return MasterAdmission;
};

// POST /api/admissions — Admit a patient (receptionist)
router.post('/', verifyAdmissionAccess, async (req, res) => {
    try {
        const { patientId, appointmentId, ward, bedNumber, selectedFacilities = [], admissionDate, notes } = req.body;
        if (!patientId) return res.status(400).json({ success: false, message: 'patientId is required' });

        const hospitalId = req.hospitalId || req.user.hospitalId;
        const totalAmount = selectedFacilities.reduce((sum, f) => sum + (Number(f.pricePerDay) * Number(f.days)), 0);

        const Admission = getAdmission(req);
        const admission = new Admission({
            hospitalId,
            patientId,
            appointmentId: appointmentId || undefined,
            admittedBy: req.user._id || req.user.userId,
            admissionDate: admissionDate ? new Date(admissionDate) : new Date(),
            ward,
            bedNumber,
            selectedFacilities: selectedFacilities.map(f => ({
                facilityName: f.facilityName,
                pricePerDay: Number(f.pricePerDay),
                days: Number(f.days),
                totalAmount: Number(f.pricePerDay) * Number(f.days),
            })),
            totalAmount,
            status: 'Admitted',
            notes,
        });

        await admission.save();
        res.status(201).json({ success: true, message: 'Patient admitted successfully', admission });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /api/admissions/active — All currently admitted patients
router.get('/active', verifyAdmissionAccess, async (req, res) => {
    try {
        const Admission = getAdmission(req);
        const admissions = await Admission.find({
            status: 'Admitted',
            hospitalId: req.hospitalId || req.user.hospitalId,
        }).populate('patientId', 'name phone patientId mrn').lean();

        res.json({ success: true, admissions });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /api/admissions/patient/:patientId — Admission history for a patient
router.get('/patient/:patientId', verifyAdmissionAccess, async (req, res) => {
    try {
        const Admission = getAdmission(req);
        const admissions = await Admission.find({
            patientId: req.params.patientId,
            hospitalId: req.hospitalId || req.user.hospitalId,
        }).sort({ admissionDate: -1 }).lean();

        res.json({ success: true, admissions });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// PUT /api/admissions/:id/discharge — Discharge a patient
router.put('/:id/discharge', verifyAdmissionAccess, async (req, res) => {
    try {
        const { dischargeDate, notes } = req.body;
        const Admission = getAdmission(req);
        const admission = await Admission.findByIdAndUpdate(
            req.params.id,
            {
                status: 'Discharged',
                dischargeDate: dischargeDate ? new Date(dischargeDate) : new Date(),
                ...(notes && { notes }),
            },
            { new: true }
        );

        if (!admission) return res.status(404).json({ success: false, message: 'Admission not found' });
        res.json({ success: true, message: 'Patient discharged successfully', admission });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// PUT /api/admissions/:id/pay — Mark admission as paid
router.put('/:id/pay', verifyAdmissionAccess, async (req, res) => {
    try {
        const Admission = getAdmission(req);
        const admission = await Admission.findByIdAndUpdate(
            req.params.id,
            { paymentStatus: 'Paid' },
            { new: true }
        );
        if (!admission) return res.status(404).json({ success: false, message: 'Admission not found' });
        res.json({ success: true, message: 'Admission marked as paid', admission });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
