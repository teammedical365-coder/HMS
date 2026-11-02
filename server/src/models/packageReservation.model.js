const mongoose = require('mongoose');

/**
 * packageReservation.model.js
 * 
 * Medical365 Multi-Tenant Database Hardening:
 * Dedicated reservation collection that arbitrates concurrent package-ID claims.
 * 
 * Uses the candidate Android packageId as the MongoDB document `_id`.
 * Because MongoDB automatically enforces a unique primary key index on `_id` across
 * all collections and versions, atomic `_id` insertion eliminates race conditions
 * (TOCTOU) even before any custom unique index exists on the Hospital collection.
 */
const packageReservationSchema = new mongoose.Schema({
    _id: {
        type: String,
        required: true,
        trim: true,
        match: /^com\.medical365\.[a-z][a-z0-9_]*$/
    },
    hospitalId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Hospital',
        required: true
    },
    status: {
        type: String,
        enum: ['RESERVED', 'COMMITTED', 'RELEASED'],
        default: 'RESERVED'
    },
    disambiguated: {
        type: Boolean,
        default: false
    },
    reservedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true,
    collection: 'package_reservations'
});

module.exports = mongoose.models.PackageReservation || mongoose.model('PackageReservation', packageReservationSchema);
