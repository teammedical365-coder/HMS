const mongoose = require('mongoose');

/**
 * AIWallet Model
 * Represents the hospital-level AI Credit / monetary API budget.
 * Each hospital has exactly ONE active wallet.
 * Initial Budget: ₹2,000 INR.
 */
const aiWalletSchema = new mongoose.Schema({
    hospitalId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Hospital',
        required: true,
        unique: true
    },
    // Total budget in INR (default ₹2,000)
    budgetAmount: {
        type: Number,
        default: 2000,
        required: true,
        min: 0
    },
    // Total amount used in INR (accurate to 4 decimal places)
    usedAmount: {
        type: Number,
        default: 0,
        required: true,
        min: 0
    },
    // Remaining available budget in INR (budgetAmount - usedAmount)
    remainingAmount: {
        type: Number,
        default: 2000,
        required: true,
        min: 0
    },
    // Currency of budget (default INR)
    currency: {
        type: String,
        default: 'INR',
        trim: true
    },
    // Status of the AI wallet: active, suspended, exhausted
    status: {
        type: String,
        enum: ['active', 'suspended', 'exhausted'],
        default: 'active'
    },
    // Total AI request count for quick summary metrics
    totalRequests: {
        type: Number,
        default: 0,
        min: 0
    },
    // Timestamp of the latest AI usage
    lastUsageAt: {
        type: Date,
        default: null
    }
}, {
    timestamps: true
});

// Indexes for high performance
aiWalletSchema.index({ hospitalId: 1 }, { unique: true });
aiWalletSchema.index({ status: 1 });

module.exports = mongoose.model('AIWallet', aiWalletSchema);
