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
    if (req.user.role !== 'lab' && req.user.role !== 'admin' && req.user.role !== 'administrator') {
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

        if (!labProfile) return res.status(404).json({ message: 'Lab profile not found.' });

        const pending = await LabReport.countDocuments({ labId: labProfile._id, status: 'pending' });
        const completed = await LabReport.countDocuments({ labId: labProfile._id, status: 'completed' });

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

        if (!labProfile) return res.json({ success: true, requests: [] });

        let query = { labId: labProfile._id };
        if (status && status !== 'all') {
            query.status = status;
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
        report.status = 'completed';
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

        res.json({ success: true, message: 'Report uploaded successfully', report });

    } catch (error) {
        console.error("Upload Error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;