const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth.middleware');
const OTRoomMaster = require('../models/otRoom.model');
const SurgeryPlanMaster = require('../models/surgeryPlan.model');
const { getTenantModels } = require('../db/tenantModels');
const { resolveTenant } = require('../middleware/tenantMiddleware');

const getOTRoomModel = (req) => {
    if (req.tenantDb) return getTenantModels(req.tenantDb).OTRoom || OTRoomMaster;
    return OTRoomMaster;
};

const getSurgeryPlanModel = (req) => {
    if (req.tenantDb) return getTenantModels(req.tenantDb).SurgeryPlan || SurgeryPlanMaster;
    return SurgeryPlanMaster;
};

// Middleware for Admin access
const verifyAdminAccess = async (req, res, next) => {
    try {
        await verifyToken(req, res, async () => {
            const roleName = (req.user._roleData?.name || String(req.user.role || '')).toLowerCase().replace(/\s+/g, '');
            const allowed = ['hospitaladmin', 'centraladmin', 'superadmin', 'admin', 'otmanager', 'otstaff'];
            if (allowed.includes(roleName)) {
                await resolveTenant(req, res, next);
            } else {
                res.status(403).json({ success: false, message: 'Admin access required for OT Dashboard' });
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal error' });
    }
};

// Middleware for Doctor or Admin access
const verifyDoctorOrAdminAccess = async (req, res, next) => {
    try {
        await verifyToken(req, res, async () => {
            const roleName = (req.user._roleData?.name || String(req.user.role || '')).toLowerCase().replace(/\s+/g, '');
            const allowed = ['hospitaladmin', 'centraladmin', 'superadmin', 'admin', 'doctor'];
            if (allowed.includes(roleName)) {
                await resolveTenant(req, res, next);
            } else {
                res.status(403).json({ success: false, message: 'Access denied' });
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal error' });
    }
};

// GET /api/ot/dashboard-stats
router.get('/dashboard-stats', verifyAdminAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const OTRoom = getOTRoomModel(req);
        const SurgeryPlan = getSurgeryPlanModel(req);

        const allRooms = await OTRoom.find({ hospitalId });
        
        // Find today's scheduled surgeries
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        const endOfToday = new Date();
        endOfToday.setHours(23, 59, 59, 999);

        const todaySurgeriesList = await SurgeryPlan.find({
            hospitalId,
            status: 'SCHEDULED',
            surgeryDate: { $gte: startOfToday, $lte: endOfToday }
        });

        // Determine currently occupied rooms
        const now = new Date();
        const currentHourMin = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
        
        const occupiedRoomIds = new Set(todaySurgeriesList.filter(s => {
            return s.startTime <= currentHourMin && s.endTime >= currentHourMin;
        }).map(s => s.otRoomId?.toString()));

        const availableRooms = allRooms.filter(r => !occupiedRoomIds.has(r._id.toString())).length;
        const occupiedRooms = occupiedRoomIds.size;

        const todaySurgeries = todaySurgeriesList.length;

        const upcomingSurgeries = await SurgeryPlan.countDocuments({ 
            hospitalId, 
            status: 'SCHEDULED',
            surgeryDate: { $gt: endOfToday } // Future dates
        });

        const plannedSurgeries = await SurgeryPlan.countDocuments({ hospitalId, status: 'PLANNED' });

        const preOpPatients = 0;
        const postOpPatients = 0;

        res.json({
            success: true,
            stats: {
                todaySurgeries,
                upcomingSurgeries,
                plannedSurgeries,
                availableRooms,
                occupiedRooms,
                preOpPatients,
                postOpPatients
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Error fetching OT dashboard stats' });
    }
});


// GET /api/ot/rooms
router.get('/rooms', verifyDoctorOrAdminAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const OTRoom = getOTRoomModel(req);

        const rooms = await OTRoom.find({ hospitalId }).sort({ name: 1 });
        res.json({ success: true, rooms });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Error fetching OT rooms' });
    }
});

// POST /api/ot/rooms (for minimal setup purposes if they want to add test rooms)
router.post('/rooms', verifyAdminAccess, async (req, res) => {
    try {
        const { name, status, notes } = req.body;
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const OTRoom = getOTRoomModel(req);

        const existing = await OTRoom.findOne({ hospitalId, name });
        if (existing) return res.status(400).json({ success: false, message: 'OT Room name already exists' });

        const room = new OTRoom({ hospitalId, name, status: status || 'Available', notes });
        await room.save();
        res.json({ success: true, message: 'OT Room created', room });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Error creating OT room' });
    }
});

// POST /api/ot/surgery-plans
router.post('/surgery-plans', verifyDoctorOrAdminAccess, async (req, res) => {
    try {
        const { patientId, appointmentId, surgeonId, surgery, diagnosis, preferredDate, preferredTime, admissionRequired, admissionDate, preOpRequired, notes, referralId, referringDoctorId } = req.body;
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const doctorId = req.user._id;

        if (!patientId || !surgeonId || !surgery || !preferredDate || !preferredTime) {
            return res.status(400).json({ success: false, message: 'Missing required fields' });
        }

        const SurgeryPlan = getSurgeryPlanModel(req);

        const plan = new SurgeryPlan({
            hospitalId,
            patientId,
            doctorId,
            surgeonId,
            appointmentId,
            referralId: referralId || undefined,
            referringDoctorId: referringDoctorId || undefined,
            surgery,
            diagnosis,
            preferredDate,
            preferredTime,
            admissionRequired,
            admissionDate: admissionRequired ? admissionDate : null,
            preOpRequired,
            notes,
            status: 'PLANNED'
        });

        await plan.save();

        // If this surgery plan came from a referral, update the referral status
        if (referralId) {
            try {
                const Referral = require('../models/referral.model');
                await Referral.findByIdAndUpdate(referralId, {
                    status: 'SURGERY_PLANNED',
                    surgeryPlanId: plan._id
                });
            } catch (refErr) {
                console.error('Error updating referral status:', refErr);
                // Non-fatal: plan was still created
            }
        }

        res.json({ success: true, message: 'Surgery Plan created successfully', plan });
    } catch (err) {
        console.error("Error creating surgery plan:", err);
        res.status(500).json({ success: false, message: 'Error creating Surgery Plan' });
    }
});

// GET /api/ot/surgery-plans/patient/:patientId
router.get('/surgery-plans/patient/:patientId', verifyDoctorOrAdminAccess, async (req, res) => {
    try {
        const { patientId } = req.params;
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const SurgeryPlan = getSurgeryPlanModel(req);

        const plans = await SurgeryPlan.find({ hospitalId, patientId })
            .populate('surgeonId', 'name email phone')
            .populate('doctorId', 'name email phone')
            .sort({ createdAt: -1 });

        res.json({ success: true, plans });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Error fetching Surgery Plans' });
    }
});


// GET /api/ot/surgery-plans/scheduled
router.get('/surgery-plans/scheduled', verifyAdminAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const SurgeryPlan = getSurgeryPlanModel(req);
        const { date } = req.query; // optional date filter (YYYY-MM-DD)

        let query = { hospitalId, status: 'SCHEDULED' };
        if (date) {
            const startDate = new Date(date);
            startDate.setHours(0,0,0,0);
            const endDate = new Date(date);
            endDate.setHours(23,59,59,999);
            query.surgeryDate = { $gte: startDate, $lte: endDate };
        }

        const scheduled = await SurgeryPlan.find(query)
            .populate('patientId', 'name email phone mrn patientId')
            .populate('surgeonId', 'name email phone')
            .populate('otRoomId', 'name')
            .sort({ surgeryDate: 1, startTime: 1 });

        res.json({ success: true, scheduled });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Error fetching scheduled surgeries' });
    }
});

const checkConflict = async (SurgeryPlan, hospitalId, otRoomId, surgeonId, surgeryDate, startTime, endTime, excludePlanId = null) => {
    const sDate = new Date(surgeryDate);
    sDate.setHours(0,0,0,0);
    const eDate = new Date(surgeryDate);
    eDate.setHours(23,59,59,999);

    const query = {
        hospitalId,
        status: 'SCHEDULED',
        surgeryDate: { $gte: sDate, $lte: eDate }
    };

    if (excludePlanId) {
        query._id = { $ne: excludePlanId };
    }

    const existingSurgeries = await SurgeryPlan.find(query);

    for (let plan of existingSurgeries) {
        // Overlap condition: existingStart < newEnd && existingEnd > newStart
        if (plan.startTime < endTime && plan.endTime > startTime) {
            if (plan.otRoomId.toString() === otRoomId.toString()) {
                return { conflict: true, message: 'OT Room is already booked during the selected time.' };
            }
            if (plan.surgeonId.toString() === surgeonId.toString()) {
                return { conflict: true, message: 'Selected surgeon is already scheduled during this time.' };
            }
        }
    }
    return { conflict: false };
};

// POST /api/ot/surgery-plans/:id/schedule
router.post('/surgery-plans/:id/schedule', verifyDoctorOrAdminAccess, async (req, res) => {
    try {
        const { id } = req.params;
        const { otRoomId, surgeryDate, startTime, endTime, surgeonId } = req.body;
        const hospitalId = req.hospitalId || req.user.hospitalId;

        if (!otRoomId || !surgeryDate || !startTime || !endTime || !surgeonId) {
            return res.status(400).json({ success: false, message: 'Missing required fields' });
        }
        if (startTime >= endTime) {
            return res.status(400).json({ success: false, message: 'End time must be after start time' });
        }

        const SurgeryPlan = getSurgeryPlanModel(req);
        
        // Atomicity check
        const conflictCheck = await checkConflict(SurgeryPlan, hospitalId, otRoomId, surgeonId, surgeryDate, startTime, endTime);
        if (conflictCheck.conflict) {
            return res.status(409).json({ success: false, message: conflictCheck.message });
        }

        const plan = await SurgeryPlan.findOneAndUpdate(
            { _id: id, hospitalId },
            { $set: { otRoomId, surgeryDate, startTime, endTime, surgeonId, status: 'SCHEDULED' } },
            { new: true }
        );

        if (!plan) return res.status(404).json({ success: false, message: 'Surgery Plan not found' });

        res.json({ success: true, message: 'Surgery scheduled successfully', plan });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Error scheduling surgery' });
    }
});

// PUT /api/ot/surgery-plans/:id/schedule
router.put('/surgery-plans/:id/schedule', verifyDoctorOrAdminAccess, async (req, res) => {
    try {
        const { id } = req.params;
        const { otRoomId, surgeryDate, startTime, endTime, surgeonId } = req.body;
        const hospitalId = req.hospitalId || req.user.hospitalId;

        if (!otRoomId || !surgeryDate || !startTime || !endTime || !surgeonId) {
            return res.status(400).json({ success: false, message: 'Missing required fields' });
        }
        if (startTime >= endTime) {
            return res.status(400).json({ success: false, message: 'End time must be after start time' });
        }

        const SurgeryPlan = getSurgeryPlanModel(req);
        
        // Exclude current plan from conflict check
        const conflictCheck = await checkConflict(SurgeryPlan, hospitalId, otRoomId, surgeonId, surgeryDate, startTime, endTime, id);
        if (conflictCheck.conflict) {
            return res.status(409).json({ success: false, message: conflictCheck.message });
        }

        const plan = await SurgeryPlan.findOneAndUpdate(
            { _id: id, hospitalId },
            { $set: { otRoomId, surgeryDate, startTime, endTime, surgeonId, status: 'SCHEDULED' } },
            { new: true }
        );

        if (!plan) return res.status(404).json({ success: false, message: 'Surgery Plan not found' });

        res.json({ success: true, message: 'Scheduled surgery updated successfully', plan });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Error updating scheduled surgery' });
    }
});

// PUT /api/ot/surgery-plans/:id/cancel
router.put('/surgery-plans/:id/cancel', verifyDoctorOrAdminAccess, async (req, res) => {
    try {
        const { id } = req.params;
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const SurgeryPlan = getSurgeryPlanModel(req);

        const plan = await SurgeryPlan.findOneAndUpdate(
            { _id: id, hospitalId },
            { $set: { status: 'CANCELLED' } },
            { new: true }
        );

        if (!plan) return res.status(404).json({ success: false, message: 'Surgery Plan not found' });

        res.json({ success: true, message: 'Surgery cancelled successfully', plan });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Error cancelling surgery' });
    }
});


// PUT /api/ot/surgery-plans/:id/workflow
router.put('/surgery-plans/:id/workflow', verifyDoctorOrAdminAccess, async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const hospitalId = req.hospitalId || req.user.hospitalId;

        const validStatuses = ['ADMITTED', 'PRE_OP', 'READY_FOR_OT', 'IN_OT', 'SURGERY_COMPLETED', 'POST_OP'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ success: false, message: 'Invalid workflow status' });
        }

        const SurgeryPlan = getSurgeryPlanModel(req);
        const plan = await SurgeryPlan.findOne({ _id: id, hospitalId });
        if (!plan) return res.status(404).json({ success: false, message: 'Surgery Plan not found' });

        // Validate transitions
        const currentStatus = plan.status;
        let valid = false;

        switch(status) {
            case 'ADMITTED':
                valid = currentStatus === 'SCHEDULED';
                break;
            case 'PRE_OP':
                valid = currentStatus === 'ADMITTED' || currentStatus === 'SCHEDULED';
                break;
            case 'READY_FOR_OT':
                valid = currentStatus === 'PRE_OP';
                break;
            case 'IN_OT':
                valid = currentStatus === 'READY_FOR_OT';
                break;
            case 'SURGERY_COMPLETED':
                valid = currentStatus === 'IN_OT';
                break;
            case 'POST_OP':
                valid = currentStatus === 'SURGERY_COMPLETED';
                break;
        }

        if (!valid) {
            return res.status(400).json({ success: false, message: `Invalid transition from ${currentStatus} to ${status}` });
        }

        plan.status = status;

        if (status === 'IN_OT') {
            plan.actualStartTime = new Date();
        } else if (status === 'SURGERY_COMPLETED') {
            plan.actualEndTime = new Date();
        }

        await plan.save();
        res.json({ success: true, message: `Surgery status updated to ${status}`, plan });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Error updating workflow status' });
    }
});

module.exports = router;
