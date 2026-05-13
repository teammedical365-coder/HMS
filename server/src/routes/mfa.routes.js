const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { authenticator } = require('otplib');
const qrcode = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const { verifyToken } = require('../middleware/auth.middleware');
const { JWT_SECRET, JWT_EXPIRES_IN } = require('../config/jwt');
const { otpLimiter } = require('../middleware/rateLimiter');
const User = require('../models/user.model');
const Role = require('../models/role.model');
const Hospital = require('../models/hospital.model');

// POST /api/mfa/setup — generate a TOTP secret and return a QR code
router.post('/setup', verifyToken, async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select('+mfaSecret');
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });
        if (user.mfaEnabled) return res.status(400).json({ success: false, message: 'MFA is already enabled' });

        const secret = authenticator.generateSecret();
        const otpAuthUrl = authenticator.keyuri(user.email, 'Medical365', secret);

        user.mfaSecret = secret;
        await user.save();

        const qrDataUrl = await qrcode.toDataURL(otpAuthUrl);
        res.json({ success: true, qrCode: qrDataUrl, manualKey: secret });
    } catch {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// POST /api/mfa/verify-setup — confirm TOTP code to activate MFA
router.post('/verify-setup', verifyToken, async (req, res) => {
    try {
        const { token } = req.body;
        if (!token || !/^\d{6}$/.test(token)) {
            return res.status(400).json({ success: false, message: 'A 6-digit code is required' });
        }

        const user = await User.findById(req.user._id).select('+mfaSecret');
        if (!user || !user.mfaSecret) {
            return res.status(400).json({ success: false, message: 'Run /mfa/setup first' });
        }

        const isValid = authenticator.verify({ token, secret: user.mfaSecret });
        if (!isValid) return res.status(400).json({ success: false, message: 'Invalid code. Try again.' });

        user.mfaEnabled = true;
        await user.save();

        res.json({ success: true, message: 'MFA enabled successfully' });
    } catch {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// POST /api/mfa/complete-login — exchange pre-auth token + TOTP code for a full JWT
// Rate-limited to 5 attempts per hour to prevent TOTP brute-force
router.post('/complete-login', otpLimiter, async (req, res) => {
    try {
        const { preAuthToken, token } = req.body;
        if (!preAuthToken || !token || !/^\d{6}$/.test(token)) {
            return res.status(400).json({ success: false, message: 'preAuthToken and 6-digit code are required' });
        }

        // Verify the pre-auth token — it must have mfa_pending flag
        let decoded;
        try {
            decoded = jwt.verify(preAuthToken, JWT_SECRET);
        } catch {
            return res.status(401).json({ success: false, message: 'Pre-auth token invalid or expired. Please log in again.' });
        }

        if (!decoded.mfa_pending || !decoded.userId) {
            return res.status(401).json({ success: false, message: 'Invalid token type' });
        }

        const user = await User.findById(decoded.userId).select('+mfaSecret');
        if (!user || !user.mfaEnabled || !user.mfaSecret) {
            return res.status(400).json({ success: false, message: 'MFA not configured for this user' });
        }

        const isValid = authenticator.verify({ token, secret: user.mfaSecret });
        if (!isValid) return res.status(401).json({ success: false, message: 'Invalid MFA code' });

        // TOTP passed — issue the real session JWT
        const specialRoles = ['superadmin', 'centraladmin', 'hospitaladmin'];
        let roleData = null;
        if (specialRoles.includes(user.role)) {
            const isCentral = user.role === 'centraladmin' || user.role === 'superadmin';
            roleData = {
                name: user.role,
                permissions: isCentral ? ['*'] : ['admin_manage_roles', 'admin_view_stats'],
                dashboardPath: isCentral ? '/supremeadmin' : '/hospitaladmin',
                navLinks: [],
            };
        } else {
            const mongoose = require('mongoose');
            if (mongoose.Types.ObjectId.isValid(user.role)) roleData = await Role.findById(user.role);
            if (!roleData) roleData = await Role.findOne({ name: new RegExp(`^${user.role}$`, 'i') });
        }

        if (!roleData) {
            return res.status(403).json({ success: false, message: 'Role no longer exists. Contact admin.' });
        }

        let clinicType = null;
        if (user.hospitalId) {
            try {
                const hosp = await Hospital.findById(user.hospitalId).select('clinicType');
                clinicType = hosp?.clinicType || 'hospital';
            } catch (_) {}
        }

        const fullToken = jwt.sign(
            {
                jti: uuidv4(),
                userId: user._id,
                email: user.email,
                roleId: String(user.role),
                hospitalId: user.hospitalId ? String(user.hospitalId) : null,
                tv: user.tokenVersion ?? 0,
            },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES_IN }
        );

        res.json({
            success: true,
            message: 'Login successful',
            token: fullToken,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: roleData.name,
                roleId: String(user.role),
                hospitalId: user.hospitalId ? String(user.hospitalId) : null,
                clinicType,
                permissions: roleData.permissions || [],
                dashboardPath: roleData.dashboardPath || '/',
                navLinks: roleData.navLinks || [],
            },
        });
    } catch {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// DELETE /api/mfa/disable — disable MFA (requires current TOTP code)
router.delete('/disable', verifyToken, async (req, res) => {
    try {
        const { token } = req.body;
        if (!token || !/^\d{6}$/.test(token)) {
            return res.status(400).json({ success: false, message: 'Current MFA code required to disable' });
        }

        const user = await User.findById(req.user._id).select('+mfaSecret');
        if (!user || !user.mfaEnabled) {
            return res.status(400).json({ success: false, message: 'MFA is not enabled' });
        }

        const isValid = authenticator.verify({ token, secret: user.mfaSecret });
        if (!isValid) return res.status(401).json({ success: false, message: 'Invalid MFA code' });

        user.mfaEnabled = false;
        user.mfaSecret = null;
        await user.save();

        res.json({ success: true, message: 'MFA disabled' });
    } catch {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

module.exports = router;
