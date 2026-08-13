const mongoose = require('mongoose');

const purchaseInvoiceSchema = new mongoose.Schema({
  invoiceNumber: {
    type: String,
    default: ''
  },
  vendorName: {
    type: String,
    default: ''
  },
  vendorGST: {
    type: String,
    default: ''
  },
  vendorAddress: {
    type: String,
    default: ''
  },
  vendorDL: {
    type: String,
    default: ''
  },
  invoiceDate: {
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
    size: { type: Number, default: 0 }
  },
  status: {
    type: String,
    enum: ['Pending', 'Completed', 'Cancelled'],
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
  remarks: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});

const PurchaseInvoice = mongoose.model('PurchaseInvoice', purchaseInvoiceSchema);

module.exports = PurchaseInvoice;
