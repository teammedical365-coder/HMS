const mongoose = require('mongoose');
const AIWallet = require('../../models/aiWallet.model');
const AIUsageLog = require('../../models/aiUsageLog.model');
const Hospital = require('../../models/hospital.model');
const { calculateCost } = require('../../config/aiPricing.config');
const {
    calculateWalletStatus,
    getWarningMessage,
    paisaToRupees,
    rupeesToPaisa,
    formatINR
} = require('../../utils/walletStatus');

const INITIAL_BUDGET_PAISE = 200000; // ₹2,000.00

class AIWalletService {

    // ──────────────────────────────────────────────────────────────────────────
    // GET OR CREATE
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * Get or atomically create the hospital's AI wallet.
     * Guaranteed to return exactly ONE wallet per hospital with ₹2,000 budget.
     * 
     * @param {string|mongoose.Types.ObjectId} hospitalId 
     * @returns {Promise<Object>} AIWallet document
     */
    async getOrCreateWallet(hospitalId) {
        if (!hospitalId) {
            throw new Error('Hospital ID is required to access AI Wallet.');
        }

        const cleanHospitalId = new mongoose.Types.ObjectId(hospitalId);

        // Fast path: find existing
        let wallet = await AIWallet.findOne({ hospitalId: cleanHospitalId });
        if (wallet) return wallet;

        // Atomic upsert — safe under concurrency
        try {
            wallet = await AIWallet.findOneAndUpdate(
                { hospitalId: cleanHospitalId },
                {
                    $setOnInsert: {
                        hospitalId: cleanHospitalId,
                        initialAmount: INITIAL_BUDGET_PAISE,
                        budgetAmount: INITIAL_BUDGET_PAISE,
                        usedAmount: 0,
                        remainingAmount: INITIAL_BUDGET_PAISE,
                        currency: 'INR',
                        status: 'ACTIVE',
                        lowBalanceThreshold: 50000,
                        criticalBalanceThreshold: 25000,
                        veryCriticalBalanceThreshold: 10000,
                        totalRequests: 0,
                        lastUsageAt: null
                    }
                },
                { upsert: true, new: true, setDefaultsOnInsert: true }
            );
            return wallet;
        } catch (err) {
            // Duplicate key race — another process created it first
            wallet = await AIWallet.findOne({ hospitalId: cleanHospitalId });
            if (wallet) return wallet;
            throw err;
        }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // BALANCE PRE-CHECK
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * Check whether hospital has sufficient AI Credits BEFORE calling Gemini.
     * Returns status, warning message, and whether the operation is allowed.
     * 
     * @param {string|mongoose.Types.ObjectId} hospitalId 
     * @returns {Promise<Object>}
     */
    async checkBalance(hospitalId) {
        if (!hospitalId) {
            return {
                allowed: false,
                reason: 'NO_HOSPITAL_CONTEXT',
                message: 'No hospital identifier found for this session.',
                wallet: null,
                warningLevel: 'EXHAUSTED'
            };
        }

        const wallet = await this.getOrCreateWallet(hospitalId);

        // Auto-migrate old float-based wallets to paise
        if (wallet.remainingAmount > 0 && wallet.remainingAmount < 5000 && wallet.budgetAmount < 5000) {
            // Likely stored as INR float, not paise — migrate
            await this._migrateWalletToPaise(wallet);
        }

        const status = calculateWalletStatus(wallet.remainingAmount, {
            low: wallet.lowBalanceThreshold,
            critical: wallet.criticalBalanceThreshold,
            veryCritical: wallet.veryCriticalBalanceThreshold
        });

        // Update status in DB if it drifted
        if (wallet.status !== status && wallet.status !== 'SUSPENDED') {
            wallet.status = status;
            await wallet.save().catch(() => {});
        }

        if (wallet.status === 'SUSPENDED') {
            return {
                allowed: false,
                reason: 'WALLET_SUSPENDED',
                message: 'Your hospital AI wallet has been suspended. Please contact administrator.',
                wallet: this._formatWalletResponse(wallet),
                warningLevel: 'EXHAUSTED'
            };
        }

        if (wallet.remainingAmount <= 0) {
            if (wallet.status !== 'EXHAUSTED') {
                wallet.status = 'EXHAUSTED';
                await wallet.save().catch(() => {});
            }
            return {
                allowed: false,
                reason: 'INSUFFICIENT_CREDITS',
                message: 'AI Credits Exhausted. Your hospital has used its available AI budget. Please contact your administrator to recharge.',
                wallet: this._formatWalletResponse(wallet),
                warningLevel: 'EXHAUSTED'
            };
        }

        const warningMsg = getWarningMessage(status, wallet.remainingAmount);

        return {
            allowed: true,
            wallet: this._formatWalletResponse(wallet),
            remainingAmount: paisaToRupees(wallet.remainingAmount),
            warningLevel: status,
            warningMessage: warningMsg
        };
    }

    // ──────────────────────────────────────────────────────────────────────────
    // DEDUCT USAGE (Atomic, Concurrency-Safe)
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * Calculate actual Gemini API cost and atomically deduct from hospital wallet.
     * 
     * Uses MongoDB conditional update: only deducts if remainingAmount >= costPaise.
     * This prevents negative balance under concurrent requests from multiple doctors.
     * 
     * @param {Object} params
     * @returns {Promise<Object>}
     */
    async deductUsage({
        hospitalId,
        userId = null,
        userRole = 'doctor',
        userName = 'Doctor/Staff',
        patientId = null,
        operation = 'AI_REQUEST',
        model = 'gemini-2.0-flash',
        rawUsage = {},
        metadata = {},
        requestId = ''
    }) {
        try {
            if (!hospitalId) {
                console.warn('[AIWalletService] Attempted to deduct usage with no hospitalId');
                return { success: false, error: 'hospitalId is required' };
            }

            const cleanHospitalId = new mongoose.Types.ObjectId(hospitalId);
            const promptTokens = rawUsage.promptTokens || rawUsage.inputTokens || 0;
            const candidateTokens = rawUsage.candidateTokens || rawUsage.outputTokens || 0;
            const totalTokens = rawUsage.totalTokens || (promptTokens + candidateTokens);
            const activeModel = rawUsage.modelName || model || 'gemini-2.0-flash';

            // 1. Calculate actual API cost (returns INR float)
            const costData = calculateCost(activeModel, promptTokens, candidateTokens);
            const costPaise = rupeesToPaisa(costData.costInr); // Convert to integer paise

            // 2. ATOMIC conditional deduction — prevents negative balance
            // The filter condition `remainingAmount >= costPaise` ensures this update
            // only succeeds if there is sufficient balance. Under concurrent requests,
            // only one will win the race; the other will get null (insufficient funds).
            const updatedWallet = await AIWallet.findOneAndUpdate(
                {
                    hospitalId: cleanHospitalId,
                    remainingAmount: { $gte: costPaise } // ATOMIC GUARD
                },
                [
                    {
                        $set: {
                            usedAmount: { $add: ['$usedAmount', costPaise] },
                            remainingAmount: {
                                $max: [0, { $subtract: ['$remainingAmount', costPaise] }]
                            },
                            totalRequests: { $add: ['$totalRequests', 1] },
                            lastUsageAt: new Date()
                        }
                    }
                ],
                { new: true }
            );

            // If null, insufficient balance (lost the race or truly exhausted)
            if (!updatedWallet) {
                const currentWallet = await this.getOrCreateWallet(cleanHospitalId);
                console.warn(
                    `[AI Wallet] INSUFFICIENT BALANCE for hospital ${cleanHospitalId}. ` +
                    `Required: ${formatINR(costPaise)}, Available: ${formatINR(currentWallet.remainingAmount)}`
                );
                return {
                    success: false,
                    error: 'INSUFFICIENT_CREDITS',
                    message: `Insufficient AI Credits. Required: ${formatINR(costPaise)}, Available: ${formatINR(currentWallet.remainingAmount)}`,
                    wallet: this._formatWalletResponse(currentWallet)
                };
            }

            // 3. Compute and persist new status
            const newStatus = calculateWalletStatus(updatedWallet.remainingAmount, {
                low: updatedWallet.lowBalanceThreshold,
                critical: updatedWallet.criticalBalanceThreshold,
                veryCritical: updatedWallet.veryCriticalBalanceThreshold
            });
            if (updatedWallet.status !== newStatus && updatedWallet.status !== 'SUSPENDED') {
                updatedWallet.status = newStatus;
                await updatedWallet.save().catch(() => {});
            }

            const warningMsg = getWarningMessage(newStatus, updatedWallet.remainingAmount);

            // 4. Console log
            console.log(
                `\x1b[35m[AI Wallet]\x1b[0m Hospital: \x1b[33m${cleanHospitalId}\x1b[0m | ` +
                `Op: \x1b[32m${operation}\x1b[0m | Model: \x1b[36m${activeModel}\x1b[0m | ` +
                `Tokens: \x1b[1m${totalTokens}\x1b[0m (In: ${promptTokens}, Out: ${candidateTokens}) | ` +
                `Cost: \x1b[32m${formatINR(costPaise)}\x1b[0m ($${costData.costUsd.toFixed(6)}) | ` +
                `Remaining: \x1b[35m${formatINR(updatedWallet.remainingAmount)}\x1b[0m [${newStatus}]`
            );

            // 5. Save usage log (async, non-blocking for response)
            const logRequestId = requestId || `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
            AIUsageLog.create({
                hospitalId: cleanHospitalId,
                userId: userId ? new mongoose.Types.ObjectId(userId) : null,
                userName: userName || 'Doctor/Staff',
                userRole: userRole || 'doctor',
                patientId: patientId || null,
                operation,
                actionType: operation,
                model: activeModel,
                modelName: activeModel,
                inputTokens: promptTokens,
                outputTokens: candidateTokens,
                totalTokens,
                promptTokens,
                candidateTokens,
                actualApiCost: costData.costInr, // Store as INR float for backward compat in logs
                estimatedCostInr: costData.costInr,
                estimatedCostUsd: costData.costUsd,
                currency: 'INR',
                requestId: logRequestId,
                status: 'SUCCESS',
                metadata
            }).catch(logErr => {
                console.error('[AIUsageLog DB Save Error]:', logErr.message);
            });

            // 6. Emit real-time wallet update via Socket.IO
            this._emitWalletUpdate(cleanHospitalId, updatedWallet, newStatus);

            const walletResponse = this._formatWalletResponse(updatedWallet, newStatus);

            return {
                success: true,
                actualCostInr: costData.costInr,
                costPaise,
                costUsd: costData.costUsd,
                wallet: walletResponse,
                warningLevel: newStatus,
                warningMessage: warningMsg
            };
        } catch (error) {
            console.error('[AIWalletService deductUsage Error]:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // RECORD FAILURE (No charge)
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * Record a failed AI request without consuming budget.
     */
    async recordFailure({
        hospitalId,
        userId = null,
        userRole = 'doctor',
        userName = 'Doctor/Staff',
        patientId = null,
        operation = 'AI_REQUEST',
        model = 'gemini-2.0-flash',
        error = '',
        metadata = {},
        requestId = ''
    }) {
        try {
            if (!hospitalId) return;
            const cleanHospitalId = new mongoose.Types.ObjectId(hospitalId);

            await AIUsageLog.create({
                hospitalId: cleanHospitalId,
                userId: userId ? new mongoose.Types.ObjectId(userId) : null,
                userName: userName || 'Doctor/Staff',
                userRole: userRole || 'doctor',
                patientId: patientId || null,
                operation,
                actionType: operation,
                model: model || 'gemini-2.0-flash',
                modelName: model || 'gemini-2.0-flash',
                inputTokens: 0,
                outputTokens: 0,
                totalTokens: 0,
                promptTokens: 0,
                candidateTokens: 0,
                actualApiCost: 0,
                estimatedCostInr: 0,
                estimatedCostUsd: 0,
                currency: 'INR',
                requestId: requestId || `req_fail_${Date.now()}`,
                status: 'FAILED',
                error: error || 'API error',
                metadata
            });
        } catch (err) {
            console.error('[AIWalletService recordFailure Error]:', err.message);
        }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // ADD BUDGET / RECHARGE
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * Add budget to hospital AI wallet (Admin/SuperAdmin function).
     * 
     * @param {string|mongoose.Types.ObjectId} hospitalId 
     * @param {number} rechargeAmountInr - Amount in RUPEES (converted to paise internally)
     */
    async addBudget(hospitalId, rechargeAmountInr) {
        const amount = Number(rechargeAmountInr);
        if (isNaN(amount) || amount <= 0) {
            throw new Error('Recharge amount must be a positive number.');
        }

        const rechargePaise = rupeesToPaisa(amount);
        const cleanHospitalId = new mongoose.Types.ObjectId(hospitalId);

        // Ensure wallet exists
        await this.getOrCreateWallet(cleanHospitalId);

        const updatedWallet = await AIWallet.findOneAndUpdate(
            { hospitalId: cleanHospitalId },
            {
                $inc: {
                    budgetAmount: rechargePaise,
                    remainingAmount: rechargePaise
                }
            },
            { new: true }
        );

        // Recalculate status after recharge
        if (updatedWallet) {
            const newStatus = calculateWalletStatus(updatedWallet.remainingAmount, {
                low: updatedWallet.lowBalanceThreshold,
                critical: updatedWallet.criticalBalanceThreshold,
                veryCritical: updatedWallet.veryCriticalBalanceThreshold
            });
            if (updatedWallet.status !== newStatus) {
                updatedWallet.status = newStatus;
                await updatedWallet.save();
            }
            this._emitWalletUpdate(cleanHospitalId, updatedWallet, newStatus);
        }

        return this._formatWalletResponse(updatedWallet);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // WALLET STATS & HISTORY
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * Get comprehensive wallet stats for a hospital.
     */
    async getWalletStats(hospitalId) {
        const wallet = await this.getOrCreateWallet(hospitalId);
        const status = calculateWalletStatus(wallet.remainingAmount, {
            low: wallet.lowBalanceThreshold,
            critical: wallet.criticalBalanceThreshold,
            veryCritical: wallet.veryCriticalBalanceThreshold
        });
        const warningMsg = getWarningMessage(status, wallet.remainingAmount);

        // Today's usage
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);

        const todayStats = await AIUsageLog.aggregate([
            {
                $match: {
                    hospitalId: new mongoose.Types.ObjectId(hospitalId),
                    createdAt: { $gte: startOfToday },
                    status: 'SUCCESS'
                }
            },
            {
                $group: {
                    _id: null,
                    todayRequests: { $sum: 1 },
                    todayCostInr: { $sum: '$actualApiCost' },
                    todayCostUsd: { $sum: '$estimatedCostUsd' },
                    todayTokens: { $sum: '$totalTokens' }
                }
            }
        ]);

        const today = todayStats[0] || {
            todayRequests: 0,
            todayCostInr: 0,
            todayCostUsd: 0,
            todayTokens: 0
        };

        // Usage breakdown by operation
        const breakdown = await AIUsageLog.aggregate([
            {
                $match: {
                    hospitalId: new mongoose.Types.ObjectId(hospitalId),
                    status: 'SUCCESS'
                }
            },
            {
                $group: {
                    _id: '$operation',
                    count: { $sum: 1 },
                    totalCostInr: { $sum: '$actualApiCost' },
                    totalTokens: { $sum: '$totalTokens' }
                }
            }
        ]);

        return {
            initialAmount: paisaToRupees(wallet.initialAmount),
            budgetAmount: paisaToRupees(wallet.budgetAmount),
            usedAmount: paisaToRupees(wallet.usedAmount),
            remainingAmount: paisaToRupees(wallet.remainingAmount),
            currency: wallet.currency,
            status,
            warningLevel: status,
            warningMessage: warningMsg,
            totalRequests: wallet.totalRequests,
            lastUsageAt: wallet.lastUsageAt,
            today: {
                requests: today.todayRequests,
                costInr: Number((today.todayCostInr || 0).toFixed(4)),
                costUsd: Number((today.todayCostUsd || 0).toFixed(6)),
                tokens: today.todayTokens || 0
            },
            breakdown: breakdown.map(b => ({
                operation: b._id || 'OTHER',
                count: b.count,
                costInr: Number((b.totalCostInr || 0).toFixed(4)),
                tokens: b.totalTokens || 0
            }))
        };
    }

    /**
     * Get paginated usage history for a hospital.
     */
    async getUsageHistory(hospitalId, limit = 30) {
        const cleanLimit = Math.min(100, Math.max(1, parseInt(limit) || 30));
        return AIUsageLog.find({ hospitalId: new mongoose.Types.ObjectId(hospitalId) })
            .sort({ createdAt: -1 })
            .limit(cleanLimit)
            .lean();
    }

    /**
     * Get transaction/usage history with doctor-level breakdown (Admin view).
     */
    async getTransactions(hospitalId, { page = 1, limit = 30 } = {}) {
        const cleanLimit = Math.min(100, Math.max(1, parseInt(limit) || 30));
        const skip = (Math.max(1, parseInt(page) || 1) - 1) * cleanLimit;
        const hId = new mongoose.Types.ObjectId(hospitalId);

        const [logs, totalCount, doctorBreakdown] = await Promise.all([
            AIUsageLog.find({ hospitalId: hId, status: 'SUCCESS' })
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(cleanLimit)
                .lean(),
            AIUsageLog.countDocuments({ hospitalId: hId, status: 'SUCCESS' }),
            AIUsageLog.aggregate([
                { $match: { hospitalId: hId, status: 'SUCCESS' } },
                {
                    $group: {
                        _id: { userId: '$userId', userName: '$userName' },
                        totalCost: { $sum: '$actualApiCost' },
                        requestCount: { $sum: 1 },
                        lastUsed: { $max: '$createdAt' }
                    }
                },
                { $sort: { totalCost: -1 } }
            ])
        ]);

        return {
            transactions: logs.map(l => ({
                ...l,
                costFormatted: '₹' + (l.actualApiCost || 0).toFixed(2)
            })),
            total: totalCount,
            page: Math.max(1, parseInt(page) || 1),
            limit: cleanLimit,
            totalPages: Math.ceil(totalCount / cleanLimit),
            doctorBreakdown: doctorBreakdown.map(d => ({
                userId: d._id.userId,
                userName: d._id.userName || 'Doctor/Staff',
                totalCostInr: Number((d.totalCost || 0).toFixed(2)),
                requestCount: d.requestCount,
                lastUsed: d.lastUsed
            }))
        };
    }

    // ──────────────────────────────────────────────────────────────────────────
    // SUPER ADMIN — ALL HOSPITALS
    // ──────────────────────────────────────────────────────────────────────────

    async getAllHospitalWallets() {
        const hospitals = await Hospital.find({ isActive: true })
            .select('name slug city hospitalCode clinicType subscriptionPlan')
            .lean();

        const wallets = await AIWallet.find().lean();
        const walletMap = new Map();
        wallets.forEach(w => {
            walletMap.set(String(w.hospitalId), w);
        });

        return hospitals.map(h => {
            const w = walletMap.get(String(h._id));
            const remaining = w ? w.remainingAmount : INITIAL_BUDGET_PAISE;
            const budget = w ? w.budgetAmount : INITIAL_BUDGET_PAISE;
            const used = w ? w.usedAmount : 0;
            const status = w ? calculateWalletStatus(remaining) : 'ACTIVE';

            return {
                hospitalId: h._id,
                hospitalName: h.name,
                hospitalCode: h.hospitalCode || '',
                city: h.city || '',
                clinicType: h.clinicType || 'hospital',
                plan: h.subscriptionPlan || 'enterprise',
                initialAmount: paisaToRupees(w ? w.initialAmount : INITIAL_BUDGET_PAISE),
                budgetAmount: paisaToRupees(budget),
                usedAmount: paisaToRupees(used),
                remainingAmount: paisaToRupees(remaining),
                currency: 'INR',
                status,
                warningLevel: status,
                totalRequests: w ? w.totalRequests : 0
            };
        });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // INITIALIZATION
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * Ensure every existing hospital has an AI Wallet.
     * Called once on server startup.
     */
    async ensureAllHospitalsHaveWallets() {
        try {
            const hospitals = await Hospital.find({}).select('_id name').lean();
            let createdCount = 0;

            for (const h of hospitals) {
                const existing = await AIWallet.exists({ hospitalId: h._id });
                if (!existing) {
                    await this.getOrCreateWallet(h._id);
                    createdCount++;
                }
            }

            // Migrate old float-based wallets to paise
            await this._migrateAllWalletsToPaise();

            if (createdCount > 0) {
                console.log(`✅ [AI Wallet] Initialized ₹2,000 AI Wallet for ${createdCount} hospital(s).`);
            }
        } catch (err) {
            console.error('⚠️ [AI Wallet] Error in ensureAllHospitalsHaveWallets:', err.message);
        }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // PRIVATE HELPERS
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * Format wallet document to API response (paise → rupees).
     */
    _formatWalletResponse(wallet, overrideStatus) {
        if (!wallet) return null;
        const status = overrideStatus || calculateWalletStatus(wallet.remainingAmount, {
            low: wallet.lowBalanceThreshold,
            critical: wallet.criticalBalanceThreshold,
            veryCritical: wallet.veryCriticalBalanceThreshold
        });
        return {
            initialAmount: paisaToRupees(wallet.initialAmount || INITIAL_BUDGET_PAISE),
            budgetAmount: paisaToRupees(wallet.budgetAmount),
            usedAmount: paisaToRupees(wallet.usedAmount),
            remainingAmount: paisaToRupees(wallet.remainingAmount),
            currency: wallet.currency || 'INR',
            status,
            warningLevel: status,
            warningMessage: getWarningMessage(status, wallet.remainingAmount),
            totalRequests: wallet.totalRequests || 0,
            lastUsageAt: wallet.lastUsageAt
        };
    }

    /**
     * Emit real-time wallet update via Socket.IO to all users in the hospital room.
     */
    _emitWalletUpdate(hospitalId, wallet, status) {
        try {
            // Access the Express app's io instance
            const app = require('../../app');
            const io = app.get('io');
            if (!io) return;

            const room = `hospital_${String(hospitalId)}`;
            io.to(room).emit('AI_WALLET_UPDATED', {
                hospitalId: String(hospitalId),
                remainingAmount: paisaToRupees(wallet.remainingAmount),
                usedAmount: paisaToRupees(wallet.usedAmount),
                budgetAmount: paisaToRupees(wallet.budgetAmount),
                status,
                warningLevel: status,
                warningMessage: getWarningMessage(status, wallet.remainingAmount),
                totalRequests: wallet.totalRequests,
                timestamp: new Date().toISOString()
            });
        } catch (emitErr) {
            // Socket.IO might not be initialized yet during startup
            // This is non-critical — frontend also refreshes wallet after each AI call
        }
    }

    /**
     * Auto-migrate a single wallet from old float INR to integer paise.
     * Detects old format by checking if budget < 5000 (likely ₹ not paise).
     */
    async _migrateWalletToPaise(wallet) {
        try {
            if (wallet.budgetAmount < 5000) {
                const newBudget = rupeesToPaisa(wallet.budgetAmount);
                const newUsed = rupeesToPaisa(wallet.usedAmount);
                const newRemaining = rupeesToPaisa(wallet.remainingAmount);
                const newInitial = rupeesToPaisa(wallet.initialAmount || wallet.budgetAmount);

                await AIWallet.updateOne(
                    { _id: wallet._id },
                    {
                        $set: {
                            initialAmount: newInitial,
                            budgetAmount: newBudget,
                            usedAmount: newUsed,
                            remainingAmount: newRemaining,
                            lowBalanceThreshold: 50000,
                            criticalBalanceThreshold: 25000,
                            veryCriticalBalanceThreshold: 10000,
                            status: calculateWalletStatus(newRemaining)
                        }
                    }
                );

                console.log(`  ✅ [AI Wallet Migration] Migrated hospital ${wallet.hospitalId}: ₹${wallet.budgetAmount} → ${newBudget} paise`);
            }
        } catch (err) {
            console.error(`  ⚠️ [AI Wallet Migration] Error for hospital ${wallet.hospitalId}:`, err.message);
        }
    }

    /**
     * Batch migrate all old float-based wallets to paise.
     */
    async _migrateAllWalletsToPaise() {
        try {
            // Find wallets that look like they're stored in INR (budget < 5000)
            const oldWallets = await AIWallet.find({ budgetAmount: { $lt: 5000 } });
            if (oldWallets.length === 0) return;

            console.log(`🔄 [AI Wallet] Migrating ${oldWallets.length} wallet(s) from INR to paise...`);
            for (const w of oldWallets) {
                await this._migrateWalletToPaise(w);
            }
        } catch (err) {
            console.error('⚠️ [AI Wallet Migration] Error:', err.message);
        }
    }
}

module.exports = new AIWalletService();
