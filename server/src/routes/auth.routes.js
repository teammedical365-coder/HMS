const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const User = require('../models/user.model');
const Role = require('../models/role.model');
const jwt = require('jsonwebtoken');

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

/**
 * Helper: Build user response with full role data
 */
async function buildUserResponse(user) {
  let roleData = null;
  let roleName = null;

  if (user.role === 'administrator') {
    roleName = 'administrator';
    roleData = {
      name: 'administrator',
      permissions: ['*'],
      dashboardPath: '/administrator',
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
    roleId: user.role, // ObjectId or 'administrator'
    patientId: user.patientId || null,
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

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id, email: user.email, roleId: String(defaultRole._id) },
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
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    // Administrators must use the administrator login page
    if (user.role === 'administrator') {
      return res.status(403).json({ success: false, message: 'Administrators must use the administrator login page' });
    }

    // Dynamic validation: user must have a valid role assigned
    if (!user.role) {
      return res.status(403).json({ success: false, message: 'No role assigned. Contact admin.' });
    }

    // Verify the role exists in the DB (handle both ObjectId and legacy string)
    let roleData = null;
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
    if (!roleData) {
      return res.status(403).json({ success: false, message: 'Your assigned role no longer exists. Contact admin.' });
    }

    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    const token = jwt.sign(
      { userId: user._id, email: user.email, roleId: String(user.role) },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Build user response with role data (roleData is already fetched above)
    const userData = {
      id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: roleData.name,
      roleId: String(user.role),
      patientId: user.patientId || null,
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