const mongoose = require('mongoose');

/**
 * LabOrder Model — Phase 4 Laboratory Requisition & Reception Order
 * Holds immutable snapshots of tests, packages, server-calculated prices,
 * specimen-wise sample placeholders, and audit records.
 */
const samplePlaceholderSchema = new mongoose.Schema({
    samplePlaceholderId: {
        type: String,
        required: true
    },
    specimenType: {
        type: String,
        required: true,
        trim: true
    },
    containerType: {
        type: String,
        required: true,
        trim: true
    },
    requiredVolume: {
        type: String,
        default: '2-3 mL'
    },
    testCodes: [{
        type: String,
        trim: true
    }],
    testNames: [{
        type: String,
        trim: true
    }],
    status: {
        type: String,
        enum: ['Pending Collection', 'Recollection Requested', 'Cancelled'],
        default: 'Pending Collection'
    },
    recollectionReason: {
        type: String,
        default: ''
    },
    recollectionRequestedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    recollectionRequestedAt: {
        type: Date,
        default: null
    }
}, { _id: true });

const labOrderSchema = new mongoose.Schema({
    hospitalId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Hospital',
        required: true,
        index: true
    },
    orderNumber: {
        type: String,
        required: true,
        trim: true
    },
    tokenNumber: {
        type: Number,
        required: true,
        index: true
    },
    patient: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    // Immutable patient demographic snapshot at time of booking
    patientSnapshot: {
        name: { type: String, required: true },
        uhid: { type: String, default: '' },
        mrn: { type: String, default: '' },
        phone: { type: String, required: true },
        gender: { type: String, default: 'Other' },
        age: { type: Number, default: 0 },
        dob: { type: Date, default: null },
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
    priority: {
        type: String,
        enum: ['Routine', 'Urgent', 'STAT'],
        default: 'Routine'
    },
    collectionType: {
        type: String,
        enum: ['Walk-in', 'Home Collection', 'Collection Centre'],
        default: 'Walk-in'
    },
    locationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'LabLocation',
        default: null,
        index: true
    },
    // Selected individual tests with immutable price snapshots
    tests: [{
        testId: { type: mongoose.Schema.Types.ObjectId, ref: 'LabTest', required: true },
        testCode: { type: String, required: true },
        testName: { type: String, required: true },
        department: { type: String, default: 'General Pathology' },
        specimenType: { type: String, default: 'Whole Blood' },
        containerType: { type: String, default: 'EDTA Tube' },
        requiredVolume: { type: String, default: '2-3 mL' },
        fastingRequired: { type: Boolean, default: false },
        fastingInstructions: { type: String, default: '' },
        turnaroundTime: { type: Number, default: 24 },
        tatUnit: { type: String, default: 'Hours' },
        standardPrice: { type: Number, required: true, min: 0 },
        price: { type: Number, required: true, min: 0 }
    }],
    // Selected test packages/profiles with immutable snapshots
    packages: [{
        packageId: { type: mongoose.Schema.Types.ObjectId, ref: 'TestPackage', required: true },
        packageCode: { type: String, required: true },
        packageName: { type: String, required: true },
        tests: [{ type: mongoose.Schema.Types.ObjectId, ref: 'LabTest' }],
        standardPrice: { type: Number, required: true, min: 0 },
        discountedPrice: { type: Number, required: true, min: 0 },
        savings: { type: Number, default: 0 }
    }],
    // Specimen-wise sample placeholders (derived from unique specimenType + containerType)
    samplePlaceholders: [samplePlaceholderSchema],
    // Uploaded prescriptions
    prescriptions: [{
        fileId: { type: String, default: '' },
        fileName: { type: String, required: true },
        fileUrl: { type: String, required: true },
        mimeType: { type: String, default: 'application/pdf' },
        size: { type: Number, default: 0 },
        uploadedAt: { type: Date, default: Date.now },
        uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
    }],
    // Server-enforced pricing breakdown
    pricing: {
        totalStandardPrice: { type: Number, default: 0, min: 0 },
        totalDiscount: { type: Number, default: 0, min: 0 },
        netAmount: { type: Number, default: 0, min: 0 },
        currency: { type: String, default: 'INR' }
    },
    status: {
        type: String,
        enum: ['Confirmed', 'In Progress', 'Completed', 'Cancelled'],
        default: 'Confirmed',
        index: true
    },
    // Cancellation state & audit
    cancellation: {
        isCancelled: { type: Boolean, default: false },
        cancelledAt: { type: Date, default: null },
        cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        reason: { type: String, default: '' }
    },
    // Recollection tracking
    recollectionRequests: [{
        samplePlaceholderId: { type: String, required: true },
        specimenType: { type: String, required: true },
        containerType: { type: String, required: true },
        reason: { type: String, required: true },
        requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        requestedAt: { type: Date, default: Date.now },
        status: { type: String, enum: ['Pending', 'Acknowledged', 'Processed'], default: 'Pending' },
        acknowledgedAt: { type: Date, default: null },
        acknowledgedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
    }],
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

labOrderSchema.index({ hospitalId: 1, orderNumber: 1 }, { unique: true });
labOrderSchema.index({ hospitalId: 1, createdAt: -1 });
labOrderSchema.index({ hospitalId: 1, 'patientSnapshot.phone': 1 });
labOrderSchema.index({ hospitalId: 1, 'patientSnapshot.uhid': 1 });

const LabOrder = mongoose.model('LabOrder', labOrderSchema);

module.exports = LabOrder;
