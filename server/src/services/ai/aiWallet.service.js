const mongoose = require('mongoose');
const AIWallet = require('../../models/aiWallet.model');
const AIUsageLog = require('../../models/aiUsageLog.model');
const Hospital = require('../../models/hospital.model');
const { calculateCost } = require('../../config/aiPricing.config');

const INITIAL_BUDGET_INR = 2000;

class AIWalletService {
    /**
     * Get or automatically create the hospital's isolated AI wallet.
     * Guaranteed to return an active AIWallet document with ₹2,000 budget for new hospitals.
     * 
     * @param {string|mongoose.Types.ObjectId} hospitalId 
     * @returns {Promise<AIWallet>}
     */
    async getOrCreateWallet(hospitalId) {
        if (!hospitalId) {
            throw new Error('Hospital ID is required to access AI Wallet.');
        }

        const cleanHospitalId = new mongoose.Types.ObjectId(hospitalId);

        // Find existing wallet
        let wallet = await AIWallet.findOne({ hospitalId: cleanHospitalId });
        if (wallet) {
            return wallet;
        }

        // Atomically upsert wallet with initial ₹2,000 INR budget
        try {
            wallet = await AIWallet.findOneAndUpdate(
                { hospitalId: cleanHospitalId },
                {
                    $setOnInsert: {
                        hospitalId: cleanHospitalId,
                        budgetAmount: INITIAL_BUDGET_INR,
                        usedAmount: 0,
                        remainingAmount: INITIAL_BUDGET_INR,
                        currency: 'INR',
                        status: 'active',
                        totalRequests: 0,
                        lastUsageAt: null
                    }
                },
                { upsert: true, new: true, setDefaultsOnInsert: true }
            );
            return wallet;
        } catch (err) {
            // In case of duplicate key race condition, retrieve the created doc
            wallet = await AIWallet.findOne({ hospitalId: cleanHospitalId });
            if (wallet) return wallet;
            throw err;
        }
    }

    /**
     * Determine low balance warning level based on remaining percentage.
     * 
     * @param {number} remaining 
     * @param {number} budget 
     * @returns {'normal'|'warning'|'critical'|'very_critical'|'exhausted'}
     */
    getWarningLevel(remaining, budget) {
        if (remaining <= 0) return 'exhausted';
        if (!budget || budget <= 0) return 'exhausted';

        const ratio = remaining / budget;
        if (ratio <= 0.05) return 'very_critical'; // <= 5%
        if (ratio <= 0.10) return 'critical';      // <= 10%
        if (ratio <= 0.20) return 'warning';       // <= 20%
        return 'normal';
    }

    /**
     * PRE-CHECK: Check whether hospital has sufficient AI Credits BEFORE calling Gemini.
     * 
     * @param {string|mongoose.Types.ObjectId} hospitalId 
     * @param {number} [estimatedMinCost=0.0001]
     * @returns {Promise<{ allowed: boolean, reason?: string, message?: string, wallet: any, warningLevel: string }>}
     */
    async checkBalance(hospitalId, estimatedMinCost = 0.0001) {
        if (!hospitalId) {
            return {
                allowed: false,
                reason: 'NO_HOSPITAL_CONTEXT',
                message: 'No hospital identifier found for this session.',
                wallet: null,
                warningLevel: 'exhausted'
            };
        }

        const wallet = await this.getOrCreateWallet(hospitalId);
        const warningLevel = this.getWarningLevel(wallet.remainingAmount, wallet.budgetAmount);

        if (wallet.status === 'suspended') {
            return {
                allowed: false,
                reason: 'WALLET_SUSPENDED',
                message: 'Your hospital AI wallet has been suspended. Please contact administrator.',
                wallet,
                warningLevel: 'exhausted'
            };
        }

        if (wallet.remainingAmount <= 0) {
            // Update status if not already set to exhausted
            if (wallet.status !== 'exhausted') {
                wallet.status = 'exhausted';
                await wallet.save().catch(() => {});
            }

            return {
                allowed: false,
                reason: 'INSUFFICIENT_CREDITS',
                message: 'AI Credits Exhausted. Your hospital has used its available AI budget. Please contact your administrator to continue using the AI Assistant.',
                wallet,
                warningLevel: 'exhausted'
            };
        }

        return {
            allowed: true,
            wallet,
            remainingAmount: wallet.remainingAmount,
            warningLevel
        };
    }

    /**
     * DEDUCT USAGE: Calculate actual Gemini API cost and atomically deduct from hospital wallet.
     * Handles race conditions and guarantees remainingAmount never drops below ₹0.
     * 
     * @param {Object} params
     * @param {string|mongoose.Types.ObjectId} params.hospitalId
     * @param {string|mongoose.Types.ObjectId} [params.userId]
     * @param {string} [params.userRole]
     * @param {string} [params.userName]
     * @param {any} [params.patientId]
     * @param {string} params.operation
     * @param {string} [params.model]
     * @param {Object} params.rawUsage - { promptTokens, candidateTokens, totalTokens, modelName }
     * @param {Object} [params.metadata]
     * @param {string} [params.requestId]
     */
    async deductUsage({
        hospitalId,
        userId = null,
        userRole = 'doctor',
        userName = 'Doctor/Staff',
        patientId = null,
        operation = 'AI_REQUEST',
        model = 'gemini-1.5-flash',
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
            const activeModel = rawUsage.modelName || model || 'gemini-1.5-flash';

            // 1. Calculate actual API cost based on configured Gemini model pricing
            const costData = calculateCost(activeModel, promptTokens, candidateTokens);
            const actualCostInr = costData.costInr;
            const costUsd = costData.costUsd;

            // 2. Perform concurrency-safe atomic deduction
            // MongoDB aggregation pipeline in findOneAndUpdate prevents race conditions and clamps remaining to >= 0
            const updatedWallet = await AIWallet.findOneAndUpdate(
                { hospitalId: cleanHospitalId },
                [
                    {
                        $set: {
                            usedAmount: { 
                                $round: [{ $add: ['$usedAmount', actualCostInr] }, 4] 
                            },
                            remainingAmount: {
                                $max: [
                                    0,
                                    { $round: [{ $subtract: ['$remainingAmount', actualCostInr] }, 4] }
                                ]
                            },
                            totalRequests: { $add: ['$totalRequests', 1] },
                            lastUsageAt: new Date(),
                            status: {
                                $cond: {
                                    if: { $lte: [{ $subtract: ['$remainingAmount', actualCostInr] }, 0] },
                                    then: 'exhausted',
                                    else: '$status'
                                }
                            }
                        }
                    }
                ],
                { new: true, upsert: true }
            );

            const warningLevel = this.getWarningLevel(updatedWallet.remainingAmount, updatedWallet.budgetAmount);

            // Log formatted console message for inspection
            console.log(
                `\x1b[35m[AI Wallet]\x1b[0m Hospital: \x1b[33m${cleanHospitalId}\x1b[0m | ` +
                `Op: \x1b[32m${operation}\x1b[0m | Model: \x1b[36m${activeModel}\x1b[0m | ` +
                `Tokens: \x1b[1m${totalTokens}\x1b[0m (In: ${promptTokens}, Out: ${candidateTokens}) | ` +
                `Cost: \x1b[32m₹${actualCostInr.toFixed(4)}\x1b[0m ($${costUsd.toFixed(6)}) | ` +
                `Remaining: \x1b[35m₹${updatedWallet.remainingAmount.toFixed(2)}\x1b[0m`
            );

            // 3. Save internal billing/audit usage log
            try {
                await AIUsageLog.create({
                    hospitalId: cleanHospitalId,
                    userId: userId ? new mongoose.Types.ObjectId(userId) : null,
                    userName: userName || 'Doctor/Staff',
                    userRole: userRole || 'doctor',
                    patientId: patientId || null,
                    operation: operation,
                    actionType: operation,
                    model: activeModel,
                    modelName: activeModel,
                    inputTokens: promptTokens,
                    outputTokens: candidateTokens,
                    totalTokens: totalTokens,
                    promptTokens: promptTokens,
                    candidateTokens: candidateTokens,
                    actualApiCost: actualCostInr,
                    estimatedCostInr: actualCostInr,
                    estimatedCostUsd: costUsd,
                    currency: 'INR',
                    requestId: requestId || `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
                    status: 'SUCCESS',
                    metadata
                });
            } catch (logErr) {
                console.error('[AIUsageLog DB Save Error]:', logErr.message);
            }

            return {
                success: true,
                actualCostInr,
                costUsd,
                wallet: {
                    budgetAmount: updatedWallet.budgetAmount,
                    usedAmount: updatedWallet.usedAmount,
                    remainingAmount: updatedWallet.remainingAmount,
                    currency: updatedWallet.currency,
                    status: updatedWallet.status,
                    totalRequests: updatedWallet.totalRequests,
                    lastUsageAt: updatedWallet.lastUsageAt,
                    warningLevel
                }
            };
        } catch (error) {
            console.error('[AIWalletService deductUsage Error]:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

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
        model = 'gemini-1.5-flash',
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
                operation: operation,
                actionType: operation,
                model: model || 'gemini-1.5-flash',
                modelName: model || 'gemini-1.5-flash',
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

    /**
     * Add budget / recharge hospital AI wallet (Admin function).
     * 
     * @param {string|mongoose.Types.ObjectId} hospitalId 
     * @param {number} rechargeAmountInr 
     */
    async addBudget(hospitalId, rechargeAmountInr) {
        const amount = Number(rechargeAmountInr);
        if (isNaN(amount) || amount <= 0) {
            throw new Error('Recharge amount must be a positive number.');
        }

        const cleanHospitalId = new mongoose.Types.ObjectId(hospitalId);
        
        // Ensure wallet exists first
        await this.getOrCreateWallet(cleanHospitalId);

        const updatedWallet = await AIWallet.findOneAndUpdate(
            { hospitalId: cleanHospitalId },
            [
                {
                    $set: {
                        budgetAmount: { $round: [{ $add: ['$budgetAmount', amount] }, 4] },
                        remainingAmount: { $round: [{ $add: ['$remainingAmount', amount] }, 4] },
                        status: {
                            $cond: {
                                if: { $gt: [{ $add: ['$remainingAmount', amount] }, 0] },
                                then: 'active',
                                else: '$status'
                            }
                        }
                    }
                }
            ],
            { new: true }
        );

        return updatedWallet;
    }

    /**
     * Get wallet summary, usage stats, and warning level for a hospital.
     * 
     * @param {string|mongoose.Types.ObjectId} hospitalId 
     */
    async getWalletStats(hospitalId) {
        const wallet = await this.getOrCreateWallet(hospitalId);
        const warningLevel = this.getWarningLevel(wallet.remainingAmount, wallet.budgetAmount);

        // Calculate today's usage
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
            budgetAmount: wallet.budgetAmount,
            usedAmount: Number(wallet.usedAmount.toFixed(4)),
            remainingAmount: Number(wallet.remainingAmount.toFixed(4)),
            currency: wallet.currency,
            status: wallet.status,
            totalRequests: wallet.totalRequests,
            lastUsageAt: wallet.lastUsageAt,
            warningLevel,
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
     * Get usage history logs for a hospital.
     * 
     * @param {string|mongoose.Types.ObjectId} hospitalId 
     * @param {number} [limit=30] 
     */
    async getUsageHistory(hospitalId, limit = 30) {
        const cleanLimit = Math.min(100, Math.max(1, parseInt(limit) || 30));
        return AIUsageLog.find({ hospitalId: new mongoose.Types.ObjectId(hospitalId) })
            .sort({ createdAt: -1 })
            .limit(cleanLimit)
            .lean();
    }

    /**
     * Get AI Wallet overview across all hospitals (Super Admin only).
     */
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
            const w = walletMap.get(String(h._id)) || {
                budgetAmount: INITIAL_BUDGET_INR,
                usedAmount: 0,
                remainingAmount: INITIAL_BUDGET_INR,
                currency: 'INR',
                status: 'active',
                totalRequests: 0
            };

            return {
                hospitalId: h._id,
                hospitalName: h.name,
                hospitalCode: h.hospitalCode || '',
                city: h.city || '',
                clinicType: h.clinicType || 'hospital',
                plan: h.subscriptionPlan || 'enterprise',
                budgetAmount: w.budgetAmount,
                usedAmount: Number((w.usedAmount || 0).toFixed(2)),
                remainingAmount: Number((w.remainingAmount || 0).toFixed(2)),
                currency: w.currency || 'INR',
                status: w.status || 'active',
                totalRequests: w.totalRequests || 0,
                warningLevel: this.getWarningLevel(w.remainingAmount, w.budgetAmount)
            };
        });
    }

    /**
     * Initialization hook: Guarantee every existing hospital in the database has an AI Wallet.
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

            if (createdCount > 0) {
                console.log(`✅ [AI Wallet] Initialized ₹2,000 AI Wallet for ${createdCount} hospital(s).`);
            }
        } catch (err) {
            console.error('⚠️ [AI Wallet] Error in ensureAllHospitalsHaveWallets:', err.message);
        }
    }
}

module.exports = new AIWalletService();
