const mongoose = require('mongoose');

const storageLocationSchema = new mongoose.Schema({
    room: { type: String, trim: true, default: '' },
    storageUnit: { type: String, trim: true, default: '' },
    rack: { type: String, trim: true, default: '' },
    box: { type: String, trim: true, default: '' },
    position: { type: String, trim: true, default: '' }
}, { _id: false });

const vialMovementSchema = new mongoose.Schema({
    action: {
        type: String,
        required: true,
        enum: ['Created', 'Received', 'Stored', 'Moved', 'Retrieved', 'Returned', 'Updated', 'Discarded']
    },
    timestamp: {
        type: Date,
        default: Date.now
    },
    performedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    performedByName: {
        type: String,
        default: 'Hospital Admin'
    },
    previousStatus: {
        type: String,
        default: null
    },
    newStatus: {
        type: String,
        default: null
    },
    previousLocation: {
        type: storageLocationSchema,
        default: () => ({})
    },
    newLocation: {
        type: storageLocationSchema,
        default: () => ({})
    },
    reason: {
        type: String,
        default: ''
    },
    notes: {
        type: String,
        default: ''
    }
}, { _id: true });

const vialSchema = new mongoose.Schema({
    // User-facing unique vial identifier (e.g. VL-000001)
    vialId: {
        type: String,
        required: [true, 'Vial ID is required'],
        trim: true
    },
    // Multi-tenant hospital isolation
    hospitalId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Hospital',
        required: [true, 'Hospital reference is required'],
        index: true
    },
    // Mandatory relationship: Patient collection reference
    patientId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'Patient reference is required'],
        index: true
    },
    // Configurable/extensible vial type
    vialType: {
        type: String,
        required: [true, 'Vial Type is required'],
        enum: [
            'Biological Sample',
            'Specimen',
            'Laboratory Sample',
            'Medication',
            'Reagent',
            'Cryogenic Sample',
            'Other'
        ],
        default: 'Biological Sample'
    },
    description: {
        type: String,
        trim: true,
        default: ''
    },
    receivedAt: {
        type: Date,
        default: Date.now
    },
    // Controlled lifecycle status
    currentStatus: {
        type: String,
        required: true,
        enum: ['Received', 'Stored', 'Moved', 'Retrieved', 'Returned', 'Discarded'],
        default: 'Received',
        index: true
    },
    // Hierarchical location: Room -> Storage Unit -> Rack -> Box -> Position
    currentLocation: {
        type: storageLocationSchema,
        default: () => ({})
    },
    notes: {
        type: String,
        default: ''
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    // Append-only audit & movement history trail
    auditHistory: [vialMovementSchema]
}, {
    timestamps: true
});

// Enforce unique vialId per hospital
vialSchema.index({ hospitalId: 1, vialId: 1 }, { unique: true });
// Compound index for fast patient-specific vial queries within hospital
vialSchema.index({ hospitalId: 1, patientId: 1, createdAt: -1 });
// Compound index for status-filtered queries
vialSchema.index({ hospitalId: 1, currentStatus: 1 });
// Compound index for date-range queries
vialSchema.index({ hospitalId: 1, receivedAt: -1 });

module.exports = mongoose.model('Vial', vialSchema);
module.exports.vialSchema = vialSchema;
