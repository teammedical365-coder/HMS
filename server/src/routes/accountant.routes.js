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
const RefundRequest = require('../models/refundRequest.model');
const AuditLog = require('../models/auditLog.model');

// ── Access Control ────────────────────────────────────────────────────────────
const verifyAccountantAccess = (req, res, next) => {
    const roleIdStr = String(req.user?.role || '').toLowerCase().replace(/[\s_-]/g, '');
    const roleData = req.user?._roleData;
    const roleName = String(roleData?.name || '').toLowerCase().replace(/[\s_-]/g, '');
    const perms = roleData?.permissions || [];

    const isAuthorized = ['accountant', 'centraladmin', 'superadmin', 'hospitaladmin', 'admin'].includes(roleIdStr) ||
                         ['accountant', 'centraladmin', 'superadmin', 'hospitaladmin', 'admin'].includes(roleName) ||
                         roleIdStr.includes('admin') ||
                         roleName.includes('admin') ||
                         roleIdStr.includes('accountant') ||
                         roleName.includes('accountant') ||
                         perms.includes('finance_view') ||
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
// 3. GET PATIENT REFUND DATA — calculates refundable amount
// ══════════════════════════════════════════════════════════════════════════════
router.get('/refunds/patient/:patientId', verifyToken, verifyAccountantAccess, resolveTenant, async (req, res) => {
    try {
        const hospitalId = req.user.hospitalId;
        if (!hospitalId) return res.status(400).json({ success: false, message: 'Hospital context required' });

        const { patientId } = req.params;
        if (!mongoose.Types.ObjectId.isValid(patientId)) {
            return res.status(400).json({ success: false, message: 'Invalid patient ID' });
        }

        // Verify patient belongs to this hospital
        const patient = await MasterUser.findOne({
            _id: patientId,
            $or: [
                { hospitalId: hospitalId },
                { hospitalId: { $exists: false } },
                { hospitalId: null }
            ]
        }).select('name phone patientId mrn').lean();

        if (!patient) return res.status(404).json({ success: false, message: 'Patient not found in this hospital' });

        const hFilter = getStrictHospitalFilter(req);
        const patientObjId = new mongoose.Types.ObjectId(patientId);

        // Total paid
        const paidAgg = await MasterPaymentTransaction.aggregate([
            { $match: { ...hFilter, patientId: patientObjId, paymentStatus: { $in: ['Paid', 'paid', 'PAID'] } } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);
        const totalPaid = paidAgg[0]?.total || 0;

        // Total charges from appointments + lab + pharmacy + facility + admissions
        const [apptAgg, labAgg, pharmaAgg, facilityAgg] = await Promise.all([
            MasterAppointment.aggregate([
                { $match: { ...hFilter, $or: [{ userId: patientObjId }, { patientId: { $in: [patientId, String(patientId)] } }] } },
                { $group: { _id: null, total: { $sum: '$amount' } } }
            ]),
            MasterLabReport.aggregate([
                { $match: { ...hFilter, $or: [{ userId: patientObjId }, { patientId: { $in: [patientObjId, patientId, String(patientId)] } }] } },
                { $group: { _id: null, total: { $sum: '$amount' } } }
            ]),
            MasterPharmacyOrder.aggregate([
                { $match: { ...hFilter, $or: [{ userId: patientObjId }, { patientId: { $in: [patientObjId, patientId, String(patientId)] } }] } },
                { $group: { _id: null, total: { $sum: '$totalAmount' } } }
            ]),
            MasterFacilityCharge.aggregate([
                { $match: { ...hFilter, patientId: patientObjId } },
                { $group: { _id: null, total: { $sum: '$totalAmount' } } }
            ])
        ]);

        const totalCharges = (apptAgg[0]?.total || 0) + (labAgg[0]?.total || 0) + (pharmaAgg[0]?.total || 0) + (facilityAgg[0]?.total || 0);

        // Already refunded
        const refundedAgg = await RefundRequest.aggregate([
            { $match: { hospitalId: new mongoose.Types.ObjectId(hospitalId), patientId: patientObjId, status: 'REFUNDED' } },
            { $group: { _id: null, total: { $sum: '$refundAmount' } } }
        ]);
        const alreadyRefunded = refundedAgg[0]?.total || 0;

        // Pending refunds (not yet completed but requested)
        const pendingRefundAgg = await RefundRequest.aggregate([
            { $match: { hospitalId: new mongoose.Types.ObjectId(hospitalId), patientId: patientObjId, status: { $in: ['PENDING_APPROVAL', 'APPROVED', 'PROCESSING'] } } },
            { $group: { _id: null, total: { $sum: '$refundAmount' } } }
        ]);
        const pendingRefundAmount = pendingRefundAgg[0]?.total || 0;

        // Total refundable: patient can be refunded up to total amount paid minus prior and pending refunds
        const refundableAmount = Math.max(0, totalPaid - alreadyRefunded - pendingRefundAmount);
        const advanceBalance = Math.max(0, totalPaid - totalCharges - alreadyRefunded - pendingRefundAmount);

        // Payment history
        const payments = await MasterPaymentTransaction.find({
            ...hFilter,
            patientId: patientObjId,
            paymentStatus: { $in: ['Paid', 'paid', 'PAID'] }
        }).sort({ paymentDate: -1 }).lean();

        // Existing refund requests
        const existingRefunds = await RefundRequest.find({
            hospitalId: new mongoose.Types.ObjectId(hospitalId),
            patientId: patientObjId
        }).sort({ createdAt: -1 }).lean();

        res.json({
            success: true,
            data: {
                patient,
                totalPaid,
                totalCharges,
                advanceBalance,
                alreadyRefunded,
                pendingRefundAmount,
                refundableAmount,
                payments,
                existingRefunds
            }
        });
    } catch (error) {
        console.error('Patient Refund Data Error:', error);
        res.status(500).json({ success: false, message: 'Error loading patient refund data' });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// 4. CREATE REFUND REQUEST
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

            if (!patientId || !refundAmount || !refundMode) {
                return res.status(400).json({ success: false, message: 'patientId, refundAmount, and refundMode are required' });
            }

            if (!['CASH', 'UPI', 'BANK_TRANSFER'].includes(refundMode)) {
                return res.status(400).json({ success: false, message: 'Invalid refund mode' });
            }

            if (refundAmount <= 0) {
                return res.status(400).json({ success: false, message: 'Refund amount must be positive' });
            }

            // Verify patient belongs to this hospital
            const patient = await MasterUser.findOne({
                _id: patientId,
                $or: [{ hospitalId }, { hospitalId: { $exists: false } }, { hospitalId: null }]
            }).select('name patientId mrn').lean();

            if (!patient) return res.status(404).json({ success: false, message: 'Patient not found' });

            const patientObjId = new mongoose.Types.ObjectId(patientId);
            const hFilter = getStrictHospitalFilter(req);

            // ── SERVER-SIDE RECALCULATION ─────────────────────────────────────
            const paidAgg = await MasterPaymentTransaction.aggregate([
                { $match: { ...hFilter, patientId: patientObjId, paymentStatus: { $in: ['Paid', 'paid', 'PAID'] } } },
                { $group: { _id: null, total: { $sum: '$amount' } } }
            ]);
            const totalPaid = paidAgg[0]?.total || 0;

            const [apptAgg, labAgg, pharmaAgg, facilityAgg] = await Promise.all([
                MasterAppointment.aggregate([
                    { $match: { ...hFilter, $or: [{ userId: patientObjId }, { patientId: { $in: [patientId, String(patientId)] } }] } },
                    { $group: { _id: null, total: { $sum: '$amount' } } }
                ]),
                MasterLabReport.aggregate([
                    { $match: { ...hFilter, $or: [{ userId: patientObjId }, { patientId: { $in: [patientObjId, patientId, String(patientId)] } }] } },
                    { $group: { _id: null, total: { $sum: '$amount' } } }
                ]),
                MasterPharmacyOrder.aggregate([
                    { $match: { ...hFilter, $or: [{ userId: patientObjId }, { patientId: { $in: [patientObjId, patientId, String(patientId)] } }] } },
                    { $group: { _id: null, total: { $sum: '$totalAmount' } } }
                ]),
                MasterFacilityCharge.aggregate([
                    { $match: { ...hFilter, patientId: patientObjId } },
                    { $group: { _id: null, total: { $sum: '$totalAmount' } } }
                ])
            ]);
            const totalCharges = (apptAgg[0]?.total || 0) + (labAgg[0]?.total || 0) + (pharmaAgg[0]?.total || 0) + (facilityAgg[0]?.total || 0);

            const refundedAgg = await RefundRequest.aggregate([
                { $match: { hospitalId: new mongoose.Types.ObjectId(hospitalId), patientId: patientObjId, status: 'REFUNDED' } },
                { $group: { _id: null, total: { $sum: '$refundAmount' } } }
            ]);
            const alreadyRefunded = refundedAgg[0]?.total || 0;

            const pendingRefundAgg = await RefundRequest.aggregate([
                { $match: { hospitalId: new mongoose.Types.ObjectId(hospitalId), patientId: patientObjId, status: { $in: ['PENDING_APPROVAL', 'APPROVED', 'PROCESSING'] } } },
                { $group: { _id: null, total: { $sum: '$refundAmount' } } }
            ]);
            const pendingRefundAmount = pendingRefundAgg[0]?.total || 0;

            // Total refundable: patient cannot receive more than total amount paid minus prior and pending refunds
            const refundableAmount = Math.max(0, totalPaid - alreadyRefunded - pendingRefundAmount);

            if (refundAmount > refundableAmount) {
                return res.status(400).json({
                    success: false,
                    message: `Refund amount (₹${refundAmount}) exceeds maximum refundable balance (₹${refundableAmount})`
                });
            }

            // Get original transaction ID if payment reference provided
            let originalTxnId = '';
            if (originalPaymentId && mongoose.Types.ObjectId.isValid(originalPaymentId)) {
                const origPayment = await MasterPaymentTransaction.findById(originalPaymentId).lean();
                if (origPayment) {
                    originalTxnId = origPayment.transactionId || '';
                }
            }

            const refundRequest = await RefundRequest.create({
                hospitalId: new mongoose.Types.ObjectId(hospitalId),
                patientId: patientObjId,
                patientName: patient.name || '',
                patientMRN: patient.patientId || patient.mrn || '',
                originalPaymentId: originalPaymentId || null,
                originalPaymentAmount: totalPaid,
                totalCharges,
                totalPaid,
                alreadyRefunded,
                refundableAmount,
                refundAmount,
                refundMode,
                reason: reason || '',
                originalTransactionId: originalTxnId,
                requestedBy: req.user._id,
                requestedByName: req.user.name || '',
                requestedAt: new Date(),
                status: 'PENDING_APPROVAL'
            });

            // Socket notification to Hospital Admin
            const io = req.app.get('io');
            if (io) {
                io.to(`hospital_${hospitalId}`).emit('refund_requested', {
                    refundId: refundRequest._id,
                    patientName: patient.name,
                    patientMRN: patient.patientId || patient.mrn,
                    refundAmount,
                    refundMode,
                    requestedBy: req.user.name,
                    status: 'PENDING_APPROVAL'
                });
                io.to('hospitaladmin').emit('refund_requested', {
                    refundId: refundRequest._id,
                    patientName: patient.name,
                    refundAmount,
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
