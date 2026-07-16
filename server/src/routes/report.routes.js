const express = require('express');
const router = express.Router();
const multer = require('multer');
const { verifyToken } = require('../middleware/auth.middleware');
const imagekit = require('../utils/imagekit');
const Report = require('../models/report.model');

// Configure Multer for memory storage (Required for ImageKit)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only images and PDFs are allowed for reports!'), false);
    }
  }
});

// Route: POST /api/reports/upload
router.post('/upload', verifyToken, upload.single('reportFile'), async (req, res) => {
  try {
    const file = req.file;
    const { appointmentId } = req.body;

    if (!appointmentId) {
      return res.status(400).json({ success: false, message: "appointmentId is required in the request body." });
    }

    if (!file) {
      return res.status(400).json({ success: false, message: "No report file uploaded." });
    }

    // Determine uploader role based on user context
    let uploaderRole = 'Other';
    if (req.user && req.user.role) {
      const roleStr = (req.user._roleData?.name || req.user.role).toString().toLowerCase();
      if (roleStr.includes('doctor')) {
        uploaderRole = 'Doctor';
      } else if (roleStr.includes('reception')) {
        uploaderRole = 'Receptionist';
      } else if (roleStr.includes('admin')) {
        uploaderRole = 'Admin';
      }
    }

    const result = await imagekit.upload({
      file: file.buffer,
      fileName: `report_${appointmentId}_${Date.now()}_${file.originalname}`,
      folder: "/appointment-reports",
      tags: ['appointment_report', file.mimetype]
    });

    const Appointment = require('../models/appointment.model');
    const appt = await Appointment.findById(appointmentId);

    const newReport = new Report({
      appointmentId: appointmentId,
      fileName: file.originalname,
      url: result.url,
      fileId: result.fileId,
      mimeType: file.mimetype,
      size: result.size,
      uploadedByRole: uploaderRole,
      hospitalId: (appt && appt.hospitalId) ? appt.hospitalId : (req.user ? req.user.hospitalId : undefined),
      uploadedAt: new Date()
    });

    await newReport.save();

    // Auto-sync to Patient User profile and Appointment prescriptions
    try {
      if (appt) {
        if (!Array.isArray(appt.prescriptions)) appt.prescriptions = [];
        appt.prescriptions.push({
          type: 'lab_report',
          name: file.originalname || 'Medical Report',
          url: result.url,
          fileId: result.fileId,
          uploadedAt: new Date()
        });
        await appt.save();

        const User = require('../models/user.model');
        let userDoc = null;
        if (appt.userId) userDoc = await User.findById(appt.userId);
        if (!userDoc && appt.patientId) {
          const query = { patientId: appt.patientId };
          if (appt.hospitalId) query.hospitalId = appt.hospitalId;
          userDoc = await User.findOne(query) || await User.findOne({ patientId: appt.patientId });
        }
        if (userDoc) {
          if (!userDoc.fertilityProfile) userDoc.fertilityProfile = {};
          if (!Array.isArray(userDoc.fertilityProfile.documents)) userDoc.fertilityProfile.documents = [];
          userDoc.fertilityProfile.documents.push({
            fileName: file.originalname,
            docType: 'Medical Report',
            url: result.url,
            fileId: result.fileId,
            mimeType: file.mimetype,
            uploadedAt: new Date(),
            uploadedBy: uploaderRole,
            department: appt.department || appt.serviceName || 'General',
            appointmentId: appt._id
          });
          userDoc.markModified('fertilityProfile');
          await userDoc.save();
        }
      }
    } catch (syncErr) {
      console.error('[Report Sync Error]:', syncErr.message);
    }

    res.status(201).json({
      success: true,
      message: "Report uploaded successfully",
      report: newReport,
    });

  } catch (error) {
    console.error('[Report Upload Route] Error:', error);
    res.status(500).json({
        success: false,
        message: "Failed to upload report.",
    });
  }
});

// Route: GET /api/reports/:appointmentId
router.get('/:appointmentId', verifyToken, async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const reports = await Report.find({ appointmentId }).sort({ uploadedAt: -1 });

    res.status(200).json({
      success: true,
      reports
    });
  } catch (error) {
    console.error('[Get Reports Route] Error:', error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch reports."
    });
  }
});

module.exports = router;
