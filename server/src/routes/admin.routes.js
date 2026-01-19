const express = require('express');
const router = express.Router();
const User = require('../models/user.model');
const jwt = require('jsonwebtoken');
const { verifyAdmin, verifyAdminOrAdministrator } = require('../middleware/auth.middleware');

// JWT Secret (should be in .env file)
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Admin Signup Route - Only allows creating admin accounts
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

    // Check if administrator already exists
    const existingAdmin = await User.findOne({ email, role: 'administrator' });
    if (existingAdmin) {
      return res.status(400).json({ 
        success: false, 
        message: 'Administrator with this email already exists' 
      });
    }

    // Check if email exists with different role
    const existingUser = await User.findOne({ email });
    if (existingUser && existingUser.role !== 'administrator') {
      return res.status(400).json({ 
        success: false, 
        message: 'This email is already registered as a different user type. Please use a different email for administrator account.' 
      });
    }

    // Create new administrator user
    const admin = new User({
      name,
      email,
      password,
      phone: phone || '',
      role: 'administrator' // Explicitly set role to 'administrator'
    });

    await admin.save();

    // Generate JWT token
    const token = jwt.sign(
      { userId: admin._id, email: admin.email, role: admin.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      success: true,
      message: 'Administrator account created successfully',
      user: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role
      },
      token
    });
  } catch (error) {
    console.error('Admin signup error:', error);
    
    // Handle duplicate key error for username index (old schema migration issue)
    if (error.code === 11000 && error.keyPattern && error.keyPattern.username) {
      try {
        // Attempt to drop the old username index
        await User.collection.dropIndex('username_1');
        console.log('✓ Dropped old username_1 index, retrying admin signup...');
        
        // Retry creating the administrator
        const admin = new User({
          name: req.body.name,
          email: req.body.email,
          password: req.body.password,
          phone: req.body.phone || '',
          role: 'administrator'
        });
        
        await admin.save();
        
        const token = jwt.sign(
          { userId: admin._id, email: admin.email, role: admin.role },
          JWT_SECRET,
          { expiresIn: '7d' }
        );

        return res.status(201).json({
          success: true,
          message: 'Administrator account created successfully',
          user: {
            id: admin._id,
            name: admin.name,
            email: admin.email,
            role: admin.role
          },
          token
        });
      } catch (retryError) {
        console.error('Retry error:', retryError);
        return res.status(500).json({ 
          success: false, 
          message: 'Error creating administrator account. Please try again.', 
          error: retryError.message 
        });
      }
    }
    
    // Handle duplicate email error
    if (error.code === 11000 && error.keyPattern && error.keyPattern.email) {
      return res.status(400).json({ 
        success: false, 
        message: 'Administrator with this email already exists' 
      });
    }
    
    res.status(500).json({ 
      success: false, 
      message: 'Error creating administrator account', 
      error: error.message 
    });
  }
});

// Administrator Login Route - Only allows administrator role users
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email and password are required' 
      });
    }

    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid email or password' 
      });
    }

    // Check if user is administrator - reject if not administrator
    if (user.role !== 'administrator') {
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied. This login is only for administrators.' 
      });
    }

    // Check password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid email or password' 
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      message: 'Admin login successful',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      },
      token
    });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error during login', 
      error: error.message 
    });
  }
});

// Route to get all users - Only accessible to admins and administrators
router.get('/users', verifyAdminOrAdministrator, async (req, res) => {
  try {
    const users = await User.find({}, { password: 0 }).sort({ createdAt: -1 });
    
    res.json({
      success: true,
      users
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching users',
      error: error.message
    });
  }
});

// Route to update user role - Only accessible to admins and administrators
router.put('/users/:userId/role', verifyAdminOrAdministrator, async (req, res) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;

    if (!role) {
      return res.status(400).json({
        success: false,
        message: 'Role is required'
      });
    }

    // Validate role
    const allowedRoles = ['user', 'admin', 'doctor', 'lab', 'pharmacy', 'reception'];
    // Administrators can also change to administrator, but admins cannot
    const userRole = req.user.role;
    if (userRole === 'administrator' && role === 'administrator') {
      // Administrator can change roles to administrator
      allowedRoles.push('administrator');
    }
    
    if (!allowedRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        message: `Invalid role. Allowed roles are: ${allowedRoles.join(', ')}`
      });
    }

    // Prevent changing own role if you're an admin (not administrator)
    if (userRole === 'admin' && userId === req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'You cannot change your own role'
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Prevent admins from modifying administrators
    if (userRole === 'admin' && user.role === 'administrator') {
      return res.status(403).json({
        success: false,
        message: 'Admins cannot modify administrator accounts'
      });
    }

    user.role = role;
    await user.save();

    res.json({
      success: true,
      message: 'User role updated successfully',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Update user role error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating user role',
      error: error.message
    });
  }
});

// Route to delete user - Only accessible to admins and administrators
router.delete('/users/:userId', verifyAdminOrAdministrator, async (req, res) => {
  try {
    const { userId } = req.params;
    const userRole = req.user.role;

    // Prevent deleting own account
    if (userId === req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'You cannot delete your own account'
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Prevent admins from deleting administrators
    if (userRole === 'admin' && user.role === 'administrator') {
      return res.status(403).json({
        success: false,
        message: 'Admins cannot delete administrator accounts'
      });
    }

    await User.findByIdAndDelete(userId);

    res.json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting user',
      error: error.message
    });
  }
});

// Route to create users - Only accessible to admins and administrators
// But admins can only create: doctor, lab, pharmacy, reception
// Administrators can create: admin, doctor, lab, pharmacy, reception
router.post('/users', verifyAdminOrAdministrator, async (req, res) => {
  try {
    const { name, email, password, phone, role, services } = req.body;
    const userRole = req.user.role;

    // Validation
    if (!name || !email || !password || !role) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, password, and role are required'
      });
    }

    // Validate role based on who is creating
    let allowedRoles;
    if (userRole === 'administrator') {
      // Administrators can create admin, doctor, lab, pharmacy, reception
      allowedRoles = ['admin', 'doctor', 'lab', 'pharmacy', 'reception'];
    } else if (userRole === 'admin') {
      // Admins can only create doctor, lab, pharmacy, reception
      allowedRoles = ['doctor', 'lab', 'pharmacy', 'reception'];
    } else {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    if (!allowedRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        message: `Invalid role. Allowed roles are: ${allowedRoles.join(', ')}`
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

    // Validate services for doctor role
    if (role === 'doctor') {
      if (!services || !Array.isArray(services) || services.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'At least one service is required for doctor role'
        });
      }
      
      const validServices = ['ivf', 'iui', 'icsi', 'egg-freezing', 'genetic-testing', 'donor-program', 'male-fertility', 'surrogacy', 'fertility-surgery'];
      const invalidServices = services.filter(s => !validServices.includes(s));
      if (invalidServices.length > 0) {
        return res.status(400).json({
          success: false,
          message: `Invalid services: ${invalidServices.join(', ')}`
        });
      }
    }

    // Create new user
    const user = new User({
      name,
      email,
      password,
      phone: phone || '',
      role,
      services: role === 'doctor' ? services : []
    });

    await user.save();

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
        services: user.services || []
      }
    });
  } catch (error) {
    console.error('Create user error:', error);
    
    // Handle duplicate email error
    if (error.code === 11000 && error.keyPattern && error.keyPattern.email) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Error creating user',
      error: error.message
    });
  }
});

module.exports = router;

