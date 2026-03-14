const express = require('express');
const router = express.Router();
const multer = require('multer');
const LabReport = require('../models/labReport.model');
const Appointment = require('../models/appointment.model');
const Lab = require('../models/lab.model');
const { verifyToken } = require('../middleware/auth.middleware');
const imagekit = require('../utils/imagekit');

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

// MIDDLEWARE: Verify User is a Lab
const verifyLab = async (req, res, next) => {
    const roleName = req.user._roleData ? req.user._roleData.name.toLowerCase() : String(req.user.role).toLowerCase();

    if (!roleName.includes('lab') && !roleName.includes('admin')) {
        return res.status(403).json({ message: 'Access denied. Lab personnel only.' });
    }
    next();
};

// 1. GET LAB DASHBOARD STATS
router.get('/stats', verifyToken, verifyLab, async (req, res) => {
    try {
        // Find the Lab Profile associated with this user
        // Assuming Lab User has the same email as Lab Profile or linked userId
        const labProfile = await Lab.findOne({
            $or: [{ email: req.user.email }, { userId: req.user.id }]
        });

        if (!labProfile) {
            // Give them access to unassigned lab tests if no lab profile is found
            const pending = await LabReport.countDocuments({ $or: [{ labId: null }, { labId: { $exists: false } }], reportStatus: 'PENDING' });
            const completed = await LabReport.countDocuments({ $or: [{ labId: null }, { labId: { $exists: false } }], reportStatus: 'UPLOADED' });
            return res.json({
                success: true,
                stats: { pending, completed, revenue: completed * 500, labName: 'Global Lab' }
            });
        }

        const pending = await LabReport.countDocuments({ $or: [{ labId: labProfile._id }, { labId: null }, { labId: { $exists: false } }], reportStatus: 'PENDING' });
        const completed = await LabReport.countDocuments({ $or: [{ labId: labProfile._id }, { labId: null }, { labId: { $exists: false } }], reportStatus: 'UPLOADED' });

        // Revenue calculation (optional, if you track payments)
        const revenue = completed * 500; // Example: 500 per test

        res.json({
            success: true,
            stats: { pending, completed, revenue, labName: labProfile.name }
        });
    } catch (error) {
        console.error("Lab Stats Error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// 2. GET ASSIGNED REQUESTS (Pending or All)
router.get('/requests', verifyToken, verifyLab, async (req, res) => {
    try {
        const { status } = req.query;
        const labProfile = await Lab.findOne({
            $or: [{ email: req.user.email }, { userId: req.user.id }]
        });

        let query = {};
        if (labProfile) {
            query.$or = [{ labId: labProfile._id }, { labId: null }, { labId: { $exists: false } }];
        } else {
            query.$or = [{ labId: null }, { labId: { $exists: false } }];
        }

        if (status && status !== 'all') {
            query.reportStatus = status.toUpperCase() === 'PENDING' ? 'PENDING' : 'UPLOADED';
        }

        const requests = await LabReport.find(query)
            .populate('userId', 'name email phone patientId') // Patient Details
            .populate('doctorId', 'name') // Doctor Name
            .sort({ createdAt: -1 });

        res.json({ success: true, requests });
    } catch (error) {
        console.error("Fetch Requests Error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// 3. UPLOAD TEST REPORT
router.post('/upload-report/:reportId', verifyToken, verifyLab, upload.single('reportFile'), async (req, res) => {
    try {
        const { reportId } = req.params;
        const { notes } = req.body;

        if (!req.file) return res.status(400).json({ message: 'No file uploaded.' });

        const report = await LabReport.findById(reportId);
        if (!report) return res.status(404).json({ message: 'Report request not found.' });

        // Upload to ImageKit
        const fileResult = await imagekit.upload({
            file: req.file.buffer,
            fileName: `lab_report_${report.patientId}_${Date.now()}`,
            folder: '/crm/lab_reports'
        });

        // Update Lab Report Status
        report.reportUrl = fileResult.url;
        report.fileId = fileResult.fileId;
        report.testStatus = 'DONE';
        report.reportStatus = 'UPLOADED';
        report.notes = notes || report.notes;
        report.uploadedAt = new Date();
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
        console.error("Upload Error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;