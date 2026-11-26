const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { verifyToken } = require('../middleware/auth.middleware');
const { resolveTenant } = require('../middleware/tenantMiddleware');
const { getTenantModels } = require('../db/tenantModels');
const auditLog = require('../middleware/audit.middleware');

// Master fallbacks
const MasterUser = require('../models/user.model');
const MasterDoctor = require('../models/doctor.model');
const MasterAppointment = require('../models/appointment.model');
const MasterLabReport = require('../models/labReport.model');
const MasterPharmacyOrder = require('../models/pharmacyOrder.model');
const MasterFacilityCharge = require('../models/facilityCharge.model');
const MasterAdmission = require('../models/admission.model');
const MasterPaymentTransaction = require('../models/paymentTransaction.model');
const MasterSurgeryPlan = require('../models/surgeryPlan.model');
const MasterOTRoom = require('../models/otRoom.model');

// Helper: High-Performance Batch populate surgeon, assistants, and otRoom on surgery plans for billing
const populateBillingSurgeryPlans = async (plans) => {
    if (!plans || !plans.length) return [];

    const doctorAndUserIds = new Set();
    const roomIds = new Set();

    plans.forEach(doc => {
        const item = doc.toObject ? doc.toObject() : doc;
        if (item.surgeonId) {
            const raw = typeof item.surgeonId === 'object' && item.surgeonId._id ? item.surgeonId._id : item.surgeonId;
            if (raw) doctorAndUserIds.add(String(raw));
        }
        if (Array.isArray(item.assistantSurgeonIds)) {
            item.assistantSurgeonIds.forEach(asId => {
                const raw = typeof asId === 'object' && asId._id ? asId._id : asId;
                if (raw) doctorAndUserIds.add(String(raw));
            });
        }
        if (item.otRoomId) {
            const raw = typeof item.otRoomId === 'object' && item.otRoomId._id ? item.otRoomId._id : item.otRoomId;
            if (raw) roomIds.add(String(raw));
        }
    });

    const allDoctorIds = Array.from(doctorAndUserIds);
    const allRoomIds = Array.from(roomIds);

    const [users, doctors, rooms] = await Promise.all([
        allDoctorIds.length > 0
            ? MasterUser.find({ _id: { $in: allDoctorIds } }).select('name email phone specialization firstName lastName').lean()
            : [],
        allDoctorIds.length > 0
            ? MasterDoctor.find({ $or: [{ _id: { $in: allDoctorIds } }, { userId: { $in: allDoctorIds } }] }).select('name email phone specialization firstName lastName userId').lean()
            : [],
        allRoomIds.length > 0
            ? MasterOTRoom.find({ _id: { $in: allRoomIds } }).select('name status').lean()
            : []
    ]);

    const userMap = new Map();
    users.forEach(u => userMap.set(String(u._id), u));

    const doctorMap = new Map();
    doctors.forEach(d => {
        doctorMap.set(String(d._id), d);
        if (d.userId) doctorMap.set(String(d.userId), d);
    });

    const roomMap = new Map();
    rooms.forEach(r => roomMap.set(String(r._id), r));

    const resolveDoctor = (rawId) => {
        if (!rawId) return null;
        const idStr = String(rawId);
        return userMap.get(idStr) || doctorMap.get(idStr) || { _id: rawId, name: 'Doctor' };
    };

    return plans.map(doc => {
        const item = doc.toObject ? doc.toObject() : { ...doc };
        if (item.surgeonId) {
            const raw = typeof item.surgeonId === 'object' && item.surgeonId._id ? item.surgeonId._id : item.surgeonId;
            const d = resolveDoctor(raw);
            if (d) item.surgeonId = d;
        }
        if (Array.isArray(item.assistantSurgeonIds)) {
            item.assistantSurgeonIds = item.assistantSurgeonIds.map(asId => {
                const raw = typeof asId === 'object' && asId._id ? asId._id : asId;
                return resolveDoctor(raw) || { _id: raw, name: 'Doctor' };
            });
        }
        if (item.otRoomId) {
            const raw = typeof item.otRoomId === 'object' && item.otRoomId._id ? item.otRoomId._id : item.otRoomId;
            const r = roomMap.get(String(raw));
            if (r) item.otRoomId = r;
        }
        return item;
    });
};

// Billing access middleware — receptionist, cashier, admin also get billing view
const verifyBillingAccess = (req, res, next) => {
    const roleIdStr = String(req.user?.role || '').toLowerCase();
    const roleData = req.user?._roleData;
    const roleName = (roleData?.name || '').toLowerCase();
    const perms = roleData?.permissions || [];

    if (['cashier', 'accountant', 'reception', 'receptionist', 'centraladmin', 'superadmin', 'hospitaladmin', 'admin'].includes(roleIdStr) ||
        ['cashier', 'accountant', 'reception', 'receptionist', 'centraladmin', 'superadmin', 'hospitaladmin', 'admin'].includes(roleName) ||
        perms.includes('billing_view') || perms.includes('billing_manage') ||
        perms.includes('appointment_manage') || perms.includes('*')) {
        return next();
    }
    return res.status(403).json({ success: false, message: 'Billing access required' });
};

// Helper: get models scoped to tenant or master
const getModels = (req) => {
    if (req.tenantDb) return getTenantModels(req.tenantDb);
    return {
        User: MasterUser,
        Appointment: MasterAppointment,
        LabReport: MasterLabReport,
        PharmacyOrder: MasterPharmacyOrder,
        FacilityCharge: MasterFacilityCharge,
        Admission: MasterAdmission,
        PaymentTransaction: MasterPaymentTransaction,
        SurgeryPlan: MasterSurgeryPlan,
    };
};

// 1. Search Patient & Fetch All Bills (pending + paid summary) — tenant-scoped
router.get('/patient/:identifier', verifyToken, verifyBillingAccess, resolveTenant, async (req, res) => {
    try {
        const identifier = (req.params.identifier || '').trim();
        const { User, Appointment, LabReport, PharmacyOrder, FacilityCharge, Admission, PaymentTransaction, SurgeryPlan } = getModels(req);

        // Scope patient lookup flexibly to requesting user's hospital or legacy records without hospitalId
        const hospitalFilter = req.user.hospitalId ? {
            $or: [
                { hospitalId: req.user.hospitalId },
                { hospitalId: { $exists: false } },
                { hospitalId: null }
            ]
        } : {};

        // Find patient by MRN, patientId, phone, or name (case-insensitive regex)
        const isObjectId = identifier.length === 24 && /^[0-9a-fA-F]{24}$/.test(identifier);
        const safeRegex = new RegExp(identifier.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&'), 'i');
        const searchQuery = isObjectId ? { _id: identifier } : {
            $and: [
                hospitalFilter,
                {
                    $or: [
                        { mrn: safeRegex },
                        { patientId: safeRegex },
                        { phone: safeRegex },
                        { name: safeRegex }
                    ]
                }
            ]
        };

        let patient = await User.findOne(searchQuery);
        if (!patient && User !== MasterUser) {
            patient = await MasterUser.findOne(searchQuery);
        }
        if (!patient) return res.status(404).json({ success: false, message: 'Patient not found' });

        const hFilter = req.user.hospitalId ? {
            $or: [
                { hospitalId: req.user.hospitalId },
                { hospitalId: { $exists: false } },
                { hospitalId: null }
            ]
        } : {};

        // Find all matching patient user records (handles duplicate user records with same phone, MRN, or patientId)
        const patientMatchOr = [
            { _id: patient._id }
        ];
        if (patient.phone && String(patient.phone).trim()) {
            patientMatchOr.push({ phone: patient.phone });
        }
        if (patient.mrn && String(patient.mrn).trim()) {
            patientMatchOr.push({ mrn: patient.mrn });
        }
        if (patient.patientId && String(patient.patientId).trim()) {
            patientMatchOr.push({ patientId: patient.patientId });
        }

        let allPatientUsers = [patient];
        try {
            allPatientUsers = await User.find({
                $and: [
                    hFilter,
                    { $or: patientMatchOr }
                ]
            }).lean();
            if ((!allPatientUsers || allPatientUsers.length === 0) && User !== MasterUser) {
                allPatientUsers = await MasterUser.find({
                    $and: [
                        hFilter,
                        { $or: patientMatchOr }
                    ]
                }).lean();
            }
        } catch (e) {
            allPatientUsers = [patient];
        }

        const allPatientUserIds = Array.from(new Set([
            String(patient._id),
            ...allPatientUsers.map(u => String(u._id))
        ])).filter(id => mongoose.Types.ObjectId.isValid(id)).map(id => new mongoose.Types.ObjectId(id));

        const stringIdentifiers = Array.from(new Set([
            patient.patientId,
            patient.mrn,
            ...allPatientUsers.map(u => u.patientId),
            ...allPatientUsers.map(u => u.mrn),
            ...allPatientUserIds.map(id => String(id))
        ].filter(id => id && String(id).trim().length > 0)));

        const fetchWithMasterFallback = async (Model, MasterModel, query, selectFields, sortFields = null, populateArgs = null) => {
            let q1 = sortFields ? Model.find(query).sort(sortFields) : Model.find(query).select(selectFields);
            if (populateArgs) q1 = q1.populate(populateArgs);
            let results = await q1.lean();
            if (Model !== MasterModel) {
                let q2 = sortFields ? MasterModel.find(query).sort(sortFields) : MasterModel.find(query).select(selectFields);
                if (populateArgs) q2 = q2.populate(populateArgs);
                const masterResults = await q2.lean();
                const seen = new Set(results.map(r => r._id.toString()));
                for (const mr of masterResults) {
                    if (!seen.has(mr._id.toString())) results.push(mr);
                }
            }
            return results;
        };

        const patientFilter = {
            $or: [
                { userId: { $in: allPatientUserIds } },
                { patientId: { $in: stringIdentifiers } }
            ]
        };

        const patientDocFilter = {
            $or: [
                { patientId: { $in: allPatientUserIds } },
                { patientId: { $in: stringIdentifiers } }
            ]
        };

        const [appointments, labReports, pharmacyOrders, facilityCharges, admissions, paymentTransactions, rawSurgeryPlans] = await Promise.all([
            fetchWithMasterFallback(Appointment, MasterAppointment, {
                $and: [
                    hFilter,
                    patientFilter
                ]
            }, 'appointmentDate appointmentTime amount paymentStatus paymentMethod splitPayments upiScreenshotUrl cardRef notes serviceName doctorName status createdAt'),
            fetchWithMasterFallback(LabReport, MasterLabReport, {
                $and: [
                    hFilter,
                    patientFilter
                ]
            }, 'testNames amount paymentStatus testStatus createdAt'),
            fetchWithMasterFallback(PharmacyOrder, MasterPharmacyOrder, {
                $and: [
                    hFilter,
                    patientFilter
                ]
            }, 'items totalAmount paymentStatus orderStatus createdAt'),
            fetchWithMasterFallback(FacilityCharge, MasterFacilityCharge, {
                $and: [
                    hFilter,
                    { patientId: { $in: allPatientUserIds } }
                ]
            }, 'facilityName pricePerDay days totalAmount paymentStatus createdAt addedBy collectedBy', null, [{path: 'collectedBy', select: 'name'}, {path: 'addedBy', select: 'name'}]),
            fetchWithMasterFallback(Admission, MasterAdmission, {
                $and: [
                    hFilter,
                    { patientId: { $in: allPatientUserIds } }
                ]
            }, null, { admissionDate: -1 }),
            fetchWithMasterFallback(PaymentTransaction, MasterPaymentTransaction, {
                $and: [
                    hFilter,
                    { patientId: { $in: allPatientUserIds } }
                ]
            }, null, { paymentDate: -1 }),
            fetchWithMasterFallback(SurgeryPlan, MasterSurgeryPlan, {
                $and: [
                    hFilter,
                    { patientId: { $in: allPatientUserIds } }
                ]
            }, null, { surgeryDate: -1, createdAt: -1 })
        ]);

        const surgeryPlans = await populateBillingSurgeryPlans(rawSurgeryPlans);

        // Calculate ICU charges dynamically ONLY for active admissions where stay hasn't been finalized on discharge
        const Hospital = require('../models/hospital.model');
        const hospital = patient.hospitalId ? await Hospital.findById(patient.hospitalId).lean() : null;
        const icuFacility = hospital?.facilities?.find(f => f.name.toUpperCase().startsWith('ICU'));
        const icuRate = icuFacility ? (Number(icuFacility.pricePerDay) || 0) : 0;

        for (const adm of admissions) {
            if (adm.status !== 'Discharged' && adm.ward && adm.ward.toUpperCase().startsWith('ICU')) {
                const hasIcuCharge = adm.selectedFacilities?.some(f => f.facilityName.toUpperCase().startsWith('ICU'));
                if (!hasIcuCharge && icuRate > 0) {
                    const startDate = new Date(adm.admissionDate);
                    const endDate = adm.dischargeDate ? new Date(adm.dischargeDate) : new Date();
                    const diffTime = Math.max(0, endDate - startDate);
                    const diffDays = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
                    const icuTotal = icuRate * diffDays;
                    
                    adm.selectedFacilities = adm.selectedFacilities || [];
                    adm.selectedFacilities.push({
                        facilityName: icuFacility.name,
                        pricePerDay: icuRate,
                        days: diffDays,
                        totalAmount: icuTotal
                    });
                    adm.totalAmount = (adm.totalAmount || 0) + icuTotal;
                }
            }
            const totalAmt = Number(adm.totalAmount) || 0;
            const paidAmt = ['Paid', 'paid', 'PAID'].includes(adm.paymentStatus)
                ? totalAmt
                : Math.min(totalAmt, Math.max(0, Number(adm.paidAmount) || 0));
            adm.paidAmount = paidAmt;
            adm.dueAmount = Math.max(0, totalAmt - paidAmt);
        }

        // Exclude Pharmacy-only or Lab-only transactions from Hospital Reception payment history to prevent cross-department double-counting
        const hospitalPaymentTransactions = (paymentTransactions || []).filter(pt => {
            if (pt.department === 'PHARMACY' || pt.department === 'LABORATORY') return false;
            const b = pt.billedItems || {};
            const hasHospitalItems = (b.appointments?.length > 0) || (b.admissions?.length > 0) || (b.facilityCharges?.length > 0) || (b.surgeryPlans?.length > 0);
            const hasDeptOnlyItems = (b.pharmacyOrders?.length > 0 || b.labReports?.length > 0) && !hasHospitalItems;
            return !hasDeptOnlyItems;
        });
        paymentTransactions.length = 0;
        paymentTransactions.push(...hospitalPaymentTransactions);

        // Merge any paid appointments that don't have a PaymentTransaction record yet (so their screenshot & UTR show up)
        const ptApptIds = new Set();
        paymentTransactions.forEach(pt => {
            if (pt.billedItems?.appointments) {
                pt.billedItems.appointments.forEach(id => ptApptIds.add(String(id?._id || id)));
            }
        });

        appointments.forEach(apt => {
            if (['Paid', 'paid'].includes(apt.paymentStatus) && !ptApptIds.has(String(apt._id))) {
                let proofUrl = apt.upiScreenshotUrl || '';
                let upiId = '';
                let txnId = apt.cardRef || '';
                const pMethod = (apt.paymentMethod || 'Cash').toUpperCase();
                const isCashOnly = (pMethod === 'CASH' || (pMethod.includes('CASH') && !pMethod.includes('UPI') && !pMethod.includes('ONLINE') && !pMethod.includes('CARD'))) &&
                    (!apt.splitPayments || !apt.splitPayments.some(sp => {
                        const m = (sp.method || '').toUpperCase();
                        return m.includes('UPI') || m.includes('ONLINE') || m.includes('CARD');
                    }));

                if (!proofUrl && apt.notes && typeof apt.notes === 'string') {
                    const ssMatch = apt.notes.match(/Screenshot:\s*(https?:\/\/[^\s|]+)/i);
                    if (ssMatch) proofUrl = ssMatch[1];
                    if (!isCashOnly) {
                        const upiMatch = apt.notes.match(/UPI:\s*([^\s|]+)/i);
                        if (upiMatch) upiId = upiMatch[1];
                    }
                    const txnMatch = apt.notes.match(/Txn:\s*([^\s|]+)/i);
                    if (txnMatch && !isCashOnly) txnId = txnMatch[1];
                }

                if (isCashOnly) {
                    upiId = '';
                    proofUrl = '';
                    txnId = '';
                }

                let resolvedPaymentDate = apt.createdAt || apt.appointmentDate;
                if (apt.appointmentDate) {
                    try {
                        const baseDate = new Date(apt.appointmentDate);
                        const y = baseDate.getFullYear();
                        const m = baseDate.getMonth();
                        const d = baseDate.getDate();

                        if (apt.appointmentTime && typeof apt.appointmentTime === 'string') {
                            const tStr = apt.appointmentTime.trim();
                            const match12 = tStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
                            const match24 = tStr.match(/^(\d{1,2}):(\d{2})$/);
                            let hours = 0;
                            let minutes = 0;
                            let timeParsed = false;

                            if (match12) {
                                hours = parseInt(match12[1], 10);
                                minutes = parseInt(match12[2], 10);
                                if (match12[3].toUpperCase() === 'PM' && hours < 12) hours += 12;
                                if (match12[3].toUpperCase() === 'AM' && hours === 12) hours = 0;
                                timeParsed = true;
                            } else if (match24) {
                                hours = parseInt(match24[1], 10);
                                minutes = parseInt(match24[2], 10);
                                timeParsed = true;
                            }

                            if (timeParsed) {
                                resolvedPaymentDate = new Date(y, m, d, hours, minutes, 0, 0);
                            } else if (apt.createdAt) {
                                const cDate = new Date(apt.createdAt);
                                resolvedPaymentDate = new Date(y, m, d, cDate.getHours(), cDate.getMinutes(), cDate.getSeconds());
                            }
                        } else if (apt.createdAt) {
                            const cDate = new Date(apt.createdAt);
                            resolvedPaymentDate = new Date(y, m, d, cDate.getHours(), cDate.getMinutes(), cDate.getSeconds());
                        }
                    } catch (e) {
                        resolvedPaymentDate = apt.createdAt || apt.appointmentDate;
                    }
                }

                paymentTransactions.push({
                    _id: `appt_payment_${apt._id}`,
                    hospitalId: apt.hospitalId,
                    patientId: patient._id,
                    paymentMode: apt.paymentMethod || 'Cash',
                    paymentStatus: 'Paid',
                    amount: apt.amount || 0,
                    splitPayments: apt.splitPayments || [],
                    transactionId: txnId,
                    upiId: upiId,
                    proofUrl: proofUrl,
                    appointmentTime: apt.appointmentTime || '',
                    paymentDate: resolvedPaymentDate,
                    createdAt: apt.createdAt || resolvedPaymentDate,
                    description: `OPD Consultation Fee - Dr. ${apt.doctorName || 'Doctor'}`,
                    department: 'OPD_CONSULTATION',
                    sourceCategory: 'APPOINTMENT',
                    nonAppointmentAmount: 0,
                    billedItems: { appointments: [apt._id] }
                });
            }
        });

        // Sort payment transactions by date descending
        paymentTransactions.sort((a, b) => new Date(b.paymentDate || b.createdAt || 0) - new Date(a.paymentDate || a.createdAt || 0));

        // Fetch refund history for patient
        let refundRequests = [];
        try {
            const RefundRequest = require('../models/refundRequest.model');
            refundRequests = await RefundRequest.find({
                patientId: { $in: allPatientUserIds }
            }).sort({ createdAt: -1 }).lean();
        } catch (rErr) {
            console.warn('[billing-refunds-fetch-error]', rErr.message);
        }

        res.json({
            success: true,
            patient: {
                _id: patient._id,
                name: patient.name,
                mrn: patient.mrn,
                patientId: patient.patientId,
                phone: patient.phone,
                gender: patient.gender,
                dob: patient.dob,
            },
            billing: { appointments, labReports, pharmacyOrders, facilityCharges, admissions, surgeryPlans, paymentTransactions, refundRequests }
        });

    } catch (error) {
        console.error('[patient-billing-error]', error.message);
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// 2. Add Facility Charge — saves to tenant DB
router.post('/facility-charge', verifyToken, verifyBillingAccess, resolveTenant, async (req, res) => {
    try {
        const { patientId, facilityName, pricePerDay, days } = req.body;
        if (!patientId || !facilityName || !pricePerDay || !days) {
            return res.status(400).json({ success: false, message: 'All fields are required' });
        }

        const { FacilityCharge } = getModels(req);
        const charge = new FacilityCharge({
            hospitalId: req.hospitalId || req.user.hospitalId,
            patientId,
            facilityName,
            pricePerDay: Number(pricePerDay),
            days: Number(days),
            totalAmount: Number(pricePerDay) * Number(days),
            addedBy: req.user._id || req.user.userId,
            collectedBy: req.user._id || req.user.userId
        });

        await charge.save();
        res.status(201).json({ success: true, message: 'Facility charge added', charge });

    } catch (error) {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// 3. Mark hospital-owned items as paid — updates tenant DB & enforces strict department separation
router.put('/pay', verifyToken, verifyBillingAccess, resolveTenant, auditLog('CONFIRM_PAYMENT'), async (req, res) => {
    try {
        const {
            appointmentIds = [],
            labReportIds = [],
            pharmacyOrderIds = [],
            facilityChargeIds = [],
            admissionIds = [],
            admissionPayments = {}, // optional map: { [admissionId]: amountToPay } for partial/full IPD settlement
            surgeryPlanIds = [],
            surgeryPayments = {}, // optional map: { [planId]: amountToPay }
            paymentMode = 'Cash',
            patientId,
            amount,
            splitPayments = [],
            paymentDate,
            transactionId,
            upiId,
            cardDetails,
            bankReference,
            proofUrl,
            proofFileId,
            idempotencyKey
        } = req.body;

        // STRICT DEPARTMENT OWNERSHIP ENFORCEMENT (Requirements 2, 3, 4 & 8)
        if ((Array.isArray(pharmacyOrderIds) && pharmacyOrderIds.length > 0) || (Array.isArray(labReportIds) && labReportIds.length > 0)) {
            return res.status(400).json({
                success: false,
                message: 'Department Billing Separation: Pharmacy and Laboratory payments must be collected through their respective department billing dashboards, not Hospital Reception.'
            });
        }

        const totalSelectedItems = (appointmentIds?.length || 0) + (facilityChargeIds?.length || 0) + (admissionIds?.length || 0) + (surgeryPlanIds?.length || 0);
        if (totalSelectedItems === 0) {
            return res.status(400).json({
                success: false,
                message: 'Please select at least one eligible hospital bill item to settle.'
            });
        }

        // Validation: Payment date cannot be in the future
        if (paymentDate) {
            const pDate = new Date(paymentDate);
            const todayEnd = new Date();
            todayEnd.setHours(23, 59, 59, 999);
            if (pDate > todayEnd) {
                return res.status(400).json({ success: false, message: 'Payment date cannot be in the future' });
            }
        }

        let rawMode = splitPayments.length > 0 ? [...new Set(splitPayments.map(p => p.method))].join(' / ') : paymentMode;
        if (!rawMode || String(rawMode).trim() === '') rawMode = 'Cash';
        const actualPaymentMode = String(rawMode).trim();
        const totalAmount = splitPayments.length > 0
            ? splitPayments.reduce((acc, p) => acc + (Number(p.amount) || 0), 0)
            : Number(amount) || 0;

        if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
            return res.status(400).json({ success: false, message: 'Payment amount must be greater than zero.' });
        }

        const { Appointment, FacilityCharge, Admission, PaymentTransaction, SurgeryPlan } = getModels(req);

        // Security Control (FINDING-05): Cross-tenant BOLA prevention
        const effectiveHospitalId = req.hospitalId || req.user?.hospitalId;
        const isCentral = req.user?.role === 'centraladmin' || req.user?.role === 'superadmin';

        if (!isCentral && effectiveHospitalId) {
            const hIdStr = String(effectiveHospitalId);
            const itemsToCheck = [];
            if (appointmentIds.length > 0) {
                itemsToCheck.push(MasterAppointment.find({ _id: { $in: appointmentIds } }).select('hospitalId').lean());
                if (MasterAppointment !== Appointment) itemsToCheck.push(Appointment.find({ _id: { $in: appointmentIds } }).select('hospitalId').lean());
            }
            if (admissionIds.length > 0) {
                itemsToCheck.push(MasterAdmission.find({ _id: { $in: admissionIds } }).select('hospitalId').lean());
                if (MasterAdmission !== Admission) itemsToCheck.push(Admission.find({ _id: { $in: admissionIds } }).select('hospitalId').lean());
            }
            if (surgeryPlanIds.length > 0) {
                itemsToCheck.push(MasterSurgeryPlan.find({ _id: { $in: surgeryPlanIds } }).select('hospitalId').lean());
                if (MasterSurgeryPlan !== SurgeryPlan) itemsToCheck.push(SurgeryPlan.find({ _id: { $in: surgeryPlanIds } }).select('hospitalId').lean());
            }
            if (facilityChargeIds.length > 0) {
                itemsToCheck.push(MasterFacilityCharge.find({ _id: { $in: facilityChargeIds } }).select('hospitalId').lean());
                if (MasterFacilityCharge !== FacilityCharge) itemsToCheck.push(FacilityCharge.find({ _id: { $in: facilityChargeIds } }).select('hospitalId').lean());
            }

            const itemGroups = await Promise.all(itemsToCheck);
            for (const group of itemGroups) {
                for (const item of group) {
                    if (item.hospitalId && String(item.hospitalId) !== hIdStr) {
                        return res.status(403).json({
                            success: false,
                            message: 'Access denied: One or more billing items belong to another hospital facility.'
                        });
                    }
                }
            }
        }

        const hospitalFilter = (!isCentral && effectiveHospitalId) ? { hospitalId: effectiveHospitalId } : {};

        // Duplicate payment submission guard (idempotencyKey or identical payload within 15s)
        if (patientId) {
            const recentWindow = new Date(Date.now() - 15000);
            const dupQuery = idempotencyKey
                ? { ...(effectiveHospitalId ? { hospitalId: effectiveHospitalId } : {}), idempotencyKey }
                : {
                    ...(effectiveHospitalId ? { hospitalId: effectiveHospitalId } : {}),
                    patientId,
                    amount: totalAmount,
                    paymentStatus: 'Paid',
                    createdAt: { $gte: recentWindow },
                    'billedItems.admissions': admissionIds,
                    'billedItems.appointments': appointmentIds,
                    'billedItems.facilityCharges': facilityChargeIds
                };
            const existingDup = await PaymentTransaction.findOne(dupQuery).lean();
            if (existingDup) {
                return res.status(409).json({
                    success: false,
                    message: 'Duplicate payment submission detected. This payment was already recorded moments ago.'
                });
            }
        }

        // Server-side validation of exact expected payable amounts across selected hospital items
        let expectedAppointmentsTotal = 0;
        let expectedFacilitiesTotal = 0;
        let expectedAdmissionsTotal = 0;
        let expectedSurgeriesTotal = 0;

        if (appointmentIds.length > 0) {
            const appts = await Appointment.find({ _id: { $in: appointmentIds }, ...hospitalFilter }).lean();
            for (const a of appts) {
                if (['Paid', 'paid', 'PAID'].includes(a.paymentStatus)) {
                    return res.status(400).json({ success: false, message: 'One or more selected appointments are already paid.' });
                }
                expectedAppointmentsTotal += (Number(a.amount) || 0);
            }
        }

        if (facilityChargeIds.length > 0) {
            const facs = await FacilityCharge.find({ _id: { $in: facilityChargeIds }, ...hospitalFilter }).lean();
            for (const f of facs) {
                if (['Paid', 'paid', 'PAID'].includes(f.paymentStatus)) {
                    return res.status(400).json({ success: false, message: 'One or more selected facility charges are already paid.' });
                }
                expectedFacilitiesTotal += (Number(f.totalAmount) || 0);
            }
        }

        // Process IPD Admissions (Active AND Discharged — supports both partial and full payment)
        const resolvedAdmissionPayMap = {};
        let admissionsToPay = [];
        if (admissionIds.length > 0) {
            admissionsToPay = await Admission.find({ _id: { $in: admissionIds }, ...hospitalFilter });
            if (admissionsToPay.length === 0 && MasterAdmission !== Admission) {
                admissionsToPay = await MasterAdmission.find({ _id: { $in: admissionIds }, ...hospitalFilter });
            }
            if (admissionsToPay.length === 0) {
                return res.status(404).json({ success: false, message: 'Selected IPD admission bill not found.' });
            }

            for (const adm of admissionsToPay) {
                if (['Paid', 'paid', 'PAID'].includes(adm.paymentStatus)) {
                    return res.status(400).json({
                        success: false,
                        message: `IPD bill for ${adm.ward || 'Ward'} (Bed ${adm.bedNumber || '—'}) is already fully paid.`
                    });
                }

                // Dynamic ICU rate check ONLY for active un-finalized admissions
                if (adm.status !== 'Discharged' && adm.ward && adm.ward.toUpperCase().startsWith('ICU')) {
                    const hasIcuCharge = adm.selectedFacilities?.some(f => f.facilityName.toUpperCase().startsWith('ICU'));
                    if (!hasIcuCharge) {
                        const Hospital = require('../models/hospital.model');
                        const hospital = adm.hospitalId ? await Hospital.findById(adm.hospitalId).lean() : null;
                        const icuFacility = hospital?.facilities?.find(f => f.name.toUpperCase().startsWith('ICU'));
                        const icuRate = icuFacility ? (Number(icuFacility.pricePerDay) || 0) : 0;
                        if (icuRate > 0) {
                            const startDate = new Date(adm.admissionDate);
                            const endDate = adm.dischargeDate ? new Date(adm.dischargeDate) : new Date();
                            const diffTime = Math.max(0, endDate - startDate);
                            const diffDays = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
                            const icuTotal = icuRate * diffDays;

                            adm.selectedFacilities = adm.selectedFacilities || [];
                            adm.selectedFacilities.push({
                                facilityName: icuFacility.name,
                                pricePerDay: icuRate,
                                days: diffDays,
                                totalAmount: icuTotal
                            });
                            adm.totalAmount = (adm.totalAmount || 0) + icuTotal;
                        }
                    }
                }

                const admTotal = Number(adm.totalAmount) || 0;
                const admAlreadyPaid = Math.max(0, Number(adm.paidAmount) || 0);
                const admRemaining = Math.max(0, Math.round((admTotal - admAlreadyPaid) * 100) / 100);

                if (admRemaining <= 0) {
                    return res.status(400).json({ success: false, message: 'Selected IPD bill has zero remaining balance.' });
                }

                const admKey = String(adm._id);
                const requestedAdmPay = admissionPayments && admissionPayments[admKey] !== undefined
                    ? Number(admissionPayments[admKey])
                    : (admissionIds.length === 1 && appointmentIds.length === 0 && facilityChargeIds.length === 0 && surgeryPlanIds.length === 0
                        ? totalAmount
                        : admRemaining);

                if (!Number.isFinite(requestedAdmPay) || requestedAdmPay <= 0) {
                    return res.status(400).json({ success: false, message: 'Invalid payment amount entered for IPD bill.' });
                }
                if (requestedAdmPay > admRemaining + 0.5) {
                    return res.status(400).json({
                        success: false,
                        message: `IPD payment amount (₹${requestedAdmPay}) cannot exceed outstanding IPD balance (₹${admRemaining}).`
                    });
                }

                resolvedAdmissionPayMap[admKey] = Math.min(admRemaining, Math.round(requestedAdmPay * 100) / 100);
                expectedAdmissionsTotal += resolvedAdmissionPayMap[admKey];
            }
        }

        // Validate Surgery Plan payments (supports full & partial payments)
        let plansToPay = [];
        const resolvedSurgeryPayMap = {};
        if (surgeryPlanIds.length > 0) {
            plansToPay = await SurgeryPlan.find({ _id: { $in: surgeryPlanIds }, ...hospitalFilter });
            for (const sp of plansToPay) {
                const totalCost = Number(sp.surgeryCost) || 0;
                const currentPaid = Number(sp.paidAmount) || 0;
                const remaining = Math.max(0, totalCost - currentPaid);
                const payAmt = surgeryPayments[sp._id] !== undefined ? Number(surgeryPayments[sp._id]) : remaining;

                if (payAmt <= 0 || payAmt > remaining + 0.5) {
                    return res.status(400).json({
                        success: false,
                        message: `Payment amount (₹${payAmt}) must be between ₹1 and remaining surgery balance (₹${remaining})`
                    });
                }
                resolvedSurgeryPayMap[String(sp._id)] = payAmt;
                expectedSurgeriesTotal += payAmt;
            }
        }

        const expectedServerTotal = Math.round((expectedAppointmentsTotal + expectedFacilitiesTotal + expectedAdmissionsTotal + expectedSurgeriesTotal) * 100) / 100;
        if (Math.abs(totalAmount - expectedServerTotal) > 1) {
            return res.status(400).json({
                success: false,
                message: `Payment total (₹${totalAmount}) does not match selected hospital charges (₹${expectedServerTotal}).`
            });
        }

        // Persist IPD Admission partial/full payments (syncing both tenant & master models if distinct)
        for (const adm of admissionsToPay) {
            const payAmt = resolvedAdmissionPayMap[String(adm._id)];
            const admTotal = Number(adm.totalAmount) || 0;
            const newPaid = Math.min(admTotal, Math.round(((Number(adm.paidAmount) || 0) + payAmt) * 100) / 100);
            const newStatus = (newPaid >= admTotal - 0.01 && admTotal > 0) ? 'Paid' : 'Partially Paid';

            adm.paidAmount = newPaid;
            adm.paymentStatus = newStatus;
            adm.splitPayments = adm.splitPayments || [];
            if (splitPayments.length > 0) {
                splitPayments.forEach(s => adm.splitPayments.push({ method: s.method, amount: Number(s.amount) || 0, date: paymentDate ? new Date(paymentDate) : new Date() }));
            } else {
                adm.splitPayments.push({ method: actualPaymentMode, amount: payAmt, date: paymentDate ? new Date(paymentDate) : new Date() });
            }
            await adm.save();

            if (MasterAdmission !== Admission) {
                await MasterAdmission.updateOne(
                    { _id: adm._id },
                    { $set: { paidAmount: newPaid, paymentStatus: newStatus, splitPayments: adm.splitPayments, totalAmount: adm.totalAmount } }
                );
            }
        }

        // Persist Surgery Plan payments
        for (const sp of plansToPay) {
            const payAmt = resolvedSurgeryPayMap[String(sp._id)];
            const totalCost = Number(sp.surgeryCost) || 0;
            const newPaid = (Number(sp.paidAmount) || 0) + payAmt;
            sp.paidAmount = newPaid;
            sp.paymentStatus = (newPaid >= totalCost && totalCost > 0) ? 'PAID' : (newPaid > 0 ? 'PARTIALLY PAID' : 'UNPAID');

            sp.splitPayments = sp.splitPayments || [];
            if (splitPayments.length > 0) {
                splitPayments.forEach(s => sp.splitPayments.push({ ...s, date: paymentDate ? new Date(paymentDate) : new Date() }));
            } else {
                sp.splitPayments.push({ method: actualPaymentMode, amount: payAmt, date: paymentDate ? new Date(paymentDate) : new Date() });
            }
            await sp.save();

            if (sp.facilityChargeId && sp.paymentStatus === 'PAID') {
                await FacilityCharge.findOneAndUpdate({ _id: sp.facilityChargeId, ...hospitalFilter }, { paymentStatus: 'Paid' });
            }
        }

        await Promise.all([
            appointmentIds.length > 0 && Appointment.updateMany(
                { _id: { $in: appointmentIds }, ...hospitalFilter }, { $set: { paymentStatus: 'Paid', paymentMethod: actualPaymentMode, splitPayments, status: 'completed' } }),
            appointmentIds.length > 0 && MasterAppointment !== Appointment && MasterAppointment.updateMany(
                { _id: { $in: appointmentIds }, ...hospitalFilter }, { $set: { paymentStatus: 'Paid', paymentMethod: actualPaymentMode, splitPayments, status: 'completed' } }),

            facilityChargeIds.length > 0 && FacilityCharge.updateMany(
                { _id: { $in: facilityChargeIds }, ...hospitalFilter }, { $set: { paymentStatus: 'Paid', splitPayments } }),
            facilityChargeIds.length > 0 && MasterFacilityCharge !== FacilityCharge && MasterFacilityCharge.updateMany(
                { _id: { $in: facilityChargeIds }, ...hospitalFilter }, { $set: { paymentStatus: 'Paid', splitPayments } }),
        ].filter(Boolean));

        // Sync any lab tests prescribed on paid OPD appointments into LMS Order queue (without collecting lab fee at Reception)
        if (effectiveHospitalId && appointmentIds.length > 0) {
            try {
                const { syncPrescribedTestsToLmsOrder } = require('../services/lmsOrderSync.service');
                const paidAppts = await MasterAppointment.find({ _id: { $in: appointmentIds }, ...hospitalFilter }).lean();
                for (const appt of paidAppts) {
                    if (Array.isArray(appt.labTests) && appt.labTests.length > 0) {
                        await syncPrescribedTestsToLmsOrder({
                            hospitalId: appt.hospitalId || effectiveHospitalId,
                            appointmentId: appt._id,
                            userId: appt.userId,
                            patientId: appt.patientId,
                            doctorId: appt.doctorId,
                            doctorName: appt.doctorName || '',
                            labTests: appt.labTests,
                            sourceModule: 'HMS_RECEPTION',
                            actorId: req.user?._id
                        });
                    }
                }
            } catch (syncErr) {
                console.error('[billing pay-selected -> LMS sync error]:', syncErr.message);
            }
        }

        if (patientId) {
            let descParts = [];
            if (appointmentIds.length > 0) descParts.push(`${appointmentIds.length} Appointment(s)`);
            if (facilityChargeIds.length > 0) descParts.push(`${facilityChargeIds.length} Hospital Facility Charge(s)`);
            if (admissionIds.length > 0) descParts.push(`${admissionIds.length} IPD Admission Bill(s)`);
            if (surgeryPlanIds.length > 0) descParts.push(`${surgeryPlanIds.length} OT Surgery Bill(s)`);

            const description = descParts.length > 0 ? `Payment for: ${descParts.join(', ')}` : 'Hospital Service Payment';

            let finalMode = actualPaymentMode;
            if (Array.isArray(finalMode)) finalMode = finalMode.join(' / ');
            if (typeof finalMode === 'string') finalMode = finalMode.trim();
            if (!finalMode) finalMode = 'Cash';

            // Classify payment department & non-appointment refundable portion accurately
            const nonAppointmentAmount = Math.max(0, Math.round((expectedFacilitiesTotal + expectedAdmissionsTotal + expectedSurgeriesTotal) * 100) / 100);
            let department = 'HOSPITAL_RECEPTION';
            let sourceCategory = 'HOSPITAL_SERVICES';

            if (appointmentIds.length > 0 && nonAppointmentAmount === 0) {
                department = 'OPD_CONSULTATION';
                sourceCategory = 'APPOINTMENT';
            } else if (admissionIds.length > 0 && appointmentIds.length === 0 && facilityChargeIds.length === 0 && surgeryPlanIds.length === 0) {
                department = 'IPD';
                sourceCategory = 'IPD_ADMISSION';
            } else if (surgeryPlanIds.length > 0 && appointmentIds.length === 0 && admissionIds.length === 0) {
                department = 'OT_SURGERY';
                sourceCategory = 'SURGERY';
            } else if (appointmentIds.length > 0 && nonAppointmentAmount > 0) {
                department = 'HOSPITAL_RECEPTION';
                sourceCategory = 'MIXED_WITH_APPOINTMENT';
            }

            const txnPayload = {
                hospitalId: req.hospitalId || req.user.hospitalId,
                patientId,
                paymentMode: finalMode,
                splitPayments,
                paymentStatus: 'Paid',
                amount: Number(totalAmount) || 0,
                department,
                sourceCategory,
                nonAppointmentAmount,
                ...(idempotencyKey ? { idempotencyKey } : {}),
                transactionId,
                upiId,
                cardDetails,
                bankReference,
                proofUrl,
                proofFileId,
                paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
                description,
                billedItems: {
                    appointments: appointmentIds,
                    labReports: [],
                    pharmacyOrders: [],
                    facilityCharges: facilityChargeIds,
                    admissions: admissionIds,
                    surgeryPlans: surgeryPlanIds
                },
                addedBy: req.user._id || req.user.userId
            };

            const pt = new PaymentTransaction(txnPayload);
            await pt.save();
            if (MasterPaymentTransaction !== PaymentTransaction) {
                try {
                    await MasterPaymentTransaction.create({ ...txnPayload, _id: pt._id });
                } catch (_) {}
            }
        }

        res.json({ success: true, message: 'Hospital billing payment recorded successfully' });
    } catch (error) {
        console.error('[confirm-payment-error]', error);
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// 4. Fetch All Patients with their Billing Metrics (pending + paid dues) — tenant-scoped
router.get('/patients', verifyToken, verifyBillingAccess, resolveTenant, async (req, res) => {
    try {
        const { User, Appointment, LabReport, PharmacyOrder, FacilityCharge, Admission } = getModels(req);
        
        // Scope patient lookup to the requesting user's hospital
        const hospitalFilter = req.user.hospitalId ? { hospitalId: req.user.hospitalId } : {};

        // Find all patients registered under this hospital
        const patients = await User.find({
            ...hospitalFilter,
            role: 'patient'
        }).sort({ createdAt: -1 }).lean();

        const resolvedPatients = [];

        // For each patient, compute billing statistics
        for (const patient of patients) {
            const hFilter = req.user.hospitalId ? { hospitalId: req.user.hospitalId } : {};
            
            const [appointments, labReports, pharmacyOrders, facilityCharges, admissions] = await Promise.all([
                Appointment.find({ userId: patient._id, ...hFilter }).lean(),
                LabReport.find({ userId: patient._id, ...hFilter }).lean(),
                PharmacyOrder.find({ userId: patient._id, ...hFilter }).lean(),
                FacilityCharge.find({ patientId: patient._id, ...hFilter }).lean(),
                Admission.find({ patientId: patient._id, ...hFilter }).lean(),
            ]);

            // Calculate ICU charges dynamically for active/past admissions
            const Hospital = require('../models/hospital.model');
            const hospital = req.user.hospitalId ? await Hospital.findById(req.user.hospitalId).lean() : null;
            const icuFacility = hospital?.facilities?.find(f => f.name.toUpperCase().startsWith('ICU'));
            const icuRate = icuFacility ? (Number(icuFacility.pricePerDay) || 0) : 0;

            for (const adm of admissions) {
                if (adm.ward && adm.ward.toUpperCase().startsWith('ICU')) {
                    const hasIcuCharge = adm.selectedFacilities?.some(f => f.facilityName.toUpperCase().startsWith('ICU'));
                    if (!hasIcuCharge && icuRate > 0) {
                        const startDate = new Date(adm.admissionDate);
                        const endDate = adm.dischargeDate ? new Date(adm.dischargeDate) : new Date();
                        const diffTime = Math.max(0, endDate - startDate);
                        const diffDays = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
                        const icuTotal = icuRate * diffDays;
                        
                        adm.selectedFacilities = adm.selectedFacilities || [];
                        adm.selectedFacilities.push({
                            facilityName: icuFacility.name,
                            pricePerDay: icuRate,
                            days: diffDays,
                            totalAmount: icuTotal
                        });
                        adm.totalAmount = (adm.totalAmount || 0) + icuTotal;
                    }
                }
            }

            // Dues calculations (Hospital-owned services ONLY — excludes Pharmacy & Laboratory)
            let totalPaid = 0;
            let pendingDues = 0;

            appointments.forEach(a => {
                if (['Paid', 'paid'].includes(a.paymentStatus)) totalPaid += (a.amount || 0);
                if (!['Paid', 'paid'].includes(a.paymentStatus)) pendingDues += (a.amount || 0);
            });

            facilityCharges.forEach(f => {
                if (['Paid', 'paid'].includes(f.paymentStatus)) totalPaid += (f.totalAmount || 0);
                if (!['Paid', 'paid'].includes(f.paymentStatus)) pendingDues += (f.totalAmount || 0);
            });

            admissions.forEach(adm => {
                const admTotal = Number(adm.totalAmount) || 0;
                const admPaid = ['Paid', 'paid'].includes(adm.paymentStatus)
                    ? admTotal
                    : Math.min(admTotal, Math.max(0, Number(adm.paidAmount) || 0));
                totalPaid += admPaid;
                pendingDues += Math.max(0, admTotal - admPaid);
            });

            resolvedPatients.push({
                _id: patient._id,
                name: patient.name,
                mrn: patient.mrn,
                patientId: patient.patientId,
                phone: patient.phone,
                email: patient.email,
                gender: patient.gender,
                dob: patient.dob,
                pendingDues,
                totalPaid,
                billingStatus: pendingDues > 0 ? 'Pending' : 'Settled'
            });
        }

        res.json({ success: true, patients: resolvedPatients });
    } catch (error) {
        console.error('[billing-patients-error]', error);
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// 5. Fetch All Hospital Billing / Payment Transactions (Hospital-wide History with search & filters)
router.get('/history', verifyToken, verifyBillingAccess, resolveTenant, async (req, res) => {
    try {
        const hospitalId = req.user.hospitalId;
        const hospitalFilter = hospitalId ? {
            $or: [
                { hospitalId },
                { hospitalId: { $exists: false } },
                { hospitalId: null }
            ]
        } : {};

        const { search, mode, preset, startDate, endDate, limit = 500 } = req.query;

        // Calculate date boundaries
        const now = new Date();
        let startD = null;
        let endD = null;

        if (preset === 'today') {
            startD = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
            endD = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
        } else if (preset === 'yesterday') {
            const yest = new Date(now);
            yest.setDate(yest.getDate() - 1);
            startD = new Date(yest.getFullYear(), yest.getMonth(), yest.getDate(), 0, 0, 0, 0);
            endD = new Date(yest.getFullYear(), yest.getMonth(), yest.getDate(), 23, 59, 59, 999);
        } else if (preset === 'this_week') {
            const day = now.getDay();
            const diff = now.getDate() - day + (day === 0 ? -6 : 1);
            startD = new Date(now.getFullYear(), now.getMonth(), diff, 0, 0, 0, 0);
            endD = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
        } else if (preset === 'this_month') {
            startD = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
            endD = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
        } else if (preset === 'last_month') {
            startD = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
            endD = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
        } else if (startDate || endDate) {
            if (startDate) {
                const parts = String(startDate).split('-').map(Number);
                if (parts.length === 3 && !isNaN(parts[0])) {
                    startD = new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0);
                } else {
                    startD = new Date(startDate);
                }
            }
            if (endDate) {
                const parts = String(endDate).split('-').map(Number);
                if (parts.length === 3 && !isNaN(parts[0])) {
                    endD = new Date(parts[0], parts[1] - 1, parts[2], 23, 59, 59, 999);
                } else {
                    endD = new Date(endDate);
                    endD.setHours(23, 59, 59, 999);
                }
            }
        }

        // Cap dates: NEVER allow future dates (only today or previous)
        const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
        if (endD && endD > todayEnd) endD = todayEnd;
        if (startD && startD > todayEnd) startD = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

        // Fetch transactions populated with patient, creator, and appointments using tenant-scoped models
        const { User, Appointment, PaymentTransaction } = getModels(req);
        const TxnModel = PaymentTransaction || MasterPaymentTransaction;
        const ApptModel = Appointment || MasterAppointment;

        let transactions = [];
        try {
            transactions = await TxnModel.find(hospitalFilter)
                .populate('patientId', 'name phone mrn patientId email')
                .populate('addedBy', 'name role')
                .populate({
                    path: 'billedItems.appointments',
                    select: 'appointmentDate appointmentTime createdAt updatedAt serviceName doctorName visitType notes upiScreenshotUrl cardRef'
                })
                .sort({ paymentDate: -1, createdAt: -1 })
                .limit(Number(limit))
                .lean();
        } catch (e) {
            console.error('TxnModel lookup error:', e.message);
        }

        if (MasterPaymentTransaction && MasterPaymentTransaction !== TxnModel) {
            try {
                const masterTxns = await MasterPaymentTransaction.find(hospitalFilter)
                    .populate('patientId', 'name phone mrn patientId email')
                    .populate('addedBy', 'name role')
                    .populate({
                        path: 'billedItems.appointments',
                        select: 'appointmentDate appointmentTime createdAt updatedAt serviceName doctorName visitType notes upiScreenshotUrl cardRef'
                    })
                    .sort({ paymentDate: -1, createdAt: -1 })
                    .limit(Number(limit))
                    .lean();
                const existingIds = new Set(transactions.map(t => String(t._id)));
                masterTxns.forEach(mt => {
                    if (!existingIds.has(String(mt._id))) {
                        transactions.push(mt);
                    }
                });
            } catch (e) {}
        }

        // Exclude Pharmacy-only and Lab-only collections from Hospital Reception billing register
        transactions = transactions.filter(t => {
            if (t.department === 'PHARMACY' || t.department === 'LABORATORY') return false;
            const b = t.billedItems || {};
            const hasHospital = (b.appointments?.length > 0) || (b.admissions?.length > 0) || (b.facilityCharges?.length > 0) || (b.surgeryPlans?.length > 0);
            const hasDeptOnly = (b.pharmacyOrders?.length > 0 || b.labReports?.length > 0) && !hasHospital;
            return !hasDeptOnly;
        });

        // Reconcile booking timestamps and appointment metadata for existing transactions
        transactions.forEach(t => {
            const apt = t.billedItems?.appointments?.[0];
            if (apt) {
                if (!t.appointmentDate && apt.appointmentDate) t.appointmentDate = apt.appointmentDate;
                if (!t.appointmentTime && apt.appointmentTime) t.appointmentTime = apt.appointmentTime;
                if (apt.createdAt) {
                    t.bookingCreatedAt = apt.createdAt;
                    if (!t.paymentDate) t.paymentDate = apt.createdAt;
                    if (!t.createdAt) t.createdAt = apt.createdAt;
                }
            }
        });

        // Also fetch any paid appointments that have proof, paymentMethod or cardRef
        const apptQuery = {
            ...hospitalFilter,
            paymentStatus: { $in: ['Paid', 'PAID', 'paid'] }
        };

        let paidAppointments = [];
        try {
            paidAppointments = await ApptModel.find(apptQuery)
                .populate('userId', 'name phone mrn patientId email')
                .sort({ appointmentDate: -1, createdAt: -1 })
                .limit(Number(limit))
                .lean();
        } catch (e) {
            console.error('ApptModel lookup error:', e.message);
        }

        if (MasterAppointment && MasterAppointment !== ApptModel) {
            try {
                const masterAppts = await MasterAppointment.find(apptQuery)
                    .populate('userId', 'name phone mrn patientId email')
                    .sort({ appointmentDate: -1, createdAt: -1 })
                    .limit(Number(limit))
                    .lean();
                const existingApptIds = new Set(paidAppointments.map(a => String(a._id)));
                masterAppts.forEach(ma => {
                    if (!existingApptIds.has(String(ma._id))) {
                        paidAppointments.push(ma);
                    }
                });
            } catch (e) {}
        }

        // Track seen appointments
        const seenApptIds = new Set();
        transactions.forEach(t => {
            if (t.billedItems?.appointments) {
                t.billedItems.appointments.forEach(item => {
                    const id = item?._id || item;
                    if (id) seenApptIds.add(String(id));
                });
            }
        });

        paidAppointments.forEach(apt => {
            if (!seenApptIds.has(String(apt._id))) {
                let proofUrl = apt.upiScreenshotUrl || '';
                let upiId = '';
                let txnId = apt.cardRef || '';
                const pMethod = (apt.paymentMethod || 'Cash').toUpperCase();
                const isCashOnly = (pMethod === 'CASH' || (pMethod.includes('CASH') && !pMethod.includes('UPI') && !pMethod.includes('ONLINE') && !pMethod.includes('CARD'))) &&
                    (!apt.splitPayments || !apt.splitPayments.some(sp => {
                        const m = (sp.method || '').toUpperCase();
                        return m.includes('UPI') || m.includes('ONLINE') || m.includes('CARD');
                    }));

                if (!proofUrl && apt.notes && typeof apt.notes === 'string') {
                    const ssMatch = apt.notes.match(/Screenshot:\s*(https?:\/\/[^\s|]+)/i);
                    if (ssMatch) proofUrl = ssMatch[1];
                    if (!isCashOnly) {
                        const upiMatch = apt.notes.match(/UPI:\s*([^\s|]+)/i);
                        if (upiMatch) upiId = upiMatch[1];
                    }
                    const txnMatch = apt.notes.match(/Txn:\s*([^\s|]+)/i);
                    if (txnMatch && !isCashOnly) txnId = txnMatch[1];
                }

                if (isCashOnly) {
                    upiId = '';
                    proofUrl = '';
                    txnId = '';
                }

                // Resolve accurate booking date & time: prefer the actual booking creation timestamp
                let resolvedPaymentDate = apt.createdAt;
                if (!resolvedPaymentDate && apt._id) {
                    try {
                        const rawHex = String(apt._id).substring(0, 8);
                        if (/^[0-9a-fA-F]{8}$/.test(rawHex)) {
                            resolvedPaymentDate = new Date(parseInt(rawHex, 16) * 1000);
                        }
                    } catch (e) {}
                }
                if (!resolvedPaymentDate) {
                    resolvedPaymentDate = apt.appointmentDate || new Date();
                }

                transactions.push({
                    _id: `appt_payment_${apt._id}`,
                    hospitalId: apt.hospitalId,
                    patientId: apt.userId,
                    paymentMode: apt.paymentMethod || 'Cash',
                    paymentStatus: 'Paid',
                    amount: apt.amount || 0,
                    splitPayments: apt.splitPayments || [],
                    transactionId: txnId,
                    upiId: upiId,
                    proofUrl: proofUrl,
                    appointmentDate: apt.appointmentDate,
                    appointmentTime: apt.appointmentTime || '',
                    bookingCreatedAt: apt.createdAt || resolvedPaymentDate,
                    paymentDate: resolvedPaymentDate,
                    createdAt: apt.createdAt || resolvedPaymentDate,
                    description: apt.serviceName ? `${apt.serviceName}${apt.doctorName ? ` - Dr. ${apt.doctorName.replace(/^Dr\.?\s*/i, '')}` : ''}` : `OPD Consultation Fee - Dr. ${apt.doctorName || 'Doctor'}`,
                    doctorName: apt.doctorName ? (apt.doctorName.startsWith('Dr.') ? apt.doctorName : `Dr. ${apt.doctorName}`) : '',
                    billedItems: { appointments: [apt] }
                });
            }
        });

        // 1. Accurate Date Filtering
        if (startD || endD) {
            const sTime = startD ? startD.getTime() : 0;
            const eTime = endD ? endD.getTime() : Infinity;
            transactions = transactions.filter(t => {
                const itemDate = new Date(t.paymentDate || t.createdAt || 0).getTime();
                return itemDate >= sTime && itemDate <= eTime;
            });
        }

        // 2. Accurate Payment Mode Filtering
        if (mode && mode !== 'ALL') {
            const m = mode.trim().toUpperCase();
            transactions = transactions.filter(t => {
                const pMode = (t.paymentMode || '').toUpperCase();
                const hasSplitUpi = t.splitPayments?.some(sp => {
                    const method = (sp.method || '').toUpperCase();
                    return method.includes('UPI') || method.includes('ONLINE');
                });
                const hasSplitCash = t.splitPayments?.some(sp => (sp.method || '').toUpperCase().includes('CASH'));
                const hasSplitCard = t.splitPayments?.some(sp => (sp.method || '').toUpperCase().includes('CARD'));

                if (m === 'UPI') {
                    return pMode.includes('UPI') || pMode.includes('ONLINE') || hasSplitUpi;
                }
                if (m === 'CASH') {
                    return pMode.includes('CASH') || hasSplitCash;
                }
                if (m === 'CARD') {
                    return pMode.includes('CARD') || hasSplitCard;
                }
                return pMode.includes(m);
            });
        }

        // 3. Accurate Search filtering (across patient name, phone, mrn, patientId, txnId, upiId, description, mode)
        if (search && search.trim()) {
            const term = search.trim().toLowerCase();
            transactions = transactions.filter(t => {
                const pat = t.patientId || {};
                const name = (pat.name || '').toLowerCase();
                const phone = (pat.phone || '').toLowerCase();
                const mrn = (pat.mrn || pat.patientId || '').toLowerCase();
                const txn = (t.transactionId || '').toLowerCase();
                const upi = (t.upiId || '').toLowerCase();
                const desc = (t.description || '').toLowerCase();
                const modeStr = (t.paymentMode || '').toLowerCase();
                return name.includes(term) || phone.includes(term) || mrn.includes(term) || txn.includes(term) || upi.includes(term) || desc.includes(term) || modeStr.includes(term);
            });
        }

        // Sort by paymentDate descending
        transactions.sort((a, b) => new Date(b.paymentDate || b.createdAt || 0) - new Date(a.paymentDate || a.createdAt || 0));

        // Calculate summary metrics accurately for the filtered set
        let totalCollected = 0;
        let totalUpi = 0;
        let totalCash = 0;

        transactions.forEach(t => {
            const amt = Number(t.amount) || 0;
            totalCollected += amt;
            const modeStr = (t.paymentMode || '').toUpperCase();

            if (t.splitPayments && t.splitPayments.length > 0) {
                t.splitPayments.forEach(sp => {
                    const spAmt = Number(sp.amount) || 0;
                    const spMethod = (sp.method || '').toUpperCase();
                    if (spMethod.includes('UPI') || spMethod.includes('ONLINE')) {
                        totalUpi += spAmt;
                    } else if (spMethod.includes('CASH')) {
                        totalCash += spAmt;
                    } else {
                        totalCash += spAmt;
                    }
                });
            } else if (modeStr.includes('UPI') || modeStr.includes('ONLINE')) {
                totalUpi += amt;
            } else if (modeStr.includes('CASH')) {
                totalCash += amt;
            } else {
                totalCash += amt;
            }
        });

        res.json({
            success: true,
            transactions,
            totalCollected,
            totalUpi,
            totalCash,
            count: transactions.length,
            dateRange: { startD, endD, preset: preset || 'all' }
        });
    } catch (err) {
        console.error('[billing-history-error]', err);
        res.status(500).json({ success: false, message: 'Failed to fetch billing history' });
    }
});

module.exports = router;
