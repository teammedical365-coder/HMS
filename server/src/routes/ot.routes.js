const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth.middleware');
const OTRoomMaster = require('../models/otRoom.model');
const SurgeryPlanMaster = require('../models/surgeryPlan.model');
const FacilityChargeMaster = require('../models/facilityCharge.model');
const DoctorMaster = require('../models/doctor.model');
const UserMaster = require('../models/user.model');
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

// Helper: robustly populate surgery plan fields from Master User/Doctor and Tenant/Master OTRoom
async function populateSurgeryPlans(plans, req) {
    if (!plans) return null;
    const isArray = Array.isArray(plans);
    const list = isArray ? plans : [plans];

    const OTRoomModel = req?.tenantDb ? (getTenantModels(req.tenantDb).OTRoom || OTRoomMaster) : OTRoomMaster;

    const populated = await Promise.all(list.map(async (doc) => {
        const item = doc.toObject ? doc.toObject() : { ...doc };

        // 1. Populate patientId
        if (item.patientId) {
            const rawP = typeof item.patientId === 'object' && item.patientId._id ? item.patientId._id : item.patientId;
            const p = await UserMaster.findById(rawP).select('name email phone patientId mrn age gender dob').lean();
            if (p) {
                item.patientId = p;
            } else if (typeof item.patientId === 'object' && !item.patientId.name) {
                item.patientId = { _id: rawP, name: 'Patient', patientId: '-' };
            }
        }

        // 2. Populate surgeonId
        if (item.surgeonId) {
            const rawDoc = typeof item.surgeonId === 'object' && item.surgeonId._id ? item.surgeonId._id : item.surgeonId;
            let d = await UserMaster.findById(rawDoc).select('name email phone specialization firstName lastName').lean();
            if (!d) {
                d = await DoctorMaster.findById(rawDoc).select('name email phone specialization firstName lastName').lean();
            }
            if (!d) {
                d = await DoctorMaster.findOne({ userId: rawDoc }).select('name email phone specialization firstName lastName').lean();
            }
            if (d) item.surgeonId = d;
        }

        // 3. Populate doctorId (consulting doctor)
        if (item.doctorId) {
            const rawDoc = typeof item.doctorId === 'object' && item.doctorId._id ? item.doctorId._id : item.doctorId;
            let d = await UserMaster.findById(rawDoc).select('name email phone specialization firstName lastName').lean();
            if (!d) {
                d = await DoctorMaster.findById(rawDoc).select('name email phone specialization firstName lastName').lean();
            }
            if (!d) {
                d = await DoctorMaster.findOne({ userId: rawDoc }).select('name email phone specialization firstName lastName').lean();
            }
            if (d) item.doctorId = d;
        }

        // 4. Populate referringDoctorId
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

        // 5. Populate assistantSurgeonIds
        if (item.assistantSurgeonIds && Array.isArray(item.assistantSurgeonIds)) {
            item.assistantSurgeonIds = await Promise.all(item.assistantSurgeonIds.map(async (asId) => {
                const rawId = typeof asId === 'object' && asId._id ? asId._id : asId;
                let d = await UserMaster.findById(rawId).select('name email phone specialization firstName lastName').lean();
                if (!d) d = await DoctorMaster.findById(rawId).select('name email phone specialization firstName lastName').lean();
                if (!d) d = await DoctorMaster.findOne({ userId: rawId }).select('name email phone specialization firstName lastName').lean();
                return d || { _id: rawId, name: 'Doctor' };
            }));
        }

        // 6. Populate otRoomId
        if (item.otRoomId) {
            const rawRoom = typeof item.otRoomId === 'object' && item.otRoomId._id ? item.otRoomId._id : item.otRoomId;
            const r = await OTRoomModel.findById(rawRoom).select('name status').lean() || await OTRoomMaster.findById(rawRoom).select('name status').lean();
            if (r) item.otRoomId = r;
        }

        return item;
    }));

    return isArray ? populated : populated[0];
}

// Middleware for Admin access
const verifyAdminAccess = async (req, res, next) => {
    try {
        await verifyToken(req, res, async () => {
            const roleName = (req.user._roleData?.name || String(req.user.role || '')).toLowerCase().replace(/\s+/g, '');
            const perms = req.user._roleData?.permissions || [];
            const allowed = ['hospitaladmin', 'centraladmin', 'superadmin', 'admin', 'otmanager', 'otstaff', 'doctor'];
            if (allowed.includes(roleName) || perms.includes('ot_manage') || perms.includes('*')) {
                await resolveTenant(req, res, next);
            } else {
                res.status(403).json({ success: false, message: 'Admin / OT access required for OT Dashboard' });
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
            const perms = req.user._roleData?.permissions || [];
            const allowed = ['hospitaladmin', 'centraladmin', 'superadmin', 'admin', 'otmanager', 'otstaff', 'doctor'];
            if (allowed.includes(roleName) || perms.includes('ot_manage') || perms.includes('*')) {
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
        
        // Find today's date bounds
        const now = new Date();
        const startOfToday = new Date(now);
        startOfToday.setHours(0, 0, 0, 0);
        const endOfToday = new Date(now);
        endOfToday.setHours(23, 59, 59, 999);

        // Active surgery statuses for today
        const activeStatuses = ['SCHEDULED', 'ADMITTED', 'PRE_OP', 'READY_FOR_OT', 'IN_OT', 'SURGERY_COMPLETED', 'POST_OP'];

        // 1. Today's surgeries
        const todaySurgeries = await SurgeryPlan.countDocuments({
            hospitalId,
            status: { $in: activeStatuses },
            surgeryDate: { $gte: startOfToday, $lte: endOfToday }
        });

        // 2. Upcoming surgeries (future scheduled dates)
        const upcomingSurgeries = await SurgeryPlan.countDocuments({ 
            hospitalId, 
            status: { $in: ['SCHEDULED', 'ADMITTED', 'PRE_OP', 'READY_FOR_OT'] },
            surgeryDate: { $gt: endOfToday }
        });

        // 3. Planned patients
        const plannedPatients = await SurgeryPlan.countDocuments({ hospitalId, status: 'PLANNED' });

        // 4. Pre-Op patients
        const preOpPatients = await SurgeryPlan.countDocuments({ 
            hospitalId, 
            status: 'PRE_OP' 
        });

        // 5. Post-Op patients
        const postOpPatients = await SurgeryPlan.countDocuments({ 
            hospitalId, 
            status: 'POST_OP' 
        });

        // 6. Occupied Rooms (status is 'Occupied' or has active surgery currently IN_OT)
        const inOtSurgeries = await SurgeryPlan.find({
            hospitalId,
            status: 'IN_OT'
        });

        const inOtRoomIds = new Set(
            inOtSurgeries
                .filter(s => s.otRoomId)
                .map(s => s.otRoomId.toString())
        );

        const occupiedRooms = allRooms.filter(r => 
            r.status === 'Occupied' || inOtRoomIds.has(r._id.toString())
        ).length;

        // 7. Available Rooms
        const availableRooms = allRooms.filter(r => 
            r.status !== 'Maintenance' && r.status !== 'Occupied' && !inOtRoomIds.has(r._id.toString())
        ).length;

        res.json({
            success: true,
            stats: {
                todaySurgeries,
                upcomingSurgeries,
                availableRooms,
                occupiedRooms,
                preOpPatients,
                postOpPatients,
                plannedPatients
            }
        });
    } catch (err) {
        console.error('OT dashboard stats error:', err);
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

// GET /api/ot/room-status — Live OT Room Board
router.get('/room-status', verifyAdminAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const OTRoom = getOTRoomModel(req);
        const SurgeryPlan = getSurgeryPlanModel(req);
        const { date } = req.query;

        const targetDate = date ? new Date(date) : new Date();
        const startOfToday = new Date(targetDate);
        startOfToday.setHours(0, 0, 0, 0);
        const endOfToday = new Date(targetDate);
        endOfToday.setHours(23, 59, 59, 999);

        const allRooms = await OTRoom.find({ hospitalId }).sort({ name: 1 }).lean();

        // Fetch all non-cancelled surgeries scheduled for today
        const rawTodaySurgeries = await SurgeryPlan.find({
            hospitalId,
            status: { $ne: 'CANCELLED' },
            surgeryDate: { $gte: startOfToday, $lte: endOfToday }
        })
        .sort({ startTime: 1, createdAt: 1 })
        .lean();

        const todaySurgeries = await populateSurgeryPlans(rawTodaySurgeries, req);

        // Time helper for delay checking
        const now = new Date();
        const currentTimeVal = now.getHours() * 60 + now.getMinutes();

        const parseTimeMinutes = (timeStr) => {
            if (!timeStr) return 9999;
            const match = String(timeStr).match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i);
            if (!match) return 9999;
            let h = parseInt(match[1], 10);
            const m = parseInt(match[2], 10);
            const mer = match[3];
            if (mer) {
                if (mer.toUpperCase() === 'PM' && h < 12) h += 12;
                if (mer.toUpperCase() === 'AM' && h === 12) h = 0;
            }
            return h * 60 + m;
        };

        const roomCards = allRooms.map(room => {
            // Find today's surgeries assigned to this room
            const roomSurgeries = todaySurgeries.filter(s => 
                s.otRoomId && String(s.otRoomId._id || s.otRoomId) === String(room._id)
            );

            // 1. Check if room is under maintenance
            if (room.status === 'Maintenance') {
                return {
                    _id: room._id,
                    name: room.name,
                    status: 'MAINTENANCE',
                    notes: room.notes || '',
                    currentSurgery: null,
                    nextSurgery: null
                };
            }

            // 2. Check if there is an active IN_OT surgery
            const currentInOt = roomSurgeries.find(s => s.status === 'IN_OT');
            if (currentInOt) {
                const nextSur = roomSurgeries.find(s => 
                    String(s._id) !== String(currentInOt._id) && 
                    !['IN_OT', 'SURGERY_COMPLETED', 'POST_OP', 'COMPLETED', 'CANCELLED'].includes(s.status)
                );
                return {
                    _id: room._id,
                    name: room.name,
                    status: 'IN_OT',
                    notes: room.notes || '',
                    currentSurgery: currentInOt,
                    nextSurgery: nextSur || null
                };
            }

            // 3. Check if there is a waiting surgery whose scheduled start time has passed (DELAYED)
            const waitingSurgeries = roomSurgeries.filter(s => 
                ['SCHEDULED', 'ADMITTED', 'PRE_OP', 'READY_FOR_OT'].includes(s.status)
            );

            const delayedSurgery = waitingSurgeries.find(s => {
                const sTime = parseTimeMinutes(s.startTime);
                return currentTimeVal > sTime;
            });

            if (delayedSurgery) {
                const nextSur = waitingSurgeries.find(s => String(s._id) !== String(delayedSurgery._id));
                return {
                    _id: room._id,
                    name: room.name,
                    status: 'DELAYED',
                    notes: room.notes || '',
                    currentSurgery: delayedSurgery,
                    nextSurgery: nextSur || null
                };
            }

            // 4. Check if there is an upcoming scheduled surgery today
            const upcomingSurgery = waitingSurgeries[0];
            if (upcomingSurgery) {
                return {
                    _id: room._id,
                    name: room.name,
                    status: 'SCHEDULED',
                    notes: room.notes || '',
                    currentSurgery: null,
                    nextSurgery: upcomingSurgery
                };
            }

            // 5. Room is completely AVAILABLE
            return {
                _id: room._id,
                name: room.name,
                status: 'AVAILABLE',
                notes: room.notes || '',
                currentSurgery: null,
                nextSurgery: null
            };
        });

        // Summary counts
        const summary = {
            total: roomCards.length,
            available: roomCards.filter(r => r.status === 'AVAILABLE').length,
            scheduled: roomCards.filter(r => r.status === 'SCHEDULED').length,
            inOt: roomCards.filter(r => r.status === 'IN_OT').length,
            delayed: roomCards.filter(r => r.status === 'DELAYED').length,
            maintenance: roomCards.filter(r => r.status === 'MAINTENANCE').length
        };

        res.json({
            success: true,
            summary,
            rooms: roomCards
        });
    } catch (err) {
        console.error('Error fetching OT room status:', err);
        res.status(500).json({ success: false, message: 'Error fetching OT room status' });
    }
});

// GET /api/ot/workflow-alerts — Patient Workflow Pipeline & Attention Required Alerts
router.get('/workflow-alerts', verifyAdminAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const SurgeryPlan = getSurgeryPlanModel(req);
        const { date } = req.query;

        const targetDate = date ? new Date(date) : new Date();
        const startOfToday = new Date(targetDate);
        startOfToday.setHours(0, 0, 0, 0);
        const endOfToday = new Date(targetDate);
        endOfToday.setHours(23, 59, 59, 999);

        // Fetch all today's surgeries
        const rawTodaySurgeries = await SurgeryPlan.find({
            hospitalId,
            surgeryDate: { $gte: startOfToday, $lte: endOfToday }
        })
        .sort({ startTime: 1, createdAt: 1 })
        .lean();

        const allTodaySurgeries = await populateSurgeryPlans(rawTodaySurgeries, req);

        // 1. Compute Workflow Summary Counts for active non-cancelled surgeries
        const activeSurgeries = allTodaySurgeries.filter(s => s.status !== 'CANCELLED');

        const workflowSummary = {
            total: activeSurgeries.length,
            scheduled: activeSurgeries.filter(s => s.status === 'SCHEDULED').length,
            admitted: activeSurgeries.filter(s => s.status === 'ADMITTED').length,
            preOp: activeSurgeries.filter(s => s.status === 'PRE_OP').length,
            readyForOt: activeSurgeries.filter(s => s.status === 'READY_FOR_OT').length,
            inOt: activeSurgeries.filter(s => s.status === 'IN_OT').length,
            completed: activeSurgeries.filter(s => s.status === 'SURGERY_COMPLETED' || s.status === 'COMPLETED').length,
            postOp: activeSurgeries.filter(s => s.status === 'POST_OP').length
        };

        // 2. Helper for time in minutes
        const parseTimeMinutes = (timeStr) => {
            if (!timeStr) return null;
            const match = String(timeStr).match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i);
            if (!match) return null;
            let h = parseInt(match[1], 10);
            const m = parseInt(match[2], 10);
            const mer = match[3];
            if (mer) {
                if (mer.toUpperCase() === 'PM' && h < 12) h += 12;
                if (mer.toUpperCase() === 'AM' && h === 12) h = 0;
            }
            return h * 60 + m;
        };

        const now = new Date();
        const currentTimeVal = now.getHours() * 60 + now.getMinutes();

        // 3. Compute Attention Required Alerts
        const alerts = [];

        // Check for Room Overlap Conflicts (Critical)
        const roomBookings = {};
        activeSurgeries.forEach(s => {
            if (s.otRoomId && s.startTime && s.endTime) {
                const rId = String(s.otRoomId._id || s.otRoomId);
                const startM = parseTimeMinutes(s.startTime);
                const endM = parseTimeMinutes(s.endTime);
                if (startM !== null && endM !== null) {
                    if (!roomBookings[rId]) roomBookings[rId] = [];
                    roomBookings[rId].push({ surgery: s, startM, endM });
                }
            }
        });

        Object.entries(roomBookings).forEach(([rId, bookings]) => {
            for (let i = 0; i < bookings.length; i++) {
                for (let j = i + 1; j < bookings.length; j++) {
                    const b1 = bookings[i];
                    const b2 = bookings[j];
                    if (b1.startM < b2.endM && b2.startM < b1.endM) {
                        alerts.push({
                            id: `conflict-room-${b1.surgery._id}-${b2.surgery._id}`,
                            type: 'OT_CONFLICT',
                            severity: 'CRITICAL',
                            priorityOrder: 1,
                            title: `OT Scheduling Conflict in ${b1.surgery.otRoomId?.name || 'OT Room'}`,
                            message: `Overlapping surgeries: "${b1.surgery.surgery}" (${b1.surgery.startTime}-${b1.surgery.endTime}) and "${b2.surgery.surgery}" (${b2.surgery.startTime}-${b2.surgery.endTime}).`,
                            surgeryId: b1.surgery._id,
                            surgeryData: b1.surgery
                        });
                    }
                }
            }
        });

        // Check for Surgeon Overlap Conflicts (Critical)
        const surgeonBookings = {};
        activeSurgeries.forEach(s => {
            if (s.surgeonId && s.startTime && s.endTime) {
                const sId = String(s.surgeonId._id || s.surgeonId);
                const startM = parseTimeMinutes(s.startTime);
                const endM = parseTimeMinutes(s.endTime);
                if (startM !== null && endM !== null) {
                    if (!surgeonBookings[sId]) surgeonBookings[sId] = [];
                    surgeonBookings[sId].push({ surgery: s, startM, endM });
                }
            }
        });

        Object.entries(surgeonBookings).forEach(([sId, bookings]) => {
            for (let i = 0; i < bookings.length; i++) {
                for (let j = i + 1; j < bookings.length; j++) {
                    const b1 = bookings[i];
                    const b2 = bookings[j];
                    if (b1.startM < b2.endM && b2.startM < b1.endM) {
                        const surgeonName = b1.surgery.surgeonId?.name || 'Surgeon';
                        alerts.push({
                            id: `conflict-surgeon-${b1.surgery._id}-${b2.surgery._id}`,
                            type: 'SURGEON_CONFLICT',
                            severity: 'CRITICAL',
                            priorityOrder: 1,
                            title: `Surgeon Conflict for Dr. ${surgeonName.replace(/^Dr\.?\s*/i, '')}`,
                            message: `Overlapping schedule across surgeries: "${b1.surgery.surgery}" and "${b2.surgery.surgery}".`,
                            surgeryId: b1.surgery._id,
                            surgeryData: b1.surgery
                        });
                    }
                }
            }
        });

        // Check per-surgery alerts
        activeSurgeries.forEach(s => {
            const startM = parseTimeMinutes(s.startTime);
            const patientName = s.patientId?.name || 'Patient';
            const roomName = s.otRoomId?.name || 'Not Assigned';

            // 1. Surgery Delayed (Critical)
            if (startM !== null && currentTimeVal > startM && ['SCHEDULED', 'ADMITTED', 'PRE_OP', 'READY_FOR_OT'].includes(s.status)) {
                alerts.push({
                    id: `delayed-${s._id}`,
                    type: 'DELAYED',
                    severity: 'CRITICAL',
                    priorityOrder: 2,
                    title: `Surgery Delayed — ${s.surgery}`,
                    message: `${patientName} was scheduled at ${s.startTime || '--:--'} in ${roomName}. Current status is still ${s.status}.`,
                    surgeryId: s._id,
                    surgeryData: s
                });
            }

            // 2. Admission Required / Missing (Action Required)
            if (s.admissionRequired && s.status === 'SCHEDULED') {
                alerts.push({
                    id: `admission-missing-${s._id}`,
                    type: 'ADMISSION_REQUIRED',
                    severity: 'ACTION_REQUIRED',
                    priorityOrder: 3,
                    title: `Admission Required — ${patientName}`,
                    message: `Surgery "${s.surgery}" scheduled at ${s.startTime || '--:--'} requires inpatient admission before proceeding to Pre-Op.`,
                    surgeryId: s._id,
                    surgeryData: s
                });
            }

            // 3. Patient Not Ready (Approaching < 30 mins or scheduled time, but not ready)
            if (startM !== null && ['ADMITTED', 'PRE_OP'].includes(s.status)) {
                if (startM - currentTimeVal <= 30) {
                    alerts.push({
                        id: `patient-not-ready-${s._id}`,
                        type: 'PATIENT_NOT_READY',
                        severity: 'ACTION_REQUIRED',
                        priorityOrder: 4,
                        title: `Patient Not Ready — ${patientName}`,
                        message: `Surgery "${s.surgery}" at ${s.startTime || '--:--'} is in ${s.status}. Needs to be marked "Ready for OT".`,
                        surgeryId: s._id,
                        surgeryData: s
                    });
                }
            }

            // 4. Missing OT Room (Informational)
            if (!s.otRoomId) {
                alerts.push({
                    id: `missing-room-${s._id}`,
                    type: 'MISSING_ROOM',
                    severity: 'INFO',
                    priorityOrder: 5,
                    title: `OT Room Not Assigned — ${s.surgery}`,
                    message: `Surgery for ${patientName} scheduled at ${s.startTime || '--:--'} has no OT Room allocated.`,
                    surgeryId: s._id,
                    surgeryData: s
                });
            }
        });

        // Sort alerts by priorityOrder (Critical first, then Action Required, then Info)
        alerts.sort((a, b) => a.priorityOrder - b.priorityOrder);

        res.json({
            success: true,
            workflowSummary,
            patients: allTodaySurgeries,
            alerts
        });
    } catch (err) {
        console.error('Error fetching OT workflow alerts:', err);
        res.status(500).json({ success: false, message: 'Error fetching OT workflow alerts' });
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

// Helper to generate atomic sequential plan ID (e.g. SP-2026-0001)
const generatePlanId = async (SurgeryPlan, hospitalId) => {
    const year = new Date().getFullYear();
    const prefix = `SP-${year}-`;
    const latest = await SurgeryPlan.findOne({ hospitalId, planId: new RegExp(`^${prefix}`) })
        .sort({ createdAt: -1 })
        .lean();
    let nextSeq = 1;
    if (latest && latest.planId) {
        const parts = latest.planId.split('-');
        const lastNum = parseInt(parts[parts.length - 1], 10);
        if (!isNaN(lastNum)) {
            nextSeq = lastNum + 1;
        }
    }
    return `${prefix}${String(nextSeq).padStart(4, '0')}`;
};

// POST /api/ot/surgery-plans — Create a new clinical surgery plan
router.post('/surgery-plans', verifyDoctorOrAdminAccess, async (req, res) => {
    try {
        const { patientId, appointmentId, surgeonId, surgery, diagnosis, preferredDate, preferredTime, admissionRequired, admissionDate, preOpRequired, notes, referralId, referringDoctorId } = req.body;
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const doctorId = req.user._id;

        if (!patientId || !surgeonId || !surgery || !preferredDate || !preferredTime) {
            return res.status(400).json({ success: false, message: 'Missing required fields (patientId, surgeonId, surgery, preferredDate, preferredTime)' });
        }

        const SurgeryPlan = getSurgeryPlanModel(req);
        const planId = await generatePlanId(SurgeryPlan, hospitalId);

        let finalReferringDoctorId = referringDoctorId;
        if (referralId && !finalReferringDoctorId) {
            try {
                const Referral = require('../models/referral.model');
                const ref = await Referral.findById(referralId).lean();
                if (ref) finalReferringDoctorId = ref.referringDoctorId;
            } catch (refE) { /* non-fatal */ }
        }

        const plan = new SurgeryPlan({
            hospitalId,
            planId,
            patientId,
            doctorId,
            surgeonId,
            appointmentId,
            referralId: referralId || undefined,
            referringDoctorId: finalReferringDoctorId || undefined,
            surgery,
            diagnosis,
            preferredDate,
            preferredTime,
            admissionRequired: !!admissionRequired,
            admissionDate: admissionRequired ? admissionDate : null,
            preOpRequired: !!preOpRequired,
            notes,
            status: 'PLANNED',
            createdBy: req.user._id
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
            }
        }

        const savedPlan = await SurgeryPlan.findById(plan._id).lean();
        const populated = await populateSurgeryPlans(savedPlan, req);

        res.status(201).json({ success: true, message: 'Surgery Plan created successfully', plan: populated });
    } catch (err) {
        console.error("Error creating surgery plan:", err);
        res.status(500).json({ success: false, message: err.message || 'Error creating Surgery Plan' });
    }
});

// GET /api/ot/surgery-plans/planned — All PLANNED surgeries for OT Manager & scheduling bridge
router.get('/surgery-plans/planned', verifyDoctorOrAdminAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const SurgeryPlan = getSurgeryPlanModel(req);

        const rawPlans = await SurgeryPlan.find({ hospitalId, status: 'PLANNED' })
            .sort({ preferredDate: 1, createdAt: -1 })
            .lean();

        const plans = await populateSurgeryPlans(rawPlans, req);
        res.json({ success: true, plans, data: plans });
    } catch (err) {
        console.error('Error fetching planned surgeries:', err);
        res.status(500).json({ success: false, message: 'Error fetching planned surgeries' });
    }
});

// GET /api/ot/surgery-plans/surgeon/my — Surgery plans assigned to the logged-in operating surgeon
router.get('/surgery-plans/surgeon/my', verifyDoctorOrAdminAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const doctorUserId = req.user._id;
        const SurgeryPlan = getSurgeryPlanModel(req);

        const Doctor = require('../models/doctor.model');
        const doctorProfile = await Doctor.findOne({ userId: doctorUserId }).lean();

        const orConditions = [
            { surgeonId: doctorUserId },
            { doctorId: doctorUserId }
        ];
        if (doctorProfile) {
            orConditions.push({ surgeonId: doctorProfile._id });
        }

        const rawPlans = await SurgeryPlan.find({
            hospitalId,
            $or: orConditions
        })
            .sort({ createdAt: -1 })
            .lean();

        const plans = await populateSurgeryPlans(rawPlans, req);
        res.json({ success: true, plans, data: plans });
    } catch (err) {
        console.error('Error fetching surgeon surgery plans:', err);
        res.status(500).json({ success: false, message: 'Error fetching surgeon surgery plans' });
    }
});

// GET /api/ot/surgery-plans/patient/:patientId — Surgery plans for a specific patient
router.get('/surgery-plans/patient/:patientId', verifyDoctorOrAdminAccess, async (req, res) => {
    try {
        const { patientId } = req.params;
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const SurgeryPlan = getSurgeryPlanModel(req);

        const rawPlans = await SurgeryPlan.find({ hospitalId, patientId })
            .sort({ createdAt: -1 })
            .lean();

        const plans = await populateSurgeryPlans(rawPlans, req);
        res.json({ success: true, plans, data: plans });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Error fetching patient Surgery Plans' });
    }
});

// GET /api/ot/surgery-plans/:id — Single surgery plan details
router.get('/surgery-plans/:id', verifyDoctorOrAdminAccess, async (req, res) => {
    try {
        const { id } = req.params;
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const SurgeryPlan = getSurgeryPlanModel(req);

        const rawPlan = await SurgeryPlan.findOne({ _id: id, hospitalId })
            .populate('referralId')
            .lean();

        if (!rawPlan) return res.status(404).json({ success: false, message: 'Surgery Plan not found' });

        const plan = await populateSurgeryPlans(rawPlan, req);
        res.json({ success: true, plan, data: plan });
    } catch (err) {
        console.error('Error fetching surgery plan details:', err);
        res.status(500).json({ success: false, message: 'Error fetching surgery plan details' });
    }
});

// GET /api/ot/today-schedule — Dedicated endpoint for Today's OT Schedule
router.get('/today-schedule', verifyAdminAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const SurgeryPlan = getSurgeryPlanModel(req);
        const { date } = req.query;

        const targetDate = date ? new Date(date) : new Date();
        const startOfToday = new Date(targetDate);
        startOfToday.setHours(0, 0, 0, 0);
        const endOfToday = new Date(targetDate);
        endOfToday.setHours(23, 59, 59, 999);

        // Include all surgery plans scheduled for today
        const query = {
            hospitalId,
            surgeryDate: { $gte: startOfToday, $lte: endOfToday }
        };

        const rawTodaySurgeries = await SurgeryPlan.find(query)
            .sort({ startTime: 1, createdAt: 1 })
            .lean();

        const todaySurgeries = await populateSurgeryPlans(rawTodaySurgeries, req);
        res.json({ success: true, surgeries: todaySurgeries, scheduled: todaySurgeries });
    } catch (err) {
        console.error('Error fetching today OT schedule:', err);
        res.status(500).json({ success: false, message: 'Error fetching today OT schedule' });
    }
});

// GET /api/ot/surgery-plans/scheduled
router.get('/surgery-plans/scheduled', verifyAdminAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const SurgeryPlan = getSurgeryPlanModel(req);
        const { date } = req.query;

        const activeStatuses = ['SCHEDULED', 'ADMITTED', 'PRE_OP', 'READY_FOR_OT', 'IN_OT', 'SURGERY_COMPLETED', 'POST_OP', 'COMPLETED', 'CANCELLED'];
        let query = { hospitalId, status: { $in: activeStatuses } };
        if (date) {
            const startDate = new Date(date);
            startDate.setHours(0,0,0,0);
            const endDate = new Date(date);
            endDate.setHours(23,59,59,999);
            query.surgeryDate = { $gte: startDate, $lte: endDate };
        }

        const rawScheduled = await SurgeryPlan.find(query)
            .sort({ startTime: 1, createdAt: 1 })
            .lean();

        const scheduled = await populateSurgeryPlans(rawScheduled, req);
        res.json({ success: true, scheduled, surgeries: scheduled });
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

// POST & PUT /api/ot/surgery-plans/:id/schedule — Schedule surgery with Operating Surgeon, Assistants & Surgery Charge
const handleScheduleSurgery = async (req, res) => {
    try {
        const { id } = req.params;
        const { 
            otRoomId, 
            surgeryDate, 
            startTime, 
            endTime, 
            surgeonId, 
            assistantSurgeonIds = [], 
            surgeryCost, 
            priority, 
            notes 
        } = req.body;
        const hospitalId = req.hospitalId || req.user.hospitalId;

        if (!otRoomId || !surgeryDate || !startTime || !endTime || !surgeonId) {
            return res.status(400).json({ success: false, message: 'Missing required fields (OT Room, Surgery Date, Start Time, End Time, Operating Surgeon)' });
        }
        if (startTime >= endTime) {
            return res.status(400).json({ success: false, message: 'End time must be after start time' });
        }

        const primarySurgeonIdStr = String(surgeonId._id || surgeonId);

        // Validate Assistant Doctors
        let cleanAssistants = [];
        if (Array.isArray(assistantSurgeonIds)) {
            const seenAssistants = new Set();
            for (const asId of assistantSurgeonIds) {
                if (!asId) continue;
                const asIdStr = String(asId._id || asId);
                if (asIdStr === primarySurgeonIdStr) {
                    return res.status(400).json({ 
                        success: false, 
                        message: 'The Operating Surgeon cannot also be added as a Surgical Assistant.' 
                    });
                }
                if (seenAssistants.has(asIdStr)) {
                    return res.status(400).json({ 
                        success: false, 
                        message: 'Duplicate assistant detected. The same assistant doctor cannot be added more than once.' 
                    });
                }
                seenAssistants.add(asIdStr);
                cleanAssistants.push(asIdStr);
            }
        }

        const SurgeryPlan = getSurgeryPlanModel(req);
        
        // Conflict check (exclude current plan ID if rescheduling)
        const conflictCheck = await checkConflict(SurgeryPlan, hospitalId, otRoomId, primarySurgeonIdStr, surgeryDate, startTime, endTime, id);
        if (conflictCheck.conflict) {
            return res.status(409).json({ success: false, message: conflictCheck.message });
        }

        const existingPlan = await SurgeryPlan.findOne({ _id: id, hospitalId });
        if (!existingPlan) return res.status(404).json({ success: false, message: 'Surgery Plan not found' });

        const cost = Number(surgeryCost) >= 0 ? Number(surgeryCost) : (existingPlan.surgeryCost || 0);

        // Surgery Charge Integration: Create or Update FacilityCharge linked to this patient & surgery
        let facilityChargeId = existingPlan.facilityChargeId;
        const FacilityChargeModel = req.tenantDb ? (getTenantModels(req.tenantDb).FacilityCharge || FacilityChargeMaster) : FacilityChargeMaster;

        if (cost > 0) {
            if (facilityChargeId) {
                await FacilityChargeModel.findByIdAndUpdate(facilityChargeId, {
                    totalAmount: cost,
                    pricePerDay: cost,
                    facilityName: `Surgery: ${existingPlan.surgery}`
                });
            } else {
                const newCharge = new FacilityChargeModel({
                    hospitalId,
                    patientId: existingPlan.patientId,
                    facilityName: `Surgery: ${existingPlan.surgery}`,
                    pricePerDay: cost,
                    days: 1,
                    daysUsed: 1,
                    totalAmount: cost,
                    paymentStatus: 'Pending',
                    addedBy: req.user._id || req.user.userId,
                    collectedBy: req.user._id || req.user.userId
                });
                await newCharge.save();
                facilityChargeId = newCharge._id;
            }
        }

        const updateData = {
            otRoomId,
            surgeryDate,
            startTime,
            endTime,
            surgeonId: primarySurgeonIdStr,
            assistantSurgeonIds: cleanAssistants,
            surgeryCost: cost,
            priority: priority || existingPlan.priority || 'Normal',
            notes: notes !== undefined ? notes : existingPlan.notes,
            facilityChargeId: facilityChargeId || undefined,
            status: 'SCHEDULED'
        };

        const plan = await SurgeryPlan.findOneAndUpdate(
            { _id: id, hospitalId },
            { $set: updateData },
            { new: true }
        ).lean();

        // Broadcast real-time Socket event
        try {
            const io = req.app.get('io');
            if (io) {
                io.to(hospitalId.toString()).emit('ot_surgery_scheduled', { planId: plan._id, surgery: plan.surgery });
                io.to('ot manager').emit('ot_surgery_scheduled', { planId: plan._id, surgery: plan.surgery });
            }
        } catch (sockErr) {
            console.error('Socket broadcast error:', sockErr);
        }

        const populated = await populateSurgeryPlans(plan, req);
        res.json({ success: true, message: 'Surgery scheduled successfully', plan: populated });
    } catch (err) {
        console.error('Error scheduling surgery:', err);
        res.status(500).json({ success: false, message: 'Error scheduling surgery' });
    }
};

router.post('/surgery-plans/:id/schedule', verifyDoctorOrAdminAccess, handleScheduleSurgery);
router.put('/surgery-plans/:id/schedule', verifyDoctorOrAdminAccess, handleScheduleSurgery);

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
        ).lean();

        if (!plan) return res.status(404).json({ success: false, message: 'Surgery Plan not found' });

        const populated = await populateSurgeryPlans(plan, req);
        res.json({ success: true, message: 'Surgery cancelled successfully', plan: populated });
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
        const updated = await SurgeryPlan.findById(plan._id).lean();
        const populated = await populateSurgeryPlans(updated, req);
        res.json({ success: true, message: `Surgery status updated to ${status}`, plan: populated });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Error updating workflow status' });
    }
});

module.exports = router;
