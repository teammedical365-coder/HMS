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
const MasterInpatientClinicalNote = require('../models/inpatientClinicalNote.model');
const MasterPatientNurseNote = require('../models/patientNurseNote.model');
const MasterInpatientProgressNote = require('../models/inpatientProgressNote.model');
const MasterInpatientDrugChart = require('../models/inpatientDrugChart.model');
const MasterIPDIntakeOutput = require('../models/ipdIntakeOutput.model');
const MasterIPDLine = require('../models/ipdLine.model');
const MasterIPDCatheter = require('../models/ipdCatheter.model');
const MasterNursingNote = require('../models/nursingNote.model');
const MasterLabReport = require('../models/labReport.model');
const MasterSurgeryPlan = require('../models/surgeryPlan.model');
const MasterBed = require('../models/bed.model');
const Hospital = require('../models/hospital.model');
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
        InpatientClinicalNote: MasterInpatientClinicalNote,
        PatientNurseNote: MasterPatientNurseNote,
        InpatientProgressNote: MasterInpatientProgressNote,
        InpatientDrugChart: MasterInpatientDrugChart,
        IPDIntakeOutput: MasterIPDIntakeOutput,
        IPDLine: MasterIPDLine,
        IPDCatheter: MasterIPDCatheter,
        NursingNote: MasterNursingNote,
        LabReport: MasterLabReport,
        SurgeryPlan: MasterSurgeryPlan,
        Bed: MasterBed,
        User: MasterUser,
    };
};

// Helper: extract sanitized role name
const getUserRole = (req) => {
    return (req.user._roleData?.name || String(req.user.role || '')).toLowerCase().replace(/\s+/g, '');
};

/**
 * Enrich a lean order document with the virtual fields that Mongoose strips.
 * This ensures both flat fields (dosageValue, startDate) and nested fields
 * (dosage.value, schedule.startDate) are always present in API responses.
 */
const enrichOrderVirtuals = (ord) => {
    if (!ord) return ord;
    ord.dosage = { value: ord.dosageValue, unit: ord.dosageUnit };
    ord.schedule = { startDate: ord.startDate, endDate: ord.endDate, duration: ord.duration };
    return ord;
};

const DOCTOR_ROLES = [
    'doctor', 'clinicdoctor', 'clinic doctor', 'surgeon', 'consultant',
    'physician', 'doctorassistant', 'doctor assistant', 'doctor_assistant', 'assistant', 'clinicalassistant', 'clinical assistant',
    'resident', 'residentdoctor', 'resident doctor',
    'hospitaladmin', 'centraladmin', 'superadmin', 'admin'
];
const NURSE_ROLES = [
    'nurse', 'staffnurse', 'headnurse', 'doctor', 'clinicdoctor', 'clinic doctor',
    'surgeon', 'consultant', 'physician', 'doctorassistant', 'doctor assistant', 'doctor_assistant', 'assistant', 'clinicalassistant', 'clinical assistant',
    'resident', 'residentdoctor', 'resident doctor',
    'hospitaladmin', 'centraladmin', 'superadmin', 'admin'
];
const NURSING_ONLY_ADMINISTER_ROLES = [
    'nurse', 'staffnurse', 'headnurse',
    'hospitaladmin', 'centraladmin', 'superadmin', 'admin'
];

const isDoctorOrAdminRole = (req) => {
    const role = getUserRole(req);
    const perms = req.user._roleData?.permissions || [];
    return DOCTOR_ROLES.includes(role) || perms.includes('*') || perms.includes('doctor_access') || perms.includes('clinical_manage') || perms.includes('ipd_orders_manage');
};

const isNursingAdministerRole = (req) => {
    const role = getUserRole(req);
    const perms = req.user._roleData?.permissions || [];
    return NURSING_ONLY_ADMINISTER_ROLES.includes(role) || perms.includes('*') || perms.includes('nurse_access') || perms.includes('mar_administer');
};

// Middleware: verify clinical order write permissions (Doctor & Admin only)
const requireDoctorAccess = (req, res, next) => {
    if (isDoctorOrAdminRole(req)) {
        return next();
    }
    return res.status(403).json({ success: false, message: 'Doctor clinical order authorization required' });
};

// Middleware: verify medication administration confirmation permissions (Authorized Nursing Staff & Admin only)
const requireNursingAdministerAccess = (req, res, next) => {
    if (isNursingAdministerRole(req)) {
        return next();
    }
    return res.status(403).json({ success: false, message: 'Only authorized nursing staff can confirm medication administration' });
};

// Middleware: verify clinical execution permissions (Nurse, Doctor & Admin)
const requireNurseOrDoctorAccess = (req, res, next) => {
    const role = getUserRole(req);
    const perms = req.user._roleData?.permissions || [];
    if (NURSE_ROLES.includes(role) || perms.includes('*') || perms.includes('nurse_access') || perms.includes('doctor_access') || perms.includes('clinical_manage') || perms.includes('ipd_view')) {
        return next();
    }
    return res.status(403).json({ success: false, message: 'Nursing / Clinical authorization required' });
};

// Helper: parse frequency into daily scheduled time slots (HH:MM)
const getFrequencyTimeSlots = (frequency, startDateTime) => {
    const f = String(frequency || 'OD').toUpperCase().trim();
    if (f === 'OD' || f === 'ONCE DAILY' || f === '1 TIME DAILY' || f === 'DAILY') {
        return ['10:00'];
    }
    if (f === 'BD' || f === 'BID' || f === 'TWICE DAILY' || f === '2 TIMES DAILY' || f.includes('12 HOUR') || f.includes('EVERY 12')) {
        return ['10:00', '20:00'];
    }
    if (f === 'TDS' || f === 'TID' || f === 'THREE TIMES DAILY' || f === '3 TIMES DAILY' || f.includes('8 HOUR') || f.includes('EVERY 8')) {
        return ['08:00', '14:00', '20:00'];
    }
    if (f === 'QID' || f === 'QDS' || f === 'FOUR TIMES DAILY' || f === '4 TIMES DAILY' || f.includes('6 HOUR') || f.includes('EVERY 6')) {
        return ['06:00', '12:00', '18:00', '22:00'];
    }
    if (f.includes('4 HOUR') || f.includes('EVERY 4')) {
        return ['06:00', '10:00', '14:00', '18:00', '22:00', '02:00'];
    }
    if (f === 'STAT' || f === 'ONCE' || f === 'IMMEDIATE') {
        const d = startDateTime ? new Date(startDateTime) : new Date();
        const hh = String(d.getHours()).padStart(2, '0');
        const mm = String(d.getMinutes()).padStart(2, '0');
        return [`${hh}:${mm}`];
    }
    if (f === 'SOS' || f === 'PRN' || f === 'AS NEEDED') {
        return ['10:00'];
    }
    const match = f.match(/(\d{1,2}):(\d{2})(?:\s*(AM|PM))?/i);
    if (match) {
        let h = parseInt(match[1], 10);
        const m = parseInt(match[2], 10);
        if (match[3]) {
            if (match[3].toUpperCase() === 'PM' && h < 12) h += 12;
            if (match[3].toUpperCase() === 'AM' && h === 12) h = 0;
        }
        return [`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`];
    }
    return ['10:00'];
};

// Helper: parse a single time string (e.g. '09:00', '10:00 AM', '20:30') into 'HH:MM'
const parseSlotToHHMM = (slot) => {
    if (!slot) return '10:00';
    const s = String(slot).trim();
    const match = s.match(/(\d{1,2}):(\d{2})(?:\s*(AM|PM))?/i);
    if (match) {
        let h = parseInt(match[1], 10);
        const m = parseInt(match[2], 10);
        if (match[3]) {
            if (match[3].toUpperCase() === 'PM' && h < 12) h += 12;
            if (match[3].toUpperCase() === 'AM' && h === 12) h = 0;
        }
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
    return '10:00';
};

/**
 * Generate/Ensure MAR records for an InpatientOrder for a specific date (default today)
 */
const generateMARRecordsForOrder = async (order, models, targetDate = new Date()) => {
    try {
        if (!order || order.status !== 'ACTIVE') return [];
        const { MARRecord } = models;
        if (!MARRecord) return [];

        const startOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 0, 0, 0, 0);

        const orderStart = new Date(order.startDate || order.createdAt || Date.now());
        const orderStartDay = new Date(orderStart.getFullYear(), orderStart.getMonth(), orderStart.getDate(), 0, 0, 0, 0);

        if (startOfDay < orderStartDay) return [];

        if (order.endDate) {
            const orderEnd = new Date(order.endDate);
            const orderEndDay = new Date(orderEnd.getFullYear(), orderEnd.getMonth(), orderEnd.getDate(), 23, 59, 59, 999);
            if (startOfDay > orderEndDay) return [];
        }

        let timeSlots = [];
        if (Array.isArray(order.scheduledTimes) && order.scheduledTimes.length > 0) {
            timeSlots = order.scheduledTimes.map(s => parseSlotToHHMM(s)).filter(Boolean);
        }
        if (timeSlots.length === 0) {
            timeSlots = getFrequencyTimeSlots(order.frequency, order.startDate);
        }
        const createdRecords = [];

        for (const slot of timeSlots) {
            const [hStr, mStr] = slot.split(':');
            const scheduledTime = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), parseInt(hStr, 10), parseInt(mStr, 10), 0, 0);

            const slotStart = new Date(scheduledTime.getTime() - 45 * 60 * 1000);
            const slotEnd = new Date(scheduledTime.getTime() + 45 * 60 * 1000);

            const existing = await MARRecord.findOne({
                hospitalId: order.hospitalId,
                orderId: order._id,
                scheduledTime: { $gte: slotStart, $lte: slotEnd }
            });

            if (!existing) {
                const newMar = new MARRecord({
                    hospitalId: order.hospitalId,
                    orderId: order._id,
                    admissionId: order.admissionId,
                    patientId: order.patientId,
                    scheduledTime,
                    status: 'SCHEDULED',
                    notes: order.instructions || ''
                });
                await newMar.save();
                createdRecords.push(newMar);
            }
        }
        return createdRecords;
    } catch (err) {
        console.error('Error generating MAR records for order:', err);
        return [];
    }
};

// Helper: safely resolve admissionId and/or patientId from param
const resolveAdmissionAndPatient = async (paramId, Admission) => {
    if (!paramId) return { admissionId: null, patientId: null };
    const str = String(paramId).trim();
    if (str.startsWith('order-pat-')) {
        const pid = str.replace('order-pat-', '');
        return { admissionId: null, patientId: pid };
    }
    if (mongoose.Types.ObjectId.isValid(str)) {
        if (Admission) {
            try {
                const adm = await Admission.findById(str).lean();
                if (adm) {
                    return { admissionId: adm._id, patientId: adm.patientId };
                }
            } catch (e) {}
        }
        return { admissionId: null, patientId: str };
    }
    return { admissionId: null, patientId: null };
};

/**
 * Ensure all active orders for an admission have today's MAR records
 */
const ensureMARForAdmission = async (admissionId, hospitalId, models) => {
    try {
        const { InpatientOrder, Admission, MARRecord } = models;
        if (!InpatientOrder) return;

        let patientRefId = null;
        let validAdmissionId = null;

        if (admissionId) {
            const resolved = await resolveAdmissionAndPatient(admissionId, Admission);
            validAdmissionId = resolved.admissionId;
            patientRefId = resolved.patientId;
        }

        const query = {
            ...(hospitalId ? { hospitalId } : {}),
            status: 'ACTIVE'
        };

        if (validAdmissionId || patientRefId) {
            query.$or = [
                ...(validAdmissionId ? [{ admissionId: validAdmissionId }] : []),
                ...(patientRefId ? [{ patientId: patientRefId }] : [])
            ];
        }

        const activeOrders = await InpatientOrder.find(query);

        const today = new Date();
        for (const ord of activeOrders) {
            if (!ord.admissionId && validAdmissionId) {
                ord.admissionId = validAdmissionId;
                await ord.save();
            }
            await generateMARRecordsForOrder(ord, models, today);
        }
    } catch (err) {
        console.error('Error ensuring MAR for admission:', err);
    }
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

        const { Admission, InpatientOrder, User } = getModels(req);

        // Resolve patientId (ObjectId or MRN / UID string)
        let resolvedPatientId = null;
        let patientUser = null;

        if (mongoose.Types.ObjectId.isValid(patientId)) {
            patientUser = await MasterUser.findOne({ _id: patientId, $or: [{ hospitalId }, { hospitalId: null }] });
            if (!patientUser && req.tenantDb) {
                try {
                    patientUser = await req.tenantDb.collection('patients').findOne({ _id: new mongoose.Types.ObjectId(patientId) });
                } catch {}
            }
            if (patientUser) resolvedPatientId = patientUser._id;
        }

        if (!resolvedPatientId) {
            // Search by patient identifier / MRN / UID / phone
            patientUser = await MasterUser.findOne({
                $or: [
                    { patientId: String(patientId) },
                    { patientUid: String(patientId) },
                    { mrn: String(patientId) },
                    { phone: String(patientId) }
                ]
            });
            if (!patientUser && req.tenantDb) {
                try {
                    patientUser = await req.tenantDb.collection('patients').findOne({
                        $or: [
                            { patientId: String(patientId) },
                            { patientUid: String(patientId) },
                            { mrn: String(patientId) },
                            { phone: String(patientId) }
                        ]
                    });
                } catch {}
            }
            if (patientUser) resolvedPatientId = patientUser._id;
        }

        if (!patientUser || !resolvedPatientId) {
            return res.status(404).json({ success: false, message: 'Patient not found in this hospital' });
        }

        // Determine ordering doctor upfront (use authenticated user if doctor, or override if admin)
        let orderingDoctorId = req.user._id || req.user.userId;
        if (overrideDoctorId && mongoose.Types.ObjectId.isValid(overrideDoctorId)) {
            const docUser = await (User || MasterUser).findOne({ _id: overrideDoctorId, $or: [{ hospitalId }, { hospitalId: null }] });
            if (docUser) orderingDoctorId = docUser._id;
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
            if (String(admission.patientId) !== String(resolvedPatientId)) {
                return res.status(400).json({ success: false, message: 'Patient does not match this admission record' });
            }
            if (String(admission.status).toLowerCase() === 'discharged') {
                return res.status(400).json({ success: false, message: 'Cannot add clinical orders to a discharged patient' });
            }
            resolvedAdmissionId = admission._id;
        } else {
            // Check if patient currently has an active admission to auto-link
            let activeAdmission = await Admission.findOne({
                ...(hospitalId ? { hospitalId } : {}),
                patientId: resolvedPatientId,
                status: { $in: ['Admitted', 'ADMITTED', 'admitted'] }
            });
            if (activeAdmission) {
                resolvedAdmissionId = activeAdmission._id;
            } else {
                return res.status(400).json({
                    success: false,
                    message: 'Patient is not currently hospitalized / admitted. Please admit the patient with ward and bed allocation before placing IPD orders.'
                });
            }
        }

        const dosageVal = req.body.dosageValue ?? req.body.dosage?.value ?? 0;
        const dosageUn = req.body.dosageUnit ?? req.body.dosage?.unit ?? '';
        const startDt = req.body.startDate ?? req.body.schedule?.startDate ?? new Date();
        const endDt = req.body.endDate ?? req.body.schedule?.endDate;
        const dur = req.body.duration ?? req.body.schedule?.duration ?? '';

        const scheduledTimes = Array.isArray(req.body.scheduledTimes)
            ? req.body.scheduledTimes
            : (req.body.schedule?.scheduledTimes || (req.body.scheduledTimes ? [req.body.scheduledTimes] : []));
        const inventoryItemId = req.body.inventoryItemId && mongoose.Types.ObjectId.isValid(req.body.inventoryItemId) ? req.body.inventoryItemId : undefined;

        const order = new InpatientOrder({
            hospitalId,
            admissionId: resolvedAdmissionId,
            appointmentId: appointmentId && mongoose.Types.ObjectId.isValid(appointmentId) ? appointmentId : undefined,
            patientId: resolvedPatientId,
            doctorId: orderingDoctorId,
            medicineName: medicineName.trim(),
            dosageValue: Number(dosageVal) || 0,
            dosageUnit: dosageUn ? String(dosageUn).trim() : '',
            route: route || 'Oral',
            frequency: frequency ? String(frequency).trim() : 'OD',
            scheduledTimes: scheduledTimes,
            inventoryItemId: inventoryItemId,
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

        // Auto-generate scheduled MAR records for today for this new order
        try {
            const { MARRecord } = getModels(req);
            await generateMARRecordsForOrder(order, { MARRecord }, new Date());
        } catch (marGenErr) {
            console.warn('Warning generating MAR for new order:', marGenErr.message);
        }

        // Socket.IO event emission to both rooms
        const io = req.app.get('io');
        if (io) {
            const eventData = {
                orderId: order._id,
                admissionId: resolvedAdmissionId,
                patientId: resolvedPatientId,
                medicineName: order.medicineName,
                timestamp: new Date()
            };
            io.to(`hospital_${hospitalId}`).emit('inpatient_order_created', eventData);
            io.to(hospitalId.toString()).emit('inpatient_order_created', eventData);
            io.to(`hospital_${hospitalId}`).emit('ipd_update', eventData);
            io.to(hospitalId.toString()).emit('ipd_update', eventData);
            io.to(`hospital_${hospitalId}`).emit('mar_scheduled', eventData);
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

        const { InpatientOrder, Admission, User } = getModels(req);
        const { admissionId: validAdmId, patientId: validPtId } = await resolveAdmissionAndPatient(admissionId, Admission);

        if (!validAdmId && !validPtId && !mongoose.Types.ObjectId.isValid(admissionId)) {
            return res.status(400).json({ success: false, message: 'Invalid admissionId format' });
        }

        const orderFilter = {
            hospitalId,
            $or: [
                ...(validAdmId ? [{ admissionId: validAdmId }] : [{ admissionId }]),
                ...(validPtId ? [{ patientId: validPtId }] : [])
            ]
        };

        const orders = await InpatientOrder.find(orderFilter)
            .sort({ createdAt: -1 })
            .lean();

        for (let ord of orders) {
            enrichOrderVirtuals(ord);
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

        let queryPatientId = patientId;
        if (!mongoose.Types.ObjectId.isValid(patientId)) {
            const MasterUser = require('../models/user.model');
            const foundUser = await MasterUser.findOne({
                $or: [
                    { patientId: String(patientId) },
                    { patientUid: String(patientId) },
                    { mrn: String(patientId) }
                ]
            }).lean();
            if (foundUser) queryPatientId = foundUser._id;
        }

        const { InpatientOrder, User } = getModels(req);
        const orders = await InpatientOrder.find({
            hospitalId,
            $or: [
                { patientId: queryPatientId },
                ...(mongoose.Types.ObjectId.isValid(patientId) ? [{ patientId }] : [])
            ]
        })
            .sort({ createdAt: -1 })
            .lean();

        for (let ord of orders) {
            enrichOrderVirtuals(ord);
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
            enrichOrderVirtuals(ord);
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

// POST /api/ipd-clinical/mar — Schedule/Create a MAR record (with duplicate slot guard)
router.post('/mar', verifyToken, resolveTenant, requireNurseOrDoctorAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const { orderId, admissionId, scheduledTime, scheduledDateKey, scheduledSlot, notes } = req.body;

        if (!orderId || !admissionId || !scheduledTime) {
            return res.status(400).json({ success: false, message: 'orderId, admissionId, and scheduledTime are required' });
        }

        const { InpatientOrder, MARRecord } = getModels(req);
        const order = await InpatientOrder.findOne({ _id: orderId, hospitalId });
        if (!order) return res.status(404).json({ success: false, message: 'Inpatient order not found' });

        const schedDt = new Date(scheduledTime);
        if (isNaN(schedDt.getTime())) {
            return res.status(400).json({ success: false, message: 'Invalid scheduledTime' });
        }
        const dateKey = scheduledDateKey ? String(scheduledDateKey).trim() : schedDt.toISOString().slice(0, 10);
        const slotStr = scheduledSlot ? String(scheduledSlot).trim() : '';

        // Duplicate dose prevention
        const dupQuery = slotStr
            ? { hospitalId, orderId: order._id, scheduledDateKey: dateKey, scheduledSlot: slotStr }
            : {
                hospitalId,
                orderId: order._id,
                scheduledTime: {
                    $gte: new Date(schedDt.getTime() - 45 * 60 * 1000),
                    $lte: new Date(schedDt.getTime() + 45 * 60 * 1000)
                }
            };
        const existingDup = await MARRecord.findOne(dupQuery).lean();
        if (existingDup) {
            return res.status(409).json({
                success: false,
                message: 'A MAR entry already exists for this medication order and scheduled slot.',
                existingMarId: existingDup._id
            });
        }

        const actorId = req.user._id || req.user.userId || null;
        const actorName = req.user.name || req.user.email || 'Staff';
        const actorRole = req.user._roleData?.name || req.user.role || 'Staff';

        const mar = new MARRecord({
            hospitalId,
            orderId: order._id,
            admissionId,
            patientId: order.patientId,
            scheduledTime: schedDt,
            scheduledDateKey: dateKey,
            scheduledSlot: slotStr,
            route: order.route || '',
            status: 'SCHEDULED',
            notes: notes || '',
            createdBy: actorId,
            createdByName: actorName,
            createdByRole: actorRole
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

        const { MARRecord, InpatientOrder, Admission, User } = getModels(req);
        const { admissionId: validAdmId, patientId: validPtId } = await resolveAdmissionAndPatient(admissionId, Admission);

        if (!validAdmId && !validPtId && !mongoose.Types.ObjectId.isValid(admissionId)) {
            return res.status(400).json({ success: false, message: 'Invalid admissionId format' });
        }

        // Ensure active orders for this admission have today's MAR records scheduled
        await ensureMARForAdmission(admissionId, hospitalId, { InpatientOrder, Admission, MARRecord });

        const query = {
            hospitalId,
            $or: [
                ...(validAdmId ? [{ admissionId: validAdmId }] : [{ admissionId }]),
                ...(validPtId ? [{ patientId: validPtId }] : [])
            ]
        };

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
                const ord = await InpatientOrder.findById(m.orderId).select('medicineName dosageValue dosageUnit route frequency instructions status doctorId startDate endDate duration').lean();
                if (ord) {
                    enrichOrderVirtuals(ord);
                    if (ord.doctorId) {
                        ord.doctorId = await User.findById(ord.doctorId).select('name specialization').lean() || ord.doctorId;
                    }
                    m.orderId = ord;
                }
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

        const { MARRecord, InpatientOrder, Admission, User } = getModels(req);
        const { admissionId: validAdmId, patientId: validPtId } = await resolveAdmissionAndPatient(admissionId, Admission);

        if (!validAdmId && !validPtId && !mongoose.Types.ObjectId.isValid(admissionId)) {
            return res.status(400).json({ success: false, message: 'Invalid admissionId format' });
        }

        // Ensure active orders for this admission have today's MAR records scheduled
        await ensureMARForAdmission(admissionId, hospitalId, { InpatientOrder, Admission, MARRecord });

        const marRecords = await MARRecord.find({
            hospitalId,
            status: { $in: ['SCHEDULED', 'DUE'] },
            $or: [
                ...(validAdmId ? [{ admissionId: validAdmId }] : [{ admissionId }]),
                ...(validPtId ? [{ patientId: validPtId }] : [])
            ]
        }).sort({ scheduledTime: 1 }).lean();

        for (let m of marRecords) {
            if (m.orderId) {
                const ord = await InpatientOrder.findById(m.orderId).select('medicineName dosageValue dosageUnit route frequency instructions status doctorId startDate endDate duration').lean();
                if (ord) {
                    enrichOrderVirtuals(ord);
                    if (ord.doctorId) {
                        ord.doctorId = await User.findById(ord.doctorId).select('name specialization').lean() || ord.doctorId;
                    }
                    m.orderId = ord;
                }
            }
            if (m.administeredBy) {
                m.administeredBy = await User.findById(m.administeredBy).select('name').lean() || m.administeredBy;
            }
        }

        res.json({ success: true, dueRecords: marRecords });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Error fetching due MAR records' });
    }
});

// PATCH /api/ipd-clinical/mar/:marId — Record medication administration (Given/Held/Refused/Missed/Not Given)
// Enforces nursing authorization and immutable audit trail if correcting a completed administration.
router.patch('/mar/:marId', verifyToken, resolveTenant, requireNursingAdministerAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const { marId } = req.params;
        const {
            status,
            actualDoseValue,
            actualDoseUnit,
            actualDose,
            route,
            administeredTime,
            notes,
            reason,
            isCorrection,
            correctionReason
        } = req.body;

        if (!mongoose.Types.ObjectId.isValid(marId)) {
            return res.status(400).json({ success: false, message: 'Invalid marId format' });
        }

        const validStatuses = ['SCHEDULED', 'DUE', 'ADMINISTERED', 'HELD', 'REFUSED', 'MISSED', 'NOT_GIVEN', 'CANCELLED'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ success: false, message: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
        }

        // Reason is mandatory if held, refused, not given, or missed
        if (['HELD', 'REFUSED', 'MISSED', 'NOT_GIVEN'].includes(status) && (!reason || !String(reason).trim())) {
            return res.status(400).json({ success: false, message: `A reason is required when medication is marked as ${status}` });
        }

        const { MARRecord, InpatientOrder } = getModels(req);
        const mar = await MARRecord.findOne({ _id: marId, hospitalId });
        if (!mar) return res.status(404).json({ success: false, message: 'MAR record not found' });

        // Check linked order status when attempting to confirm administration
        if (mar.orderId && status === 'ADMINISTERED') {
            const linkedOrder = await InpatientOrder.findOne({ _id: mar.orderId, hospitalId }).lean();
            if (linkedOrder && ['CANCELLED', 'ON_HOLD'].includes(linkedOrder.status)) {
                return res.status(400).json({
                    success: false,
                    message: `Cannot administer medication while doctor order is ${linkedOrder.status}`
                });
            }
        }

        const completedStatuses = ['ADMINISTERED', 'HELD', 'REFUSED', 'MISSED', 'NOT_GIVEN'];
        const wasCompleted = completedStatuses.includes(mar.status);
        if (wasCompleted) {
            if (!isCorrection || !correctionReason || !String(correctionReason).trim()) {
                return res.status(400).json({
                    success: false,
                    message: 'Completed medication administration cannot be silently overwritten. Use authorized correction with a correction reason.'
                });
            }
        }

        const actorId = req.user._id || req.user.userId;
        const actorName = req.user.name || req.user.email || 'Nurse';
        const actorRole = req.user._roleData?.name || req.user.role || 'Nurse';

        if (wasCompleted) {
            mar.editHistory = [
                ...(Array.isArray(mar.editHistory) ? mar.editHistory : []),
                {
                    previousStatus: mar.status,
                    previousAdministeredTime: mar.administeredTime || null,
                    previousAdministeredBy: mar.administeredBy || null,
                    previousAdministeredByName: mar.administeredByName || '',
                    previousActualDoseValue: mar.actualDoseValue,
                    previousActualDoseUnit: mar.actualDoseUnit || '',
                    previousActualDose: mar.actualDose || '',
                    previousRoute: mar.route || '',
                    previousNotes: mar.notes || '',
                    previousReason: mar.reason || '',
                    correctionReason: String(correctionReason).trim(),
                    editedBy: actorId,
                    editedByName: actorName,
                    editedByRole: actorRole,
                    editedAt: new Date()
                }
            ].slice(-50);
        }

        mar.status = status;
        mar.administeredBy = actorId;
        mar.administeredByName = actorName;
        mar.updatedBy = actorId;
        mar.updatedByName = actorName;
        mar.updatedByRole = actorRole;

        if (status === 'ADMINISTERED') {
            const parsedAdminDt = administeredTime ? new Date(administeredTime) : new Date();
            mar.administeredTime = !isNaN(parsedAdminDt.getTime()) ? parsedAdminDt : new Date();
        } else if (administeredTime) {
            const parsedAdminDt = new Date(administeredTime);
            if (!isNaN(parsedAdminDt.getTime())) mar.administeredTime = parsedAdminDt;
        }

        if (actualDoseValue !== undefined && actualDoseValue !== '') {
            mar.actualDoseValue = Number(actualDoseValue);
        }
        if (actualDoseUnit !== undefined) mar.actualDoseUnit = String(actualDoseUnit).trim();
        if (actualDose !== undefined) {
            mar.actualDose = String(actualDose).trim();
        } else if (actualDoseValue !== undefined && actualDoseValue !== '') {
            mar.actualDose = `${actualDoseValue} ${actualDoseUnit || mar.actualDoseUnit || ''}`.trim();
        }
        if (route !== undefined) mar.route = String(route).trim();
        if (notes !== undefined) mar.notes = String(notes).trim();
        if (reason !== undefined) mar.reason = String(reason).trim();

        await mar.save();

        await logClinicalAudit({
            hospitalId,
            user: req.user,
            action: wasCompleted ? 'MAR_ADMINISTRATION_CORRECTED' : `MAR_RECORDED_${status}`,
            targetModel: 'MARRecord',
            targetId: mar._id,
            targetLabel: `MAR ${status} for admission ${mar.admissionId}${wasCompleted ? ` (${correctionReason})` : ''}`,
            req
        });

        const io = req.app.get('io');
        if (io) {
            io.to(`hospital_${hospitalId}`).emit('mar_administered', {
                marId: mar._id,
                admissionId: mar.admissionId,
                status: mar.status,
                timestamp: new Date()
            });
            io.to(`hospital_${hospitalId}`).emit('ipd_drug_chart_updated', {
                admissionId: mar.admissionId,
                marId: mar._id,
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
            remark,
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

        const cleanRemark = remark !== undefined ? String(remark).trim() : '';
        const cleanNotes = notes !== undefined ? String(notes).trim() : cleanRemark;

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
            remark: cleanRemark,
            notes: cleanNotes
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

        const { IPDVitals, Admission, User } = getModels(req);
        const { admissionId: validAdmId, patientId: validPtId } = await resolveAdmissionAndPatient(admissionId, Admission);

        if (!validAdmId && !validPtId && !mongoose.Types.ObjectId.isValid(admissionId)) {
            return res.status(400).json({ success: false, message: 'Invalid admissionId format' });
        }

        const vitalsList = await IPDVitals.find({
            hospitalId,
            $or: [
                ...(validAdmId ? [{ admissionId: validAdmId }] : [{ admissionId }]),
                ...(validPtId ? [{ patientId: validPtId }] : [])
            ]
        })
            .sort({ recordedAt: -1 })
            .lean();

        const recorderIds = [...new Set(
            vitalsList
                .map(v => v.recordedBy)
                .filter(id => id && mongoose.Types.ObjectId.isValid(id))
                .map(String)
        )];
        if (recorderIds.length > 0) {
            const recorders = await User.find({ _id: { $in: recorderIds } })
                .select('name employeeId patientId uhid role')
                .lean();
            const recorderMap = new Map(recorders.map(u => [String(u._id), u]));
            for (const v of vitalsList) {
                if (v.recordedBy && recorderMap.has(String(v.recordedBy))) {
                    v.recordedBy = recorderMap.get(String(v.recordedBy));
                }
            }
        }

        res.json({ success: true, vitals: vitalsList });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Error fetching vitals' });
    }
});

// PATCH /api/ipd-clinical/admissions/:admissionId/vitals/:vitalsId — Edit remark/observation on an existing vitals row (Nurse/Doctor/Admin)
router.patch('/admissions/:admissionId/vitals/:vitalsId', verifyToken, resolveTenant, requireNurseOrDoctorAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const { admissionId, vitalsId } = req.params;
        const { remark, notes } = req.body || {};

        if (!mongoose.Types.ObjectId.isValid(vitalsId)) {
            return res.status(400).json({ success: false, message: 'Invalid vitalsId format' });
        }

        const { IPDVitals, Admission } = getModels(req);
        const { admissionId: validAdmId, patientId: validPtId } = await resolveAdmissionAndPatient(admissionId, Admission);

        const vitalsDoc = await IPDVitals.findOne({ _id: vitalsId, hospitalId });
        if (!vitalsDoc) {
            return res.status(404).json({ success: false, message: 'Vitals record not found in this hospital' });
        }

        // Ensure vitalsDoc belongs to the requested admission/patient scope
        const admMatch = validAdmId && vitalsDoc.admissionId && String(vitalsDoc.admissionId) === String(validAdmId);
        const ptMatch = validPtId && vitalsDoc.patientId && String(vitalsDoc.patientId) === String(validPtId);
        if (!admMatch && !ptMatch) {
            return res.status(403).json({ success: false, message: 'Vitals record does not belong to this admission' });
        }

        const cleanRemark = remark !== undefined ? String(remark).trim() : (notes !== undefined ? String(notes).trim() : '');
        const cleanNotes = notes !== undefined ? String(notes).trim() : cleanRemark;

        vitalsDoc.remark = cleanRemark;
        vitalsDoc.notes = cleanNotes;
        vitalsDoc.remarkUpdatedBy = req.user._id || req.user.userId || null;
        vitalsDoc.remarkUpdatedByName = req.user.name || 'Staff';
        vitalsDoc.remarkUpdatedAt = new Date();
        await vitalsDoc.save();

        await logClinicalAudit({
            hospitalId,
            user: req.user,
            action: 'VITALS_UPDATED',
            targetModel: 'IPDVitals',
            targetId: vitalsDoc._id,
            targetLabel: `Updated vitals remark (${cleanRemark || 'Cleared'})`,
            req
        });

        const io = req.app.get('io');
        if (io) {
            io.to(`hospital_${hospitalId}`).emit('vitals_recorded', {
                vitalsId: vitalsDoc._id,
                admissionId: vitalsDoc.admissionId,
                patientId: vitalsDoc.patientId,
                timestamp: new Date()
            });
        }

        res.json({ success: true, message: 'Vitals remark updated successfully', vitals: vitalsDoc });
    } catch (err) {
        console.error('Update vitals remark error:', err);
        res.status(500).json({ success: false, message: 'Error updating vitals remark' });
    }
});

// GET /api/ipd-clinical/admissions/:admissionId/vitals/latest — Get latest single vitals snapshot
router.get('/admissions/:admissionId/vitals/latest', verifyToken, resolveTenant, requireNurseOrDoctorAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const { admissionId } = req.params;

        const { IPDVitals, Admission, User } = getModels(req);
        const { admissionId: validAdmId, patientId: validPtId } = await resolveAdmissionAndPatient(admissionId, Admission);

        if (!validAdmId && !validPtId && !mongoose.Types.ObjectId.isValid(admissionId)) {
            return res.status(400).json({ success: false, message: 'Invalid admissionId format' });
        }

        const latest = await IPDVitals.findOne({
            hospitalId,
            $or: [
                ...(validAdmId ? [{ admissionId: validAdmId }] : [{ admissionId }]),
                ...(validPtId ? [{ patientId: validPtId }] : [])
            ]
        })
            .sort({ recordedAt: -1 })
            .lean();

        if (latest && latest.recordedBy && mongoose.Types.ObjectId.isValid(latest.recordedBy)) {
            latest.recordedBy = await User.findById(latest.recordedBy)
                .select('name employeeId patientId uhid role')
                .lean() || latest.recordedBy;
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
            requestedBy: mongoose.Types.ObjectId.isValid(nurseId) ? nurseId : undefined,
            requestedByName: nurseName,
            nurseId: mongoose.Types.ObjectId.isValid(nurseId) ? nurseId : undefined,
            issueType: issueType || 'DOSE_QUERY',
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
                        requestedBy: clar.requestedByName || (typeof clar.requestedBy === 'string' ? clar.requestedBy : clar.requestedBy?.name) || 'Nurse',
                        nurseId: clar.nurseId || (typeof clar.requestedBy === 'object' ? clar.requestedBy?._id : clar.requestedBy),
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

// ============================================================================
// SECTION E: TWO-PAGE IN-PATIENT CLINICAL NOTES & PATIENT-NURSE COMMUNICATION
// ============================================================================

const isStaffClinicalUser = (req) => {
    const role = getUserRole(req);
    const perms = req.user._roleData?.permissions || [];
    return (
        NURSE_ROLES.includes(role) ||
        perms.includes('*') ||
        perms.includes('nurse_access') ||
        perms.includes('doctor_access') ||
        perms.includes('clinical_manage') ||
        perms.includes('ipd_view')
    );
};

const requirePatientOrClinicalAccess = (req, res, next) => {
    if (isStaffClinicalUser(req)) return next();
    const role = getUserRole(req);
    if (role === 'patient') return next();
    return res.status(403).json({ success: false, message: 'Patient or Clinical authorization required' });
};

const deriveCommunicationSenderRole = (req, requestedRole) => {
    const rawRole = getUserRole(req);
    if (rawRole === 'patient') return 'Patient';
    if (['nurse', 'staffnurse', 'headnurse'].includes(rawRole)) {
        return requestedRole === 'Patient' ? 'Patient' : 'Nurse';
    }
    if (['doctor', 'clinicdoctor', 'clinic doctor', 'surgeon', 'consultant', 'physician'].includes(rawRole)) {
        return requestedRole === 'Patient' ? 'Patient' : 'Doctor';
    }
    if (requestedRole === 'Patient') return 'Patient';
    return 'Authorized Staff';
};

// GET /api/ipd-clinical/admissions/:admissionId/clinical-notes
router.get('/admissions/:admissionId/clinical-notes', verifyToken, resolveTenant, requireNurseOrDoctorAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const { admissionId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(admissionId)) {
            return res.status(400).json({ success: false, message: 'Invalid admissionId format' });
        }

        const { Admission, InpatientClinicalNote, IPDVitals, User } = getModels(req);
        const admission = await Admission.findOne({ _id: admissionId, hospitalId }).lean();
        if (!admission) {
            return res.status(404).json({ success: false, message: 'Admission not found in this hospital' });
        }

        if (admission.patientId) {
            admission.patientId = await (User || MasterUser)
                .findById(admission.patientId)
                .select('name phone patientId mrn uhid gender dob age')
                .lean() || admission.patientId;
        }
        if (admission.doctorId) {
            admission.doctorId = await (User || MasterUser)
                .findById(admission.doctorId)
                .select('name email specialization department')
                .lean() || admission.doctorId;
        }

        const [noteDoc, latestVitals] = await Promise.all([
            InpatientClinicalNote.findOne({ hospitalId, admissionId: admission._id }).lean(),
            IPDVitals.findOne({ hospitalId, admissionId: admission._id }).sort({ recordedAt: -1 }).lean()
        ]);

        res.json({
            success: true,
            clinicalNote: noteDoc || null,
            admission,
            latestVitals: latestVitals || null
        });
    } catch (err) {
        console.error('Fetch inpatient clinical notes error:', err);
        res.status(500).json({ success: false, message: 'Error fetching in-patient clinical notes' });
    }
});

// POST / PUT /api/ipd-clinical/admissions/:admissionId/clinical-notes
const saveInpatientClinicalNoteHandler = async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const { admissionId } = req.params;
        if (!hospitalId) return res.status(403).json({ success: false, message: 'Hospital context required' });
        if (!mongoose.Types.ObjectId.isValid(admissionId)) {
            return res.status(400).json({ success: false, message: 'Invalid admissionId format' });
        }

        const { Admission, InpatientClinicalNote } = getModels(req);
        const admission = await Admission.findOne({ _id: admissionId, hospitalId });
        if (!admission) {
            return res.status(404).json({ success: false, message: 'Admission not found in this hospital' });
        }

        const payload = req.body || {};
        const actorId = req.user._id || req.user.userId;
        const actorName = req.user.name || req.user.email || 'Clinical Staff';
        const actorRole = req.user._roleData?.name || req.user.role || 'Staff';

        const strVal = (v) => (v !== undefined && v !== null ? String(v) : '');
        const cleanStr = (v) => strVal(v).trim();
        const genExamInput = payload.generalExamination || {};
        const footerInput = payload.footer || {};

        let noteDoc = await InpatientClinicalNote.findOne({ hospitalId, admissionId: admission._id });
        const isUpdate = Boolean(noteDoc);

        if (!noteDoc) {
            noteDoc = new InpatientClinicalNote({
                hospitalId,
                admissionId: admission._id,
                patientId: admission.patientId,
                createdBy: actorId,
                createdByName: actorName,
                createdByRole: actorRole
            });
        }

        const fieldKeys = [
            'patientName', 'age', 'sex', 'regdNo', 'ipdNo', 'noteDate', 'noteTime', 'ward', 'bedNo', 'consultantName',
            'historyAndComplaints', 'relevantPhysicalExamination', 'historyOfPresentIllness',
            'pastMedicalSurgicalHistory', 'personalSocialHistory', 'anyDrugAllergy',
            'systemicExamination', 'provisionalDiagnosis', 'investigations', 'dischargeAndFollowUp'
        ];
        for (const key of fieldKeys) {
            if (payload[key] !== undefined) {
                noteDoc[key] = ['historyAndComplaints', 'relevantPhysicalExamination', 'historyOfPresentIllness', 'pastMedicalSurgicalHistory', 'personalSocialHistory', 'anyDrugAllergy', 'systemicExamination', 'provisionalDiagnosis', 'investigations', 'dischargeAndFollowUp'].includes(key)
                    ? strVal(payload[key])
                    : cleanStr(payload[key]);
            }
        }

        if (payload.generalExamination !== undefined) {
            noteDoc.generalExamination = {
                bp: cleanStr(genExamInput.bp),
                temp: cleanStr(genExamInput.temp),
                pallor: cleanStr(genExamInput.pallor),
                pulse: cleanStr(genExamInput.pulse),
                spo2: cleanStr(genExamInput.spo2),
                pain: cleanStr(genExamInput.pain)
            };
        }

        if (payload.footer !== undefined) {
            noteDoc.footer = {
                consultantName: cleanStr(footerInput.consultantName),
                signature: cleanStr(footerInput.signature),
                signDate: cleanStr(footerInput.signDate),
                signTime: cleanStr(footerInput.signTime)
            };
        }

        if (Array.isArray(payload.continuationPages)) {
            noteDoc.continuationPages = payload.continuationPages.map((cp, idx) => ({
                pageNumber: Number(cp.pageNumber) || (idx + 3),
                title: cleanStr(cp.title) || `CONTINUATION SHEET (PAGE ${idx + 3})`,
                notes: strVal(cp.notes || cp.content || ''),
                createdAt: cp.createdAt || new Date(),
                updatedAt: new Date()
            }));
        }

        if (payload.handwritingStrokes !== undefined) {
            noteDoc.handwritingStrokes = payload.handwritingStrokes;
            noteDoc.markModified('handwritingStrokes');
        }

        if (Array.isArray(payload.aiScribeSessions) && payload.aiScribeSessions.length > 0) {
            const existingAi = Array.isArray(noteDoc.aiScribeSessions) ? noteDoc.aiScribeSessions : [];
            noteDoc.aiScribeSessions = [...existingAi, ...payload.aiScribeSessions].slice(-20);
        }

        noteDoc.updatedBy = actorId;
        noteDoc.updatedByName = actorName;
        noteDoc.updatedByRole = actorRole;

        const existingHistory = Array.isArray(noteDoc.editHistory) ? noteDoc.editHistory : [];
        noteDoc.editHistory = [
            ...existingHistory,
            {
                editedBy: actorId,
                editedByName: actorName,
                editedByRole: actorRole,
                editedAt: new Date(),
                summary: isUpdate ? 'Updated In-Patient Clinical Notes' : 'Created In-Patient Clinical Notes'
            }
        ].slice(-50);

        await noteDoc.save();

        await logClinicalAudit({
            hospitalId,
            user: req.user,
            action: 'IPD_CLINICAL_NOTE_SAVED',
            targetModel: 'InpatientClinicalNote',
            targetId: noteDoc._id,
            targetLabel: `In-Patient Clinical Notes (${noteDoc.ipdNo || admission._id})`,
            req
        });

        const io = req.app.get('io');
        if (io) {
            io.to(`hospital_${hospitalId}`).emit('ipd_clinical_note_updated', {
                admissionId: admission._id,
                noteId: noteDoc._id,
                updatedByName: actorName,
                timestamp: new Date()
            });
        }

        res.status(isUpdate ? 200 : 201).json({
            success: true,
            message: isUpdate ? 'In-Patient Clinical Notes updated' : 'In-Patient Clinical Notes saved',
            clinicalNote: noteDoc
        });
    } catch (err) {
        console.error('Save inpatient clinical notes error:', err);
        res.status(500).json({ success: false, message: 'Error saving in-patient clinical notes' });
    }
};

router.post('/admissions/:admissionId/clinical-notes', verifyToken, resolveTenant, requireNurseOrDoctorAccess, saveInpatientClinicalNoteHandler);
router.put('/admissions/:admissionId/clinical-notes', verifyToken, resolveTenant, requireNurseOrDoctorAccess, saveInpatientClinicalNoteHandler);

// GET /api/ipd-clinical/admissions/:admissionId/communication — Patient & Nurse interaction notes timeline
router.get('/admissions/:admissionId/communication', verifyToken, resolveTenant, requirePatientOrClinicalAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const { admissionId } = req.params;
        if (!mongoose.Types.ObjectId.isValid(admissionId)) {
            return res.status(400).json({ success: false, message: 'Invalid admissionId format' });
        }

        const { Admission, PatientNurseNote } = getModels(req);
        const admission = await Admission.findOne({ _id: admissionId, hospitalId }).lean();
        if (!admission) {
            return res.status(404).json({ success: false, message: 'Admission not found in this hospital' });
        }

        // Strict patient ownership check when accessed by a patient account
        if (!isStaffClinicalUser(req)) {
            const actorId = String(req.user._id || req.user.userId || '');
            if (!admission.patientId || String(admission.patientId) !== actorId) {
                return res.status(403).json({ success: false, message: 'Access denied for this admission communication thread' });
            }
        }

        const messages = await PatientNurseNote.find({ hospitalId, admissionId: admission._id })
            .sort({ createdAt: 1 })
            .lean();

        res.json({ success: true, messages });
    } catch (err) {
        console.error('Fetch patient-nurse communication error:', err);
        res.status(500).json({ success: false, message: 'Error fetching communication notes' });
    }
});

// POST /api/ipd-clinical/admissions/:admissionId/communication — Add communication entry
router.post('/admissions/:admissionId/communication', verifyToken, resolveTenant, requirePatientOrClinicalAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const { admissionId } = req.params;
        const { message, senderRole: requestedRole, senderName: requestedSenderName } = req.body || {};

        if (!hospitalId) return res.status(403).json({ success: false, message: 'Hospital context required' });
        if (!mongoose.Types.ObjectId.isValid(admissionId)) {
            return res.status(400).json({ success: false, message: 'Invalid admissionId format' });
        }
        if (!message || !String(message).trim()) {
            return res.status(400).json({ success: false, message: 'Message text is required' });
        }

        const { Admission, PatientNurseNote } = getModels(req);
        const admission = await Admission.findOne({ _id: admissionId, hospitalId });
        if (!admission) {
            return res.status(404).json({ success: false, message: 'Admission not found in this hospital' });
        }

        const staffUser = isStaffClinicalUser(req);
        const actorId = req.user._id || req.user.userId;
        if (!staffUser && (!admission.patientId || String(admission.patientId) !== String(actorId))) {
            return res.status(403).json({ success: false, message: 'Patients can only post messages for their own admission' });
        }

        const senderRole = deriveCommunicationSenderRole(req, requestedRole);
        const senderName = (staffUser && senderRole === 'Patient' && requestedSenderName && String(requestedSenderName).trim())
            ? String(requestedSenderName).trim()
            : (req.user.name || req.user.email || (senderRole === 'Patient' ? 'Patient' : 'Clinical Staff'));

        const noteDoc = new PatientNurseNote({
            hospitalId,
            admissionId: admission._id,
            patientId: admission.patientId,
            senderId: actorId,
            senderName,
            senderRole,
            message: String(message).trim(),
            editHistory: []
        });

        await noteDoc.save();

        await logClinicalAudit({
            hospitalId,
            user: req.user,
            action: 'PATIENT_NURSE_NOTE_ADDED',
            targetModel: 'PatientNurseNote',
            targetId: noteDoc._id,
            targetLabel: `${senderRole} communication note (${admission._id})`,
            req
        });

        const io = req.app.get('io');
        if (io) {
            io.to(`hospital_${hospitalId}`).emit('patient_nurse_communication_updated', {
                admissionId: admission._id,
                noteId: noteDoc._id,
                action: 'CREATED'
            });
        }

        res.status(201).json({ success: true, message: 'Communication note added', entry: noteDoc });
    } catch (err) {
        console.error('Add patient-nurse communication error:', err);
        res.status(500).json({ success: false, message: 'Error saving communication note' });
    }
});

// PATCH / PUT /api/ipd-clinical/admissions/:admissionId/communication/:noteId — Edit note preserving original author & audit history
const editPatientNurseNoteHandler = async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const { admissionId, noteId } = req.params;
        const { message } = req.body || {};

        if (!hospitalId) return res.status(403).json({ success: false, message: 'Hospital context required' });
        if (!mongoose.Types.ObjectId.isValid(admissionId) || !mongoose.Types.ObjectId.isValid(noteId)) {
            return res.status(400).json({ success: false, message: 'Invalid ID format' });
        }
        if (!message || !String(message).trim()) {
            return res.status(400).json({ success: false, message: 'Updated message text cannot be empty' });
        }

        const { PatientNurseNote } = getModels(req);
        const noteDoc = await PatientNurseNote.findOne({ _id: noteId, admissionId, hospitalId });
        if (!noteDoc) {
            return res.status(404).json({ success: false, message: 'Communication entry not found in this hospital' });
        }

        const staffUser = isStaffClinicalUser(req);
        const actorId = req.user._id || req.user.userId;
        // Patients can only edit their own 'Patient' note; clinical staff can edit within their hospital with full audit trail
        if (!staffUser && (String(noteDoc.senderId) !== String(actorId) || noteDoc.senderRole !== 'Patient')) {
            return res.status(403).json({ success: false, message: 'Not authorized to edit this communication entry' });
        }

        const cleanNewMsg = String(message).trim();
        const actorName = req.user.name || req.user.email || 'Staff';
        const actorRole = deriveCommunicationSenderRole(req);

        if (noteDoc.message !== cleanNewMsg) {
            const prevHistory = Array.isArray(noteDoc.editHistory) ? noteDoc.editHistory : [];
            noteDoc.editHistory = [
                ...prevHistory,
                {
                    previousMessage: noteDoc.message,
                    editedBy: actorId,
                    editedByName: actorName,
                    editedByRole: actorRole,
                    editedAt: new Date()
                }
            ].slice(-50);

            noteDoc.message = cleanNewMsg;
            noteDoc.editedBy = actorId;
            noteDoc.editedByName = actorName;
            noteDoc.editedAt = new Date();
            noteDoc.editedByRole = actorRole;
            await noteDoc.save();

            await logClinicalAudit({
                hospitalId,
                user: req.user,
                action: 'PATIENT_NURSE_NOTE_EDITED',
                targetModel: 'PatientNurseNote',
                targetId: noteDoc._id,
                targetLabel: `Edited ${noteDoc.senderRole} communication note (${admissionId})`,
                req
            });

            const io = req.app.get('io');
            if (io) {
                io.to(`hospital_${hospitalId}`).emit('patient_nurse_communication_updated', {
                    admissionId,
                    noteId: noteDoc._id,
                    action: 'EDITED'
                });
            }
        }

        res.json({ success: true, message: 'Communication note updated with audit trail', entry: noteDoc });
    } catch (err) {
        console.error('Edit patient-nurse communication error:', err);
        res.status(500).json({ success: false, message: 'Error updating communication note' });
    }
};

router.patch('/admissions/:admissionId/communication/:noteId', verifyToken, resolveTenant, requirePatientOrClinicalAccess, editPatientNurseNoteHandler);
router.put('/admissions/:admissionId/communication/:noteId', verifyToken, resolveTenant, requirePatientOrClinicalAccess, editPatientNurseNoteHandler);

// ============================================================================
// SECTION I: IPD PROGRESS NOTES (1-Page Reference + Chronological Edit Audit)
// ============================================================================

const findUserAcrossStores = async (TenantUser, id, selectStr) => {
    if (!id) return null;
    if (TenantUser && TenantUser !== MasterUser) {
        const hit = await TenantUser.findById(id).select(selectStr).lean().catch(() => null);
        if (hit) return hit;
    }
    return MasterUser.findById(id).select(selectStr).lean().catch(() => null);
};

const buildUserMapAcrossStores = async (TenantUser, idList, selectStr) => {
    const map = new Map();
    if (!idList || idList.length === 0) return map;
    if (TenantUser && TenantUser !== MasterUser) {
        const tUsers = await TenantUser.find({ _id: { $in: idList } }).select(selectStr).lean().catch(() => []);
        tUsers.forEach(u => map.set(String(u._id), u));
    }
    const missing = idList.filter(id => !map.has(String(id)));
    if (missing.length > 0) {
        const mUsers = await MasterUser.find({ _id: { $in: missing } }).select(selectStr).lean().catch(() => []);
        mUsers.forEach(u => map.set(String(u._id), u));
    }
    return map;
};

// GET /api/ipd-clinical/admissions/:admissionId/progress-notes
router.get('/admissions/:admissionId/progress-notes', verifyToken, resolveTenant, requireNurseOrDoctorAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const { admissionId } = req.params;
        if (!mongoose.Types.ObjectId.isValid(admissionId)) {
            return res.status(400).json({ success: false, message: 'Invalid admissionId format' });
        }

        const { Admission, InpatientProgressNote, Bed, User } = getModels(req);
        const admission = await Admission.findOne({ _id: admissionId, hospitalId }).lean();
        if (!admission) {
            return res.status(404).json({ success: false, message: 'Admission not found in this hospital' });
        }

        if (admission.patientId && !admission.patientId.name) {
            admission.patientId = await findUserAcrossStores(User, admission.patientId, 'name phone patientId mrn uhid gender dob age') || admission.patientId;
        }
        if (admission.doctorId && !admission.doctorId.name) {
            admission.doctorId = await findUserAcrossStores(User, admission.doctorId, 'name email specialization department') || admission.doctorId;
        }
        if (admission.bedId && Bed && !admission.bedId.bedNumber) {
            admission.bedId = await Bed.findById(admission.bedId).select('bedNumber ward bedType').lean().catch(() => null) || admission.bedId;
        }

        const progressNotes = await InpatientProgressNote.find({
            hospitalId,
            admissionId: admission._id
        })
            .sort({ recordedAt: 1, createdAt: 1 })
            .lean();

        res.json({ success: true, progressNotes, admission });
    } catch (err) {
        console.error('Fetch progress notes error:', err);
        res.status(500).json({ success: false, message: 'Error fetching clinical progress notes' });
    }
});

// POST /api/ipd-clinical/admissions/:admissionId/progress-notes
router.post('/admissions/:admissionId/progress-notes', verifyToken, resolveTenant, requireNurseOrDoctorAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const { admissionId } = req.params;
        const { recordedAt, note, sheetNo } = req.body || {};

        if (!hospitalId) return res.status(403).json({ success: false, message: 'Hospital context required' });
        if (!mongoose.Types.ObjectId.isValid(admissionId)) {
            return res.status(400).json({ success: false, message: 'Invalid admissionId format' });
        }
        if (!note || !String(note).trim()) {
            return res.status(400).json({ success: false, message: 'Clinical progress observation is required' });
        }

        const parsedRecordedAt = recordedAt ? new Date(recordedAt) : new Date();
        if (isNaN(parsedRecordedAt.getTime())) {
            return res.status(400).json({ success: false, message: 'Invalid date & time for progress note' });
        }

        const { Admission, InpatientProgressNote } = getModels(req);
        const admission = await Admission.findOne({ _id: admissionId, hospitalId });
        if (!admission) {
            return res.status(404).json({ success: false, message: 'Admission not found in this hospital' });
        }

        const actorId = req.user._id || req.user.userId;
        const actorName = req.user.name || req.user.email || 'Clinical Staff';
        const actorRole = req.user._roleData?.name || req.user.role || 'Staff';

        const entry = new InpatientProgressNote({
            hospitalId,
            admissionId: admission._id,
            patientId: admission.patientId,
            recordedAt: parsedRecordedAt,
            note: String(note).trim(),
            sheetNo: sheetNo ? String(sheetNo).trim() : '1',
            authorId: actorId,
            authorName: actorName,
            authorRole: actorRole,
            updatedBy: actorId,
            updatedByName: actorName,
            updatedByRole: actorRole,
            editHistory: []
        });

        await entry.save();

        await logClinicalAudit({
            hospitalId,
            user: req.user,
            action: 'IPD_PROGRESS_NOTE_ADDED',
            targetModel: 'InpatientProgressNote',
            targetId: entry._id,
            targetLabel: `Clinical progress note added for admission ${admission._id}`,
            req
        });

        const io = req.app.get('io');
        if (io) {
            io.to(`hospital_${hospitalId}`).emit('ipd_progress_note_updated', {
                admissionId: admission._id,
                noteId: entry._id,
                action: 'CREATED',
                timestamp: new Date()
            });
        }

        res.status(201).json({ success: true, message: 'Clinical progress note saved', progressNote: entry });
    } catch (err) {
        console.error('Create progress note error:', err);
        res.status(500).json({ success: false, message: 'Error saving clinical progress note' });
    }
});

// PATCH /api/ipd-clinical/admissions/:admissionId/progress-notes/:noteId
router.patch('/admissions/:admissionId/progress-notes/:noteId', verifyToken, resolveTenant, requireNurseOrDoctorAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const { admissionId, noteId } = req.params;
        const { recordedAt, note, sheetNo, editReason } = req.body || {};

        if (!hospitalId) return res.status(403).json({ success: false, message: 'Hospital context required' });
        if (!mongoose.Types.ObjectId.isValid(admissionId) || !mongoose.Types.ObjectId.isValid(noteId)) {
            return res.status(400).json({ success: false, message: 'Invalid ID format' });
        }
        if (note !== undefined && !String(note).trim()) {
            return res.status(400).json({ success: false, message: 'Clinical progress observation cannot be empty' });
        }

        const { InpatientProgressNote } = getModels(req);
        const noteDoc = await InpatientProgressNote.findOne({ _id: noteId, admissionId, hospitalId });
        if (!noteDoc) {
            return res.status(404).json({ success: false, message: 'Progress note not found in this hospital' });
        }

        const actorId = req.user._id || req.user.userId;
        const actorName = req.user.name || req.user.email || 'Clinical Staff';
        const actorRole = req.user._roleData?.name || req.user.role || 'Staff';
        const sanitizedRole = getUserRole(req);

        // Edit permission: original author, Doctors, Head Nurses, or Hospital/Central/Super Admins
        const isAuthor = noteDoc.authorId && String(noteDoc.authorId) === String(actorId);
        const canEditOthers = isDoctorOrAdminRole(req) || sanitizedRole === 'headnurse';
        if (!isAuthor && !canEditOthers) {
            return res.status(403).json({
                success: false,
                message: 'You are only authorized to edit progress notes you authored (unless Doctor / Head Nurse / Admin)'
            });
        }

        const nextNote = note !== undefined ? String(note).trim() : noteDoc.note;
        const nextRecordedAt = recordedAt !== undefined ? new Date(recordedAt) : noteDoc.recordedAt;
        if (recordedAt !== undefined && isNaN(nextRecordedAt.getTime())) {
            return res.status(400).json({ success: false, message: 'Invalid date & time for progress note' });
        }
        const nextSheetNo = sheetNo !== undefined ? (String(sheetNo).trim() || '1') : noteDoc.sheetNo;

        const changed = (
            nextNote !== noteDoc.note ||
            String(new Date(nextRecordedAt).getTime()) !== String(new Date(noteDoc.recordedAt).getTime()) ||
            nextSheetNo !== noteDoc.sheetNo
        );

        if (changed) {
            noteDoc.editHistory = [
                ...(Array.isArray(noteDoc.editHistory) ? noteDoc.editHistory : []),
                {
                    previousNote: noteDoc.note,
                    previousRecordedAt: noteDoc.recordedAt,
                    editReason: editReason ? String(editReason).trim() : 'Clinical update',
                    editedBy: actorId,
                    editedByName: actorName,
                    editedByRole: actorRole,
                    editedAt: new Date()
                }
            ].slice(-50);

            noteDoc.note = nextNote;
            noteDoc.recordedAt = nextRecordedAt;
            noteDoc.sheetNo = nextSheetNo;
            noteDoc.updatedBy = actorId;
            noteDoc.updatedByName = actorName;
            noteDoc.updatedByRole = actorRole;

            await noteDoc.save();

            await logClinicalAudit({
                hospitalId,
                user: req.user,
                action: 'IPD_PROGRESS_NOTE_EDITED',
                targetModel: 'InpatientProgressNote',
                targetId: noteDoc._id,
                targetLabel: `Edited progress note for admission ${admissionId}`,
                req
            });

            const io = req.app.get('io');
            if (io) {
                io.to(`hospital_${hospitalId}`).emit('ipd_progress_note_updated', {
                    admissionId,
                    noteId: noteDoc._id,
                    action: 'EDITED',
                    timestamp: new Date()
                });
            }
        }

        res.json({ success: true, message: 'Progress note updated with edit history', progressNote: noteDoc });
    } catch (err) {
        console.error('Edit progress note error:', err);
        res.status(500).json({ success: false, message: 'Error updating progress note' });
    }
});

// ============================================================================
// SECTION J: 2-PAGE IPD DRUG CHART (ALLERGY, STAT, IV FLUIDS & MAR GRID)
// ============================================================================

const normalizeMarStatusInput = (rawStatus) => {
    const s = String(rawStatus || '').trim().toUpperCase().replace(/\s+/g, '_');
    if (s === 'GIVEN' || s === 'ADMINISTERED') return 'ADMINISTERED';
    if (s === 'PENDING' || s === 'SCHEDULED' || s === 'DUE') return s === 'DUE' ? 'DUE' : 'SCHEDULED';
    if (s === 'NOT_GIVEN' || s === 'NOTGIVEN') return 'NOT_GIVEN';
    if (s === 'MISSED') return 'MISSED';
    if (s === 'REFUSED') return 'REFUSED';
    if (s === 'HELD' || s === 'ON_HOLD') return 'HELD';
    if (s === 'CANCELLED') return 'CANCELLED';
    return s;
};

const fetchDrugChartBundle = async (req, hospitalId, admission) => {
    const { InpatientDrugChart, InpatientOrder, MARRecord, InpatientClinicalNote, Bed, User } = getModels(req);

    if (admission.patientId && !admission.patientId.name) {
        admission.patientId = await findUserAcrossStores(
            User,
            admission.patientId,
            'name phone patientId mrn uhid gender dob age allergies fertilityProfile'
        ) || admission.patientId;
    }
    if (admission.doctorId && !admission.doctorId.name) {
        admission.doctorId = await findUserAcrossStores(
            User,
            admission.doctorId,
            'name email specialization department'
        ) || admission.doctorId;
    }
    if (admission.admittedBy && !admission.admittedBy.name) {
        admission.admittedBy = await findUserAcrossStores(
            User,
            admission.admittedBy,
            'name email specialization department role'
        ) || admission.admittedBy;
    }
    if (admission.bedId && Bed && !admission.bedId.bedNumber) {
        admission.bedId = await Bed.findById(admission.bedId).select('bedNumber ward bedType').lean().catch(() => null) || admission.bedId;
    }

    const [drugChart, orders, marRecords, clinicalNote] = await Promise.all([
        InpatientDrugChart.findOne({ hospitalId, admissionId: admission._id }).lean(),
        InpatientOrder.find({ hospitalId, admissionId: admission._id }).sort({ startDate: 1, createdAt: 1 }).lean(),
        MARRecord.find({ hospitalId, admissionId: admission._id }).sort({ scheduledTime: 1, createdAt: 1 }).lean(),
        InpatientClinicalNote.findOne({ hospitalId, admissionId: admission._id }).select('anyDrugAllergy').lean()
    ]);

    const admDocRaw = admission.doctorId?.name || admission.admittedBy?.name || admission.doctorName || '';
    const admDocName = admDocRaw ? (/^dr\.?\s*/i.test(admDocRaw) ? admDocRaw : `Dr. ${admDocRaw}`) : '';
    const admDocId = admission.doctorId?._id || admission.doctorId || admission.admittedBy?._id || admission.admittedBy || null;

    if (drugChart) {
        if (Array.isArray(drugChart.statDoses)) {
            drugChart.statDoses.forEach(s => {
                const doc = String(s.doctorName || '').trim();
                const given = String(s.givenByName || '').trim();
                const author = String(s.authorName || '').trim();
                const isNurseAuthor = String(s.authorRole || '').toLowerCase().includes('nurse');
                if (!doc || (given && doc.toLowerCase() === given.toLowerCase()) || (isNurseAuthor && doc.toLowerCase() === author.toLowerCase()) || /\(nurse\)/i.test(doc)) {
                    s.doctorName = admDocName || '';
                    if (admDocId && (!s.doctorId || String(s.doctorId) === String(s.authorId))) {
                        s.doctorId = admDocId;
                    }
                } else if (!/^dr\.?\s*/i.test(doc)) {
                    s.doctorName = `Dr. ${doc}`;
                }
            });
        }
        if (Array.isArray(drugChart.ivFluids)) {
            drugChart.ivFluids.forEach(iv => {
                const doc = String(iv.doctorName || '').trim();
                const admin = String(iv.adminByName || '').trim();
                const author = String(iv.authorName || '').trim();
                const isNurseAuthor = String(iv.authorRole || '').toLowerCase().includes('nurse');
                if (!doc || (admin && doc.toLowerCase() === admin.toLowerCase()) || (isNurseAuthor && doc.toLowerCase() === author.toLowerCase()) || /\(nurse\)/i.test(doc)) {
                    iv.doctorName = admDocName || '';
                    if (admDocId && (!iv.doctorId || String(iv.doctorId) === String(iv.authorId))) {
                        iv.doctorId = admDocId;
                    }
                } else if (!/^dr\.?\s*/i.test(doc)) {
                    iv.doctorName = `Dr. ${doc}`;
                }
            });
        }
    }

    const userIds = new Set();
    orders.forEach(o => { if (o.doctorId && mongoose.Types.ObjectId.isValid(o.doctorId)) userIds.add(String(o.doctorId)); });
    marRecords.forEach(m => { if (m.administeredBy && mongoose.Types.ObjectId.isValid(m.administeredBy)) userIds.add(String(m.administeredBy)); });

    const userMap = await buildUserMapAcrossStores(User, [...userIds], 'name specialization role employeeId');

    const orderMap = new Map();
    for (const o of orders) {
        enrichOrderVirtuals(o);
        if (o.doctorId && userMap.has(String(o.doctorId))) {
            o.doctorId = userMap.get(String(o.doctorId));
        }
        orderMap.set(String(o._id), o);
    }

    for (const m of marRecords) {
        if (m.orderId && orderMap.has(String(m.orderId))) {
            m.orderId = orderMap.get(String(m.orderId));
        }
        if (m.administeredBy && userMap.has(String(m.administeredBy))) {
            m.administeredBy = userMap.get(String(m.administeredBy));
        }
    }

    const ptObj = (admission.patientId && typeof admission.patientId === 'object') ? admission.patientId : {};
    const patientProfileAllergy = [ptObj.allergies, ptObj.fertilityProfile?.allergies].filter(Boolean).join(', ').trim();
    const clinicalNoteAllergy = (clinicalNote?.anyDrugAllergy || '').trim();
    const combinedSuggestions = [patientProfileAllergy, clinicalNoteAllergy]
        .filter(Boolean)
        .flatMap(str => String(str).split(/[,;\n]+/))
        .map(s => s.trim())
        .filter((s, idx, arr) => s && !/^none|nil|no known|nkda$/i.test(s) && arr.indexOf(s) === idx);

    return {
        drugChart: drugChart || {
            hospitalId,
            admissionId: admission._id,
            patientId: ptObj._id || admission.patientId,
            drugAllergies: { slot1: '', slot2: '', sheetNo: '1', history: [] },
            statDoses: [],
            ivFluids: []
        },
        existingAllergies: {
            patientProfileAllergy,
            clinicalNoteAllergy,
            combinedSuggestions
        },
        orders,
        marRecords,
        admission
    };
};

// GET /api/ipd-clinical/admissions/:admissionId/drug-chart
router.get('/admissions/:admissionId/drug-chart', verifyToken, resolveTenant, requireNurseOrDoctorAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const { admissionId } = req.params;
        if (!mongoose.Types.ObjectId.isValid(admissionId)) {
            return res.status(400).json({ success: false, message: 'Invalid admissionId format' });
        }

        const { Admission } = getModels(req);
        const admission = await Admission.findOne({ _id: admissionId, hospitalId }).lean();
        if (!admission) {
            return res.status(404).json({ success: false, message: 'Admission not found in this hospital' });
        }

        const bundle = await fetchDrugChartBundle(req, hospitalId, admission);
        res.json({ success: true, ...bundle });
    } catch (err) {
        console.error('Fetch drug chart error:', err);
        res.status(500).json({ success: false, message: 'Error fetching drug chart data' });
    }
});

// PUT /api/ipd-clinical/admissions/:admissionId/drug-chart — Inline Drug Chart Save (Allergies, STAT, IV & Regular Orders)
router.put('/admissions/:admissionId/drug-chart', verifyToken, resolveTenant, requireNurseOrDoctorAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const { admissionId } = req.params;
        const { drugAllergies, statDoses, ivFluids, deletedStatIds, deletedIvIds, newRegularOrders, discontinuedOrderIds } = req.body || {};

        if (!hospitalId) return res.status(403).json({ success: false, message: 'Hospital context required' });
        if (!mongoose.Types.ObjectId.isValid(admissionId)) {
            return res.status(400).json({ success: false, message: 'Invalid admissionId format' });
        }

        const { Admission, InpatientDrugChart, InpatientOrder } = getModels(req);
        const admission = await Admission.findOne({ _id: admissionId, hospitalId });
        if (!admission) {
            return res.status(404).json({ success: false, message: 'Admission not found in this hospital' });
        }

        const actorId = req.user._id || req.user.userId;
        const actorName = req.user.name || req.user.email || 'Clinical Staff';
        const actorRole = req.user._roleData?.name || req.user.role || 'Staff';

        const isNurseActor = ['nurse', 'staffnurse', 'headnurse'].includes(String(actorRole || '').toLowerCase());
        const isDoctorActor = isDoctorOrAdminRole(req) && !isNurseActor;

        let admDocRaw = admission.doctorName || '';
        let admDocId = admission.doctorId || admission.admittedBy || null;
        if (!admDocRaw && (admission.doctorId || admission.admittedBy)) {
            const { User } = getModels(req);
            const docObj = await findUserAcrossStores(User, admission.doctorId || admission.admittedBy, 'name');
            if (docObj?.name) admDocRaw = docObj.name;
        }
        const admDocName = admDocRaw ? (/^dr\.?\s*/i.test(admDocRaw) ? admDocRaw : `Dr. ${admDocRaw}`) : '';

        const sanitizePrescribingDoctor = (inputDocName) => {
            const raw = String(inputDocName || '').trim();
            if (!raw) return isDoctorActor ? (actorName ? `Dr. ${actorName.replace(/^dr\.?\s*/i, '')}` : '') : (admDocName || '');
            if (isNurseActor && raw.toLowerCase() === String(actorName || '').trim().toLowerCase()) {
                return admDocName || '';
            }
            if (/\(nurse\)/i.test(raw)) return admDocName || '';
            return /^dr\.?\s*/i.test(raw) ? raw : `Dr. ${raw}`;
        };

        let chartDoc = await InpatientDrugChart.findOne({ hospitalId, admissionId: admission._id });
        if (!chartDoc) {
            chartDoc = new InpatientDrugChart({
                hospitalId,
                admissionId: admission._id,
                patientId: admission.patientId,
                createdBy: actorId
            });
        }

        // Process explicit deletions of STAT rows if provided
        if (Array.isArray(deletedStatIds) && deletedStatIds.length > 0) {
            chartDoc.statDoses = chartDoc.statDoses.filter(s => !deletedStatIds.includes(String(s._id)));
        }

        // Process explicit deletions of IV fluid rows if provided
        if (Array.isArray(deletedIvIds) && deletedIvIds.length > 0) {
            chartDoc.ivFluids = chartDoc.ivFluids.filter(iv => !deletedIvIds.includes(String(iv._id)));
        }

        // 1. Update Allergies if provided
        if (drugAllergies) {
            chartDoc.drugAllergies = {
                ...chartDoc.drugAllergies,
                slot1: String(drugAllergies.slot1 || '').trim(),
                slot2: String(drugAllergies.slot2 || '').trim(),
                sheetNo: String(drugAllergies.sheetNo || '1').trim() || '1',
                updatedBy: actorId,
                updatedByName: actorName,
                updatedByRole: actorRole,
                updatedAt: new Date()
            };
        }

        // 2. Update/Add STAT doses if provided
        if (Array.isArray(statDoses)) {
            const validStats = statDoses.filter(s => s && s.drugName && String(s.drugName).trim());
            validStats.forEach(s => {
                if (s._id && mongoose.Types.ObjectId.isValid(s._id) && !String(s._id).startsWith('order-')) {
                    const existing = chartDoc.statDoses.id(s._id);
                    if (existing) {
                        existing.date = s.date || existing.date;
                        existing.time = s.time || existing.time;
                        existing.drugName = s.drugName || existing.drugName;
                        if (s.dose !== undefined) existing.dose = s.dose;
                        if (s.route) existing.route = s.route;
                        if (s.doctorName !== undefined) {
                            const cleanDoc = sanitizePrescribingDoctor(s.doctorName);
                            if (cleanDoc) existing.doctorName = cleanDoc;
                        }
                        if (s.status) existing.status = s.status;
                        if (s.givenByName !== undefined) existing.givenByName = s.givenByName;
                        if (s.checkedByName !== undefined) existing.checkedByName = s.checkedByName;
                        if (s.remarks !== undefined) existing.remarks = s.remarks;
                        existing.updatedBy = actorId;
                        existing.updatedByName = actorName;
                        existing.updatedByRole = actorRole;
                    }
                } else if (!s.fromOrderOnly) {
                    const cleanDoc = sanitizePrescribingDoctor(s.doctorName);
                    chartDoc.statDoses.push({
                        date: s.date || new Date().toISOString().split('T')[0],
                        time: s.time || '',
                        drugName: String(s.drugName).trim(),
                        dose: s.dose || '',
                        route: s.route || 'IV',
                        doctorName: cleanDoc,
                        doctorId: isDoctorActor ? actorId : (s.doctorId || admDocId),
                        status: s.status || 'PENDING',
                        givenByName: s.givenByName || (isNurseActor && s.status === 'ADMINISTERED' ? actorName : ''),
                        checkedByName: s.checkedByName || '',
                        remarks: s.remarks || '',
                        authorId: actorId,
                        authorName: actorName,
                        authorRole: actorRole
                    });
                }
            });
        }

        // 3. Update/Add IV fluids if provided
        if (Array.isArray(ivFluids)) {
            const validIvs = ivFluids.filter(iv => iv && iv.fluidName && String(iv.fluidName).trim());
            validIvs.forEach(iv => {
                if (iv._id && mongoose.Types.ObjectId.isValid(iv._id) && !String(iv._id).startsWith('ivorder-')) {
                    const existing = chartDoc.ivFluids.id(iv._id);
                    if (existing) {
                        existing.date = iv.date || existing.date;
                        existing.fluidName = iv.fluidName || existing.fluidName;
                        if (iv.volume !== undefined) existing.volume = iv.volume;
                        if (iv.timeStart) existing.timeStart = iv.timeStart;
                        if (iv.infusionTimeHrs !== undefined) existing.infusionTimeHrs = iv.infusionTimeHrs;
                        if (iv.doctorName !== undefined) {
                            const cleanDoc = sanitizePrescribingDoctor(iv.doctorName);
                            if (cleanDoc) existing.doctorName = cleanDoc;
                        }
                        if (iv.status) existing.status = iv.status;
                        if (iv.adminByName !== undefined) existing.adminByName = iv.adminByName;
                        if (iv.remarks !== undefined) existing.remarks = iv.remarks;
                        existing.updatedBy = actorId;
                        existing.updatedByName = actorName;
                        existing.updatedByRole = actorRole;
                    }
                } else if (!iv.fromOrderOnly) {
                    const cleanDoc = sanitizePrescribingDoctor(iv.doctorName);
                    chartDoc.ivFluids.push({
                        date: iv.date || new Date().toISOString().split('T')[0],
                        fluidName: String(iv.fluidName).trim(),
                        volume: iv.volume || '',
                        timeStart: iv.timeStart || '',
                        infusionTimeHrs: iv.infusionTimeHrs || '',
                        doctorName: cleanDoc,
                        doctorId: isDoctorActor ? actorId : (iv.doctorId || admDocId),
                        status: iv.status || 'PENDING',
                        adminByName: iv.adminByName || (isNurseActor && (iv.status === 'RUNNING' || iv.status === 'COMPLETED') ? actorName : ''),
                        remarks: iv.remarks || '',
                        authorId: actorId,
                        authorName: actorName,
                        authorRole: actorRole
                    });
                }
            });
        }

        chartDoc.updatedBy = actorId;
        await chartDoc.save();

        // 4. Create new regular medication orders prescribed directly on Page 2
        let createdOrdersCount = 0;
        if (Array.isArray(newRegularOrders) && newRegularOrders.length > 0 && isDoctorOrAdminRole(req)) {
            for (const no of newRegularOrders) {
                if (!no || !no.medicineName || !String(no.medicineName).trim()) continue;
                const doseRaw = String(no.dose || '').trim();
                const doseMatch = doseRaw.match(/^([\d.]+)\s*(.*)$/);
                const dosageValue = doseMatch ? Number(doseMatch[1]) : (no.dosageValue || 1);
                const dosageUnit = doseMatch && doseMatch[2] ? doseMatch[2].trim() : (no.dosageUnit || 'tab');

                // Determine effective doctorId (use admission attending doctor or actor if doctor)
                const docId = (admission.attendingDoctorId && mongoose.Types.ObjectId.isValid(admission.attendingDoctorId))
                    ? admission.attendingDoctorId
                    : (admission.primaryDoctorId || actorId);

                try {
                    const newOrd = new InpatientOrder({
                        hospitalId,
                        admissionId: admission._id,
                        patientId: admission.patientId?._id || admission.patientId,
                        doctorId: docId,
                        medicineName: String(no.medicineName).trim(),
                        dosageValue,
                        dosageUnit,
                        route: no.route ? String(no.route).trim() : 'Oral',
                        frequency: no.frequency ? String(no.frequency).trim() : 'TDS',
                        startDate: no.startDate ? new Date(no.startDate) : new Date(),
                        status: 'ACTIVE',
                        instructions: no.instructions ? String(no.instructions).trim() : '',
                        prescribedByName: sanitizePrescribingDoctor(no.doctorName),
                        createdBy: actorId
                    });
                    await newOrd.save();
                    createdOrdersCount++;
                } catch (ordErr) {
                    console.error('Error saving inline regular order:', ordErr);
                    return res.status(400).json({ success: false, message: `Failed to save regular order: ${ordErr.message}`, error: ordErr });
                }
            }
        }

        // 5. Discontinue / cancel regular medication orders if requested
        if (Array.isArray(discontinuedOrderIds) && discontinuedOrderIds.length > 0 && isDoctorOrAdminRole(req)) {
            const validIds = discontinuedOrderIds.filter(id => id && mongoose.Types.ObjectId.isValid(id));
            if (validIds.length > 0) {
                await InpatientOrder.updateMany(
                    { _id: { $in: validIds }, hospitalId },
                    { $set: { status: 'CANCELLED', updatedBy: actorId } }
                );
            }
        }

        await logClinicalAudit({
            hospitalId,
            user: req.user,
            action: 'DRUG_CHART_INLINE_UPDATED',
            targetModel: 'InpatientDrugChart',
            targetId: chartDoc._id,
            targetLabel: `Inline updated Drug Chart for admission ${admission._id}${createdOrdersCount ? ` (+${createdOrdersCount} new regular orders)` : ''}`,
            req
        });

        res.json({ success: true, message: 'Drug chart updated successfully', drugChart: chartDoc });
    } catch (err) {
        console.error('Inline update drug chart error:', err);
        res.status(500).json({ success: false, message: 'Error updating drug chart data' });
    }
});

// DELETE /api/ipd-clinical/admissions/:admissionId/drug-chart/stat-doses/:entryId
router.delete('/admissions/:admissionId/drug-chart/stat-doses/:entryId', verifyToken, resolveTenant, requireDoctorAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const { admissionId, entryId } = req.params;
        if (!hospitalId) return res.status(403).json({ success: false, message: 'Hospital context required' });
        if (!mongoose.Types.ObjectId.isValid(admissionId) || !mongoose.Types.ObjectId.isValid(entryId)) {
            return res.status(400).json({ success: false, message: 'Invalid ID format' });
        }
        const { InpatientDrugChart } = getModels(req);
        const chartDoc = await InpatientDrugChart.findOne({ hospitalId, admissionId });
        if (!chartDoc) return res.status(404).json({ success: false, message: 'Drug chart not found' });
        chartDoc.statDoses = chartDoc.statDoses.filter(s => String(s._id) !== String(entryId));
        chartDoc.updatedBy = req.user._id || req.user.userId;
        await chartDoc.save();
        res.json({ success: true, message: 'STAT dose removed successfully', drugChart: chartDoc });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Error deleting STAT dose' });
    }
});

// DELETE /api/ipd-clinical/admissions/:admissionId/drug-chart/iv-fluids/:entryId
router.delete('/admissions/:admissionId/drug-chart/iv-fluids/:entryId', verifyToken, resolveTenant, requireNurseOrDoctorAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const { admissionId, entryId } = req.params;
        if (!hospitalId) return res.status(403).json({ success: false, message: 'Hospital context required' });
        if (!mongoose.Types.ObjectId.isValid(admissionId) || !mongoose.Types.ObjectId.isValid(entryId)) {
            return res.status(400).json({ success: false, message: 'Invalid ID format' });
        }
        const { InpatientDrugChart } = getModels(req);
        const chartDoc = await InpatientDrugChart.findOne({ hospitalId, admissionId });
        if (!chartDoc) return res.status(404).json({ success: false, message: 'Drug chart not found' });
        chartDoc.ivFluids = chartDoc.ivFluids.filter(iv => String(iv._id) !== String(entryId));
        chartDoc.updatedBy = req.user._id || req.user.userId;
        await chartDoc.save();
        res.json({ success: true, message: 'IV fluid removed successfully', drugChart: chartDoc });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Error deleting IV fluid' });
    }
});

// PUT /api/ipd-clinical/admissions/:admissionId/drug-chart/allergies
router.put('/admissions/:admissionId/drug-chart/allergies', verifyToken, resolveTenant, requireNurseOrDoctorAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const { admissionId } = req.params;
        const { slot1 = '', slot2 = '', sheetNo = '1' } = req.body || {};

        if (!hospitalId) return res.status(403).json({ success: false, message: 'Hospital context required' });
        if (!mongoose.Types.ObjectId.isValid(admissionId)) {
            return res.status(400).json({ success: false, message: 'Invalid admissionId format' });
        }

        const { Admission, InpatientDrugChart } = getModels(req);
        const admission = await Admission.findOne({ _id: admissionId, hospitalId });
        if (!admission) {
            return res.status(404).json({ success: false, message: 'Admission not found in this hospital' });
        }

        const actorId = req.user._id || req.user.userId;
        const actorName = req.user.name || req.user.email || 'Clinical Staff';
        const actorRole = req.user._roleData?.name || req.user.role || 'Staff';

        let chartDoc = await InpatientDrugChart.findOne({ hospitalId, admissionId: admission._id });
        if (!chartDoc) {
            chartDoc = new InpatientDrugChart({
                hospitalId,
                admissionId: admission._id,
                patientId: admission.patientId,
                createdBy: actorId
            });
        }

        const prevAllergy = chartDoc.drugAllergies || {};
        const prevHist = Array.isArray(prevAllergy.history) ? prevAllergy.history : [];
        if (prevAllergy.slot1 || prevAllergy.slot2 || prevAllergy.updatedAt) {
            prevHist.push({
                slot1: prevAllergy.slot1 || '',
                slot2: prevAllergy.slot2 || '',
                sheetNo: prevAllergy.sheetNo || '1',
                editedBy: prevAllergy.updatedBy || actorId,
                editedByName: prevAllergy.updatedByName || actorName,
                editedByRole: prevAllergy.updatedByRole || actorRole,
                editedAt: prevAllergy.updatedAt || new Date()
            });
        }

        chartDoc.drugAllergies = {
            slot1: String(slot1 || '').trim(),
            slot2: String(slot2 || '').trim(),
            sheetNo: String(sheetNo || '1').trim() || '1',
            updatedBy: actorId,
            updatedByName: actorName,
            updatedByRole: actorRole,
            updatedAt: new Date(),
            history: prevHist.slice(-30)
        };
        chartDoc.updatedBy = actorId;
        await chartDoc.save();

        await logClinicalAudit({
            hospitalId,
            user: req.user,
            action: 'DRUG_CHART_ALLERGY_UPDATED',
            targetModel: 'InpatientDrugChart',
            targetId: chartDoc._id,
            targetLabel: `Updated Drug Allergy for admission ${admission._id}`,
            req
        });

        res.json({ success: true, message: 'Drug allergy details saved', drugChart: chartDoc });
    } catch (err) {
        console.error('Update drug chart allergies error:', err);
        res.status(500).json({ success: false, message: 'Error updating drug allergy details' });
    }
});

// POST /api/ipd-clinical/admissions/:admissionId/drug-chart/stat-doses — Doctor/Admin prescribes a STAT order
// Safety rule: never auto-mark as Given upon prescription!
router.post('/admissions/:admissionId/drug-chart/stat-doses', verifyToken, resolveTenant, requireDoctorAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const { admissionId } = req.params;
        const { date, time, drugName, dose, route, doctorName, remarks, orderId } = req.body || {};

        if (!hospitalId) return res.status(403).json({ success: false, message: 'Hospital context required' });
        if (!mongoose.Types.ObjectId.isValid(admissionId)) {
            return res.status(400).json({ success: false, message: 'Invalid admissionId format' });
        }
        if (!drugName || !String(drugName).trim()) {
            return res.status(400).json({ success: false, message: 'Prescribed drug name is required for STAT order' });
        }

        const { Admission, InpatientDrugChart } = getModels(req);
        const admission = await Admission.findOne({ _id: admissionId, hospitalId });
        if (!admission) {
            return res.status(404).json({ success: false, message: 'Admission not found in this hospital' });
        }

        const actorId = req.user._id || req.user.userId;
        const actorName = req.user.name || req.user.email || 'Doctor';
        const actorRole = req.user._roleData?.name || req.user.role || 'Doctor';

        let chartDoc = await InpatientDrugChart.findOne({ hospitalId, admissionId: admission._id });
        if (!chartDoc) {
            chartDoc = new InpatientDrugChart({
                hospitalId,
                admissionId: admission._id,
                patientId: admission.patientId,
                createdBy: actorId
            });
        }

        const todayStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const nowTimeStr = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

        const isNurseActor = ['nurse', 'staffnurse', 'headnurse'].includes(String(actorRole || '').toLowerCase());
        const isDoctorActor = isDoctorOrAdminRole(req) && !isNurseActor;
        const admDocRaw = admission.doctorName || '';
        const admDocName = admDocRaw ? (/^dr\.?\s*/i.test(admDocRaw) ? admDocRaw : `Dr. ${admDocRaw}`) : '';
        const cleanDocName = doctorName
            ? (/^dr\.?\s*/i.test(doctorName) ? doctorName : `Dr. ${doctorName}`)
            : (isDoctorActor ? `Dr. ${actorName.replace(/^dr\.?\s*/i, '')}` : (admDocName || ''));

        chartDoc.statDoses.push({
            orderId: orderId && mongoose.Types.ObjectId.isValid(orderId) ? orderId : null,
            date: date ? String(date).trim() : todayStr,
            time: time ? String(time).trim() : nowTimeStr,
            drugName: String(drugName).trim(),
            dose: dose ? String(dose).trim() : '',
            route: route ? String(route).trim() : 'IV',
            doctorId: isDoctorActor ? actorId : (admission.doctorId || admission.admittedBy || null),
            doctorName: cleanDocName,
            // Strictly initialized as PENDING with empty administration fields
            status: 'PENDING',
            givenById: null,
            givenByName: '',
            givenAt: null,
            checkedById: null,
            checkedByName: '',
            checkedAt: null,
            remarks: remarks ? String(remarks).trim() : '',
            authorId: actorId,
            authorName: actorName,
            authorRole: actorRole,
            updatedBy: actorId,
            updatedByName: actorName,
            updatedByRole: actorRole,
            editHistory: []
        });

        chartDoc.updatedBy = actorId;
        await chartDoc.save();
        const savedEntry = chartDoc.statDoses[chartDoc.statDoses.length - 1];

        await logClinicalAudit({
            hospitalId,
            user: req.user,
            action: 'DRUG_CHART_STAT_PRESCRIBED',
            targetModel: 'InpatientDrugChart',
            targetId: chartDoc._id,
            targetLabel: `STAT Order prescribed: ${savedEntry.drugName}`,
            req
        });

        const io = req.app.get('io');
        if (io) {
            io.to(`hospital_${hospitalId}`).emit('ipd_drug_chart_updated', {
                admissionId: admission._id,
                section: 'STAT_DOSE',
                timestamp: new Date()
            });
        }

        res.status(201).json({ success: true, message: 'STAT medication order recorded (Pending Nursing Administration)', entry: savedEntry, drugChart: chartDoc });
    } catch (err) {
        console.error('Add STAT dose error:', err);
        res.status(500).json({ success: false, message: 'Error adding STAT medication order' });
    }
});

// PATCH /api/ipd-clinical/admissions/:admissionId/drug-chart/stat-doses/:entryId
router.patch('/admissions/:admissionId/drug-chart/stat-doses/:entryId', verifyToken, resolveTenant, requireNurseOrDoctorAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const { admissionId, entryId } = req.params;
        const body = req.body || {};

        if (!hospitalId) return res.status(403).json({ success: false, message: 'Hospital context required' });
        if (!mongoose.Types.ObjectId.isValid(admissionId) || !mongoose.Types.ObjectId.isValid(entryId)) {
            return res.status(400).json({ success: false, message: 'Invalid ID format' });
        }

        const { InpatientDrugChart } = getModels(req);
        const chartDoc = await InpatientDrugChart.findOne({ hospitalId, admissionId });
        if (!chartDoc) return res.status(404).json({ success: false, message: 'Drug chart not found in this hospital' });

        const entry = chartDoc.statDoses.id(entryId);
        if (!entry) return res.status(404).json({ success: false, message: 'STAT dose entry not found' });

        // Role separation: prescription edits require Doctor/Admin; administering requires Nursing/Admin
        const prescriptionChanged = ['drugName', 'dose', 'route', 'doctorName'].some(
            k => body[k] !== undefined && String(body[k]).trim() !== String(entry[k] || '').trim()
        );
        if (prescriptionChanged && !isDoctorOrAdminRole(req)) {
            return res.status(403).json({ success: false, message: 'Only Doctors or Admins can modify prescribed drug/dose/route' });
        }

        const adminFieldsTouched = body.status !== undefined || body.givenByName !== undefined || body.confirmAdministration === true;
        if (adminFieldsTouched && !isNursingAdministerRole(req)) {
            return res.status(403).json({ success: false, message: 'Only authorized nursing staff can confirm STAT dose administration' });
        }

        const completedStat = ['ADMINISTERED', 'HELD', 'REFUSED', 'NOT_GIVEN'].includes(entry.status);
        if (completedStat && (!body.isCorrection || !body.editReason || !String(body.editReason).trim())) {
            return res.status(400).json({
                success: false,
                message: 'Completed STAT administration cannot be silently overwritten. Provide isCorrection=true and an editReason.'
            });
        }

        const actorId = req.user._id || req.user.userId;
        const actorName = req.user.name || req.user.email || 'Clinical Staff';
        const actorRole = req.user._roleData?.name || req.user.role || 'Staff';

        entry.editHistory = [
            ...(Array.isArray(entry.editHistory) ? entry.editHistory : []),
            {
                action: body.confirmAdministration ? 'ADMINISTERED' : (body.isCorrection ? 'CORRECTED' : 'UPDATED'),
                editReason: body.editReason ? String(body.editReason).trim() : (body.confirmAdministration ? 'Nursing administration confirmation' : 'STAT entry update'),
                previousSnapshot: {
                    date: entry.date,
                    time: entry.time,
                    drugName: entry.drugName,
                    dose: entry.dose,
                    route: entry.route,
                    doctorName: entry.doctorName,
                    status: entry.status,
                    givenByName: entry.givenByName,
                    checkedByName: entry.checkedByName,
                    remarks: entry.remarks
                },
                editedBy: actorId,
                editedByName: actorName,
                editedByRole: actorRole,
                editedAt: new Date()
            }
        ].slice(-30);

        if (body.date !== undefined) entry.date = String(body.date).trim();
        if (body.time !== undefined) entry.time = String(body.time).trim();
        if (body.drugName !== undefined) entry.drugName = String(body.drugName).trim();
        if (body.dose !== undefined) entry.dose = String(body.dose).trim();
        if (body.route !== undefined) entry.route = String(body.route).trim();
        if (body.doctorName !== undefined) entry.doctorName = String(body.doctorName).trim();
        if (body.remarks !== undefined) entry.remarks = String(body.remarks).trim();

        if (body.checkedByName !== undefined) {
            entry.checkedByName = String(body.checkedByName).trim();
            entry.checkedById = actorId;
            entry.checkedAt = new Date();
        }

        if (body.status !== undefined) {
            const normStatus = normalizeMarStatusInput(body.status);
            if (!['PENDING', 'SCHEDULED', 'ADMINISTERED', 'HELD', 'REFUSED', 'NOT_GIVEN', 'MISSED'].includes(normStatus)) {
                return res.status(400).json({ success: false, message: 'Invalid STAT administration status' });
            }
            const mappedStatus = normStatus === 'SCHEDULED' ? 'PENDING' : (normStatus === 'MISSED' ? 'NOT_GIVEN' : normStatus);
            if (['HELD', 'REFUSED', 'NOT_GIVEN'].includes(mappedStatus) && !String(body.remarks || entry.remarks || body.editReason || '').trim()) {
                return res.status(400).json({ success: false, message: `Remarks/reason required when marking STAT dose as ${mappedStatus}` });
            }
            entry.status = mappedStatus;
            if (mappedStatus === 'ADMINISTERED') {
                entry.givenById = actorId;
                entry.givenByName = body.givenByName ? String(body.givenByName).trim() : actorName;
                entry.givenAt = body.givenAt ? new Date(body.givenAt) : new Date();
            } else if (body.givenByName !== undefined) {
                entry.givenByName = String(body.givenByName).trim();
                entry.givenById = actorId;
            }
        } else if (body.givenByName !== undefined) {
            entry.givenByName = String(body.givenByName).trim();
            entry.givenById = actorId;
            if (entry.givenByName && entry.status === 'PENDING') {
                entry.status = 'ADMINISTERED';
                entry.givenAt = new Date();
            }
        }

        entry.updatedBy = actorId;
        entry.updatedByName = actorName;
        entry.updatedByRole = actorRole;
        chartDoc.updatedBy = actorId;

        await chartDoc.save();

        await logClinicalAudit({
            hospitalId,
            user: req.user,
            action: 'DRUG_CHART_STAT_UPDATED',
            targetModel: 'InpatientDrugChart',
            targetId: chartDoc._id,
            targetLabel: `STAT dose updated (${entry.drugName}: ${entry.status})`,
            req
        });

        res.json({ success: true, message: 'STAT dose updated', entry, drugChart: chartDoc });
    } catch (err) {
        console.error('Update STAT dose error:', err);
        res.status(500).json({ success: false, message: 'Error updating STAT dose entry' });
    }
});

// POST /api/ipd-clinical/admissions/:admissionId/drug-chart/iv-fluids
router.post('/admissions/:admissionId/drug-chart/iv-fluids', verifyToken, resolveTenant, requireNurseOrDoctorAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const { admissionId } = req.params;
        const { date, fluidName, volume, timeStart, infusionTimeHrs, doctorName, adminByName, remarks, status } = req.body || {};

        if (!hospitalId) return res.status(403).json({ success: false, message: 'Hospital context required' });
        if (!mongoose.Types.ObjectId.isValid(admissionId)) {
            return res.status(400).json({ success: false, message: 'Invalid admissionId format' });
        }
        if (!fluidName || !String(fluidName).trim()) {
            return res.status(400).json({ success: false, message: 'IV Fluid name is required' });
        }

        const canAdminister = isNursingAdministerRole(req);
        if ((adminByName && String(adminByName).trim() && !canAdminister) || (status && ['RUNNING', 'COMPLETED'].includes(String(status).toUpperCase()) && !canAdminister)) {
            return res.status(403).json({ success: false, message: 'Only authorized nursing staff can confirm IV fluid administration' });
        }

        const { Admission, InpatientDrugChart } = getModels(req);
        const admission = await Admission.findOne({ _id: admissionId, hospitalId });
        if (!admission) {
            return res.status(404).json({ success: false, message: 'Admission not found in this hospital' });
        }

        const actorId = req.user._id || req.user.userId;
        const actorName = req.user.name || req.user.email || 'Clinical Staff';
        const actorRole = req.user._roleData?.name || req.user.role || 'Staff';

        let chartDoc = await InpatientDrugChart.findOne({ hospitalId, admissionId: admission._id });
        if (!chartDoc) {
            chartDoc = new InpatientDrugChart({
                hospitalId,
                admissionId: admission._id,
                patientId: admission.patientId,
                createdBy: actorId
            });
        }

        const todayStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const cleanAdminBy = canAdminister && adminByName ? String(adminByName).trim() : '';
        const resolvedStatus = canAdminister && status
            ? String(status).trim().toUpperCase()
            : (cleanAdminBy ? 'RUNNING' : 'PENDING');

        const isNurseActor = ['nurse', 'staffnurse', 'headnurse'].includes(String(actorRole || '').toLowerCase());
        const isDoctorActor = isDoctorOrAdminRole(req) && !isNurseActor;
        const admDocRaw = admission.doctorName || '';
        const admDocName = admDocRaw ? (/^dr\.?\s*/i.test(admDocRaw) ? admDocRaw : `Dr. ${admDocRaw}`) : '';
        const cleanDocName = doctorName
            ? (/^dr\.?\s*/i.test(doctorName) ? doctorName : `Dr. ${doctorName}`)
            : (isDoctorActor ? `Dr. ${actorName.replace(/^dr\.?\s*/i, '')}` : (admDocName || ''));

        chartDoc.ivFluids.push({
            date: date ? String(date).trim() : todayStr,
            fluidName: String(fluidName).trim(),
            volume: volume ? String(volume).trim() : '',
            timeStart: timeStart ? String(timeStart).trim() : '',
            infusionTimeHrs: infusionTimeHrs ? String(infusionTimeHrs).trim() : '',
            doctorId: isDoctorActor ? actorId : (admission.doctorId || admission.admittedBy || null),
            doctorName: cleanDocName,
            status: ['PENDING', 'RUNNING', 'COMPLETED', 'HELD', 'NOT_GIVEN'].includes(resolvedStatus) ? resolvedStatus : 'PENDING',
            adminById: cleanAdminBy ? actorId : null,
            adminByName: cleanAdminBy,
            administeredAt: cleanAdminBy ? new Date() : null,
            remarks: remarks ? String(remarks).trim() : '',
            authorId: actorId,
            authorName: actorName,
            authorRole: actorRole,
            updatedBy: actorId,
            updatedByName: actorName,
            updatedByRole: actorRole,
            editHistory: []
        });

        chartDoc.updatedBy = actorId;
        await chartDoc.save();
        const savedEntry = chartDoc.ivFluids[chartDoc.ivFluids.length - 1];

        await logClinicalAudit({
            hospitalId,
            user: req.user,
            action: 'DRUG_CHART_IV_FLUID_ADDED',
            targetModel: 'InpatientDrugChart',
            targetId: chartDoc._id,
            targetLabel: `IV Fluid recorded: ${savedEntry.fluidName}`,
            req
        });

        res.status(201).json({ success: true, message: 'IV fluid entry saved', entry: savedEntry, drugChart: chartDoc });
    } catch (err) {
        console.error('Add IV fluid error:', err);
        res.status(500).json({ success: false, message: 'Error saving IV fluid entry' });
    }
});

// PATCH /api/ipd-clinical/admissions/:admissionId/drug-chart/iv-fluids/:entryId
router.patch('/admissions/:admissionId/drug-chart/iv-fluids/:entryId', verifyToken, resolveTenant, requireNurseOrDoctorAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const { admissionId, entryId } = req.params;
        const body = req.body || {};

        if (!hospitalId) return res.status(403).json({ success: false, message: 'Hospital context required' });
        if (!mongoose.Types.ObjectId.isValid(admissionId) || !mongoose.Types.ObjectId.isValid(entryId)) {
            return res.status(400).json({ success: false, message: 'Invalid ID format' });
        }

        const { InpatientDrugChart } = getModels(req);
        const chartDoc = await InpatientDrugChart.findOne({ hospitalId, admissionId });
        if (!chartDoc) return res.status(404).json({ success: false, message: 'Drug chart not found in this hospital' });

        const entry = chartDoc.ivFluids.id(entryId);
        if (!entry) return res.status(404).json({ success: false, message: 'IV fluid entry not found' });

        const adminTouched = body.adminByName !== undefined || (body.status !== undefined && ['RUNNING', 'COMPLETED', 'HELD', 'NOT_GIVEN'].includes(String(body.status).toUpperCase()));
        if (adminTouched && !isNursingAdministerRole(req)) {
            return res.status(403).json({ success: false, message: 'Only authorized nursing staff can confirm IV fluid administration' });
        }

        const finalizedIv = ['COMPLETED', 'HELD', 'NOT_GIVEN'].includes(entry.status);
        if (finalizedIv && (!body.isCorrection || !body.editReason || !String(body.editReason).trim())) {
            return res.status(400).json({
                success: false,
                message: 'Finalized IV fluid administration cannot be silently overwritten. Provide isCorrection=true and an editReason.'
            });
        }

        const actorId = req.user._id || req.user.userId;
        const actorName = req.user.name || req.user.email || 'Clinical Staff';
        const actorRole = req.user._roleData?.name || req.user.role || 'Staff';

        entry.editHistory = [
            ...(Array.isArray(entry.editHistory) ? entry.editHistory : []),
            {
                action: body.isCorrection ? 'CORRECTED' : 'UPDATED',
                editReason: body.editReason ? String(body.editReason).trim() : 'IV fluid record update',
                previousSnapshot: {
                    date: entry.date,
                    fluidName: entry.fluidName,
                    volume: entry.volume,
                    timeStart: entry.timeStart,
                    infusionTimeHrs: entry.infusionTimeHrs,
                    doctorName: entry.doctorName,
                    status: entry.status,
                    adminByName: entry.adminByName,
                    remarks: entry.remarks
                },
                editedBy: actorId,
                editedByName: actorName,
                editedByRole: actorRole,
                editedAt: new Date()
            }
        ].slice(-30);

        ['date', 'fluidName', 'volume', 'timeStart', 'infusionTimeHrs', 'doctorName', 'remarks'].forEach(k => {
            if (body[k] !== undefined) entry[k] = String(body[k]).trim();
        });

        if (body.adminByName !== undefined) {
            entry.adminByName = String(body.adminByName).trim();
            entry.adminById = entry.adminByName ? actorId : null;
            if (entry.adminByName && !entry.administeredAt) entry.administeredAt = new Date();
        }
        if (body.status !== undefined) {
            const st = String(body.status).trim().toUpperCase();
            if (['PENDING', 'RUNNING', 'COMPLETED', 'HELD', 'NOT_GIVEN'].includes(st)) {
                entry.status = st;
                if (['RUNNING', 'COMPLETED'].includes(st)) {
                    entry.adminById = actorId;
                    if (!entry.adminByName) entry.adminByName = actorName;
                    entry.administeredAt = new Date();
                }
            }
        }

        entry.updatedBy = actorId;
        entry.updatedByName = actorName;
        entry.updatedByRole = actorRole;
        chartDoc.updatedBy = actorId;

        await chartDoc.save();

        await logClinicalAudit({
            hospitalId,
            user: req.user,
            action: 'DRUG_CHART_IV_FLUID_UPDATED',
            targetModel: 'InpatientDrugChart',
            targetId: chartDoc._id,
            targetLabel: `IV Fluid updated (${entry.fluidName})`,
            req
        });

        res.json({ success: true, message: 'IV fluid entry updated', entry, drugChart: chartDoc });
    } catch (err) {
        console.error('Update IV fluid error:', err);
        res.status(500).json({ success: false, message: 'Error updating IV fluid entry' });
    }
});

// POST /api/ipd-clinical/admissions/:admissionId/drug-chart/mar-administer
// Interactive Medication Administration Grid cell action (Page 2 of Drug Chart)
// Strictly nursing-only, duplicate-protected, separates prescribed vs actual dose, and never auto-marks Given.
router.post('/admissions/:admissionId/drug-chart/mar-administer', verifyToken, resolveTenant, requireNursingAdministerAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const { admissionId } = req.params;
        const {
            orderId,
            scheduledDateKey,
            scheduledSlot,
            scheduledTime,
            administeredTime,
            status,
            actualDoseValue,
            actualDoseUnit,
            actualDose,
            route,
            notes,
            reason
        } = req.body || {};

        if (!hospitalId) return res.status(403).json({ success: false, message: 'Hospital context required' });
        if (!mongoose.Types.ObjectId.isValid(admissionId) || !mongoose.Types.ObjectId.isValid(orderId)) {
            return res.status(400).json({ success: false, message: 'Valid admissionId and orderId are required' });
        }
        if (!scheduledDateKey || !scheduledSlot) {
            return res.status(400).json({ success: false, message: 'scheduledDateKey and scheduledSlot are required' });
        }

        const normStatus = normalizeMarStatusInput(status);
        const allowedStatuses = ['ADMINISTERED', 'SCHEDULED', 'DUE', 'HELD', 'REFUSED', 'MISSED', 'NOT_GIVEN'];
        if (!allowedStatuses.includes(normStatus)) {
            return res.status(400).json({ success: false, message: `Invalid administration status: ${status}` });
        }
        if (['HELD', 'REFUSED', 'MISSED', 'NOT_GIVEN'].includes(normStatus) && (!reason || !String(reason).trim())) {
            return res.status(400).json({ success: false, message: `A reason is required when marking medication as ${normStatus}` });
        }

        const { Admission, InpatientOrder, MARRecord } = getModels(req);
        const [admission, order] = await Promise.all([
            Admission.findOne({ _id: admissionId, hospitalId }).lean(),
            InpatientOrder.findOne({ _id: orderId, admissionId, hospitalId }).lean()
        ]);

        if (!admission) return res.status(404).json({ success: false, message: 'Admission not found in this hospital' });
        if (!order) return res.status(404).json({ success: false, message: 'Prescribed medication order not found for this admission' });

        if (normStatus === 'ADMINISTERED' && ['CANCELLED', 'ON_HOLD'].includes(order.status)) {
            return res.status(400).json({
                success: false,
                message: `Cannot confirm administration because medication order is currently ${order.status}`
            });
        }

        const cleanDateKey = String(scheduledDateKey).trim();
        const cleanSlot = String(scheduledSlot).trim();

        // Build scheduled Date timestamp from dateKey + slot if scheduledTime omitted
        let schedDt = scheduledTime ? new Date(scheduledTime) : null;
        if (!schedDt || isNaN(schedDt.getTime())) {
            const slotMatch = cleanSlot.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i);
            let hh = 10;
            let mm = 0;
            if (slotMatch) {
                hh = parseInt(slotMatch[1], 10);
                mm = slotMatch[2] ? parseInt(slotMatch[2], 10) : 0;
                if (slotMatch[3].toUpperCase() === 'PM' && hh < 12) hh += 12;
                if (slotMatch[3].toUpperCase() === 'AM' && hh === 12) hh = 0;
            }
            schedDt = new Date(`${cleanDateKey}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00`);
            if (isNaN(schedDt.getTime())) schedDt = new Date();
        }

        // Duplicate prevention check: match exact slot OR close scheduled window on same date
        const existingSlotRecord = await MARRecord.findOne({
            hospitalId,
            admissionId: admission._id,
            orderId: order._id,
            $or: [
                { scheduledDateKey: cleanDateKey, scheduledSlot: cleanSlot },
                {
                    scheduledTime: {
                        $gte: new Date(schedDt.getTime() - 40 * 60 * 1000),
                        $lte: new Date(schedDt.getTime() + 40 * 60 * 1000)
                    }
                }
            ]
        });

        const completedStatuses = ['ADMINISTERED', 'HELD', 'REFUSED', 'MISSED', 'NOT_GIVEN'];
        if (existingSlotRecord && completedStatuses.includes(existingSlotRecord.status)) {
            return res.status(409).json({
                success: false,
                message: 'A completed administration record already exists for this order and time slot. Use Authorized Correction to update it.',
                existingMarId: existingSlotRecord._id
            });
        }

        const actorId = req.user._id || req.user.userId;
        const actorName = req.user.name || req.user.email || 'Nurse';
        const actorRole = req.user._roleData?.name || req.user.role || 'Nurse';

        const parsedAdminDt = administeredTime ? new Date(administeredTime) : (normStatus === 'ADMINISTERED' ? new Date() : null);
        const resolvedActualDoseStr = actualDose !== undefined
            ? String(actualDose).trim()
            : (actualDoseValue !== undefined && actualDoseValue !== ''
                ? `${actualDoseValue} ${actualDoseUnit || order.dosageUnit || ''}`.trim()
                : '');

        let marDoc = existingSlotRecord;
        if (!marDoc) {
            marDoc = new MARRecord({
                hospitalId,
                orderId: order._id,
                admissionId: admission._id,
                patientId: order.patientId,
                scheduledTime: schedDt,
                createdBy: actorId,
                createdByName: actorName,
                createdByRole: actorRole
            });
        }

        marDoc.scheduledDateKey = cleanDateKey;
        marDoc.scheduledSlot = cleanSlot;
        marDoc.status = normStatus;
        marDoc.route = route ? String(route).trim() : (marDoc.route || order.route || '');
        marDoc.administeredBy = completedStatuses.includes(normStatus) ? actorId : marDoc.administeredBy;
        marDoc.administeredByName = completedStatuses.includes(normStatus) ? actorName : marDoc.administeredByName;
        marDoc.administeredTime = (parsedAdminDt && !isNaN(parsedAdminDt.getTime())) ? parsedAdminDt : marDoc.administeredTime;
        if (actualDoseValue !== undefined && actualDoseValue !== '') {
            marDoc.actualDoseValue = Number(actualDoseValue);
        }
        if (actualDoseUnit !== undefined) marDoc.actualDoseUnit = String(actualDoseUnit).trim();
        if (resolvedActualDoseStr) marDoc.actualDose = resolvedActualDoseStr;
        if (notes !== undefined) marDoc.notes = String(notes).trim();
        if (reason !== undefined) marDoc.reason = String(reason).trim();
        marDoc.updatedBy = actorId;
        marDoc.updatedByName = actorName;
        marDoc.updatedByRole = actorRole;

        await marDoc.save();

        await logClinicalAudit({
            hospitalId,
            user: req.user,
            action: `MAR_${normStatus}`,
            targetModel: 'MARRecord',
            targetId: marDoc._id,
            targetLabel: `${order.medicineName} [${cleanDateKey} ${cleanSlot}] marked ${normStatus}`,
            req
        });

        const io = req.app.get('io');
        if (io) {
            io.to(`hospital_${hospitalId}`).emit('mar_administered', {
                marId: marDoc._id,
                admissionId: admission._id,
                status: marDoc.status,
                timestamp: new Date()
            });
            io.to(`hospital_${hospitalId}`).emit('ipd_drug_chart_updated', {
                admissionId: admission._id,
                marId: marDoc._id,
                timestamp: new Date()
            });
        }

        res.status(existingSlotRecord ? 200 : 201).json({
            success: true,
            message: `Medication slot recorded as ${normStatus}`,
            mar: marDoc
        });
    } catch (err) {
        console.error('Drug Chart MAR administer error:', err);
        res.status(500).json({ success: false, message: 'Error recording medication administration' });
    }
});

// PATCH /api/ipd-clinical/admissions/:admissionId/drug-chart/mar/:marId/correct
// Authorized Correction Workflow for completed Medication Administration Grid entries
router.patch('/admissions/:admissionId/drug-chart/mar/:marId/correct', verifyToken, resolveTenant, requireNursingAdministerAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const { admissionId, marId } = req.params;
        const {
            status,
            administeredTime,
            actualDoseValue,
            actualDoseUnit,
            actualDose,
            route,
            notes,
            reason,
            correctionReason
        } = req.body || {};

        if (!hospitalId) return res.status(403).json({ success: false, message: 'Hospital context required' });
        if (!mongoose.Types.ObjectId.isValid(admissionId) || !mongoose.Types.ObjectId.isValid(marId)) {
            return res.status(400).json({ success: false, message: 'Invalid ID format' });
        }
        if (!correctionReason || !String(correctionReason).trim()) {
            return res.status(400).json({ success: false, message: 'A correctionReason is mandatory for auditing medication administration corrections' });
        }

        const { MARRecord } = getModels(req);
        const mar = await MARRecord.findOne({ _id: marId, admissionId, hospitalId });
        if (!mar) {
            return res.status(404).json({ success: false, message: 'MAR record not found in this hospital' });
        }

        const normStatus = status ? normalizeMarStatusInput(status) : mar.status;
        if (['HELD', 'REFUSED', 'MISSED', 'NOT_GIVEN'].includes(normStatus) && !String(reason !== undefined ? reason : mar.reason || '').trim()) {
            return res.status(400).json({ success: false, message: `An omission/refusal reason is required for status ${normStatus}` });
        }

        const actorId = req.user._id || req.user.userId;
        const actorName = req.user.name || req.user.email || 'Nurse';
        const actorRole = req.user._roleData?.name || req.user.role || 'Nurse';

        mar.editHistory = [
            ...(Array.isArray(mar.editHistory) ? mar.editHistory : []),
            {
                previousStatus: mar.status,
                previousAdministeredTime: mar.administeredTime || null,
                previousAdministeredBy: mar.administeredBy || null,
                previousAdministeredByName: mar.administeredByName || '',
                previousActualDoseValue: mar.actualDoseValue,
                previousActualDoseUnit: mar.actualDoseUnit || '',
                previousActualDose: mar.actualDose || '',
                previousRoute: mar.route || '',
                previousNotes: mar.notes || '',
                previousReason: mar.reason || '',
                correctionReason: String(correctionReason).trim(),
                editedBy: actorId,
                editedByName: actorName,
                editedByRole: actorRole,
                editedAt: new Date()
            }
        ].slice(-50);

        mar.status = normStatus;
        if (administeredTime) {
            const parsedDt = new Date(administeredTime);
            if (!isNaN(parsedDt.getTime())) mar.administeredTime = parsedDt;
        }
        if (actualDoseValue !== undefined && actualDoseValue !== '') {
            mar.actualDoseValue = Number(actualDoseValue);
        }
        if (actualDoseUnit !== undefined) mar.actualDoseUnit = String(actualDoseUnit).trim();
        if (actualDose !== undefined) {
            mar.actualDose = String(actualDose).trim();
        } else if (actualDoseValue !== undefined && actualDoseValue !== '') {
            mar.actualDose = `${actualDoseValue} ${actualDoseUnit || mar.actualDoseUnit || ''}`.trim();
        }
        if (route !== undefined) mar.route = String(route).trim();
        if (notes !== undefined) mar.notes = String(notes).trim();
        if (reason !== undefined) mar.reason = String(reason).trim();

        mar.updatedBy = actorId;
        mar.updatedByName = actorName;
        mar.updatedByRole = actorRole;

        await mar.save();

        await logClinicalAudit({
            hospitalId,
            user: req.user,
            action: 'MAR_ADMINISTRATION_CORRECTED',
            targetModel: 'MARRecord',
            targetId: mar._id,
            targetLabel: `MAR correction (${mar.status}): ${correctionReason}`,
            req
        });

        const io = req.app.get('io');
        if (io) {
            io.to(`hospital_${hospitalId}`).emit('ipd_drug_chart_updated', {
                admissionId,
                marId: mar._id,
                action: 'CORRECTED',
                timestamp: new Date()
            });
        }

        res.json({ success: true, message: 'Medication administration corrected with full audit trail', mar });
    } catch (err) {
        console.error('MAR correction error:', err);
        res.status(500).json({ success: false, message: 'Error correcting medication administration record' });
    }
});

// ============================================================================
// SECTION K: ICU DAILY OBSERVATION CHART (EXACT 2-PAGE AUTO-POPULATION)
// ============================================================================

// GET /api/ipd-clinical/admissions/:admissionId/icu-chart
router.get('/admissions/:admissionId/icu-chart', verifyToken, resolveTenant, requireNurseOrDoctorAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const { admissionId } = req.params;

        if (!hospitalId) {
            return res.status(403).json({ success: false, message: 'Hospital context required' });
        }

        const {
            Admission,
            InpatientOrder,
            IPDVitals,
            IPDIntakeOutput,
            IPDLine,
            IPDCatheter,
            NursingNote,
            LabReport,
            SurgeryPlan,
            InpatientClinicalNote,
            InpatientDrugChart,
            User,
            Bed
        } = getModels(req);

        const admission = await Admission.findOne({ _id: admissionId, hospitalId }).lean();
        if (!admission) {
            return res.status(404).json({ success: false, message: 'Admission record not found in this hospital' });
        }

        // Cross-store user and bed hydration
        let patient = null;
        if (admission.patientId) {
            patient = await findUserAcrossStores(User, admission.patientId);
        }

        let doctor = null;
        if (admission.doctorId) {
            doctor = await findUserAcrossStores(User, admission.doctorId);
        }

        let bed = null;
        if (admission.bedId && Bed) {
            try {
                bed = await Bed.findOne({ _id: admission.bedId, hospitalId }).lean();
            } catch (_) {}
        }

        // Parallel query of existing clinical streams belonging strictly to this admission & hospital
        const [
            vitals,
            intakeOutput,
            lines,
            catheters,
            orders,
            nursingNotes,
            labReports,
            surgeries,
            clinicalNote,
            drugChart,
            hospitalDoc
        ] = await Promise.all([
            IPDVitals ? IPDVitals.find({ admissionId, hospitalId }).sort({ recordedAt: 1 }).lean() : [],
            IPDIntakeOutput ? IPDIntakeOutput.find({ admissionId, hospitalId }).sort({ recordedAt: 1 }).lean() : [],
            IPDLine ? IPDLine.find({ admissionId, hospitalId }).sort({ insertedAt: 1 }).lean() : [],
            IPDCatheter ? IPDCatheter.find({ admissionId, hospitalId }).sort({ insertedAt: 1 }).lean() : [],
            InpatientOrder ? InpatientOrder.find({ admissionId, hospitalId, status: { $in: ['ACTIVE', 'COMPLETED'] } }).sort({ createdAt: 1 }).lean() : [],
            NursingNote ? NursingNote.find({ admissionId, hospitalId }).sort({ createdAt: 1 }).lean() : [],
            LabReport ? LabReport.find({ hospitalId, $or: [{ userId: admission.patientId }, { patientId: String(admission.patientId) }] }).sort({ createdAt: -1 }).limit(10).lean() : [],
            SurgeryPlan ? SurgeryPlan.find({ hospitalId, patientId: admission.patientId }).sort({ createdAt: -1 }).limit(5).lean() : [],
            InpatientClinicalNote ? InpatientClinicalNote.findOne({ admissionId, hospitalId }).lean() : null,
            InpatientDrugChart ? InpatientDrugChart.findOne({ admissionId, hospitalId }).lean() : null,
            Hospital.findById(hospitalId).lean()
        ]);

        // Audit log access
        logClinicalAudit({
            hospitalId,
            user: req.user,
            action: 'ICU_CHART_VIEWED',
            targetModel: 'Admission',
            targetId: admission._id,
            targetLabel: `ICU Observation Chart Viewed for ${patient?.name || 'Patient'} (${admission.ipdNumber || admission.admissionNumber || admission._id})`,
            req
        }).catch(() => {});

        res.json({
            success: true,
            data: {
                admission: {
                    ...admission,
                    patientId: patient || admission.patientId,
                    doctorId: doctor || admission.doctorId,
                    bedId: bed || admission.bedId
                },
                hospital: hospitalDoc || {},
                vitals: vitals || [],
                intakeOutput: intakeOutput || [],
                lines: lines || [],
                catheters: catheters || [],
                orders: orders || [],
                nursingNotes: nursingNotes || [],
                labReports: labReports || [],
                surgeries: surgeries || [],
                clinicalNote: clinicalNote || null,
                drugChart: drugChart || null
            }
        });
    } catch (err) {
        console.error('Error fetching ICU observation chart data:', err);
        res.status(500).json({ success: false, message: 'Error retrieving ICU observation chart data', error: err.message });
    }
});

router.ensureMARForAdmission = ensureMARForAdmission;
router.generateMARRecordsForOrder = generateMARRecordsForOrder;
router.getFrequencyTimeSlots = getFrequencyTimeSlots;
router.enrichOrderVirtuals = enrichOrderVirtuals;
router.resolveAdmissionAndPatient = resolveAdmissionAndPatient;

module.exports = router;

