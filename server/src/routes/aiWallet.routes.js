const express = require('express');
const router = express.Router();
const { verifyToken, verifySuperAdmin } = require('../middleware/auth.middleware');
const aiWalletService = require('../services/ai/aiWallet.service');

/**
 * GET /api/ai-wallet
 * Returns the AI Wallet balance, usage stats, and warning level for the authenticated user's hospital.
 */
router.get('/', verifyToken, async (req, res) => {
    try {
        const hospitalId = req.user?.hospitalId;

        if (!hospitalId) {
            return res.status(400).json({
                success: false,
                message: 'No hospital is associated with the authenticated user.'
            });
        }

        const walletStats = await aiWalletService.getWalletStats(hospitalId);

        res.status(200).json({
            success: true,
            wallet: walletStats
        });
    } catch (error) {
        console.error('[AI Wallet Route] Error fetching wallet:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve AI wallet details.'
        });
    }
});

/**
 * GET /api/ai-wallet/usage
 * Returns internal AI usage history logs for the authenticated user's hospital.
 */
router.get('/usage', verifyToken, async (req, res) => {
    try {
        const hospitalId = req.user?.hospitalId;
        const limit = parseInt(req.query.limit) || 30;

        if (!hospitalId) {
            return res.status(400).json({
                success: false,
                message: 'No hospital is associated with the authenticated user.'
            });
        }

        const logs = await aiWalletService.getUsageHistory(hospitalId, limit);

        res.status(200).json({
            success: true,
            logs
        });
    } catch (error) {
        console.error('[AI Wallet Route] Error fetching usage history:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve AI usage history.'
        });
    }
});

/**
 * GET /api/ai-wallet/admin/hospitals
 * Super Admin / Central Admin endpoint to view AI wallets across all hospitals.
 */
router.get('/admin/hospitals', verifySuperAdmin, async (req, res) => {
    try {
        const hospitalWallets = await aiWalletService.getAllHospitalWallets();

        res.status(200).json({
            success: true,
            hospitals: hospitalWallets
        });
    } catch (error) {
        console.error('[AI Wallet Admin Route] Error fetching all hospital wallets:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve hospital AI wallets.'
        });
    }
});

/**
 * POST /api/ai-wallet/admin/recharge
 * Super Admin endpoint to add additional budget / recharge a hospital's AI wallet.
 */
router.post('/admin/recharge', verifySuperAdmin, async (req, res) => {
    try {
        const { hospitalId, amount } = req.body;

        if (!hospitalId || !amount || Number(amount) <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Valid hospitalId and positive recharge amount are required.'
            });
        }

        const updatedWallet = await aiWalletService.addBudget(hospitalId, Number(amount));

        res.status(200).json({
            success: true,
            message: `Successfully added ₹${Number(amount).toFixed(2)} to hospital AI budget.`,
            wallet: updatedWallet
        });
    } catch (error) {
        console.error('[AI Wallet Admin Route] Error recharging wallet:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to recharge hospital AI wallet.'
        });
    }
});

module.exports = router;
