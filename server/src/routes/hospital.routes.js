const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Hospital = require('../models/hospital.model');
const User = require('../models/user.model');
const Role = require('../models/role.model');
const Inventory = require('../models/inventory.model');
const LabTest = require('../models/labTest.model');
const Doctor = require('../models/doctor.model');
const Lab = require('../models/lab.model');
const Pharmacy = require('../models/pharmacy.model');
const Reception = require('../models/reception.model');
const Appointment = require('../models/appointment.model');
const FacilityCharge = require('../models/facilityCharge.model');
const QuestionLibrary = require('../models/questionLibrary.model');
const DepartmentUpi = require('../models/departmentUpi.model');
const jwt = require('jsonwebtoken');
const { verifyToken } = require('../middleware/auth.middleware');
const { getTenantConnection, getTenantDbName, getActiveConnections, removeTenantConnection } = require('../db/tenantDb');

const { JWT_SECRET } = require('../config/jwt');
const validatePassword = require('../utils/validatePassword');

/**
 * Central Admin middleware — only 'centraladmin' (or legacy 'superadmin') can access
 */
const verifyCentralAdmin = async (req, res, next) => {
    try {
        await verifyToken(req, res, () => {
            const role = req.user.role;
            if (role === 'centraladmin' || role === 'superadmin') {
                return next();
            }
            return res.status(403).json({ success: false, message: 'Central Admin access required' });
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
};

/**
 * Hospital Admin middleware — 'hospitaladmin' or 'centraladmin'/'superadmin'
 */
const verifyHospitalAdmin = async (req, res, next) => {
    try {
        await verifyToken(req, res, () => {
            const role = req.user.role;
            if (role === 'centraladmin' || role === 'superadmin' || role === 'hospitaladmin') {
                return next();
            }
            return res.status(403).json({ success: false, message: 'Hospital Admin access required' });
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
};

// ==========================================
// HOSPITAL CRUD (Central Admin only)
// ==========================================

// Get all hospitals
router.get('/', verifyCentralAdmin, async (req, res) => {
    try {
        const plan = req.query.plan || 'enterprise';
        
        let filter = {};
        if (plan === 'enterprise') {
            filter.clinicType = { $ne: 'clinic' };
            filter.$or = [
                { subscriptionPlan: 'enterprise' },
                { subscriptionPlan: 'none' },
                { subscriptionPlan: { $exists: false } }
            ];
        } else if (plan === 'starter') {
            filter.clinicType = 'clinic';
            filter.$or = [
                { subscriptionPlan: 'starter' },
                { subscriptionPlan: 'none' },
                { subscriptionPlan: { $exists: false } }
            ];
        } else if (plan && plan !== 'all') {
            filter.clinicType = { $ne: 'clinic' };
            filter.subscriptionPlan = plan;
        }

        const hospitals = await Hospital.find(filter).populate('adminUserId', 'name email');
        
        // Map legacy data so frontend receives expected plan names
        const mappedHospitals = hospitals.map(h => {
            const hospital = h.toObject();
            if (!hospital.subscriptionPlan || hospital.subscriptionPlan === 'none') {
                if (hospital.clinicType === 'clinic') {
                    hospital.subscriptionPlan = 'starter';
                } else {
                    hospital.subscriptionPlan = 'enterprise';
                }
            }
            return hospital;
        });

        res.json({ success: true, hospitals: mappedHospitals });
    } catch (err) {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// ==========================================
// PUBLIC: Resolve hospital by slug (for login page — no auth needed)
// GET /api/hospitals/resolve/:slug
// Returns hospital name, logo, id for the login branding
// ==========================================
router.get('/resolve/:slug', async (req, res) => {
    try {
        const hospital = await Hospital.findOne(
            { slug: req.params.slug.toLowerCase(), isActive: true },
            'name slug city logo departments departmentFees appointmentMode facilities isActive _id'
        );
        if (!hospital) {
            return res.status(404).json({ success: false, message: 'Hospital not found. Check the URL and try again.' });
        }
        res.json({ success: true, hospital });
    } catch (err) {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// Create a new hospital
router.post('/', verifyCentralAdmin, async (req, res) => {
    try {
        const { name, address, city, state, phone, email, website, logo, departments, slug: customSlug, plan } = req.body;
        if (!name) return res.status(400).json({ success: false, message: 'Hospital name is required' });

        const RESERVED_SLUGS = ['api', 'admin', 'login', 'logout', 'signup', 'register', 'uploads',
            'static', 'health', 'public', 'www', 'mail', 'ftp', 'app', 'dashboard', 'root', 'support'];

        // Auto-generate URL slug from hospital name: "AKG Hospital" -> "akg-hospital"
        const baseSlug = (customSlug || name)
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9\s-]/g, '')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-')
            .slice(0, 60); // max length

        if (!baseSlug) return res.status(400).json({ success: false, message: 'Could not generate a valid slug from the hospital name' });
        if (RESERVED_SLUGS.includes(baseSlug)) {
            return res.status(400).json({ success: false, message: `Slug "${baseSlug}" is reserved. Use a different hospital name.` });
        }

        // Ensure slug uniqueness by appending number if needed
        let slug = baseSlug;
        let counter = 1;
        while (await Hospital.findOne({ slug })) {
            slug = `${baseSlug}-${counter++}`;
        }

        const hospitalData = { name, slug, address, city, state, phone, email, website, logo, departments: departments || [] };
        if (plan === 'multi_speciality_starter') {
            hospitalData.subscriptionPlan = 'multi_speciality_starter';
            hospitalData.tier = { maxDoctors: 15, maxStaff: 25 };
        } else if (plan === 'clinic_basic') {
            hospitalData.subscriptionPlan = 'clinic_basic';
            hospitalData.tier = { maxDoctors: 5, maxStaff: 3 };
        } else {
            hospitalData.subscriptionPlan = 'enterprise';
        }
        
        const hospital = new Hospital(hospitalData);
        await hospital.save();


        // 🏥 Auto-provision the hospital's isolated tenant database.
        // MongoDB only physically creates a database when a document is written to it.
        // We write a 'hospital_meta' seed document to force the DB to appear in Compass.
        try {
            const tenantConn = await getTenantConnection(String(hospital._id));
            const dbName = getTenantDbName(String(hospital._id));

            // Write a seed document — this is what forces MongoDB to create the database
            await tenantConn.db.collection('hospital_meta').insertOne({
                hospitalId: hospital._id,
                hospitalName: hospital.name,
                city: hospital.city || '',
                state: hospital.state || '',
                departments: hospital.departments || [],
                createdAt: new Date(),
                _type: 'tenant_init',
            });

            console.log(`✅ Tenant DB created and seeded: ${dbName}`);
        } catch (dbErr) {
            // Non-fatal: hospital is created, DB will be provisioned on first login
            console.warn(`⚠️  Could not pre-provision tenant DB for ${hospital.name}:`, dbErr.message);
        }

        res.status(201).json({
            success: true,
            message: 'Hospital created successfully',
            hospital,
            tenantDb: getTenantDbName(String(hospital._id))
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// ==========================================
// SUPREME ADMIN: Tenant DB Monitoring
// ==========================================

/**
 * GET /api/hospitals/tenant-status
 * Returns all active tenant database connections for the Supreme Admin dashboard.
 */
router.get('/tenant-status', verifyCentralAdmin, async (req, res) => {
    try {
        const { getActiveConnections, getTenantDbName } = require('../db/tenantDb');
        const hospitals = await Hospital.find({}, 'name city isActive').lean();

        const activeConns = getActiveConnections();

        const report = hospitals.map(h => {
            const dbName = getTenantDbName(String(h._id));
            const connInfo = activeConns.find(c => c.dbName === dbName);
            return {
                hospitalId: h._id,
                hospitalName: h.name,
                city: h.city,
                isActive: h.isActive,
                tenantDb: dbName,
                connectionStatus: connInfo ? 'connected' : 'not-loaded',
                readyState: connInfo?.readyState ?? null,
            };
        });

        res.json({
            success: true,
            totalHospitals: hospitals.length,
            activeConnections: activeConns.length,
            report,
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// Update a hospital
const updateHospital = async (req, res) => {
    try {
        const { name, address, city, state, phone, email, website, logo, isActive, departments, slug, appointmentMode, customDomain, plan } = req.body;
        const hospital = await Hospital.findOne({ _id: req.params.id, clinicType: { $ne: 'clinic' } });
        if (!hospital) return res.status(404).json({ success: false, message: 'Hospital not found' });

        if (name !== undefined) hospital.name = name;

        if (slug !== undefined) {
            const formattedSlug = slug.toLowerCase().trim().replace(/[^a-z0-9-]/g, '');
            if (!formattedSlug) {
                return res.status(400).json({ success: false, message: 'Subdomain prefix (slug) cannot be empty.' });
            }
            const existingSlug = await Hospital.findOne({
                slug: formattedSlug,
                _id: { $ne: req.params.id }
            });
            if (existingSlug) {
                return res.status(400).json({ success: false, message: 'Subdomain prefix (slug) is already in use.' });
            }
            hospital.slug = formattedSlug;
        }

        if (customDomain !== undefined) {
            // strip protocol and trailing slash
            const formattedDomain = customDomain ? customDomain.replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase() : undefined;
            if (formattedDomain) {
                const existingDomain = await Hospital.findOne({
                    customDomain: formattedDomain,
                    _id: { $ne: req.params.id }
                });
                if (existingDomain) {
                    return res.status(400).json({ success: false, message: 'Custom domain is already in use.' });
                }
            }
            hospital.customDomain = formattedDomain;
        }

        if (address !== undefined) hospital.address = address;
        if (city !== undefined) hospital.city = city;
        if (state !== undefined) hospital.state = state;
        if (phone !== undefined) hospital.phone = phone;
        if (email !== undefined) hospital.email = email;
        if (website !== undefined) hospital.website = website;
        if (logo !== undefined) hospital.logo = logo;
        if (isActive !== undefined) hospital.isActive = isActive;
        if (departments !== undefined) hospital.departments = departments;
        if (appointmentMode !== undefined && ['slot', 'token'].includes(appointmentMode)) hospital.appointmentMode = appointmentMode;

        if (plan === 'multi_speciality_starter') {
            hospital.subscriptionPlan = 'multi_speciality_starter';
            hospital.tier = { maxDoctors: 15, maxStaff: 25 };
        } else if (plan === 'clinic_basic') {
            hospital.subscriptionPlan = 'clinic_basic';
            hospital.tier = { maxDoctors: 5, maxStaff: 3 };
        } else if (plan === 'enterprise') {
            hospital.subscriptionPlan = 'enterprise';
            hospital.tier = undefined; // unlimited
        }

        await hospital.save();
        res.json({ success: true, message: 'Hospital updated successfully', hospital });
    } catch (err) {
        console.error("Error updating hospital:", err);
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
};

router.put('/:id', verifyCentralAdmin, updateHospital);
router.patch('/:id', verifyCentralAdmin, updateHospital);


// ==========================================
// APPOINTMENT MODE — Supreme Admin sets per hospital
// GET /api/hospitals/:id/next-token?doctorId=X&date=YYYY-MM-DD
// Returns the next available token number for a doctor on a given date
// ==========================================
router.get('/:id/next-token', verifyToken, async (req, res) => {
    try {
        const { doctorId, date } = req.query;
        if (!doctorId || !date) {
            return res.status(400).json({ success: false, message: 'doctorId and date are required' });
        }

        const hospital = await Hospital.findById(req.params.id);
        if (!hospital) return res.status(404).json({ success: false, message: 'Hospital not found' });
        if (hospital.appointmentMode !== 'token') {
            return res.json({ success: true, mode: 'slot', nextToken: null });
        }

        // Count non-cancelled appointments for this doctor on this date
        const [dischargingId, setDischargingId] = useState(null);
        const [upiOptions, setUpiOptions] = useState([]);
        const startOfDay = new Date(date);
        startOfDay.setUTCHours(0, 0, 0, 0);
        const endOfDay = new Date(date);
        endOfDay.setUTCHours(23, 59, 59, 999);

        const count = await Appointment.countDocuments({
            doctorId,
            hospitalId: req.params.id,
            appointmentDate: { $gte: startOfDay, $lte: endOfDay },
            status: { $ne: 'cancelled' }
        });

        res.json({ success: true, mode: 'token', nextToken: count + 1 });
    } catch (err) {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// Delete a hospital and ALL related data (cascade delete)
router.delete('/:id', verifyCentralAdmin, async (req, res) => {
    try {
        const hospitalId = req.params.id;
        const hospital = await Hospital.findOne({ _id: hospitalId, clinicType: { $ne: 'clinic' } });
        if (!hospital) return res.status(404).json({ success: false, message: 'Hospital not found' });

        const deletionLog = {};

        // 1. Delete all related data from master DB (all collections with hospitalId)
        const masterDeletions = await Promise.all([
            Appointment.deleteMany({ hospitalId }).then(r => deletionLog.appointments = r.deletedCount),
            Doctor.deleteMany({ hospitalId }).then(r => deletionLog.doctors = r.deletedCount),
            Lab.deleteMany({ hospitalId }).then(r => deletionLog.labs = r.deletedCount),
            Pharmacy.deleteMany({ hospitalId }).then(r => deletionLog.pharmacies = r.deletedCount),
            Reception.deleteMany({ hospitalId }).then(r => deletionLog.receptions = r.deletedCount),
            Inventory.deleteMany({ hospitalId }).then(r => deletionLog.inventory = r.deletedCount),
            Role.deleteMany({ hospitalId }).then(r => deletionLog.roles = r.deletedCount),
            FacilityCharge.deleteMany({ hospitalId }).then(r => deletionLog.facilityCharges = r.deletedCount),
            QuestionLibrary.deleteMany({ hospitalId }).then(r => deletionLog.questionLibraries = r.deletedCount),
            User.deleteMany({ hospitalId }).then(r => deletionLog.users = r.deletedCount),
        ]);

        // 2. Drop the tenant database entirely and clean up connection cache
        try {
            const tenantConn = await getTenantConnection(String(hospitalId));
            await tenantConn.db.dropDatabase();
            console.log(`🗑️  Dropped tenant DB for hospital: ${hospital.name}`);
            await removeTenantConnection(String(hospitalId));
            deletionLog.tenantDbDropped = true;
        } catch (dbErr) {
            console.warn(`⚠️  Could not drop tenant DB for ${hospital.name}:`, dbErr.message);
            deletionLog.tenantDbDropped = false;
        }

        // 3. Delete the hospital record itself
        await Hospital.findByIdAndDelete(hospitalId);

        console.log(`🏥 Hospital "${hospital.name}" fully deleted. Summary:`, deletionLog);

        res.json({
            success: true,
            message: `Hospital "${hospital.name}" and all related data deleted successfully.`,
            deletionLog
        });
    } catch (err) {
        console.error('Delete hospital error:', err);
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// ==========================================
// HOSPITAL ADMIN AUTH
// ==========================================

// Hospital Admin Signup (creates a hospitaladmin account) — Central Admin only
router.post('/admin/signup', verifyCentralAdmin, async (req, res) => {
    try {
        const { name, email, password, phone, hospitalId, aadhaarNumber } = req.body;

        if (!name || !email || !password || !hospitalId) {
            return res.status(400).json({ success: false, message: 'Name, email, password, and hospitalId are required' });
        }
        
        if (aadhaarNumber && !/^\d{12}$/.test(aadhaarNumber)) {
            return res.status(400).json({ success: false, message: 'Aadhaar number must be exactly 12 digits.' });
        }

        const pwErrH = validatePassword(password);
        if (pwErrH) return res.status(400).json({ success: false, message: pwErrH });

        const hospital = await Hospital.findOne({ _id: hospitalId, clinicType: { $ne: 'clinic' } });
        if (!hospital) return res.status(404).json({ success: false, message: 'Hospital not found' });

        const existing = await User.findOne({ email });
        if (existing) return res.status(400).json({ success: false, message: 'Email already registered' });

        const admin = new User({
            name, email, password, phone: phone || '',
            role: 'hospitaladmin',
            hospitalId,
            aadhaarNumber: aadhaarNumber || ''
        });

        await admin.save();

        // Link hospital admin to hospital record
        hospital.adminUserId = admin._id;
        await hospital.save();

        res.status(201).json({
            success: true,
            message: 'Hospital Admin created successfully',
            user: {
                id: admin._id,
                name: admin.name,
                email: admin.email,
                role: 'hospitaladmin',
                hospitalId,
                hospitalName: hospital.name
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// Hospital Admin Login — dedicated endpoint
router.post('/admin/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ success: false, message: 'Email and password are required' });

        const user = await User.findOne({ email: email.toLowerCase().trim() });
        if (!user) return res.status(401).json({ success: false, message: 'Invalid email or password' });

        // Only allow hospitaladmin role through this endpoint
        const userRole = typeof user.role === 'string' ? user.role : null;
        if (userRole !== 'hospitaladmin') {
            return res.status(403).json({ success: false, message: 'This login is for Hospital Admins only.' });
        }

        if (!user.hospitalId) {
            return res.status(403).json({ success: false, message: 'This account is not linked to any hospital. Contact your Central Admin.' });
        }

        const isPasswordValid = await user.comparePassword(password);
        if (!isPasswordValid) return res.status(401).json({ success: false, message: 'Invalid email or password' });

        const hospital = await Hospital.findById(user.hospitalId);
        if (!hospital) {
            return res.status(403).json({ success: false, message: 'Linked hospital not found. Contact your Central Admin.' });
        }

        if (!hospital.isActive) {
            return res.status(403).json({ success: false, message: 'Hospital account is inactive. Contact your Central Admin.' });
        }

        // Embed hospitalId in the JWT so all downstream middleware can scope data
        const token = jwt.sign(
            {
                userId: user._id,
                email: user.email,
                roleId: 'hospitaladmin',
                hospitalId: String(user.hospitalId)   // ← scoped in token
            },
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
                role: 'hospitaladmin',
                permissions: ['admin_manage_roles', 'admin_view_stats'],
                dashboardPath: '/hospitaladmin',
                navLinks: [],
                hospitalId: user.hospitalId,
                hospitalName: hospital.name
            },
            token
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// Get my hospital info (for hospital admins / staff)
router.get('/my-hospital', verifyToken, async (req, res) => {
    try {
        if (req.user.role === 'centraladmin' || req.user.role === 'superadmin') {
            return res.json({ success: true, hospital: null, message: 'Central admin manages all hospitals' });
        }

        const hospital = req.user.hospitalId
            ? await Hospital.findById(req.user.hospitalId)
            : null;

        if (!hospital) return res.status(404).json({ success: false, message: 'Hospital not found' });
        res.json({ success: true, hospital });
    } catch (err) {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// Get UPI IDs for the current hospital (Hospital Admin)
router.get('/my-hospital/upi-ids', verifyToken, async (req, res) => {
    try {
        const hospital = await Hospital.findById(req.user.hospitalId);
        if (!hospital) return res.status(404).json({ success: false, message: 'Hospital not found' });
        res.json({ success: true, upiIds: hospital.upiIds || [] });
    } catch (err) {
        console.error('Error fetching UPI IDs:', err);
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// Update UPI IDs for the current hospital (Hospital Admin)
router.put('/my-hospital/upi-ids', verifyHospitalAdmin, async (req, res) => {
    try {
        const { upiIds } = req.body;
        if (!Array.isArray(upiIds)) {
            return res.status(400).json({ success: false, message: 'upiIds must be an array' });
        }
        // Validate each entry
        for (const item of upiIds) {
            if (typeof item.label !== 'string' || typeof item.upiId !== 'string' || !item.label.trim() || !item.upiId.trim()) {
                return res.status(400).json({ success: false, message: 'Each UPI entry must have non-empty label and upiId' });
            }
        }
        const hospital = await Hospital.findById(req.user.hospitalId);
        if (!hospital) return res.status(404).json({ success: false, message: 'Hospital not found' });
        hospital.upiIds = upiIds;
        await hospital.save();
        res.json({ success: true, message: 'UPI IDs updated', upiIds: hospital.upiIds });
    } catch (err) {
        console.error('Error updating UPI IDs:', err);
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// Update facilities (Hospital admin specific feature)
router.put('/my-hospital/facilities', verifyHospitalAdmin, async (req, res) => {
    try {
        if (req.user.role === 'centraladmin' || req.user.role === 'superadmin') {
            return res.status(403).json({ success: false, message: 'Only hospital admins manage their facilities this way' });
        }

        const { facilities } = req.body;
        if (!facilities) return res.status(400).json({ success: false, message: 'Facilities data required' });

        const hospital = await Hospital.findById(req.user.hospitalId);
        if (!hospital) return res.status(404).json({ success: false, message: 'Hospital not found' });

        hospital.facilities = facilities;
        await hospital.save();

        res.json({ success: true, message: 'Facilities updated successfully', hospital });
    } catch (err) {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// Update department fees (Hospital admin specific feature)
router.put('/my-hospital/department-fees', verifyHospitalAdmin, async (req, res) => {
    try {
        if (req.user.role === 'centraladmin' || req.user.role === 'superadmin') {
            return res.status(403).json({ success: false, message: 'Only hospital admins manage their department fees this way' });
        }

        const { departmentFees, departmentValidity } = req.body;
        if (!departmentFees || typeof departmentFees !== 'object') {
            return res.status(400).json({ success: false, message: 'Department fees data required' });
        }

        const hospital = await Hospital.findById(req.user.hospitalId);
        if (!hospital) return res.status(404).json({ success: false, message: 'Hospital not found' });

        hospital.departmentFees = departmentFees;
        if (departmentValidity && typeof departmentValidity === 'object') {
            hospital.departmentValidity = departmentValidity;
        }
        await hospital.save();

        res.json({ success: true, message: 'Department fees updated successfully', hospital });
    } catch (err) {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// ==========================================
// HOSPITAL INVENTORY MANAGEMENT
// Hospital admins manage their own medicine inventory
// ==========================================

// GET hospital inventory
router.get('/my-hospital/inventory', verifyHospitalAdmin, async (req, res) => {
    try {
        const hospitalId = req.user.hospitalId;
        if (!hospitalId) return res.status(400).json({ success: false, message: 'No hospital linked to this account' });

        const items = await Inventory.find({ hospitalId }).sort({ createdAt: -1 }).lean();
        res.json({ success: true, data: items });
    } catch (err) {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// ADD inventory item
router.post('/my-hospital/inventory', verifyHospitalAdmin, async (req, res) => {
    try {
        const hospitalId = req.user.hospitalId;
        if (!hospitalId) return res.status(400).json({ success: false, message: 'No hospital linked to this account' });

        const item = new Inventory({ ...req.body, hospitalId });
        await item.save();
        res.status(201).json({ success: true, data: item });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

// UPDATE inventory item
router.put('/my-hospital/inventory/:id', verifyHospitalAdmin, async (req, res) => {
    try {
        const hospitalId = req.user.hospitalId;
        const item = await Inventory.findOne({ _id: req.params.id, hospitalId });
        if (!item) return res.status(404).json({ success: false, message: 'Item not found' });

        const allowed = ['name', 'salt', 'category', 'stock', 'unit', 'buyingPrice', 'sellingPrice', 'vendor', 'batchNumber', 'expiryDate'];
        allowed.forEach(field => {
            if (req.body[field] !== undefined) item[field] = req.body[field];
        });

        await item.save(); // triggers status hook
        res.json({ success: true, data: item });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

// DELETE inventory item
router.delete('/my-hospital/inventory/:id', verifyHospitalAdmin, async (req, res) => {
    try {
        const hospitalId = req.user.hospitalId;
        const deleted = await Inventory.findOneAndDelete({ _id: req.params.id, hospitalId });
        if (!deleted) return res.status(404).json({ success: false, message: 'Item not found' });
        res.json({ success: true, message: 'Item deleted' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// ==========================================
// HOSPITAL LAB TEST PRICING
// Hospital admins set their own lab test prices
// ==========================================

// GET lab tests with hospital prices (global + hospital-specific)
router.get('/my-hospital/lab-tests', verifyHospitalAdmin, async (req, res) => {
    try {
        const hospitalId = req.user.hospitalId;
        if (!hospitalId) return res.status(400).json({ success: false, message: 'No hospital linked' });

        const hid = hospitalId.toString();
        const tests = await LabTest.find({
            isActive: true,
            $or: [{ hospitalId: null }, { hospitalId: hospitalId }]
        }).sort({ name: 1 }).lean();

        tests.forEach(t => {
            const hp = t.hospitalPrices && t.hospitalPrices[hid];
            t.hospitalPrice = hp !== undefined ? hp : null;
            t.effectivePrice = hp !== undefined ? hp : t.price;
            t.isOwnTest = t.hospitalId ? t.hospitalId.toString() === hid : false;
        });
        res.json({ success: true, data: tests });
    } catch (err) {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// SET hospital-specific lab test price
router.put('/my-hospital/lab-tests/:testId/price', verifyHospitalAdmin, async (req, res) => {
    try {
        const hospitalId = req.user.hospitalId;
        if (!hospitalId) return res.status(400).json({ success: false, message: 'No hospital linked' });

        const { price } = req.body;
        const test = await LabTest.findById(req.params.testId);
        if (!test) return res.status(404).json({ success: false, message: 'Lab test not found' });

        if (price === null || price === undefined || price === '') {
            test.hospitalPrices.delete(hospitalId.toString());
        } else {
            test.hospitalPrices.set(hospitalId.toString(), Number(price));
        }
        await test.save();
        res.json({ success: true, message: 'Price updated', data: test });
    } catch (err) {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// ==========================================
// HOSPITAL STATS (Central & Hospital Admins)
// Full hospital analytics dashboard
// ==========================================
router.get('/:id/stats', verifyHospitalAdmin, async (req, res) => {
    try {
        const hospitalId = req.params.id;
        const { startDate, endDate } = req.query;

        if (!mongoose.Types.ObjectId.isValid(hospitalId)) {
            return res.status(400).json({ success: false, message: 'Invalid hospital ID' });
        }

        // Security check for hospital admins
        if (req.user.role === 'hospitaladmin' && String(req.user.hospitalId) !== hospitalId) {
            return res.status(403).json({ success: false, message: 'Unauthorized to view stats for this hospital' });
        }

        const hospital = await Hospital.findById(hospitalId).populate('adminUserId', 'name email');
        if (!hospital) return res.status(404).json({ success: false, message: 'Hospital not found' });

        // Lazy-load models to avoid circular issues
        const Appointment = require('../models/appointment.model');
        const Doctor = require('../models/doctor.model');
        const Lab = require('../models/lab.model');
        const Pharmacy = require('../models/pharmacy.model');
        const LabReport = require('../models/labReport.model');
        const PharmacyOrder = require('../models/pharmacyOrder.model');
        const Role = require('../models/role.model');

        // Date filter construction
        let dateFilter = {};
        if (startDate || endDate) {
            dateFilter.appointmentDate = {};
            if (startDate) dateFilter.appointmentDate.$gte = new Date(startDate);
            if (endDate) dateFilter.appointmentDate.$lte = new Date(endDate);
        }

        let createdDateFilter = {};
        if (startDate || endDate) {
            createdDateFilter.createdAt = {};
            if (startDate) createdDateFilter.createdAt.$gte = new Date(startDate);
            if (endDate) createdDateFilter.createdAt.$lte = new Date(endDate);
        }

        // 1. Staff counts (all non-patient users linked to this hospital)
        const patientRole = await Role.findOne({ name: { $regex: /^patient$/i } });
        const patientRoleId = patientRole ? patientRole._id : null;

        const totalStaff = await User.countDocuments({
            hospitalId,
            role: { $nin: ['centraladmin', 'superadmin', 'hospitaladmin', patientRoleId].filter(Boolean) }
        });

        // Staff by role
        const staffByRole = await User.aggregate([
            {
                $match: {
                    hospitalId: new mongoose.Types.ObjectId(hospitalId),
                    role: { $nin: ['centraladmin', 'superadmin', 'hospitaladmin'] }
                }
            },
            { $group: { _id: '$role', count: { $sum: 1 } } }
        ]);

        // Resolve role names for staff breakdown
        const staffBreakdown = await Promise.all(staffByRole.map(async (item) => {
            let name = String(item._id);
            if (mongoose.Types.ObjectId.isValid(item._id)) {
                const r = await Role.findById(item._id);
                if (r) name = r.name;
            }
            return { role: name, count: item.count };
        }));

        // 2. Doctor count
        const doctorCount = await Doctor.countDocuments({ hospitalId });

        // 3. Lab count
        const labCount = await Lab.countDocuments({ hospitalId });

        // 4. Pharmacy count
        const pharmacyCount = await Pharmacy.countDocuments({ hospitalId });

        // 5. Patients - unique patients seen by doctors in this hospital (filtered by date if applicable)
        const doctorIds = await Doctor.find({ hospitalId }).select('_id doctorId userId');
        const doctorObjectIds = doctorIds.map(d => d._id); // Doctor model _ids (used in Appointment.doctorId)
        const doctorUserIds = doctorIds.map(d => d.userId).filter(Boolean); // User model _ids (used in LabReport.doctorId, PharmacyOrder.doctorId)

        const uniquePatientIds = await Appointment.distinct('userId', {
            doctorId: { $in: doctorObjectIds },
            ...dateFilter
        });
        const totalPatients = uniquePatientIds.length;

        // 6. Appointments stats (query by hospitalId OR doctors linked to the hospital)
        const appointmentMatch = {
            $or: [
                { hospitalId: new mongoose.Types.ObjectId(hospitalId) },
                { doctorId: { $in: doctorObjectIds } }
            ]
        };

        const totalAppointments = await Appointment.countDocuments({
            ...appointmentMatch,
            ...dateFilter
        });

        const completedAppointments = await Appointment.countDocuments({
            ...appointmentMatch,
            status: 'completed',
            ...dateFilter
        });

        const pendingAppointments = await Appointment.countDocuments({
            ...appointmentMatch,
            status: { $in: ['pending', 'confirmed'] },
            ...dateFilter
        });

        // 7. Revenue — from paid appointments
        // Case insensitive match for 'paid' and include 'Pending' if amount is collected, or just verify amount > 0.
        // Receptionist might just set paymentStatus to 'Paid' or 'paid'
        const revenueData = await Appointment.aggregate([
            {
                $match: {
                    $and: [
                        appointmentMatch,
                        {
                            $or: [
                                { paymentStatus: { $regex: /^paid$/i } },
                                { amount: { $gt: 0 } }
                            ]
                        }
                    ],
                    ...(startDate || endDate ? { appointmentDate: dateFilter.appointmentDate } : {})
                }
            },
            {
                $group: {
                    _id: null,
                    totalRevenue: { $sum: '$amount' }
                }
            }
        ]);
        const totalRevenue = revenueData[0]?.totalRevenue || 0;

        // Monthly revenue (always last 6 months regardless of date filter, to keep chart consistent)
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

        const monthlyRevenue = await Appointment.aggregate([
            {
                $match: {
                    $and: [
                        appointmentMatch,
                        {
                            $or: [
                                { paymentStatus: { $regex: /^paid$/i } },
                                { amount: { $gt: 0 } }
                            ]
                        }
                    ],
                    appointmentDate: { $gte: sixMonthsAgo }
                }
            },
            {
                $group: {
                    _id: {
                        year: { $year: '$appointmentDate' },
                        month: { $month: '$appointmentDate' }
                    },
                    revenue: { $sum: '$amount' },
                    count: { $sum: 1 }
                }
            },
            { $sort: { '_id.year': 1, '_id.month': 1 } }
        ]);

        // 8. Lab reports (doctorId on LabReport is User._id, not Doctor._id)
        const labReportCount = await LabReport.countDocuments({
            doctorId: { $in: doctorUserIds },
            ...createdDateFilter
        });
        const pendingLabReports = await LabReport.countDocuments({
            doctorId: { $in: doctorUserIds },
            reportStatus: 'PENDING',
            ...createdDateFilter
        });

        // 9. Pharmacy orders (doctorId on PharmacyOrder is User._id, not Doctor._id)
        const pharmacyOrderCount = await PharmacyOrder.countDocuments({
            doctorId: { $in: doctorUserIds },
            ...createdDateFilter
        });

        // 10. Recent appointments (last 10 within filter)
        const recentAppointments = await Appointment.find({
            doctorId: { $in: doctorObjectIds },
            ...dateFilter
        })
            .populate('userId', 'name patientId phone')
            .populate('doctorId', 'name specialty')
            .sort({ createdAt: -1 })
            .limit(10)
            .lean();

        // 11. All staff list (excluding patients)
        const staffList = await User.find({
            hospitalId,
            role: { $nin: ['centraladmin', 'superadmin', 'hospitaladmin'] }
        }, { password: 0 })
            .sort({ createdAt: -1 })
            .lean();

        // Resolve role names for staff list
        const staffWithRoles = await Promise.all(staffList.map(async (u) => {
            let roleName = String(u.role);
            if (mongoose.Types.ObjectId.isValid(u.role)) {
                const r = await Role.findById(u.role);
                if (r) roleName = r.name;
            }
            return { ...u, roleName };
        }));

        // Filter out patients from staff list
        const actualStaff = staffWithRoles.filter(u =>
            !['patient'].includes(u.roleName?.toLowerCase())
        );

        res.json({
            success: true,
            hospital: {
                ...hospital.toObject(),
                adminName: hospital.adminUserId?.name || null,
                adminEmail: hospital.adminUserId?.email || null
            },
            stats: {
                // Staff
                totalStaff,
                doctorCount,
                labCount,
                pharmacyCount,
                staffBreakdown,
                // Patients
                totalPatients,
                // Appointments
                totalAppointments,
                completedAppointments,
                pendingAppointments,
                // Revenue
                totalRevenue,
                monthlyRevenue,
                // Lab & Pharmacy
                labReportCount,
                pendingLabReports,
                pharmacyOrderCount
            },
            recentAppointments,
            staffList: actualStaff
        });
    } catch (err) {
        console.error('Hospital stats error:', err);
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});


// ==========================================
// WHITE-LABEL BRANDING (Central Admin)
// ==========================================

/**
 * GET /api/hospitals/:id/branding — PUBLIC (no auth)
 * Returns the branding config for a hospital (for theming login pages)
 */
router.get('/:id/branding', async (req, res) => {
    try {
        const hospital = await Hospital.findById(req.params.id, 'name branding logo slug city').lean();
        if (!hospital) return res.status(404).json({ success: false, message: 'Hospital not found' });
        res.json({ success: true, branding: hospital.branding || {}, hospitalName: hospital.name, logo: hospital.logo });
    } catch (err) {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

/**
 * PUT /api/hospitals/:id/branding — Central Admin only
 * Save / update the white-label branding config for a hospital
 */
router.put('/:id/branding', verifyCentralAdmin, async (req, res) => {
    try {
        const {
            appName, tagline, logoUrl, faviconUrl,
            primaryColor, secondaryColor, accentColor, successColor,
            backgroundColor, textColor,
            supportEmail, supportPhone, address,
            websiteUrl, instagramUrl, facebookUrl, twitterUrl,
            footerText
        } = req.body;

        const hospital = await Hospital.findById(req.params.id);
        if (!hospital) return res.status(404).json({ success: false, message: 'Hospital not found' });

        // Merge branding fields (only update what is provided)
        const branding = hospital.branding || {};
        if (appName !== undefined) branding.appName = appName;
        if (tagline !== undefined) branding.tagline = tagline;
        if (logoUrl !== undefined) branding.logoUrl = logoUrl;
        if (faviconUrl !== undefined) branding.faviconUrl = faviconUrl;
        if (primaryColor !== undefined) branding.primaryColor = primaryColor;
        if (secondaryColor !== undefined) branding.secondaryColor = secondaryColor;
        if (accentColor !== undefined) branding.accentColor = accentColor;
        if (successColor !== undefined) branding.successColor = successColor;
        if (backgroundColor !== undefined) branding.backgroundColor = backgroundColor;
        if (textColor !== undefined) branding.textColor = textColor;
        if (supportEmail !== undefined) branding.supportEmail = supportEmail;
        if (supportPhone !== undefined) branding.supportPhone = supportPhone;
        if (address !== undefined) branding.address = address;
        if (websiteUrl !== undefined) branding.websiteUrl = websiteUrl;
        if (instagramUrl !== undefined) branding.instagramUrl = instagramUrl;
        if (facebookUrl !== undefined) branding.facebookUrl = facebookUrl;
        if (twitterUrl !== undefined) branding.twitterUrl = twitterUrl;
        if (footerText !== undefined) branding.footerText = footerText;

        hospital.branding = branding;
        hospital.markModified('branding');
        await hospital.save();

        // Emit socket event for real-time UI updates
        const io = req.app.get('io');
        if (io) {
            io.emit('branding_update', { hospitalId: hospital._id, branding: hospital.branding });
        }

        res.json({ success: true, message: 'Branding updated successfully', branding: hospital.branding });
    } catch (err) {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// ==========================================
// DEPARTMENT-WISE UPI ACCOUNT MANAGEMENT
// ==========================================

// 1. List all department UPI accounts for the hospital
router.get('/my-hospital/department-upi', verifyToken, async (req, res) => {
    try {
        const hospitalId = req.user.hospitalId;
        if (!hospitalId) return res.status(400).json({ success: false, message: 'No hospital context' });

        const upis = await DepartmentUpi.find({ hospitalId })
            .populate('staffUserId', 'name email phone')
            .populate('createdBy', 'name')
            .sort({ createdAt: -1 });

        res.json({ success: true, departmentUpis: upis });
    } catch (err) {
        console.error('Error fetching department UPIs:', err);
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// 2. Create a new department UPI account (Hospital Admin only)
router.post('/my-hospital/department-upi', verifyHospitalAdmin, async (req, res) => {
    try {
        const hospitalId = req.user.hospitalId;
        if (!hospitalId) return res.status(400).json({ success: false, message: 'No hospital context' });

        const { staffUserId, upiId, label } = req.body;

        if (!staffUserId || !upiId || !label) {
            return res.status(400).json({ success: false, message: 'staffUserId, upiId, and label are required' });
        }

        // Validate staff exists and belongs to this hospital
        const staffUser = await User.findOne({ _id: staffUserId, hospitalId });
        if (!staffUser) {
            return res.status(404).json({ success: false, message: 'Staff member not found in this hospital' });
        }

        // Get role name for denormalization
        let staffRoleName = 'Staff';
        const specialRoles = ['centraladmin', 'superadmin', 'hospitaladmin'];
        if (typeof staffUser.role === 'string' && specialRoles.includes(staffUser.role)) {
            return res.status(400).json({ success: false, message: 'Cannot assign UPI to admin accounts' });
        }
        if (staffUser.role && mongoose.Types.ObjectId.isValid(staffUser.role)) {
            const roleDoc = await Role.findById(staffUser.role);
            if (roleDoc) staffRoleName = roleDoc.name;
        } else if (typeof staffUser.role === 'string') {
            staffRoleName = staffUser.role;
        }

        // Check one-staff-one-UPI constraint
        const existingForStaff = await DepartmentUpi.findOne({ hospitalId, staffUserId });
        if (existingForStaff) {
            return res.status(400).json({ success: false, message: 'This staff member already has a UPI account assigned. Each staff can have only one UPI account.' });
        }

        // Check duplicate UPI ID within hospital
        const existingUpiId = await DepartmentUpi.findOne({ hospitalId, upiId: upiId.trim() });
        if (existingUpiId) {
            return res.status(400).json({ success: false, message: 'This UPI ID is already configured for another department in this hospital.' });
        }

        const newUpi = new DepartmentUpi({
            hospitalId,
            staffUserId,
            staffRoleName,
            upiId: upiId.trim(),
            label: label.trim(),
            isActive: true,
            createdBy: req.user._id || req.user.userId
        });

        await newUpi.save();

        const populated = await DepartmentUpi.findById(newUpi._id)
            .populate('staffUserId', 'name email phone')
            .populate('createdBy', 'name');

        res.status(201).json({ success: true, message: 'Department UPI account created', departmentUpi: populated });
    } catch (err) {
        // Handle MongoDB duplicate key errors
        if (err.code === 11000) {
            return res.status(400).json({ success: false, message: 'Duplicate UPI assignment detected. Each staff can have only one UPI, and each UPI ID must be unique within the hospital.' });
        }
        console.error('Error creating department UPI:', err);
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// 3. Update a department UPI account (Hospital Admin only)
router.put('/my-hospital/department-upi/:id', verifyHospitalAdmin, async (req, res) => {
    try {
        const hospitalId = req.user.hospitalId;
        if (!hospitalId) return res.status(400).json({ success: false, message: 'No hospital context' });

        const upiDoc = await DepartmentUpi.findOne({ _id: req.params.id, hospitalId });
        if (!upiDoc) {
            return res.status(404).json({ success: false, message: 'Department UPI account not found' });
        }

        const { upiId, label, staffUserId, isActive } = req.body;

        // If changing UPI ID, check for duplicates
        if (upiId !== undefined && upiId.trim() !== upiDoc.upiId) {
            const duplicate = await DepartmentUpi.findOne({ hospitalId, upiId: upiId.trim(), _id: { $ne: upiDoc._id } });
            if (duplicate) {
                return res.status(400).json({ success: false, message: 'This UPI ID is already configured for another department.' });
            }
            upiDoc.upiId = upiId.trim();
        }

        // If changing staff assignment, validate and update role name
        if (staffUserId !== undefined && String(staffUserId) !== String(upiDoc.staffUserId)) {
            const newStaff = await User.findOne({ _id: staffUserId, hospitalId });
            if (!newStaff) {
                return res.status(404).json({ success: false, message: 'New staff member not found in this hospital' });
            }
            // Check if new staff already has a UPI
            const existingForNewStaff = await DepartmentUpi.findOne({ hospitalId, staffUserId, _id: { $ne: upiDoc._id } });
            if (existingForNewStaff) {
                return res.status(400).json({ success: false, message: 'The selected staff member already has a UPI account assigned.' });
            }

            let newRoleName = 'Staff';
            if (newStaff.role && mongoose.Types.ObjectId.isValid(newStaff.role)) {
                const roleDoc = await Role.findById(newStaff.role);
                if (roleDoc) newRoleName = roleDoc.name;
            } else if (typeof newStaff.role === 'string') {
                newRoleName = newStaff.role;
            }

            upiDoc.staffUserId = staffUserId;
            upiDoc.staffRoleName = newRoleName;
        }

        if (label !== undefined) upiDoc.label = label.trim();
        if (isActive !== undefined) upiDoc.isActive = isActive;

        await upiDoc.save();

        const populated = await DepartmentUpi.findById(upiDoc._id)
            .populate('staffUserId', 'name email phone')
            .populate('createdBy', 'name');

        res.json({ success: true, message: 'Department UPI account updated', departmentUpi: populated });
    } catch (err) {
        if (err.code === 11000) {
            return res.status(400).json({ success: false, message: 'Duplicate UPI assignment detected.' });
        }
        console.error('Error updating department UPI:', err);
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// 4. Delete a department UPI account (Hospital Admin only)
router.delete('/my-hospital/department-upi/:id', verifyHospitalAdmin, async (req, res) => {
    try {
        const hospitalId = req.user.hospitalId;
        if (!hospitalId) return res.status(400).json({ success: false, message: 'No hospital context' });

        const upiDoc = await DepartmentUpi.findOne({ _id: req.params.id, hospitalId });
        if (!upiDoc) {
            return res.status(404).json({ success: false, message: 'Department UPI account not found' });
        }

        await DepartmentUpi.deleteOne({ _id: upiDoc._id });
        res.json({ success: true, message: 'Department UPI account deleted' });
    } catch (err) {
        console.error('Error deleting department UPI:', err);
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// 5. Get department UPI by role name (for module-wise visibility)
router.get('/my-hospital/department-upi/by-role/:roleName', verifyToken, async (req, res) => {
    try {
        const hospitalId = req.user.hospitalId;
        if (!hospitalId) return res.status(400).json({ success: false, message: 'No hospital context' });

        const roleName = decodeURIComponent(req.params.roleName).trim();

        // Case-insensitive, partial match on role name (e.g. 'Reception' matches 'Receptionist')
        const upiDoc = await DepartmentUpi.findOne({
            hospitalId,
            staffRoleName: { $regex: new RegExp(roleName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') },
            isActive: true
        });

        if (!upiDoc) {
            return res.json({ success: true, departmentUpi: null, message: 'No UPI account configured for this department' });
        }

        res.json({ success: true, departmentUpi: upiDoc });
    } catch (err) {
        console.error('Error fetching department UPI by role:', err);
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// 6. Get eligible staff members for UPI assignment (Hospital Admin)
router.get('/my-hospital/staff-for-upi', verifyHospitalAdmin, async (req, res) => {
    try {
        const hospitalId = req.user.hospitalId;
        if (!hospitalId) return res.status(400).json({ success: false, message: 'No hospital context' });

        // Get all users for this hospital (exclude patients and admins)
        const allUsers = await User.find({ hospitalId }).select('name email phone role');

        // Resolve role names
        const specialRoles = ['centraladmin', 'superadmin', 'hospitaladmin', 'patient', 'doctor'];
        const eligibleStaff = [];

        for (const user of allUsers) {
            // Skip special/admin roles
            if (typeof user.role === 'string' && specialRoles.includes(user.role.toLowerCase())) continue;

            let roleName = 'Staff';
            if (user.role && mongoose.Types.ObjectId.isValid(user.role)) {
                const roleDoc = await Role.findById(user.role).lean();
                if (roleDoc) roleName = roleDoc.name;
                // Skip if the role is patient-related or doctor-related
                if (roleDoc && (roleDoc.name.toLowerCase() === 'patient' || roleDoc.name.toLowerCase().includes('doctor'))) continue;
            } else if (typeof user.role === 'string') {
                roleName = user.role;
            }

            eligibleStaff.push({
                _id: user._id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                roleName
            });
        }

        // Get staff IDs that already have UPI assigned
        const assignedUpiDocs = await DepartmentUpi.find({ hospitalId }).select('staffUserId');
        const assignedStaffIds = new Set(assignedUpiDocs.map(d => String(d.staffUserId)));

        // Mark staff availability
        const staffList = eligibleStaff.map(s => ({
            ...s,
            hasUpiAssigned: assignedStaffIds.has(String(s._id))
        }));

        res.json({ success: true, staff: staffList });
    } catch (err) {
        console.error('Error fetching eligible staff for UPI:', err);
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

module.exports = router;
module.exports.verifyCentralAdmin = verifyCentralAdmin;
module.exports.verifyHospitalAdmin = verifyHospitalAdmin;

