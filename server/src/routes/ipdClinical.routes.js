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
const AuditLog = require('../models/auditLog.model');

// Audit logger helper
const logClinicalAudit = async ({ hospitalId, user, action, targetModel, targetId, targetLabel, req }) => {
    try {
        if (!hospitalId || !action) return;
        await AuditLog.create({
            clinicId: hospitalId,
            userId: user?._id || user?.userId || null,
            userName: user?.name || 'Staff',
            role: user?._roleData?.name || user?.role || 'staff',
            action,
            targetModel: targetModel || 'InpatientOrder',
            targetId: targetId || null,
            targetLabel: targetLabel || '',
            ip: req?.ip || '',
            userAgent: req?.headers ? req.headers['user-agent'] || '' : '',
            success: true
        });
    } catch (auditErr) {
        console.error('Clinical audit log failed:', auditErr.message);
    }
};

// Helper: retrieve models bound to tenant connection
const getModels = (req) => {
    if (req.tenantDb) {
        const tenantModels = getTenantModels(req.tenantDb);
        return {
            ...tenantModels,
            User: MasterUser,
        };
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
            appointmentId,
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

        if (!patientId || !medicineName) {
            return res.status(400).json({ success: false, message: 'patientId and medicineName are required' });
        }

        if (!mongoose.Types.ObjectId.isValid(patientId)) {
            return res.status(400).json({ success: false, message: 'Invalid patientId format' });
        }

        const { Admission, InpatientOrder, User } = getModels(req);

        // Verify patient belongs to this hospital (either MasterUser or tenant clinic patient)
        let patientUser = await MasterUser.findOne({ _id: patientId, $or: [{ hospitalId }, { hospitalId: null }] });
        if (!patientUser && req.tenantDb) {
            try {
                patientUser = await req.tenantDb.collection('patients').findOne({ _id: new mongoose.Types.ObjectId(patientId) });
            } catch {}
        }
        if (!patientUser) {
            return res.status(404).json({ success: false, message: 'Patient not found in this hospital' });
        }

        let resolvedAdmissionId = null;

        if (admissionId) {
            if (!mongoose.Types.ObjectId.isValid(admissionId)) {
                return res.status(400).json({ success: false, message: 'Invalid admissionId format' });
            }
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
            resolvedAdmissionId = admission._id;
        } else {
            // Check if patient currently has an active admission to auto-link
            const activeAdmission = await Admission.findOne({ hospitalId, patientId, status: 'Admitted' });
            if (activeAdmission) {
                resolvedAdmissionId = activeAdmission._id;
            }
        }

        // Determine ordering doctor (use authenticated user if doctor, or override if admin)
        let orderingDoctorId = req.user._id || req.user.userId;
        if (overrideDoctorId && mongoose.Types.ObjectId.isValid(overrideDoctorId)) {
            const docUser = await User.findOne({ _id: overrideDoctorId, $or: [{ hospitalId }, { hospitalId: null }] });
            if (docUser) orderingDoctorId = docUser._id;
        }

        const dosageVal = req.body.dosageValue ?? req.body.dosage?.value ?? 0;
        const dosageUn = req.body.dosageUnit ?? req.body.dosage?.unit ?? '';
        const startDt = req.body.startDate ?? req.body.schedule?.startDate ?? new Date();
        const endDt = req.body.endDate ?? req.body.schedule?.endDate;
        const dur = req.body.duration ?? req.body.schedule?.duration ?? '';

        const order = new InpatientOrder({
            hospitalId,
            admissionId: resolvedAdmissionId,
            appointmentId: appointmentId && mongoose.Types.ObjectId.isValid(appointmentId) ? appointmentId : undefined,
            patientId,
            doctorId: orderingDoctorId,
            medicineName: medicineName.trim(),
            dosageValue: Number(dosageVal) || 0,
            dosageUnit: dosageUn ? String(dosageUn).trim() : '',
            route: route || 'Oral',
            frequency: frequency ? String(frequency).trim() : 'OD',
            startDate: startDt ? new Date(startDt) : new Date(),
            endDate: endDt ? new Date(endDt) : undefined,
            duration: dur ? String(dur).trim() : '',
            instructions: instructions ? String(instructions).trim() : '',
            diagnosis: req.body.diagnosis ? String(req.body.diagnosis).trim() : '',
            admissionReason: req.body.admissionReason ? String(req.body.admissionReason).trim() : '',
            clinicalNotes: req.body.clinicalNotes ? String(req.body.clinicalNotes).trim() : '',
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

        res.status(201).json({ success: true, message: 'Inpatient order created successfully', order, data: order });
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

        res.json({ success: true, orders, data: orders });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Error fetching inpatient orders' });
    }
});

// GET /api/ipd-clinical/patients/:patientId/orders — Get all inpatient orders for a patient
router.get('/patients/:patientId/orders', verifyToken, resolveTenant, requireNurseOrDoctorAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const { patientId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(patientId)) {
            return res.status(400).json({ success: false, message: 'Invalid patientId format' });
        }

        const { InpatientOrder, User } = getModels(req);
        const orders = await InpatientOrder.find({ patientId, hospitalId })
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

        res.json({ success: true, orders, data: orders });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Error fetching patient orders' });
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

        res.json({ success: true, orders, data: orders });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Error fetching active orders' });
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

// POST /api/ipd-clinical/admissions/:admissionId/discharge-order — Doctor Clinical Discharge Order
router.post('/admissions/:admissionId/discharge-order', verifyToken, resolveTenant, requireDoctorAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const { admissionId } = req.params;
        const { dischargeNotes, dischargeDate } = req.body;

        if (!mongoose.Types.ObjectId.isValid(admissionId)) {
            return res.status(400).json({ success: false, message: 'Invalid admissionId format' });
        }

        const { Admission, NursingTask, User } = getModels(req);
        const admission = await Admission.findOne({ _id: admissionId, hospitalId });
        if (!admission) {
            return res.status(404).json({ success: false, message: 'Admission not found' });
        }

        if (admission.status === 'Discharged') {
            return res.status(400).json({ success: false, message: 'Patient is already discharged' });
        }

        if (!admission.dischargeReadiness) {
            admission.dischargeReadiness = {};
        }

        admission.dischargeReadiness.doctorDischargeOrdered = true;
        admission.dischargeReadiness.doctorDischargeDate = dischargeDate ? new Date(dischargeDate) : new Date();
        admission.dischargeReadiness.doctorDischargeDoctorId = req.user._id || req.user.userId;
        admission.dischargeReadiness.doctorDischargeNotes = dischargeNotes ? String(dischargeNotes).trim() : 'Patient clinically stable for discharge.';

        if (admission.dischargeReadiness.nursingClearance) {
            admission.dischargeReadiness.status = 'READY_FOR_DISCHARGE';
        } else {
            admission.dischargeReadiness.status = 'DOCTOR_ORDERED';
        }

        await admission.save();

        // Automatically create a high-priority nursing task for discharge preparation
        try {
            if (NursingTask) {
                const prepTask = new NursingTask({
                    hospitalId,
                    admissionId: admission._id,
                    patientId: admission.patientId,
                    taskType: 'PROCEDURE_PREP',
                    title: 'Discharge Preparation: Remove lines, reconcile meds & educate patient',
                    description: admission.dischargeReadiness.doctorDischargeNotes,
                    priority: 'HIGH',
                    scheduledAt: new Date(),
                    status: 'PENDING',
                    createdBy: req.user._id || req.user.userId
                });
                await prepTask.save();
            }
        } catch (taskErr) {
            console.error('Failed to auto-generate discharge nursing task:', taskErr.message);
        }

        const io = req.app.get('io');
        if (io) {
            io.to(`hospital_${hospitalId}`).emit('discharge_readiness_changed', {
                admissionId: admission._id,
                patientId: admission.patientId,
                status: admission.dischargeReadiness.status,
                doctorDischargeOrdered: true
            });
        }

        res.json({
            success: true,
            message: 'Doctor clinical discharge order recorded successfully',
            dischargeReadiness: admission.dischargeReadiness,
            data: admission.dischargeReadiness
        });
    } catch (err) {
        console.error('Doctor discharge order error:', err);
        res.status(500).json({ success: false, message: err.message || 'Error recording doctor discharge order' });
    }
});

// ============================================================================
// SECTION G: DOCTOR ↔ NURSE CLINICAL COORDINATION & CLARIFICATION
// ============================================================================

// POST /api/ipd-clinical/admissions/:admissionId/orders/:orderId/acknowledge — Nurse acknowledges order
router.post('/admissions/:admissionId/orders/:orderId/acknowledge', verifyToken, resolveTenant, requireNurseOrDoctorAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const { admissionId, orderId } = req.params;
        const { shift = 'General', notes = '' } = req.body;

        if (!mongoose.Types.ObjectId.isValid(admissionId) || !mongoose.Types.ObjectId.isValid(orderId)) {
            return res.status(400).json({ success: false, message: 'Invalid admissionId or orderId' });
        }

        const { InpatientOrder, User } = getModels(req);
        const order = await InpatientOrder.findOne({ _id: orderId, admissionId, hospitalId });
        if (!order) {
            return res.status(404).json({ success: false, message: 'Inpatient order not found' });
        }

        const nurseId = req.user._id || req.user.userId;
        const nurseName = req.user.name || 'Nurse';

        if (!order.acknowledgments) {
            order.acknowledgments = [];
        }

        // Avoid duplicate acknowledgment by the same nurse within a short period if already recorded
        order.acknowledgments.push({
            nurseId,
            acknowledgedAt: new Date(),
            shift: String(shift).trim(),
            notes: String(notes).trim()
        });

        await order.save();

        await logClinicalAudit({
            hospitalId,
            user: req.user,
            action: 'DOCTOR_ORDER_ACKNOWLEDGED',
            targetModel: 'InpatientOrder',
            targetId: order._id,
            targetLabel: `${order.medicineName} acknowledged by ${nurseName}`,
            req
        });

        const io = req.app.get('io');
        if (io) {
            io.to(`hospital_${hospitalId}`).emit('doctor_order_acknowledged', {
                orderId: order._id,
                admissionId,
                nurseId,
                nurseName,
                acknowledgedAt: new Date()
            });
        }

        res.json({
            success: true,
            message: 'Order acknowledged successfully',
            order,
            data: order
        });
    } catch (err) {
        console.error('Order acknowledgment error:', err);
        res.status(500).json({ success: false, message: err.message || 'Error acknowledging order' });
    }
});

// POST /api/ipd-clinical/admissions/:admissionId/orders/:orderId/clarification — Nurse requests clarification
router.post('/admissions/:admissionId/orders/:orderId/clarification', verifyToken, resolveTenant, requireNurseOrDoctorAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const { admissionId, orderId } = req.params;
        const { issueType = 'DOSAGE_CONFIRMATION', question } = req.body;

        if (!question || !String(question).trim()) {
            return res.status(400).json({ success: false, message: 'Clarification question is required' });
        }

        if (!mongoose.Types.ObjectId.isValid(admissionId) || !mongoose.Types.ObjectId.isValid(orderId)) {
            return res.status(400).json({ success: false, message: 'Invalid admissionId or orderId' });
        }

        const { InpatientOrder, Admission } = getModels(req);
        const order = await InpatientOrder.findOne({ _id: orderId, admissionId, hospitalId });
        if (!order) {
            return res.status(404).json({ success: false, message: 'Inpatient order not found' });
        }

        const nurseId = req.user._id || req.user.userId;
        const nurseName = req.user.name || 'Nurse';

        if (!order.clarifications) {
            order.clarifications = [];
        }

        const newClarification = {
            requestedBy: nurseName,
            nurseId,
            issueType,
            question: String(question).trim(),
            requestedAt: new Date(),
            status: 'OPEN'
        };

        order.clarifications.push(newClarification);
        await order.save();

        await logClinicalAudit({
            hospitalId,
            user: req.user,
            action: 'CLARIFICATION_REQUESTED',
            targetModel: 'InpatientOrder',
            targetId: order._id,
            targetLabel: `Clarification requested on ${order.medicineName}: ${question.substring(0, 50)}`,
            req
        });

        const io = req.app.get('io');
        if (io) {
            io.to(`hospital_${hospitalId}`).emit('order_clarification_requested', {
                orderId: order._id,
                admissionId,
                clarification: order.clarifications[order.clarifications.length - 1],
                medicineName: order.medicineName,
                nurseName
            });
        }

        res.json({
            success: true,
            message: 'Clarification request submitted to doctor',
            clarifications: order.clarifications,
            order
        });
    } catch (err) {
        console.error('Clarification request error:', err);
        res.status(500).json({ success: false, message: err.message || 'Error submitting clarification request' });
    }
});

// POST /api/ipd-clinical/admissions/:admissionId/orders/:orderId/clarification-response — Doctor responds
router.post('/admissions/:admissionId/orders/:orderId/clarification-response', verifyToken, resolveTenant, requireDoctorAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const { admissionId, orderId } = req.params;
        const { clarificationId, responseText } = req.body;

        if (!responseText || !String(responseText).trim()) {
            return res.status(400).json({ success: false, message: 'Doctor response text is required' });
        }

        if (!mongoose.Types.ObjectId.isValid(admissionId) || !mongoose.Types.ObjectId.isValid(orderId)) {
            return res.status(400).json({ success: false, message: 'Invalid admissionId or orderId' });
        }

        const { InpatientOrder } = getModels(req);
        const order = await InpatientOrder.findOne({ _id: orderId, admissionId, hospitalId });
        if (!order) {
            return res.status(404).json({ success: false, message: 'Inpatient order not found' });
        }

        const doctorId = req.user._id || req.user.userId;
        const doctorName = req.user.name || 'Doctor';

        let targetClarification = null;
        if (clarificationId) {
            targetClarification = order.clarifications.id(clarificationId);
        } else {
            // Pick latest OPEN clarification
            targetClarification = order.clarifications.filter(c => c.status === 'OPEN').pop();
        }

        if (!targetClarification) {
            return res.status(404).json({ success: false, message: 'Open clarification not found for this order' });
        }

        targetClarification.responseDoctorId = doctorId;
        targetClarification.responseText = String(responseText).trim();
        targetClarification.respondedAt = new Date();
        targetClarification.status = 'RESOLVED';

        await order.save();

        await logClinicalAudit({
            hospitalId,
            user: req.user,
            action: 'CLARIFICATION_RESPONDED',
            targetModel: 'InpatientOrder',
            targetId: order._id,
            targetLabel: `Doctor responded to clarification on ${order.medicineName}`,
            req
        });

        const io = req.app.get('io');
        if (io) {
            io.to(`hospital_${hospitalId}`).emit('order_clarification_resolved', {
                orderId: order._id,
                admissionId,
                clarificationId: targetClarification._id,
                responseText: targetClarification.responseText,
                doctorName,
                respondedAt: targetClarification.respondedAt
            });
        }

        res.json({
            success: true,
            message: 'Clarification response submitted successfully',
            order,
            clarification: targetClarification
        });
    } catch (err) {
        console.error('Clarification response error:', err);
        res.status(500).json({ success: false, message: err.message || 'Error saving clarification response' });
    }
});

// GET /api/ipd-clinical/clarifications/inbox — Inbox for doctors/nurses to view all active & pending clarifications
router.get('/clarifications/inbox', verifyToken, resolveTenant, requireNurseOrDoctorAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const { status = 'OPEN', admissionId } = req.query;

        const { InpatientOrder, Admission, User } = getModels(req);

        const filter = { hospitalId, 'clarifications.0': { $exists: true } };
        if (admissionId && mongoose.Types.ObjectId.isValid(admissionId)) {
            filter.admissionId = admissionId;
        }

        const orders = await InpatientOrder.find(filter)
            .populate('patientId', 'name age gender patientId mrn phone')
            .populate('doctorId', 'name email phone')
            .populate('admissionId', 'ward bedNumber status')
            .lean();

        let inbox = [];
        orders.forEach(order => {
            (order.clarifications || []).forEach(clar => {
                if (status === 'ALL' || clar.status === status) {
                    inbox.push({
                        clarificationId: clar._id,
                        orderId: order._id,
                        medicineName: order.medicineName,
                        dosage: `${order.dosageValue} ${order.dosageUnit}`,
                        route: order.route,
                        frequency: order.frequency,
                        instructions: order.instructions,
                        admissionId: order.admissionId?._id || order.admissionId,
                        ward: order.admissionId?.ward || '—',
                        bedNumber: order.admissionId?.bedNumber || '—',
                        patient: order.patientId,
                        doctor: order.doctorId,
                        issueType: clar.issueType,
                        question: clar.question,
                        requestedBy: clar.requestedBy,
                        nurseId: clar.nurseId,
                        requestedAt: clar.requestedAt,
                        responseText: clar.responseText,
                        responseDoctorId: clar.responseDoctorId,
                        respondedAt: clar.respondedAt,
                        status: clar.status
                    });
                }
            });
        });

        // Sort by requestedAt descending
        inbox.sort((a, b) => new Date(b.requestedAt) - new Date(a.requestedAt));

        res.json({
            success: true,
            count: inbox.length,
            clarifications: inbox,
            data: inbox
        });
    } catch (err) {
        console.error('Clarifications inbox error:', err);
        res.status(500).json({ success: false, message: err.message || 'Error fetching clarifications inbox' });
    }
});

// ============================================================================
// SECTION H: STRUCTURED IPD DISCHARGE SUMMARY (CLINICAL DOCUMENTATION)
// ============================================================================

// POST /api/ipd-clinical/admissions/:admissionId/discharge-summary — Doctor creates/updates Discharge Summary
router.post('/admissions/:admissionId/discharge-summary', verifyToken, resolveTenant, requireDoctorAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const { admissionId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(admissionId)) {
            return res.status(400).json({ success: false, message: 'Invalid admissionId' });
        }

        const {
            diagnosis,
            admissionReason,
            hospitalCourse,
            proceduresSummary,
            keyInvestigationsSummary,
            treatmentSummary,
            conditionAtDischarge = 'STABLE',
            dischargeMedications = [],
            followUpInstructions,
            returnPrecautions,
            followUpDate,
            status = 'DRAFT' // 'DRAFT' or 'FINALIZED'
        } = req.body;

        const { Admission, User } = getModels(req);
        const admission = await Admission.findOne({ _id: admissionId, hospitalId });
        if (!admission) {
            return res.status(404).json({ success: false, message: 'Admission record not found' });
        }

        const doctorId = req.user._id || req.user.userId;
        const doctorName = req.user.name || 'Doctor';

        const summaryData = {
            diagnosis: diagnosis ? String(diagnosis).trim() : '',
            admissionReason: admissionReason ? String(admissionReason).trim() : '',
            hospitalCourse: hospitalCourse ? String(hospitalCourse).trim() : '',
            proceduresSummary: proceduresSummary ? String(proceduresSummary).trim() : '',
            keyInvestigationsSummary: keyInvestigationsSummary ? String(keyInvestigationsSummary).trim() : '',
            treatmentSummary: treatmentSummary ? String(treatmentSummary).trim() : '',
            conditionAtDischarge,
            dischargeMedications: Array.isArray(dischargeMedications) ? dischargeMedications.map(m => ({
                medicineName: String(m.medicineName || '').trim(),
                dosage: String(m.dosage || '').trim(),
                route: String(m.route || 'Oral').trim(),
                frequency: String(m.frequency || 'OD').trim(),
                duration: String(m.duration || '5 days').trim(),
                instructions: String(m.instructions || '').trim()
            })).filter(m => m.medicineName) : [],
            followUpInstructions: followUpInstructions ? String(followUpInstructions).trim() : '',
            returnPrecautions: returnPrecautions ? String(returnPrecautions).trim() : '',
            followUpDate: followUpDate ? new Date(followUpDate) : undefined,
            status,
            doctorId,
            doctorSignedAt: status === 'FINALIZED' ? new Date() : (admission.dischargeSummary?.doctorSignedAt || null)
        };

        admission.dischargeSummary = summaryData;

        // If doctor finalizes the discharge summary, also mark doctorDischargeOrdered as true
        if (status === 'FINALIZED') {
            if (!admission.dischargeReadiness) {
                admission.dischargeReadiness = {};
            }
            admission.dischargeReadiness.doctorDischargeOrdered = true;
            admission.dischargeReadiness.doctorDischargeDate = new Date();
            admission.dischargeReadiness.doctorDischargeDoctorId = doctorId;
            admission.dischargeReadiness.doctorDischargeNotes = summaryData.followUpInstructions || 'Discharge summary finalized by attending doctor';

            if (admission.dischargeReadiness.nursingClearance) {
                admission.dischargeReadiness.status = 'READY_FOR_DISCHARGE';
            } else {
                admission.dischargeReadiness.status = 'DOCTOR_ORDERED';
            }
        }

        await admission.save();

        await logClinicalAudit({
            hospitalId,
            user: req.user,
            action: status === 'FINALIZED' ? 'DISCHARGE_SUMMARY_FINALIZED' : 'DISCHARGE_SUMMARY_SAVED',
            targetModel: 'Admission',
            targetId: admission._id,
            targetLabel: `Discharge summary ${status} for admission ${admission._id}`,
            req
        });

        const io = req.app.get('io');
        if (io) {
            io.to(`hospital_${hospitalId}`).emit('discharge_summary_updated', {
                admissionId: admission._id,
                patientId: admission.patientId,
                status,
                doctorName,
                updatedAt: new Date()
            });
        }

        res.json({
            success: true,
            message: `Discharge summary ${status === 'FINALIZED' ? 'finalized and signed' : 'saved as draft'} successfully`,
            dischargeSummary: admission.dischargeSummary,
            dischargeReadiness: admission.dischargeReadiness,
            data: admission.dischargeSummary
        });
    } catch (err) {
        console.error('Save discharge summary error:', err);
        res.status(500).json({ success: false, message: err.message || 'Error saving discharge summary' });
    }
});

// GET /api/ipd-clinical/admissions/:admissionId/discharge-summary — Fetch structured discharge summary + complete patient clinical summary
router.get('/admissions/:admissionId/discharge-summary', verifyToken, resolveTenant, requireNurseOrDoctorAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const { admissionId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(admissionId)) {
            return res.status(400).json({ success: false, message: 'Invalid admissionId' });
        }

        const { Admission, IPDVitals, InpatientOrder, MARRecord, LabReport, SurgeryPlan, User } = getModels(req);

        const admission = await Admission.findOne({ _id: admissionId, hospitalId })
            .populate('patientId', 'name age gender patientId mrn phone address bloodGroup aadhaarNumber')
            .populate('doctorId', 'name email phone specialization licenseNumber')
            .populate('bedId', 'bedNumber ward bedType')
            .lean();

        if (!admission) {
            return res.status(404).json({ success: false, message: 'Admission record not found' });
        }

        // Fetch latest vitals for reference snapshot
        const latestVitals = await IPDVitals.findOne({ admissionId, hospitalId })
            .sort({ recordedAt: -1 })
            .lean();

        // Fetch active/past medications
        const inpatientOrders = await InpatientOrder.find({ admissionId, hospitalId }).lean();

        // Fetch completed lab investigations
        const labReports = await LabReport.find({
            $or: [{ admissionId }, { patientId: admission.patientId?._id || admission.patientId }, { userId: admission.patientId?._id || admission.patientId }],
            hospitalId
        }).lean();

        // Fetch surgeries if any
        const surgeries = await SurgeryPlan.find({
            $or: [{ admissionId }, { patientId: admission.patientId?._id || admission.patientId }],
            hospitalId
        }).populate('surgeonId', 'name specialization').lean();

        // Populate doctor who signed summary if populated
        let signingDoctor = null;
        if (admission.dischargeSummary?.doctorId) {
            signingDoctor = await User.findById(admission.dischargeSummary.doctorId, 'name email specialization licenseNumber').lean();
        }

        res.json({
            success: true,
            admission,
            dischargeSummary: admission.dischargeSummary || null,
            latestVitals: latestVitals || null,
            inpatientOrders: inpatientOrders || [],
            labReports: labReports || [],
            surgeries: surgeries || [],
            signingDoctor: signingDoctor || admission.doctorId,
            data: {
                admission,
                dischargeSummary: admission.dischargeSummary || null,
                latestVitals,
                signingDoctor: signingDoctor || admission.doctorId
            }
        });
    } catch (err) {
        console.error('Fetch discharge summary error:', err);
        res.status(500).json({ success: false, message: err.message || 'Error fetching discharge summary' });
    }
});

module.exports = router;

