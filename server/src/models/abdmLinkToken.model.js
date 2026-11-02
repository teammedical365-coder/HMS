'use strict';
const mongoose = require('mongoose');
const crypto = require('crypto');
const { JWT_SECRET } = require('../config/jwt');

const ENCRYPTION_ALGORITHM = 'aes-256-gcm';

// Derive 32-byte key from JWT_SECRET or explicit ABDM key
function getEncryptionKey() {
    const secret = process.env.ABDM_TOKEN_ENCRYPTION_KEY || JWT_SECRET || 'medical365-default-abdm-secret-key-32b';
    return crypto.createHash('sha256').update(secret).digest();
}

function encryptToken(plainToken) {
    if (!plainToken) return null;
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, getEncryptionKey(), iv);
    let encrypted = cipher.update(plainToken, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

function decryptToken(encryptedData) {
    if (!encryptedData) return null;
    try {
        const parts = encryptedData.split(':');
        if (parts.length !== 3) return null;
        const [ivHex, authTagHex, encryptedHex] = parts;
        const iv = Buffer.from(ivHex, 'hex');
        const authTag = Buffer.from(authTagHex, 'hex');
        const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, getEncryptionKey(), iv);
        decipher.setAuthTag(authTag);
        let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch {
        return null;
    }
}

// ABDM-issued link token per patient (needed for HIP-initiated care-context linking).
const schema = new mongoose.Schema({
    hospitalId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', required: true },
    patientId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    abhaAddress:    { type: String, default: null },
    requestId:      { type: String, default: null, index: true }, // REQUEST-ID of our generate-token call
    token:          { type: String, default: null },              // Kept for backward compat; new writes store null
    tokenHash:      { type: String, default: null, index: true }, // SHA-256 cryptographic hash
    tokenEncrypted: { type: String, default: null },              // AES-256-GCM ciphertext
    status:         { type: String, enum: ['PENDING', 'READY', 'FAILED', 'REVOKED', 'EXPIRED', 'USED'], default: 'PENDING' },
    expiresAt:      { type: Date, default: null },
    usedAt:         { type: Date, default: null },
    revokedAt:      { type: Date, default: null },
    error:          { type: String, default: null },
}, { timestamps: true });

schema.index({ hospitalId: 1, patientId: 1 }, { unique: true });

// Check if token is expired
schema.methods.isExpired = function() {
    if (!this.expiresAt) return false;
    return new Date() > this.expiresAt;
};

// Set token securely with SHA-256 hash and AES-256-GCM ciphertext
schema.methods.setSecureToken = function(plainToken, ttlMinutes = 60) {
    if (!plainToken) return;
    this.tokenHash = crypto.createHash('sha256').update(plainToken).digest('hex');
    this.tokenEncrypted = encryptToken(plainToken);
    this.token = null; // Plaintext never persisted
    this.status = 'READY';
    this.expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);
    this.error = null;
};

// Constant-time token verification against stored SHA-256 hash
schema.methods.verifyToken = function(candidateToken) {
    if (!candidateToken || !this.tokenHash) return false;
    const candidateHash = crypto.createHash('sha256').update(candidateToken).digest('hex');
    const hashBuffer = Buffer.from(this.tokenHash, 'utf8');
    const candidateBuffer = Buffer.from(candidateHash, 'utf8');
    if (hashBuffer.length !== candidateBuffer.length) return false;
    return crypto.timingSafeEqual(hashBuffer, candidateBuffer);
};

// Retrieve decrypted plaintext token for authorized transmission to ABDM gateway
schema.methods.getDecryptedToken = function() {
    if (this.status !== 'READY' || this.isExpired()) {
        return null;
    }
    if (this.tokenEncrypted) {
        return decryptToken(this.tokenEncrypted);
    }
    // Backward compatibility for un-migrated legacy plaintext records
    return this.token || null;
};

// Revoke token
schema.methods.revoke = function() {
    this.status = 'REVOKED';
    this.revokedAt = new Date();
    this.tokenEncrypted = null;
};

// Mark token as used
schema.methods.markUsed = function() {
    this.status = 'USED';
    this.usedAt = new Date();
};

schema.statics.encryptToken = encryptToken;
schema.statics.decryptToken = decryptToken;

module.exports = mongoose.models.AbdmLinkToken || mongoose.model('AbdmLinkToken', schema);
