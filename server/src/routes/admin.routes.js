const express = require('express');
const router = express.Router();
const User = require('../models/user.model');
const jwt = require('jsonwebtoken');
const { verifyAdmin, verifyAdminOrAdministrator, verifyToken } = require('../middleware/auth.middleware');
const { nanoid } = require('nanoid');

// --- IMPORT ENTITY MODELS ---
const Doctor = require('../models/doctor.model');
const Lab = require('../models/lab.model');
const Pharmacy = require('../models/pharmacy.model');
const Reception = require('../models/reception.model');
// --- IMPORT ROLE MODEL (New) ---
const Role = require('../models/role.model');

// JWT Secret (should be in .env file)
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// ==========================================
// 1. DYNAMIC ROLE MANAGEMENT ROUTES (NEW)
// ==========================================

// Create a New Dynamic Role (e.g., "Nurse", "IVF Coordinator")
router.post('/roles', verifyAdminOrAdministrator, async (req, res) => {
    try {
        const { name, permissions, description } = req.body;

        // Basic Validation
        if (!name) return res.status(400).json({ success: false, message: 'Role name is required' });

        const existingRole = await Role.findOne({ name });
        if (existingRole) return res.status(400).json({ success: false, message: 'Role already exists' });

        const role = new Role({ name, permissions, description });
        await role.save();

        res.json({ success: true, message: 'Role created successfully', data: role });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get All Roles (For Dropdowns in UI)
router.get('/roles', verifyToken, async (req, res) => {
    try {
        const roles = await Role.find({});
        res.json({ success: true, data: roles });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Manually Assign a Role to an Existing User
router.post('/assign-role', verifyAdminOrAdministrator, async (req, res) => {
    try {
        const { userId, roleId } = req.body;

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: 'User not found' });

        // Add role if not already present
        if (!user.roles.includes(roleId)) {
            user.roles.push(roleId);
            await user.save();
        }
        res.json({ success: true, message: 'Role assigned successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==========================================
// 2. EXISTING ADMIN ROUTES (UPDATED)
// ==========================================

// Admin Signup Route - Only allows creating admin accounts
router.post('/signup', async (req, res) => {
    try {
        const { name, email, password, phone } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ success: false, message: 'Name, email, and password are required' });
        }

        const existingAdmin = await User.findOne({ email, role: 'administrator' });
        if (existingAdmin) {
            return res.status(400).json({ success: false, message: 'Administrator with this email already exists' });
        }

        const existingUser = await User.findOne({ email });
        if (existingUser && existingUser.role !== 'administrator') {
            return res.status(400).json({ success: false, message: 'Email already registered as different user type.' });
        }

        const admin = new User({
            name, email, password, phone: phone || '', role: 'administrator'
        });

        await admin.save();

        const token = jwt.sign(
            { userId: admin._id, email: admin.email, role: admin.role },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.status(201).json({
            success: true,
            message: 'Administrator account created successfully',
            user: { id: admin._id, name: admin.name, email: admin.email, role: admin.role },
            token
        });
    } catch (error) {
        console.error('Admin signup error:', error);
        res.status(500).json({ success: false, message: 'Error creating administrator', error: error.message });
    }
});

// Administrator Login Route
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) return res.status(400).json({ success: false, message: 'Email and password required' });

        const user = await User.findOne({ email });
        if (!user) return res.status(401).json({ success: false, message: 'Invalid email or password' });

        if (user.role !== 'administrator') {
            return res.status(403).json({ success: false, message: 'Access denied. Administrator only.' });
        }

        const isPasswordValid = await user.comparePassword(password);
        if (!isPasswordValid) return res.status(401).json({ success: false, message: 'Invalid email or password' });

        const token = jwt.sign(
            { userId: user._id, email: user.email, role: user.role },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            success: true,
            message: 'Login successful',
            user: { id: user._id, name: user.name, email: user.email, role: user.role },
            token
        });
    } catch (error) {
        console.error('Admin login error:', error);
        res.status(500).json({ success: false, message: 'Error during login', error: error.message });
    }
});

// Get all users
router.get('/users', verifyAdminOrAdministrator, async (req, res) => {
    try {
        // UPDATED: Populate 'roles' to see the new dynamic roles
        const users = await User.find({}, { password: 0 })
            .sort({ createdAt: -1 })
            .populate('roles', 'name');
        res.json({ success: true, users });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error fetching users', error: error.message });
    }
});

// Update user role
router.put('/users/:userId/role', verifyAdminOrAdministrator, async (req, res) => {
    try {
        const { userId } = req.params;
        // UPDATED: Destructure roleIds as well
        const { role, roleIds } = req.body;

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        if (req.user.role === 'admin' && user.role === 'administrator') {
            return res.status(403).json({ success: false, message: 'Cannot modify administrator accounts' });
        }

        // 1. Handle Legacy Role
        if (role) {
            const allowedRoles = ['user', 'admin', 'doctor', 'lab', 'pharmacy', 'reception'];
            if (req.user.role === 'administrator') allowedRoles.push('administrator');

            if (!allowedRoles.includes(role)) {
                return res.status(400).json({ success: false, message: `Invalid role. Allowed: ${allowedRoles.join(', ')}` });
            }
            if (req.user.role === 'admin' && userId === req.user.id) {
                return res.status(403).json({ success: false, message: 'Cannot change your own role' });
            }
            user.role = role;
        }

        // 2. Handle Dynamic Roles
        if (roleIds && Array.isArray(roleIds)) {
            user.roles = roleIds;
        }

        await user.save();

        res.json({
            success: true,
            message: 'User role updated successfully',
            user: { id: user._id, name: user.name, email: user.email, role: user.role, roles: user.roles }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error updating user role', error: error.message });
    }
});

// Delete user
router.delete('/users/:userId', verifyAdminOrAdministrator, async (req, res) => {
    try {
        const { userId } = req.params;

        if (userId === req.user.id) return res.status(403).json({ success: false, message: 'Cannot delete own account' });

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        if (req.user.role === 'admin' && user.role === 'administrator') {
            return res.status(403).json({ success: false, message: 'Cannot delete administrator' });
        }

        // --- CASCADE DELETE ENTITY PROFILES ---
        if (user.role === 'doctor') await Doctor.findOneAndDelete({ userId: user._id });
        if (user.role === 'lab') await Lab.findOneAndDelete({ email: user.email });
        if (user.role === 'pharmacy') await Pharmacy.findOneAndDelete({ email: user.email });
        if (user.role === 'reception') await Reception.findOneAndDelete({ email: user.email });

        await User.findByIdAndDelete(userId);

        res.json({ success: true, message: 'User and associated profile deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error deleting user', error: error.message });
    }
});

// --- UPDATED CREATE USER ROUTE ---
// Automatically creates independent profiles based on role AND assigns dynamic roles
router.post('/users', verifyAdminOrAdministrator, async (req, res) => {
    try {
        // UPDATED: Accept 'roleIds' from body
        const { name, email, password, phone, role, services, roleIds } = req.body;
        const userRole = req.user.role;

        if (!name || !email || !password || !role) {
            return res.status(400).json({ success: false, message: 'Name, email, password, and role required' });
        }

        // Role validation based on creator privileges
        let allowedRoles = userRole === 'administrator'
            ? ['admin', 'doctor', 'lab', 'pharmacy', 'reception', 'user']
            : ['doctor', 'lab', 'pharmacy', 'reception', 'user'];

        if (!allowedRoles.includes(role)) {
            return res.status(403).json({ success: false, message: `Access denied. You can only create: ${allowedRoles.join(', ')}` });
        }

        const existingUser = await User.findOne({ email });
        if (existingUser) return res.status(400).json({ success: false, message: 'User already exists' });

        // 1. Create the Auth User
        const user = new User({
            name,
            email: email.toLowerCase(),
            password, // Pre-save hook will hash this
            phone: phone || '',
            role,
            roles: roleIds || [], // UPDATED: Save the dynamic roles here
            services: role === 'doctor' ? services : []
        });

        await user.save();

        // 2. AUTOMATICALLY CREATE LINKED PROFILE BASED ON ROLE
        try {
            if (role === 'doctor') {
                let doctorId = nanoid(10);
                while (await Doctor.findOne({ doctorId })) doctorId = nanoid(10);

                const defaultAvailability = {
                    monday: { available: false, startTime: '09:00', endTime: '17:00' },
                    tuesday: { available: false, startTime: '09:00', endTime: '17:00' },
                    wednesday: { available: false, startTime: '09:00', endTime: '17:00' },
                    thursday: { available: false, startTime: '09:00', endTime: '17:00' },
                    friday: { available: false, startTime: '09:00', endTime: '17:00' },
                    saturday: { available: false, startTime: '09:00', endTime: '17:00' },
                    sunday: { available: false, startTime: '09:00', endTime: '17:00' }
                };

                await Doctor.create({
                    doctorId,
                    userId: user._id,
                    name: user.name,
                    email: user.email,
                    phone: user.phone,
                    services: user.services,
                    availability: defaultAvailability,
                    specialty: 'General',
                    consultationFee: 0
                });
            }
            else if (role === 'lab') {
                await Lab.create({
                    name: user.name,
                    email: user.email,
                    phone: user.phone,
                    userId: user._id
                });
            }
            else if (role === 'pharmacy') {
                await Pharmacy.create({
                    name: user.name,
                    email: user.email,
                    phone: user.phone,
                    userId: user._id
                });
            }
            else if (role === 'reception') {
                await Reception.create({
                    name: user.name,
                    email: user.email,
                    phone: user.phone,
                    userId: user._id
                });
            }
        } catch (profileError) {
            console.error("Error creating linked profile:", profileError);
        }

        res.status(201).json({
            success: true,
            message: `User and ${role} profile created successfully`,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                roles: user.roles
            }
        });

    } catch (error) {
        console.error('Create user error:', error);
        res.status(500).json({ success: false, message: 'Error creating user', error: error.message });
    }
});

module.exports = router;