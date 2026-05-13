/**
 * Validates password strength.
 * Returns null if valid, or an error message string if invalid.
 * Rules: min 8 chars, at least 1 number, at least 1 letter.
 */
function validatePassword(password) {
    if (!password || typeof password !== 'string') return 'Password is required';
    if (password.length < 8) return 'Password must be at least 8 characters long';
    if (!/[a-zA-Z]/.test(password)) return 'Password must contain at least one letter';
    if (!/[0-9]/.test(password)) return 'Password must contain at least one number';
    return null;
}

module.exports = validatePassword;
