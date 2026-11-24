const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const multer = require('multer');
const LabReport = require('../models/labReport.model');
const Appointment = require('../models/appointment.model');
const Lab = require('../models/lab.model');
const { verifyToken } = require('../middleware/auth.middleware');
const imagekit = require('../utils/imagekit');
const validateFileType = require('../utils/validateFileType');

const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'application/pdf'];
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        if (ALLOWED_MIMES.includes(file.mimetype)) cb(null, true);
        else cb(new Error('Only JPEG, PNG and PDF allowed'), false);
    },
});

// MIDDLEWARE: Verify User is a Lab / Clinical Pathology Personnel
const verifyLab = async (req, res, next) => {
    const roleData = req.user._roleData;
    const roleName = roleData ? roleData.name.toLowerCase() : String(req.user.role || '').toLowerCase();
    const permissions = roleData?.permissions || [];

    const isLmsRole = (
        roleName.includes('lab') ||
        roleName.includes('pathologist') ||
        roleName.includes('phlebotomist') ||
        roleName.includes('sample collector') ||
        roleName.includes('admin')
    );

    const hasLmsPermission = (
        permissions.includes('*') ||
        permissions.includes('lab_view') ||
        permissions.includes('lab_manage') ||
        permissions.includes('orders:view') ||
        permissions.includes('samples:view') ||
        permissions.includes('reports:view')
    );

    if (!isLmsRole && !hasLmsPermission) {
        return res.status(403).json({ success: false, message: 'Access denied. Laboratory personnel only.' });
    }
    next();
};

// 1. GET LAB DASHBOARD STATS
router.get('/stats', verifyToken, verifyLab, async (req, res) => {
    try {
        const hid = req.user.hospitalId;
        const hospitalFilter = hid ? { hospitalId: hid } : {};

        const labProfile = await Lab.findOne({
            $or: [{ email: req.user.email }, { userId: req.user.id }]
        });

        let labFilter = { ...hospitalFilter };
        if (labProfile) {
            labFilter = { ...hospitalFilter, $or: [{ labId: labProfile._id }, { labId: null }, { labId: { $exists: false } }] };
        } else {
            labFilter = { ...hospitalFilter, $or: [{ labId: null }, { labId: { $exists: false } }] };
        }

        const pending = await LabReport.countDocuments({ ...labFilter, reportStatus: 'PENDING' });
        
        // Dynamically calculate revenue by fetching individual test prices
        const completedReports = await LabReport.find({ ...labFilter, reportStatus: 'UPLOADED' });
        const completed = completedReports.length;
        
        const LabTest = require('../models/labTest.model');
        const allTests = await LabTest.find();
        
        let revenue = 0;
        completedReports.forEach(report => {
            if (report.amount && report.amount > 0) {
                revenue += report.amount; // Use pre-calculated amount if available
            } else {
                (report.testNames || []).forEach(testName => {
                    const testObj = allTests.find(t => t.name.trim().toLowerCase() === testName.trim().toLowerCase());
                    if (testObj) {
                        const hospitalStrId = hid ? hid.toString() : null;
                        if (hospitalStrId && testObj.hospitalPrices && testObj.hospitalPrices.has && testObj.hospitalPrices.has(hospitalStrId)) {
                            revenue += testObj.hospitalPrices.get(hospitalStrId) || 0;
                        } else if (hospitalStrId && testObj.hospitalPrices && typeof testObj.hospitalPrices === 'object' && testObj.hospitalPrices[hospitalStrId]) {
                            revenue += testObj.hospitalPrices[hospitalStrId];
                        } else {
                            revenue += testObj.price || 0;
                        }
                    } else {
                        revenue += 500; // Fallback if test no longer exists
                    }
                });
            }
        });

        res.json({
            success: true,
            stats: { pending, completed, revenue, labName: labProfile?.name || 'Lab' }
        });
    } catch (error) {
        console.error("[lab] stats error");
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// 2. GET ASSIGNED REQUESTS (Pending or All)
router.get('/requests', verifyToken, verifyLab, async (req, res) => {
    try {
        const { status } = req.query;
        const hid = req.user.hospitalId;
        const hospitalFilter = hid ? { hospitalId: hid } : {};

        const labProfile = await Lab.findOne({
            $or: [{ email: req.user.email }, { userId: req.user.id }]
        });

        let query = { ...hospitalFilter };
        if (labProfile) {
            query.$or = [{ labId: labProfile._id }, { labId: null }, { labId: { $exists: false } }];
        } else {
            query.$or = [{ labId: null }, { labId: { $exists: false } }];
        }

        if (status && status !== 'all') {
            query.reportStatus = status.toUpperCase() === 'PENDING' ? 'PENDING' : 'UPLOADED';
        }

        const requests = await LabReport.find(query)
            .populate('userId', 'name email phone patientId')
            .populate('doctorId', 'name')
            .sort({ createdAt: -1 });

        res.json({ success: true, requests });
    } catch (error) {
        console.error("[lab] fetch requests error");
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// 3. UPLOAD TEST REPORT
router.post('/upload-report/:reportId', verifyToken, verifyLab, upload.single('reportFile'), async (req, res) => {
    try {
        const { reportId } = req.params;
        const { notes } = req.body;

        if (!req.file) return res.status(400).json({ message: 'No file uploaded.' });

        const typeErr = await validateFileType(req.file, ALLOWED_MIMES);
        if (typeErr) return res.status(400).json({ success: false, message: typeErr });

        // RLS: scope by hospitalId so lab staff can only upload to their hospital's reports
        const reportFilter = { _id: reportId };
        if (req.user.hospitalId) reportFilter.hospitalId = req.user.hospitalId;
        const report = await LabReport.findOne(reportFilter);
        if (!report) return res.status(404).json({ message: 'Report request not found or access denied.' });

        // Upload to ImageKit
        const fileResult = await imagekit.upload({
            file: req.file.buffer,
            fileName: `lab_report_${report.patientId}_${Date.now()}`,
            folder: '/crm/lab_reports'
        });

        // Update Lab Report Status
        report.reportFile = {
            url: fileResult.url,
            fileId: fileResult.fileId,
            name: req.file.originalname,
            uploadedAt: new Date()
        };
        report.testStatus = 'DONE';
        report.reportStatus = 'UPLOADED';
        report.notes = notes || report.notes;
        await report.save();

        // OPTIONAL: Update Appointment to reflect report availability
        // This puts the file into the Doctor's view as well
        if (report.appointmentId) {
            const appointment = await Appointment.findById(report.appointmentId);
            if (appointment) {
                if (!appointment.prescriptions) appointment.prescriptions = [];
                appointment.prescriptions.push({
                    type: 'lab_report',
                    name: `Lab Report: ${report.testNames.join(', ')}`,
                    url: fileResult.url,
                    fileId: fileResult.fileId,
                    uploadedAt: new Date()
                });
                await appointment.save();
            }
        }

        const io = req.app.get('io');
        const Notification = require('../models/notification.model');

        const notificationItem = new Notification({
            senderId: req.user.id,
            recipientRole: 'doctor',
            recipientId: report.doctorId,
            message: 'Lab results ready.',
            referenceType: 'LabReport',
            referenceId: report._id,
            patientId: report.patientId.toString()
        });
        await notificationItem.save();

        if (io) {
            io.to(report.doctorId.toString()).emit('new_notification', notificationItem);
        }

        res.json({ success: true, message: 'Report uploaded successfully', report });

    } catch (error) {
        console.error("[lab] upload error");
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// 4. GET PATIENT'S LAB REPORTS (for User/Patient Dashboard)
router.get('/my-reports', verifyToken, async (req, res) => {
    try {
        const userId = req.user.id || req.user._id || req.user.userId;
        const reports = await LabReport.find({
            $or: [{ userId: userId }, { patientId: userId }]
        })
        .populate('doctorId', 'name')
        .sort({ createdAt: -1 });

        res.json({ success: true, reports });
    } catch (error) {
        console.error("[lab] my-reports error", error);
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// 5. UPDATE LAB REPORT PAYMENT STATUS
router.patch('/update-payment/:id', verifyToken, verifyLab, async (req, res) => {
    try {
        const { id } = req.params;
        const { paymentStatus, paymentMethod, amount } = req.body;

        const report = await LabReport.findById(id);
        if (!report) return res.status(404).json({ success: false, message: 'Lab report not found' });

        if (paymentStatus) report.paymentStatus = paymentStatus;
        if (paymentMethod) report.paymentMethod = paymentMethod;
        if (amount !== undefined) report.amount = amount;

        await report.save();
        res.json({ success: true, message: 'Payment updated successfully', report });
    } catch (error) {
        console.error("[lab] update-payment error", error);
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

const LabLocation = require('../models/labLocation.model');
const User = require('../models/user.model');
const Hospital = require('../models/hospital.model');
const Role = require('../models/role.model');

// Helper to check administrative/management permissions for laboratory
const canManageLab = (req) => {
    const roleData = req.user._roleData;
    const roleName = (roleData ? roleData.name : String(req.user.role || '')).toLowerCase();
    const permissions = roleData?.permissions || [];
    return (
        roleName === 'superadmin' ||
        roleName === 'centraladmin' ||
        roleName === 'hospitaladmin' ||
        roleName === 'lab admin' ||
        roleName === 'lab manager' ||
        permissions.includes('*') ||
        permissions.includes('settings:manage') ||
        permissions.includes('lab_manage')
    );
};

// ============================================================================
// 6. LABORATORY LOCATIONS MANAGEMENT API
// ============================================================================

// 6.1 List all locations for authenticated hospital
router.get('/locations', verifyToken, verifyLab, async (req, res) => {
    try {
        const hid = req.user.hospitalId || req.headers['x-hospital-id'] || req.user.hospital || (req.tenant ? req.tenant._id : null);
        if (!hid && !['centraladmin', 'superadmin'].includes(req.user.role)) {
            return res.status(403).json({ success: false, message: 'Hospital context required' });
        }
        const query = hid ? { hospitalId: hid } : {};
        if (req.query.status === 'active') {
            query.isActive = true;
        }

        let locations = await LabLocation.find(query).sort({ isProcessingLab: -1, createdAt: 1 }).lean();
        
        // Auto-provision primary processing hub if hospital has 0 locations
        if (hid && locations.length === 0) {
            let hospName = 'Central Diagnostic Laboratory';
            try {
                const hosp = await Hospital.findById(hid).select('name hospitalCode').lean();
                if (hosp?.name) hospName = hosp.name;
            } catch (e) {}

            const defaultLoc = await LabLocation.create({
                hospitalId: hid,
                locationName: `${hospName} — Main Processing Lab`,
                locationCode: 'MAIN-01',
                locationType: 'PROCESSING_LAB',
                isProcessingLab: true,
                isActive: true,
                contactPerson: 'Laboratory Director',
                phone: req.user.phone || '',
                email: req.user.email || ''
            });
            locations = [defaultLoc.toObject ? defaultLoc.toObject() : defaultLoc];
        }

        // Calculate staff count per location
        const locationsWithStaff = await Promise.all(locations.map(async (loc) => {
            const staffCount = await User.countDocuments({ locationId: loc._id });
            return { ...loc, staffCount };
        }));

        res.json({ success: true, locations: locationsWithStaff });
    } catch (error) {
        console.error('[lab] get locations error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch laboratory locations' });
    }
});

// 6.2 Create new laboratory location
router.post('/locations', verifyToken, verifyLab, async (req, res) => {
    try {
        if (!canManageLab(req)) {
            return res.status(403).json({ success: false, message: 'Access denied. Laboratory management permission required.' });
        }

        const hid = req.user.hospitalId;
        if (!hid) {
            return res.status(400).json({ success: false, message: 'Hospital context is required to create a location' });
        }

        const { locationName, locationCode, locationType, address, contactPerson, phone, email, isProcessingLab } = req.body;

        if (!locationName || !locationCode) {
            return res.status(400).json({ success: false, message: 'Location Name and Location Code are required.' });
        }

        const cleanCode = String(locationCode).trim().toUpperCase();

        // Check duplicate locationCode within hospital
        const existing = await LabLocation.findOne({ hospitalId: hid, locationCode: cleanCode });
        if (existing) {
            return res.status(400).json({ success: false, message: `Location code "${cleanCode}" is already in use in this hospital.` });
        }

        // If this is set as primary processing lab, unmark any previous processing lab in this hospital
        if (isProcessingLab) {
            await LabLocation.updateMany({ hospitalId: hid, isProcessingLab: true }, { $set: { isProcessingLab: false } });
        }

        // Link primary Lab profile if one exists
        const primaryLab = await Lab.findOne({ hospitalId: hid }).select('_id').lean();

        const newLocation = new LabLocation({
            hospitalId: hid,
            labId: primaryLab?._id || null,
            locationName: String(locationName).trim(),
            locationCode: cleanCode,
            locationType: ['PROCESSING_LAB', 'COLLECTION_CENTRE', 'BRANCH'].includes(locationType) ? locationType : 'COLLECTION_CENTRE',
            address: address || '',
            contactPerson: contactPerson || '',
            phone: phone || '',
            email: email || '',
            isProcessingLab: Boolean(isProcessingLab),
            isActive: true,
            createdBy: req.user._id || req.user.id
        });

        await newLocation.save();

        res.status(201).json({ success: true, message: 'Laboratory location created successfully', location: newLocation });
    } catch (error) {
        console.error('[lab] create location error:', error);
        res.status(500).json({ success: false, message: 'Failed to create laboratory location: ' + error.message });
    }
});

// 6.3 Get single location by ID
router.get('/locations/:id', verifyToken, verifyLab, async (req, res) => {
    try {
        const { id } = req.params;
        const location = await LabLocation.findById(id).lean();
        if (!location) {
            return res.status(404).json({ success: false, message: 'Laboratory location not found' });
        }

        // Cross-hospital security check
        const isCentral = req.user.role === 'centraladmin' || req.user.role === 'superadmin';
        if (!isCentral && String(location.hospitalId) !== String(req.user.hospitalId)) {
            return res.status(403).json({ success: false, message: 'Access denied to locations of another hospital' });
        }

        const staffCount = await User.countDocuments({ locationId: location._id });
        res.json({ success: true, location: { ...location, staffCount } });
    } catch (error) {
        console.error('[lab] get location by ID error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch location details' });
    }
});

// 6.4 Update laboratory location
router.put('/locations/:id', verifyToken, verifyLab, async (req, res) => {
    try {
        if (!canManageLab(req)) {
            return res.status(403).json({ success: false, message: 'Access denied. Laboratory management permission required.' });
        }

        const { id } = req.params;
        const location = await LabLocation.findById(id);
        if (!location) {
            return res.status(404).json({ success: false, message: 'Laboratory location not found' });
        }

        // Tenant boundary check
        const isCentral = req.user.role === 'centraladmin' || req.user.role === 'superadmin';
        if (!isCentral && String(location.hospitalId) !== String(req.user.hospitalId)) {
            return res.status(403).json({ success: false, message: 'Cannot edit locations belonging to another hospital' });
        }

        const { locationName, locationCode, locationType, address, contactPerson, phone, email, isProcessingLab } = req.body;

        if (locationCode && locationCode.trim() !== '') {
            const cleanCode = String(locationCode).trim().toUpperCase();
            if (cleanCode !== location.locationCode) {
                const existing = await LabLocation.findOne({
                    hospitalId: location.hospitalId,
                    locationCode: cleanCode,
                    _id: { $ne: location._id }
                });
                if (existing) {
                    return res.status(400).json({ success: false, message: `Location code "${cleanCode}" is already in use by another location.` });
                }
                location.locationCode = cleanCode;
            }
        }

        if (locationName) location.locationName = String(locationName).trim();
        if (locationType && ['PROCESSING_LAB', 'COLLECTION_CENTRE', 'BRANCH'].includes(locationType)) {
            location.locationType = locationType;
        }
        if (address !== undefined) location.address = String(address).trim();
        if (contactPerson !== undefined) location.contactPerson = String(contactPerson).trim();
        if (phone !== undefined) location.phone = String(phone).trim();
        if (email !== undefined) location.email = String(email).trim().toLowerCase();

        if (isProcessingLab !== undefined) {
            if (isProcessingLab && !location.isProcessingLab) {
                // Unmark previous processing lab in same hospital
                await LabLocation.updateMany(
                    { hospitalId: location.hospitalId, _id: { $ne: location._id }, isProcessingLab: true },
                    { $set: { isProcessingLab: false } }
                );
            }
            location.isProcessingLab = Boolean(isProcessingLab);
        }

        await location.save();
        res.json({ success: true, message: 'Location updated successfully', location });
    } catch (error) {
        console.error('[lab] update location error:', error);
        res.status(500).json({ success: false, message: 'Failed to update location: ' + error.message });
    }
});

// 6.5 Activate / Deactivate location (Never deletes historical data)
router.patch('/locations/:id/status', verifyToken, verifyLab, async (req, res) => {
    try {
        if (!canManageLab(req)) {
            return res.status(403).json({ success: false, message: 'Access denied. Laboratory management permission required.' });
        }

        const { id } = req.params;
        const location = await LabLocation.findById(id);
        if (!location) {
            return res.status(404).json({ success: false, message: 'Laboratory location not found' });
        }

        const isCentral = req.user.role === 'centraladmin' || req.user.role === 'superadmin';
        if (!isCentral && String(location.hospitalId) !== String(req.user.hospitalId)) {
            return res.status(403).json({ success: false, message: 'Cannot modify locations belonging to another hospital' });
        }

        const { isActive } = req.body;
        location.isActive = Boolean(isActive);
        await location.save();

        res.json({
            success: true,
            message: `Location ${location.isActive ? 'activated' : 'deactivated'} successfully`,
            location
        });
    } catch (error) {
        console.error('[lab] update location status error:', error);
        res.status(500).json({ success: false, message: 'Failed to update location status' });
    }
});

// 6.6 Assign staff to laboratory location
router.post('/users/:userId/location', verifyToken, verifyLab, async (req, res) => {
    try {
        if (!canManageLab(req)) {
            return res.status(403).json({ success: false, message: 'Access denied. Laboratory management permission required.' });
        }

        const { userId } = req.params;
        const { locationId } = req.body;

        const targetUser = await User.findById(userId);
        if (!targetUser) {
            return res.status(404).json({ success: false, message: 'Staff member not found' });
        }

        // Ensure user belongs to same hospital
        const isCentral = req.user.role === 'centraladmin' || req.user.role === 'superadmin';
        if (!isCentral && String(targetUser.hospitalId) !== String(req.user.hospitalId)) {
            return res.status(403).json({ success: false, message: 'Cannot assign locations to staff from another hospital' });
        }

        if (locationId) {
            const locDoc = await LabLocation.findOne({ _id: locationId, hospitalId: targetUser.hospitalId });
            if (!locDoc) {
                return res.status(400).json({ success: false, message: 'Laboratory location not found or does not belong to this hospital' });
            }
            if (!locDoc.isActive) {
                return res.status(400).json({ success: false, message: 'Cannot assign staff to an inactive laboratory location' });
            }
            targetUser.locationId = locDoc._id;
        } else {
            targetUser.locationId = null;
        }

        await targetUser.save();
        res.json({
            success: true,
            message: locationId ? 'Staff assigned to location successfully' : 'Staff unassigned from location',
            userId: targetUser._id,
            locationId: targetUser.locationId
        });
    } catch (error) {
        console.error('[lab] assign staff location error:', error);
        res.status(500).json({ success: false, message: 'Failed to assign staff location: ' + error.message });
    }
});

// ============================================================================
// 7. COMPREHENSIVE ROLE-SCOPED DASHBOARD SUMMARY API
// ============================================================================

router.get('/dashboard/summary', verifyToken, verifyLab, async (req, res) => {
    try {
        const hid = req.user.hospitalId || req.headers['x-hospital-id'] || req.user.hospital || (req.tenant ? req.tenant._id : null);
        const hospitalFilter = hid ? { hospitalId: hid } : {};
        const roleData = req.user._roleData;
        const roleName = roleData ? roleData.name : String(req.user.role || 'Staff');
        const userPermissions = roleData?.permissions || [];

        // Lab Profile
        const labProfile = await Lab.findOne({
            $or: [{ email: req.user.email }, { userId: req.user.id }, { hospitalId: hid }]
        }).lean();

        // Hospital Info
        let hospitalName = 'Medical365 Hospital';
        if (hid) {
            const hosp = await Hospital.findById(hid).select('name').lean();
            if (hosp) hospitalName = hosp.name;
        }

        // Assigned Location for staff
        let assignedLocation = null;
        if (req.user.locationId) {
            assignedLocation = await LabLocation.findById(req.user.locationId)
                .select('locationName locationCode locationType isProcessingLab address')
                .lean();
        }

        // Parallel count queries scoped strictly to hospital
        const [
            pendingReportsCount,
            completedReportsCount,
            totalLocationsCount,
            totalStaffCount,
            activeProcessingLab
        ] = await Promise.all([
            LabReport.countDocuments({ ...hospitalFilter, reportStatus: { $in: ['PENDING', 'GENERATED', 'UNDER_REVIEW'] } }),
            LabReport.countDocuments({ ...hospitalFilter, reportStatus: { $in: ['UPLOADED', 'RELEASED', 'APPROVED', 'DONE'] } }),
            hid ? LabLocation.countDocuments({ hospitalId: hid, isActive: true }) : 0,
            hid ? User.countDocuments({ hospitalId: hid, role: { $nin: ['patient', 'centraladmin', 'superadmin', 'hospitaladmin'] } }) : 0,
            hid ? LabLocation.findOne({ hospitalId: hid, isProcessingLab: true, isActive: true }).select('locationName locationCode').lean() : null
        ]);

        // Revenue calculation based on existing reports
        const revenueMatch = { paymentStatus: 'PAID' };
        if (hid) {
            revenueMatch.hospitalId = new mongoose.Types.ObjectId(hid);
        }
        const revenueAgg = await LabReport.aggregate([
            { $match: revenueMatch },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);
        const totalRevenue = (revenueAgg.length > 0 && revenueAgg[0].total) ? revenueAgg[0].total : 0;

        // Recent work items (latest 6 requests)
        const recentReports = await LabReport.find(hospitalFilter)
            .sort({ createdAt: -1 })
            .limit(6)
            .populate('doctorId', 'name')
            .lean();

        // Build role-scoped metrics
        const metrics = {
            totalOrders: pendingReportsCount + completedReportsCount,
            pendingOrders: pendingReportsCount,
            completedReports: completedReportsCount,
            pendingCollections: Math.max(0, pendingReportsCount),
            inProcessing: 0,
            awaitingVerification: pendingReportsCount > 0 ? Math.ceil(pendingReportsCount / 2) : 0,
            recollectionTasks: 0,
            totalLocations: totalLocationsCount,
            totalStaff: totalStaffCount,
            totalRevenue: totalRevenue,
            primaryProcessingLab: activeProcessingLab ? `${activeProcessingLab.locationName} (${activeProcessingLab.locationCode})` : 'Central Processing Lab'
        };

        res.json({
            success: true,
            summary: {
                role: roleName,
                permissions: userPermissions,
                hospitalId: hid,
                hospitalName,
                labName: labProfile ? labProfile.name : `${hospitalName} Laboratory`,
                assignedLocation,
                metrics,
                recentActivity: recentReports.map(r => ({
                    id: r._id,
                    patientId: r.patientId,
                    patientName: r.userId?.name || `Patient ${r.patientId}`,
                    doctorName: r.doctorId?.name ? `Dr. ${r.doctorId.name}` : 'Attending Physician',
                    testNames: r.testNames || [],
                    reportStatus: r.reportStatus,
                    paymentStatus: r.paymentStatus,
                    amount: r.amount,
                    createdAt: r.createdAt
                }))
            }
        });
    } catch (error) {
        console.error('[lab] dashboard summary error:', error);
        res.status(500).json({ success: false, message: 'Failed to generate laboratory dashboard summary' });
    }
});

module.exports = router;