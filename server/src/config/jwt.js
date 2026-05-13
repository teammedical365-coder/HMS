/**
 * Single source of truth for JWT configuration.
 * Crashes the process at startup if JWT_SECRET is not set — a missing secret
 * in production would otherwise silently fall back to a known string, allowing
 * anyone to forge tokens.
 */

let secret = process.env.JWT_SECRET;

if (!secret || secret.trim().length < 32) {
    if (process.env.NODE_ENV === 'production') {
        console.error('[FATAL] JWT_SECRET env var is missing or too short (min 32 chars). Set it before starting the server.');
        process.exit(1);
    } else {
        console.warn('[WARN] JWT_SECRET is missing or too short. Using a secure default for development.');
        secret = 'this_is_a_secure_fallback_secret_for_local_development_only_12345';
    }
}

// Production default is 8h; set JWT_EXPIRES_IN in .env to override (e.g. '1d' for convenience).
const defaultExpiry = process.env.NODE_ENV === 'production' ? '8h' : '7d';

module.exports = {
    JWT_SECRET: secret,
    JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || defaultExpiry,
};
