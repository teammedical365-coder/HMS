const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

const { verifyToken } = require('../middleware/auth.middleware');
const User = require('../models/user.model');
const Hospital = require('../models/hospital.model');
const LabOrder = require('../models/labOrder.model');
const LabTest = require('../models/labTest.model');
const LabSample = require('../models/labSample.model');
const LabLocation = require('../models/labLocation.model');
const LabTestResult = require('../models/labTestResult.model');
const LabCounter = require('../models/labCounter.model');
const LabReport = require('../models/labReport.model');
const LabReportTemplate = require('../models/labReportTemplate.model');
const { generateReportPDF } = require('../utils/pdfReportGenerator');

// =========================================================================
// 1. ROLE & PERMISSION MIDDLEWARE
// =========================================================================

const verifyReportAccess = (req, res, next) => {
  const user = req.user;
  if (!user) return res.status(401).json({ success: false, message: 'Authentication required' });

  const roleData = user._roleData;
  const roleName = String(roleData?.name || user.role || '').toLowerCase();
  const perms = roleData?.permissions || [];

  const isAuthorized = (
    perms.includes('*') ||
    roleName.includes('admin') ||
    roleName.includes('manager') ||
    roleName.includes('tech') ||
    roleName.includes('pathologist') ||
    roleName.includes('reception') ||
    roleName.includes('doctor') ||
    perms.includes('reports:view') ||
    perms.includes('reports:generate') ||
    perms.includes('reports:approve') ||
    perms.includes('reports:release') ||
    perms.includes('lab_view')
  );

  if (!isAuthorized) {
    return res.status(403).json({ success: false, message: 'Access denied: Insufficient report permissions' });
  }

  req.hospitalId = req.user.hospitalId || req.headers['x-hospital-id'] || null;
  next();
};

const verifyApprovalPermission = (req, res, next) => {
  const user = req.user;
  const roleData = user._roleData;
  const roleName = String(roleData?.name || user.role || '').toLowerCase();
  const perms = roleData?.permissions || [];

  const canApprove = (
    perms.includes('*') ||
    roleName.includes('admin') ||
    roleName.includes('pathologist') ||
    roleName.includes('manager') ||
    perms.includes('reports:approve') ||
    perms.includes('results:verify')
  );

  if (!canApprove) {
    return res.status(403).json({
      success: false,
      message: 'Access denied: Pathologist or Lab Director authorization required to approve/release reports'
    });
  }

  next();
};

// Helper: Generate Unique Report Number
async function getNextReportNumber(hospitalId) {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  let hospCode = 'LMS';
  try {
    const hosp = await Hospital.findById(hospitalId).select('code name slug').lean();
    if (hosp?.code) hospCode = hosp.code.toUpperCase();
    else if (hosp?.slug) hospCode = hosp.slug.slice(0, 4).toUpperCase();
  } catch (e) {
    // fallback
  }
  const cleanCode = hospCode.replace(/[^A-Z0-9]/g, '').slice(0, 4) || 'LMS';
  const seq = await LabCounter.getNextSequence(hospitalId, 'report', dateStr);
  return `REP-${cleanCode}-${dateStr}-${String(seq).padStart(4, '0')}`;
}

// Helper: Hash Access Token
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// Phase 8 Diagnostic Report statuses (excludes legacy ungenerated OPD 'PENDING' request placeholders)
const PHASE8_REPORT_STATUSES = [
  'GENERATED',
  'UNDER_REVIEW',
  'APPROVED',
  'RELEASED',
  'REJECTED',
  'AMENDMENT_PENDING',
  'SUPERSEDED'
];

// Helper: Resolve Hospital Branding Header for PDF Generation (Medical365 Tenant Branding)
async function resolveHospitalPdfBranding(hospitalId, template = null) {
  const hosp = hospitalId
    ? await Hospital.findById(hospitalId).select('name address city state zipCode phone email branding logo').lean()
    : null;

  const tplObj = template ? { ...template } : {};
  const tplHeader = tplObj.hospitalHeader || {};
  const hospAddress = [hosp?.address, hosp?.city, hosp?.state, hosp?.zipCode].filter(Boolean).join(', ');

  tplObj.primaryColor = hosp?.branding?.primaryColor || tplObj.primaryColor || '#0284c7';
  tplObj.hospitalHeader = {
    ...tplHeader,
    name: hosp?.branding?.appName || hosp?.name || tplHeader.name || 'Medical 365',
    tagline: hosp?.branding?.tagline || tplHeader.tagline || 'Diagnostic Pathology & Laboratory Services',
    address: hospAddress || tplHeader.address || '',
    phone: hosp?.phone || tplHeader.phone || '',
    email: hosp?.email || tplHeader.email || '',
    accreditationText: tplHeader.accreditationText || 'Clinical Pathology & Laboratory Medicine'
  };
  return tplObj;
}

// =========================================================================
// 2. PUBLIC PATIENT ACCESS ROUTE (No Auth Middleware Required)
// =========================================================================

/**
 * GET /api/lab/reports/public/access/:token
 * Secure patient report access via cryptographic single-use or expiring access token
 */
router.get('/public/access/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const { format } = req.query;

    if (!token || typeof token !== 'string') {
      return res.status(400).json({ success: false, message: 'Invalid or missing access token' });
    }

    const hashed = hashToken(token);
    const report = await LabReport.findOne({
      accessTokenHash: hashed,
      reportStatus: 'RELEASED'
    }).lean();

    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Report not found or has not been released yet'
      });
    }

    if (report.accessTokenExpiresAt && new Date(report.accessTokenExpiresAt) < new Date()) {
      return res.status(410).json({
        success: false,
        message: 'This report access link has expired. Please contact the diagnostic centre for a renewed link.'
      });
    }

    // If PDF format requested, stream generated PDF
    if (format === 'pdf') {
      const template = await LabReportTemplate.findOne({
        hospitalId: report.hospitalId,
        isDefault: true
      }).lean();
      const mergedTemplate = await resolveHospitalPdfBranding(report.hospitalId, template);

      const pdfBuffer = await generateReportPDF(report, mergedTemplate);

      // Increment download metric asynchronously
      await LabReport.findByIdAndUpdate(report._id, {
        $inc: { downloadCount: 1 },
        $push: {
          auditHistory: {
            action: 'DOWNLOADED',
            performedByName: 'Patient (Public Link)',
            timestamp: new Date(),
            details: { channel: 'PUBLIC_LINK' }
          }
        }
      });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${report.reportNumber}.pdf"`);
      return res.send(pdfBuffer);
    }

    // Return sanitized patient report payload
    return res.status(200).json({
      success: true,
      message: 'Report retrieved successfully',
      data: {
        reportNumber: report.reportNumber,
        reportStatus: report.reportStatus,
        patientName: report.patientSnapshot?.name,
        age: report.patientSnapshot?.age,
        gender: report.patientSnapshot?.gender,
        releasedAt: report.releasedAt,
        approvedByName: report.approvedByName,
        tests: report.tests,
        overallInterpretation: report.overallInterpretation,
        clinicalNotes: report.clinicalNotes,
        downloadUrl: `/api/lab/reports/public/access/${token}?format=pdf`
      }
    });
  } catch (err) {
    console.error('Public report access error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error retrieving report' });
  }
});

// Apply Auth Middleware to all subsequent routes
router.use(verifyToken);
router.use(verifyReportAccess);

// =========================================================================
// 3. REPORT WORKSTATION & MANAGEMENT ROUTES
// =========================================================================

/**
 * GET /api/lab/reports
 * Paginated reports list with status filters, search, and aggregate metrics
 */
router.get('/', async (req, res) => {
  try {
    const {
      status,
      reportType,
      department,
      orderNumber,
      search,
      startDate,
      endDate,
      page = 1,
      limit = 20
    } = req.query;

    const basePhase8Match = {
      hospitalId: req.hospitalId,
      reportNumber: { $exists: true, $nin: [null, ''] },
      reportStatus: { $in: PHASE8_REPORT_STATUSES }
    };

    const query = { ...basePhase8Match };

    if (status && status !== 'ALL') {
      query.reportStatus = PHASE8_REPORT_STATUSES.includes(status) ? status : '__NONE__';
    }

    if (reportType && reportType !== 'ALL') {
      query.reportType = reportType;
    }

    if (department && department !== 'ALL') {
      query.department = department;
    }

    if (orderNumber) {
      query.orderNumber = { $regex: orderNumber.trim(), $options: 'i' };
    }

    if (search) {
      const term = search.trim();
      query.$or = [
        { reportNumber: { $regex: term, $options: 'i' } },
        { orderNumber: { $regex: term, $options: 'i' } },
        { 'patientSnapshot.name': { $regex: term, $options: 'i' } },
        { 'patientSnapshot.phone': { $regex: term, $options: 'i' } },
        { 'patientSnapshot.uhid': { $regex: term, $options: 'i' } }
      ];
    }

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) {
        const e = new Date(endDate);
        e.setHours(23, 59, 59, 999);
        query.createdAt.$lte = e;
      }
    }

    const skip = (Math.max(1, parseInt(page)) - 1) * Math.max(1, parseInt(limit));
    const take = Math.max(1, Math.min(100, parseInt(limit)));

    const statsMatch = {
      ...(req.hospitalId && mongoose.Types.ObjectId.isValid(req.hospitalId)
        ? { hospitalId: new mongoose.Types.ObjectId(req.hospitalId) }
        : { hospitalId: req.hospitalId }),
      reportNumber: { $exists: true, $nin: [null, ''] },
      reportStatus: { $in: PHASE8_REPORT_STATUSES }
    };

    const [reports, totalCount, statsAgg] = await Promise.all([
      LabReport.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(take)
        .populate('orderId', 'orderNumber orderStatus status tokenNumber priority tests')
        .populate('generatedBy', 'name email role')
        .populate('approvedBy', 'name email role')
        .lean(),
      LabReport.countDocuments(query),
      LabReport.aggregate([
        { $match: statsMatch },
        { $group: { _id: '$reportStatus', count: { $sum: 1 } } }
      ])
    ]);

    const stats = {
      GENERATED: 0,
      UNDER_REVIEW: 0,
      APPROVED: 0,
      RELEASED: 0,
      REJECTED: 0,
      AMENDMENT_PENDING: 0,
      SUPERSEDED: 0,
      TOTAL: 0
    };

    statsAgg.forEach(s => {
      if (stats[s._id] !== undefined) stats[s._id] = s.count;
      stats.TOTAL += s.count;
    });

    return res.status(200).json({
      success: true,
      data: reports,
      pagination: {
        page: parseInt(page),
        limit: take,
        total: totalCount,
        pages: Math.ceil(totalCount / take)
      },
      stats
    });
  } catch (err) {
    console.error('Error fetching reports:', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch lab reports' });
  }
});

/**
 * GET /api/lab/reports/pending-orders
 * List lab orders that have verified results ready for report generation
 */
router.get('/pending-orders', async (req, res) => {
  try {
    // Find all verified results for this hospital that don't have a report yet or have pending tests
    const verifiedResults = await LabTestResult.find({
      hospitalId: req.hospitalId,
      resultStatus: 'VERIFIED'
    }).select('orderId orderNumber testId testCode testName priority patientSnapshot verifiedAt verifiedByName').lean();

    if (!verifiedResults || verifiedResults.length === 0) {
      return res.status(200).json({ success: true, data: [] });
    }

    // Group by orderId
    const orderMap = {};
    for (const r of verifiedResults) {
      const oid = String(r.orderId);
      if (!orderMap[oid]) {
        orderMap[oid] = {
          orderId: r.orderId,
          orderNumber: r.orderNumber,
          patientSnapshot: r.patientSnapshot,
          priority: r.priority,
          verifiedTests: []
        };
      }
      orderMap[oid].verifiedTests.push({
        resultId: r._id,
        testId: r.testId,
        testCode: r.testCode,
        testName: r.testName,
        verifiedAt: r.verifiedAt,
        verifiedByName: r.verifiedByName
      });
    }

    // Check which ones already have reports generated
    const orderIds = Object.keys(orderMap);
    const existingReports = await LabReport.find({
      hospitalId: req.hospitalId,
      orderId: { $in: orderIds },
      reportStatus: { $ne: 'CANCELLED' }
    }).select('orderId reportNumber reportStatus').lean();

    const reportedOrderIds = new Set(existingReports.map(rp => String(rp.orderId)));

    const availableOrders = Object.values(orderMap).map(o => ({
      ...o,
      hasExistingReport: reportedOrderIds.has(String(o.orderId))
    }));

    return res.status(200).json({ success: true, data: availableOrders });
  } catch (err) {
    console.error('Error fetching pending orders for report generation:', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch pending orders' });
  }
});

/**
 * POST /api/lab/reports/generate
 * Generate report draft strictly from VERIFIED test results
 */
router.post('/generate', async (req, res) => {
  try {
    const {
      orderId,
      testIds = [],
      reportType = 'ROUTINE',
      templateId,
      overallInterpretation = '',
      clinicalNotes = ''
    } = req.body;

    if (!orderId) {
      return res.status(400).json({ success: false, message: 'Order ID is required to generate report' });
    }

    const order = await LabOrder.findOne({
      _id: orderId,
      hospitalId: req.hospitalId
    }).populate('patient').lean();

    if (!order) {
      return res.status(404).json({ success: false, message: 'Lab order not found for this hospital' });
    }

    // Query test results for this order
    const resultQuery = {
      orderId,
      hospitalId: req.hospitalId
    };

    if (Array.isArray(testIds) && testIds.length > 0) {
      resultQuery.testId = { $in: testIds };
    }

    const testResults = await LabTestResult.find(resultQuery).lean();

    if (!testResults || testResults.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No test results found for this order. Ensure test results are entered and verified.'
      });
    }

    // Strict Clinical Gate: Check if all included tests are VERIFIED
    const unverified = testResults.filter(r => r.resultStatus !== 'VERIFIED');
    if (unverified.length > 0) {
      const names = unverified.map(u => `${u.testName} (${u.resultStatus})`).join(', ');
      return res.status(400).json({
        success: false,
        message: `Cannot generate report: The following test(s) are not verified: ${names}. Only VERIFIED results can be included in reports.`
      });
    }

    // Generate unique report number
    const reportNumber = await getNextReportNumber(req.hospitalId);

    // Map test results into report test structure
    const testsPayload = testResults.map(tr => ({
      testResultId: tr._id,
      testId: tr.testId,
      testCode: tr.testCode,
      testName: tr.testName,
      department: tr.department || 'General Pathology',
      methodology: tr.methodology || '',
      sampleId: tr.sampleId || null,
      barcode: tr.barcode || '',
      sampleType: tr.sampleType || '',
      collectedAt: tr.collectedAt || null,
      receivedAt: tr.receivedAt || null,
      verifiedAt: tr.verifiedAt || null,
      verifiedBy: tr.verifiedBy || null,
      verifiedByName: tr.verifiedByName || '',
      hasAbnormalParameters: tr.hasAbnormalParameters || false,
      hasCriticalParameters: tr.hasCriticalParameters || false,
      overallRemarks: tr.overallRemarks || '',
      clinicalNotes: tr.clinicalNotes || '',
      parameters: (tr.resultParameters || []).map(p => ({
        parameterId: p.parameterId,
        parameterCode: p.parameterCode,
        parameterName: p.parameterName,
        dataType: p.dataType,
        enteredValue: p.enteredValue,
        numericValue: p.numericValue,
        unit: p.unit,
        referenceRangeText: p.referenceRangeText,
        referenceRangeSnapshot: p.referenceRangeSnapshot,
        abnormalFlag: p.abnormalFlag,
        criticalFlag: p.criticalFlag,
        remarks: p.remarks,
        displayOrder: p.displayOrder
      }))
    }));

    // Generate secure initial access token
    const rawToken = crypto.randomBytes(24).toString('hex');
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30); // 30 days validity

    const newReport = await LabReport.create({
      hospitalId: req.hospitalId,
      locationId: order.locationId || null,
      locationName: order.locationName || '',
      orderId: order._id,
      orderNumber: order.orderNumber,
      tokenNumber: order.tokenNumber || null,
      reportNumber,
      reportType,
      department: testsPayload[0]?.department || 'General Pathology',
      patientId: order.patientId || order.patient?.patientId || '',
      userId: order.patient?.userId || order.patient?._id || null,
      patientSnapshot: {
        name: order.patient?.name || order.patientSnapshot?.name || 'Unknown Patient',
        uhid: order.patient?.uhid || order.uhid || '',
        mrn: order.patient?.mrn || '',
        phone: order.patient?.phone || '',
        email: order.patient?.email || '',
        gender: order.patient?.gender || 'Other',
        age: order.patient?.age || 0,
        ageUnit: order.patient?.ageUnit || 'Years',
        dob: order.patient?.dob || null,
        address: order.patient?.address || ''
      },
      referringDoctor: {
        doctorId: order.referringDoctorId || null,
        name: order.referringDoctorName || 'Self / Direct',
        specialty: order.referringDoctorSpecialty || ''
      },
      tests: testsPayload,
      templateId: templateId || null,
      overallInterpretation,
      clinicalNotes,
      reportStatus: 'GENERATED',
      generatedBy: req.user._id,
      generatedByName: req.user.name || 'Technician',
      generatedAt: new Date(),
      accessTokenHash: tokenHash,
      accessTokenExpiresAt: expiresAt,
      auditHistory: [{
        action: 'GENERATED',
        performedBy: req.user._id,
        performedByName: req.user.name || 'Technician',
        timestamp: new Date(),
        details: { testsCount: testsPayload.length, orderNumber: order.orderNumber }
      }]
    });

    return res.status(201).json({
      success: true,
      message: 'Lab report draft generated successfully from verified results',
      data: newReport,
      accessToken: rawToken
    });
  } catch (err) {
    console.error('Error generating report draft:', err);
    return res.status(500).json({ success: false, message: 'Failed to generate lab report draft' });
  }
});

/**
 * GET /api/lab/reports/:id
 * Retrieve single report by ID
 */
router.get('/:id', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid report ID format' });
    }
    const report = await LabReport.findOne({
      _id: req.params.id,
      hospitalId: req.hospitalId
    })
      .populate('orderId', 'orderNumber orderStatus tokenNumber priority paymentStatus')
      .populate('generatedBy', 'name email role')
      .populate('approvedBy', 'name email role')
      .populate('releasedBy', 'name email role')
      .populate('templateId')
      .lean();

    if (!report) {
      return res.status(404).json({ success: false, message: 'Lab report not found' });
    }

    return res.status(200).json({ success: true, data: report });
  } catch (err) {
    console.error('Error fetching report details:', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch lab report details' });
  }
});

/**
 * GET /api/lab/reports/:id/preview
 * Generate and stream in-browser PDF preview (with appropriate status watermark)
 */
router.get('/:id/preview', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid report ID format' });
    }
    const report = await LabReport.findOne({
      _id: req.params.id,
      hospitalId: req.hospitalId
    }).lean();

    if (!report) {
      return res.status(404).json({ success: false, message: 'Lab report not found' });
    }

    const template = await LabReportTemplate.findOne({
      hospitalId: req.hospitalId,
      isDefault: true
    }).lean();
    const mergedTemplate = await resolveHospitalPdfBranding(req.hospitalId, template);

    const pdfBuffer = await generateReportPDF(report, mergedTemplate);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${report.reportNumber || 'Report'}.pdf"`);
    return res.send(pdfBuffer);
  } catch (err) {
    console.error('Error previewing report PDF:', err);
    return res.status(500).json({ success: false, message: 'Failed to preview report PDF' });
  }
});

/**
 * GET /api/lab/reports/:id/download
 * Authenticated download endpoint (increments download count and logs audit)
 */
router.get('/:id/download', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid report ID format' });
    }
    const report = await LabReport.findOne({
      _id: req.params.id,
      hospitalId: req.hospitalId
    });

    if (!report) {
      return res.status(404).json({ success: false, message: 'Lab report not found' });
    }

    const template = await LabReportTemplate.findOne({
      hospitalId: req.hospitalId,
      isDefault: true
    }).lean();
    const mergedTemplate = await resolveHospitalPdfBranding(req.hospitalId, template);

    const pdfBuffer = await generateReportPDF(report.toObject(), mergedTemplate);

    // Increment download metrics
    report.downloadCount = (report.downloadCount || 0) + 1;
    report.auditHistory.push({
      action: 'DOWNLOADED',
      performedBy: req.user._id,
      performedByName: req.user.name || 'Staff',
      timestamp: new Date(),
      details: { role: req.user.role }
    });
    await report.save();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${report.reportNumber || 'Report'}.pdf"`);
    return res.send(pdfBuffer);
  } catch (err) {
    console.error('Error downloading report PDF:', err);
    return res.status(500).json({ success: false, message: 'Failed to download report PDF' });
  }
});

/**
 * POST /api/lab/reports/:id/submit-review
 * Submit draft report for Pathologist / Director review
 */
router.post('/:id/submit-review', async (req, res) => {
  try {
    const report = await LabReport.findOne({
      _id: req.params.id,
      hospitalId: req.hospitalId
    });

    if (!report) {
      return res.status(404).json({ success: false, message: 'Lab report not found' });
    }

    if (report.reportStatus !== 'GENERATED' && report.reportStatus !== 'REJECTED') {
      return res.status(400).json({
        success: false,
        message: `Report in status ${report.reportStatus} cannot be submitted for review`
      });
    }

    report.reportStatus = 'UNDER_REVIEW';
    report.reviewedBy = req.user._id;
    report.reviewedByName = req.user.name || 'Technician';
    report.reviewedAt = new Date();
    report.auditHistory.push({
      action: 'SUBMITTED_FOR_REVIEW',
      performedBy: req.user._id,
      performedByName: req.user.name || 'Technician',
      timestamp: new Date(),
      details: { previousStatus: report.reportStatus }
    });

    await report.save();

    return res.status(200).json({
      success: true,
      message: 'Report submitted for pathologist review successfully',
      data: report
    });
  } catch (err) {
    console.error('Error submitting report for review:', err);
    return res.status(500).json({ success: false, message: 'Failed to submit report for review' });
  }
});

/**
 * POST /api/lab/reports/:id/approve
 * Pathologist approves report
 */
router.post('/:id/approve', verifyApprovalPermission, async (req, res) => {
  try {
    const report = await LabReport.findOne({
      _id: req.params.id,
      hospitalId: req.hospitalId
    });

    if (!report) {
      return res.status(404).json({ success: false, message: 'Lab report not found' });
    }

    if (report.reportStatus !== 'UNDER_REVIEW' && report.reportStatus !== 'GENERATED') {
      return res.status(400).json({
        success: false,
        message: `Report in status ${report.reportStatus} cannot be approved. It must be GENERATED or UNDER_REVIEW.`
      });
    }

    report.reportStatus = 'APPROVED';
    report.approvedBy = req.user._id;
    report.approvedByName = req.user.name || 'Pathologist';
    report.approvedAt = new Date();
    report.auditHistory.push({
      action: 'APPROVED',
      performedBy: req.user._id,
      performedByName: req.user.name || 'Pathologist',
      timestamp: new Date(),
      details: { previousStatus: report.reportStatus }
    });

    await report.save();

    return res.status(200).json({
      success: true,
      message: 'Report approved by pathologist successfully',
      data: report
    });
  } catch (err) {
    console.error('Error approving report:', err);
    return res.status(500).json({ success: false, message: 'Failed to approve report' });
  }
});

/**
 * POST /api/lab/reports/:id/reject
 * Pathologist rejects report with mandatory reason
 */
router.post('/:id/reject', verifyApprovalPermission, async (req, res) => {
  try {
    const { reason } = req.body;
    if (!reason || !reason.trim()) {
      return res.status(400).json({
        success: false,
        message: 'A mandatory rejection reason must be provided'
      });
    }

    const report = await LabReport.findOne({
      _id: req.params.id,
      hospitalId: req.hospitalId
    });

    if (!report) {
      return res.status(404).json({ success: false, message: 'Lab report not found' });
    }

    if (report.reportStatus === 'RELEASED') {
      return res.status(400).json({
        success: false,
        message: 'Cannot reject a released report. Use the formal amendment workflow instead.'
      });
    }

    report.reportStatus = 'REJECTED';
    report.rejectionReason = reason.trim();
    report.rejectedBy = req.user._id;
    report.rejectedByName = req.user.name || 'Pathologist';
    report.rejectedAt = new Date();
    report.auditHistory.push({
      action: 'REJECTED',
      performedBy: req.user._id,
      performedByName: req.user.name || 'Pathologist',
      timestamp: new Date(),
      details: { reason: reason.trim() }
    });

    await report.save();

    return res.status(200).json({
      success: true,
      message: 'Report rejected and returned to technician with remarks',
      data: report
    });
  } catch (err) {
    console.error('Error rejecting report:', err);
    return res.status(500).json({ success: false, message: 'Failed to reject report' });
  }
});

/**
 * POST /api/lab/reports/:id/release
 * Officially release report for patient and clinical access
 */
router.post('/:id/release', verifyApprovalPermission, async (req, res) => {
  try {
    const report = await LabReport.findOne({
      _id: req.params.id,
      hospitalId: req.hospitalId
    });

    if (!report) {
      return res.status(404).json({ success: false, message: 'Lab report not found' });
    }

    if (report.reportStatus !== 'APPROVED' && report.reportStatus !== 'UNDER_REVIEW' && report.reportStatus !== 'GENERATED') {
      return res.status(400).json({
        success: false,
        message: `Report in status ${report.reportStatus} cannot be released.`
      });
    }

    // Verify results are still valid in DB
    const testResultIds = report.tests.map(t => t.testResultId).filter(Boolean);
    if (testResultIds.length > 0) {
      const liveResults = await LabTestResult.find({ _id: { $in: testResultIds } }).lean();
      const nonVerified = liveResults.filter(r => r.resultStatus !== 'VERIFIED');
      if (nonVerified.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Cannot release report: One or more test results have been unverified or modified.'
        });
      }
    }

    // Generate or ensure patient access token
    let rawToken = crypto.randomBytes(24).toString('hex');
    report.accessTokenHash = hashToken(rawToken);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);
    report.accessTokenExpiresAt = expiresAt;

    report.reportStatus = 'RELEASED';
    report.releasedBy = req.user._id;
    report.releasedByName = req.user.name || 'Pathologist';
    report.releasedAt = new Date();

    // Auto-approve if not explicitly set
    if (!report.approvedBy) {
      report.approvedBy = req.user._id;
      report.approvedByName = req.user.name || 'Pathologist';
      report.approvedAt = new Date();
    }

    report.auditHistory.push({
      action: 'RELEASED',
      performedBy: req.user._id,
      performedByName: req.user.name || 'Pathologist',
      timestamp: new Date(),
      details: { releasedAt: report.releasedAt }
    });

    await report.save();

    // Update associated LabOrder & any linked legacy HMS LabReport status
    if (report.orderId) {
      try {
        const updatedOrder = await LabOrder.findByIdAndUpdate(report.orderId, {
          $set: {
            status: 'Completed'
          }
        }, { new: true }).lean();

        if (updatedOrder?.legacyLabReportId) {
          await LabReport.updateOne(
            { _id: updatedOrder.legacyLabReportId, reportStatus: 'PENDING' },
            { $set: { testStatus: 'DONE', reportStatus: 'UPLOADED' } }
          );
        }
      } catch (e) {
        // non-blocking
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Lab report released successfully for patient delivery',
      data: report,
      patientAccessToken: rawToken,
      publicAccessUrl: `/api/lab/reports/public/access/${rawToken}`
    });
  } catch (err) {
    console.error('Error releasing report:', err);
    return res.status(500).json({ success: false, message: 'Failed to release report' });
  }
});

/**
 * POST /api/lab/reports/:id/amend
 * Create a new amendment revision; marks previous report SUPERSEDED
 */
router.post('/:id/amend', verifyApprovalPermission, async (req, res) => {
  try {
    const { amendmentReason, notes } = req.body;

    if (!amendmentReason || !amendmentReason.trim()) {
      return res.status(400).json({
        success: false,
        message: 'A mandatory amendment reason must be provided to issue a revised report'
      });
    }

    const originalReport = await LabReport.findOne({
      _id: req.params.id,
      hospitalId: req.hospitalId
    });

    if (!originalReport) {
      return res.status(404).json({ success: false, message: 'Original lab report not found' });
    }

    if (originalReport.reportStatus !== 'RELEASED') {
      return res.status(400).json({
        success: false,
        message: 'Only previously RELEASED reports can be formally amended'
      });
    }

    // Generate new unique report number for revision
    const newReportNumber = await getNextReportNumber(req.hospitalId);

    // Deep clone tests from original report
    const testsClone = originalReport.tests.map(t => t.toObject ? t.toObject() : t);

    // Generate new access token for amended report
    const rawToken = crypto.randomBytes(24).toString('hex');
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    const amendedReport = await LabReport.create({
      hospitalId: originalReport.hospitalId,
      locationId: originalReport.locationId,
      locationName: originalReport.locationName,
      orderId: originalReport.orderId,
      orderNumber: originalReport.orderNumber,
      tokenNumber: originalReport.tokenNumber,
      reportNumber: newReportNumber,
      reportType: originalReport.reportType,
      department: originalReport.department,
      patientId: originalReport.patientId,
      userId: originalReport.userId,
      patientSnapshot: originalReport.patientSnapshot,
      referringDoctor: originalReport.referringDoctor,
      tests: testsClone,
      templateId: originalReport.templateId,
      overallInterpretation: originalReport.overallInterpretation,
      clinicalNotes: notes ? `${originalReport.clinicalNotes}\nAmendment Notes: ${notes}` : originalReport.clinicalNotes,
      revisionNumber: (originalReport.revisionNumber || 1) + 1,
      originalReportId: originalReport._id,
      amendmentReason: amendmentReason.trim(),
      amendedBy: req.user._id,
      amendedByName: req.user.name || 'Pathologist',
      amendedAt: new Date(),
      reportStatus: 'GENERATED',
      generatedBy: req.user._id,
      generatedByName: req.user.name || 'Pathologist',
      generatedAt: new Date(),
      accessTokenHash: tokenHash,
      accessTokenExpiresAt: expiresAt,
      auditHistory: [{
        action: 'AMENDED_CREATED',
        performedBy: req.user._id,
        performedByName: req.user.name || 'Pathologist',
        timestamp: new Date(),
        details: {
          originalReportId: originalReport._id,
          originalReportNumber: originalReport.reportNumber,
          reason: amendmentReason.trim()
        }
      }]
    });

    // Mark original report as SUPERSEDED
    originalReport.reportStatus = 'SUPERSEDED';
    originalReport.supersededBy = amendedReport._id;
    originalReport.supersededAt = new Date();
    originalReport.auditHistory.push({
      action: 'SUPERSEDED',
      performedBy: req.user._id,
      performedByName: req.user.name || 'Pathologist',
      timestamp: new Date(),
      details: {
        supersededByReportId: amendedReport._id,
        supersededByReportNumber: amendedReport.reportNumber,
        reason: amendmentReason.trim()
      }
    });

    await originalReport.save();

    return res.status(201).json({
      success: true,
      message: `Amended report revision ${amendedReport.revisionNumber} created successfully. Original report marked SUPERSEDED.`,
      data: amendedReport,
      accessToken: rawToken
    });
  } catch (err) {
    console.error('Error creating report amendment:', err);
    return res.status(500).json({ success: false, message: 'Failed to create amended report' });
  }
});

/**
 * GET /api/lab/reports/:id/history
 * Comprehensive audit trail and revision ancestry
 */
router.get('/:id/history', async (req, res) => {
  try {
    const report = await LabReport.findOne({
      _id: req.params.id,
      hospitalId: req.hospitalId
    })
      .populate('originalReportId', 'reportNumber revisionNumber reportStatus createdAt')
      .populate('supersededBy', 'reportNumber revisionNumber reportStatus createdAt')
      .lean();

    if (!report) {
      return res.status(404).json({ success: false, message: 'Lab report not found' });
    }

    return res.status(200).json({
      success: true,
      data: {
        reportNumber: report.reportNumber,
        revisionNumber: report.revisionNumber,
        reportStatus: report.reportStatus,
        originalReport: report.originalReportId,
        supersededBy: report.supersededBy,
        amendmentReason: report.amendmentReason,
        auditHistory: report.auditHistory || [],
        deliveryAudit: report.deliveryAudit || []
      }
    });
  } catch (err) {
    console.error('Error fetching report history:', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch report audit history' });
  }
});

/**
 * POST /api/lab/reports/:id/token
 * Generate or refresh secure expiring patient access token
 */
router.post('/:id/token', async (req, res) => {
  try {
    const { validityDays = 30 } = req.body;

    const report = await LabReport.findOne({
      _id: req.params.id,
      hospitalId: req.hospitalId
    });

    if (!report) {
      return res.status(404).json({ success: false, message: 'Lab report not found' });
    }

    const rawToken = crypto.randomBytes(24).toString('hex');
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + parseInt(validityDays));

    report.accessTokenHash = tokenHash;
    report.accessTokenExpiresAt = expiresAt;
    report.auditHistory.push({
      action: 'ACCESS_TOKEN_GENERATED',
      performedBy: req.user._id,
      performedByName: req.user.name || 'Staff',
      timestamp: new Date(),
      details: { validityDays }
    });

    await report.save();

    return res.status(200).json({
      success: true,
      message: 'Patient access token generated successfully',
      data: {
        reportNumber: report.reportNumber,
        token: rawToken,
        expiresAt,
        accessUrl: `/api/lab/reports/public/access/${rawToken}`
      }
    });
  } catch (err) {
    console.error('Error generating report access token:', err);
    return res.status(500).json({ success: false, message: 'Failed to generate access token' });
  }
});

/**
 * POST /api/lab/reports/:id/deliver
 * Dispatch report via selected channel (PORTAL, SECURE_LINK, EMAIL, WHATSAPP, PRINT)
 */
router.post('/:id/deliver', async (req, res) => {
  try {
    const {
      method = 'PORTAL',
      recipient = '',
      notes = ''
    } = req.body;

    const report = await LabReport.findOne({
      _id: req.params.id,
      hospitalId: req.hospitalId
    });

    if (!report) {
      return res.status(404).json({ success: false, message: 'Lab report not found' });
    }

    if (report.reportStatus !== 'RELEASED' && report.reportStatus !== 'APPROVED') {
      return res.status(400).json({
        success: false,
        message: 'Only APPROVED or RELEASED reports can be dispatched for delivery'
      });
    }

    const targetRecipient = recipient || (
      method === 'EMAIL' ? report.patientSnapshot?.email :
      method === 'WHATSAPP' ? report.patientSnapshot?.phone :
      'PATIENT_PORTAL'
    );

    let deliveryStatus = 'SENT';
    let errorMessage = '';

    // Handle Email Delivery
    if (method === 'EMAIL') {
      if (!targetRecipient || !targetRecipient.includes('@')) {
        return res.status(400).json({
          success: false,
          message: 'Valid recipient email address is required for email delivery'
        });
      }

      try {
        // Generate PDF attachment
        const template = await LabReportTemplate.findOne({
          hospitalId: req.hospitalId,
          isDefault: true
        }).lean();

        const pdfBuffer = await generateReportPDF(report.toObject(), template || {});

        // Configure transporter if available
        if (process.env.SMTP_HOST && process.env.SMTP_USER) {
          const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: Number(process.env.SMTP_PORT) || 465,
            secure: process.env.SMTP_SECURE === 'true',
            auth: {
              user: process.env.SMTP_USER,
              pass: process.env.SMTP_PASS
            }
          });

          await transporter.sendMail({
            from: process.env.SMTP_FROM || 'reports@medical365.com',
            to: targetRecipient,
            subject: `Your Diagnostic Lab Report: ${report.reportNumber} - Medical365`,
            html: `
              <div style="font-family: sans-serif; padding: 20px; color: #1e293b;">
                <h2>Diagnostic Laboratory Report</h2>
                <p>Dear <strong>${report.patientSnapshot?.name || 'Patient'}</strong>,</p>
                <p>Your diagnostic laboratory test results for Report <strong>${report.reportNumber}</strong> are now verified and attached to this email.</p>
                <p>Thank you for choosing Medical365 Diagnostic Services.</p>
              </div>
            `,
            attachments: [{
              filename: `${report.reportNumber}.pdf`,
              content: pdfBuffer,
              contentType: 'application/pdf'
            }]
          });
          deliveryStatus = 'DELIVERED';
        } else {
          // Graceful mock/demo dispatch
          deliveryStatus = 'SENT';
        }
      } catch (err) {
        console.error('Email delivery error:', err);
        deliveryStatus = 'FAILED';
        errorMessage = err.message || 'SMTP delivery failed';
      }
    } else if (method === 'PRINT') {
      report.printCount = (report.printCount || 0) + 1;
      deliveryStatus = 'DELIVERED';
    } else if (method === 'WHATSAPP') {
      deliveryStatus = 'SENT';
    } else {
      // PORTAL or SECURE_LINK
      deliveryStatus = 'DELIVERED';
    }

    // Append to Delivery Audit
    report.deliveryAudit.push({
      deliveryMethod: method,
      recipient: targetRecipient,
      status: deliveryStatus,
      sentAt: new Date(),
      deliveredAt: deliveryStatus === 'DELIVERED' ? new Date() : null,
      error: errorMessage,
      attemptCount: 1,
      performedBy: req.user._id,
      performedByName: req.user.name || 'Staff'
    });

    report.auditHistory.push({
      action: 'DELIVERY_DISPATCHED',
      performedBy: req.user._id,
      performedByName: req.user.name || 'Staff',
      timestamp: new Date(),
      details: { method, recipient: targetRecipient, status: deliveryStatus, error: errorMessage }
    });

    await report.save();

    return res.status(200).json({
      success: deliveryStatus !== 'FAILED',
      message: deliveryStatus === 'FAILED' ? `Delivery failed: ${errorMessage}` : `Report successfully dispatched via ${method}`,
      data: {
        deliveryMethod: method,
        recipient: targetRecipient,
        status: deliveryStatus,
        error: errorMessage
      }
    });
  } catch (err) {
    console.error('Error dispatching report delivery:', err);
    return res.status(500).json({ success: false, message: 'Failed to dispatch report delivery' });
  }
});

// =========================================================================
// 4. REPORT TEMPLATE MANAGEMENT ROUTES
// =========================================================================

/**
 * GET /api/lab/reports/templates/all
 * List all templates for current hospital
 */
router.get('/templates/all', async (req, res) => {
  try {
    let templates = await LabReportTemplate.find({ hospitalId: req.hospitalId }).lean();
    if (!templates || templates.length === 0) {
      // Seed default template
      const defaultTpl = await LabReportTemplate.create({
        hospitalId: req.hospitalId,
        templateName: 'Standard Diagnostic Pathology Template',
        isDefault: true
      });
      templates = [defaultTpl];
    }
    return res.status(200).json({ success: true, data: templates });
  } catch (err) {
    console.error('Error fetching report templates:', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch report templates' });
  }
});

/**
 * POST /api/lab/reports/templates
 * Create a new report template
 */
router.post('/templates', verifyApprovalPermission, async (req, res) => {
  try {
    const {
      templateName,
      isDefault = false,
      hospitalHeader,
      primaryColor,
      accentColor,
      footerText,
      disclaimer,
      signatureConfig
    } = req.body;

    if (!templateName || !templateName.trim()) {
      return res.status(400).json({ success: false, message: 'Template name is required' });
    }

    if (isDefault) {
      await LabReportTemplate.updateMany(
        { hospitalId: req.hospitalId },
        { $set: { isDefault: false } }
      );
    }

    const template = await LabReportTemplate.create({
      hospitalId: req.hospitalId,
      templateName: templateName.trim(),
      isDefault: !!isDefault,
      hospitalHeader: hospitalHeader || {},
      primaryColor: primaryColor || '#0284c7',
      accentColor: accentColor || '#0f172a',
      footerText: footerText || 'This is an electronically validated diagnostic report.',
      disclaimer: disclaimer || 'Clinical correlation is advised.',
      signatureConfig: signatureConfig || {}
    });

    return res.status(201).json({
      success: true,
      message: 'Report template created successfully',
      data: template
    });
  } catch (err) {
    console.error('Error creating report template:', err);
    return res.status(500).json({ success: false, message: 'Failed to create report template' });
  }
});

/**
 * PUT /api/lab/reports/templates/:id
 * Update an existing report template
 */
router.put('/templates/:id', verifyApprovalPermission, async (req, res) => {
  try {
    const template = await LabReportTemplate.findOne({
      _id: req.params.id,
      hospitalId: req.hospitalId
    });

    if (!template) {
      return res.status(404).json({ success: false, message: 'Template not found' });
    }

    const {
      templateName,
      isDefault,
      hospitalHeader,
      primaryColor,
      accentColor,
      footerText,
      disclaimer,
      signatureConfig
    } = req.body;

    if (isDefault) {
      await LabReportTemplate.updateMany(
        { hospitalId: req.hospitalId, _id: { $ne: template._id } },
        { $set: { isDefault: false } }
      );
      template.isDefault = true;
    }

    if (templateName) template.templateName = templateName.trim();
    if (hospitalHeader) template.hospitalHeader = { ...template.hospitalHeader, ...hospitalHeader };
    if (primaryColor) template.primaryColor = primaryColor;
    if (accentColor) template.accentColor = accentColor;
    if (footerText) template.footerText = footerText;
    if (disclaimer) template.disclaimer = disclaimer;
    if (signatureConfig) template.signatureConfig = { ...template.signatureConfig, ...signatureConfig };

    await template.save();

    return res.status(200).json({
      success: true,
      message: 'Report template updated successfully',
      data: template
    });
  } catch (err) {
    console.error('Error updating report template:', err);
    return res.status(500).json({ success: false, message: 'Failed to update report template' });
  }
});

module.exports = router;
