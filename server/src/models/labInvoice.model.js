const mongoose = require('mongoose');

/**
 * LabInvoice Model — Phase 5 Laboratory Invoicing
 * Secure, immutable billing snapshot tied to Phase 4 LabOrder.
 * Prevents duplicate invoices for the same order and maintains full financial state.
 */
const labInvoiceItemSchema = new mongoose.Schema({
    itemType: {
        type: String,
        enum: ['Test', 'Package'],
        required: true
    },
    testId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'LabTest',
        default: null
    },
    packageId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'TestPackage',
        default: null
    },
    code: {
        type: String,
        required: true
    },
    name: {
        type: String,
        required: true
    },
    quantity: {
        type: Number,
        default: 1,
        min: 1
    },
    unitPrice: {
        type: Number,
        required: true,
        min: 0
    },
    discount: {
        type: Number,
        default: 0,
        min: 0
    },
    amount: {
        type: Number,
        required: true,
        min: 0
    }
}, { _id: true });

const labInvoiceDiscountSchema = new mongoose.Schema({
    type: {
        type: String,
        enum: ['percentage', 'fixed'],
        required: true
    },
    value: {
        type: Number,
        required: true,
        min: 0
    },
    amount: {
        type: Number,
        required: true,
        min: 0
    },
    reason: {
        type: String,
        required: true,
        trim: true
    },
    appliedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    appliedAt: {
        type: Date,
        default: Date.now
    }
}, { _id: true });

const labInvoiceSchema = new mongoose.Schema({
    hospitalId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Hospital',
        required: true,
        index: true
    },
    invoiceNumber: {
        type: String,
        required: true,
        trim: true
    },
    orderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'LabOrder',
        required: true,
        index: true
    },
    orderNumber: {
        type: String,
        required: true,
        trim: true
    },
    patientId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    patientSnapshot: {
        name: { type: String, required: true },
        uhid: { type: String, default: '' },
        mrn: { type: String, default: '' },
        phone: { type: String, required: true },
        gender: { type: String, default: 'Other' },
        age: { type: Number, default: 0 },
        email: { type: String, default: '' },
        address: { type: String, default: '' },
        city: { type: String, default: '' },
        state: { type: String, default: '' },
        pinCode: { type: String, default: '' }
    },
    referringDoctor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'LabDoctor',
        default: null
    },
    referringDoctorName: {
        type: String,
        default: '',
        trim: true
    },
    locationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'LabLocation',
        default: null,
        index: true
    },
    items: [labInvoiceItemSchema],
    discounts: [labInvoiceDiscountSchema],
    pricing: {
        grossAmount: { type: Number, required: true, min: 0 },
        orderDiscount: { type: Number, default: 0, min: 0 },
        invoiceDiscount: { type: Number, default: 0, min: 0 },
        totalDiscount: { type: Number, default: 0, min: 0 },
        tax: { type: Number, default: 0, min: 0 },
        netAmount: { type: Number, required: true, min: 0 },
        paidAmount: { type: Number, default: 0, min: 0 },
        refundedAmount: { type: Number, default: 0, min: 0 },
        dueAmount: { type: Number, default: 0, min: 0 },
        currency: { type: String, default: 'INR' }
    },
    paymentStatus: {
        type: String,
        enum: ['UNPAID', 'PARTIALLY_PAID', 'PAID'],
        default: 'UNPAID',
        index: true
    },
    refundStatus: {
        type: String,
        enum: ['NO_REFUND', 'PARTIALLY_REFUNDED', 'FULLY_REFUNDED'],
        default: 'NO_REFUND',
        index: true
    },
    status: {
        type: String,
        enum: ['ACTIVE', 'CANCELLED'],
        default: 'ACTIVE',
        index: true
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
    notes: {
        type: String,
        default: ''
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    }
}, {
    timestamps: true
});

labInvoiceSchema.index({ hospitalId: 1, invoiceNumber: 1 }, { unique: true });
labInvoiceSchema.index({ hospitalId: 1, orderId: 1 }, { unique: true });
labInvoiceSchema.index({ hospitalId: 1, patientId: 1 });
labInvoiceSchema.index({ hospitalId: 1, paymentStatus: 1 });
labInvoiceSchema.index({ hospitalId: 1, createdAt: -1 });

const LabInvoice = mongoose.model('LabInvoice', labInvoiceSchema);
module.exports = LabInvoice;
