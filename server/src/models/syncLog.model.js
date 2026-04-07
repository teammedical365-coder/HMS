const mongoose = require('mongoose');

/**
 * SyncLog — tracks every sync push from a local clinic server to cloud.
 * Stored on the CLOUD database only.
 * Lets superadmin see: which clinics are online, when they last synced, any errors.
 */
const syncLogSchema = new mongoose.Schema({
    clinicId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', required: true, index: true },

    // What was synced
    type: {
        type: String,
        enum: ['stats', 'prescription', 'bill', 'heartbeat'],
        required: true,
    },

    // Stats payload (for type=stats)
    stats: {
        newPatients:       { type: Number, default: 0 },
        totalPatients:     { type: Number, default: 0 },
        totalAppointments: { type: Number, default: 0 },
        totalRevenue:      { type: Number, default: 0 },
        month:             { type: Number },
        year:              { type: Number },
    },

    // Local server version sending the sync
    serverVersion: { type: String, default: '' },

    // Result
    success:      { type: Boolean, default: true },
    errorMessage: { type: String, default: '' },

    // Tunnel status at time of sync
    tunnelConnected: { type: Boolean, default: false },
}, { timestamps: true });

syncLogSchema.index({ clinicId: 1, createdAt: -1 });

module.exports = mongoose.model('SyncLog', syncLogSchema);
