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
        res.status(500).json({ success: false, message: 'An internal error occurred' });
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
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// GET /api/admissions/active — All currently admitted patients
router.get('/active', verifyAdmissionAccess, async (req, res) => {
    try {
        const Admission = getAdmission(req);
        let queryFilter = {
            hospitalId: req.hospitalId || req.user.hospitalId,
        };

        if (req.query.department) {
            const Appointment = require('../models/appointment.model');
            const deptRegex = new RegExp(`^${req.query.department}$`, 'i');
            const validAppts = await Appointment.find({
                hospitalId: queryFilter.hospitalId,
                $or: [
                    { department: { $regex: deptRegex } },
                    { serviceName: { $regex: deptRegex } }
                ]
            }).select('_id').lean();
            const validApptIds = validAppts.map(a => a._id);
            queryFilter.appointmentId = { $in: validApptIds };
        }

        if (req.query.search) {
            const searchRegex = new RegExp(req.query.search, 'i');
            const MasterUser = require('../models/user.model');
            const Appointment = require('../models/appointment.model');
            
            const matchingUsers = await MasterUser.find({
                $or: [
                    { name: searchRegex },
                    { phone: searchRegex },
                    { patientId: searchRegex },
                    { patientUid: searchRegex }
                ]
            }).select('_id').lean();
            const validPatientIds = matchingUsers.map(u => u._id);
            
            const matchingAppointments = await Appointment.find({
                hospitalId: queryFilter.hospitalId,
                $or: [
                    { doctorName: searchRegex },
                    { patientId: searchRegex } // Appointment string field
                ]
            }).select('_id').lean();
            const validApptIdsFromSearch = matchingAppointments.map(a => a._id);
            
            if (validPatientIds.length > 0 || validApptIdsFromSearch.length > 0) {
                const searchConditions = [];
                if (validPatientIds.length > 0) searchConditions.push({ patientId: { $in: validPatientIds } });
                if (validApptIdsFromSearch.length > 0) searchConditions.push({ appointmentId: { $in: validApptIdsFromSearch } });
                
                if (!queryFilter.$and) queryFilter.$and = [];
                queryFilter.$and.push({ $or: searchConditions });
            } else {
                return res.json({ success: true, admissions: [] });
            }
        }

        const User = require('../models/user.model');
        const Appointment = require('../models/appointment.model');
        console.log('Query Filter:', queryFilter);
        let admissions = await Admission.find(queryFilter).sort({ admissionDate: -1 }).lean();
        console.log('Found admissions:', admissions.length);

        for (let adm of admissions) {
            try {
                if (adm.patientId) {
                    adm.patientId = await User.findById(adm.patientId).select('name phone patientId mrn gender dob').lean() || adm.patientId;
                }
            } catch (err) {}
            try {
                if (adm.appointmentId) {
                    adm.appointmentId = await Appointment.findById(adm.appointmentId).select('doctorName department serviceName').lean() || adm.appointmentId;
                }
            } catch (err) {}
        }

        res.json({ success: true, admissions });
    } catch (err) {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
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
        res.status(500).json({ success: false, message: 'An internal error occurred' });
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
        res.status(500).json({ success: false, message: 'An internal error occurred' });
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
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

module.exports = router;
