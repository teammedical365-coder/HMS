const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { verifyToken } = require('../middleware/auth.middleware');
const { resolveTenant } = require('../middleware/tenantMiddleware');
const auditLog = require('../middleware/audit.middleware');

// Models
const MasterUser = require('../models/user.model');
const MasterPaymentTransaction = require('../models/paymentTransaction.model');
const MasterAppointment = require('../models/appointment.model');
const MasterLabReport = require('../models/labReport.model');
const MasterPharmacyOrder = require('../models/pharmacyOrder.model');
const MasterFacilityCharge = require('../models/facilityCharge.model');
const MasterAdmission = require('../models/admission.model');
const MasterSurgeryPlan = require('../models/surgeryPlan.model');
const RefundRequest = require('../models/refundRequest.model');
const AuditLog = require('../models/auditLog.model');
const { getTenantModels } = require('../db/tenantModels');

// ── Access Control ────────────────────────────────────────────────────────────
const verifyAccountantAccess = (req, res, next) => {
    const roleIdStr = String(req.user?.role || '').toLowerCase().replace(/[\s_-]/g, '');
    const roleData = req.user?._roleData;
    const roleName = String(roleData?.name || '').toLowerCase().replace(/[\s_-]/g, '');
    const perms = roleData?.permissions || [];

    const isAuthorized = ['accountant', 'centraladmin', 'superadmin', 'hospitaladmin', 'admin', 'receptionist', 'reception', 'billing', 'cashier'].includes(roleIdStr) ||
                         ['accountant', 'centraladmin', 'superadmin', 'hospitaladmin', 'admin', 'receptionist', 'reception', 'billing', 'cashier'].includes(roleName) ||
                         roleIdStr.includes('admin') ||
                         roleName.includes('admin') ||
                         roleIdStr.includes('accountant') ||
                         roleName.includes('accountant') ||
                         roleIdStr.includes('reception') ||
                         roleName.includes('reception') ||
                         roleIdStr.includes('billing') ||
                         roleName.includes('billing') ||
                         perms.includes('finance_view') ||
                         perms.includes('billing_manage') ||
                         perms.includes('appointment_manage') ||
                         perms.includes('admin_manage_roles') ||
                         perms.includes('*');

    if (isAuthorized) {
        return next();
    }
    return res.status(403).json({ success: false, message: 'Accountant access required' });
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const getHospitalFilter = (req) => {
    if (!req.user.hospitalId) return {};
    return {
        $or: [
            { hospitalId: req.user.hospitalId },
            { hospitalId: { $exists: false } },
            { hospitalId: null }
        ]
    };
};

const getStrictHospitalFilter = (req) => {
    if (!req.user.hospitalId) return {};
    return { hospitalId: req.user.hospitalId };
};

// ══════════════════════════════════════════════════════════════════════════════
// 1. ACCOUNTANT DASHBOARD — Aggregated financial stats
// ══════════════════════════════════════════════════════════════════════════════
router.get('/dashboard', verifyToken, verifyAccountantAccess, resolveTenant, async (req, res) => {
    try {
        const hospitalId = req.user.hospitalId;
        if (!hospitalId) {
            return res.status(400).json({ success: false, message: 'Hospital context required' });
        }

        const hFilter = getHospitalFilter(req);

        // Date boundaries
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const todayEnd = new Date(todayStart); todayEnd.setDate(todayEnd.getDate() + 1);
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

        // Today's collection
        const todayPayments = await MasterPaymentTransaction.aggregate([
            { $match: { ...getStrictHospitalFilter(req), paymentStatus: { $in: ['Paid', 'paid', 'PAID'] }, paymentDate: { $gte: todayStart, $lt: todayEnd } } },
            { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }
        ]);

        // Month's collection
        const monthPayments = await MasterPaymentTransaction.aggregate([
            { $match: { ...getStrictHospitalFilter(req), paymentStatus: { $in: ['Paid', 'paid', 'PAID'] }, paymentDate: { $gte: monthStart, $lt: todayEnd } } },
            { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }
        ]);

        // Pending amounts (appointments with pending payment)
        const pendingAppointments = await MasterAppointment.aggregate([
            { $match: { ...getStrictHospitalFilter(req), paymentStatus: { $in: ['Pending', 'pending', 'PENDING', 'Partial', 'partial'] } } },
            { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }
        ]);

        // Advance / Extra payments (total paid minus total billed)
        const allPaidTransactions = await MasterPaymentTransaction.aggregate([
            { $match: { ...getStrictHospitalFilter(req), paymentStatus: { $in: ['Paid', 'paid', 'PAID'] } } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);

        // Refund stats
        const refundStats = await RefundRequest.aggregate([
            { $match: { hospitalId: new mongoose.Types.ObjectId(hospitalId) } },
            {
                $group: {
                    _id: '$status',
                    total: { $sum: '$refundAmount' },
                    count: { $sum: 1 }
                }
            }
        ]);

        const refundByStatus = {};
        refundStats.forEach(s => { refundByStatus[s._id] = { total: s.total, count: s.count }; });

        const totalRefunded = (refundByStatus['REFUNDED']?.total || 0);
        const pendingRefunds = (refundByStatus['PENDING_APPROVAL']?.total || 0) + (refundByStatus['APPROVED']?.total || 0) + (refundByStatus['PROCESSING']?.total || 0);

        // Recent payments for the table
        const recentPayments = await MasterPaymentTransaction.find({
            ...getStrictHospitalFilter(req),
            paymentStatus: { $in: ['Paid', 'paid', 'PAID', 'Pending', 'pending', 'PENDING'] }
        })
            .sort({ paymentDate: -1 })
            .limit(50)
            .populate('patientId', 'name phone patientId mrn')
            .lean();

        res.json({
            success: true,
            data: {
                todayCollection: todayPayments[0]?.total || 0,
                todayCount: todayPayments[0]?.count || 0,
                monthCollection: monthPayments[0]?.total || 0,
                monthCount: monthPayments[0]?.count || 0,
                pendingAmount: pendingAppointments[0]?.total || 0,
                pendingCount: pendingAppointments[0]?.count || 0,
                totalCollection: allPaidTransactions[0]?.total || 0,
                totalRefunded,
                pendingRefunds,
                refundByStatus,
                recentPayments
            }
        });
    } catch (error) {
        console.error('Accountant Dashboard Error:', error);
        res.status(500).json({ success: false, message: 'Error loading dashboard data' });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// 2. FINANCIAL RECORDS — paginated + filterable payment list
// ══════════════════════════════════════════════════════════════════════════════
router.get('/financial-records', verifyToken, verifyAccountantAccess, resolveTenant, async (req, res) => {
    try {
        const hospitalId = req.user.hospitalId;
        if (!hospitalId) return res.status(400).json({ success: false, message: 'Hospital context required' });

        const { page = 1, limit = 30, status, paymentMode, startDate, endDate, search } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const matchQuery = { ...getStrictHospitalFilter(req) };

        if (status) {
            const statusMap = {
                'PAID': { $in: ['Paid', 'paid', 'PAID'] },
                'PENDING': { $in: ['Pending', 'pending', 'PENDING'] },
                'PARTIAL': { $in: ['Partial', 'partial', 'PARTIAL'] },
            };
            matchQuery.paymentStatus = statusMap[status.toUpperCase()] || status;
        }

        if (paymentMode) {
            matchQuery.paymentMode = { $regex: new RegExp(paymentMode, 'i') };
        }

        if (startDate || endDate) {
            matchQuery.paymentDate = {};
            if (startDate) matchQuery.paymentDate.$gte = new Date(startDate);
            if (endDate) matchQuery.paymentDate.$lte = new Date(endDate);
        }

        // Fetch records
        let query = MasterPaymentTransaction.find(matchQuery)
            .sort({ paymentDate: -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .populate('patientId', 'name phone patientId mrn')
            .populate('addedBy', 'name')
            .lean();

        const [records, total] = await Promise.all([
            query,
            MasterPaymentTransaction.countDocuments(matchQuery)
        ]);

        // If search filter, do client-side patient name/MRN filter
        let filteredRecords = records;
        if (search) {
            const searchRe = new RegExp(search.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&'), 'i');
            filteredRecords = records.filter(r => {
                const p = r.patientId;
                return p && (searchRe.test(p.name) || searchRe.test(p.phone) || searchRe.test(p.patientId) || searchRe.test(p.mrn));
            });
        }

        res.json({
            success: true,
            data: {
                records: filteredRecords,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    totalPages: Math.ceil(total / parseInt(limit))
                }
            }
        });
    } catch (error) {
        console.error('Financial Records Error:', error);
        res.status(500).json({ success: false, message: 'Error loading financial records' });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// HELPER: Strict Hospital Refund Eligibility Calculator (Requirement 5)
//   - Appointment consultation payments are STRICTLY NON-REFUNDABLE
//   - Pharmacy & Laboratory payments belong to their own department refund workflows
//   - Only IPD admission, ward/room/bed, facility, surgery, and hospital service payments are refundable
// ══════════════════════════════════════════════════════════════════════════════
// Helper: Resolve patient record across MasterUser and Tenant DB User
async function resolveHospitalPatient(req, hospitalId, patientId) {
    const hClause = {
        _id: patientId,
        $or: [
            { hospitalId: hospitalId },
            { hospitalId: { $exists: false } },
            { hospitalId: null }
        ]
    };
    const tenantModels = req.tenantDb ? getTenantModels(req.tenantDb) : null;

    let patient = await MasterUser.findOne(hClause).select('name phone patientId mrn').lean();
    if (!patient && tenantModels?.User && tenantModels.User !== MasterUser) {
        try {
            patient = await tenantModels.User.findOne(hClause).select('name phone patientId mrn').lean();
        } catch (_) {}
    }
    return patient;
}

// Helper: Merge master and tenant query results without duplicate _ids
async function findMergedDocs(masterModel, tenantModel, query, selectStr = null) {
    let q1 = masterModel.find(query);
    if (selectStr) q1 = q1.select(selectStr);
    const masterList = await q1.lean();
    const merged = [...masterList];

    if (tenantModel && tenantModel !== masterModel) {
        try {
            let q2 = tenantModel.find(query);
            if (selectStr) q2 = q2.select(selectStr);
            const tenantList = await q2.lean();
            const seen = new Set(merged.map((d) => String(d._id)));
            tenantList.forEach((td) => {
                if (!seen.has(String(td._id))) merged.push(td);
            });
        } catch (_) {}
    }
    return merged;
}

async function computeHospitalRefundEligibility(req, hospitalId, patientId) {
    const patientObjId = new mongoose.Types.ObjectId(patientId);
    const hFilter = { hospitalId: new mongoose.Types.ObjectId(hospitalId) };
    const tenantModels = req.tenantDb ? getTenantModels(req.tenantDb) : null;

    // Fetch paid PaymentTransactions from both master and tenant DB (deduplicated)
    const allTxns = await findMergedDocs(
        MasterPaymentTransaction,
        tenantModels?.PaymentTransaction,
        { ...hFilter, patientId: patientObjId, paymentStatus: { $in: ['Paid', 'paid', 'PAID'] } }
    );
    allTxns.sort((a, b) => new Date(b.paymentDate || b.createdAt || 0) - new Date(a.paymentDate || a.createdAt || 0));

    // Collect referenced appointment, pharmacy, and lab IDs in mixed legacy PaymentTransactions so we can deduct their exact amounts
    const mixedApptIds = new Set();
    const mixedPharmaIds = new Set();
    const mixedLabIds = new Set();
    allTxns.forEach((pt) => {
        (pt.billedItems?.appointments || []).forEach((id) => mixedApptIds.add(String(id?._id || id)));
        (pt.billedItems?.pharmacyOrders || []).forEach((id) => mixedPharmaIds.add(String(id?._id || id)));
        (pt.billedItems?.labReports || []).forEach((id) => mixedLabIds.add(String(id?._id || id)));
    });

    const [apptDocs, pharmaDocs, labDocs, existingRefunds, paidAdmissions, paidFacilities, paidSurgeries] = await Promise.all([
        mixedApptIds.size > 0
            ? findMergedDocs(MasterAppointment, tenantModels?.Appointment, { _id: { $in: Array.from(mixedApptIds) } }, 'amount')
            : [],
        mixedPharmaIds.size > 0
            ? findMergedDocs(MasterPharmacyOrder, tenantModels?.PharmacyOrder, { _id: { $in: Array.from(mixedPharmaIds) } }, 'totalAmount')
            : [],
        mixedLabIds.size > 0
            ? findMergedDocs(MasterLabReport, tenantModels?.LabReport, { _id: { $in: Array.from(mixedLabIds) } }, 'amount price')
            : [],
        RefundRequest.find({
            hospitalId: new mongoose.Types.ObjectId(hospitalId),
            patientId: patientObjId
        }).sort({ createdAt: -1 }).lean(),
        findMergedDocs(MasterAdmission, tenantModels?.Admission, { ...hFilter, patientId: patientObjId }, 'totalAmount paidAmount paymentStatus ward bedNumber admissionDate'),
        findMergedDocs(MasterFacilityCharge, tenantModels?.FacilityCharge, { ...hFilter, patientId: patientObjId, paymentStatus: { $in: ['Paid', 'paid', 'PAID'] } }, 'totalAmount facilityName createdAt'),
        findMergedDocs(MasterSurgeryPlan, tenantModels?.SurgeryPlan, { ...hFilter, patientId: patientObjId, paidAmount: { $gt: 0 } }, 'paidAmount surgeryCost surgery createdAt')
    ]);

    const apptAmtMap = new Map(apptDocs.map((a) => [String(a._id), Number(a.amount) || 0]));
    const pharmaAmtMap = new Map(pharmaDocs.map((p) => [String(p._id), Number(p.totalAmount) || 0]));
    const labAmtMap = new Map(labDocs.map((l) => [String(l._id), Number(l.amount || l.price) || 0]));

    // Track already refunded & pending amounts per originalPaymentId and overall
    let alreadyRefunded = 0;
    let pendingRefundAmount = 0;
    const perPaymentClaimed = new Map();

    existingRefunds.forEach((r) => {
        const amt = Number(r.refundAmount) || 0;
        if (r.status === 'REFUNDED') {
            alreadyRefunded += amt;
        } else if (['PENDING_APPROVAL', 'APPROVED', 'PROCESSING'].includes(r.status)) {
            pendingRefundAmount += amt;
        }
        if (r.originalPaymentId && ['REFUNDED', 'PENDING_APPROVAL', 'APPROVED', 'PROCESSING'].includes(r.status)) {
            const k = String(r.originalPaymentId);
            perPaymentClaimed.set(k, (perPaymentClaimed.get(k) || 0) + amt);
        }
    });

    // Classify every PaymentTransaction strictly
    const eligiblePayments = [];
    const appointmentPaymentIds = new Set();
    const departmentExcludedIds = new Set();
    let eligiblePaidFromTxns = 0;
    let nonRefundableAppointmentPaid = 0;

    for (const pt of allTxns) {
        const ptIdStr = String(pt._id);
        const rawAmt = Number(pt.amount) || 0;
        const b = pt.billedItems || {};
        const hasAppts = Array.isArray(b.appointments) && b.appointments.length > 0;
        const hasPharma = Array.isArray(b.pharmacyOrders) && b.pharmacyOrders.length > 0;
        const hasLab = Array.isArray(b.labReports) && b.labReports.length > 0;
        const hasHospitalEligible = (
            (Array.isArray(b.admissions) && b.admissions.length > 0) ||
            (Array.isArray(b.facilityCharges) && b.facilityCharges.length > 0) ||
            (Array.isArray(b.surgeryPlans) && b.surgeryPlans.length > 0)
        );

        const descLower = String(pt.description || '').toLowerCase();
        const looksLikeApptDesc = (
            pt.sourceCategory === 'APPOINTMENT' ||
            pt.department === 'OPD_CONSULTATION' ||
            (!hasHospitalEligible && /appointment|consultation fee|opd consultation/i.test(descLower))
        );

        if (pt.department === 'PHARMACY' || pt.department === 'LABORATORY' || ((hasPharma || hasLab) && !hasHospitalEligible && !hasAppts)) {
            departmentExcludedIds.add(ptIdStr);
            continue;
        }

        if ((hasAppts && !hasHospitalEligible) || looksLikeApptDesc) {
            appointmentPaymentIds.add(ptIdStr);
            nonRefundableAppointmentPaid += rawAmt;
            continue;
        }

        // Mixed or pure hospital service/IPD transaction: compute exact eligible non-appointment portion
        let eligiblePortion = rawAmt;
        if (typeof pt.nonAppointmentAmount === 'number' && pt.nonAppointmentAmount >= 0) {
            eligiblePortion = Math.min(rawAmt, pt.nonAppointmentAmount);
        } else if (hasAppts || hasPharma || hasLab) {
            let excludedPortion = 0;
            (b.appointments || []).forEach((id) => { excludedPortion += (apptAmtMap.get(String(id?._id || id)) || 0); });
            (b.pharmacyOrders || []).forEach((id) => { excludedPortion += (pharmaAmtMap.get(String(id?._id || id)) || 0); });
            (b.labReports || []).forEach((id) => { excludedPortion += (labAmtMap.get(String(id?._id || id)) || 0); });
            if (hasAppts) {
                nonRefundableAppointmentPaid += (b.appointments || []).reduce((s, id) => s + (apptAmtMap.get(String(id?._id || id)) || 0), 0);
            }
            eligiblePortion = Math.max(0, Math.round((rawAmt - excludedPortion) * 100) / 100);
        }

        if (eligiblePortion <= 0) {
            appointmentPaymentIds.add(ptIdStr);
            continue;
        }

        eligiblePaidFromTxns += eligiblePortion;
        const alreadyClaimedOnPt = perPaymentClaimed.get(ptIdStr) || 0;
        const remainingOnPt = Math.max(0, Math.round((eligiblePortion - alreadyClaimedOnPt) * 100) / 100);

        if (remainingOnPt > 0) {
            eligiblePayments.push({
                ...pt,
                amount: remainingOnPt,
                originalCollectedAmount: rawAmt,
                eligibleAmount: eligiblePortion,
                alreadyRefundedOnPayment: alreadyClaimedOnPt,
                sourceLabel: (b.admissions?.length > 0)
                    ? 'IPD Admission / Room & Bed'
                    : (b.facilityCharges?.length > 0)
                        ? 'Hospital Ward / Facility Charge'
                        : (b.surgeryPlans?.length > 0)
                            ? 'OT / Surgery Charge'
                            : 'Hospital Service Charge'
            });
        }
    }

    // Also account for direct IPD/Facility/Surgery paid records if marked Paid directly without a PaymentTransaction
    let directModuleEligiblePaid = 0;
    paidAdmissions.forEach((a) => {
        const tot = Number(a.totalAmount) || 0;
        const pd = ['Paid', 'paid', 'PAID'].includes(a.paymentStatus) ? tot : (Number(a.paidAmount) || 0);
        directModuleEligiblePaid += pd;
    });
    paidFacilities.forEach((f) => { directModuleEligiblePaid += (Number(f.totalAmount) || 0); });
    paidSurgeries.forEach((s) => { directModuleEligiblePaid += (Number(s.paidAmount) || 0); });

    const totalEligibleHospitalPaid = Math.max(eligiblePaidFromTxns, directModuleEligiblePaid);
    const refundableAmount = Math.max(0, Math.round((totalEligibleHospitalPaid - alreadyRefunded - pendingRefundAmount) * 100) / 100);

    return {
        totalPaid: totalEligibleHospitalPaid,
        totalEligibleHospitalPaid,
        nonRefundableAppointmentPaid,
        alreadyRefunded,
        pendingRefundAmount,
        refundableAmount,
        payments: eligiblePayments,
        existingRefunds,
        appointmentPaymentIds,
        departmentExcludedIds
    };
}

// ══════════════════════════════════════════════════════════════════════════════
// 3. GET PATIENT REFUND DATA — calculates refundable amount (Excludes Appointments!)
// ══════════════════════════════════════════════════════════════════════════════
router.get('/refunds/patient/:patientId', verifyToken, verifyAccountantAccess, resolveTenant, async (req, res) => {
    try {
        const hospitalId = req.user.hospitalId;
        if (!hospitalId) return res.status(400).json({ success: false, message: 'Hospital context required' });

        const { patientId } = req.params;
        if (!mongoose.Types.ObjectId.isValid(patientId)) {
            return res.status(400).json({ success: false, message: 'Invalid patient ID' });
        }

        // Verify patient belongs to this hospital (across User & Patient in master & tenant DB)
        const patient = await resolveHospitalPatient(req, hospitalId, patientId);

        if (!patient) return res.status(404).json({ success: false, message: 'Patient not found in this hospital' });

        const eligibility = await computeHospitalRefundEligibility(req, hospitalId, patientId);

        res.json({
            success: true,
            data: {
                patient,
                totalPaid: eligibility.totalEligibleHospitalPaid,
                nonRefundableAppointmentPaid: eligibility.nonRefundableAppointmentPaid,
                totalCharges: eligibility.totalEligibleHospitalPaid,
                advanceBalance: eligibility.refundableAmount,
                alreadyRefunded: eligibility.alreadyRefunded,
                pendingRefundAmount: eligibility.pendingRefundAmount,
                refundableAmount: eligibility.refundableAmount,
                payments: eligibility.payments,
                existingRefunds: eligibility.existingRefunds
            }
        });
    } catch (error) {
        console.error('Patient Refund Data Error:', error);
        res.status(500).json({ success: false, message: 'Error loading patient refund data' });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// 4. CREATE REFUND REQUEST (Strict Backend Block on Appointment Refunds)
// ══════════════════════════════════════════════════════════════════════════════
router.post('/refunds/request', verifyToken, verifyAccountantAccess, resolveTenant,
    auditLog('REFUND_REQUESTED', (req) => ({
        model: 'RefundRequest',
        label: `Refund ₹${req.body.refundAmount} for patient ${req.body.patientId}`
    })),
    async (req, res) => {
        try {
            const hospitalId = req.user.hospitalId;
            if (!hospitalId) return res.status(400).json({ success: false, message: 'Hospital context required' });

            const { patientId, refundAmount, refundMode, reason, originalPaymentId } = req.body;
            const numericRefundAmount = Number(refundAmount);

            if (!patientId || !refundAmount || !refundMode) {
                return res.status(400).json({ success: false, message: 'patientId, refundAmount, and refundMode are required' });
            }

            if (!reason || !String(reason).trim()) {
                return res.status(400).json({ success: false, message: 'A refund reason is mandatory.' });
            }

            if (!['CASH', 'UPI', 'BANK_TRANSFER'].includes(refundMode)) {
                return res.status(400).json({ success: false, message: 'Invalid refund mode' });
            }

            if (!Number.isFinite(numericRefundAmount) || numericRefundAmount <= 0) {
                return res.status(400).json({ success: false, message: 'Refund amount must be positive' });
            }

            // Direct API Guard 1: Synthetic appointment payment IDs ("appt_payment_<id>") are strictly forbidden
            if (originalPaymentId && String(originalPaymentId).startsWith('appt_payment_')) {
                return res.status(400).json({
                    success: false,
                    message: 'Appointment payments are non-refundable and cannot be refunded.'
                });
            }

            if (!mongoose.Types.ObjectId.isValid(patientId)) {
                return res.status(400).json({ success: false, message: 'Invalid patientId' });
            }

            // Verify patient belongs to this hospital (across User & Patient in master & tenant DB)
            const patient = await resolveHospitalPatient(req, hospitalId, patientId);

            if (!patient) return res.status(404).json({ success: false, message: 'Patient not found' });

            // Direct API Guard 2: Check if originalPaymentId actually refers to an Appointment, PharmacyOrder, or LabReport ID
            if (originalPaymentId && mongoose.Types.ObjectId.isValid(originalPaymentId)) {
                const tenantModels = req.tenantDb ? getTenantModels(req.tenantDb) : null;
                const [masterAppt, tenantAppt, masterPharma, tenantPharma, masterLab, tenantLab] = await Promise.all([
                    MasterAppointment.findById(originalPaymentId).select('_id').lean(),
                    tenantModels?.Appointment && tenantModels.Appointment !== MasterAppointment
                        ? tenantModels.Appointment.findById(originalPaymentId).select('_id').lean().catch(() => null)
                        : null,
                    MasterPharmacyOrder.findById(originalPaymentId).select('_id').lean(),
                    tenantModels?.PharmacyOrder && tenantModels.PharmacyOrder !== MasterPharmacyOrder
                        ? tenantModels.PharmacyOrder.findById(originalPaymentId).select('_id').lean().catch(() => null)
                        : null,
                    MasterLabReport.findById(originalPaymentId).select('_id').lean(),
                    tenantModels?.LabReport && tenantModels.LabReport !== MasterLabReport
                        ? tenantModels.LabReport.findById(originalPaymentId).select('_id').lean().catch(() => null)
                        : null
                ]);
                if (masterAppt || tenantAppt) {
                    return res.status(400).json({
                        success: false,
                        message: 'Appointment consultation payments are non-refundable.'
                    });
                }
                if (masterPharma || tenantPharma || masterLab || tenantLab) {
                    return res.status(400).json({
                        success: false,
                        message: 'Pharmacy and Laboratory refunds must be processed through their respective department refund workflows.'
                    });
                }
            }

            // ── SERVER-SIDE ELIGIBILITY RECALCULATION (Never trust client) ────
            const eligibility = await computeHospitalRefundEligibility(req, hospitalId, patientId);

            // Direct API Guard 3: Check if originalPaymentId is a PaymentTransaction for an Appointment or Dept-excluded bill
            let validatedOriginalPaymentId = null;
            let originalTxnId = '';
            let resolvedSourceCategory = 'HOSPITAL_SERVICE';

            if (originalPaymentId) {
                const origIdStr = String(originalPaymentId);
                if (eligibility.appointmentPaymentIds.has(origIdStr)) {
                    return res.status(400).json({
                        success: false,
                        message: 'Appointment consultation payments are strictly non-refundable.'
                    });
                }
                if (eligibility.departmentExcludedIds.has(origIdStr)) {
                    return res.status(400).json({
                        success: false,
                        message: 'Pharmacy and Laboratory payments cannot be refunded through the hospital refund workflow.'
                    });
                }

                const matchedEligiblePayment = eligibility.payments.find((p) => String(p._id) === origIdStr);
                if (!matchedEligiblePayment) {
                    return res.status(400).json({
                        success: false,
                        message: 'Selected payment is not eligible for hospital refund or has already been refunded.'
                    });
                }
                if (numericRefundAmount > matchedEligiblePayment.amount + 0.01) {
                    return res.status(400).json({
                        success: false,
                        message: `Refund amount (₹${numericRefundAmount}) exceeds remaining refundable balance (₹${matchedEligiblePayment.amount}) on the selected payment.`
                    });
                }

                validatedOriginalPaymentId = matchedEligiblePayment._id;
                originalTxnId = matchedEligiblePayment.transactionId || '';
                resolvedSourceCategory = matchedEligiblePayment.sourceLabel || 'HOSPITAL_SERVICE';
            }

            if (eligibility.refundableAmount <= 0) {
                return res.status(400).json({
                    success: false,
                    message: 'No eligible non-appointment hospital payments available for refund. Appointment payments are non-refundable.'
                });
            }

            if (numericRefundAmount > eligibility.refundableAmount + 0.01) {
                return res.status(400).json({
                    success: false,
                    message: `Refund amount (₹${numericRefundAmount}) exceeds maximum refundable hospital balance (₹${eligibility.refundableAmount})`
                });
            }

            const patientObjId = new mongoose.Types.ObjectId(patientId);
            const refundRequest = await RefundRequest.create({
                hospitalId: new mongoose.Types.ObjectId(hospitalId),
                patientId: patientObjId,
                patientName: patient.name || '',
                patientMRN: patient.patientId || patient.mrn || '',
                originalPaymentId: validatedOriginalPaymentId,
                originalPaymentAmount: eligibility.totalEligibleHospitalPaid,
                totalCharges: eligibility.totalEligibleHospitalPaid,
                totalPaid: eligibility.totalEligibleHospitalPaid,
                alreadyRefunded: eligibility.alreadyRefunded,
                refundableAmount: eligibility.refundableAmount,
                refundAmount: numericRefundAmount,
                refundMode,
                reason: String(reason).trim(),
                sourceCategory: resolvedSourceCategory,
                originalTransactionId: originalTxnId,
                requestedBy: req.user._id,
                requestedByName: req.user.name || '',
                requestedAt: new Date(),
                status: 'PENDING_APPROVAL'
            });

            // Explicit AuditLog record for refund initiation
            try {
                await AuditLog.create({
                    hospitalId: new mongoose.Types.ObjectId(hospitalId),
                    userId: req.user._id,
                    userName: req.user.name || 'Staff',
                    userRole: String(req.user.role || ''),
                    action: 'REFUND_INITIATED',
                    targetModel: 'RefundRequest',
                    targetId: refundRequest._id,
                    details: {
                        patientId,
                        patientMRN: patient.patientId || patient.mrn || '',
                        refundAmount: numericRefundAmount,
                        refundMode,
                        reason: String(reason).trim(),
                        sourceCategory: resolvedSourceCategory
                    }
                });
            } catch (_) {}

            // Socket notification to Hospital Admin
            const io = req.app.get('io');
            if (io) {
                io.to(`hospital_${hospitalId}`).emit('refund_requested', {
                    refundId: refundRequest._id,
                    patientName: patient.name,
                    patientMRN: patient.patientId || patient.mrn,
                    refundAmount: numericRefundAmount,
                    refundMode,
                    requestedBy: req.user.name,
                    status: 'PENDING_APPROVAL'
                });
                io.to('hospitaladmin').emit('refund_requested', {
                    refundId: refundRequest._id,
                    patientName: patient.name,
                    refundAmount: numericRefundAmount,
                    refundMode,
                    status: 'PENDING_APPROVAL'
                });
            }

            res.status(201).json({
                success: true,
                message: 'Refund request created successfully. Awaiting Hospital Admin approval.',
                data: refundRequest
            });
        } catch (error) {
            console.error('Create Refund Request Error:', error);
            res.status(500).json({ success: false, message: 'Error creating refund request' });
        }
    }
);

// ══════════════════════════════════════════════════════════════════════════════
// 5. LIST REFUND REQUESTS (for accountant)
// ══════════════════════════════════════════════════════════════════════════════
router.get('/refunds', verifyToken, verifyAccountantAccess, resolveTenant, async (req, res) => {
    try {
        const hospitalId = req.user.hospitalId;
        if (!hospitalId) return res.status(400).json({ success: false, message: 'Hospital context required' });

        const { status, page = 1, limit = 30 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const matchQuery = { hospitalId: new mongoose.Types.ObjectId(hospitalId) };
        if (status) matchQuery.status = status;

        const [refunds, total] = await Promise.all([
            RefundRequest.find(matchQuery)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit))
                .lean(),
            RefundRequest.countDocuments(matchQuery)
        ]);

        res.json({
            success: true,
            data: {
                refunds,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    totalPages: Math.ceil(total / parseInt(limit))
                }
            }
        });
    } catch (error) {
        console.error('List Refunds Error:', error);
        res.status(500).json({ success: false, message: 'Error loading refunds' });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// 6. GET SINGLE REFUND DETAILS
// ══════════════════════════════════════════════════════════════════════════════
router.get('/refunds/:id', verifyToken, verifyAccountantAccess, resolveTenant, async (req, res) => {
    try {
        const hospitalId = req.user.hospitalId;
        if (!hospitalId) return res.status(400).json({ success: false, message: 'Hospital context required' });

        const refund = await RefundRequest.findOne({
            _id: req.params.id,
            hospitalId: new mongoose.Types.ObjectId(hospitalId)
        }).lean();

        if (!refund) return res.status(404).json({ success: false, message: 'Refund request not found' });

        res.json({ success: true, data: refund });
    } catch (error) {
        console.error('Get Refund Error:', error);
        res.status(500).json({ success: false, message: 'Error loading refund details' });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// 7. PROCESS REFUND (UPI/Bank — accountant marks as refunded after approval)
// ══════════════════════════════════════════════════════════════════════════════
router.put('/refunds/:id/process', verifyToken, verifyAccountantAccess, resolveTenant,
    auditLog('REFUND_COMPLETED', (req) => ({ model: 'RefundRequest', id: req.params.id })),
    async (req, res) => {
        try {
            const hospitalId = req.user.hospitalId;
            if (!hospitalId) return res.status(400).json({ success: false, message: 'Hospital context required' });

            const { refundTransactionId, processingNotes } = req.body;

            // Atomic find-and-update to prevent race conditions
            const refund = await RefundRequest.findOneAndUpdate(
                {
                    _id: req.params.id,
                    hospitalId: new mongoose.Types.ObjectId(hospitalId),
                    status: 'APPROVED',
                    refundMode: { $in: ['UPI', 'BANK_TRANSFER'] }
                },
                {
                    $set: {
                        status: 'REFUNDED',
                        refundTransactionId: refundTransactionId || '',
                        processingNotes: processingNotes || '',
                        processedBy: req.user._id,
                        processedByName: req.user.name || '',
                        processedAt: new Date()
                    }
                },
                { new: true }
            );

            if (!refund) {
                return res.status(400).json({
                    success: false,
                    message: 'Refund not found, not approved, or not a UPI/Bank refund'
                });
            }

            // If linked to an original payment transaction, mark it as Refunded
            if (refund.originalPaymentId) {
                try {
                    await MasterPaymentTransaction.findByIdAndUpdate(refund.originalPaymentId, {
                        $set: { paymentStatus: 'Refunded' }
                    });
                } catch (pErr) {
                    console.error('Error updating original payment transaction status:', pErr);
                }
            }

            // Socket notifications
            const io = req.app.get('io');
            if (io) {
                io.to(`hospital_${hospitalId}`).emit('refund_completed', {
                    refundId: refund._id,
                    patientName: refund.patientName,
                    refundAmount: refund.refundAmount,
                    refundMode: refund.refundMode,
                    status: 'REFUNDED'
                });
                io.to('hospitaladmin').emit('refund_completed', {
                    refundId: refund._id,
                    status: 'REFUNDED'
                });
            }

            res.json({
                success: true,
                message: 'Refund processed successfully',
                data: refund
            });
        } catch (error) {
            console.error('Process Refund Error:', error);
            res.status(500).json({ success: false, message: 'Error processing refund' });
        }
    }
);

// ══════════════════════════════════════════════════════════════════════════════
// 8. REFUND HISTORY (complete audit trail)
// ══════════════════════════════════════════════════════════════════════════════
router.get('/history', verifyToken, verifyAccountantAccess, resolveTenant, async (req, res) => {
    try {
        const hospitalId = req.user.hospitalId;
        if (!hospitalId) return res.status(400).json({ success: false, message: 'Hospital context required' });

        const { page = 1, limit = 30, startDate, endDate } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const matchQuery = {
            hospitalId: new mongoose.Types.ObjectId(hospitalId),
            status: { $in: ['REFUNDED', 'REJECTED', 'CANCELLED'] }
        };

        if (startDate || endDate) {
            matchQuery.createdAt = {};
            if (startDate) matchQuery.createdAt.$gte = new Date(startDate);
            if (endDate) matchQuery.createdAt.$lte = new Date(endDate);
        }

        const [history, total] = await Promise.all([
            RefundRequest.find(matchQuery)
                .sort({ updatedAt: -1 })
                .skip(skip)
                .limit(parseInt(limit))
                .lean(),
            RefundRequest.countDocuments(matchQuery)
        ]);

        res.json({
            success: true,
            data: {
                history,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    totalPages: Math.ceil(total / parseInt(limit))
                }
            }
        });
    } catch (error) {
        console.error('Refund History Error:', error);
        res.status(500).json({ success: false, message: 'Error loading refund history' });
    }
});

module.exports = router;
