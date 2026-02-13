const express = require('express');
const router = express.Router();
const User = require('../models/user.model');
const Role = require('../models/role.model');
const jwt = require('jsonwebtoken');
const { verifyAdmin, verifyAdminOrAdministrator, verifyToken } = require('../middleware/auth.middleware');
const { nanoid } = require('nanoid');

// --- IMPORT ENTITY MODELS ---
const Doctor = require('../models/doctor.model');
const Lab = require('../models/lab.model');
const Pharmacy = require('../models/pharmacy.model');
const Reception = require('../models/reception.model');

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

/**
 * Helper: Build user response with full role data
 */
async function buildUserResponse(user) {
    const mongoose = require('mongoose');
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
        // Try ObjectId first
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
        roleName = roleData ? roleData.name : String(user.role);
    }

    return {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: roleName,
        roleId: user.role,
        patientId: user.patientId || null,
        permissions: roleData ? roleData.permissions : [],
        dashboardPath: roleData ? roleData.dashboardPath : '/',
        navLinks: roleData ? roleData.navLinks : []
    };
}

// ==========================================
// 1. DYNAMIC ROLE MANAGEMENT ROUTES
// ==========================================

// Create a New Dynamic Role
router.post('/roles', verifyAdminOrAdministrator, async (req, res) => {
    try {
        const { name, permissions, description, dashboardPath, navLinks } = req.body;

        if (!name) return res.status(400).json({ success: false, message: 'Role name is required' });

        const existingRole = await Role.findOne({ name });
        if (existingRole) return res.status(400).json({ success: false, message: 'Role already exists' });

        const role = new Role({ name, permissions, description, dashboardPath, navLinks });
        await role.save();

        res.json({ success: true, message: 'Role created successfully', data: role });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get All Roles
router.get('/roles', verifyToken, async (req, res) => {
    try {
        const roles = await Role.find({});

        // Add user count for each role
        const rolesWithCounts = await Promise.all(roles.map(async (role) => {
            const count = await User.countDocuments({ role: role._id });
            return { ...role.toObject(), userCount: count };
        }));

        res.json({ success: true, data: rolesWithCounts });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Update an Existing Role
router.put('/roles/:roleId', verifyAdminOrAdministrator, async (req, res) => {
    try {
        const { roleId } = req.params;
        const { name, permissions, description, dashboardPath, navLinks } = req.body;

        const role = await Role.findById(roleId);
        if (!role) return res.status(404).json({ success: false, message: 'Role not found' });

        // Prevent renaming system roles
        if (role.isSystemRole && name && name !== role.name) {
            return res.status(403).json({ success: false, message: 'Cannot rename system roles' });
        }

        if (name) role.name = name;
        if (permissions) role.permissions = permissions;
        if (description !== undefined) role.description = description;
        if (dashboardPath !== undefined) role.dashboardPath = dashboardPath;
        if (navLinks !== undefined) role.navLinks = navLinks;

        await role.save();

        res.json({ success: true, message: 'Role updated successfully', data: role });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Delete a Role
router.delete('/roles/:roleId', verifyAdminOrAdministrator, async (req, res) => {
    try {
        const { roleId } = req.params;

        const role = await Role.findById(roleId);
        if (!role) return res.status(404).json({ success: false, message: 'Role not found' });

        if (role.isSystemRole) {
            return res.status(403).json({ success: false, message: 'Cannot delete system roles' });
        }

        // Check if users are assigned to this role
        const userCount = await User.countDocuments({ role: roleId });
        if (userCount > 0) {
            return res.status(400).json({
                success: false,
                message: `Cannot delete role. ${userCount} user(s) are still assigned to it. Reassign them first.`
            });
        }

        await Role.findByIdAndDelete(roleId);
        res.json({ success: true, message: 'Role deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==========================================
// 2. ADMIN AUTH ROUTES
// ==========================================

// Admin Signup Route — Only creates administrator accounts
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
            { userId: admin._id, email: admin.email, role: 'administrator' },
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
                role: 'administrator',
                permissions: ['*'],
                dashboardPath: '/administrator',
                navLinks: []
            },
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
            { userId: user._id, email: user.email, role: 'administrator' },
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
                role: 'administrator',
                permissions: ['*'],
                dashboardPath: '/administrator',
                navLinks: []
            },
            token
        });
    } catch (error) {
        console.error('Admin login error:', error);
        res.status(500).json({ success: false, message: 'Error during login', error: error.message });
    }
});

// ==========================================
// 3. USER MANAGEMENT ROUTES
// ==========================================

// Get all users (with populated role data)
router.get('/users', verifyAdminOrAdministrator, async (req, res) => {
    try {
        const users = await User.find({}, { password: 0 }).sort({ createdAt: -1 });

        // Build full response for each user
        const usersWithRoles = await Promise.all(users.map(async (user) => {
            return await buildUserResponse(user);
        }));

        res.json({ success: true, users: usersWithRoles });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error fetching users', error: error.message });
    }
});

// Update user role — accepts a roleId (ObjectId) from the DB
router.put('/users/:userId/role', verifyAdminOrAdministrator, async (req, res) => {
    try {
        const { userId } = req.params;
        const { roleId } = req.body;

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        // Cannot modify administrator accounts unless you are an administrator
        if (user.role === 'administrator' && req.user.role !== 'administrator') {
            return res.status(403).json({ success: false, message: 'Cannot modify administrator accounts' });
        }

        // Cannot change your own role
        if (userId === String(req.user._id)) {
            return res.status(403).json({ success: false, message: 'Cannot change your own role' });
        }

        // Validate the roleId exists in DB
        if (!roleId) {
            return res.status(400).json({ success: false, message: 'roleId is required' });
        }

        const roleDoc = await Role.findById(roleId);
        if (!roleDoc) {
            return res.status(400).json({ success: false, message: 'Invalid role. Role not found in database.' });
        }

        // Store old role name for entity profile cleanup
        let oldRoleName = null;
        if (user.role && user.role !== 'administrator') {
            const oldRole = await Role.findById(user.role);
            oldRoleName = oldRole ? oldRole.name.toLowerCase() : null;
        }

        // Update to new role
        user.role = roleId;
        await user.save();

        // Auto-create entity profiles based on role name
        const newRoleName = roleDoc.name.toLowerCase();
        try {
            if (newRoleName === 'doctor' && oldRoleName !== 'doctor') {
                // Check if doctor profile already exists
                const existingDoctor = await Doctor.findOne({ userId: user._id });
                if (!existingDoctor) {
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
                        doctorId, userId: user._id, name: user.name,
                        email: user.email, phone: user.phone, availability: defaultAvailability,
                        specialty: 'General', consultationFee: 0
                    });
                }
            } else if (newRoleName === 'lab' || newRoleName === 'lab technician') {
                const existingLab = await Lab.findOne({ userId: user._id });
                if (!existingLab) {
                    await Lab.create({ name: user.name, email: user.email, phone: user.phone, userId: user._id });
                }
            } else if (newRoleName === 'pharmacy' || newRoleName === 'pharmacist') {
                const existingPharmacy = await Pharmacy.findOne({ email: user.email });
                if (!existingPharmacy) {
                    await Pharmacy.create({ name: user.name, email: user.email, phone: user.phone, userId: user._id });
                }
            } else if (newRoleName === 'reception' || newRoleName === 'receptionist') {
                const existingReception = await Reception.findOne({ userId: user._id });
                if (!existingReception) {
                    await Reception.create({ userId: user._id });
                }
            }
        } catch (profileError) {
            console.error("Error creating linked profile:", profileError);
        }

        const updatedUser = await buildUserResponse(user);
        res.json({ success: true, message: 'User role updated successfully', user: updatedUser });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error updating user role', error: error.message });
    }
});

// Delete user
router.delete('/users/:userId', verifyAdminOrAdministrator, async (req, res) => {
    try {
        const { userId } = req.params;

        if (userId === String(req.user._id)) {
            return res.status(403).json({ success: false, message: 'Cannot delete own account' });
        }

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        if (user.role === 'administrator' && req.user.role !== 'administrator') {
            return res.status(403).json({ success: false, message: 'Cannot delete administrator' });
        }

        // Cascade delete entity profiles — check role name
        let roleName = null;
        if (user.role && user.role !== 'administrator') {
            const roleDoc = await Role.findById(user.role);
            roleName = roleDoc ? roleDoc.name.toLowerCase() : null;
        }

        if (roleName === 'doctor') await Doctor.findOneAndDelete({ userId: user._id });
        if (roleName === 'lab' || roleName === 'lab technician') await Lab.findOneAndDelete({ userId: user._id });
        if (roleName === 'pharmacy' || roleName === 'pharmacist') await Pharmacy.findOneAndDelete({ email: user.email });
        if (roleName === 'reception' || roleName === 'receptionist') await Reception.findOneAndDelete({ userId: user._id });

        await User.findByIdAndDelete(userId);

        res.json({ success: true, message: 'User and associated profile deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error deleting user', error: error.message });
    }
});

// Create User (by admin) — uses roleId from the DB
router.post('/users', verifyAdminOrAdministrator, async (req, res) => {
    try {
        const { name, email, password, phone, roleId, services } = req.body;

        if (!name || !email || !password || !roleId) {
            return res.status(400).json({ success: false, message: 'Name, email, password, and roleId are required' });
        }

        // Validate role exists
        const roleDoc = await Role.findById(roleId);
        if (!roleDoc) {
            return res.status(400).json({ success: false, message: 'Invalid role. Role not found in database.' });
        }

        const existingUser = await User.findOne({ email });
        if (existingUser) return res.status(400).json({ success: false, message: 'User already exists' });

        // Create the Auth User
        const user = new User({
            name,
            email: email.toLowerCase(),
            password,
            phone: phone || '',
            role: roleId,
            services: roleDoc.name.toLowerCase() === 'doctor' ? services : []
        });

        await user.save();

        // Auto-create linked entity profiles
        const roleName = roleDoc.name.toLowerCase();
        try {
            if (roleName === 'doctor') {
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
                    doctorId, userId: user._id, name: user.name,
                    email: user.email, phone: user.phone,
                    services: user.services, availability: defaultAvailability,
                    specialty: 'General', consultationFee: 0
                });
            } else if (roleName === 'lab' || roleName === 'lab technician') {
                await Lab.create({ name: user.name, email: user.email, phone: user.phone, userId: user._id });
            } else if (roleName === 'pharmacy' || roleName === 'pharmacist') {
                await Pharmacy.create({ name: user.name, email: user.email, phone: user.phone, userId: user._id });
            } else if (roleName === 'reception' || roleName === 'receptionist') {
                await Reception.create({ userId: user._id });
            }
        } catch (profileError) {
            console.error("Error creating linked profile:", profileError);
        }

        const userData = await buildUserResponse(user);

        res.status(201).json({
            success: true,
            message: `User and ${roleDoc.name} profile created successfully`,
            user: userData
        });
    } catch (error) {
        console.error('Create user error:', error);
        res.status(500).json({ success: false, message: 'Error creating user', error: error.message });
    }
});

module.exports = router;