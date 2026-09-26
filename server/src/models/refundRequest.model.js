const mongoose = require('mongoose');

/**
 * RefundRequest — tracks the full lifecycle of a patient refund.
 *
 * Lifecycle:
 *   PENDING_APPROVAL → APPROVED → PROCESSING → REFUNDED
 *   PENDING_APPROVAL → REJECTED
 *   Any pre-REFUNDED state → CANCELLED
 *
 * Security invariants:
 *   - refundAmount ≤ (totalPaid - totalCharges - alreadyRefunded)
 *   - Only Hospital Admin can approve/reject
 *   - Only Accountant can process UPI/BANK refunds after approval
 *   - Only Reception can hand over CASH refunds after approval
 *   - Optimistic concurrency via __v (versionKey) prevents double-processing
 */
const refundRequestSchema = new mongoose.Schema({
    // ── Tenant Isolation ──────────────────────────────────────────────────────
    hospitalId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Hospital',
        required: true,
        index: true
    },

    // ── Patient Reference ─────────────────────────────────────────────────────
    patientId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    patientName: { type: String, default: '' },
    patientMRN: { type: String, default: '' },

    // ── Financial Data (server-calculated, never trust frontend) ──────────────
    originalPaymentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'PaymentTransaction',
        default: null
    },
    originalPaymentAmount: { type: Number, default: 0 },
    totalCharges: { type: Number, default: 0 },
    totalPaid: { type: Number, default: 0 },
    alreadyRefunded: { type: Number, default: 0 },
    refundableAmount: { type: Number, default: 0 },

    // ── Refund Details ────────────────────────────────────────────────────────
    refundAmount: {
        type: Number,
        required: true,
        min: [0.01, 'Refund amount must be positive']
    },
    refundMode: {
        type: String,
        required: true,
        enum: ['CASH', 'UPI', 'BANK_TRANSFER'],
    },
    reason: { type: String, default: '' },

    // ── Status Lifecycle ──────────────────────────────────────────────────────
    status: {
        type: String,
        enum: ['PENDING_APPROVAL', 'APPROVED', 'PROCESSING', 'REFUNDED', 'REJECTED', 'CANCELLED'],
        default: 'PENDING_APPROVAL',
        index: true
    },

    // ── Transaction References (filled during processing) ─────────────────────
    originalTransactionId: { type: String, default: '' },
    refundTransactionId: { type: String, default: '' },  // UTR / reference for UPI/Bank
    processingNotes: { type: String, default: '' },

    // ── Audit Trail ───────────────────────────────────────────────────────────
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    requestedByName: { type: String, default: '' },
    requestedAt: { type: Date, default: Date.now },

    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    approvedByName: { type: String, default: '' },
    approvedAt: { type: Date, default: null },

    rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    rejectedByName: { type: String, default: '' },
    rejectedAt: { type: Date, default: null },
    rejectionReason: { type: String, default: '' },

    processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    processedByName: { type: String, default: '' },
    processedAt: { type: Date, default: null },

    handedOverBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    handedOverByName: { type: String, default: '' },
    handedOverAt: { type: Date, default: null },

    cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    cancelledAt: { type: Date, default: null },
    cancellationReason: { type: String, default: '' },
}, {
    timestamps: true,
    // Enable optimistic concurrency control via __v
    optimisticConcurrency: true
});

// ── Indexes ───────────────────────────────────────────────────────────────────
refundRequestSchema.index({ hospitalId: 1, status: 1, createdAt: -1 });
refundRequestSchema.index({ hospitalId: 1, patientId: 1, createdAt: -1 });
refundRequestSchema.index({ hospitalId: 1, requestedBy: 1 });

module.exports = mongoose.model('RefundRequest', refundRequestSchema);
