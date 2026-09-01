require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../src/db/db');
const AIWallet = require('../src/models/aiWallet.model');
const AIUsageLog = require('../src/models/aiUsageLog.model');
const Hospital = require('../src/models/hospital.model');
const aiWalletService = require('../src/services/ai/aiWallet.service');
const { calculateCost, getModelPricing } = require('../src/config/aiPricing.config');

async function runTests() {
    console.log('🧪 Starting Hospital AI Wallet & AI Credits System Tests...\n');

    // 1. Test Pricing Engine
    console.log('--- 1. Pricing Engine Test ---');
    const flashCost = calculateCost('gemini-1.5-flash', 1000, 500);
    console.log(`Flash Cost (1000 in, 500 out): ₹${flashCost.costInr} ($${flashCost.costUsd})`);
    if (flashCost.costInr <= 0 || flashCost.costUsd <= 0) {
        throw new Error('Flash pricing calculation failed');
    }

    const proCost = calculateCost('gemini-1.5-pro', 1000, 500);
    console.log(`Pro Cost (1000 in, 500 out): ₹${proCost.costInr} ($${proCost.costUsd})`);
    if (proCost.costInr <= flashCost.costInr) {
        throw new Error('Pro model should cost more than Flash model');
    }
    console.log('✅ Pricing Engine Passed!\n');

    // 2. Connect to MongoDB for service testing
    await connectDB();

    const testHospitalAId = new mongoose.Types.ObjectId();
    const testHospitalBId = new mongoose.Types.ObjectId();
    const testDoctorId = new mongoose.Types.ObjectId();

    try {
        // Clean any old test artifacts
        await AIWallet.deleteMany({ hospitalId: { $in: [testHospitalAId, testHospitalBId] } });
        await AIUsageLog.deleteMany({ hospitalId: { $in: [testHospitalAId, testHospitalBId] } });

        // 3. Test Initial Budget Provisioning
        console.log('--- 2. Initial Budget Provisioning ---');
        const walletA = await aiWalletService.getOrCreateWallet(testHospitalAId);
        console.log(`Hospital A Wallet Created: Budget = ₹${walletA.budgetAmount}, Remaining = ₹${walletA.remainingAmount}, Currency = ${walletA.currency}, Status = ${walletA.status}`);
        if (walletA.budgetAmount !== 2000 || walletA.remainingAmount !== 2000 || walletA.usedAmount !== 0) {
            throw new Error('Initial wallet values incorrect');
        }
        console.log('✅ Initial Budget Provisioning Passed!\n');

        // 4. Test Single Wallet Constraint / Upsert Idempotency
        console.log('--- 3. Single Wallet Constraint ---');
        const walletADuplicate = await aiWalletService.getOrCreateWallet(testHospitalAId);
        if (String(walletADuplicate._id) !== String(walletA._id)) {
            throw new Error('Duplicate wallet was created for same hospitalId');
        }
        console.log('✅ Single Wallet Constraint Passed!\n');

        // 5. Test Pre-Check Balance
        console.log('--- 4. Pre-Check Balance ---');
        const checkBefore = await aiWalletService.checkBalance(testHospitalAId);
        if (!checkBefore.allowed || checkBefore.remainingAmount !== 2000) {
            throw new Error('Pre-check balance should allow active wallet with funds');
        }
        console.log(`Pre-check result: Allowed = ${checkBefore.allowed}, Remaining = ₹${checkBefore.remainingAmount}, Warning Level = ${checkBefore.warningLevel}`);
        console.log('✅ Pre-check Passed!\n');

        // 6. Test Atomic Deduction and Internal Usage Log
        console.log('--- 5. Atomic Usage Deduction ---');
        const deductRes = await aiWalletService.deductUsage({
            hospitalId: testHospitalAId,
            userId: testDoctorId,
            userRole: 'doctor',
            userName: 'Dr. Sharma',
            operation: 'REPORT_SUMMARY',
            model: 'gemini-1.5-flash',
            rawUsage: { promptTokens: 5000, candidateTokens: 1000, totalTokens: 6000 }
        });

        console.log(`Deduction result: Actual Cost = ₹${deductRes.actualCostInr}, Remaining = ₹${deductRes.wallet.remainingAmount}`);
        if (deductRes.actualCostInr <= 0) throw new Error('Deduction cost should be positive');
        if (deductRes.wallet.remainingAmount >= 2000) throw new Error('Remaining budget should have decreased');

        // Verify log created
        const log = await AIUsageLog.findOne({ hospitalId: testHospitalAId, operation: 'REPORT_SUMMARY' });
        if (!log || log.totalTokens !== 6000 || log.actualApiCost !== deductRes.actualCostInr) {
            throw new Error('AIUsageLog was not created accurately');
        }
        console.log('✅ Atomic Deduction & Usage Log Passed!\n');

        // 7. Test Multi-Hospital Isolation
        console.log('--- 6. Multi-Hospital Isolation ---');
        const walletB = await aiWalletService.getOrCreateWallet(testHospitalBId);
        if (walletB.remainingAmount !== 2000) {
            throw new Error('Hospital B wallet affected by Hospital A usage');
        }
        console.log(`Hospital A Remaining = ₹${deductRes.wallet.remainingAmount} | Hospital B Remaining = ₹${walletB.remainingAmount}`);
        console.log('✅ Multi-Hospital Isolation Passed!\n');

        // 8. Test Concurrency & No Negative Balance
        console.log('--- 7. Zero Negative Balance & Exhausted State ---');
        // Set remaining amount to ₹0.10
        await AIWallet.updateOne({ hospitalId: testHospitalAId }, { $set: { remainingAmount: 0.10, usedAmount: 1999.90 } });
        
        // Large deduction costing ~₹0.50
        const overDebitRes = await aiWalletService.deductUsage({
            hospitalId: testHospitalAId,
            userId: testDoctorId,
            operation: 'CLINICAL_CHAT',
            rawUsage: { promptTokens: 50000, candidateTokens: 10000, totalTokens: 60000 }
        });

        console.log(`Over-debit test remaining amount: ₹${overDebitRes.wallet.remainingAmount}, status: ${overDebitRes.wallet.status}`);
        if (overDebitRes.wallet.remainingAmount < 0) {
            throw new Error('Wallet balance became negative!');
        }
        if (overDebitRes.wallet.remainingAmount !== 0 || overDebitRes.wallet.status !== 'exhausted') {
            throw new Error('Wallet should be clamped to 0 and marked exhausted');
        }

        // Test pre-check blocks when exhausted
        const checkExhausted = await aiWalletService.checkBalance(testHospitalAId);
        if (checkExhausted.allowed) {
            throw new Error('Pre-check allowed exhausted wallet to call AI');
        }
        console.log(`Pre-check on exhausted wallet: Allowed = ${checkExhausted.allowed}, Reason = ${checkExhausted.reason}`);
        console.log('✅ Zero Negative Balance & Exhausted Lockout Passed!\n');

        // 9. Test Recharge / Add Budget
        console.log('--- 8. Admin Recharge / Top-Up ---');
        const rechargedWallet = await aiWalletService.addBudget(testHospitalAId, 500);
        console.log(`Recharged wallet: Budget = ₹${rechargedWallet.budgetAmount}, Remaining = ₹${rechargedWallet.remainingAmount}, Status = ${rechargedWallet.status}`);
        if (rechargedWallet.remainingAmount !== 500 || rechargedWallet.status !== 'active') {
            throw new Error('Wallet recharge failed to restore active status and balance');
        }
        console.log('✅ Admin Recharge Passed!\n');

        // 10. Clean up test data
        await AIWallet.deleteMany({ hospitalId: { $in: [testHospitalAId, testHospitalBId] } });
        await AIUsageLog.deleteMany({ hospitalId: { $in: [testHospitalAId, testHospitalBId] } });

        console.log('🎉 ALL BACKEND AI WALLET TESTS PASSED SUCCESSFULLY!');
    } catch (err) {
        console.error('❌ Test failed with error:', err);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
}

runTests();
