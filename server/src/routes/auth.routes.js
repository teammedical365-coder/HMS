const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const User = require('../models/user.model');
const Role = require('../models/role.model');
const Hospital = require('../models/hospital.model');
const jwt = require('jsonwebtoken');

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

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
router.post('/signup', async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;

    // Validation
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, and password are required'
      });
    }

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
        userId: user._id,
        email: user.email,
        roleId: String(defaultRole._id),
        hospitalId: user.hospitalId ? String(user.hospitalId) : null
      },
      JWT_SECRET,
      { expiresIn: '7d' }
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
      error: error.message
    });
  }
});

// Login Route
router.post('/login', async (req, res) => {
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

    // Central admins must use their dedicated login pages
    if (user.role === 'superadmin' || user.role === 'centraladmin') {
      return res.status(403).json({ success: false, message: 'Central Admins must use the /supremeadmin/login page' });
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
          name: { $regex: new RegExp(`^${user.role}$`, 'i') }
        });
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
      return res.status(403).json({ success: false, message: 'Global Admin accounts must use the dedicated central admin login page' });
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

    const token = jwt.sign(
      {
        userId: user._id,
        email: user.email,
        roleId: String(user.role),
        hospitalId: user.hospitalId ? String(user.hospitalId) : null
      },
      JWT_SECRET,
      { expiresIn: '7d' }
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
    res.status(500).json({ success: false, message: 'Error during login', error: error.message });
  }
});

module.exports = router;