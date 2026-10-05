const mongoose = require('mongoose');

/**
 * SyncEvent Model — Cloud-side log of changes for Cloud -> Local Synchronization (Phase 2).
 * Records every CREATE, UPDATE, DELETE operation on the 7 syncable entities:
 * 1. Hospital (Configuration/Profile)
 * 2. Department
 * 3. Doctor
 * 4. Service
 * 5. Bed
 * 6. Medicine (Master/Inventory)
 * 7. Patient (User with role 'patient')
 */
const syncEventSchema = new mongoose.Schema({
    eventId: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        index: true
    },
    hospitalId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Hospital',
        required: true,
        index: true
    },
    entityType: {
        type: String,
        required: true,
        enum: ['Hospital', 'Department', 'Doctor', 'Service', 'Bed', 'Medicine', 'Patient'],
        index: true
    },
    entityId: {
        type: String,
        required: true,
        index: true
    },
    operation: {
        type: String,
        required: true,
        enum: ['CREATE', 'UPDATE', 'DELETE'],
        index: true
    },
    version: {
        type: Number,
        required: true,
        default: () => Date.now(),
        index: true
    },
    payload: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    isInitialSync: {
        type: Boolean,
        default: false
    },
    status: {
        type: String,
        enum: ['PENDING', 'SYNCED', 'FAILED'],
        default: 'PENDING',
        index: true
    },
    // Multi-installation delivery tracking
    installations: [{
        installationId: { type: String, required: true, index: true },
        status: { type: String, enum: ['PENDING', 'ACKNOWLEDGED', 'FAILED'], default: 'PENDING' },
        acknowledgedAt: { type: Date, default: null },
        retryCount: { type: Number, default: 0 },
        errorMessage: { type: String, default: null }
    }]
}, { timestamps: true });

// Compound indexes for high-speed cursor queries and tenant isolation
syncEventSchema.index({ hospitalId: 1, version: 1 });
syncEventSchema.index({ hospitalId: 1, 'installations.installationId': 1, 'installations.status': 1 });
syncEventSchema.index({ hospitalId: 1, entityType: 1, entityId: 1 });

module.exports = mongoose.model('SyncEvent', syncEventSchema);
