const express = require('express');
const router = express.Router();
const multer = require('multer');
const { verifyToken } = require('../middleware/auth.middleware');
const imagekit = require('../utils/imagekit');
const Report = require('../models/report.model');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');

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

    // Extract text using Gemini OCR
    let extractedText = "";
    try {
      if (process.env.GEMINI_API_KEY) {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro-latest" });
        const prompt = "Extract all text from this medical report. Return ONLY the raw text word for word. Do not summarize or format. If the image is not a document or contains no text, return an empty string.";
        const imageParts = [{
          inlineData: {
            data: file.buffer.toString('base64'),
            mimeType: file.mimetype || 'application/pdf'
          }
        }];
        const aiResult = await model.generateContent([prompt, ...imageParts]);
        extractedText = aiResult.response.text().trim();
      }
    } catch (ocrErr) {
      console.error('[OCR Extraction Error]:', ocrErr.message);
    }

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
            appointmentId: appt._id,
            extractedText: extractedText
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

// Route: POST /api/reports/summary
router.post('/summary', verifyToken, async (req, res) => {
  try {
    const { fileUrl, mimeType } = req.body;
    
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

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ success: false, message: "GEMINI_API_KEY not configured on server." });
    }

    // 1. Download file
    const response = await axios.get(fileUrl, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(response.data, 'binary');
    const base64Data = buffer.toString('base64');
    
    // 2. Initialize Gemini AI
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });

    // 3. Define prompt
    const prompt = `You are a medical AI assistant. Analyze the provided medical report and return ONLY a valid JSON string with the following structure (no markdown, no other text):
{
  "ReportType": "Identified report type (e.g. Complete Blood Count, X-Ray, Unknown)",
  "OverallSummary": "Short overall summary (4-8 lines) of the report's main findings. NO diagnosis or treatment advice.",
  "ImportantFindings": ["Finding 1", "Finding 2"],
  "AbnormalValues": ["Parameter: Value", "Parameter: Value"]
}
Only include AbnormalValues if there are any, otherwise an empty array.
ImportantFindings should just be bullet points as an array of strings.`;

    const imageParts = [
      {
        inlineData: {
          data: base64Data,
          mimeType: mimeType || 'application/pdf'
        }
      }
    ];

    const aiResult = await model.generateContent([prompt, ...imageParts]);
    const responseText = aiResult.response.text();
    
    // Attempt to parse JSON. Gemini might wrap in \`\`\`json \`\`\`
    let cleanedText = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
    let summaryJson;
    try {
      summaryJson = JSON.parse(cleanedText);
    } catch (e) {
      console.error("AI returned invalid JSON:", responseText);
      return res.status(500).json({ success: false, message: "Failed to parse AI response." });
    }

    res.status(200).json({
      success: true,
      summary: summaryJson
    });

  } catch (error) {
    console.error('[Generate Summary Route] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to generate AI summary."
    });
  }
});

// Route: POST /api/reports/compare
router.post('/compare', verifyToken, async (req, res) => {
  try {
    const { latestFileUrl, latestMimeType, previousFileUrl, previousMimeType } = req.body;
    
    if (!latestFileUrl || !previousFileUrl) {
      return res.status(400).json({ success: false, message: "Both latest and previous report files are required." });
    }
    
    let isDoctor = false;
    if (req.user && req.user.role) {
      const roleStr = (req.user._roleData?.name || req.user.role).toString().toLowerCase();
      if (roleStr.includes('doctor')) isDoctor = true;
    }
    
    if (!isDoctor) {
      return res.status(403).json({ success: false, message: "Only doctors can compare reports." });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ success: false, message: "GEMINI_API_KEY not configured." });
    }

    const latestResponse = await axios.get(latestFileUrl, { responseType: 'arraybuffer' });
    const prevResponse = await axios.get(previousFileUrl, { responseType: 'arraybuffer' });

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro-latest" });

    const prompt = `You are a medical AI assistant. Compare the latest medical report with the previous medical report.
Keep it strictly factual based on the data. Do NOT generate any diagnosis, treatment suggestions, prescriptions, or medical advice.
Return ONLY a valid JSON string with the following structure (no markdown, no other text):
{
  "NewFindings": ["Finding 1", "Finding 2"],
  "RemovedFindings": ["Finding 1", "Finding 2"],
  "ChangedFindings": ["Parameter 1: Old Value -> New Value"],
  "OverallChange": "Short factual statement summarizing the difference."
}
If a section is empty, return an empty array. Do not invent details.`;

    const imageParts = [
      {
        inlineData: {
          data: Buffer.from(latestResponse.data, 'binary').toString('base64'),
          mimeType: latestMimeType || 'application/pdf'
        }
      },
      {
        inlineData: {
          data: Buffer.from(prevResponse.data, 'binary').toString('base64'),
          mimeType: previousMimeType || 'application/pdf'
        }
      }
    ];

    const aiResult = await model.generateContent([prompt, ...imageParts]);
    const responseText = aiResult.response.text();
    
    let cleanedText = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
    let comparisonJson;
    try {
      comparisonJson = JSON.parse(cleanedText);
    } catch (e) {
      console.error("AI returned invalid JSON:", responseText);
      return res.status(500).json({ success: false, message: "Failed to parse AI response." });
    }

    res.status(200).json({
      success: true,
      comparison: comparisonJson
    });

  } catch (error) {
    console.error('[Compare Reports Route] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to compare reports."
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
      // Search running against extractedText field in the database
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

module.exports = router;
