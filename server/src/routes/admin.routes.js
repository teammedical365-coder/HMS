const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const User = require('../models/user.model');
const Role = require('../models/role.model');
const Hospital = require('../models/hospital.model');
const jwt = require('jsonwebtoken');
const { verifyAdmin, verifyAdminOrSuperAdmin, verifyToken } = require('../middleware/auth.middleware');
const { nanoid } = require('nanoid');

// Entity models
const Doctor = require('../models/doctor.model');
const Lab = require('../models/lab.model');
const Pharmacy = require('../models/pharmacy.model');
const Reception = require('../models/reception.model');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// ==========================================
// HELPERS
// ==========================================

/**
 * Build user response with full role data
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
        if (mongoose.Types.ObjectId.isValid(user.role)) {
            roleData = await Role.findById(user.role);
        }
        if (!roleData) {
            // Legacy string fallback - find role by name scoped to the user's hospital
            const query = { name: { $regex: new RegExp(`^${user.role}$`, 'i') } };
            if (user.hospitalId) query.hospitalId = user.hospitalId;
            roleData = await Role.findOne(query);
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
        hospitalId: user.hospitalId || null,
        permissions: roleData ? roleData.permissions : [],
        dashboardPath: roleData ? roleData.dashboardPath : '/',
        navLinks: roleData ? roleData.navLinks : [],
        avatar: user.avatar || null,
        departments: user.departments || []
    };
}

/**
 * Get hospitalId filter for a request.
 * - centraladmin/superadmin: no filter (sees all) unless ?hospitalId= query param
 * - hospitaladmin: always scoped to their hospitalId
 * - others: scoped to their hospitalId
 */
function getHospitalFilter(req) {
    const role = req.user.role;
    const isCentral = role === 'centraladmin' || role === 'superadmin';

    if (isCentral) {
        // Central admin can optionally filter by ?hospitalId=xxx
        const qHospitalId = req.query.hospitalId;
        return qHospitalId ? { hospitalId: qHospitalId } : {};
    }

    // Hospital admin or staff — always scoped
    const hid = req.user.hospitalId;
    return hid ? { hospitalId: hid } : { hospitalId: null };
}

// ==========================================
// 1. ROLE MANAGEMENT — HOSPITAL-SCOPED
// ==========================================

// Get All Roles (scoped to hospital)
router.get('/roles', verifyToken, async (req, res) => {
    try {
        const role = req.user.role;
        const isCentral = role === 'centraladmin' || role === 'superadmin';

        let query = {};
        if (!isCentral) {
            // Hospital admin: see roles for their hospital + global roles (hospitalId=null)
            const hid = req.user.hospitalId;
            query = { $or: [{ hospitalId: hid }, { hospitalId: null }] };
        }
        // Central admin: see everything

        const roles = await Role.find(query).sort({ hospitalId: 1, name: 1 });

        const rolesWithCounts = await Promise.all(roles.map(async (r) => {
            const count = await User.countDocuments({ role: r._id });
            return { ...r.toObject(), userCount: count };
        }));

        res.json({ success: true, data: rolesWithCounts });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Create a New Role (scoped to hospital)
router.post('/roles', verifyAdminOrSuperAdmin, async (req, res) => {
    try {
        const { name, permissions, description, dashboardPath, navLinks } = req.body;
        if (!name) return res.status(400).json({ success: false, message: 'Role name is required' });

        const role = req.user.role;
        const isCentral = role === 'centraladmin' || role === 'superadmin';

        // hospitalId for this role
        const roleHospitalId = isCentral
            ? (req.body.hospitalId || null)
            : (req.user.hospitalId || null);

        // Check uniqueness within the hospital scope
        const existingRole = await Role.findOne({ name, hospitalId: roleHospitalId });
        if (existingRole) {
            return res.status(400).json({ success: false, message: 'Role with this name already exists for this hospital' });
        }

        const newRole = new Role({
            name, permissions, description, dashboardPath, navLinks,
            hospitalId: roleHospitalId
        });
        await newRole.save();

        res.json({ success: true, message: 'Role created successfully', data: newRole });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Update an Existing Role
router.put('/roles/:roleId', verifyAdminOrSuperAdmin, async (req, res) => {
    try {
        const { roleId } = req.params;
        const { name, permissions, description, dashboardPath, navLinks } = req.body;

        const roleDoc = await Role.findById(roleId);
        if (!roleDoc) return res.status(404).json({ success: false, message: 'Role not found' });

        // Hospital admin can only edit their own hospital's roles
        const isCentral = req.user.role === 'centraladmin' || req.user.role === 'superadmin';
        if (!isCentral && String(roleDoc.hospitalId) !== String(req.user.hospitalId)) {
            return res.status(403).json({ success: false, message: 'Cannot edit roles from another hospital' });
        }

        if (roleDoc.isSystemRole && name && name !== roleDoc.name) {
            return res.status(403).json({ success: false, message: 'Cannot rename system roles' });
        }

        if (name) roleDoc.name = name;
        if (permissions) roleDoc.permissions = permissions;
        if (description !== undefined) roleDoc.description = description;
        if (dashboardPath !== undefined) roleDoc.dashboardPath = dashboardPath;
        if (navLinks !== undefined) roleDoc.navLinks = navLinks;

        await roleDoc.save();
        res.json({ success: true, message: 'Role updated successfully', data: roleDoc });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Delete a Role
router.delete('/roles/:roleId', verifyAdminOrSuperAdmin, async (req, res) => {
    try {
        const { roleId } = req.params;
        const roleDoc = await Role.findById(roleId);
        if (!roleDoc) return res.status(404).json({ success: false, message: 'Role not found' });

        if (roleDoc.isSystemRole) {
            return res.status(403).json({ success: false, message: 'Cannot delete system roles' });
        }

        const isCentral = req.user.role === 'centraladmin' || req.user.role === 'superadmin';
        if (!isCentral && String(roleDoc.hospitalId) !== String(req.user.hospitalId)) {
            return res.status(403).json({ success: false, message: 'Cannot delete roles from another hospital' });
        }

        const userCount = await User.countDocuments({ role: roleId });
        if (userCount > 0) {
            return res.status(400).json({
                success: false,
                message: `Cannot delete role. ${userCount} user(s) still assigned to it.`
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

// Central Admin Signup — creates centraladmin account
router.post('/signup', async (req, res) => {
    try {
        const { name, email, password, phone } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ success: false, message: 'Name, email, and password are required' });
        }

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ success: false, message: 'Email already registered.' });
        }

        const admin = new User({
            name, email, password, phone: phone || '', role: 'centraladmin', hospitalId: null
        });

        await admin.save();

        const token = jwt.sign(
            { userId: admin._id, email: admin.email, role: 'centraladmin' },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.status(201).json({
            success: true,
            message: 'Central Admin account created successfully',
            user: {
                id: admin._id, name: admin.name, email: admin.email,
                role: 'centraladmin', permissions: ['*'],
                dashboardPath: '/supremeadmin', navLinks: []
            },
            token
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error creating admin', error: error.message });
    }
});

// Central Admin Login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ success: false, message: 'Email and password required' });

        const user = await User.findOne({ email });
        if (!user) return res.status(401).json({ success: false, message: 'Invalid email or password' });

        let roleName = user.role;
        let userRoleObj = null;

        if (mongoose.Types.ObjectId.isValid(user.role)) {
            userRoleObj = await Role.findById(user.role);
            if (userRoleObj) roleName = userRoleObj.name.toLowerCase();
        } else if (typeof user.role === 'string') {
            roleName = user.role.toLowerCase();
        }

        // Only centraladmin/superadmin allowed through this endpoint
        if (roleName !== 'superadmin' && roleName !== 'centraladmin' && roleName !== 'admin') {
            return res.status(403).json({ success: false, message: 'Access denied. Central Admin only.' });
        }

        const isPasswordValid = await user.comparePassword(password);
        if (!isPasswordValid) return res.status(401).json({ success: false, message: 'Invalid email or password' });

        const token = jwt.sign(
            { userId: user._id, email: user.email, roleId: String(user.role) },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            success: true,
            message: 'Login successful',
            user: {
                id: user._id, name: user.name, email: user.email,
                role: roleName, permissions: ['*'],
                dashboardPath: '/supremeadmin', navLinks: []
            },
            token
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error during login', error: error.message });
    }
});

// ==========================================
// 3. USER MANAGEMENT — HOSPITAL-SCOPED
// ==========================================

// Get all users — scoped by hospital, excluding patients and admin roles
router.get('/users', verifyAdminOrSuperAdmin, async (req, res) => {
    try {
        const isCentral = req.user.role === 'centraladmin' || req.user.role === 'superadmin';
        const filter = getHospitalFilter(req);

        // Exclude system admin roles from the staff list
        const systemRoles = ['centraladmin', 'superadmin', 'hospitaladmin'];

        // Also find the Patient role ObjectId to exclude it
        const patientRole = await Role.findOne({ name: { $regex: /^patient$/i } });
        const patientRoleId = patientRole ? patientRole._id : null;

        // Build exclusion filter
        const roleExclude = { $nin: systemRoles };
        // Note: We can't easily combine string roles and ObjectId exclusion in one $nin
        // So we do a two-step: filter by hospitalId, then exclude by role
        const users = await User.find(
            { ...filter, role: { $nin: systemRoles } },
            { password: 0 }
        ).sort({ createdAt: -1 });

        // Build full response and filter out patients
        const usersWithRoles = await Promise.all(users.map(async (u) => {
            return await buildUserResponse(u);
        }));

        // Filter patients out of staff list
        const staffOnly = usersWithRoles.filter(u =>
            !['patient'].includes((u.role || '').toLowerCase())
        );

        res.json({ success: true, users: staffOnly });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error fetching users', error: error.message });
    }
});

// Create User (by admin) — hospitalId is REQUIRED for all staff
router.post('/users', verifyAdminOrSuperAdmin, async (req, res) => {
    try {
        const { name, email, password, phone, roleId, services, avatar, departments } = req.body;

        if (!name || !email || !password || !roleId) {
            return res.status(400).json({ success: false, message: 'Name, email, password, and roleId are required' });
        }

        const roleDoc = await Role.findById(roleId);
        if (!roleDoc) {
            return res.status(400).json({ success: false, message: 'Invalid role. Role not found.' });
        }

        // Patients don't need hospital assignment
        const isPatientRole = roleDoc.name.toLowerCase() === 'patient';

        // Determine hospitalId
        const isCentral = req.user.role === 'centraladmin' || req.user.role === 'superadmin';
        let assignedHospitalId = null;

        if (!isCentral) {
            // Hospital admin: always use their hospital
            assignedHospitalId = req.user.hospitalId;
        } else {
            // Central admin: hospitalId must be in body for staff (not patients)
            assignedHospitalId = req.body.hospitalId || roleDoc.hospitalId || null;
        }

        if (!isPatientRole && !assignedHospitalId) {
            return res.status(400).json({
                success: false,
                message: 'Staff must be linked to a hospital. Please provide hospitalId.'
            });
        }

        const existingUser = await User.findOne({ email });
        if (existingUser) return res.status(400).json({ success: false, message: 'User already exists' });

        const user = new User({
            name,
            email: email.toLowerCase(),
            password,
            phone: phone || '',
            role: roleId,
            hospitalId: assignedHospitalId,
            services: roleDoc.name.toLowerCase() === 'doctor' ? services : [],
            departments: departments || [],
            avatar: avatar || null
        });

        await user.save();

        // Auto-create linked entity profiles with hospitalId
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
                    hospitalId: assignedHospitalId,
                    services: user.services, availability: defaultAvailability,
                    departments: user.departments,
                    specialty: 'General', consultationFee: 0
                });
            } else if (roleName === 'lab' || roleName === 'lab technician') {
                await Lab.create({
                    name: user.name, email: user.email, phone: user.phone,
                    userId: user._id, hospitalId: assignedHospitalId
                });
            } else if (roleName === 'pharmacy' || roleName === 'pharmacist') {
                await Pharmacy.create({
                    name: user.name, email: user.email, phone: user.phone,
                    userId: user._id, hospitalId: assignedHospitalId
                });
            } else if (roleName === 'reception' || roleName === 'receptionist') {
                await Reception.create({ userId: user._id, hospitalId: assignedHospitalId });
            }
        } catch (profileError) {
            console.error('Error creating linked profile:', profileError);
        }

        const userData = await buildUserResponse(user);
        res.status(201).json({
            success: true,
            message: `${roleDoc.name} account created successfully`,
            user: userData
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error creating user', error: error.message });
    }
});

// Update user details
router.put('/users/:userId', verifyAdminOrSuperAdmin, async (req, res) => {
    try {
        const { userId } = req.params;
        const { name, email, phone, roleId, avatar, specialty, departments } = req.body;

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        // Hospital admin can ONLY update users in their hospital
        const isCentral = req.user.role === 'centraladmin' || req.user.role === 'superadmin';
        if (!isCentral && String(user.hospitalId) !== String(req.user.hospitalId)) {
            return res.status(403).json({ success: false, message: 'Cannot edit users from another hospital' });
        }

        if (['centraladmin', 'superadmin'].includes(user.role) && !isCentral) {
            return res.status(403).json({ success: false, message: 'Cannot modify Central Admin accounts' });
        }

        if (userId === String(req.user._id) && roleId && roleId !== String(user.role)) {
            return res.status(403).json({ success: false, message: 'Cannot change your own role' });
        }

        if (name) user.name = name;
        if (email) user.email = email;
        if (phone) user.phone = phone;
        if (avatar !== undefined) user.avatar = avatar;
        if (departments !== undefined) user.departments = departments;

        let roleChanged = false;
        let newRoleName = null;

        if (roleId && String(roleId) !== String(user.role)) {
            const roleDoc = await Role.findById(roleId);
            if (!roleDoc) return res.status(400).json({ success: false, message: 'Invalid role' });
            user.role = roleId;
            newRoleName = roleDoc.name.toLowerCase();
            roleChanged = true;
        } else if (user.role && !['centraladmin', 'superadmin', 'hospitaladmin'].includes(user.role)) {
            const roleDoc = await Role.findById(user.role);
            newRoleName = roleDoc ? roleDoc.name.toLowerCase() : null;
        }

        await user.save();

        // Update linked entity profiles
        try {
            const hospitalId = user.hospitalId;
            if (newRoleName === 'doctor') {
                let doctorProfile = await Doctor.findOne({ userId: user._id });
                if (!doctorProfile && roleChanged) {
                    let doctorId = nanoid(10);
                    while (await Doctor.findOne({ doctorId })) doctorId = nanoid(10);
                    doctorProfile = new Doctor({
                        doctorId, userId: user._id, hospitalId,
                        availability: {
                            monday: { available: false, startTime: '09:00', endTime: '17:00' },
                            tuesday: { available: false, startTime: '09:00', endTime: '17:00' },
                            wednesday: { available: false, startTime: '09:00', endTime: '17:00' },
                            thursday: { available: false, startTime: '09:00', endTime: '17:00' },
                            friday: { available: false, startTime: '09:00', endTime: '17:00' },
                            saturday: { available: false, startTime: '09:00', endTime: '17:00' },
                            sunday: { available: false, startTime: '09:00', endTime: '17:00' }
                        }
                    });
                }
                if (doctorProfile) {
                    if (name) doctorProfile.name = name;
                    if (email) doctorProfile.email = email;
                    if (phone) doctorProfile.phone = phone;
                    if (specialty) doctorProfile.specialty = specialty;
                    if (departments !== undefined) doctorProfile.departments = departments;
                    doctorProfile.hospitalId = hospitalId;
                    await doctorProfile.save();
                }
            }
            if (['lab', 'lab technician'].includes(newRoleName)) {
                await Lab.findOneAndUpdate({ userId: user._id }, { name, email, phone, hospitalId }, { upsert: true });
            }
            if (['pharmacy', 'pharmacist'].includes(newRoleName)) {
                await Pharmacy.findOneAndUpdate({ userId: user._id }, { name, email, phone, hospitalId }, { upsert: true });
            }
            if (['reception', 'receptionist'].includes(newRoleName)) {
                const rec = await Reception.findOne({ userId: user._id });
                if (!rec && roleChanged) await Reception.create({ userId: user._id, hospitalId });
            }
        } catch (profileError) {
            console.error('Error updating linked profile:', profileError);
        }

        const updatedUser = await buildUserResponse(user);
        res.json({ success: true, message: 'User updated successfully', user: updatedUser });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error updating user', error: error.message });
    }
});

// Delete user
router.delete('/users/:userId', verifyAdminOrSuperAdmin, async (req, res) => {
    try {
        const { userId } = req.params;

        if (userId === String(req.user._id)) {
            return res.status(403).json({ success: false, message: 'Cannot delete own account' });
        }

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        const isCentral = req.user.role === 'centraladmin' || req.user.role === 'superadmin';

        // Hospital admin can only delete users in their hospital
        if (!isCentral && String(user.hospitalId) !== String(req.user.hospitalId)) {
            return res.status(403).json({ success: false, message: 'Cannot delete users from another hospital' });
        }

        if (['centraladmin', 'superadmin'].includes(user.role) && !isCentral) {
            return res.status(403).json({ success: false, message: 'Cannot delete Central Admin accounts' });
        }

        // Cascade delete entity profiles
        let roleName = null;
        if (user.role && !['centraladmin', 'superadmin', 'hospitaladmin'].includes(user.role)) {
            const roleDoc = await Role.findById(user.role);
            roleName = roleDoc ? roleDoc.name.toLowerCase() : null;
        }

        if (roleName === 'doctor') await Doctor.findOneAndDelete({ userId: user._id });
        if (roleName === 'lab' || roleName === 'lab technician') await Lab.findOneAndDelete({ userId: user._id });
        if (roleName === 'pharmacy' || roleName === 'pharmacist') await Pharmacy.findOneAndDelete({ userId: user._id });
        if (roleName === 'reception' || roleName === 'receptionist') await Reception.findOneAndDelete({ userId: user._id });

        await User.findByIdAndDelete(userId);
        res.json({ success: true, message: 'User and associated profile deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error deleting user', error: error.message });
    }
});

module.exports = router;