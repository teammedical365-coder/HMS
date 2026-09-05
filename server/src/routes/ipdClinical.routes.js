const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { verifyToken } = require('../middleware/auth.middleware');
const { resolveTenant } = require('../middleware/tenantMiddleware');
const { getTenantModels } = require('../db/tenantModels');

// Fallback Master Models if tenantDb is not set
const MasterAdmission = require('../models/admission.model');
const MasterInpatientOrder = require('../models/inpatientOrder.model');
const MasterMARRecord = require('../models/marRecord.model');
const MasterIPDVitals = require('../models/ipdVitals.model');
const MasterUser = require('../models/user.model');

// Helper: retrieve models bound to tenant connection
const getModels = (req) => {
    if (req.tenantDb) {
        return getTenantModels(req.tenantDb);
    }
    return {
        Admission: MasterAdmission,
        InpatientOrder: MasterInpatientOrder,
        MARRecord: MasterMARRecord,
        IPDVitals: MasterIPDVitals,
        User: MasterUser,
    };
};

// Helper: extract sanitized role name
const getUserRole = (req) => {
    return (req.user._roleData?.name || String(req.user.role || '')).toLowerCase().replace(/\s+/g, '');
};

const DOCTOR_ROLES = ['doctor', 'physician', 'surgeon', 'hospitaladmin', 'centraladmin', 'superadmin', 'admin'];
const NURSE_ROLES = ['nurse', 'staffnurse', 'headnurse', 'doctor', 'physician', 'surgeon', 'hospitaladmin', 'centraladmin', 'superadmin', 'admin'];

// Middleware: verify clinical order write permissions (Doctor & Admin only)
const requireDoctorAccess = (req, res, next) => {
    const role = getUserRole(req);
    const perms = req.user._roleData?.permissions || [];
    if (DOCTOR_ROLES.includes(role) || perms.includes('*') || perms.includes('doctor_access') || perms.includes('ipd_orders_manage')) {
        return next();
    }
    return res.status(403).json({ success: false, message: 'Doctor clinical order authorization required' });
};

// Middleware: verify clinical execution permissions (Nurse, Doctor & Admin)
const requireNurseOrDoctorAccess = (req, res, next) => {
    const role = getUserRole(req);
    const perms = req.user._roleData?.permissions || [];
    if (NURSE_ROLES.includes(role) || perms.includes('*') || perms.includes('nurse_access') || perms.includes('ipd_view')) {
        return next();
    }
    return res.status(403).json({ success: false, message: 'Nursing / Clinical authorization required' });
};

// ============================================================================
// SECTION A: INPATIENT ORDERS
// ============================================================================

// POST /api/ipd-clinical/orders — Create Inpatient Clinical Order (Doctor only)
router.post('/orders', verifyToken, resolveTenant, requireDoctorAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.user.hospitalId;
        if (!hospitalId) return res.status(403).json({ success: false, message: 'Hospital context required' });

        const {
            admissionId,
            patientId,
            medicineName,
            dosageValue,
            dosageUnit,
            route,
            frequency,
            startDate,
            endDate,
            duration,
            instructions,
            doctorId: overrideDoctorId
        } = req.body;

        if (!admissionId || !patientId || !medicineName) {
            return res.status(400).json({ success: false, message: 'admissionId, patientId, and medicineName are required' });
        }

        if (!mongoose.Types.ObjectId.isValid(admissionId) || !mongoose.Types.ObjectId.isValid(patientId)) {
            return res.status(400).json({ success: false, message: 'Invalid admissionId or patientId format' });
        }

        const { Admission, InpatientOrder, User } = getModels(req);

        // Validate Admission belongs to this hospital and matches patient
        const admission = await Admission.findOne({ _id: admissionId, hospitalId });
        if (!admission) {
            return res.status(404).json({ success: false, message: 'Admission not found in this hospital' });
        }
        if (String(admission.patientId) !== String(patientId)) {
            return res.status(400).json({ success: false, message: 'Patient does not match this admission record' });
        }
        if (admission.status === 'Discharged') {
            return res.status(400).json({ success: false, message: 'Cannot add clinical orders to a discharged patient' });
        }

        // Determine ordering doctor (use authenticated user if doctor, or override if admin)
        let orderingDoctorId = req.user._id || req.user.userId;
        if (overrideDoctorId && mongoose.Types.ObjectId.isValid(overrideDoctorId)) {
            const docUser = await User.findOne({ _id: overrideDoctorId, $or: [{ hospitalId }, { hospitalId: null }] });
            if (docUser) orderingDoctorId = docUser._id;
        }

        const order = new InpatientOrder({
            hospitalId,
            admissionId,
            patientId,
            doctorId: orderingDoctorId,
            medicineName: medicineName.trim(),
            dosageValue: Number(dosageValue) || 0,
            dosageUnit: dosageUnit ? String(dosageUnit).trim() : '',
            route: route || 'Oral',
            frequency: frequency ? String(frequency).trim() : 'OD',
            startDate: startDate ? new Date(startDate) : new Date(),
            endDate: endDate ? new Date(endDate) : undefined,
            duration: duration ? String(duration).trim() : '',
            instructions: instructions ? String(instructions).trim() : '',
            status: 'ACTIVE',
            createdBy: req.user._id || req.user.userId,
            updatedBy: req.user._id || req.user.userId
        });

        await order.save();

        // Socket.IO event emission
        const io = req.app.get('io');
        if (io) {
            io.to(`hospital_${hospitalId}`).emit('inpatient_order_created', {
                orderId: order._id,
                admissionId,
                patientId,
                medicineName: order.medicineName,
                timestamp: new Date()
            });
        }

        res.status(201).json({ success: true, message: 'Inpatient order created successfully', order });
    } catch (err) {
        console.error('Create Inpatient Order error:', err);
        res.status(500).json({ success: false, message: err.message || 'Internal server error' });
    }
});

// GET /api/ipd-clinical/admissions/:admissionId/orders — Get all orders for an admission
router.get('/admissions/:admissionId/orders', verifyToken, resolveTenant, requireNurseOrDoctorAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const { admissionId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(admissionId)) {
            return res.status(400).json({ success: false, message: 'Invalid admissionId format' });
        }

        const { InpatientOrder, User } = getModels(req);
        const orders = await InpatientOrder.find({ admissionId, hospitalId })
            .sort({ createdAt: -1 })
            .lean();

        for (let ord of orders) {
            if (ord.doctorId) {
                ord.doctorId = await User.findById(ord.doctorId).select('name specialization phone email').lean() || ord.doctorId;
            }
            if (ord.createdBy) {
                ord.createdBy = await User.findById(ord.createdBy).select('name').lean() || ord.createdBy;
            }
        }

        res.json({ success: true, orders });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Error fetching inpatient orders' });
    }
});

// GET /api/ipd-clinical/admissions/:admissionId/orders/active — Get only active orders
router.get('/admissions/:admissionId/orders/active', verifyToken, resolveTenant, requireNurseOrDoctorAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const { admissionId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(admissionId)) {
            return res.status(400).json({ success: false, message: 'Invalid admissionId format' });
        }

        const { InpatientOrder, User } = getModels(req);
        const orders = await InpatientOrder.find({ admissionId, hospitalId, status: 'ACTIVE' })
            .sort({ createdAt: -1 })
            .lean();

        for (let ord of orders) {
            if (ord.doctorId) {
                ord.doctorId = await User.findById(ord.doctorId).select('name specialization phone email').lean() || ord.doctorId;
            }
        }

        res.json({ success: true, orders });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Error fetching active inpatient orders' });
    }
});

// PATCH /api/ipd-clinical/orders/:orderId — Update or cancel order (Doctor/Admin only)
router.patch('/orders/:orderId', verifyToken, resolveTenant, requireDoctorAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const { orderId } = req.params;
        const { status, instructions, endDate, duration } = req.body;

        if (!mongoose.Types.ObjectId.isValid(orderId)) {
            return res.status(400).json({ success: false, message: 'Invalid orderId format' });
        }

        const { InpatientOrder } = getModels(req);
        const order = await InpatientOrder.findOne({ _id: orderId, hospitalId });
        if (!order) return res.status(404).json({ success: false, message: 'Inpatient order not found' });

        if (status) {
            const validStatuses = ['ACTIVE', 'COMPLETED', 'CANCELLED', 'ON_HOLD'];
            if (!validStatuses.includes(status)) {
                return res.status(400).json({ success: false, message: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
            }
            order.status = status;
        }

        if (instructions !== undefined) order.instructions = instructions;
        if (endDate !== undefined) order.endDate = endDate ? new Date(endDate) : null;
        if (duration !== undefined) order.duration = duration;
        order.updatedBy = req.user._id || req.user.userId;

        await order.save();

        const io = req.app.get('io');
        if (io) {
            io.to(`hospital_${hospitalId}`).emit('inpatient_order_updated', {
                orderId: order._id,
                admissionId: order.admissionId,
                status: order.status,
                timestamp: new Date()
            });
        }

        res.json({ success: true, message: 'Order updated successfully', order });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Error updating order' });
    }
});

// ============================================================================
// SECTION B: MEDICATION ADMINISTRATION RECORD (MAR)
// ============================================================================

// POST /api/ipd-clinical/mar — Schedule/Create a MAR record
router.post('/mar', verifyToken, resolveTenant, requireNurseOrDoctorAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const { orderId, admissionId, scheduledTime, notes } = req.body;

        if (!orderId || !admissionId || !scheduledTime) {
            return res.status(400).json({ success: false, message: 'orderId, admissionId, and scheduledTime are required' });
        }

        const { InpatientOrder, MARRecord } = getModels(req);
        const order = await InpatientOrder.findOne({ _id: orderId, hospitalId });
        if (!order) return res.status(404).json({ success: false, message: 'Inpatient order not found' });

        const mar = new MARRecord({
            hospitalId,
            orderId: order._id,
            admissionId,
            patientId: order.patientId,
            scheduledTime: new Date(scheduledTime),
            status: 'SCHEDULED',
            notes: notes || ''
        });

        await mar.save();
        res.status(201).json({ success: true, message: 'MAR record scheduled successfully', mar });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Error creating MAR record' });
    }
});

// GET /api/ipd-clinical/admissions/:admissionId/mar — Get MAR records for an admission
router.get('/admissions/:admissionId/mar', verifyToken, resolveTenant, requireNurseOrDoctorAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const { admissionId } = req.params;
        const { status, date } = req.query;

        if (!mongoose.Types.ObjectId.isValid(admissionId)) {
            return res.status(400).json({ success: false, message: 'Invalid admissionId format' });
        }

        const { MARRecord, InpatientOrder, User } = getModels(req);
        const query = { admissionId, hospitalId };

        if (status) query.status = status;
        if (date) {
            const startOfDay = new Date(date);
            startOfDay.setHours(0, 0, 0, 0);
            const endOfDay = new Date(date);
            endOfDay.setHours(23, 59, 59, 999);
            query.scheduledTime = { $gte: startOfDay, $lte: endOfDay };
        }

        const marRecords = await MARRecord.find(query)
            .sort({ scheduledTime: 1 })
            .lean();

        for (let m of marRecords) {
            if (m.orderId) {
                m.orderId = await InpatientOrder.findById(m.orderId).select('medicineName dosageValue dosageUnit route frequency instructions status').lean() || m.orderId;
            }
            if (m.administeredBy) {
                m.administeredBy = await User.findById(m.administeredBy).select('name').lean() || m.administeredBy;
            }
        }

        res.json({ success: true, marRecords });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Error fetching MAR records' });
    }
});

// GET /api/ipd-clinical/admissions/:admissionId/mar/due — Get due/pending MAR records
router.get('/admissions/:admissionId/mar/due', verifyToken, resolveTenant, requireNurseOrDoctorAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const { admissionId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(admissionId)) {
            return res.status(400).json({ success: false, message: 'Invalid admissionId format' });
        }

        const { MARRecord, InpatientOrder } = getModels(req);
        const marRecords = await MARRecord.find({
            admissionId,
            hospitalId,
            status: { $in: ['SCHEDULED', 'DUE'] }
        }).sort({ scheduledTime: 1 }).lean();

        for (let m of marRecords) {
            if (m.orderId) {
                m.orderId = await InpatientOrder.findById(m.orderId).select('medicineName dosageValue dosageUnit route frequency instructions').lean() || m.orderId;
            }
        }

        res.json({ success: true, dueRecords: marRecords });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Error fetching due MAR records' });
    }
});

// PATCH /api/ipd-clinical/mar/:marId — Record medication administration (Given/Held/Refused/Missed)
router.patch('/mar/:marId', verifyToken, resolveTenant, requireNurseOrDoctorAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const { marId } = req.params;
        const { status, actualDoseValue, actualDoseUnit, notes, reason } = req.body;

        if (!mongoose.Types.ObjectId.isValid(marId)) {
            return res.status(400).json({ success: false, message: 'Invalid marId format' });
        }

        const validStatuses = ['SCHEDULED', 'DUE', 'ADMINISTERED', 'HELD', 'REFUSED', 'MISSED', 'CANCELLED'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ success: false, message: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
        }

        // Reason is mandatory if held, refused, or missed
        if (['HELD', 'REFUSED', 'MISSED'].includes(status) && (!reason || !reason.trim())) {
            return res.status(400).json({ success: false, message: `A reason is required when medication is marked as ${status}` });
        }

        const { MARRecord, InpatientOrder } = getModels(req);
        const mar = await MARRecord.findOne({ _id: marId, hospitalId });
        if (!mar) return res.status(404).json({ success: false, message: 'MAR record not found' });

        mar.status = status;
        mar.administeredBy = req.user._id || req.user.userId;
        mar.administeredTime = (status === 'ADMINISTERED') ? new Date() : mar.administeredTime;

        if (actualDoseValue !== undefined) mar.actualDoseValue = Number(actualDoseValue);
        if (actualDoseUnit !== undefined) mar.actualDoseUnit = actualDoseUnit;
        if (notes !== undefined) mar.notes = notes;
        if (reason !== undefined) mar.reason = reason;

        await mar.save();

        const io = req.app.get('io');
        if (io) {
            io.to(`hospital_${hospitalId}`).emit('mar_administered', {
                marId: mar._id,
                admissionId: mar.admissionId,
                status: mar.status,
                timestamp: new Date()
            });
        }

        res.json({ success: true, message: `Medication record updated to ${status}`, mar });
    } catch (err) {
        console.error('Update MAR record error:', err);
        res.status(500).json({ success: false, message: 'Error updating MAR record' });
    }
});

// ============================================================================
// SECTION C: IPD TIME-SERIES VITALS (Append-Only)
// ============================================================================

// POST /api/ipd-clinical/admissions/:admissionId/vitals — Record vitals (Nurse/Doctor only)
router.post('/admissions/:admissionId/vitals', verifyToken, resolveTenant, requireNurseOrDoctorAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const { admissionId } = req.params;
        const {
            systolicBP,
            diastolicBP,
            pulse,
            temperature,
            spo2,
            respiratoryRate,
            painScore,
            notes
        } = req.body;

        if (!mongoose.Types.ObjectId.isValid(admissionId)) {
            return res.status(400).json({ success: false, message: 'Invalid admissionId format' });
        }

        const { Admission, IPDVitals } = getModels(req);
        const admission = await Admission.findOne({ _id: admissionId, hospitalId });
        if (!admission) {
            return res.status(404).json({ success: false, message: 'Admission not found in this hospital' });
        }
        if (admission.status === 'Discharged') {
            return res.status(400).json({ success: false, message: 'Cannot record vitals for a discharged patient' });
        }

        // Create append-only time-series vitals entry
        const vitalEntry = new IPDVitals({
            hospitalId,
            admissionId: admission._id,
            patientId: admission.patientId,
            recordedBy: req.user._id || req.user.userId,
            recordedAt: new Date(),
            systolicBP: systolicBP ? Number(systolicBP) : undefined,
            diastolicBP: diastolicBP ? Number(diastolicBP) : undefined,
            pulse: pulse ? Number(pulse) : undefined,
            temperature: temperature ? Number(temperature) : undefined,
            spo2: spo2 ? Number(spo2) : undefined,
            respiratoryRate: respiratoryRate ? Number(respiratoryRate) : undefined,
            painScore: painScore !== undefined && painScore !== '' ? Number(painScore) : undefined,
            notes: notes ? String(notes).trim() : ''
        });

        await vitalEntry.save();

        const io = req.app.get('io');
        if (io) {
            io.to(`hospital_${hospitalId}`).emit('vitals_recorded', {
                vitalsId: vitalEntry._id,
                admissionId: admission._id,
                patientId: admission.patientId,
                timestamp: new Date()
            });
        }

        res.status(201).json({ success: true, message: 'Vitals recorded successfully', vitals: vitalEntry });
    } catch (err) {
        console.error('Record vitals error:', err);
        res.status(500).json({ success: false, message: 'Error recording vitals' });
    }
});

// GET /api/ipd-clinical/admissions/:admissionId/vitals — Get vitals history
router.get('/admissions/:admissionId/vitals', verifyToken, resolveTenant, requireNurseOrDoctorAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const { admissionId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(admissionId)) {
            return res.status(400).json({ success: false, message: 'Invalid admissionId format' });
        }

        const { IPDVitals, User } = getModels(req);
        const vitalsList = await IPDVitals.find({ admissionId, hospitalId })
            .sort({ recordedAt: -1 })
            .lean();

        for (let v of vitalsList) {
            if (v.recordedBy) {
                v.recordedBy = await User.findById(v.recordedBy).select('name').lean() || v.recordedBy;
            }
        }

        res.json({ success: true, vitals: vitalsList });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Error fetching vitals' });
    }
});

// GET /api/ipd-clinical/admissions/:admissionId/vitals/latest — Get latest single vitals snapshot
router.get('/admissions/:admissionId/vitals/latest', verifyToken, resolveTenant, requireNurseOrDoctorAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const { admissionId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(admissionId)) {
            return res.status(400).json({ success: false, message: 'Invalid admissionId format' });
        }

        const { IPDVitals, User } = getModels(req);
        const latest = await IPDVitals.findOne({ admissionId, hospitalId })
            .sort({ recordedAt: -1 })
            .lean();

        if (latest && latest.recordedBy) {
            latest.recordedBy = await User.findById(latest.recordedBy).select('name').lean() || latest.recordedBy;
        }

        res.json({ success: true, vitals: latest || null });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Error fetching latest vitals' });
    }
});

module.exports = router;
