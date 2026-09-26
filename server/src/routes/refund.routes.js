const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { verifyToken } = require('../middleware/auth.middleware');
const { resolveTenant } = require('../middleware/tenantMiddleware');
const auditLog = require('../middleware/audit.middleware');
const RefundRequest = require('../models/refundRequest.model');

// ── Access Control ────────────────────────────────────────────────────────────
const verifyAdminAccess = (req, res, next) => {
    const roleIdStr = String(req.user?.role || '').toLowerCase().replace(/[\s_-]/g, '');
    const roleData = req.user?._roleData;
    const roleName = String(roleData?.name || '').toLowerCase().replace(/[\s_-]/g, '');
    const perms = roleData?.permissions || [];

    const isAdmin = ['centraladmin', 'superadmin', 'hospitaladmin', 'admin'].includes(roleIdStr) ||
                    ['centraladmin', 'superadmin', 'hospitaladmin', 'admin'].includes(roleName) ||
                    roleIdStr.includes('admin') ||
                    roleName.includes('admin') ||
                    perms.includes('*') ||
                    perms.includes('admin_manage_roles');

    if (isAdmin) {
        return next();
    }
    return res.status(403).json({ success: false, message: 'Hospital Admin access required' });
};

const verifyReceptionAccess = (req, res, next) => {
    const roleIdStr = String(req.user?.role || '').toLowerCase().replace(/[\s_-]/g, '');
    const roleData = req.user?._roleData;
    const roleName = String(roleData?.name || '').toLowerCase().replace(/[\s_-]/g, '');
    const perms = roleData?.permissions || [];

    const isReceptionOrAbove = ['reception', 'receptionist', 'centraladmin', 'superadmin', 'hospitaladmin', 'accountant', 'admin', 'billing', 'cashier'].includes(roleIdStr) ||
                               ['reception', 'receptionist', 'centraladmin', 'superadmin', 'hospitaladmin', 'accountant', 'admin', 'billing', 'cashier'].includes(roleName) ||
                               roleIdStr.includes('admin') ||
                               roleName.includes('admin') ||
                               perms.includes('appointment_manage') ||
                               perms.includes('finance_view') ||
                               perms.includes('billing_manage') ||
                               perms.includes('admin_manage_roles') ||
                               perms.includes('*');

    if (isReceptionOrAbove) {
        return next();
    }
    return res.status(403).json({ success: false, message: 'Reception access required' });
};

// ══════════════════════════════════════════════════════════════════════════════
// HOSPITAL ADMIN — REFUND MANAGEMENT
// ══════════════════════════════════════════════════════════════════════════════

// 1. List all refund requests for this hospital
router.get('/admin/refunds', verifyToken, verifyAdminAccess, resolveTenant, async (req, res) => {
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
        console.error('Admin List Refunds Error:', error);
        res.status(500).json({ success: false, message: 'Error loading refund requests' });
    }
});

// 2. Approve refund
router.put('/admin/refunds/:id/approve', verifyToken, verifyAdminAccess, resolveTenant,
    auditLog('REFUND_APPROVED', (req) => ({ model: 'RefundRequest', id: req.params.id })),
    async (req, res) => {
        try {
            const hospitalId = req.user.hospitalId;
            if (!hospitalId) return res.status(400).json({ success: false, message: 'Hospital context required' });

            // Prevent accountant from approving their own refund
            const existing = await RefundRequest.findOne({
                _id: req.params.id,
                hospitalId: new mongoose.Types.ObjectId(hospitalId),
                status: 'PENDING_APPROVAL'
            });

            if (!existing) {
                return res.status(400).json({ success: false, message: 'Refund not found or not in PENDING_APPROVAL status' });
            }

            const roleIdStr = String(req.user?.role || '').toLowerCase().replace(/[\s_-]/g, '');
            const roleName = String(req.user?._roleData?.name || '').toLowerCase().replace(/[\s_-]/g, '');
            const perms = req.user?._roleData?.permissions || [];
            const isPermittedAdmin = ['centraladmin', 'superadmin', 'hospitaladmin', 'admin'].includes(roleIdStr) ||
                                     ['centraladmin', 'superadmin', 'hospitaladmin', 'admin'].includes(roleName) ||
                                     roleIdStr.includes('admin') ||
                                     roleName.includes('admin') ||
                                     perms.includes('*') ||
                                     perms.includes('admin_manage_roles');

            // In multi-user setups, non-admin accountant cannot approve their own; admins can always authorize
            if (!isPermittedAdmin && String(existing.requestedBy) === String(req.user._id)) {
                return res.status(403).json({ success: false, message: 'You cannot approve your own refund request' });
            }

            const refund = await RefundRequest.findOneAndUpdate(
                {
                    _id: req.params.id,
                    hospitalId: new mongoose.Types.ObjectId(hospitalId),
                    status: 'PENDING_APPROVAL'
                },
                {
                    $set: {
                        status: 'APPROVED',
                        approvedBy: req.user._id,
                        approvedByName: req.user.name || '',
                        approvedAt: new Date()
                    }
                },
                { new: true }
            );

            if (!refund) {
                return res.status(400).json({ success: false, message: 'Failed to approve — may have been already processed' });
            }

            // Socket notifications
            const io = req.app.get('io');
            if (io) {
                // Notify accountant
                io.to('accountant').emit('refund_approved', {
                    refundId: refund._id,
                    patientName: refund.patientName,
                    refundAmount: refund.refundAmount,
                    refundMode: refund.refundMode,
                    status: 'APPROVED',
                    approvedBy: req.user.name
                });

                // If CASH, notify reception
                if (refund.refundMode === 'CASH') {
                    io.to('reception').emit('refund_cash_ready', {
                        refundId: refund._id,
                        patientName: refund.patientName,
                        patientMRN: refund.patientMRN,
                        refundAmount: refund.refundAmount,
                        approvedBy: req.user.name,
                        approvedAt: refund.approvedAt,
                        status: 'APPROVED'
                    });
                    io.to('receptionist').emit('refund_cash_ready', {
                        refundId: refund._id,
                        patientName: refund.patientName,
                        patientMRN: refund.patientMRN,
                        refundAmount: refund.refundAmount,
                        approvedBy: req.user.name,
                        approvedAt: refund.approvedAt,
                        status: 'APPROVED'
                    });
                }

                io.to(`hospital_${hospitalId}`).emit('refund_status_updated', {
                    refundId: refund._id,
                    status: 'APPROVED'
                });
            }

            res.json({
                success: true,
                message: 'Refund approved successfully',
                data: refund
            });
        } catch (error) {
            console.error('Approve Refund Error:', error);
            res.status(500).json({ success: false, message: 'Error approving refund' });
        }
    }
);

// 3. Reject refund
router.put('/admin/refunds/:id/reject', verifyToken, verifyAdminAccess, resolveTenant,
    auditLog('REFUND_REJECTED', (req) => ({ model: 'RefundRequest', id: req.params.id })),
    async (req, res) => {
        try {
            const hospitalId = req.user.hospitalId;
            if (!hospitalId) return res.status(400).json({ success: false, message: 'Hospital context required' });

            const { rejectionReason } = req.body;

            const refund = await RefundRequest.findOneAndUpdate(
                {
                    _id: req.params.id,
                    hospitalId: new mongoose.Types.ObjectId(hospitalId),
                    status: 'PENDING_APPROVAL'
                },
                {
                    $set: {
                        status: 'REJECTED',
                        rejectedBy: req.user._id,
                        rejectedByName: req.user.name || '',
                        rejectedAt: new Date(),
                        rejectionReason: rejectionReason || ''
                    }
                },
                { new: true }
            );

            if (!refund) {
                return res.status(400).json({ success: false, message: 'Refund not found or not in PENDING_APPROVAL status' });
            }

            // Socket: notify accountant
            const io = req.app.get('io');
            if (io) {
                io.to('accountant').emit('refund_rejected', {
                    refundId: refund._id,
                    patientName: refund.patientName,
                    rejectionReason: rejectionReason || '',
                    status: 'REJECTED'
                });
                io.to(`hospital_${hospitalId}`).emit('refund_status_updated', {
                    refundId: refund._id,
                    status: 'REJECTED'
                });
            }

            res.json({
                success: true,
                message: 'Refund rejected',
                data: refund
            });
        } catch (error) {
            console.error('Reject Refund Error:', error);
            res.status(500).json({ success: false, message: 'Error rejecting refund' });
        }
    }
);

// ══════════════════════════════════════════════════════════════════════════════
// RECEPTION — CASH REFUND HANDOVER
// ══════════════════════════════════════════════════════════════════════════════

// 1. List approved CASH refunds pending handover
router.get('/reception/refunds', verifyToken, verifyReceptionAccess, resolveTenant, async (req, res) => {
    try {
        const hospitalId = req.user.hospitalId;
        if (!hospitalId) return res.status(400).json({ success: false, message: 'Hospital context required' });

        const { showCompleted } = req.query;

        const matchQuery = {
            hospitalId: new mongoose.Types.ObjectId(hospitalId),
            refundMode: 'CASH'
        };

        if (showCompleted === 'true') {
            matchQuery.status = { $in: ['APPROVED', 'REFUNDED'] };
        } else {
            matchQuery.status = 'APPROVED';
        }

        const refunds = await RefundRequest.find(matchQuery)
            .sort({ approvedAt: -1 })
            .lean();

        res.json({ success: true, data: refunds });
    } catch (error) {
        console.error('Reception Refunds Error:', error);
        res.status(500).json({ success: false, message: 'Error loading cash refunds' });
    }
});

// 2. Mark cash as handed over
router.put('/reception/refunds/:id/hand-over', verifyToken, verifyReceptionAccess, resolveTenant,
    auditLog('REFUND_COMPLETED', (req) => ({ model: 'RefundRequest', id: req.params.id })),
    async (req, res) => {
        try {
            const hospitalId = req.user.hospitalId;
            if (!hospitalId) return res.status(400).json({ success: false, message: 'Hospital context required' });

            // Atomic update — only APPROVED + CASH
            const refund = await RefundRequest.findOneAndUpdate(
                {
                    _id: req.params.id,
                    hospitalId: new mongoose.Types.ObjectId(hospitalId),
                    status: 'APPROVED',
                    refundMode: 'CASH'
                },
                {
                    $set: {
                        status: 'REFUNDED',
                        handedOverBy: req.user._id,
                        handedOverByName: req.user.name || '',
                        handedOverAt: new Date(),
                        processedAt: new Date()
                    }
                },
                { new: true }
            );

            if (!refund) {
                return res.status(400).json({
                    success: false,
                    message: 'Cash refund not found, not approved, or already handed over'
                });
            }

            // If linked to an original payment transaction, mark it as Refunded
            if (refund.originalPaymentId) {
                try {
                    const MasterPaymentTransaction = require('../models/paymentTransaction.model');
                    await MasterPaymentTransaction.findByIdAndUpdate(refund.originalPaymentId, {
                        $set: { paymentStatus: 'Refunded' }
                    });
                } catch (pErr) {
                    console.error('Error updating original payment transaction status on cash handover:', pErr);
                }
            }

            // Socket: notify accountant + admin
            const io = req.app.get('io');
            if (io) {
                io.to('accountant').emit('refund_completed', {
                    refundId: refund._id,
                    patientName: refund.patientName,
                    refundAmount: refund.refundAmount,
                    handedOverBy: req.user.name,
                    status: 'REFUNDED'
                });
                io.to('hospitaladmin').emit('refund_completed', {
                    refundId: refund._id,
                    patientName: refund.patientName,
                    status: 'REFUNDED'
                });
                io.to(`hospital_${hospitalId}`).emit('refund_status_updated', {
                    refundId: refund._id,
                    status: 'REFUNDED'
                });
            }

            res.json({
                success: true,
                message: 'Cash refund handed over successfully',
                data: refund
            });
        } catch (error) {
            console.error('Cash Handover Error:', error);
            res.status(500).json({ success: false, message: 'Error completing cash handover' });
        }
    }
);

// 3. Reception refund history
router.get('/reception/refund-history', verifyToken, verifyReceptionAccess, resolveTenant, async (req, res) => {
    try {
        const hospitalId = req.user.hospitalId;
        if (!hospitalId) return res.status(400).json({ success: false, message: 'Hospital context required' });

        const refunds = await RefundRequest.find({
            hospitalId: new mongoose.Types.ObjectId(hospitalId),
            refundMode: 'CASH',
            status: 'REFUNDED'
        })
            .sort({ handedOverAt: -1 })
            .limit(100)
            .lean();

        res.json({ success: true, data: refunds });
    } catch (error) {
        console.error('Reception Refund History Error:', error);
        res.status(500).json({ success: false, message: 'Error loading refund history' });
    }
});

module.exports = router;
