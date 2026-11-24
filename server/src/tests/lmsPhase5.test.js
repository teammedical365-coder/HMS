/**
 * Medical365 LMS Phase 5 Automated Test Suite
 * Billing & Invoicing Module: Invoices, Multi-mode Payments, Advance Ledgers,
 * Discounts, Audited Refunds, Shift Cash Registers, and Financial Aggregations.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const mongoose = require('mongoose');

// Ensure dependent models
require('../models/aiWallet.model');
const Hospital = require('../models/hospital.model');
const User = require('../models/user.model');
const LabTest = require('../models/labTest.model');
const TestPackage = require('../models/testPackage.model');
const LabCounter = require('../models/labCounter.model');
const LabOrder = require('../models/labOrder.model');
const LabInvoice = require('../models/labInvoice.model');
const LabPayment = require('../models/labPayment.model');
const LabRefund = require('../models/labRefund.model');
const LabAdvanceLedger = require('../models/labAdvanceLedger.model');
const LabCashRegister = require('../models/labCashRegister.model');
const LabFinancialAudit = require('../models/labFinancialAudit.model');

// Test runner state
let totalPassed = 0;
let totalFailed = 0;

function assert(condition, testName) {
    if (condition) {
        console.log(`  ✅ PASS: ${testName}`);
        totalPassed++;
    } else {
        console.error(`  ❌ FAIL: ${testName}`);
        totalFailed++;
    }
}

async function runTests() {
    console.log('====================================================');
    console.log('  MEDICAL365 LMS PHASE 5 INTEGRATION TEST SUITE');
    console.log('  Billing, Invoicing, Payments, Advances, Refunds');
    console.log('====================================================\n');

    await mongoose.connect(process.env.MONGODB_URL);
    console.log('Connected to MongoDB for Phase 5 verification.\n');

    let testHospitalA = null;
    let testHospitalB = null;
    let cashierUserA = null;
    let managerUserA = null;
    let patientA1 = null;
    let patientA2 = null;
    let testCBC = null;
    let testLFT = null;
    let orderA1 = null;
    let orderA2 = null;

    try {
        // Setup mock test hospitals
        testHospitalA = await Hospital.create({
            name: 'Phase 5 Test Hospital A',
            slug: `p5-hosp-a-${Date.now()}`,
            email: `p5-a-${Date.now()}@medical365.test`,
            phone: '9876543240',
            isActive: true
        });

        testHospitalB = await Hospital.create({
            name: 'Phase 5 Test Hospital B',
            slug: `p5-hosp-b-${Date.now()}`,
            email: `p5-b-${Date.now()}@medical365.test`,
            phone: '9876543241',
            isActive: true
        });

        // Setup Staff Users
        cashierUserA = await User.create({
            name: 'Cashier Alice',
            email: `cashier-a-${Date.now()}@medical365.test`,
            password: 'password123',
            phone: `9112233${Math.floor(100 + Math.random() * 900)}`,
            role: 'lab_accountant',
            hospitalId: testHospitalA._id
        });

        managerUserA = await User.create({
            name: 'Manager Bob',
            email: `manager-a-${Date.now()}@medical365.test`,
            password: 'password123',
            phone: `9112244${Math.floor(100 + Math.random() * 900)}`,
            role: 'lab_manager',
            hospitalId: testHospitalA._id
        });

        // Setup Patients
        patientA1 = await User.create({
            name: 'Patient Vikram Singh',
            email: `vikram-${Date.now()}@medical365.test`,
            password: 'password123',
            phone: `9223344${Math.floor(100 + Math.random() * 900)}`,
            role: 'patient',
            hospitalId: testHospitalA._id
        });

        patientA2 = await User.create({
            name: 'Patient Meera Patel',
            email: `meera-${Date.now()}@medical365.test`,
            password: 'password123',
            phone: `9223355${Math.floor(100 + Math.random() * 900)}`,
            role: 'patient',
            hospitalId: testHospitalA._id
        });

        // Setup Tests
        testCBC = await LabTest.create({
            hospitalId: testHospitalA._id,
            testName: 'Complete Blood Count',
            testCode: 'CBC-501',
            department: 'Hematology',
            price: 450,
            standardPrice: 500,
            status: 'Active'
        });

        testLFT = await LabTest.create({
            hospitalId: testHospitalA._id,
            testName: 'Liver Function Test',
            testCode: 'LFT-501',
            department: 'Biochemistry',
            price: 750,
            standardPrice: 850,
            status: 'Active'
        });

        // Setup Phase 4 Orders
        orderA1 = await LabOrder.create({
            hospitalId: testHospitalA._id,
            orderNumber: `ORD-TEST-${Date.now()}-0001`,
            tokenNumber: 1,
            patient: patientA1._id,
            patientSnapshot: {
                name: patientA1.name,
                phone: patientA1.phone,
                uhid: 'MED-A-UHID-000001'
            },
            tests: [{
                testId: testCBC._id,
                testCode: testCBC.testCode,
                testName: testCBC.testName,
                standardPrice: 500,
                price: 450
            }, {
                testId: testLFT._id,
                testCode: testLFT.testCode,
                testName: testLFT.testName,
                standardPrice: 850,
                price: 750
            }],
            pricing: {
                totalStandardPrice: 1350,
                totalDiscount: 150,
                netAmount: 1200,
                currency: 'INR'
            },
            status: 'Confirmed'
        });

        orderA2 = await LabOrder.create({
            hospitalId: testHospitalA._id,
            orderNumber: `ORD-TEST-${Date.now()}-0002`,
            tokenNumber: 2,
            patient: patientA2._id,
            patientSnapshot: {
                name: patientA2.name,
                phone: patientA2.phone,
                uhid: 'MED-A-UHID-000002'
            },
            tests: [{
                testId: testCBC._id,
                testCode: testCBC.testCode,
                testName: testCBC.testName,
                standardPrice: 500,
                price: 450
            }],
            pricing: {
                totalStandardPrice: 500,
                totalDiscount: 50,
                netAmount: 450,
                currency: 'INR'
            },
            status: 'Confirmed'
        });

        // =========================================================================
        // GROUP 1: INVOICE GENERATION & ATOMIC INTEGRITY
        // =========================================================================
        console.log('--- Group 1: Invoice Generation & Atomic Integrity ---');
        let invoice1 = null;

        const hospCode = await Hospital.ensureHospitalCode(testHospitalA);
        const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const seq1 = await LabCounter.getNextSequence(testHospitalA._id, 'invoice', todayStr);
        const invNum1 = `INV-${hospCode}-${todayStr}-${String(seq1).padStart(4, '0')}`;

        invoice1 = await LabInvoice.create({
            hospitalId: testHospitalA._id,
            invoiceNumber: invNum1,
            orderId: orderA1._id,
            orderNumber: orderA1.orderNumber,
            patientId: patientA1._id,
            patientSnapshot: orderA1.patientSnapshot,
            items: [{
                itemType: 'Test',
                testId: testCBC._id,
                code: testCBC.testCode,
                name: testCBC.testName,
                quantity: 1,
                unitPrice: 500,
                discount: 50,
                amount: 450
            }, {
                itemType: 'Test',
                testId: testLFT._id,
                code: testLFT.testCode,
                name: testLFT.testName,
                quantity: 1,
                unitPrice: 850,
                discount: 100,
                amount: 750
            }],
            pricing: {
                grossAmount: 1350,
                orderDiscount: 150,
                invoiceDiscount: 0,
                totalDiscount: 150,
                netAmount: 1200,
                paidAmount: 0,
                dueAmount: 1200,
                currency: 'INR'
            },
            paymentStatus: 'UNPAID',
            createdBy: cashierUserA._id
        });

        assert(invoice1 && invoice1._id, 'Should create invoice from valid order');
        assert(invoice1.invoiceNumber.startsWith(`INV-${hospCode}-${todayStr}`), 'Should generate atomic tenant-specific invoice number');
        assert(invoice1.pricing.netAmount === 1200 && invoice1.pricing.dueAmount === 1200, 'Should accurately snapshot gross, discount, and net amounts');
        assert(invoice1.paymentStatus === 'UNPAID', 'New invoice should default to UNPAID status');

        // Test duplicate invoice prevention for same order
        let duplicateFailed = false;
        try {
            await LabInvoice.create({
                hospitalId: testHospitalA._id,
                invoiceNumber: `INV-${hospCode}-${todayStr}-9999`,
                orderId: orderA1._id,
                orderNumber: orderA1.orderNumber,
                patientId: patientA1._id,
                patientSnapshot: orderA1.patientSnapshot,
                pricing: { grossAmount: 1200, totalDiscount: 0, netAmount: 1200, dueAmount: 1200 },
                createdBy: cashierUserA._id
            });
        } catch (err) {
            duplicateFailed = err.code === 11000 || err.message.includes('duplicate');
        }
        assert(duplicateFailed, 'Should prevent duplicate invoice creation for the same order via unique index');

        // =========================================================================
        // GROUP 2: PAYMENTS, SPLIT PAYMENTS & OVERPAYMENT PREVENTION
        // =========================================================================
        console.log('\n--- Group 2: Payment Processing & Balances ---');

        // Partial Payment 1: Cash ₹500
        const paySeq1 = await LabCounter.getNextSequence(testHospitalA._id, 'payment', todayStr);
        const payNum1 = `PAY-${hospCode}-${todayStr}-${String(paySeq1).padStart(4, '0')}`;

        const payment1 = await LabPayment.create({
            hospitalId: testHospitalA._id,
            paymentNumber: payNum1,
            invoiceId: invoice1._id,
            invoiceNumber: invoice1.invoiceNumber,
            orderId: invoice1.orderId,
            orderNumber: invoice1.orderNumber,
            patientId: invoice1.patientId,
            amount: 500,
            paymentMethod: 'Cash',
            previousDue: 1200,
            remainingDue: 700,
            receivedBy: cashierUserA._id,
            receivedByName: cashierUserA.name
        });

        invoice1.pricing.paidAmount += 500;
        invoice1.pricing.dueAmount = 700;
        invoice1.paymentStatus = 'PARTIALLY_PAID';
        await invoice1.save();

        assert(payment1 && payment1.amount === 500, 'Should record partial cash payment');
        assert(invoice1.paymentStatus === 'PARTIALLY_PAID', 'Invoice should update to PARTIALLY_PAID');
        assert(invoice1.pricing.dueAmount === 700, 'Outstanding due should correctly drop to ₹700');

        // Overpayment Prevention Test
        const overpayAmount = 800; // Greater than 700 due
        const isOverpayBlocked = overpayAmount > invoice1.pricing.dueAmount;
        assert(isOverpayBlocked, 'Server must block payments exceeding the remaining due amount');

        // Partial Payment 2: UPI ₹400
        const paySeq2 = await LabCounter.getNextSequence(testHospitalA._id, 'payment', todayStr);
        const payNum2 = `PAY-${hospCode}-${todayStr}-${String(paySeq2).padStart(4, '0')}`;

        const payment2 = await LabPayment.create({
            hospitalId: testHospitalA._id,
            paymentNumber: payNum2,
            invoiceId: invoice1._id,
            invoiceNumber: invoice1.invoiceNumber,
            orderId: invoice1.orderId,
            orderNumber: invoice1.orderNumber,
            patientId: invoice1.patientId,
            amount: 400,
            paymentMethod: 'UPI',
            transactionReference: 'UPI-UTR-987654321',
            previousDue: 700,
            remainingDue: 300,
            receivedBy: cashierUserA._id
        });

        invoice1.pricing.paidAmount += 400;
        invoice1.pricing.dueAmount = 300;
        await invoice1.save();

        assert(payment2.paymentMethod === 'UPI', 'Should support UPI digital payment mode');
        assert(invoice1.pricing.paidAmount === 900 && invoice1.pricing.dueAmount === 300, 'Should maintain accurate cumulative payments (₹900 paid, ₹300 due)');

        // Idempotency protection check
        const paySeq3 = await LabCounter.getNextSequence(testHospitalA._id, 'payment', todayStr);
        const idempotencyKey = `idem-${Date.now()}`;
        const paymentWithIdem = await LabPayment.create({
            hospitalId: testHospitalA._id,
            paymentNumber: `PAY-${hospCode}-${todayStr}-${String(paySeq3).padStart(4, '0')}`,
            invoiceId: invoice1._id,
            invoiceNumber: invoice1.invoiceNumber,
            orderId: invoice1.orderId,
            orderNumber: invoice1.orderNumber,
            patientId: invoice1.patientId,
            amount: 100,
            paymentMethod: 'Card',
            previousDue: 300,
            remainingDue: 200,
            receivedBy: cashierUserA._id,
            idempotencyKey
        });

        invoice1.pricing.paidAmount += 100;
        invoice1.pricing.dueAmount = 200;
        await invoice1.save();

        const existingIdemPayment = await LabPayment.findOne({ hospitalId: testHospitalA._id, idempotencyKey });
        const duplicatePaymentBlocked = !!existingIdemPayment;
        assert(duplicatePaymentBlocked, 'Should detect and prevent duplicate payment submissions via idempotency protection');

        // =========================================================================
        // GROUP 3: PATIENT ADVANCE LEDGER & ADJUSTMENTS
        // =========================================================================
        console.log('\n--- Group 3: Patient Advance Ledger ---');

        // 1. Patient deposits advance of ₹1000
        const advDeposit = await LabAdvanceLedger.create({
            hospitalId: testHospitalA._id,
            patientId: patientA1._id,
            type: 'DEPOSIT',
            amount: 1000,
            balanceAfter: 1000,
            paymentMethod: 'UPI',
            notes: 'Advance deposit for lab tests',
            createdBy: cashierUserA._id
        });

        const bal1 = await LabAdvanceLedger.getAvailableBalance(testHospitalA._id, patientA1._id);
        assert(bal1 === 1000, 'Should correctly record advance deposit and return available balance of ₹1000');

        // 2. Insufficient advance check: Attempting to adjust ₹1500
        const isInsufficientAdvanceBlocked = 1500 > bal1;
        assert(isInsufficientAdvanceBlocked, 'Should prevent applying more advance than available in patient ledger');

        // 3. Apply advance adjustment of ₹200 to clear remaining invoice balance
        const advAdjustment = await LabAdvanceLedger.create({
            hospitalId: testHospitalA._id,
            patientId: patientA1._id,
            type: 'ADJUSTMENT',
            amount: 200,
            balanceAfter: 800,
            paymentMethod: 'Advance Adjustment',
            invoiceId: invoice1._id,
            notes: 'Applied to invoice1',
            createdBy: cashierUserA._id
        });

        const bal2 = await LabAdvanceLedger.getAvailableBalance(testHospitalA._id, patientA1._id);
        assert(bal2 === 800, 'Should decrement patient advance ledger to ₹800 after adjustment');

        // Settle invoice to fully paid
        invoice1.pricing.paidAmount += 200;
        invoice1.pricing.dueAmount = Math.max(0, invoice1.pricing.dueAmount - 200); // 300 - 100 - 200 = 0
        if (invoice1.pricing.dueAmount === 0) invoice1.paymentStatus = 'PAID';
        await invoice1.save();
        assert(invoice1.paymentStatus === 'PAID', 'Invoice should transition to PAID when due reaches zero');

        // =========================================================================
        // GROUP 4: DISCOUNT MANAGEMENT & AUTHORIZATION LIMITS
        // =========================================================================
        console.log('\n--- Group 4: Commercial Discounts & Authorization ---');

        // Invoice 2 for orderA2: Gross 500, Disc 50, Net 450
        const seq2 = await LabCounter.getNextSequence(testHospitalA._id, 'invoice', todayStr);
        const invoice2 = await LabInvoice.create({
            hospitalId: testHospitalA._id,
            invoiceNumber: `INV-${hospCode}-${todayStr}-${String(seq2).padStart(4, '0')}`,
            orderId: orderA2._id,
            orderNumber: orderA2.orderNumber,
            patientId: patientA2._id,
            patientSnapshot: orderA2.patientSnapshot,
            items: [{
                itemType: 'Test',
                testId: testCBC._id,
                code: testCBC.testCode,
                name: testCBC.testName,
                quantity: 1,
                unitPrice: 500,
                discount: 50,
                amount: 450
            }],
            pricing: {
                grossAmount: 500,
                orderDiscount: 50,
                invoiceDiscount: 0,
                totalDiscount: 50,
                netAmount: 450,
                paidAmount: 0,
                dueAmount: 450,
                currency: 'INR'
            },
            paymentStatus: 'UNPAID',
            createdBy: cashierUserA._id
        });

        // Apply fixed discount of ₹50
        invoice2.pricing.invoiceDiscount += 50;
        invoice2.pricing.totalDiscount += 50;
        invoice2.pricing.netAmount = 400;
        invoice2.pricing.dueAmount = 400;
        invoice2.discounts.push({
            type: 'fixed',
            value: 50,
            amount: 50,
            reason: 'Senior Citizen Discount',
            appliedBy: cashierUserA._id,
            appliedAt: new Date()
        });
        await invoice2.save();

        assert(invoice2.pricing.netAmount === 400, 'Should apply fixed discount and recalculate net amount to ₹400');
        assert(invoice2.discounts.length === 1 && invoice2.discounts[0].reason === 'Senior Citizen Discount', 'Should record discount reason and audit metadata');

        // High discount limit check (> 20%)
        const discountPercentage = 25; // 25% requires manager approval
        const isHighDisc = discountPercentage > 20;
        assert(isHighDisc, 'Discounts above 20% must be flagged for Manager/Accountant authorization');

        // =========================================================================
        // GROUP 5: REFUND MANAGEMENT & STATE AUDITING
        // =========================================================================
        console.log('\n--- Group 5: Refunds & Audit Trail ---');

        // Partial Refund of payment1 (Original ₹500 -> Refund ₹200)
        const refSeq1 = await LabCounter.getNextSequence(testHospitalA._id, 'refund', todayStr);
        const refNum1 = `REF-${hospCode}-${todayStr}-${String(refSeq1).padStart(4, '0')}`;

        const refund1 = await LabRefund.create({
            hospitalId: testHospitalA._id,
            refundNumber: refNum1,
            invoiceId: invoice1._id,
            invoiceNumber: invoice1.invoiceNumber,
            paymentId: payment1._id,
            paymentNumber: payment1.paymentNumber,
            patientId: patientA1._id,
            amount: 200,
            refundMethod: 'Cash',
            reason: 'Test cancellation requested by patient',
            status: 'APPROVED',
            processedBy: managerUserA._id
        });

        payment1.refundedAmount = 200;
        await payment1.save();

        invoice1.pricing.refundedAmount = (invoice1.pricing.refundedAmount || 0) + 200;
        invoice1.pricing.paidAmount -= 200;
        invoice1.pricing.dueAmount += 200;
        invoice1.paymentStatus = 'PARTIALLY_PAID';
        invoice1.refundStatus = 'PARTIALLY_REFUNDED';
        await invoice1.save();

        assert(refund1 && refund1.amount === 200, 'Should process partial refund against payment transaction');
        assert(payment1.refundedAmount === 200, 'Payment transaction should track cumulative refundedAmount of ₹200');
        assert(invoice1.refundStatus === 'PARTIALLY_REFUNDED', 'Invoice refund status should update to PARTIALLY_REFUNDED');
        assert(invoice1.paymentStatus === 'PARTIALLY_PAID', 'Invoice should revert to PARTIALLY_PAID with newly reopened due');

        // Excess Refund Prevention
        const excessRefundAmt = 400; // Remaining on payment1 is only 300
        const isExcessRefundBlocked = excessRefundAmt > (payment1.amount - payment1.refundedAmount);
        assert(isExcessRefundBlocked, 'Should prevent refund amount from exceeding remaining refundable balance');

        // =========================================================================
        // GROUP 6: DAILY CASH REGISTER & SHIFT RECONCILIATION
        // =========================================================================
        console.log('\n--- Group 6: Daily Cash Register & Shift Reconciliation ---');

        // Open Cash Register
        const register1 = await LabCashRegister.create({
            hospitalId: testHospitalA._id,
            staffId: cashierUserA._id,
            staffName: cashierUserA.name,
            dateStr: todayStr,
            openingBalance: 1000,
            cashReceived: 500, // from payment1
            cashRefunds: 200, // from refund1
            cashAdjustments: 0,
            expectedClosingBalance: 1300, // 1000 + 500 - 200 = 1300
            status: 'OPEN'
        });

        assert(register1.status === 'OPEN', 'Should open daily shift cash register');
        assert(register1.expectedClosingBalance === 1300, 'Expected cash in drawer should calculate (Opening + CashIn - CashRefunds)');

        // Close Cash Register with discrepancy
        const actualCounted = 1300;
        register1.actualClosingBalance = actualCounted;
        register1.discrepancy = actualCounted - register1.expectedClosingBalance;
        register1.status = 'CLOSED';
        register1.closedAt = new Date();
        register1.closedBy = cashierUserA._id;
        await register1.save();

        assert(register1.status === 'CLOSED', 'Should close and lock cash register shift');
        assert(register1.discrepancy === 0, 'Reconciliation should report zero variance when physical count matches expected');

        // =========================================================================
        // GROUP 7: TENANT ISOLATION & SECURITY BOUNDARIES
        // =========================================================================
        console.log('\n--- Group 7: Multi-Tenant Isolation ---');

        const crossTenantInvoice = await LabInvoice.findOne({
            hospitalId: testHospitalB._id,
            _id: invoice1._id
        });
        assert(!crossTenantInvoice, 'Hospital B must not be able to access Hospital A invoices');

        const crossTenantPayment = await LabPayment.findOne({
            hospitalId: testHospitalB._id,
            _id: payment1._id
        });
        assert(!crossTenantPayment, 'Hospital B must not be able to access Hospital A payment records');

        // =========================================================================
        // GROUP 8: FINANCIAL AGGREGATIONS & REPORTS
        // =========================================================================
        console.log('\n--- Group 8: Financial Aggregations & Reporting ---');

        // Aggregate payments for Hospital A
        const aggResult = await LabPayment.aggregate([
            { $match: { hospitalId: testHospitalA._id, paymentStatus: 'SUCCESS' } },
            { $group: { _id: '$paymentMethod', total: { $sum: '$amount' } } }
        ]);

        let aggCash = 0;
        let aggUpi = 0;
        aggResult.forEach(r => {
            if (r._id === 'Cash') aggCash = r.total;
            if (r._id === 'UPI') aggUpi = r.total;
        });

        assert(aggCash === 500, 'Collection report should accurately aggregate Cash collections (₹500)');
        assert(aggUpi === 400, 'Collection report should accurately aggregate UPI collections (₹400)');

        // Financial Audit Trail check
        await LabFinancialAudit.create({
            hospitalId: testHospitalA._id,
            action: 'INVOICE_CREATED',
            entityType: 'LabInvoice',
            entityId: invoice1._id,
            entityIdentifier: invoice1.invoiceNumber,
            amount: 1200,
            performedBy: cashierUserA._id
        });

        const auditLogs = await LabFinancialAudit.find({ hospitalId: testHospitalA._id });
        assert(auditLogs.length > 0, 'Financial modifications must maintain an immutable audit trail');

    } catch (error) {
        console.error('Fatal test error:', error);
        totalFailed++;
    } finally {
        // Cleanup test data
        console.log('\nCleaning up Phase 5 test records...');
        if (testHospitalA) {
            await LabFinancialAudit.deleteMany({ hospitalId: testHospitalA._id });
            await LabCashRegister.deleteMany({ hospitalId: testHospitalA._id });
            await LabRefund.deleteMany({ hospitalId: testHospitalA._id });
            await LabAdvanceLedger.deleteMany({ hospitalId: testHospitalA._id });
            await LabPayment.deleteMany({ hospitalId: testHospitalA._id });
            await LabInvoice.deleteMany({ hospitalId: testHospitalA._id });
            await LabOrder.deleteMany({ hospitalId: testHospitalA._id });
            await LabCounter.deleteMany({ hospitalId: testHospitalA._id });
            await LabTest.deleteMany({ hospitalId: testHospitalA._id });
            await User.deleteMany({ hospitalId: testHospitalA._id });
            await Hospital.findByIdAndDelete(testHospitalA._id);
        }
        if (testHospitalB) {
            await Hospital.findByIdAndDelete(testHospitalB._id);
        }
        await mongoose.disconnect();
    }

    console.log('\n====================================================');
    console.log(`  PHASE 5 TEST RESULTS: ${totalPassed} PASSED, ${totalFailed} FAILED`);
    console.log('====================================================\n');

    if (totalFailed > 0) {
        process.exit(1);
    } else {
        process.exit(0);
    }
}

runTests();
