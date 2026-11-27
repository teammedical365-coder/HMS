const mongoose = require('mongoose');

const purchaseInvoiceSchema = new mongoose.Schema({
  hospitalId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Hospital',
    index: true,
    default: null
  },
  pharmacyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true,
    default: null
  },
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    default: null
  },
  invoiceNumber: {
    type: String,
    default: '',
    trim: true
  },
  vendorName: {
    type: String,
    default: '',
    trim: true
  },
  vendorGST: {
    type: String,
    default: '',
    trim: true
  },
  vendorAddress: {
    type: String,
    default: '',
    trim: true
  },
  vendorDL: {
    type: String,
    default: '',
    trim: true
  },
  vendorPhone: {
    type: String,
    default: '',
    trim: true
  },
  orderRef: {
    type: String,
    default: '',
    trim: true
  },
  invoiceDate: {
    type: Date,
    default: null
  },
  dueDate: {
    type: Date,
    default: null
  },
  uploadDate: {
    type: Date,
    default: Date.now
  },
  uploadTime: {
    type: String,
    default: ''
  },
  uploadedBy: {
    name: { type: String, default: '' },
    email: { type: String, default: '' },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
  },
  uploadedPDF: {
    originalName: { type: String, default: '' },
    generatedName: { type: String, default: '' },
    storagePath: { type: String, default: '' },
    size: { type: Number, default: 0 },
    fileHash: { type: String, default: '' }
  },
  status: {
    type: String,
    enum: ['Pending', 'Completed', 'Partially Imported', 'Cancelled'],
    default: 'Pending'
  },
  totalMedicines: {
    type: Number,
    default: 0
  },
  importedMedicines: {
    type: Number,
    default: 0
  },
  skippedMedicines: {
    type: Number,
    default: 0
  },
  failedMedicines: {
    type: Number,
    default: 0
  },
  remainingMedicines: {
    type: Number,
    default: 0
  },
  purchaseQty: {
    type: Number,
    default: 0
  },
  freeQty: {
    type: Number,
    default: 0
  },
  taxableAmount: {
    type: Number,
    default: 0
  },
  discountAmount: {
    type: Number,
    default: 0
  },
  cgst: {
    type: Number,
    default: 0
  },
  sgst: {
    type: Number,
    default: 0
  },
  igst: {
    type: Number,
    default: 0
  },
  grandTotal: {
    type: Number,
    default: 0
  },
  isRevisedDuplicate: {
    type: Boolean,
    default: false
  },
  extractionMeta: {
    method: { type: String, default: 'native_coordinates' },
    pageCount: { type: Number, default: 1 },
    ocrUsed: { type: Boolean, default: false },
    ocrNotice: { type: String, default: '' },
    overallConfidence: { type: Number, default: 0 },
    detectedHeaders: { type: [String], default: [] },
    columnMappings: { type: mongoose.Schema.Types.Mixed, default: {} },
    lineSumAmount: { type: Number, default: 0 },
    mathMismatch: { type: Boolean, default: false },
    warnings: { type: [String], default: [] }
  },
  remarks: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});

purchaseInvoiceSchema.index({ hospitalId: 1, vendorName: 1, invoiceNumber: 1 });
purchaseInvoiceSchema.index({ hospitalId: 1, createdAt: -1 });
purchaseInvoiceSchema.index({ hospitalId: 1, 'uploadedPDF.fileHash': 1 });

const PurchaseInvoice = mongoose.model('PurchaseInvoice', purchaseInvoiceSchema);

module.exports = PurchaseInvoice;
