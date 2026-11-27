const mongoose = require('mongoose');

const purchaseInvoiceMedicineSchema = new mongoose.Schema({
  hospitalId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Hospital',
    index: true,
    default: null
  },
  invoiceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PurchaseInvoice',
    required: true,
    index: true
  },
  rowNumber: {
    type: Number,
    default: 1
  },
  medicineName: {
    type: String,
    required: true,
    trim: true
  },
  rawMedicineName: {
    type: String,
    default: '',
    trim: true
  },
  salt: {
    type: String,
    default: '',
    trim: true
  },
  category: {
    type: String,
    default: '',
    trim: true
  },
  manufacturer: {
    type: String,
    default: '',
    trim: true
  },
  packSize: {
    type: String,
    default: '',
    trim: true
  },
  unit: {
    type: String,
    default: 'Tablets'
  },
  unitsPerStrip: {
    type: Number,
    default: 1
  },
  hsnCode: {
    type: String,
    default: '',
    trim: true
  },
  batch: {
    type: String,
    default: '',
    trim: true
  },
  expiryRaw: {
    type: String,
    default: ''
  },
  expiry: {
    type: Date,
    default: null
  },
  mfgDate: {
    type: Date,
    default: null
  },
  purchaseQty: {
    type: Number,
    default: null
  },
  freeQty: {
    type: Number,
    default: 0
  },
  totalQty: {
    type: Number,
    default: 0
  },
  purchaseRate: {
    type: Number,
    default: null
  },
  mrp: {
    type: Number,
    default: null
  },
  gst: {
    type: Number,
    default: null
  },
  cgst: {
    type: Number,
    default: null
  },
  sgst: {
    type: Number,
    default: null
  },
  igst: {
    type: Number,
    default: null
  },
  discount: {
    type: Number,
    default: null
  },
  discountType: {
    type: String,
    enum: ['Percentage', 'Flat Amount'],
    default: 'Percentage'
  },
  amount: {
    type: Number,
    default: null
  },
  confidence: {
    type: Number,
    default: 0
  },
  fieldConfidence: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  warnings: {
    type: [String],
    default: []
  },
  originalExtracted: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  matchedInventoryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Inventory',
    default: null
  },
  importAction: {
    type: String,
    enum: ['create_new', 'link_existing', 'skip'],
    default: 'create_new'
  },
  inventoryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Inventory',
    default: null
  },
  status: {
    type: String,
    enum: ['Pending', 'Imported', 'Skipped', 'Failed'],
    default: 'Pending'
  },
  errorMessage: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});

const PurchaseInvoiceMedicine = mongoose.model('PurchaseInvoiceMedicine', purchaseInvoiceMedicineSchema);

module.exports = PurchaseInvoiceMedicine;
