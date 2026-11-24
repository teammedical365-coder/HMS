const mongoose = require('mongoose');

/**
 * LabReportTemplate Model — Phase 8 White-label Diagnostic Report Branding & Layout
 */

const labReportTemplateSchema = new mongoose.Schema({
  hospitalId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Hospital',
    required: true,
    index: true
  },
  templateName: {
    type: String,
    required: true,
    default: 'Standard Diagnostic Pathology Template',
    trim: true
  },
  isDefault: {
    type: Boolean,
    default: true
  },
  logoUrl: {
    type: String,
    default: ''
  },
  hospitalHeader: {
    name: { type: String, default: 'Medical365 Diagnostic Centre' },
    tagline: { type: String, default: 'Excellence in Healthcare & Clinical Pathology' },
    address: { type: String, default: '100 Medical Boulevard, Healthcare City' },
    phone: { type: String, default: '+91 98765 43210' },
    email: { type: String, default: 'lab@medical365.com' },
    website: { type: String, default: 'www.medical365.com' },
    accreditationText: { type: String, default: 'NABL (ISO 15189:2022) & CAP Certified Reference Laboratory' }
  },
  primaryColor: {
    type: String,
    default: '#0284c7' // Tailwind Sky-600
  },
  accentColor: {
    type: String,
    default: '#0f172a' // Slate-900
  },
  footerText: {
    type: String,
    default: 'This is an electronically validated diagnostic report and does not require physical stamp or signature.'
  },
  disclaimer: {
    type: String,
    default: 'Clinical correlation is advised. Partial reproduction of this report is strictly prohibited without written consent.'
  },
  signatureConfig: {
    showPathologistSignature: { type: Boolean, default: true },
    signatoryName: { type: String, default: 'Dr. Sarah Jenkins, MD, FRCPath' },
    signatoryDesignation: { type: String, default: 'Chief Pathologist & Laboratory Director' },
    signatoryRegistration: { type: String, default: 'MCI-REG-847291' },
    signatureImageUrl: { type: String, default: '' }
  },
  showMethod: {
    type: Boolean,
    default: true
  },
  showQR: {
    type: Boolean,
    default: true
  },
  pageLayout: {
    pageSize: {
      type: String,
      enum: ['A4', 'LETTER'],
      default: 'A4'
    },
    margins: {
      top: { type: Number, default: 36 },
      bottom: { type: Number, default: 36 },
      left: { type: Number, default: 36 },
      right: { type: Number, default: 36 }
    }
  }
}, {
  timestamps: true
});

labReportTemplateSchema.index({ hospitalId: 1, isDefault: 1 });

const LabReportTemplate = mongoose.model('LabReportTemplate', labReportTemplateSchema);

module.exports = LabReportTemplate;
