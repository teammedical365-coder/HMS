const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth.middleware');
const ReferralMaster = require('../models/referral.model');
const Doctor = require('../models/doctor.model');
const { getTenantModels } = require('../db/tenantModels');
const { resolveTenant } = require('../middleware/tenantMiddleware');

const getReferralModel = (req) => {
    if (req.tenantDb) return getTenantModels(req.tenantDb).Referral || ReferralMaster;
    return ReferralMaster;
};

// Middleware: verify doctor role
const verifyDoctorAccess = async (req, res, next) => {
    try {
        await verifyToken(req, res, async () => {
            const roleName = (req.user._roleData?.name || String(req.user.role || '')).toLowerCase().replace(/\s+/g, '');
            const allowed = ['doctor', 'clinicdoctor', 'hospitaladmin', 'centraladmin', 'superadmin', 'admin'];
            if (allowed.includes(roleName)) {
                await resolveTenant(req, res, next);
            } else {
                res.status(403).json({ success: false, message: 'Doctor access required' });
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal error' });
    }
};

// POST /api/referrals — Create a referral
router.post('/', verifyDoctorAccess, async (req, res) => {
    try {
        const { patientId, appointmentId, referredToDoctorId, reason, notes } = req.body;
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const referringDoctorId = req.user._id; // Always use authenticated user

        if (!patientId || !referredToDoctorId || !reason) {
            return res.status(400).json({ success: false, message: 'Patient, referred doctor, and reason are required' });
        }

        if (referringDoctorId.toString() === referredToDoctorId.toString()) {
            return res.status(400).json({ success: false, message: 'Cannot refer to yourself. Use "Create Surgery Plan" instead.' });
        }

        // Verify referred doctor exists
        const referredDoctor = await Doctor.findOne({ userId: referredToDoctorId, hospitalId });
        if (!referredDoctor) {
            // Also check if referredToDoctorId is a doctor profile _id
            const referredDoctorById = await Doctor.findOne({ _id: referredToDoctorId, hospitalId });
            if (!referredDoctorById) {
                return res.status(400).json({ success: false, message: 'Referred doctor not found in this hospital' });
            }
        }

        const referral = new (getReferralModel(req))({
            hospitalId,
            patientId,
            appointmentId,
            referringDoctorId,
            referredToDoctorId,
            reason,
            notes,
            referralDate: new Date(),
            status: 'REFERRED',
            createdBy: req.user._id
        });

        await referral.save();

        const populated = await getReferralModel(req).findById(referral._id)
            .populate('patientId', 'name email phone patientId mrn')
            .populate('referringDoctorId', 'name email')
            .populate('referredToDoctorId', 'name email');

        res.json({ success: true, message: 'Referral created successfully', referral: populated });
    } catch (err) {
        console.error('Error creating referral:', err);
        res.status(500).json({ success: false, message: 'Error creating referral' });
    }
});

// GET /api/referrals/my-referrals — Referrals assigned TO the logged-in doctor
router.get('/my-referrals', verifyDoctorAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const doctorUserId = req.user._id;

        // The referredToDoctorId could be the User._id or the Doctor._id
        // We need to check both
        const doctorProfile = await Doctor.findOne({ userId: doctorUserId });
        const orConditions = [{ referredToDoctorId: doctorUserId }];
        if (doctorProfile) {
            orConditions.push({ referredToDoctorId: doctorProfile._id });
        }

        const referrals = await getReferralModel(req).find({
            hospitalId,
            $or: orConditions
        })
            .populate('patientId', 'name email phone patientId mrn age gender')
            .populate('referringDoctorId', 'name email')
            .populate('referredToDoctorId', 'name email')
            .populate('surgeryPlanId')
            .sort({ createdAt: -1 });

        res.json({ success: true, referrals });
    } catch (err) {
        console.error('Error fetching my referrals:', err);
        res.status(500).json({ success: false, message: 'Error fetching referrals' });
    }
});

// GET /api/referrals/my-sent — Referrals SENT by the logged-in doctor
router.get('/my-sent', verifyDoctorAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const referrals = await getReferralModel(req).find({ hospitalId, referringDoctorId: req.user._id })
            .populate('patientId', 'name email phone patientId mrn age gender')
            .populate('referringDoctorId', 'name email')
            .populate('referredToDoctorId', 'name email')
            .populate('surgeryPlanId')
            .sort({ createdAt: -1 });

        res.json({ success: true, referrals });
    } catch (err) {
        console.error('Error fetching sent referrals:', err);
        res.status(500).json({ success: false, message: 'Error fetching sent referrals' });
    }
});

// GET /api/referrals/patient/:patientId — All referrals for a specific patient
router.get('/patient/:patientId', verifyDoctorAccess, async (req, res) => {
    try {
        const { patientId } = req.params;
        const hospitalId = req.hospitalId || req.user.hospitalId;

        const referrals = await getReferralModel(req).find({ hospitalId, patientId })
            .populate('patientId', 'name email phone patientId mrn')
            .populate('referringDoctorId', 'name email')
            .populate('referredToDoctorId', 'name email')
            .populate('surgeryPlanId')
            .sort({ createdAt: -1 });

        res.json({ success: true, referrals });
    } catch (err) {
        console.error('Error fetching patient referrals:', err);
        res.status(500).json({ success: false, message: 'Error fetching referrals' });
    }
});

// GET /api/referrals/:id — Get single referral detail
router.get('/:id', verifyDoctorAccess, async (req, res) => {
    try {
        const { id } = req.params;
        const hospitalId = req.hospitalId || req.user.hospitalId;

        const referral = await getReferralModel(req).findOne({ _id: id, hospitalId })
            .populate('patientId', 'name email phone patientId mrn age gender')
            .populate('referringDoctorId', 'name email')
            .populate('referredToDoctorId', 'name email')
            .populate('surgeryPlanId')
            .populate('appointmentId');

        if (!referral) {
            return res.status(404).json({ success: false, message: 'Referral not found' });
        }

        res.json({ success: true, referral });
    } catch (err) {
        console.error('Error fetching referral:', err);
        res.status(500).json({ success: false, message: 'Error fetching referral' });
    }
});

// PUT /api/referrals/:id/review — Referred doctor reviews the referral
router.put('/:id/review', verifyDoctorAccess, async (req, res) => {
    try {
        const { id } = req.params;
        const { status, reviewNotes } = req.body;
        const hospitalId = req.hospitalId || req.user.hospitalId;

        if (!['ACCEPTED', 'REJECTED', 'NOT_REQUIRED'].includes(status)) {
            return res.status(400).json({ success: false, message: 'Invalid review status' });
        }

        const referral = await getReferralModel(req).findOne({ _id: id, hospitalId });
        if (!referral) {
            return res.status(404).json({ success: false, message: 'Referral not found' });
        }

        // Authorization: only the referred doctor can review
        const doctorProfile = await Doctor.findOne({ userId: req.user._id });
        const isReferred = referral.referredToDoctorId.toString() === req.user._id.toString() ||
            (doctorProfile && referral.referredToDoctorId.toString() === doctorProfile._id.toString());

        if (!isReferred) {
            return res.status(403).json({ success: false, message: 'Only the referred doctor can review this referral' });
        }

        if (referral.status !== 'REFERRED') {
            return res.status(400).json({ success: false, message: 'Referral has already been reviewed' });
        }

        referral.status = status;
        if (reviewNotes) referral.reviewNotes = reviewNotes;
        await referral.save();

        const populated = await getReferralModel(req).findById(referral._id)
            .populate('patientId', 'name email phone patientId mrn')
            .populate('referringDoctorId', 'name email')
            .populate('referredToDoctorId', 'name email');

        res.json({ success: true, message: `Referral ${status.toLowerCase()}`, referral: populated });
    } catch (err) {
        console.error('Error reviewing referral:', err);
        res.status(500).json({ success: false, message: 'Error reviewing referral' });
    }
});

module.exports = router;
