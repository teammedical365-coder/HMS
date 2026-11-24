const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const { verifyToken } = require('../middleware/auth.middleware');
const User = require('../models/user.model');
const Hospital = require('../models/hospital.model');
const LabTest = require('../models/labTest.model');
const TestPackage = require('../models/testPackage.model');
const LabDoctor = require('../models/labDoctor.model');
const LabCounter = require('../models/labCounter.model');
const LabOrder = require('../models/labOrder.model');

// =========================================================================
// 1. FILE UPLOAD CONFIGURATION (Prescriptions)
// =========================================================================
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const storage = multer.memoryStorage();
const upload = multer({
    storage,
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter: (_req, file, cb) => {
        if (ALLOWED_MIME_TYPES.includes(file.mimetype.toLowerCase())) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file format. Only PDF, JPG, JPEG, and PNG are allowed.'));
        }
    }
});

// Ensure prescriptions directory exists per tenant
function getPrescriptionDir(hospitalId) {
    const dir = path.resolve(__dirname, '../../uploads/prescriptions', String(hospitalId));
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
}

// =========================================================================
// 2. RECEPTION SECURITY & ROLE MIDDLEWARE
// =========================================================================
const verifyReceptionAccess = (req, res, next) => {
    const user = req.user;
    if (!user) return res.status(401).json({ success: false, message: 'Authentication required' });

    const roleData = user._roleData;
    const roleName = String(roleData?.name || user.role || '').toLowerCase();
    const perms = roleData?.permissions || [];

    const isAuthorized = (
        perms.includes('*') ||
        roleName.includes('admin') ||
        roleName.includes('reception') ||
        roleName.includes('manager') ||
        roleName.includes('lab') ||
        perms.includes('lab_view') ||
        perms.includes('orders:create') ||
        perms.includes('patients:create') ||
        perms.includes('orders:view') ||
        perms.includes('patients:view')
    );

    if (!isAuthorized) {
        return res.status(403).json({ success: false, message: 'Access denied: Lab reception permissions required' });
    }

    // Resolve tenant hospital
    req.hospitalId = req.user.hospitalId || req.headers['x-hospital-id'] || null;
    next();
};

// =========================================================================
// 3. ATOMIC UHID / ORDER SEQUENCE GENERATORS
// =========================================================================
async function generateAtomicUHID(hospitalId, hospital) {
    const hospitalCode = await Hospital.ensureHospitalCode(hospital);
    const seq = await LabCounter.getNextSequence(hospitalId, 'uhid');
    return `${hospitalCode}-UHID-${String(seq).padStart(6, '0')}`;
}

async function generateAtomicOrderNumber(hospitalId, hospital, dateStr) {
    const hospitalCode = await Hospital.ensureHospitalCode(hospital);
    const seq = await LabCounter.getNextSequence(hospitalId, 'order', dateStr);
    return `ORD-${hospitalCode}-${dateStr}-${String(seq).padStart(4, '0')}`;
}

async function generateAtomicToken(hospitalId, dateStr) {
    return await LabCounter.getNextSequence(hospitalId, 'token', dateStr);
}

// =========================================================================
// 4. PATIENT REGISTRATION & SEARCH APIS
// =========================================================================

/**
 * GET /api/lab/reception/patients
 * Search and list patients for this tenant hospital
 */
router.get('/patients', verifyToken, verifyReceptionAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId;
        if (!hospitalId) return res.status(400).json({ success: false, message: 'Hospital context required' });

        const { search = '', page = 1, limit = 20, includeInactive = 'false' } = req.query;
        const query = { hospitalId, role: 'patient' };

        if (includeInactive !== 'true') {
            query.isActive = { $ne: false };
        }

        if (search.trim()) {
            const term = search.trim();
            const safeRegex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
            query.$or = [
                { name: safeRegex },
                { phone: safeRegex },
                { uhid: safeRegex },
                { mrn: safeRegex },
                { patientId: safeRegex }
            ];
        }

        const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
        const [patients, total] = await Promise.all([
            User.find(query)
                .select('name phone alternatePhone email gender dob age address city state pinCode zipCode uhid mrn patientId referringDoctor referringDoctorName isActive createdAt')
                .populate('referringDoctor', 'doctorName specialization registrationNumber')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit, 10))
                .lean(),
            User.countDocuments(query)
        ]);

        res.json({
            success: true,
            data: patients,
            pagination: {
                total,
                page: parseInt(page, 10),
                limit: parseInt(limit, 10),
                totalPages: Math.ceil(total / parseInt(limit, 10))
            }
        });
    } catch (err) {
        console.error('Error fetching lab patients:', err);
        res.status(500).json({ success: false, message: 'Failed to retrieve patients' });
    }
});

/**
 * GET /api/lab/reception/patients/duplicate-check
 * Detect potential duplicate patient records before creation
 */
router.get('/patients/duplicate-check', verifyToken, verifyReceptionAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId;
        const { phone = '', name = '', dob = '' } = req.query;

        if (!phone.trim()) {
            return res.json({ success: true, isDuplicate: false, duplicates: [] });
        }

        const cleanPhone = phone.trim().replace(/\D/g, '').slice(-10);
        const conditions = [{ hospitalId, role: 'patient', phone: cleanPhone }];

        // Check if phone + matching name
        if (name.trim()) {
            const safeNameRegex = new RegExp('^' + name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i');
            conditions.push({ hospitalId, role: 'patient', name: safeNameRegex });
        }

        const duplicates = await User.find({
            hospitalId,
            role: 'patient',
            isActive: { $ne: false },
            $or: conditions
        }).select('name phone gender dob age uhid mrn address city').lean();

        res.json({
            success: true,
            isDuplicate: duplicates.length > 0,
            duplicates
        });
    } catch (err) {
        console.error('Duplicate check error:', err);
        res.status(500).json({ success: false, message: 'Duplicate check failed' });
    }
});

/**
 * POST /api/lab/reception/patients
 * Register a new laboratory patient with atomic UHID
 */
router.post('/patients', verifyToken, verifyReceptionAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId;
        if (!hospitalId) return res.status(400).json({ success: false, message: 'Hospital context required' });

        const {
            name,
            gender,
            dob,
            age,
            phone,
            alternatePhone = '',
            email = '',
            address = '',
            city = '',
            state = '',
            pinCode = '',
            referringDoctor = null,
            referringDoctorName = '',
            emergencyContact = null
        } = req.body;

        // Validation
        if (!name || !name.trim()) {
            return res.status(400).json({ success: false, message: 'Patient Name is required' });
        }
        if (!phone || !phone.trim()) {
            return res.status(400).json({ success: false, message: 'Phone number is required' });
        }

        const cleanPhone = phone.trim().replace(/\D/g, '').slice(-10);
        if (cleanPhone.length !== 10) {
            return res.status(400).json({ success: false, message: 'Mobile number must be exactly 10 digits' });
        }

        // Derive Age / DOB
        let parsedAge = Number(age);
        let parsedDob = dob ? new Date(dob) : null;
        if (!parsedAge && parsedDob && !isNaN(parsedDob.getTime())) {
            const diffMs = Date.now() - parsedDob.getTime();
            parsedAge = Math.floor(diffMs / (365.25 * 24 * 60 * 60 * 1000));
        }
        if (isNaN(parsedAge) || parsedAge < 0) parsedAge = 1;

        // Fetch hospital for smart code
        const hospital = await Hospital.findById(hospitalId);
        if (!hospital) return res.status(404).json({ success: false, message: 'Hospital not found' });

        // Atomic UHID Generation
        const uhid = await generateAtomicUHID(hospitalId, hospital);

        const newPatient = new User({
            hospitalId,
            role: 'patient',
            name: name.trim(),
            gender: gender || 'Other',
            dob: parsedDob,
            age: parsedAge,
            phone: cleanPhone,
            alternatePhone: alternatePhone.trim(),
            alternateMobile: alternatePhone.trim(),
            email: email.trim().toLowerCase(),
            address: address.trim(),
            city: city.trim(),
            state: state.trim(),
            pinCode: pinCode.trim(),
            zipCode: pinCode.trim(),
            uhid,
            mrn: uhid,
            patientId: uhid,
            referringDoctor: referringDoctor || null,
            referringDoctorName: referringDoctorName.trim(),
            emergencyContact: emergencyContact || undefined,
            isActive: true
        });

        await newPatient.save();

        res.status(201).json({
            success: true,
            message: 'Patient registered successfully',
            patient: newPatient
        });
    } catch (err) {
        console.error('Patient registration error:', err);
        res.status(500).json({ success: false, message: err.message || 'Failed to register patient' });
    }
});

/**
 * GET /api/lab/reception/patients/:id
 * Retrieve patient profile and linked laboratory order history
 */
router.get('/patients/:id', verifyToken, verifyReceptionAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId;
        const patient = await User.findOne({ _id: req.params.id, hospitalId, role: 'patient' })
            .populate('referringDoctor', 'doctorName specialization registrationNumber')
            .lean();

        if (!patient) return res.status(404).json({ success: false, message: 'Patient not found' });

        const orders = await LabOrder.find({ patient: patient._id, hospitalId })
            .sort({ createdAt: -1 })
            .select('orderNumber tokenNumber priority collectionType status pricing createdAt samplePlaceholders')
            .lean();

        res.json({
            success: true,
            patient,
            orders
        });
    } catch (err) {
        console.error('Error fetching patient profile:', err);
        res.status(500).json({ success: false, message: 'Failed to retrieve patient profile' });
    }
});

/**
 * PUT /api/lab/reception/patients/:id
 * Update patient demographic & contact info
 */
router.put('/patients/:id', verifyToken, verifyReceptionAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId;
        const patient = await User.findOne({ _id: req.params.id, hospitalId, role: 'patient' });
        if (!patient) return res.status(404).json({ success: false, message: 'Patient not found' });

        const {
            name, gender, dob, age, phone, alternatePhone, email,
            address, city, state, pinCode, referringDoctor, referringDoctorName, emergencyContact
        } = req.body;

        if (name) patient.name = name.trim();
        if (gender) patient.gender = gender;
        if (dob) patient.dob = new Date(dob);
        if (age !== undefined) patient.age = Number(age);
        if (phone) {
            const clean = phone.trim().replace(/\D/g, '').slice(-10);
            if (clean.length === 10) patient.phone = clean;
        }
        if (alternatePhone !== undefined) {
            patient.alternatePhone = alternatePhone.trim();
            patient.alternateMobile = alternatePhone.trim();
        }
        if (email !== undefined) patient.email = email.trim().toLowerCase();
        if (address !== undefined) patient.address = address.trim();
        if (city !== undefined) patient.city = city.trim();
        if (state !== undefined) patient.state = state.trim();
        if (pinCode !== undefined) {
            patient.pinCode = pinCode.trim();
            patient.zipCode = pinCode.trim();
        }
        if (referringDoctor !== undefined) patient.referringDoctor = referringDoctor || null;
        if (referringDoctorName !== undefined) patient.referringDoctorName = referringDoctorName.trim();
        if (emergencyContact !== undefined) patient.emergencyContact = emergencyContact;

        await patient.save();

        res.json({
            success: true,
            message: 'Patient updated successfully',
            patient
        });
    } catch (err) {
        console.error('Error updating patient:', err);
        res.status(500).json({ success: false, message: err.message || 'Failed to update patient' });
    }
});

/**
 * PATCH /api/lab/reception/patients/:id/deactivate
 * Soft-delete / deactivate patient record (prevented if active orders exist)
 */
router.patch('/patients/:id/deactivate', verifyToken, verifyReceptionAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId;
        const patient = await User.findOne({ _id: req.params.id, hospitalId, role: 'patient' });
        if (!patient) return res.status(404).json({ success: false, message: 'Patient not found' });

        // Guard: check if patient has active uncompleted orders
        const activeOrdersCount = await LabOrder.countDocuments({
            patient: patient._id,
            hospitalId,
            status: { $in: ['Confirmed', 'In Progress'] }
        });

        if (activeOrdersCount > 0) {
            return res.status(400).json({
                success: false,
                message: `Cannot deactivate patient: Patient has ${activeOrdersCount} active laboratory order(s).`
            });
        }

        patient.isActive = false;
        patient.deactivatedAt = new Date();
        patient.deactivatedBy = req.user.id || req.user._id;
        patient.deactivationReason = req.body.reason || 'Deactivated by reception staff';
        await patient.save();

        res.json({
            success: true,
            message: 'Patient deactivated successfully'
        });
    } catch (err) {
        console.error('Patient deactivation error:', err);
        res.status(500).json({ success: false, message: 'Failed to deactivate patient' });
    }
});

// =========================================================================
// 5. PRESCRIPTION UPLOAD & SECURE DOWNLOAD
// =========================================================================

/**
 * POST /api/lab/reception/patients/:id/prescriptions
 * Upload prescription attachments (PDF, JPG, PNG) for a patient
 */
router.post('/patients/:id/prescriptions', verifyToken, verifyReceptionAccess, upload.array('prescriptions', 5), async (req, res) => {
    try {
        const hospitalId = req.hospitalId;
        const patient = await User.findOne({ _id: req.params.id, hospitalId, role: 'patient' });
        if (!patient) return res.status(404).json({ success: false, message: 'Patient not found' });

        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ success: false, message: 'No prescription files uploaded' });
        }

        const targetDir = getPrescriptionDir(hospitalId);
        const uploadedAttachments = [];

        for (const file of req.files) {
            const ext = path.extname(file.originalname).toLowerCase();
            const safeName = `rx_${Date.now()}_${Math.random().toString(36).substring(2, 8)}${ext}`;
            const fullPath = path.join(targetDir, safeName);

            fs.writeFileSync(fullPath, file.buffer);

            const fileId = `${hospitalId}_${safeName}`;
            const fileUrl = `/api/lab/reception/prescriptions/${fileId}/download`;

            uploadedAttachments.push({
                fileId,
                fileName: file.originalname,
                fileUrl,
                mimeType: file.mimetype,
                size: file.size,
                uploadedAt: new Date(),
                uploadedBy: req.user.id || req.user._id
            });
        }

        res.status(201).json({
            success: true,
            message: `${uploadedAttachments.length} prescription file(s) attached successfully`,
            prescriptions: uploadedAttachments
        });
    } catch (err) {
        console.error('Prescription upload error:', err);
        res.status(500).json({ success: false, message: err.message || 'Prescription upload failed' });
    }
});

/**
 * GET /api/lab/reception/prescriptions/:fileId/download
 * Secure authenticated download of prescription file
 */
router.get('/prescriptions/:fileId/download', verifyToken, verifyReceptionAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId;
        const fileId = req.params.fileId;

        // Path containment & verification
        const parts = fileId.split('_');
        const fileHospitalId = parts[0];
        if (fileHospitalId !== String(hospitalId) && req.user.role !== 'superadmin' && req.user.role !== 'centraladmin') {
            return res.status(403).json({ success: false, message: 'Access denied: File belongs to another laboratory' });
        }

        const safeFilename = parts.slice(1).join('_');
        const targetDir = getPrescriptionDir(hospitalId);
        const filePath = path.join(targetDir, safeFilename);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ success: false, message: 'Prescription document not found' });
        }

        res.sendFile(filePath);
    } catch (err) {
        console.error('Prescription download error:', err);
        res.status(500).json({ success: false, message: 'Failed to download prescription' });
    }
});

// =========================================================================
// 6. ORDER CREATION, SERVER PRICING & SAMPLE PLACEHOLDERS
// =========================================================================

/**
 * Derive specimen-wise sample placeholders from ordered tests and packages
 * Grouping rule: exactly 1 sample placeholder per unique (specimenType + containerType)
 */
async function deriveSamplePlaceholders(tests, packages, hospitalId) {
    const testMap = new Map();

    // 1. Add explicitly selected tests
    tests.forEach(t => {
        testMap.set(String(t._id || t.testId), t);
    });

    // 2. Fetch all tests contained within selected packages
    const packageTestIds = [];
    packages.forEach(p => {
        (p.tests || []).forEach(tid => packageTestIds.push(tid));
    });

    if (packageTestIds.length > 0) {
        const pkgTests = await LabTest.find({
            _id: { $in: packageTestIds },
            $or: [{ hospitalId }, { hospitalId: null }]
        }).lean();

        pkgTests.forEach(t => {
            if (!testMap.has(String(t._id))) {
                testMap.set(String(t._id), t);
            }
        });
    }

    // 3. Group tests by normalized (specimenType + containerType)
    const grouping = new Map();

    testMap.forEach(t => {
        const specimen = (t.specimenType || 'Whole Blood').trim();
        const container = (t.containerType || 'EDTA Tube').trim();
        const key = `${specimen.toLowerCase()}|||${container.toLowerCase()}`;

        if (!grouping.has(key)) {
            grouping.set(key, {
                specimenType: specimen,
                containerType: container,
                requiredVolume: t.requiredVolume || '2-3 mL',
                testCodes: [],
                testNames: []
            });
        }

        const group = grouping.get(key);
        const code = t.testCode || t.code || 'TEST';
        const name = t.testName || t.name || 'Test';

        if (!group.testCodes.includes(code)) {
            group.testCodes.push(code);
            group.testNames.push(name);
        }
    });

    // 4. Transform to sample placeholder array
    const placeholders = [];
    let counter = 1;
    grouping.forEach(grp => {
        placeholders.push({
            samplePlaceholderId: `SMP-${String(counter++).padStart(2, '0')}`,
            specimenType: grp.specimenType,
            containerType: grp.containerType,
            requiredVolume: grp.requiredVolume,
            testCodes: grp.testCodes,
            testNames: grp.testNames,
            status: 'Pending Collection'
        });
    });

    return placeholders;
}

/**
 * Recalculate order pricing server-side from active Phase 3 master data
 */
async function computeServerPricing(testIds = [], packageIds = [], hospitalId) {
    const verifiedTests = [];
    let totalStandardTestsPrice = 0;

    if (testIds.length > 0) {
        const dbTests = await LabTest.find({
            _id: { $in: testIds },
            $or: [{ hospitalId }, { hospitalId: null }],
            isActive: { $ne: false }
        }).lean();

        if (dbTests.length !== testIds.length) {
            throw new Error('One or more selected tests are invalid, inactive, or not authorized for this laboratory.');
        }

        dbTests.forEach(t => {
            const price = Number(t.standardPrice ?? t.price) || 0;
            totalStandardTestsPrice += price;
            verifiedTests.push({
                testId: t._id,
                testCode: t.testCode || t.code,
                testName: t.testName || t.name,
                department: t.department || 'General Pathology',
                specimenType: t.specimenType || 'Whole Blood',
                containerType: t.containerType || 'EDTA Tube',
                requiredVolume: t.requiredVolume || '2-3 mL',
                fastingRequired: Boolean(t.fastingRequired),
                fastingInstructions: t.fastingInstructions || '',
                turnaroundTime: t.turnaroundTime || 24,
                tatUnit: t.tatUnit || 'Hours',
                standardPrice: price,
                price: price
            });
        });
    }

    const verifiedPackages = [];
    let totalStandardPkgsPrice = 0;
    let totalDiscountedPkgsPrice = 0;
    let totalPackageSavings = 0;

    if (packageIds.length > 0) {
        const dbPackages = await TestPackage.find({
            _id: { $in: packageIds },
            $or: [{ hospitalId }, { hospitalId: null }],
            isActive: { $ne: false }
        }).lean();

        if (dbPackages.length !== packageIds.length) {
            throw new Error('One or more selected packages are invalid, inactive, or not authorized for this laboratory.');
        }

        dbPackages.forEach(p => {
            const std = Number(p.standardPrice) || Number(p.price) || 0;
            const disc = Number(p.discountedPrice) || std;
            const sav = Number(p.savings) || Math.max(0, std - disc);

            totalStandardPkgsPrice += std;
            totalDiscountedPkgsPrice += disc;
            totalPackageSavings += sav;

            verifiedPackages.push({
                packageId: p._id,
                packageCode: p.packageCode || p.code,
                packageName: p.packageName || p.name,
                tests: p.tests || [],
                standardPrice: std,
                discountedPrice: disc,
                savings: sav
            });
        });
    }

    const totalStandardPrice = totalStandardTestsPrice + totalStandardPkgsPrice;
    const totalDiscount = totalPackageSavings;
    const netAmount = totalStandardTestsPrice + totalDiscountedPkgsPrice;

    return {
        verifiedTests,
        verifiedPackages,
        pricing: {
            totalStandardPrice,
            totalDiscount,
            netAmount,
            currency: 'INR'
        }
    };
}

/**
 * POST /api/lab/reception/orders/price-preview
 * Calculate pricing and sample placeholders without persisting order
 */
router.post('/orders/price-preview', verifyToken, verifyReceptionAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId;
        const { testIds = [], packageIds = [] } = req.body;

        if (testIds.length === 0 && packageIds.length === 0) {
            return res.status(400).json({ success: false, message: 'Please select at least one test or package' });
        }

        const { verifiedTests, verifiedPackages, pricing } = await computeServerPricing(testIds, packageIds, hospitalId);
        const placeholders = await deriveSamplePlaceholders(verifiedTests, verifiedPackages, hospitalId);

        res.json({
            success: true,
            pricing,
            placeholders,
            tests: verifiedTests,
            packages: verifiedPackages
        });
    } catch (err) {
        console.error('Price preview error:', err);
        res.status(400).json({ success: false, message: err.message || 'Error calculating price preview' });
    }
});

/**
 * POST /api/lab/reception/orders
 * Create and book a laboratory test order with server pricing & sample placeholders
 */
router.post('/orders', verifyToken, verifyReceptionAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId;
        if (!hospitalId) return res.status(400).json({ success: false, message: 'Hospital context required' });

        const {
            patientId,
            testIds = [],
            packageIds = [],
            referringDoctor = null,
            referringDoctorName = '',
            priority = 'Routine',
            collectionType = 'Walk-in',
            locationId = null,
            prescriptions = [],
            notes = ''
        } = req.body;

        if (!patientId) {
            return res.status(400).json({ success: false, message: 'Patient selection is required' });
        }
        if (testIds.length === 0 && packageIds.length === 0) {
            return res.status(400).json({ success: false, message: 'Please select at least one test or package' });
        }

        // 1. Verify Patient
        const patient = await User.findOne({ _id: patientId, hospitalId, role: 'patient' });
        if (!patient) return res.status(404).json({ success: false, message: 'Selected patient does not exist in this laboratory' });

        // 2. Server-Enforced Pricing & Validation
        const { verifiedTests, verifiedPackages, pricing } = await computeServerPricing(testIds, packageIds, hospitalId);

        // 3. Specimen-Wise Sample Placeholders
        const placeholders = await deriveSamplePlaceholders(verifiedTests, verifiedPackages, hospitalId);

        // 4. Atomic Order Number & Token Generation
        const hospital = await Hospital.findById(hospitalId);
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const orderNumber = await generateAtomicOrderNumber(hospitalId, hospital, dateStr);
        const tokenNumber = await generateAtomicToken(hospitalId, dateStr);

        // 5. Build referring doctor info
        let refDocName = referringDoctorName.trim();
        let refDocId = referringDoctor || null;
        if (refDocId) {
            const doc = await LabDoctor.findById(refDocId);
            if (doc) refDocName = `Dr. ${doc.doctorName}`;
        }

        // 6. Create LabOrder record
        const newOrder = new LabOrder({
            hospitalId,
            orderNumber,
            tokenNumber,
            patient: patient._id,
            patientSnapshot: {
                name: patient.name,
                uhid: patient.uhid || patient.mrn || '',
                mrn: patient.mrn || patient.uhid || '',
                phone: patient.phone,
                gender: patient.gender,
                age: patient.age,
                dob: patient.dob,
                email: patient.email || '',
                address: patient.address || '',
                city: patient.city || '',
                state: patient.state || '',
                pinCode: patient.pinCode || patient.zipCode || ''
            },
            referringDoctor: refDocId,
            referringDoctorName: refDocName,
            priority,
            collectionType,
            locationId: locationId || req.user.locationId || null,
            tests: verifiedTests,
            packages: verifiedPackages,
            samplePlaceholders: placeholders,
            prescriptions: Array.isArray(prescriptions) ? prescriptions : [],
            pricing,
            status: 'Confirmed',
            notes: notes.trim(),
            createdBy: req.user.id || req.user._id,
            updatedBy: req.user.id || req.user._id
        });

        await newOrder.save();

        res.status(201).json({
            success: true,
            message: `Laboratory Requisition #${orderNumber} booked successfully`,
            order: newOrder
        });
    } catch (err) {
        console.error('Order booking error:', err);
        res.status(400).json({ success: false, message: err.message || 'Failed to create laboratory order' });
    }
});

/**
 * GET /api/lab/reception/orders
 * List orders with search, status filters, and pagination
 */
router.get('/orders', verifyToken, verifyReceptionAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId;
        const { search = '', status = 'all', priority = 'all', page = 1, limit = 20 } = req.query;

        const query = { hospitalId };
        if (status !== 'all') query.status = status;
        if (priority !== 'all') query.priority = priority;

        if (search.trim()) {
            const term = search.trim();
            const safeRegex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
            query.$or = [
                { orderNumber: safeRegex },
                { 'patientSnapshot.name': safeRegex },
                { 'patientSnapshot.phone': safeRegex },
                { 'patientSnapshot.uhid': safeRegex },
                { referringDoctorName: safeRegex }
            ];
        }

        const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
        const [orders, total] = await Promise.all([
            LabOrder.find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit, 10))
                .lean(),
            LabOrder.countDocuments(query)
        ]);

        res.json({
            success: true,
            data: orders,
            pagination: {
                total,
                page: parseInt(page, 10),
                limit: parseInt(limit, 10),
                totalPages: Math.ceil(total / parseInt(limit, 10))
            }
        });
    } catch (err) {
        console.error('Error fetching orders:', err);
        res.status(500).json({ success: false, message: 'Failed to retrieve orders' });
    }
});

/**
 * GET /api/lab/reception/orders/:id
 * Retrieve single order detail with complete breakdown
 */
router.get('/orders/:id', verifyToken, verifyReceptionAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId;
        const order = await LabOrder.findOne({ _id: req.params.id, hospitalId })
            .populate('patient', 'name phone email gender dob age uhid mrn')
            .populate('referringDoctor', 'doctorName specialization registrationNumber')
            .lean();

        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

        res.json({
            success: true,
            order
        });
    } catch (err) {
        console.error('Error retrieving order details:', err);
        res.status(500).json({ success: false, message: 'Failed to retrieve order details' });
    }
});

/**
 * POST /api/lab/reception/orders/:id/cancel
 * Cancel order with audit (only eligible if samples not yet processed)
 */
router.post('/orders/:id/cancel', verifyToken, verifyReceptionAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId;
        const { reason = '' } = req.body;

        if (!reason.trim()) {
            return res.status(400).json({ success: false, message: 'Cancellation reason is required' });
        }

        const order = await LabOrder.findOne({ _id: req.params.id, hospitalId });
        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

        if (order.status === 'Completed') {
            return res.status(400).json({ success: false, message: 'Cannot cancel an order that has already been completed.' });
        }
        if (order.status === 'Cancelled') {
            return res.status(400).json({ success: false, message: 'Order is already cancelled.' });
        }

        order.status = 'Cancelled';
        order.cancellation = {
            isCancelled: true,
            cancelledAt: new Date(),
            cancelledBy: req.user.id || req.user._id,
            reason: reason.trim()
        };

        // Mark placeholders as cancelled
        order.samplePlaceholders.forEach(sp => {
            sp.status = 'Cancelled';
        });

        await order.save();

        res.json({
            success: true,
            message: `Order #${order.orderNumber} cancelled successfully`,
            order
        });
    } catch (err) {
        console.error('Order cancellation error:', err);
        res.status(500).json({ success: false, message: err.message || 'Failed to cancel order' });
    }
});

// =========================================================================
// 7. RECOLLECTION REQUESTS INTEGRATION
// =========================================================================

/**
 * GET /api/lab/reception/recollections
 * List all orders having pending sample recollections
 */
router.get('/recollections', verifyToken, verifyReceptionAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId;
        const recollectionOrders = await LabOrder.find({
            hospitalId,
            $or: [
                { 'samplePlaceholders.status': 'Recollection Requested' },
                { 'recollectionRequests.status': 'Pending' }
            ]
        })
        .select('orderNumber tokenNumber patientSnapshot priority samplePlaceholders recollectionRequests createdAt')
        .sort({ updatedAt: -1 })
        .lean();

        res.json({
            success: true,
            data: recollectionOrders
        });
    } catch (err) {
        console.error('Error fetching recollections:', err);
        res.status(500).json({ success: false, message: 'Failed to retrieve recollection requests' });
    }
});

/**
 * PATCH /api/lab/reception/recollections/:orderId/:placeholderId/acknowledge
 * Acknowledge recollection and create a new collection task
 */
router.patch('/recollections/:orderId/:placeholderId/acknowledge', verifyToken, verifyReceptionAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId;
        const { orderId, placeholderId } = req.params;

        const order = await LabOrder.findOne({ _id: orderId, hospitalId });
        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

        const targetPlaceholder = order.samplePlaceholders.find(sp => sp.samplePlaceholderId === placeholderId);
        if (!targetPlaceholder) {
            return res.status(404).json({ success: false, message: 'Sample placeholder not found' });
        }

        // Create a new sample placeholder for recollection
        const newPlaceholderId = `SMP-${String(order.samplePlaceholders.length + 1).padStart(2, '0')}`;
        order.samplePlaceholders.push({
            samplePlaceholderId: newPlaceholderId,
            specimenType: targetPlaceholder.specimenType,
            containerType: targetPlaceholder.containerType,
            requiredVolume: targetPlaceholder.requiredVolume,
            testCodes: targetPlaceholder.testCodes,
            testNames: targetPlaceholder.testNames,
            status: 'Pending Collection'
        });

        // Mark pending recollection requests as acknowledged
        order.recollectionRequests.forEach(rr => {
            if (rr.samplePlaceholderId === placeholderId && rr.status === 'Pending') {
                rr.status = 'Acknowledged';
                rr.acknowledgedAt = new Date();
                rr.acknowledgedBy = req.user.id || req.user._id;
            }
        });

        await order.save();

        res.json({
            success: true,
            message: `Recollection acknowledged. New collection task #${newPlaceholderId} scheduled.`,
            order
        });
    } catch (err) {
        console.error('Error acknowledging recollection:', err);
        res.status(500).json({ success: false, message: 'Failed to acknowledge recollection' });
    }
});

// =========================================================================
// 8. PRINTABLE ORDER SLIP & TOKEN DATA
// =========================================================================

/**
 * GET /api/lab/reception/orders/:id/slip
 * Return tenant-branded print data for laboratory order slips and tokens
 */
router.get('/orders/:id/slip', verifyToken, verifyReceptionAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId;
        const [order, hospital] = await Promise.all([
            LabOrder.findOne({ _id: req.params.id, hospitalId }).lean(),
            Hospital.findById(hospitalId).select('name email phone address logo slug').lean()
        ]);

        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

        res.json({
            success: true,
            slip: {
                hospital: hospital || { name: 'Medical365 Laboratory Diagnostics' },
                order,
                generatedAt: new Date()
            }
        });
    } catch (err) {
        console.error('Error fetching order slip:', err);
        res.status(500).json({ success: false, message: 'Failed to generate order slip' });
    }
});

module.exports = router;
