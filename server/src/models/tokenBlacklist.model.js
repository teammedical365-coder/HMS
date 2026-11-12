const mongoose = require('mongoose');

// TTL index automatically removes expired entries — no manual cleanup needed.
// expireAt is set to the token's own exp claim so it evicts exactly when the
// token would have expired anyway, keeping the collection small.
const tokenBlacklistSchema = new mongoose.Schema({
    jti: { type: String, required: true, unique: true, index: true },
    expireAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
});

// Automatically evict from memory cache whenever a token is blacklisted
tokenBlacklistSchema.post('save', function (doc) {
    if (doc?.jti) {
        try {
            const { invalidateAuthCache } = require('../middleware/auth.middleware');
            invalidateAuthCache({ jti: doc.jti });
        } catch (e) {}
    }
});

module.exports = mongoose.model('TokenBlacklist', tokenBlacklistSchema);
