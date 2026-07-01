const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const User = require('../models/user.model');
const Role = require('../models/role.model');
const Hospital = require('../models/hospital.model');
const jwt = require('jsonwebtoken');

const { JWT_SECRET, JWT_EXPIRES_IN } = require('../config/jwt');
const { loginLimiter, signupLimiter } = require('../middleware/rateLimiter');
const validatePassword = require('../utils/validatePassword');
const { verifyToken } = require('../middleware/auth.middleware');
const TokenBlacklist = require('../models/tokenBlacklist.model');
const auditLog = require('../middleware/audit.middleware');
const { v4: uuidv4 } = require('uuid');

/**
 * Helper: Build user response with full role data
 */
async function buildUserResponse(user) {
  let roleData = null;
  let roleName = null;

  const specialRoles = ['superadmin', 'centraladmin', 'hospitaladmin'];

  if (specialRoles.includes(user.role)) {
    roleName = user.role;
    const isCentral = user.role === 'centraladmin' || user.role === 'superadmin';
    roleData = {
      name: user.role,
      permissions: isCentral ? ['*'] : ['admin_manage_roles', 'admin_view_stats'],
      dashboardPath: isCentral ? '/supremeadmin' : '/hospitaladmin',
      navLinks: [],
      isSystemRole: true
    };
  } else if (user.role) {
    roleData = await Role.findById(user.role);
    roleName = roleData ? roleData.name : null;
  }

  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role: roleName, // String name for display
    roleId: user.role, // ObjectId or special string
    patientId: user.patientId || null,
    hospitalId: user.hospitalId || null,
    permissions: roleData ? roleData.permissions : [],
    dashboardPath: roleData ? roleData.dashboardPath : '/',
    navLinks: roleData ? roleData.navLinks : []
  };
}

// Signup Route
router.post('/signup', signupLimiter, async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Name, email, and password are required' });
    }
    const pwErr = validatePassword(password);
    if (pwErr) return res.status(400).json({ success: false, message: pwErr });

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists'
      });
    }

    // Find the default "Patient" or "User" role from the DB
    let defaultRole = await Role.findOne({ name: { $in: ['Patient', 'patient', 'User', 'user'] } });
    if (!defaultRole) {
      // Fallback: create a minimal patient role if none exists
      defaultRole = await Role.create({
        name: 'Patient',
        description: 'Default patient role',
        permissions: ['patient_view'],
        dashboardPath: '/dashboard',
        navLinks: [
          { label: 'Services', path: '/services' },
          { label: 'Doctors', path: '/doctors' },
          { label: 'Appointment', path: '/appointment' },
          { label: 'Lab Reports', path: '/lab-reports' },
          { label: 'Dashboard', path: '/dashboard' }
        ],
        isSystemRole: false
      });
    }

    // Generate Persistent Patient ID (P-101, P-102...)
    let patientId = 'P-101';
    try {
      const lastUser = await User.findOne({
        patientId: { $exists: true, $ne: null }
      }).sort({ createdAt: -1 });

      if (lastUser && lastUser.patientId) {
        const parts = lastUser.patientId.split('-');
        if (parts.length === 2 && !isNaN(parts[1])) {
          const nextNum = parseInt(parts[1]) + 1;
          patientId = `P-${nextNum}`;
        }
      }
    } catch (pidError) {
      console.warn('Error generating patientId, using fallback', pidError);
    }

    // Create new user with dynamic role reference
    const user = new User({
      name,
      email,
      password,
      phone: phone || '',
      role: defaultRole._id, // ObjectId reference to Role
      patientId: patientId
    });

    await user.save();

    // Generate JWT token — include hospitalId for tenant DB routing
    const token = jwt.sign(
      {
        jti: uuidv4(),
        userId: user._id,
        email: user.email,
        roleId: String(defaultRole._id),
        hospitalId: user.hospitalId ? String(user.hospitalId) : null,
        tv: user.tokenVersion ?? 0,
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    const userData = await buildUserResponse(user);

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      user: userData,
      token
    });
  } catch (error) {
    console.error('Signup error:', error);

    // Handle duplicate key error
    if (error.code === 11000) {
      if (error.keyPattern && error.keyPattern.email) {
        return res.status(400).json({ success: false, message: 'User with this email already exists' });
      }
      if (error.keyPattern && error.keyPattern.username) {
        await User.collection.dropIndex('username_1').catch(() => { });
        return res.status(500).json({ success: false, message: 'System update in progress. Please try again.' });
      }
    }

    res.status(500).json({
      success: false,
      message: 'Error creating user',
    });
  }
});

// Login Route
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { email, password, hospitalId } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    // Central admins must use their dedicated login pages — use generic message to avoid enumeration
    if (user.role === 'superadmin' || user.role === 'centraladmin') {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }


    // Dynamic validation: user must have a valid role assigned
    if (!user.role) {
      return res.status(403).json({ success: false, message: 'No role assigned. Contact admin.' });
    }

    // Verify the role exists in the DB (handle both ObjectId and legacy string)
    let roleData = null;
    if (user.role === 'hospitaladmin') {
      roleData = {
          name: 'hospitaladmin',
          permissions: ['admin_manage_roles', 'admin_view_stats'],
          dashboardPath: '/hospitaladmin',
          navLinks: [],
          isSystemRole: true
      };
    } else {
      if (mongoose.Types.ObjectId.isValid(user.role)) {
        roleData = await Role.findById(user.role);
      }
      // Fallback: legacy string like 'admin', 'doctor' — look up by name
      if (!roleData) {
        roleData = await Role.findOne({
          hospitalId: user.hospitalId || null,
          name: { $regex: new RegExp(`^${user.role}$`, 'i') }
        });
        if (!roleData && user.hospitalId) {
          roleData = await Role.findOne({
            hospitalId: null,
            name: { $regex: new RegExp(`^${user.role}$`, 'i') }
          });
        }
        // Auto-migrate to ObjectId
        if (roleData) {
          user.role = roleData._id;
          await user.save();
        }
      }
    }
    if (!roleData) {
      return res.status(403).json({ success: false, message: 'Your assigned role no longer exists. Contact admin.' });
    }

    if (roleData.name && ['superadmin', 'centraladmin'].includes(roleData.name.toLowerCase())) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    // STRICT HOSPITAL ROW-LEVEL SECURITY CHECK
    const globalAdminRoles = ['superadmin', 'centraladmin'];
    const userRoleStr = roleData.name ? roleData.name.toLowerCase() : '';
    const isGlobalAdmin = globalAdminRoles.includes(userRoleStr);

    if (!isGlobalAdmin) {
        if (hospitalId) {
            // Staff/HospitalAdmin attempting to log in via a specific slug portal
            if (!user.hospitalId || String(user.hospitalId) !== String(hospitalId)) {
                return res.status(403).json({ success: false, message: 'Access denied: You are not authorized for this clinic. Check the URL.' });
            }
        } else {
            // hospitaladmin can always log in via /login (simple clinic admins have no subdomain portal)
            // Only block non-admin staff who must use their clinic's subdomain portal
            if (user.hospitalId && userRoleStr !== 'hospitaladmin') {
                return res.status(403).json({ success: false, message: 'Access denied: Please log in using your specific clinic portal URL.' });
            }
        }
    } else {
        // Global Admins should not be logging in via a specific hospital portal URL (they don't have one)
        if (hospitalId) {
            return res.status(403).json({ success: false, message: 'Global Admins must use the Central Admin login, not a clinic portal.' });
        }
    }

    // If MFA is enabled, issue a short-lived pre-auth token instead of a full session token.
    // The client must POST this + a TOTP code to /api/mfa/complete-login to get a real token.
    const mfaUser = await require('../models/user.model').findById(user._id).select('mfaEnabled');
    if (mfaUser?.mfaEnabled) {
      const preAuthToken = jwt.sign(
        { mfa_pending: true, userId: String(user._id) },
        JWT_SECRET,
        { expiresIn: '5m' }
      );
      return res.json({ success: true, mfaRequired: true, preAuthToken });
    }

    const token = jwt.sign(
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

    // Build user response with role data (roleData is already fetched above)
    let clinicType = null;
    if (user.hospitalId) {
      try {
        const hosp = await Hospital.findById(user.hospitalId).select('clinicType');
        clinicType = hosp?.clinicType || 'hospital';
      } catch (_) {}
    }

    const userData = {
      id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: roleData.name,
      roleId: String(user.role),
      patientId: user.patientId || null,
      hospitalId: user.hospitalId ? String(user.hospitalId) : null,
      clinicType,
      permissions: roleData.permissions || [],
      dashboardPath: roleData.dashboardPath || '/',
      navLinks: roleData.navLinks || []
    };

    res.json({
      success: true,
      message: 'Login successful',
      user: userData,
      token
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Error during login' });
  }
});

// POST /api/auth/revoke-all-sessions — bump tokenVersion to invalidate every outstanding token for this user
router.post('/revoke-all-sessions', verifyToken, async (req, res) => {
    try {
        await require('../models/user.model').findByIdAndUpdate(
            req.user._id,
            { $inc: { tokenVersion: 1 } }
        );
        res.json({ success: true, message: 'All sessions revoked. Please log in again on all devices.' });
    } catch {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// POST /api/auth/logout — blacklist the current token so it can never be reused
router.post('/logout', verifyToken, auditLog('STAFF_LOGOUT'), async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        const token = authHeader.split(' ')[1];
        const decoded = require('jsonwebtoken').decode(token);

        if (decoded?.jti && decoded?.exp) {
            await TokenBlacklist.create({
                jti: decoded.jti,
                expireAt: new Date(decoded.exp * 1000),
            });
        }

        res.json({ success: true, message: 'Logged out successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

module.exports = router;