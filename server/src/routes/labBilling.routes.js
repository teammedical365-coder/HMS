const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const { verifyToken } = require('../middleware/auth.middleware');
const User = require('../models/user.model');
const Hospital = require('../models/hospital.model');
const LabOrder = require('../models/labOrder.model');
const LabCounter = require('../models/labCounter.model');
const LabInvoice = require('../models/labInvoice.model');
const LabPayment = require('../models/labPayment.model');
const LabRefund = require('../models/labRefund.model');
const LabAdvanceLedger = require('../models/labAdvanceLedger.model');
const LabCashRegister = require('../models/labCashRegister.model');
const LabFinancialAudit = require('../models/labFinancialAudit.model');
const LabLocation = require('../models/labLocation.model');

// =========================================================================
// 1. BILLING SECURITY & ROLE MIDDLEWARE
// =========================================================================
const verifyBillingAccess = (req, res, next) => {
    const user = req.user;
    if (!user) return res.status(401).json({ success: false, message: 'Authentication required' });

    const roleData = user._roleData;
    const roleName = String(roleData?.name || user.role || '').toLowerCase();
    const perms = roleData?.permissions || [];

    const isAuthorized = (
        perms.includes('*') ||
        roleName.includes('admin') ||
        roleName.includes('accountant') ||
        roleName.includes('manager') ||
        roleName.includes('reception') ||
        roleName.includes('cashier') ||
        perms.includes('billing:view') ||
        perms.includes('billing:manage') ||
        perms.includes('billing:invoice_create') ||
        perms.includes('lab_view') ||
        perms.includes('finance_view')
    );

    if (!isAuthorized) {
        return res.status(403).json({ success: false, message: 'Access denied: Laboratory billing permissions required' });
    }

    req.hospitalId = req.user.hospitalId || req.headers['x-hospital-id'] || null;
    next();
};

// Check if user is authorized to approve discounts > limit
const canApproveHighDiscount = (user) => {
    const roleData = user._roleData;
    const roleName = String(roleData?.name || user.role || '').toLowerCase();
    const perms = roleData?.permissions || [];
    return (
        perms.includes('*') ||
        roleName.includes('admin') ||
        roleName.includes('accountant') ||
        roleName.includes('manager') ||
        perms.includes('billing:discount:approve') ||
        perms.includes('billing:manage')
    );
};

// Check if user is authorized to process refunds
const canProcessRefund = (user) => {
    const roleData = user._roleData;
    const roleName = String(roleData?.name || user.role || '').toLowerCase();
    const perms = roleData?.permissions || [];
    return (
        perms.includes('*') ||
        roleName.includes('admin') ||
        roleName.includes('accountant') ||
        roleName.includes('manager') ||
        perms.includes('billing:refund') ||
        perms.includes('billing:refund:approve')
    );
};

// Helper: atomic sequence generators
async function generateAtomicInvoiceNumber(hospitalId, hospital, dateStr) {
    const hospitalCode = await Hospital.ensureHospitalCode(hospital);
    const seq = await LabCounter.getNextSequence(hospitalId, 'invoice', dateStr);
    return `INV-${hospitalCode}-${dateStr}-${String(seq).padStart(4, '0')}`;
}

async function generateAtomicPaymentNumber(hospitalId, hospital, dateStr) {
    const hospitalCode = await Hospital.ensureHospitalCode(hospital);
    const seq = await LabCounter.getNextSequence(hospitalId, 'payment', dateStr);
    return `PAY-${hospitalCode}-${dateStr}-${String(seq).padStart(4, '0')}`;
}

async function generateAtomicRefundNumber(hospitalId, hospital, dateStr) {
    const hospitalCode = await Hospital.ensureHospitalCode(hospital);
    const seq = await LabCounter.getNextSequence(hospitalId, 'refund', dateStr);
    return `REF-${hospitalCode}-${dateStr}-${String(seq).padStart(4, '0')}`;
}

// Date parser helper for query filters
function buildDateRangeQuery(period, startDate, endDate, dateField = 'createdAt') {
    const now = new Date();
    let start, end;

    if (period === 'today') {
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
        end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    } else if (period === 'week') {
        const firstDayOfWeek = now.getDate() - now.getDay();
        start = new Date(now.getFullYear(), now.getMonth(), firstDayOfWeek, 0, 0, 0, 0);
        end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    } else if (period === 'month') {
        start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
        end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    } else if (period === 'custom' && startDate && endDate) {
        start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
    } else {
        return null;
    }

    return { [dateField]: { $gte: start, $lte: end } };
}

// =========================================================================
// 2. INVOICE APIS
// =========================================================================

/**
 * POST /api/lab/billing/invoices
 * Generate Invoice from a Phase 4 confirmed order.
 * Strictly prevents duplicate invoices for the same order and computes price on backend.
 */
router.post('/invoices', verifyToken, verifyBillingAccess, async (req, res) => {
    try {
        const { orderId, discounts = [], notes = '' } = req.body;
        const hospitalId = req.hospitalId;

        if (!hospitalId) {
            return res.status(400).json({ success: false, message: 'Tenant hospital context is required' });
        }
        if (!orderId) {
            return res.status(400).json({ success: false, message: 'Order ID is required to generate invoice' });
        }

        // Check if invoice already exists for this order
        const existingInvoice = await LabInvoice.findOne({ hospitalId, orderId, status: 'ACTIVE' });
        if (existingInvoice) {
            return res.status(409).json({
                success: false,
                message: `Invoice ${existingInvoice.invoiceNumber} has already been generated for this order`,
                invoice: existingInvoice
            });
        }

        // Fetch order with immutable snapshots
        const order = await LabOrder.findOne({ _id: orderId, hospitalId });
        if (!order) {
            return res.status(404).json({ success: false, message: 'Laboratory order not found or does not belong to this tenant' });
        }
        if (order.status === 'Cancelled' || order.cancellation?.isCancelled) {
            return res.status(400).json({ success: false, message: 'Cannot generate invoice for a cancelled order' });
        }

        const hospital = await Hospital.findById(hospitalId);
        const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const invoiceNumber = await generateAtomicInvoiceNumber(hospitalId, hospital, todayStr);

        // Build invoice line items from order snapshots
        const items = [];
        let grossAmount = 0;
        let orderDiscount = 0;

        (order.tests || []).forEach(t => {
            const std = Number(t.standardPrice || t.price || 0);
            const pr = Number(t.price || std);
            const disc = Math.max(0, std - pr);
            grossAmount += std;
            orderDiscount += disc;
            items.push({
                itemType: 'Test',
                testId: t.testId,
                code: t.testCode,
                name: t.testName,
                quantity: 1,
                unitPrice: std,
                discount: disc,
                amount: pr
            });
        });

        (order.packages || []).forEach(p => {
            const std = Number(p.standardPrice || p.discountedPrice || 0);
            const pr = Number(p.discountedPrice || std);
            const disc = Math.max(0, std - pr);
            grossAmount += std;
            orderDiscount += disc;
            items.push({
                itemType: 'Package',
                packageId: p.packageId,
                code: p.packageCode,
                name: p.packageName,
                quantity: 1,
                unitPrice: std,
                discount: disc,
                amount: pr
            });
        });

        // Calculate any additional invoice-level discounts
        let invoiceDiscount = 0;
        const validDiscounts = [];
        const subtotal = Math.max(0, grossAmount - orderDiscount);

        if (Array.isArray(discounts) && discounts.length > 0) {
            for (const d of discounts) {
                if (!d.reason || !d.type || d.value === undefined || d.value === null) continue;
                let amt = 0;
                const val = Number(d.value);
                if (val <= 0) continue;

                if (d.type === 'percentage') {
                    if (val > 100) {
                        return res.status(400).json({ success: false, message: 'Percentage discount cannot exceed 100%' });
                    }
                    amt = Math.round((subtotal * val) / 100);
                } else if (d.type === 'fixed') {
                    amt = Math.min(val, subtotal);
                }

                // Check authorization for high discounts (> 20% or > 20% of subtotal)
                const isHighDiscount = (d.type === 'percentage' && val > 20) || (d.type === 'fixed' && amt > subtotal * 0.2);
                if (isHighDiscount && !canApproveHighDiscount(req.user)) {
                    return res.status(403).json({
                        success: false,
                        message: 'Discount exceeds 20% threshold. Manager or Accountant authorization required.'
                    });
                }

                invoiceDiscount += amt;
                validDiscounts.push({
                    type: d.type,
                    value: val,
                    amount: amt,
                    reason: String(d.reason).trim(),
                    appliedBy: req.user._id,
                    approvedBy: isHighDiscount ? req.user._id : null,
                    appliedAt: new Date()
                });
            }
        }

        const totalDiscount = Math.min(grossAmount, orderDiscount + invoiceDiscount);
        const netAmount = Math.max(0, grossAmount - totalDiscount);
        const dueAmount = netAmount;

        const newInvoice = new LabInvoice({
            hospitalId,
            invoiceNumber,
            orderId: order._id,
            orderNumber: order.orderNumber,
            patientId: order.patient,
            patientSnapshot: order.patientSnapshot,
            referringDoctor: order.referringDoctor,
            referringDoctorName: order.referringDoctorName,
            locationId: order.locationId || null,
            items,
            discounts: validDiscounts,
            pricing: {
                grossAmount,
                orderDiscount,
                invoiceDiscount,
                totalDiscount,
                tax: 0,
                netAmount,
                paidAmount: 0,
                refundedAmount: 0,
                dueAmount,
                currency: 'INR'
            },
            paymentStatus: netAmount === 0 ? 'PAID' : 'UNPAID',
            refundStatus: 'NO_REFUND',
            status: 'ACTIVE',
            notes,
            createdBy: req.user._id,
            updatedBy: req.user._id
        });

        await newInvoice.save();

        // Financial Audit Log
        await LabFinancialAudit.create({
            hospitalId,
            action: 'INVOICE_CREATED',
            entityType: 'LabInvoice',
            entityId: newInvoice._id,
            entityIdentifier: invoiceNumber,
            amount: netAmount,
            details: { orderNumber: order.orderNumber, grossAmount, totalDiscount, netAmount },
            performedBy: req.user._id
        });

        res.status(201).json({
            success: true,
            message: 'Invoice generated successfully',
            invoice: newInvoice
        });
    } catch (error) {
        console.error('[lab billing] generate invoice error:', error);
        res.status(500).json({ success: false, message: 'Failed to generate invoice: ' + error.message });
    }
});

/**
 * GET /api/lab/billing/invoices
 * Paginated list of invoices with filters.
 */
router.get('/invoices', verifyToken, verifyBillingAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId;
        const {
            page = 1,
            limit = 20,
            search = '',
            paymentStatus = '',
            period = '',
            startDate = '',
            endDate = ''
        } = req.query;

        const query = { hospitalId, status: 'ACTIVE' };

        if (paymentStatus) {
            query.paymentStatus = paymentStatus;
        }

        const dateQuery = buildDateRangeQuery(period, startDate, endDate, 'createdAt');
        if (dateQuery) {
            Object.assign(query, dateQuery);
        }

        if (search) {
            const regex = new RegExp(search.trim(), 'i');
            query.$or = [
                { invoiceNumber: regex },
                { orderNumber: regex },
                { 'patientSnapshot.name': regex },
                { 'patientSnapshot.phone': regex },
                { 'patientSnapshot.uhid': regex }
            ];
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const [invoices, total] = await Promise.all([
            LabInvoice.find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit))
                .lean(),
            LabInvoice.countDocuments(query)
        ]);

        res.json({
            success: true,
            invoices,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        console.error('[lab billing] get invoices error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch invoices: ' + error.message });
    }
});

/**
 * GET /api/lab/billing/invoices/:id
 * Retrieve single invoice with payments and refunds.
 */
router.get('/invoices/:id', verifyToken, verifyBillingAccess, async (req, res) => {
    try {
        const { id } = req.params;
        const hospitalId = req.hospitalId;

        const invoice = await LabInvoice.findOne({ _id: id, hospitalId }).lean();
        if (!invoice) {
            return res.status(404).json({ success: false, message: 'Invoice not found or does not belong to this tenant' });
        }

        const [payments, refunds] = await Promise.all([
            LabPayment.find({ hospitalId, invoiceId: id, paymentStatus: 'SUCCESS' }).sort({ createdAt: -1 }).lean(),
            LabRefund.find({ hospitalId, invoiceId: id }).sort({ createdAt: -1 }).lean()
        ]);

        res.json({
            success: true,
            invoice,
            payments,
            refunds
        });
    } catch (error) {
        console.error('[lab billing] get invoice by id error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch invoice details: ' + error.message });
    }
});

/**
 * GET /api/lab/billing/invoices/by-order/:orderId
 * Retrieve invoice by associated LabOrder ID.
 */
router.get('/invoices/by-order/:orderId', verifyToken, verifyBillingAccess, async (req, res) => {
    try {
        const { orderId } = req.params;
        const hospitalId = req.hospitalId;

        const invoice = await LabInvoice.findOne({ hospitalId, orderId, status: 'ACTIVE' }).lean();
        if (!invoice) {
            return res.status(404).json({ success: false, message: 'No active invoice found for this order' });
        }

        const payments = await LabPayment.find({ hospitalId, invoiceId: invoice._id, paymentStatus: 'SUCCESS' }).sort({ createdAt: -1 }).lean();

        res.json({
            success: true,
            invoice,
            payments
        });
    } catch (error) {
        console.error('[lab billing] get invoice by order error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch invoice: ' + error.message });
    }
});

/**
 * GET /api/lab/billing/invoices/:id/print
 * Print-ready invoice payload with lab branding.
 */
router.get('/invoices/:id/print', verifyToken, verifyBillingAccess, async (req, res) => {
    try {
        const { id } = req.params;
        const hospitalId = req.hospitalId;

        const [invoice, hospital, payments] = await Promise.all([
            LabInvoice.findOne({ _id: id, hospitalId }).lean(),
            Hospital.findById(hospitalId).select('name code address phone email logo gstin').lean(),
            LabPayment.find({ hospitalId, invoiceId: id, paymentStatus: 'SUCCESS' }).sort({ createdAt: 1 }).lean()
        ]);

        if (!invoice) {
            return res.status(404).json({ success: false, message: 'Invoice not found' });
        }

        res.json({
            success: true,
            printData: {
                hospital: {
                    name: hospital?.name || 'Medical365 Laboratory',
                    code: hospital?.code || '',
                    address: hospital?.address || 'Healthcare City, India',
                    phone: hospital?.phone || '',
                    email: hospital?.email || '',
                    gstin: hospital?.gstin || '27AAAAA0000A1Z5'
                },
                invoice,
                payments
            }
        });
    } catch (error) {
        console.error('[lab billing] get invoice print data error:', error);
        res.status(500).json({ success: false, message: 'Failed to generate invoice print data: ' + error.message });
    }
});

/**
 * POST /api/lab/billing/invoices/:id/discount
 * Apply additional discount to an existing active invoice.
 * Recalculates net & due amounts securely on the backend.
 */
router.post('/invoices/:id/discount', verifyToken, verifyBillingAccess, async (req, res) => {
    try {
        const { id } = req.params;
        const { type, value, reason } = req.body;
        const hospitalId = req.hospitalId;

        if (!type || value === undefined || !reason) {
            return res.status(400).json({ success: false, message: 'Discount type, value, and reason are required' });
        }

        const invoice = await LabInvoice.findOne({ _id: id, hospitalId, status: 'ACTIVE' });
        if (!invoice) {
            return res.status(404).json({ success: false, message: 'Active invoice not found' });
        }

        const numVal = Number(value);
        if (isNaN(numVal) || numVal <= 0) {
            return res.status(400).json({ success: false, message: 'Discount value must be a positive number' });
        }

        const subtotal = Math.max(0, invoice.pricing.grossAmount - invoice.pricing.orderDiscount);
        let discountAmt = 0;

        if (type === 'percentage') {
            if (numVal > 100) {
                return res.status(400).json({ success: false, message: 'Percentage discount cannot exceed 100%' });
            }
            discountAmt = Math.round((subtotal * numVal) / 100);
        } else if (type === 'fixed') {
            discountAmt = Math.min(numVal, subtotal);
        } else {
            return res.status(400).json({ success: false, message: 'Invalid discount type (must be fixed or percentage)' });
        }

        // Authorization check for high discounts (> 20%)
        const isHighDiscount = (type === 'percentage' && numVal > 20) || (type === 'fixed' && discountAmt > subtotal * 0.2);
        if (isHighDiscount && !canApproveHighDiscount(req.user)) {
            return res.status(403).json({
                success: false,
                message: 'Discount exceeds 20% limit. Approval by Manager or Accountant is required.'
            });
        }

        const newTotalDiscount = invoice.pricing.orderDiscount + invoice.pricing.invoiceDiscount + discountAmt;
        if (newTotalDiscount > invoice.pricing.grossAmount) {
            return res.status(400).json({ success: false, message: 'Total discount cannot exceed invoice gross amount' });
        }

        const newNetAmount = Math.max(0, invoice.pricing.grossAmount - newTotalDiscount);
        if (newNetAmount < invoice.pricing.paidAmount) {
            return res.status(400).json({
                success: false,
                message: `Cannot apply discount: net amount (₹${newNetAmount}) would fall below already paid amount (₹${invoice.pricing.paidAmount})`
            });
        }

        invoice.pricing.invoiceDiscount += discountAmt;
        invoice.pricing.totalDiscount = newTotalDiscount;
        invoice.pricing.netAmount = newNetAmount;
        invoice.pricing.dueAmount = Math.max(0, newNetAmount - invoice.pricing.paidAmount);

        if (invoice.pricing.dueAmount === 0 && invoice.pricing.paidAmount > 0) {
            invoice.paymentStatus = 'PAID';
        }

        invoice.discounts.push({
            type,
            value: numVal,
            amount: discountAmt,
            reason: String(reason).trim(),
            appliedBy: req.user._id,
            approvedBy: isHighDiscount ? req.user._id : null,
            appliedAt: new Date()
        });
        invoice.updatedBy = req.user._id;

        await invoice.save();

        await LabFinancialAudit.create({
            hospitalId,
            action: isHighDiscount ? 'DISCOUNT_APPROVED' : 'DISCOUNT_APPLIED',
            entityType: 'LabInvoice',
            entityId: invoice._id,
            entityIdentifier: invoice.invoiceNumber,
            amount: discountAmt,
            details: { type, value: numVal, reason, newNetAmount, newDue: invoice.pricing.dueAmount },
            performedBy: req.user._id
        });

        res.json({
            success: true,
            message: 'Discount applied successfully',
            invoice
        });
    } catch (error) {
        console.error('[lab billing] apply discount error:', error);
        res.status(500).json({ success: false, message: 'Failed to apply discount: ' + error.message });
    }
});

// =========================================================================
// 3. PAYMENT APIS
// =========================================================================

/**
 * POST /api/lab/billing/payments
 * Record payment against an invoice. Supports Cash, UPI, Card, Advance Adjustment, etc.
 * Enforces overpayment prevention, idempotency, atomic updates, and cash register logging.
 */
router.post('/payments', verifyToken, verifyBillingAccess, async (req, res) => {
    try {
        const {
            invoiceId,
            amount,
            paymentMethod = 'Cash',
            transactionReference = '',
            notes = '',
            idempotencyKey = null
        } = req.body;
        const hospitalId = req.hospitalId;

        if (!invoiceId || amount === undefined || amount === null) {
            return res.status(400).json({ success: false, message: 'Invoice ID and payment amount are required' });
        }

        const payAmount = Number(amount);
        if (isNaN(payAmount) || payAmount <= 0) {
            return res.status(400).json({ success: false, message: 'Payment amount must be a positive number greater than 0' });
        }

        // Idempotency protection against duplicate submissions
        if (idempotencyKey) {
            const duplicate = await LabPayment.findOne({ hospitalId, idempotencyKey });
            if (duplicate) {
                const currentInv = await LabInvoice.findById(duplicate.invoiceId);
                return res.json({
                    success: true,
                    message: 'Payment already processed (idempotency hit)',
                    payment: duplicate,
                    invoice: currentInv
                });
            }
        }

        const invoice = await LabInvoice.findOne({ _id: invoiceId, hospitalId, status: 'ACTIVE' });
        if (!invoice) {
            return res.status(404).json({ success: false, message: 'Active invoice not found or does not belong to this tenant' });
        }

        if (invoice.pricing.dueAmount <= 0) {
            return res.status(400).json({ success: false, message: 'Invoice is already fully paid. No outstanding balance.' });
        }

        // Strict overpayment protection
        if (payAmount > invoice.pricing.dueAmount) {
            return res.status(400).json({
                success: false,
                message: `Overpayment not allowed: amount (₹${payAmount}) exceeds outstanding due (₹${invoice.pricing.dueAmount}). Additional funds should be deposited as patient advance.`
            });
        }

        // If paying via Patient Advance, verify patient advance ledger
        if (paymentMethod === 'Advance Adjustment') {
            const availableAdvance = await LabAdvanceLedger.getAvailableBalance(hospitalId, invoice.patientId);
            if (availableAdvance < payAmount) {
                return res.status(400).json({
                    success: false,
                    message: `Insufficient advance balance: available ₹${availableAdvance}, requested ₹${payAmount}`
                });
            }
        }

        const hospital = await Hospital.findById(hospitalId);
        const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const paymentNumber = await generateAtomicPaymentNumber(hospitalId, hospital, todayStr);

        const previousDue = invoice.pricing.dueAmount;
        const remainingDue = Math.max(0, previousDue - payAmount);

        // Record payment transaction
        const payment = new LabPayment({
            hospitalId,
            paymentNumber,
            invoiceId: invoice._id,
            invoiceNumber: invoice.invoiceNumber,
            orderId: invoice.orderId,
            orderNumber: invoice.orderNumber,
            patientId: invoice.patientId,
            patientSnapshot: {
                name: invoice.patientSnapshot?.name || '',
                uhid: invoice.patientSnapshot?.uhid || '',
                phone: invoice.patientSnapshot?.phone || ''
            },
            amount: payAmount,
            paymentMethod,
            transactionReference,
            paymentStatus: 'SUCCESS',
            previousDue,
            remainingDue,
            locationId: invoice.locationId || null,
            receivedBy: req.user._id,
            receivedByName: req.user.name || 'Lab Staff',
            idempotencyKey: idempotencyKey || null,
            notes,
            paymentDate: new Date()
        });

        await payment.save();

        // Update invoice financial state
        invoice.pricing.paidAmount += payAmount;
        invoice.pricing.dueAmount = remainingDue;
        invoice.paymentStatus = (remainingDue === 0 ? 'PAID' : 'PARTIALLY_PAID');
        invoice.updatedBy = req.user._id;
        await invoice.save();

        // If Advance Adjustment, record entry in LabAdvanceLedger
        if (paymentMethod === 'Advance Adjustment') {
            const currentAdv = await LabAdvanceLedger.getAvailableBalance(hospitalId, invoice.patientId);
            const newAdvBalance = Math.max(0, currentAdv - payAmount);
            await LabAdvanceLedger.create({
                hospitalId,
                patientId: invoice.patientId,
                type: 'ADJUSTMENT',
                amount: payAmount,
                balanceAfter: newAdvBalance,
                paymentMethod: 'Advance Adjustment',
                invoiceId: invoice._id,
                paymentId: payment._id,
                notes: `Applied to invoice ${invoice.invoiceNumber}`,
                createdBy: req.user._id
            });
        }

        // If Cash payment, update open cash register if available
        if (paymentMethod === 'Cash') {
            await LabCashRegister.findOneAndUpdate(
                { hospitalId, staffId: req.user._id, dateStr: todayStr, status: 'OPEN' },
                {
                    $inc: { cashReceived: payAmount, expectedClosingBalance: payAmount }
                }
            );
        }

        // Audit Log
        await LabFinancialAudit.create({
            hospitalId,
            action: 'PAYMENT_RECORDED',
            entityType: 'LabPayment',
            entityId: payment._id,
            entityIdentifier: paymentNumber,
            amount: payAmount,
            details: { invoiceNumber: invoice.invoiceNumber, paymentMethod, remainingDue },
            performedBy: req.user._id
        });

        res.status(201).json({
            success: true,
            message: 'Payment recorded successfully',
            payment,
            invoice
        });
    } catch (error) {
        console.error('[lab billing] record payment error:', error);
        res.status(500).json({ success: false, message: 'Failed to record payment: ' + error.message });
    }
});

/**
 * GET /api/lab/billing/payments
 * List payments with server-side pagination and filters.
 */
router.get('/payments', verifyToken, verifyBillingAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId;
        const {
            page = 1,
            limit = 20,
            search = '',
            paymentMethod = '',
            period = '',
            startDate = '',
            endDate = ''
        } = req.query;

        const query = { hospitalId };

        if (paymentMethod) {
            query.paymentMethod = paymentMethod;
        }

        const dateQuery = buildDateRangeQuery(period, startDate, endDate, 'paymentDate');
        if (dateQuery) {
            Object.assign(query, dateQuery);
        }

        if (search) {
            const regex = new RegExp(search.trim(), 'i');
            query.$or = [
                { paymentNumber: regex },
                { invoiceNumber: regex },
                { orderNumber: regex },
                { transactionReference: regex },
                { 'patientSnapshot.name': regex },
                { 'patientSnapshot.uhid': regex },
                { 'patientSnapshot.phone': regex }
            ];
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const [payments, total] = await Promise.all([
            LabPayment.find(query)
                .sort({ paymentDate: -1 })
                .skip(skip)
                .limit(parseInt(limit))
                .lean(),
            LabPayment.countDocuments(query)
        ]);

        res.json({
            success: true,
            payments,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        console.error('[lab billing] get payments error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch payments: ' + error.message });
    }
});

/**
 * GET /api/lab/billing/payments/:id/receipt
 * Printable payment receipt data with hospital branding and audit references.
 */
router.get('/payments/:id/receipt', verifyToken, verifyBillingAccess, async (req, res) => {
    try {
        const { id } = req.params;
        const hospitalId = req.hospitalId;

        const [payment, hospital] = await Promise.all([
            LabPayment.findOne({ _id: id, hospitalId }).lean(),
            Hospital.findById(hospitalId).select('name code address phone email logo gstin').lean()
        ]);

        if (!payment) {
            return res.status(404).json({ success: false, message: 'Payment transaction not found' });
        }

        const invoice = await LabInvoice.findById(payment.invoiceId).select('invoiceNumber items pricing paymentStatus').lean();

        res.json({
            success: true,
            receiptData: {
                hospital: {
                    name: hospital?.name || 'Medical365 Laboratory',
                    code: hospital?.code || '',
                    address: hospital?.address || 'Healthcare City, India',
                    phone: hospital?.phone || '',
                    email: hospital?.email || '',
                    gstin: hospital?.gstin || ''
                },
                payment,
                invoice
            }
        });
    } catch (error) {
        console.error('[lab billing] get payment receipt error:', error);
        res.status(500).json({ success: false, message: 'Failed to generate payment receipt: ' + error.message });
    }
});

// =========================================================================
// 4. ADVANCE PAYMENT APIS
// =========================================================================

/**
 * GET /api/lab/billing/advances/:patientId
 * Get patient's current available advance balance and transaction ledger.
 */
router.get('/advances/:patientId', verifyToken, verifyBillingAccess, async (req, res) => {
    try {
        const { patientId } = req.params;
        const hospitalId = req.hospitalId;

        const [balance, ledger] = await Promise.all([
            LabAdvanceLedger.getAvailableBalance(hospitalId, patientId),
            LabAdvanceLedger.find({ hospitalId, patientId }).sort({ createdAt: -1 }).limit(50).lean()
        ]);

        res.json({
            success: true,
            patientId,
            availableBalance: balance,
            ledger
        });
    } catch (error) {
        console.error('[lab billing] get advance balance error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch advance ledger: ' + error.message });
    }
});

/**
 * POST /api/lab/billing/advances
 * Deposit advance payment for a patient.
 */
router.post('/advances', verifyToken, verifyBillingAccess, async (req, res) => {
    try {
        const {
            patientId,
            amount,
            paymentMethod = 'Cash',
            transactionReference = '',
            notes = ''
        } = req.body;
        const hospitalId = req.hospitalId;

        if (!patientId || !amount) {
            return res.status(400).json({ success: false, message: 'Patient ID and deposit amount are required' });
        }

        const depositAmt = Number(amount);
        if (isNaN(depositAmt) || depositAmt <= 0) {
            return res.status(400).json({ success: false, message: 'Deposit amount must be a positive number' });
        }

        const patient = await User.findOne({ _id: patientId, hospitalId });
        if (!patient) {
            return res.status(404).json({ success: false, message: 'Patient not found in this laboratory tenant' });
        }

        const currentBalance = await LabAdvanceLedger.getAvailableBalance(hospitalId, patientId);
        const newBalance = currentBalance + depositAmt;

        const ledgerEntry = new LabAdvanceLedger({
            hospitalId,
            patientId,
            type: 'DEPOSIT',
            amount: depositAmt,
            balanceAfter: newBalance,
            paymentMethod,
            transactionReference,
            notes,
            createdBy: req.user._id
        });

        await ledgerEntry.save();

        // Update cash register if cash deposit
        if (paymentMethod === 'Cash') {
            const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
            await LabCashRegister.findOneAndUpdate(
                { hospitalId, staffId: req.user._id, dateStr: todayStr, status: 'OPEN' },
                { $inc: { cashReceived: depositAmt, expectedClosingBalance: depositAmt } }
            );
        }

        await LabFinancialAudit.create({
            hospitalId,
            action: 'ADVANCE_DEPOSITED',
            entityType: 'LabAdvanceLedger',
            entityId: ledgerEntry._id,
            entityIdentifier: `ADV-${patientId}`,
            amount: depositAmt,
            details: { patientName: patient.name, balanceAfter: newBalance, paymentMethod },
            performedBy: req.user._id
        });

        res.status(201).json({
            success: true,
            message: 'Advance payment deposited successfully',
            availableBalance: newBalance,
            ledgerEntry
        });
    } catch (error) {
        console.error('[lab billing] deposit advance error:', error);
        res.status(500).json({ success: false, message: 'Failed to deposit advance: ' + error.message });
    }
});

// =========================================================================
// 5. REFUND APIS
// =========================================================================

/**
 * POST /api/lab/billing/refunds
 * Process full or partial refund against a successful payment.
 * Requires refund permission/authorization and prevents excess refunding.
 */
router.post('/refunds', verifyToken, verifyBillingAccess, async (req, res) => {
    try {
        const {
            paymentId,
            amount,
            refundMethod = 'Cash',
            reason,
            notes = ''
        } = req.body;
        const hospitalId = req.hospitalId;

        if (!paymentId || amount === undefined || !reason) {
            return res.status(400).json({ success: false, message: 'Payment ID, refund amount, and reason are required' });
        }

        if (!canProcessRefund(req.user)) {
            return res.status(403).json({ success: false, message: 'Access denied: Refund processing authorization required' });
        }

        const refundAmt = Number(amount);
        if (isNaN(refundAmt) || refundAmt <= 0) {
            return res.status(400).json({ success: false, message: 'Refund amount must be a positive number' });
        }

        const payment = await LabPayment.findOne({ _id: paymentId, hospitalId, paymentStatus: 'SUCCESS' });
        if (!payment) {
            return res.status(404).json({ success: false, message: 'Successful payment transaction not found for refund' });
        }

        const alreadyRefunded = Number(payment.refundedAmount || 0);
        const maxRefundable = Math.max(0, payment.amount - alreadyRefunded);

        if (refundAmt > maxRefundable) {
            return res.status(400).json({
                success: false,
                message: `Refund amount (₹${refundAmt}) exceeds max refundable amount (₹${maxRefundable}) on this payment transaction`
            });
        }

        const invoice = await LabInvoice.findOne({ _id: payment.invoiceId, hospitalId });
        if (!invoice) {
            return res.status(404).json({ success: false, message: 'Linked invoice not found' });
        }

        const hospital = await Hospital.findById(hospitalId);
        const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const refundNumber = await generateAtomicRefundNumber(hospitalId, hospital, todayStr);

        // Create refund record
        const refund = new LabRefund({
            hospitalId,
            refundNumber,
            invoiceId: invoice._id,
            invoiceNumber: invoice.invoiceNumber,
            paymentId: payment._id,
            paymentNumber: payment.paymentNumber,
            patientId: invoice.patientId,
            amount: refundAmt,
            refundMethod,
            reason: String(reason).trim(),
            status: 'APPROVED',
            processedBy: req.user._id,
            approvedBy: req.user._id,
            refundDate: new Date(),
            notes
        });

        await refund.save();

        // Update payment transaction refundedAmount
        payment.refundedAmount = alreadyRefunded + refundAmt;
        await payment.save();

        // Update invoice pricing and status
        invoice.pricing.refundedAmount = (invoice.pricing.refundedAmount || 0) + refundAmt;
        invoice.pricing.paidAmount = Math.max(0, invoice.pricing.paidAmount - refundAmt);
        invoice.pricing.dueAmount = Math.max(0, invoice.pricing.netAmount - invoice.pricing.paidAmount);

        if (invoice.pricing.refundedAmount >= invoice.pricing.netAmount) {
            invoice.refundStatus = 'FULLY_REFUNDED';
        } else {
            invoice.refundStatus = 'PARTIALLY_REFUNDED';
        }

        if (invoice.pricing.paidAmount === 0) {
            invoice.paymentStatus = 'UNPAID';
        } else if (invoice.pricing.dueAmount > 0) {
            invoice.paymentStatus = 'PARTIALLY_PAID';
        } else {
            invoice.paymentStatus = 'PAID';
        }

        invoice.updatedBy = req.user._id;
        await invoice.save();

        // If Cash refund, update active open cash register
        if (refundMethod === 'Cash') {
            await LabCashRegister.findOneAndUpdate(
                { hospitalId, staffId: req.user._id, dateStr: todayStr, status: 'OPEN' },
                {
                    $inc: { cashRefunds: refundAmt, expectedClosingBalance: -refundAmt }
                }
            );
        }

        await LabFinancialAudit.create({
            hospitalId,
            action: 'REFUND_PROCESSED',
            entityType: 'LabRefund',
            entityId: refund._id,
            entityIdentifier: refundNumber,
            amount: refundAmt,
            details: { paymentNumber: payment.paymentNumber, invoiceNumber: invoice.invoiceNumber, reason },
            performedBy: req.user._id
        });

        res.status(201).json({
            success: true,
            message: 'Refund processed successfully',
            refund,
            invoice
        });
    } catch (error) {
        console.error('[lab billing] process refund error:', error);
        res.status(500).json({ success: false, message: 'Failed to process refund: ' + error.message });
    }
});

/**
 * GET /api/lab/billing/refunds
 * List refunds with pagination.
 */
router.get('/refunds', verifyToken, verifyBillingAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId;
        const { page = 1, limit = 20, period = '', startDate = '', endDate = '' } = req.query;

        const query = { hospitalId };
        const dateQuery = buildDateRangeQuery(period, startDate, endDate, 'refundDate');
        if (dateQuery) {
            Object.assign(query, dateQuery);
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const [refunds, total] = await Promise.all([
            LabRefund.find(query).sort({ refundDate: -1 }).skip(skip).limit(parseInt(limit)).lean(),
            LabRefund.countDocuments(query)
        ]);

        res.json({
            success: true,
            refunds,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        console.error('[lab billing] get refunds error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch refunds: ' + error.message });
    }
});

// =========================================================================
// 6. CASH REGISTER APIS
// =========================================================================

/**
 * GET /api/lab/billing/cash-register
 * Get current active cash register for the logged in staff member.
 */
router.get('/cash-register', verifyToken, verifyBillingAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId;
        const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');

        let register = await LabCashRegister.findOne({
            hospitalId,
            staffId: req.user._id,
            dateStr: todayStr,
            status: 'OPEN'
        }).lean();

        if (!register) {
            // Find latest closed register or return null
            register = await LabCashRegister.findOne({
                hospitalId,
                staffId: req.user._id,
                dateStr: todayStr
            }).sort({ createdAt: -1 }).lean();
        }

        res.json({
            success: true,
            register
        });
    } catch (error) {
        console.error('[lab billing] get cash register error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch cash register: ' + error.message });
    }
});

/**
 * POST /api/lab/billing/cash-register/open
 * Open a new shift cash register for today.
 */
router.post('/cash-register/open', verifyToken, verifyBillingAccess, async (req, res) => {
    try {
        const { openingBalance = 0, locationId = null, notes = '' } = req.body;
        const hospitalId = req.hospitalId;
        const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');

        const existing = await LabCashRegister.findOne({
            hospitalId,
            staffId: req.user._id,
            dateStr: todayStr,
            status: 'OPEN'
        });

        if (existing) {
            return res.status(400).json({
                success: false,
                message: 'A cash register is already open for your shift today',
                register: existing
            });
        }

        const openAmt = Number(openingBalance) || 0;

        const register = new LabCashRegister({
            hospitalId,
            locationId,
            staffId: req.user._id,
            staffName: req.user.name || 'Lab Staff',
            dateStr: todayStr,
            openingBalance: openAmt,
            cashReceived: 0,
            cashRefunds: 0,
            cashAdjustments: 0,
            expectedClosingBalance: openAmt,
            status: 'OPEN',
            openedAt: new Date(),
            closingNotes: notes
        });

        await register.save();

        await LabFinancialAudit.create({
            hospitalId,
            action: 'CASH_REGISTER_OPENED',
            entityType: 'LabCashRegister',
            entityId: register._id,
            entityIdentifier: `CR-${todayStr}`,
            amount: openAmt,
            details: { openingBalance: openAmt, staffName: req.user.name },
            performedBy: req.user._id
        });

        res.status(201).json({
            success: true,
            message: 'Cash register opened successfully',
            register
        });
    } catch (error) {
        console.error('[lab billing] open cash register error:', error);
        res.status(500).json({ success: false, message: 'Failed to open cash register: ' + error.message });
    }
});

/**
 * POST /api/lab/billing/cash-register/close
 * Close active cash register shift with actual physical balance reconciliation.
 */
router.post('/cash-register/close', verifyToken, verifyBillingAccess, async (req, res) => {
    try {
        const { actualClosingBalance, closingNotes = '' } = req.body;
        const hospitalId = req.hospitalId;
        const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');

        if (actualClosingBalance === undefined || actualClosingBalance === null) {
            return res.status(400).json({ success: false, message: 'Actual closing balance counted is required' });
        }

        const register = await LabCashRegister.findOne({
            hospitalId,
            staffId: req.user._id,
            dateStr: todayStr,
            status: 'OPEN'
        });

        if (!register) {
            return res.status(404).json({ success: false, message: 'No active open cash register found to close' });
        }

        const actual = Number(actualClosingBalance);
        const expected = register.openingBalance + register.cashReceived - register.cashRefunds + register.cashAdjustments;
        const discrepancy = actual - expected;

        register.expectedClosingBalance = expected;
        register.actualClosingBalance = actual;
        register.discrepancy = discrepancy;
        register.status = 'CLOSED';
        register.closedAt = new Date();
        register.closedBy = req.user._id;
        register.closingNotes = closingNotes;

        await register.save();

        await LabFinancialAudit.create({
            hospitalId,
            action: 'CASH_REGISTER_CLOSED',
            entityType: 'LabCashRegister',
            entityId: register._id,
            entityIdentifier: `CR-${todayStr}`,
            amount: actual,
            details: { expected, actual, discrepancy, closingNotes },
            performedBy: req.user._id
        });

        res.json({
            success: true,
            message: 'Cash register closed and reconciled successfully',
            register
        });
    } catch (error) {
        console.error('[lab billing] close cash register error:', error);
        res.status(500).json({ success: false, message: 'Failed to close cash register: ' + error.message });
    }
});

// =========================================================================
// 7. DASHBOARD & FINANCIAL REPORT APIS
// =========================================================================

/**
 * GET /api/lab/billing/dashboard
 * Live billing dashboard summary with server-aggregated financial KPIs.
 */
router.get('/dashboard', verifyToken, verifyBillingAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId;
        const { period = 'today', startDate = '', endDate = '' } = req.query;

        const invoiceDateQuery = buildDateRangeQuery(period, startDate, endDate, 'createdAt') || {};
        const paymentDateQuery = buildDateRangeQuery(period, startDate, endDate, 'paymentDate') || {};
        const refundDateQuery = buildDateRangeQuery(period, startDate, endDate, 'refundDate') || {};

        // Invoices Aggregation
        const invoiceAgg = await LabInvoice.aggregate([
            { $match: { hospitalId: new mongoose.Types.ObjectId(hospitalId), status: 'ACTIVE', ...invoiceDateQuery } },
            {
                $group: {
                    _id: null,
                    totalGross: { $sum: '$pricing.grossAmount' },
                    totalDiscount: { $sum: '$pricing.totalDiscount' },
                    totalNet: { $sum: '$pricing.netAmount' },
                    totalDue: { $sum: '$pricing.dueAmount' },
                    count: { $sum: 1 },
                    paidCount: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'PAID'] }, 1, 0] } },
                    partiallyPaidCount: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'PARTIALLY_PAID'] }, 1, 0] } },
                    unpaidCount: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'UNPAID'] }, 1, 0] } }
                }
            }
        ]);

        // Payments Aggregation by Method
        const paymentAgg = await LabPayment.aggregate([
            { $match: { hospitalId: new mongoose.Types.ObjectId(hospitalId), paymentStatus: 'SUCCESS', ...paymentDateQuery } },
            {
                $group: {
                    _id: '$paymentMethod',
                    total: { $sum: '$amount' },
                    count: { $sum: 1 }
                }
            }
        ]);

        let totalCollection = 0;
        let cashCollection = 0;
        let upiCollection = 0;
        let cardCollection = 0;
        let bankCollection = 0;
        let advanceAdjustmentCollection = 0;
        let otherCollection = 0;

        paymentAgg.forEach(p => {
            totalCollection += p.total;
            const method = String(p._id).toLowerCase();
            if (method.includes('cash')) cashCollection += p.total;
            else if (method.includes('upi')) upiCollection += p.total;
            else if (method.includes('card')) cardCollection += p.total;
            else if (method.includes('bank')) bankCollection += p.total;
            else if (method.includes('advance')) advanceAdjustmentCollection += p.total;
            else otherCollection += p.total;
        });

        // Refunds Aggregation
        const refundAgg = await LabRefund.aggregate([
            { $match: { hospitalId: new mongoose.Types.ObjectId(hospitalId), status: 'APPROVED', ...refundDateQuery } },
            {
                $group: {
                    _id: null,
                    totalRefund: { $sum: '$amount' },
                    count: { $sum: 1 }
                }
            }
        ]);

        const totalRefundAmount = refundAgg[0]?.totalRefund || 0;
        const netCollection = Math.max(0, totalCollection - totalRefundAmount);

        const invStats = invoiceAgg[0] || {
            totalGross: 0,
            totalDiscount: 0,
            totalNet: 0,
            totalDue: 0,
            count: 0,
            paidCount: 0,
            partiallyPaidCount: 0,
            unpaidCount: 0
        };

        // Recent Invoices & Payments for feed
        const [recentInvoices, recentPayments] = await Promise.all([
            LabInvoice.find({ hospitalId, status: 'ACTIVE' }).sort({ createdAt: -1 }).limit(5).lean(),
            LabPayment.find({ hospitalId, paymentStatus: 'SUCCESS' }).sort({ paymentDate: -1 }).limit(5).lean()
        ]);

        res.json({
            success: true,
            period,
            metrics: {
                totalBilledGross: invStats.totalGross,
                totalDiscountGiven: invStats.totalDiscount,
                totalBilledNet: invStats.totalNet,
                totalOutstandingDue: invStats.totalDue,
                totalCollection,
                cashCollection,
                upiCollection,
                cardCollection,
                bankCollection,
                advanceAdjustmentCollection,
                otherCollection,
                totalRefunds: totalRefundAmount,
                netCollection,
                invoiceCounts: {
                    total: invStats.count,
                    paid: invStats.paidCount,
                    partiallyPaid: invStats.partiallyPaidCount,
                    unpaid: invStats.unpaidCount
                }
            },
            recentInvoices,
            recentPayments
        });
    } catch (error) {
        console.error('[lab billing] dashboard metrics error:', error);
        res.status(500).json({ success: false, message: 'Failed to generate billing metrics: ' + error.message });
    }
});

/**
 * GET /api/lab/billing/reports/collections
 * Collection report grouped by date.
 */
router.get('/reports/collections', verifyToken, verifyBillingAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId;
        const { period = 'month', startDate = '', endDate = '' } = req.query;

        const dateQuery = buildDateRangeQuery(period, startDate, endDate, 'paymentDate') || {};

        const data = await LabPayment.aggregate([
            { $match: { hospitalId: new mongoose.Types.ObjectId(hospitalId), paymentStatus: 'SUCCESS', ...dateQuery } },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m-%d', date: '$paymentDate' } },
                    totalAmount: { $sum: '$amount' },
                    count: { $sum: 1 },
                    cash: { $sum: { $cond: [{ $regexMatch: { input: '$paymentMethod', regex: /cash/i } }, '$amount', 0] } },
                    upi: { $sum: { $cond: [{ $regexMatch: { input: '$paymentMethod', regex: /upi/i } }, '$amount', 0] } },
                    card: { $sum: { $cond: [{ $regexMatch: { input: '$paymentMethod', regex: /card/i } }, '$amount', 0] } },
                    other: { $sum: { $cond: [{ $regexMatch: { input: '$paymentMethod', regex: /(bank|advance|other)/i } }, '$amount', 0] } }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        res.json({
            success: true,
            period,
            collections: data.map(d => ({
                date: d._id,
                totalAmount: d.totalAmount,
                transactionCount: d.count,
                cash: d.cash,
                upi: d.upi,
                card: d.card,
                other: d.other
            }))
        });
    } catch (error) {
        console.error('[lab billing] collection report error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch collection report: ' + error.message });
    }
});

/**
 * GET /api/lab/billing/reports/staff
 * Staff-wise collections aggregation.
 */
router.get('/reports/staff', verifyToken, verifyBillingAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId;
        const { period = 'month', startDate = '', endDate = '' } = req.query;

        const dateQuery = buildDateRangeQuery(period, startDate, endDate, 'paymentDate') || {};

        const data = await LabPayment.aggregate([
            { $match: { hospitalId: new mongoose.Types.ObjectId(hospitalId), paymentStatus: 'SUCCESS', ...dateQuery } },
            {
                $group: {
                    _id: '$receivedBy',
                    staffName: { $first: '$receivedByName' },
                    totalAmount: { $sum: '$amount' },
                    count: { $sum: 1 },
                    cashAmount: { $sum: { $cond: [{ $regexMatch: { input: '$paymentMethod', regex: /cash/i } }, '$amount', 0] } },
                    digitalAmount: { $sum: { $cond: [{ $not: [{ $regexMatch: { input: '$paymentMethod', regex: /cash/i } }] }, '$amount', 0] } }
                }
            },
            { $sort: { totalAmount: -1 } }
        ]);

        res.json({
            success: true,
            staffCollections: data.map(d => ({
                staffId: d._id,
                staffName: d.staffName || 'Staff',
                totalCollected: d.totalAmount,
                transactionCount: d.count,
                cashCollected: d.cashAmount,
                digitalCollected: d.digitalAmount
            }))
        });
    } catch (error) {
        console.error('[lab billing] staff report error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch staff collection report: ' + error.message });
    }
});

module.exports = router;
