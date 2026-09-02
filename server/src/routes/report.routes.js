const express = require('express');
const router = express.Router();
const multer = require('multer');
const { verifyToken } = require('../middleware/auth.middleware');
const imagekit = require('../utils/imagekit');
const Report = require('../models/report.model');
const AIUsageLog = require('../models/aiUsageLog.model');
const aiService = require('../services/ai/ai.service');
const aiWalletService = require('../services/ai/aiWallet.service');
const { validateMedia } = require('../services/ai/mediaValidator');
const axios = require('axios');

// Configure Multer for memory storage (Required for ImageKit)
const SUPPORTED_UPLOAD_TYPES = [
  'image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'
];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024, // 20MB limit
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

    const Appointment = require('../models/appointment.model');
    const appt = await Appointment.findById(appointmentId);

    const userContext = {
      userId: req.user?._id,
      userName: req.user?.name || req.user?.username || 'Doctor/Staff',
      userRole: uploaderRole.toLowerCase(),
      hospitalId: (appt && appt.hospitalId) ? appt.hospitalId : (req.user ? req.user.hospitalId : undefined),
      patientId: appt ? appt.userId : null
    };

    const result = await imagekit.upload({
      file: file.buffer,
      fileName: `report_${appointmentId}_${Date.now()}_${file.originalname}`,
      folder: "/appointment-reports",
      tags: ['appointment_report', file.mimetype]
    });

    // Extract text using Gemini OCR only if hospital has active budget
    let extractedText = "";
    if (userContext.hospitalId) {
      const balanceCheck = await aiWalletService.checkBalance(userContext.hospitalId);
      if (balanceCheck.allowed) {
        try {
          extractedText = await aiService.extractReportText(file.buffer.toString('base64'), file.mimetype || 'application/pdf', userContext);
        } catch (ocrErr) {
          console.error('[OCR Extraction Error]:', ocrErr.message);
        }
      } else {
        console.warn(`[Report Upload OCR] AI Credits exhausted for hospital ${userContext.hospitalId}. Skipping auto-OCR.`);
      }
    }

    const newReport = new Report({
      appointmentId: appointmentId,
      fileName: file.originalname,
      url: result.url,
      fileId: result.fileId,
      mimeType: file.mimetype,
      size: result.size,
      uploadedByRole: uploaderRole,
      hospitalId: userContext.hospitalId,
      uploadedAt: new Date(),
      extractedText: extractedText
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

        if (!userDoc && (appt.patientName || appt.patientPhone)) {
          userDoc = await User.findOne({
            $or: [
              { phone: appt.patientPhone },
              { name: appt.patientName }
            ]
          });
        }

        if (userDoc) {
          if (!userDoc.fertilityProfile) userDoc.fertilityProfile = {};
          if (!Array.isArray(userDoc.fertilityProfile.reports)) {
            userDoc.fertilityProfile.reports = [];
          }
          userDoc.fertilityProfile.reports.push({
            url: result.url,
            fileId: result.fileId,
            name: file.originalname,
            date: new Date(),
            mimeType: file.mimetype,
            extractedText: extractedText
          });
          userDoc.markModified('fertilityProfile');
          await userDoc.save();
        }
      }
    } catch (syncErr) {
      console.error('[Report Profile Auto-Sync Warning]:', syncErr.message);
    }

    res.status(201).json({
      success: true,
      message: "Report uploaded successfully!",
      report: newReport
    });

  } catch (error) {
    console.error('[Upload Report Route] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || "Internal server error while uploading report."
    });
  }
});

// Route: GET /api/reports/appointment/:appointmentId & /api/reports/:appointmentId
const getReportsByAppointmentHandler = async (req, res) => {
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
};

router.get('/appointment/:appointmentId', verifyToken, getReportsByAppointmentHandler);
router.get('/:appointmentId', verifyToken, getReportsByAppointmentHandler);

// Route: POST /api/reports/summary
router.post('/summary', verifyToken, async (req, res) => {
  try {
    const { fileUrl, mimeType, fileName } = req.body;
    
    if (!fileUrl) {
      return res.status(400).json({ success: false, message: "fileUrl is required." });
    }
    
    // Only allow access if Doctor
    let isDoctor = false;
    if (req.user && req.user.role) {
      const roleStr = (req.user._roleData?.name || req.user.role).toString().toLowerCase();
      if (roleStr.includes('doctor')) {
        isDoctor = true;
      }
    }
    
    if (!isDoctor) {
      return res.status(403).json({ success: false, message: "Only doctors can generate AI summaries." });
    }

    const hospitalId = req.user?.hospitalId;
    if (!hospitalId) {
      return res.status(400).json({ success: false, message: "No hospital associated with this user session." });
    }

    // 1. PRE-CHECK AI WALLET BUDGET BEFORE CALLING GEMINI
    const balanceCheck = await aiWalletService.checkBalance(hospitalId);
    if (!balanceCheck.allowed) {
      return res.status(402).json({
        success: false,
        code: 'INSUFFICIENT_AI_CREDITS',
        message: balanceCheck.message || "AI Credits Exhausted. Your hospital has used its available AI budget. Please contact your administrator to continue using the AI Assistant.",
        wallet: balanceCheck.wallet
      });
    }

    const userContext = {
      userId: req.user?._id,
      userName: req.user?.name || req.user?.username || 'Doctor',
      userRole: 'doctor',
      hospitalId: hospitalId
    };

    // 2. Download file
    const response = await axios.get(fileUrl, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(response.data, 'binary');

    // 3. Validate media
    const validation = validateMedia(buffer, mimeType, fileName);
    if (!validation.valid) {
      return res.status(400).json({ success: false, message: validation.error, code: validation.code });
    }

    const base64Data = buffer.toString('base64');
    
    // 4. Generate AI Summary with content-aware prompt routing and atomic wallet deduction
    const { summary, usage } = await aiService.generateReportSummary(base64Data, validation.mimeType, userContext, fileName || '');

    res.status(200).json({
      success: true,
      summary,
      usage,
      wallet: usage.wallet || null
    });

  } catch (error) {
    console.error('[Generate Summary Route] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to generate AI summary."
    });
  }
});

// Route: POST /api/reports/analyze — General media analysis with optional question
router.post('/analyze', verifyToken, async (req, res) => {
  try {
    const { fileUrl, mimeType, question, fileName } = req.body;

    if (!fileUrl) {
      return res.status(400).json({ success: false, message: "fileUrl is required." });
    }

    // Only allow access if Doctor
    let isDoctor = false;
    if (req.user && req.user.role) {
      const roleStr = (req.user._roleData?.name || req.user.role).toString().toLowerCase();
      if (roleStr.includes('doctor')) isDoctor = true;
    }
    if (!isDoctor) {
      return res.status(403).json({ success: false, message: "Only doctors can use AI analysis." });
    }

    const hospitalId = req.user?.hospitalId;
    if (!hospitalId) {
      return res.status(400).json({ success: false, message: "No hospital associated with this user session." });
    }

    // 1. PRE-CHECK AI WALLET BUDGET
    const balanceCheck = await aiWalletService.checkBalance(hospitalId);
    if (!balanceCheck.allowed) {
      return res.status(402).json({
        success: false,
        code: 'INSUFFICIENT_AI_CREDITS',
        message: balanceCheck.message || "AI Credits Exhausted. Your hospital has used its available AI budget. Please contact your administrator to continue using the AI Assistant.",
        wallet: balanceCheck.wallet
      });
    }

    const userContext = {
      userId: req.user?._id,
      userName: req.user?.name || req.user?.username || 'Doctor',
      userRole: 'doctor',
      hospitalId: hospitalId
    };

    // 2. Download file
    const response = await axios.get(fileUrl, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(response.data, 'binary');

    // 3. Validate
    const validation = validateMedia(buffer, mimeType, fileName);
    if (!validation.valid) {
      return res.status(400).json({ success: false, message: validation.error, code: validation.code });
    }

    const base64Data = buffer.toString('base64');

    // 4. Analyze with optional question
    const { analysis, usage } = await aiService.analyzeMedia(base64Data, validation.mimeType, userContext, question || '', fileName || '');

    res.status(200).json({
      success: true,
      analysis,
      usage,
      wallet: usage.wallet || null
    });

  } catch (error) {
    console.error('[Analyze Media Route] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to analyze media."
    });
  }
});

// Route: POST /api/reports/compare
router.post('/compare', verifyToken, async (req, res) => {
  const requestId = `cmp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  try {
    const { 
      latestFileUrl, 
      latestMimeType = 'application/pdf', 
      previousFileUrl, 
      previousMimeType = 'application/pdf',
      url1,
      url2,
      mime1,
      mime2,
      patientId 
    } = req.body;
    
    const targetLatestUrl = latestFileUrl || url1;
    const targetPrevUrl = previousFileUrl || url2;
    const targetLatestMime = latestMimeType || mime1 || 'application/pdf';
    const targetPrevMime = previousMimeType || mime2 || 'application/pdf';

    if (!targetLatestUrl || !targetPrevUrl) {
      return res.status(400).json({ success: false, message: "Both latest and previous report file URLs are required." });
    }
    
    let isDoctor = false;
    if (req.user && req.user.role) {
      const roleStr = (req.user._roleData?.name || req.user.role).toString().toLowerCase();
      if (roleStr.includes('doctor') || roleStr.includes('admin')) isDoctor = true;
    }
    
    if (!isDoctor) {
      return res.status(403).json({ success: false, message: "Only medical staff / doctors can compare reports." });
    }

    const hospitalId = req.user?.hospitalId;
    if (!hospitalId) {
      return res.status(400).json({ success: false, message: "No hospital associated with this user session." });
    }

    // 1. Security check: If patientId provided, verify patient belongs to hospital
    if (patientId) {
      const User = require('../models/user.model');
      const mongoose = require('mongoose');
      const isObjectId = mongoose.Types.ObjectId.isValid(patientId) && String(patientId).length === 24;
      const userQuery = isObjectId ? { _id: patientId } : { $or: [{ patientId }, { mrn: patientId }] };
      const patient = await User.findOne(userQuery).select('hospitalId').lean();
      
      if (patient && patient.hospitalId && String(patient.hospitalId) !== String(hospitalId)) {
        return res.status(403).json({ success: false, message: "Access denied. Patient belongs to another hospital." });
      }
    }

    // 2. PRE-CHECK AI WALLET BUDGET
    const balanceCheck = await aiWalletService.checkBalance(hospitalId);
    if (!balanceCheck.allowed) {
      return res.status(402).json({
        success: false,
        code: 'INSUFFICIENT_AI_CREDITS',
        message: balanceCheck.message || "AI Credits Exhausted. Your hospital has used its available AI budget. Please contact your administrator to continue using the AI Assistant.",
        wallet: balanceCheck.wallet
      });
    }

    const userContext = {
      userId: req.user?._id,
      userName: req.user?.name || req.user?.username || 'Doctor',
      userRole: 'doctor',
      hospitalId: hospitalId,
      patientId: patientId || null
    };

    // 3. Fetch report data
    const [latestResponse, prevResponse] = await Promise.all([
      axios.get(targetLatestUrl, { responseType: 'arraybuffer', timeout: 20000 }),
      axios.get(targetPrevUrl, { responseType: 'arraybuffer', timeout: 20000 })
    ]);

    const latestBase64 = Buffer.from(latestResponse.data, 'binary').toString('base64');
    const prevBase64 = Buffer.from(prevResponse.data, 'binary').toString('base64');

    // 4. Execute comparison using centralized Gemini model
    const { comparison, usage } = await aiService.compareReports(
      latestBase64, 
      targetLatestMime, 
      prevBase64, 
      targetPrevMime, 
      userContext
    );

    res.status(200).json({
      success: true,
      comparison,
      usage,
      wallet: usage?.wallet || null
    });

  } catch (error) {
    console.error(`[Compare Reports Error] reqId: ${requestId} | hosp: ${req.user?.hospitalId} | user: ${req.user?._id} |`, error.message);
    res.status(500).json({
      success: false,
      message: "Unable to compare these reports right now. Please try again.",
      requestId
    });
  }
});

// Route: POST /api/reports/search
router.post('/search', verifyToken, async (req, res) => {
  try {
    const { patientId, keyword } = req.body;
    if (!patientId || !keyword) {
      return res.status(400).json({ success: false, message: "patientId and keyword are required." });
    }

    const User = require('../models/user.model');
    const mongoose = require('mongoose');
    const isObjectId = mongoose.Types.ObjectId.isValid(patientId) && String(patientId).length === 24;
    const userQuery = isObjectId ? { _id: patientId } : { $or: [{ patientId: patientId }, { mrn: patientId }] };
    
    const user = await User.findOne(userQuery).lean();
    if (!user) {
      return res.status(404).json({ success: false, message: "Patient not found." });
    }

    const fp = user.fertilityProfile || {};
    const baseDocs = Array.isArray(fp.documents) ? fp.documents : [];
    const prevReports = Array.isArray(fp.previousReports) ? fp.previousReports : [];
    const doctorReports = Array.isArray(fp.reports) ? fp.reports : [];
    
    // Deduplicate reports by URL or fileId
    const allReportsMap = new Map();
    [...baseDocs, ...prevReports, ...doctorReports].forEach(report => {
      const key = report.url || report.fileId || report._id;
      if (key && !allReportsMap.has(key)) {
        allReportsMap.set(key, report);
      }
    });
    const allReports = Array.from(allReportsMap.values());

    const results = [];
    let hasNoTextCount = 0;

    for (const report of allReports) {
      const reportName = report.fileName || report.name || 'Medical Report';
      const extractedText = report.extractedText || report.textContent || "";

      if (!extractedText || extractedText.trim() === '') {
        hasNoTextCount++;
        continue;
      }

      if (extractedText.toLowerCase().includes(keyword.toLowerCase())) {
        const lines = extractedText.split('\n');
        let matchingLine = lines.find(line => line.toLowerCase().includes(keyword.toLowerCase()));
        if (matchingLine && matchingLine.length > 100) {
          const idx = matchingLine.toLowerCase().indexOf(keyword.toLowerCase());
          const start = Math.max(0, idx - 40);
          const end = Math.min(matchingLine.length, idx + keyword.length + 40);
          matchingLine = '...' + matchingLine.substring(start, end) + '...';
        }
        
        results.push({
          reportId: report._id || report.fileId || report.url,
          reportName: reportName,
          pageNumber: report.pageNumber || 1,
          match: matchingLine || "Matching context hidden.",
          keyword: keyword
        });
      }
    }

    if (allReports.length > 0 && hasNoTextCount === allReports.length) {
      return res.status(200).json({
        success: false,
        message: "No extracted text available for this report."
      });
    }

    res.status(200).json({
      success: true,
      results
    });

  } catch (error) {
    console.error('[Search Reports Route] Error:', error);
    res.status(500).json({
      success: false,
      message: "Failed to search reports."
    });
  }
});

// Route: POST /api/reports/chat — supports optional media attachments
router.post('/chat', verifyToken, async (req, res) => {
  try {
    const { messages, mediaUrls } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ success: false, message: "messages array is required." });
    }
    
    const hospitalId = req.user?.hospitalId;
    if (!hospitalId) {
      return res.status(400).json({ success: false, message: "No hospital associated with this user session." });
    }

    // 1. PRE-CHECK AI WALLET BUDGET BEFORE CALLING GEMINI
    const balanceCheck = await aiWalletService.checkBalance(hospitalId);
    if (!balanceCheck.allowed) {
      return res.status(402).json({
        success: false,
        code: 'INSUFFICIENT_AI_CREDITS',
        message: balanceCheck.message || "AI Credits Exhausted. Your hospital has used its available AI budget. Please contact your administrator to continue using the AI Assistant.",
        wallet: balanceCheck.wallet
      });
    }

    const userContext = {
      userId: req.user?._id,
      userName: req.user?.name || req.user?.username || 'Doctor',
      userRole: 'doctor',
      hospitalId: hospitalId
    };

    // If media attachments are provided, download them and use chatWithMedia
    if (mediaUrls && Array.isArray(mediaUrls) && mediaUrls.length > 0) {
      const mediaInputs = [];
      for (const media of mediaUrls.slice(0, 5)) { // Max 5 attachments
        try {
          const mediaResponse = await axios.get(media.url, { responseType: 'arraybuffer' });
          const mediaBuffer = Buffer.from(mediaResponse.data, 'binary');
          const validation = validateMedia(mediaBuffer, media.mimeType);
          if (validation.valid) {
            mediaInputs.push({
              data: mediaBuffer.toString('base64'),
              mimeType: validation.mimeType
            });
          }
        } catch (dlErr) {
          console.warn('[Chat Media Download Warning]:', dlErr.message);
        }
      }

      if (mediaInputs.length > 0) {
        const { reply, usage } = await aiService.chatWithMedia(messages, mediaInputs, userContext);
        return res.status(200).json({ success: true, reply, usage, wallet: usage.wallet || null });
      }
    }

    // Fall back to text-only chat
    const { reply, usage } = await aiService.chatWithAssistant(messages, userContext);
    
    res.status(200).json({
      success: true,
      reply,
      usage,
      wallet: usage.wallet || null
    });
  } catch (error) {
    console.error('[AI Chat Route] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to get AI response."
    });
  }
});

// Route: GET /api/reports/ai-usage/stats (Backward Compatibility bridge -> AIWalletService)
router.get('/ai-usage/stats', verifyToken, async (req, res) => {
  try {
    const hospitalId = req.user?.hospitalId;
    if (!hospitalId) {
      return res.status(200).json({ success: true, stats: { totalRequests: 0, totalTokens: 0, totalCostInr: 0, totalCostUsd: 0, budgetAmount: 2000, remainingAmount: 2000 } });
    }

    const walletStats = await aiWalletService.getWalletStats(hospitalId);

    res.status(200).json({
      success: true,
      stats: {
        totalRequests: walletStats.totalRequests || 0,
        totalCostInr: walletStats.usedAmount || 0,
        totalCostUsd: walletStats.today.costUsd || 0,
        totalTokens: walletStats.today.tokens || 0,
        budgetAmount: walletStats.budgetAmount || 2000,
        remainingAmount: walletStats.remainingAmount || 0,
        warningLevel: walletStats.warningLevel || 'normal',
        todayRequests: walletStats.today.requests || 0,
        todayTokens: walletStats.today.tokens || 0,
        todayCostInr: walletStats.today.costInr || 0,
        todayCostUsd: walletStats.today.costUsd || 0,
        actionBreakdown: walletStats.breakdown.map(a => ({
          actionType: a.operation,
          count: a.count,
          tokens: a.tokens,
          costUsd: Number(((a.costInr || 0) / 86.5).toFixed(5))
        }))
      },
      wallet: walletStats
    });
  } catch (error) {
    console.error('[AI Usage Stats Route] Error:', error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch AI usage stats."
    });
  }
});

// Route: GET /api/reports/ai-usage/history (Backward Compatibility bridge -> AIWalletService)
router.get('/ai-usage/history', verifyToken, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 30;
    const hospitalId = req.user?.hospitalId;
    if (!hospitalId) {
      return res.status(200).json({ success: true, logs: [] });
    }

    const logs = await aiWalletService.getUsageHistory(hospitalId, limit);

    res.status(200).json({
      success: true,
      logs
    });
  } catch (error) {
    console.error('[AI Usage History Route] Error:', error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch AI usage history."
    });
  }
});

module.exports = router;
