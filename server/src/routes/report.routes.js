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
const fs = require('fs');
const path = require('path');

const dns = require('dns');
const net = require('net');

/**
 * Check if an IP address belongs to loopback, private, link-local, or cloud metadata ranges (SSRF Prevention)
 */
function isPrivateOrReservedIP(ip) {
  if (!ip || !net.isIP(ip)) return true;
  // Normalize IPv4-mapped IPv6
  if (ip.startsWith('::ffff:')) {
    ip = ip.substring(7);
  }
  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map(Number);
    // 0.0.0.0/8 (Current network)
    if (parts[0] === 0) return true;
    // 10.0.0.0/8 (Private RFC 1918)
    if (parts[0] === 10) return true;
    // 100.64.0.0/10 (Carrier-grade NAT)
    if (parts[0] === 100 && (parts[1] >= 64 && parts[1] <= 127)) return true;
    // 127.0.0.0/8 (Loopback)
    if (parts[0] === 127) return true;
    // 169.254.0.0/16 (Link-local / Cloud metadata: 169.254.169.254)
    if (parts[0] === 169 && parts[1] === 254) return true;
    // 172.16.0.0/12 (Private RFC 1918)
    if (parts[0] === 172 && (parts[1] >= 16 && parts[1] <= 31)) return true;
    // 192.0.0.0/24, 192.0.2.0/24 (Test / Reserved)
    if (parts[0] === 192 && parts[1] === 0 && (parts[2] === 0 || parts[2] === 2)) return true;
    // 192.168.0.0/16 (Private RFC 1918)
    if (parts[0] === 192 && parts[1] === 168) return true;
    // 198.18.0.0/15 (Benchmarking)
    if (parts[0] === 198 && (parts[1] === 18 || parts[1] === 19)) return true;
    // 198.51.100.0/24, 203.0.113.0/24 (Documentation)
    if ((parts[0] === 198 && parts[1] === 51 && parts[2] === 100) ||
        (parts[0] === 203 && parts[1] === 0 && parts[2] === 113)) return true;
    // 224.0.0.0/4 (Multicast), 240.0.0.0/4 (Reserved)
    if (parts[0] >= 224) return true;
    // Broadcast
    if (ip === '255.255.255.255') return true;
    return false;
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === '::1' || lower === '::') return true; // Loopback/unspecified
    if (lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')) return true; // Link-local
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // Unique local
    return false;
  }
  return true;
}

/**
 * Check if destination hostname is on the approved external storage allowlist
 */
function isAllowedRemoteHost(hostname) {
  if (!hostname) return false;
  const lowerHost = hostname.toLowerCase();

  // 1. ImageKit official storage CDN
  if (lowerHost === 'ik.imagekit.io' || lowerHost.endsWith('.imagekit.io')) return true;

  // 2. AWS S3 / CloudFront
  if (lowerHost.endsWith('.amazonaws.com') || lowerHost.endsWith('.cloudfront.net')) return true;

  // 3. User configured allowed report domains (from environment)
  const envDomains = (process.env.ALLOWED_REPORT_DOMAINS || '')
    .split(',')
    .map(d => d.trim().toLowerCase())
    .filter(Boolean);
  if (envDomains.some(d => lowerHost === d || lowerHost.endsWith('.' + d))) {
    return true;
  }

  // 4. Configured ImageKit endpoint from environment
  if (process.env.IMAGEKIT_URL_ENDPOINTS) {
    try {
      const parsedIK = new URL(process.env.IMAGEKIT_URL_ENDPOINTS);
      if (lowerHost === parsedIK.hostname.toLowerCase()) return true;
    } catch (_) {}
  }

  return false;
}

/**
 * Safely validate and fetch remote HTTPS URL with DNS rebinding and SSRF protection
 */
async function validateAndFetchRemoteUrl(urlStr) {
  let parsedUrl;
  try {
    parsedUrl = new URL(urlStr);
  } catch (err) {
    throw new Error('Invalid URL format');
  }

  // Strictly enforce HTTPS
  if (parsedUrl.protocol !== 'https:') {
    throw new Error('Access denied: Only secure HTTPS URLs are permitted for remote report retrieval');
  }

  const hostname = parsedUrl.hostname;
  if (!isAllowedRemoteHost(hostname)) {
    throw new Error(`Access denied: Destination host "${hostname}" is not on the permitted storage allowlist`);
  }

  // Resolve DNS to verify all destination IPs (prevents DNS rebinding and internal network scanning)
  const resolved = await dns.promises.lookup(hostname, { all: true });
  if (!resolved || resolved.length === 0) {
    throw new Error(`Unable to resolve destination host: ${hostname}`);
  }

  for (const record of resolved) {
    if (isPrivateOrReservedIP(record.address)) {
      throw new Error(`Access denied: Destination address ${record.address} resolves to a restricted network range`);
    }
  }

  // Fetch with axios: strictly disable redirects and impose size/time limits
  const response = await axios.get(urlStr, {
    responseType: 'arraybuffer',
    timeout: 15000,
    maxRedirects: 0, // Prevent redirect-based SSRF
    maxContentLength: 15 * 1024 * 1024 // 15 MB limit
  });

  return Buffer.from(response.data);
}

/**
 * Safely resolve local report files strictly confined within the uploads directory
 */
async function resolveLocalReportFile(fileUrl) {
  const safeUploadsDir = path.resolve(__dirname, '../../uploads/patient-reports');

  let filename = null;
  const reportsMatch = fileUrl.match(/\/api\/patients\/reports\/([^?#]+)/);
  const uploadsMatch = fileUrl.match(/\/uploads\/patient-reports\/([^?#]+)/);

  if (reportsMatch) {
    filename = decodeURIComponent(reportsMatch[1]);
  } else if (uploadsMatch) {
    filename = decodeURIComponent(uploadsMatch[1]);
  } else if (!fileUrl.includes('/') && !fileUrl.includes('\\') && !fileUrl.startsWith('.')) {
    filename = fileUrl;
  }

  if (!filename) {
    return null;
  }

  const safeFilename = path.basename(filename);
  const candidate = path.resolve(safeUploadsDir, safeFilename);

  // Path traversal check
  if (!candidate.startsWith(safeUploadsDir) || safeFilename.includes('..') || safeFilename !== filename) {
    throw new Error('Access denied: Invalid local file path');
  }

  if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
    return await fs.promises.readFile(candidate);
  }

  return null;
}

/**
 * Universal file buffer fetcher: handles base64 data URIs, safe local disk files,
 * and allowlisted remote HTTPS URLs with strict SSRF controls.
 */
async function fetchFileBuffer(fileUrl) {
  if (!fileUrl || typeof fileUrl !== 'string') {
    throw new Error('File URL string is required');
  }

  const cleanUrl = fileUrl.trim();

  // Case 1: Base64 data URL
  if (cleanUrl.startsWith('data:')) {
    const base64Index = cleanUrl.indexOf(';base64,');
    if (base64Index !== -1) {
      return Buffer.from(cleanUrl.substring(base64Index + 8), 'base64');
    }
    const commaIndex = cleanUrl.indexOf(',');
    return Buffer.from(cleanUrl.substring(commaIndex + 1), 'base64');
  }

  // Case 2: Remote HTTPS URL with SSRF Protection
  if (cleanUrl.startsWith('http://') || cleanUrl.startsWith('https://')) {
    return await validateAndFetchRemoteUrl(cleanUrl);
  }

  // Case 3: Confined local report file
  const localBuffer = await resolveLocalReportFile(cleanUrl);
  if (localBuffer) {
    return localBuffer;
  }

  throw new Error(`Report file not found or inaccessible: ${cleanUrl}`);
}

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
    let { appointmentId, patientId, category, reportName, notes } = req.body;

    if (!file) {
      return res.status(400).json({ success: false, message: "No report file uploaded." });
    }

    const validateFileType = require('../utils/validateFileType');
    const typeErr = await validateFileType(file, ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
    if (typeErr) {
      return res.status(400).json({ success: false, message: typeErr });
    }

    const Appointment = require('../models/appointment.model');
    const User = require('../models/user.model');
    let appt = null;
    let targetPatientId = patientId;

    if (appointmentId) {
      appt = await Appointment.findById(appointmentId);
      if (appt && appt.userId) {
        targetPatientId = appt.userId;
      }
    } else if (patientId) {
      appt = await Appointment.findOne({ userId: patientId }).sort({ createdAt: -1 });
      if (appt) {
        appointmentId = appt._id;
      }
    }

    if (!appointmentId && !patientId) {
      return res.status(400).json({ success: false, message: "appointmentId or patientId is required in the request body." });
    }

    // Determine uploader role based on user context
    let uploaderRole = 'Staff';
    if (req.user && req.user.role) {
      const roleStr = (req.user._roleData?.name || req.user.role).toString().toLowerCase();
      if (roleStr.includes('doctor')) {
        uploaderRole = 'Doctor';
      } else if (roleStr.includes('nurse') || roleStr.includes('staffnurse') || roleStr.includes('headnurse')) {
        uploaderRole = 'Nurse';
      } else if (roleStr.includes('reception')) {
        uploaderRole = 'Receptionist';
      } else if (roleStr.includes('admin')) {
        uploaderRole = 'Admin';
      }
    }

    const userContext = {
      userId: req.user?._id,
      userName: req.user?.name || req.user?.username || (uploaderRole + ' Staff'),
      userRole: uploaderRole.toLowerCase(),
      hospitalId: (appt && appt.hospitalId) ? appt.hospitalId : (req.user ? req.user.hospitalId : undefined),
      patientId: targetPatientId || (appt ? appt.userId : null)
    };

    const uniqueTag = targetPatientId || appointmentId || 'pt';
    const safeOriginalName = path.basename(file.originalname).replace(/[^a-zA-Z0-9._-]/g, '_');
    const result = await imagekit.upload({
      file: file.buffer,
      fileName: `report_${uniqueTag}_${Date.now()}_${safeOriginalName}`,
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
      appointmentId: appointmentId || undefined,
      patientId: targetPatientId || undefined,
      category: category || 'LAB_REPORT',
      notes: notes || '',
      fileName: reportName || file.originalname,
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
          name: reportName || file.originalname || 'Medical Report',
          url: result.url,
          fileId: result.fileId,
          uploadedAt: new Date()
        });
        await appt.save();
      }

      let userDoc = null;
      if (targetPatientId) {
        userDoc = await User.findById(targetPatientId);
      }
      if (!userDoc && appt?.userId) {
        userDoc = await User.findById(appt.userId);
      }
      if (!userDoc && appt && (appt.patientName || appt.patientPhone)) {
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
          name: reportName || file.originalname,
          category: category || 'LAB_REPORT',
          notes: notes || '',
          date: new Date(),
          mimeType: file.mimetype,
          extractedText: extractedText
        });
        userDoc.markModified('fertilityProfile');
        await userDoc.save();
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
    console.error('[Report Upload Error]:', error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to upload report."
    });
  }
});

// Route: GET /api/reports/patient/:patientId — Fetch all reports for a patient
router.get('/patient/:patientId', verifyToken, async (req, res) => {
  try {
    const { patientId } = req.params;
    const User = require('../models/user.model');
    const Appointment = require('../models/appointment.model');

    const [userDoc, directReports, appts] = await Promise.all([
      User.findById(patientId),
      Report.find({ patientId }).sort({ uploadedAt: -1 }),
      Appointment.find({ userId: patientId }).select('_id prescriptions')
    ]);

    const allReports = [...directReports];
    const seenUrls = new Set(directReports.map(r => r.url));

    // From user fertility profile
    if (userDoc?.fertilityProfile?.reports) {
      userDoc.fertilityProfile.reports.forEach(r => {
        if (r.url && !seenUrls.has(r.url)) {
          seenUrls.add(r.url);
          allReports.push({
            _id: r.fileId || r._id,
            fileName: r.name || 'Medical Report',
            url: r.url,
            fileId: r.fileId,
            category: r.category || 'LAB_REPORT',
            notes: r.notes || '',
            mimeType: r.mimeType || 'application/pdf',
            uploadedAt: r.date || new Date(),
            uploadedByRole: 'Staff'
          });
        }
      });
    }

    // From appointment prescriptions
    appts.forEach(a => {
      if (Array.isArray(a.prescriptions)) {
        a.prescriptions.forEach(p => {
          if (p.url && !seenUrls.has(p.url)) {
            seenUrls.add(p.url);
            allReports.push({
              _id: p.fileId || p._id,
              appointmentId: a._id,
              fileName: p.name || 'Lab Report',
              url: p.url,
              fileId: p.fileId,
              category: 'LAB_REPORT',
              uploadedAt: p.uploadedAt || new Date(),
              uploadedByRole: 'Doctor'
            });
          }
        });
      }
    });

    res.json({
      success: true,
      reports: allReports
    });
  } catch (err) {
    console.error('[Fetch Patient Reports Error]:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch patient reports' });
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

    // 2. Download / Read file buffer
    const buffer = await fetchFileBuffer(fileUrl);

    // 3. Validate media
    const validation = validateMedia(buffer, mimeType, fileName);
    if (!validation.valid) {
      return res.status(400).json({ success: false, message: validation.error, code: validation.code });
    }

    const base64Data = buffer.toString('base64');
    
    // 4. Generate AI Summary with content-aware prompt routing and atomic wallet deduction
    const { summary, reportBasedSuggestions = [], usage } = await aiService.generateReportSummary(base64Data, validation.mimeType, userContext, fileName || '');

    res.status(200).json({
      success: true,
      summary,
      reportBasedSuggestions,
      usage,
      wallet: usage.wallet || null
    });

  } catch (error) {
    console.error('[Generate Summary Route] Error:', error);
    const msg = error.message || "Failed to generate AI summary.";
    const isClientErr = msg.includes('Access denied:') ||
                        msg.includes('Report file not found') ||
                        msg.includes('Unable to resolve') ||
                        msg.includes('Only secure HTTPS') ||
                        msg.includes('restricted network range') ||
                        msg.includes('storage allowlist');
    res.status(isClientErr ? 400 : 500).json({
      success: false,
      message: msg
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

    // 2. Download / Read file buffer
    const buffer = await fetchFileBuffer(fileUrl);

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
    const [latestBuffer, prevBuffer] = await Promise.all([
      fetchFileBuffer(targetLatestUrl),
      fetchFileBuffer(targetPrevUrl)
    ]);

    const latestBase64 = latestBuffer.toString('base64');
    const prevBase64 = prevBuffer.toString('base64');

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
          const mediaBuffer = await fetchFileBuffer(media.url);
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
