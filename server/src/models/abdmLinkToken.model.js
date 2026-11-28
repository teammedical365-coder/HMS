'use strict';
const mongoose = require('mongoose');
const crypto = require('crypto');

const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const CURRENT_KEY_VERSION = 2;
const FORBIDDEN_DEFAULT_KEYS = new Set([
    'medical365-default-abdm-secret-key-32b',
    'default-secret',
    'changeme',
    'secret'
]);

class AbdmEncryptionConfigError extends Error {
    constructor(message) {
        super(message);
        this.name = 'AbdmEncryptionConfigError';
        this.status = 503;
        this.isConfigError = true;
    }
}

function validateEncryptionKey(rawKey = process.env.ABDM_TOKEN_ENCRYPTION_KEY) {
    const keyStr = typeof rawKey === 'string' ? rawKey.trim() : '';
    if (!keyStr) {
        throw new AbdmEncryptionConfigError(
            'ABDM_TOKEN_ENCRYPTION_KEY is required and must be explicitly configured (no fallback key is allowed).'
        );
    }
    if (FORBIDDEN_DEFAULT_KEYS.has(keyStr)) {
        throw new AbdmEncryptionConfigError(
            'ABDM_TOKEN_ENCRYPTION_KEY cannot use an insecure placeholder or default key.'
        );
    }
    if (
        (process.env.JWT_SECRET && keyStr === String(process.env.JWT_SECRET).trim()) ||
        (process.env.JWT_REFRESH_SECRET && keyStr === String(process.env.JWT_REFRESH_SECRET).trim())
    ) {
        throw new AbdmEncryptionConfigError(
            'ABDM_TOKEN_ENCRYPTION_KEY must be distinct from JWT_SECRET and JWT_REFRESH_SECRET.'
        );
    }
    if (/^[0-9a-fA-F]{64}$/.test(keyStr)) {
        return {
            primaryKey: Buffer.from(keyStr, 'hex'),
            legacyShaKey: crypto.createHash('sha256').update(keyStr, 'utf8').digest(),
            format: 'hex256'
        };
    }
    if (keyStr.length < 32) {
        throw new AbdmEncryptionConfigError(
            'ABDM_TOKEN_ENCRYPTION_KEY must be at least 32 characters (or a 64-character hex 256-bit key).'
        );
    }
    const primaryKey = Buffer.from(
        crypto.hkdfSync(
            'sha256',
            Buffer.from(keyStr, 'utf8'),
            Buffer.from('medical365:abdm:link-token:salt:v2', 'utf8'),
            Buffer.from('aes-256-gcm:encryption-key', 'utf8'),
            32
        )
    );
    const legacyShaKey = crypto.createHash('sha256').update(keyStr, 'utf8').digest();
    return { primaryKey, legacyShaKey, format: 'passphrase' };
}

function validateEncryptionConfig({ requireKey = false } = {}) {
    const rawKey = process.env.ABDM_TOKEN_ENCRYPTION_KEY;
    if (!rawKey || !String(rawKey).trim()) {
        if (requireKey) {
            validateEncryptionKey(rawKey);
        }
        return { valid: false, configured: false, reason: 'ABDM_TOKEN_ENCRYPTION_KEY is not set' };
    }
    const derived = validateEncryptionKey(rawKey);
    return { valid: true, configured: true, format: derived.format };
}

function getCandidateDecryptionKeys() {
    const { primaryKey, legacyShaKey } = validateEncryptionKey(process.env.ABDM_TOKEN_ENCRYPTION_KEY);
    const keys = [primaryKey, legacyShaKey];

    // Optional comma-separated rotated previous explicit ABDM encryption keys for zero-downtime recovery
    const prevRaw = process.env.ABDM_TOKEN_ENCRYPTION_PREVIOUS_KEYS || '';
    if (prevRaw.trim()) {
        for (const item of prevRaw.split(',').map((s) => s.trim()).filter(Boolean)) {
            if (FORBIDDEN_DEFAULT_KEYS.has(item)) continue;
            if (process.env.JWT_SECRET && item === String(process.env.JWT_SECRET).trim()) continue;
            try {
                const prev = validateEncryptionKey(item);
                keys.push(prev.primaryKey, prev.legacyShaKey);
            } catch (_) {
                // Skip malformed rotation keys
            }
        }
    }
    return keys;
}

function encryptToken(plainToken) {
    if (!plainToken) return null;
    const { primaryKey } = validateEncryptionKey(process.env.ABDM_TOKEN_ENCRYPTION_KEY);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, primaryKey, iv, { authTagLength: 16 });
    let encrypted = cipher.update(String(plainToken), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return `v${CURRENT_KEY_VERSION}:${iv.toString('hex')}:${authTag}:${encrypted}`;
}

function tryDecryptWithKey(keyBuffer, ivHex, authTagHex, encryptedHex) {
    if (!ivHex || !authTagHex || !encryptedHex) return null;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    if (iv.length !== 12 || authTag.length !== 16) return null;
    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, keyBuffer, iv, { authTagLength: 16 });
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

function decryptToken(encryptedData) {
    if (!encryptedData || typeof encryptedData !== 'string') return null;

    // Will throw AbdmEncryptionConfigError immediately if key is missing/invalid — never falls back
    const candidateKeys = getCandidateDecryptionKeys();

    const parts = encryptedData.split(':');
    let ivHex;
    let authTagHex;
    let encryptedHex;

    if (parts.length === 4 && parts[0] === `v${CURRENT_KEY_VERSION}`) {
        [, ivHex, authTagHex, encryptedHex] = parts;
    } else if (parts.length === 3) {
        [ivHex, authTagHex, encryptedHex] = parts;
    } else {
        return null;
    }

    for (const keyBuf of candidateKeys) {
        try {
            const plain = tryDecryptWithKey(keyBuf, ivHex, authTagHex, encryptedHex);
            if (plain) return plain;
        } catch (_) {
            // Try next explicitly configured key
        }
    }
    return null;
}

// ABDM-issued link token per patient (needed for HIP-initiated care-context linking).
const schema = new mongoose.Schema({
    hospitalId:        { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', required: true },
    patientId:         { type: mongoose.Schema.Types.ObjectId, refPath: 'patientModel', required: true },
    patientModel:      { type: String, enum: ['User', 'ClinicPatient'], default: 'User' },
    abhaAddress:       { type: String, default: null },
    requestId:         { type: String, default: null, index: true }, // REQUEST-ID of our generate-token call
    token:             { type: String, default: null },              // Legacy field only; new writes keep null
    tokenHash:         { type: String, default: null, index: true }, // SHA-256 cryptographic hash
    tokenEncrypted:    { type: String, default: null },              // AES-256-GCM ciphertext
    encryptionVersion: { type: Number, default: CURRENT_KEY_VERSION },
    status:            { type: String, enum: ['PENDING', 'READY', 'FAILED', 'REVOKED', 'EXPIRED', 'USED'], default: 'PENDING' },
    expiresAt:         { type: Date, default: null },
    usedAt:            { type: Date, default: null },
    revokedAt:         { type: Date, default: null },
    error:             { type: String, default: null },
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
    const ciphertext = encryptToken(plainToken); // Validates key before altering record
    this.tokenHash = crypto.createHash('sha256').update(plainToken).digest('hex');
    this.tokenEncrypted = ciphertext;
    this.encryptionVersion = CURRENT_KEY_VERSION;
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

// Retrieve decrypted plaintext token for authorized transmission to ABDM gateway.
// Never overwrites or destroys stored encrypted records if decryption fails.
schema.methods.getDecryptedToken = function() {
    if (this.status !== 'READY' || this.isExpired()) {
        return null;
    }
    if (this.tokenEncrypted) {
        return decryptToken(this.tokenEncrypted);
    }
    return this.token || null;
};

// Non-destructive recovery/migration helper for legacy plaintext or SHA256-derived ciphertexts
schema.methods.migrateEncryptionIfNeeded = function() {
    if (this.status !== 'READY' || this.isExpired()) return false;
    if (this.token && !this.tokenEncrypted) {
        this.setSecureToken(this.token, this.expiresAt ? Math.max(1, Math.ceil((this.expiresAt - Date.now()) / 60000)) : 60);
        return true;
    }
    if (this.tokenEncrypted && !this.tokenEncrypted.startsWith(`v${CURRENT_KEY_VERSION}:`)) {
        const plain = decryptToken(this.tokenEncrypted);
        if (!plain) return false; // Preserve unreadable ciphertext intact; do not destroy
        this.tokenEncrypted = encryptToken(plain);
        this.encryptionVersion = CURRENT_KEY_VERSION;
        return true;
    }
    return false;
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
schema.statics.validateEncryptionConfig = validateEncryptionConfig;
schema.statics.validateEncryptionKey = validateEncryptionKey;
schema.statics.AbdmEncryptionConfigError = AbdmEncryptionConfigError;

module.exports = mongoose.models.AbdmLinkToken || mongoose.model('AbdmLinkToken', schema);
