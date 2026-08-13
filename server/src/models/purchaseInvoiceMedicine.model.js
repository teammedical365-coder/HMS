const mongoose = require('mongoose');

const purchaseInvoiceMedicineSchema = new mongoose.Schema({
  invoiceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PurchaseInvoice',
    required: true,
    index: true
  },
  medicineName: {
    type: String,
    required: true
  },
  batch: {
    type: String,
    default: ''
  },
  expiry: {
    type: Date,
    default: null
  },
  purchaseQty: {
    type: Number,
    default: 0
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
    default: 0
  },
  mrp: {
    type: Number,
    default: 0
  },
  gst: {
    type: Number,
    default: 0
  },
  discount: {
    type: Number,
    default: 0
  },
  amount: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    default: 'Pending'
  }
}, {
  timestamps: true
});

const PurchaseInvoiceMedicine = mongoose.model('PurchaseInvoiceMedicine', purchaseInvoiceMedicineSchema);

module.exports = PurchaseInvoiceMedicine;
