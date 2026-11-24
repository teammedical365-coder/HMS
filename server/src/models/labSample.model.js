const mongoose = require('mongoose');

/**
 * LabSample Model — Phase 6 Physical Laboratory Sample & Accessioning Record
 * Derived from Phase 4 Specimen Placeholders with atomic unique Code 128 barcodes.
 */
const labSampleSchema = new mongoose.Schema({
    hospitalId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Hospital',
        required: true,
        index: true
    },
    barcode: {
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
        index: true
    },
    tokenNumber: {
        type: Number,
        default: 1
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
        phone: { type: String, default: '' },
        gender: { type: String, default: 'Other' },
        age: { type: Number, default: 0 }
    },
    specimenPlaceholderId: {
        type: String,
        required: true,
        index: true
    },
    tests: [{
        testId: { type: mongoose.Schema.Types.ObjectId, ref: 'LabTest' },
        testCode: { type: String, required: true },
        testName: { type: String, required: true },
        department: { type: String, default: 'General Pathology' }
    }],
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
    collectedVolume: {
        type: String,
        default: ''
    },
    priority: {
        type: String,
        enum: ['Routine', 'Urgent', 'STAT'],
        default: 'Routine',
        index: true
    },
    collectionType: {
        type: String,
        enum: ['Walk-in', 'Home Collection', 'Collection Centre'],
        default: 'Walk-in'
    },
    status: {
        type: String,
        enum: [
            'PENDING_COLLECTION',
            'BARCODE_GENERATED',
            'COLLECTED',
            'ACCESSION_PENDING',
            'ACCEPTED',
            'REJECTED',
            'RECOLLECTION_REQUESTED',
            'RECOLLECTION_PENDING',
            'DISPATCHED',
            'IN_TRANSIT',
            'RECEIVED_AT_PROCESSING_LAB',
            'PROCESSING_PENDING',
            'PROCESSING',
            'PROCESSING_COMPLETED',
            'ON_HOLD',
            'CANCELLED'
        ],
        default: 'PENDING_COLLECTION',
        index: true
    },
    collectionLocationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'LabLocation',
        default: null,
        index: true
    },
    processingLocationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'LabLocation',
        default: null,
        index: true
    },
    currentLocationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'LabLocation',
        default: null,
        index: true
    },
    collectedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    collectedByName: {
        type: String,
        default: ''
    },
    collectedAt: {
        type: Date,
        default: null
    },
    collectionNotes: {
        type: String,
        default: ''
    },
    accessionedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    accessionedByName: {
        type: String,
        default: ''
    },
    accessionedAt: {
        type: Date,
        default: null
    },
    accessionNotes: {
        type: String,
        default: ''
    },
    sampleCondition: {
        type: String,
        enum: ['Normal', 'Hemolyzed', 'Lipemic', 'Icteric', 'Clotted', 'Insufficient Volume', 'Leaking Container', 'Other'],
        default: 'Normal'
    },
    rejection: {
        isRejected: { type: Boolean, default: false },
        reason: { type: String, default: '' },
        rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        rejectedAt: { type: Date, default: null },
        notes: { type: String, default: '' }
    },
    recollection: {
        isRecollection: { type: Boolean, default: false },
        originalSampleId: { type: mongoose.Schema.Types.ObjectId, ref: 'LabSample', default: null },
        originalBarcode: { type: String, default: '' },
        recollectionRequestId: { type: mongoose.Schema.Types.ObjectId, ref: 'LabRecollectionRequest', default: null }
    },
    processing: {
        startedAt: { type: Date, default: null },
        startedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        completedAt: { type: Date, default: null },
        completedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        holdReason: { type: String, default: '' },
        notes: { type: String, default: '' },
        analyzerReference: { type: String, default: '' }
    },
    labelPrintCount: {
        type: Number,
        default: 0
    },
    lastPrintedAt: {
        type: Date,
        default: null
    },
    lastPrintedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    }
}, {
    timestamps: true
});

labSampleSchema.index({ hospitalId: 1, barcode: 1 }, { unique: true });
labSampleSchema.index({ hospitalId: 1, status: 1 });
labSampleSchema.index({ hospitalId: 1, orderId: 1 });
labSampleSchema.index({ hospitalId: 1, patientId: 1 });
labSampleSchema.index({ hospitalId: 1, createdAt: -1 });

const LabSample = mongoose.model('LabSample', labSampleSchema);
module.exports = LabSample;
