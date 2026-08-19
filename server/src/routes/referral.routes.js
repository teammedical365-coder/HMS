const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth.middleware');
const ReferralMaster = require('../models/referral.model');
const DoctorMaster = require('../models/doctor.model');
const UserMaster = require('../models/user.model');
const AppointmentMaster = require('../models/appointment.model');
const { getTenantModels } = require('../db/tenantModels');
const { resolveTenant } = require('../middleware/tenantMiddleware');

const getReferralModel = (req) => {
    if (req.tenantDb) return getTenantModels(req.tenantDb).Referral || ReferralMaster;
    return ReferralMaster;
};

// Helper: robustly populate referral fields from User / Doctor master collections
async function populateReferralData(referrals, req) {
    if (!referrals) return null;
    const isArray = Array.isArray(referrals);
    const list = isArray ? referrals : [referrals];

    const SurgeryPlanModel = req?.tenantDb ? (getTenantModels(req.tenantDb).SurgeryPlan || require('../models/surgeryPlan.model')) : require('../models/surgeryPlan.model');

    const populated = await Promise.all(list.map(async (doc) => {
        const item = doc.toObject ? doc.toObject() : { ...doc };

        // 1. Populate patientId
        if (item.patientId) {
            const rawP = typeof item.patientId === 'object' && item.patientId._id ? item.patientId._id : item.patientId;
            const p = await UserMaster.findById(rawP).select('name email phone patientId mrn age gender').lean();
            if (p) {
                item.patientId = p;
            } else if (typeof item.patientId === 'object' && !item.patientId.name) {
                // keep object or fallback
                item.patientId = { _id: rawP, name: 'Patient', patientId: '-' };
            }
        }

        // 2. Populate referringDoctorId
        if (item.referringDoctorId) {
            const rawDoc = typeof item.referringDoctorId === 'object' && item.referringDoctorId._id ? item.referringDoctorId._id : item.referringDoctorId;
            let d = await UserMaster.findById(rawDoc).select('name email phone specialization firstName lastName').lean();
            if (!d) {
                d = await DoctorMaster.findById(rawDoc).select('name email phone specialization firstName lastName').lean();
            }
            if (!d) {
                d = await DoctorMaster.findOne({ userId: rawDoc }).select('name email phone specialization firstName lastName').lean();
            }
            if (d) item.referringDoctorId = d;
        }

        // 3. Populate referredToDoctorId
        if (item.referredToDoctorId) {
            const rawDoc = typeof item.referredToDoctorId === 'object' && item.referredToDoctorId._id ? item.referredToDoctorId._id : item.referredToDoctorId;
            let d = await UserMaster.findById(rawDoc).select('name email phone specialization firstName lastName').lean();
            if (!d) {
                d = await DoctorMaster.findById(rawDoc).select('name email phone specialization firstName lastName').lean();
            }
            if (!d) {
                d = await DoctorMaster.findOne({ userId: rawDoc }).select('name email phone specialization firstName lastName').lean();
            }
            if (d) item.referredToDoctorId = d;
        }

        // 4. Populate appointmentId if present
        if (item.appointmentId) {
            const rawAppt = typeof item.appointmentId === 'object' && item.appointmentId._id ? item.appointmentId._id : item.appointmentId;
            const appt = await AppointmentMaster.findById(rawAppt).lean();
            if (appt) item.appointmentId = appt;
        }

        // 5. Populate surgeryPlanId if present
        if (item.surgeryPlanId) {
            const rawSp = typeof item.surgeryPlanId === 'object' && item.surgeryPlanId._id ? item.surgeryPlanId._id : item.surgeryPlanId;
            const sp = await SurgeryPlanModel.findById(rawSp).lean();
            if (sp) item.surgeryPlanId = sp;
        }

        return item;
    }));

    return isArray ? populated : populated[0];
}

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
        const referringDoctorId = req.user._id;

        if (!patientId || !referredToDoctorId || !reason) {
            return res.status(400).json({ success: false, message: 'Patient, referred doctor, and reason are required' });
        }

        if (referringDoctorId.toString() === referredToDoctorId.toString()) {
            return res.status(400).json({ success: false, message: 'Cannot refer to yourself. Use "Create Surgery Plan" instead.' });
        }

        // Check referred doctor
        const referredDoctor = await DoctorMaster.findOne({ userId: referredToDoctorId, hospitalId }) ||
                               await DoctorMaster.findOne({ _id: referredToDoctorId, hospitalId }) ||
                               await UserMaster.findById(referredToDoctorId);

        if (!referredDoctor) {
            return res.status(400).json({ success: false, message: 'Referred doctor not found in this hospital' });
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

        const populated = await populateReferralData(referral, req);
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

        const doctorProfile = await DoctorMaster.findOne({ userId: doctorUserId });
        const orConditions = [{ referredToDoctorId: doctorUserId }];
        if (doctorProfile) {
            orConditions.push({ referredToDoctorId: doctorProfile._id });
        }

        const rawReferrals = await getReferralModel(req).find({
            hospitalId,
            $or: orConditions
        }).sort({ createdAt: -1 });

        const referrals = await populateReferralData(rawReferrals, req);
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
        const doctorUserId = req.user._id;

        const doctorProfile = await DoctorMaster.findOne({ userId: doctorUserId });
        const orConditions = [{ referringDoctorId: doctorUserId }];
        if (doctorProfile) {
            orConditions.push({ referringDoctorId: doctorProfile._id });
        }

        const rawReferrals = await getReferralModel(req).find({
            hospitalId,
            $or: orConditions
        }).sort({ createdAt: -1 });

        const referrals = await populateReferralData(rawReferrals, req);
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

        const rawReferrals = await getReferralModel(req).find({
            hospitalId,
            patientId
        }).sort({ createdAt: -1 });

        const referrals = await populateReferralData(rawReferrals, req);
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

        const rawReferral = await getReferralModel(req).findOne({ _id: id, hospitalId });
        if (!rawReferral) {
            return res.status(404).json({ success: false, message: 'Referral not found' });
        }

        const referral = await populateReferralData(rawReferral, req);
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

        const doctorProfile = await DoctorMaster.findOne({ userId: req.user._id });
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

        const populated = await populateReferralData(referral, req);
        res.json({ success: true, message: `Referral ${status.toLowerCase()}`, referral: populated });
    } catch (err) {
        console.error('Error reviewing referral:', err);
        res.status(500).json({ success: false, message: 'Error reviewing referral' });
    }
});

module.exports = router;
