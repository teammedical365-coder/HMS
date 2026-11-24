const mongoose = require('mongoose');

/**
 * LabReport Model — Phase 8 Diagnostic PDF Report Generation & Patient Delivery
 * Extends the existing legacy labReport schema with full clinical reporting capabilities,
 * verified results aggregation, multi-revision amendments, secure token delivery, and delivery audits.
 */

const reportParameterSchema = new mongoose.Schema({
  parameterId: { type: mongoose.Schema.Types.ObjectId, default: null },
  parameterCode: { type: String, default: '', trim: true },
  parameterName: { type: String, required: true, trim: true },
  dataType: { type: String, enum: ['Numeric', 'Text', 'Choice'], default: 'Numeric' },
  enteredValue: { type: String, default: '', trim: true },
  numericValue: { type: Number, default: null },
  unit: { type: String, default: '', trim: true },
  referenceRangeText: { type: String, default: '' },
  referenceRangeSnapshot: {
    minAge: { type: Number, default: 0 },
    maxAge: { type: Number, default: 120 },
    ageUnit: { type: String, default: 'Years' },
    gender: { type: String, default: 'Any' },
    normalMin: { type: Number, default: null },
    normalMax: { type: Number, default: null },
    criticalLow: { type: Number, default: null },
    criticalHigh: { type: Number, default: null },
    unit: { type: String, default: '' },
    interpretationNotes: { type: String, default: '' }
  },
  abnormalFlag: {
    type: String,
    enum: ['NORMAL', 'LOW', 'HIGH', 'ABNORMAL', 'CRITICAL_LOW', 'CRITICAL_HIGH', 'NOT_APPLICABLE', 'RANGE_NOT_CONFIGURED'],
    default: 'NORMAL'
  },
  criticalFlag: { type: Boolean, default: false },
  remarks: { type: String, default: '' },
  displayOrder: { type: Number, default: 1 }
}, { _id: true });

const reportTestSchema = new mongoose.Schema({
  testResultId: { type: mongoose.Schema.Types.ObjectId, ref: 'LabTestResult', default: null },
  testId: { type: mongoose.Schema.Types.ObjectId, ref: 'LabTest', default: null },
  testCode: { type: String, default: '', trim: true },
  testName: { type: String, required: true, trim: true },
  department: { type: String, default: 'General Pathology', trim: true },
  methodology: { type: String, default: '', trim: true },
  sampleId: { type: mongoose.Schema.Types.ObjectId, ref: 'LabSample', default: null },
  barcode: { type: String, default: '' },
  sampleType: { type: String, default: '' },
  collectedAt: { type: Date, default: null },
  receivedAt: { type: Date, default: null },
  verifiedAt: { type: Date, default: null },
  verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  verifiedByName: { type: String, default: '' },
  parameters: [reportParameterSchema],
  hasAbnormalParameters: { type: Boolean, default: false },
  hasCriticalParameters: { type: Boolean, default: false },
  overallRemarks: { type: String, default: '' },
  clinicalNotes: { type: String, default: '' }
}, { _id: true });

const deliveryAuditSchema = new mongoose.Schema({
  deliveryMethod: {
    type: String,
    enum: ['PORTAL', 'SECURE_LINK', 'EMAIL', 'WHATSAPP', 'PRINT'],
    default: 'PORTAL'
  },
  recipient: { type: String, default: '', trim: true }, // Email address, phone number, or 'PATIENT_PORTAL'
  status: {
    type: String,
    enum: ['PENDING', 'SENT', 'DELIVERED', 'FAILED'],
    default: 'PENDING'
  },
  sentAt: { type: Date, default: Date.now },
  deliveredAt: { type: Date, default: null },
  error: { type: String, default: '' },
  attemptCount: { type: Number, default: 1 },
  performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  performedByName: { type: String, default: '' }
}, { _id: true });

const auditHistorySchema = new mongoose.Schema({
  action: { type: String, required: true }, // 'GENERATED', 'SUBMITTED_FOR_REVIEW', 'APPROVED', 'REJECTED', 'RELEASED', 'DOWNLOADED', 'PRINTED', 'AMENDED', 'DELIVERY_DISPATCHED'
  performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  performedByName: { type: String, default: 'System' },
  timestamp: { type: Date, default: Date.now },
  details: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { _id: true });

const labReportSchema = new mongoose.Schema({
  // Hospital / Multi-tenant isolation
  hospitalId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Hospital',
    required: true,
    index: true
  },
  locationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'LabLocation',
    default: null,
    index: true
  },
  locationName: {
    type: String,
    default: ''
  },

  // Lab Order Integration
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'LabOrder',
    default: null,
    index: true
  },
  orderNumber: {
    type: String,
    default: '',
    index: true
  },
  tokenNumber: {
    type: Number,
    default: null
  },

  // Unique Report Identifier (REP-<HOSP_CODE>-<YYYYMMDD>-<4_DIGIT_SEQ>)
  reportNumber: {
    type: String,
    index: true,
    sparse: true
  },
  reportType: {
    type: String,
    enum: ['ROUTINE', 'URGENT', 'STAT', 'CRITICAL', 'CONFIDENTIAL'],
    default: 'ROUTINE',
    index: true
  },
  department: {
    type: String,
    default: 'General Pathology',
    index: true
  },

  // Patient Demographic Snapshot
  patientId: {
    type: String,
    default: ''
  },
  userId: {
    type: mongoose.Schema.Types.Mixed,
    ref: 'User',
    default: null,
    index: true
  },
  patientSnapshot: {
    name: { type: String, default: '', trim: true },
    uhid: { type: String, default: '', trim: true },
    mrn: { type: String, default: '', trim: true },
    phone: { type: String, default: '', trim: true },
    email: { type: String, default: '', trim: true },
    gender: { type: String, default: 'Other' },
    age: { type: Number, default: 0 },
    ageUnit: { type: String, default: 'Years' },
    dob: { type: Date, default: null },
    address: { type: String, default: '' }
  },

  // Referring Doctor Info
  doctorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  referringDoctor: {
    doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    name: { type: String, default: 'Self / Direct' },
    specialty: { type: String, default: '' },
    phone: { type: String, default: '' }
  },

  // Clinical Content
  tests: [reportTestSchema],
  overallInterpretation: {
    type: String,
    default: ''
  },
  clinicalNotes: {
    type: String,
    default: ''
  },
  templateId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'LabReportTemplate',
    default: null
  },

  // Versioning and Amendments
  revisionNumber: {
    type: Number,
    default: 1
  },
  originalReportId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'LabReport',
    default: null,
    index: true
  },
  supersededBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'LabReport',
    default: null
  },
  supersededAt: {
    type: Date,
    default: null
  },
  amendmentReason: {
    type: String,
    default: ''
  },
  amendedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  amendedByName: {
    type: String,
    default: ''
  },
  amendedAt: {
    type: Date,
    default: null
  },

  // Report Lifecycle
  reportStatus: {
    type: String,
    enum: [
      'PENDING',
      'GENERATED',
      'UNDER_REVIEW',
      'APPROVED',
      'RELEASED',
      'REJECTED',
      'AMENDMENT_PENDING',
      'SUPERSEDED',
      'CANCELLED',
      'UPLOADED'
    ],
    default: 'GENERATED',
    index: true
  },
  rejectionReason: {
    type: String,
    default: ''
  },
  rejectedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  rejectedByName: {
    type: String,
    default: ''
  },
  rejectedAt: {
    type: Date,
    default: null
  },
  cancellationReason: {
    type: String,
    default: ''
  },
  cancelledBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  cancelledAt: {
    type: Date,
    default: null
  },

  // Workflow Sign-off Metadata
  generatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  generatedByName: {
    type: String,
    default: ''
  },
  generatedAt: {
    type: Date,
    default: Date.now
  },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  reviewedByName: {
    type: String,
    default: ''
  },
  reviewedAt: {
    type: Date,
    default: null
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  approvedByName: {
    type: String,
    default: ''
  },
  approvedAt: {
    type: Date,
    default: null
  },
  releasedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  releasedByName: {
    type: String,
    default: ''
  },
  releasedAt: {
    type: Date,
    default: null
  },

  // PDF Storage & Metrics
  pdfStorageKey: {
    type: String,
    default: ''
  },
  pdfUrl: {
    type: String,
    default: ''
  },
  downloadCount: {
    type: Number,
    default: 0
  },
  printCount: {
    type: Number,
    default: 0
  },

  // Secure Patient Access Token
  accessTokenHash: {
    type: String,
    default: null,
    index: true
  },
  accessTokenExpiresAt: {
    type: Date,
    default: null
  },

  // Delivery & Audit Tracking
  deliveryAudit: [deliveryAuditSchema],
  auditHistory: [auditHistorySchema],

  // Legacy Schema Compatibility Fields
  appointmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Appointment',
    required: false,
    default: null,
    index: true
  },
  labId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Lab',
    default: null
  },
  testNames: [{
    type: String
  }],
  testStatus: {
    type: String,
    enum: ['PENDING', 'IN_PROGRESS', 'DONE'],
    default: 'PENDING',
    index: true
  },
  paymentStatus: {
    type: String,
    enum: ['PENDING', 'PAID'],
    default: 'PENDING',
    index: true
  },
  splitPayments: [{
    method: { type: String },
    amount: { type: Number, default: 0 }
  }],
  paymentMode: {
    type: String,
    enum: ['CASH', 'ONLINE', 'UPI', 'CARD', 'NONE'],
    default: 'NONE'
  },
  amount: {
    type: Number,
    default: 0
  },
  reportFile: {
    url: String,
    fileId: String,
    name: String,
    uploadedAt: Date
  },
  notes: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});

// Compound Indexes for fast queries
labReportSchema.index({ hospitalId: 1, reportStatus: 1, createdAt: -1 });
labReportSchema.index({ hospitalId: 1, reportNumber: 1 });
labReportSchema.index({ hospitalId: 1, orderId: 1 });
labReportSchema.index({ hospitalId: 1, 'patientSnapshot.phone': 1 });
labReportSchema.index({ hospitalId: 1, 'patientSnapshot.uhid': 1 });
labReportSchema.index({ hospitalId: 1, userId: 1, createdAt: -1 });
labReportSchema.index({ hospitalId: 1, testStatus: 1, createdAt: -1 });
labReportSchema.index({ hospitalId: 1, paymentStatus: 1 });
labReportSchema.index({ userId: 1, createdAt: -1 });
labReportSchema.index({ patientId: 1 });

const LabReport = mongoose.model('LabReport', labReportSchema);

module.exports = LabReport;
