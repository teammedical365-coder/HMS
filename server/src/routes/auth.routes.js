const express = require('express');
const router = express.Router();
const User = require('../models/user.model');
const jwt = require('jsonwebtoken');

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

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

    // Generate Persistent Patient ID (P-101, P-102...)
    let patientId = 'P-101'; // Default start
    try {
        const lastUser = await User.findOne({ 
            role: 'user', 
            patientId: { $exists: true } 
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

    // Create new user with role 'user' and generated patientId
    const user = new User({
      name,
      email,
      password,
      phone: phone || '',
      role: 'user',
      patientId: patientId
    });

    await user.save();

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id, email: user.email, role: user.role, patientId: user.patientId },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        patientId: user.patientId
      },
      token
    });
  } catch (error) {
    console.error('Signup error:', error);
    
    // Handle duplicate key error
    if (error.code === 11000) {
        if (error.keyPattern && error.keyPattern.email) {
            return res.status(400).json({ success: false, message: 'User with this email already exists' });
        }
        // Handle migration issue with username
        if (error.keyPattern && error.keyPattern.username) {
             await User.collection.dropIndex('username_1').catch(() => {});
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

    if (user.role === 'administrator') {
      return res.status(403).json({ success: false, message: 'Administrators must use the administrator login page' });
    }
    
    const allowedRoles = ['user', 'admin', 'doctor', 'lab', 'pharmacy', 'reception'];
    if (!allowedRoles.includes(user.role)) {
      return res.status(403).json({ success: false, message: 'Invalid user role.' });
    }

    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    const token = jwt.sign(
      { userId: user._id, email: user.email, role: user.role, patientId: user.patientId },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      message: 'Login successful',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        patientId: user.patientId
      },
      token
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Error during login', error: error.message });
  }
});

module.exports = router;