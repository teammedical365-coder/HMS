const mongoose = require('mongoose');

/**
 * Session — tracks active login sessions for single-session enforcement.
 * Only ONE session with isActive=true is allowed per userId at any time.
 * When a user logs in from a new device, the previous session is deactivated
 * and the corresponding JWT is blacklisted.
 */
const sessionSchema = new mongoose.Schema({
    userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    sessionId: { type: String, required: true, unique: true },   // UUID v4
    jti:       { type: String, required: true },                  // JWT ID — for blacklisting on force-logout
    browser:   { type: String, default: 'Unknown' },
    os:        { type: String, default: 'Unknown' },
    ipAddress: { type: String, default: '' },
    loginTime: { type: Date, default: Date.now },
    lastActive:{ type: Date, default: Date.now },
    isActive:  { type: Boolean, default: true },
    logoutTime:{ type: Date, default: null },
}, { timestamps: true });

// Fast lookup: find the active session for a user
sessionSchema.index({ userId: 1, isActive: 1 });
// Fast lookup: find session by jti (for logout)
sessionSchema.index({ jti: 1 });

module.exports = mongoose.model('Session', sessionSchema);
