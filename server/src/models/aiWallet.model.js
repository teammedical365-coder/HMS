const mongoose = require('mongoose');

/**
 * AIWallet Model
 * Represents the hospital-level AI Credit / monetary API budget.
 * Each hospital has exactly ONE active wallet.
 * 
 * IMPORTANT: All monetary values are stored as INTEGER PAISE (1/100 of ₹1).
 *   ₹2,000.00 = 200000 paise
 *   ₹500.00   = 50000 paise
 *   ₹0.01     = 1 paisa
 * This eliminates JavaScript floating-point precision errors for financial calculations.
 */
const aiWalletSchema = new mongoose.Schema({
    hospitalId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Hospital',
        required: true
    },

    // ── Monetary Fields (stored as INTEGER PAISE) ──

    // Original initial budget when wallet was created (in paise)
    initialAmount: {
        type: Number,
        default: 200000, // ₹2,000.00
        required: true,
        min: 0
    },
    // Total budget including recharges (in paise)
    budgetAmount: {
        type: Number,
        default: 200000, // ₹2,000.00
        required: true,
        min: 0
    },
    // Total amount consumed by AI operations (in paise)
    usedAmount: {
        type: Number,
        default: 0,
        required: true,
        min: 0
    },
    // Available balance = budgetAmount - usedAmount (in paise)
    remainingAmount: {
        type: Number,
        default: 200000, // ₹2,000.00
        required: true,
        min: 0
    },

    // Currency code (always INR for Indian hospitals)
    currency: {
        type: String,
        default: 'INR',
        trim: true
    },

    // ── Wallet Status ──
    // Computed from remainingAmount using calculateWalletStatus()
    status: {
        type: String,
        enum: ['ACTIVE', 'LOW', 'CRITICAL', 'VERY_CRITICAL', 'EXHAUSTED', 'SUSPENDED'],
        default: 'ACTIVE'
    },

    // ── Warning Thresholds (stored as INTEGER PAISE) ──
    lowBalanceThreshold: {
        type: Number,
        default: 50000   // ₹500.00
    },
    criticalBalanceThreshold: {
        type: Number,
        default: 25000   // ₹250.00
    },
    veryCriticalBalanceThreshold: {
        type: Number,
        default: 10000   // ₹100.00
    },

    // ── Usage Metrics ──
    totalRequests: {
        type: Number,
        default: 0,
        min: 0
    },
    lastUsageAt: {
        type: Date,
        default: null
    }
}, {
    timestamps: true
});

// ── Indexes ──
// Enforce one wallet per hospital (prevents duplicates under concurrency)
aiWalletSchema.index({ hospitalId: 1 }, { unique: true });
aiWalletSchema.index({ status: 1 });

module.exports = mongoose.model('AIWallet', aiWalletSchema);
