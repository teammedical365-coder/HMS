/**
 * walletStatus.js
 * Centralized wallet status calculation and currency utilities.
 * 
 * Used by both backend (AIWalletService) and can be mirrored on frontend.
 * All thresholds are in PAISE (integer).
 */

// ── Default Thresholds (in paise) ──
const DEFAULT_LOW_THRESHOLD       = 50000;  // ₹500.00
const DEFAULT_CRITICAL_THRESHOLD  = 25000;  // ₹250.00
const DEFAULT_VERY_CRITICAL_THRESHOLD = 10000; // ₹100.00

/**
 * Calculate wallet status based on remaining balance in paise.
 * 
 * @param {number} remainingPaise - Remaining balance in paise (integer)
 * @param {Object} [thresholds] - Optional custom thresholds
 * @param {number} [thresholds.low] - Low balance threshold in paise
 * @param {number} [thresholds.critical] - Critical balance threshold in paise
 * @param {number} [thresholds.veryCritical] - Very critical balance threshold in paise
 * @returns {'ACTIVE'|'LOW'|'CRITICAL'|'VERY_CRITICAL'|'EXHAUSTED'}
 */
function calculateWalletStatus(remainingPaise, thresholds = {}) {
    const remaining = Math.max(0, Math.floor(Number(remainingPaise) || 0));
    const low = thresholds.low || DEFAULT_LOW_THRESHOLD;
    const critical = thresholds.critical || DEFAULT_CRITICAL_THRESHOLD;
    const veryCritical = thresholds.veryCritical || DEFAULT_VERY_CRITICAL_THRESHOLD;

    if (remaining <= 0)            return 'EXHAUSTED';
    if (remaining <= veryCritical)  return 'VERY_CRITICAL';
    if (remaining <= critical)      return 'CRITICAL';
    if (remaining <= low)           return 'LOW';
    return 'ACTIVE';
}

/**
 * Get a human-readable warning message for a given status and remaining paise.
 * 
 * @param {string} status - Wallet status enum value
 * @param {number} remainingPaise - Remaining balance in paise
 * @returns {string|null} - Warning message or null if no warning needed
 */
function getWarningMessage(status, remainingPaise) {
    const formatted = formatINR(remainingPaise);
    switch (status) {
        case 'LOW':
            return `AI Credits Low — ${formatted} remaining`;
        case 'CRITICAL':
            return `AI Credits Critical — ${formatted} remaining`;
        case 'VERY_CRITICAL':
            return `AI Credits Almost Exhausted — ${formatted} remaining. Please recharge soon.`;
        case 'EXHAUSTED':
            return 'AI Credits Exhausted. Your hospital\'s AI Credits have been fully used. Contact Hospital Admin to recharge.';
        default:
            return null;
    }
}

// ── Currency Conversion Utilities ──

/**
 * Convert paise (integer) to rupees (float with 2 decimal places).
 * @param {number} paise - Amount in paise
 * @returns {number} Amount in rupees
 */
function paisaToRupees(paise) {
    return Number(((Number(paise) || 0) / 100).toFixed(2));
}

/**
 * Convert rupees (float) to paise (integer, rounded).
 * @param {number} rupees - Amount in rupees
 * @returns {number} Amount in paise (integer)
 */
function rupeesToPaisa(rupees) {
    return Math.round((Number(rupees) || 0) * 100);
}

/**
 * Format paise as Indian currency string: ₹2,000.00
 * @param {number} paise - Amount in paise (integer)
 * @returns {string} Formatted INR string
 */
function formatINR(paise) {
    const rupees = paisaToRupees(paise);
    return '₹' + rupees.toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

module.exports = {
    calculateWalletStatus,
    getWarningMessage,
    paisaToRupees,
    rupeesToPaisa,
    formatINR,
    DEFAULT_LOW_THRESHOLD,
    DEFAULT_CRITICAL_THRESHOLD,
    DEFAULT_VERY_CRITICAL_THRESHOLD
};
