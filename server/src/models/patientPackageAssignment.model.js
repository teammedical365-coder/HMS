const mongoose = require('mongoose');

/**
 * PatientPackageAssignment — a SNAPSHOT of a package assigned to a specific patient.
 *
 * Key design decisions:
 *   - `snapshotServices` stores a frozen copy of services at assignment time, so
 *     future package edits never affect existing patient packages.
 *   - `usageLog` tracks each service consumption event.
 *   - `status` lifecycle: ACTIVE → COMPLETED | EXPIRED | CANCELLED
 *   - All financial calculations (extra charges) are server-side only.
 *   - Optimistic concurrency via __v prevents double-consumption race conditions.
 */

const snapshotServiceSchema = new mongoose.Schema({
    serviceName: { type: String, required: true },
    serviceCategory: { type: String, default: 'Other' },
    includedQuantity: { type: Number, default: 1 },
    usedQuantity: { type: Number, default: 0 },
    extraChargePerUnit: { type: Number, default: 0 },
    unitPrice: { type: Number, default: 0 },
    notes: { type: String, default: '' }
}, { _id: true });

const usageLogSchema = new mongoose.Schema({
    serviceIndex: { type: Number, required: true }, // Index into snapshotServices
    serviceName: { type: String, required: true },
    quantity: { type: Number, default: 1, min: 1 },
    isExtra: { type: Boolean, default: false },       // Was this beyond the included qty?
    extraAmount: { type: Number, default: 0 },         // Charge for extra usage
    notes: { type: String, default: '' },
    loggedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    loggedByName: { type: String, default: '' },
    loggedAt: { type: Date, default: Date.now },
    // Optional references to the actual billed entities
    appointmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment', default: null },
    labReportId: { type: mongoose.Schema.Types.ObjectId, ref: 'LabReport', default: null },
    pharmacyOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'PharmacyOrder', default: null },
}, { _id: true, timestamps: true });

const patientPackageAssignmentSchema = new mongoose.Schema({
    // ── Tenant Isolation ──────────────────────────────────────────────────────
    hospitalId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Hospital',
        required: true,
        index: true
    },

    // ── Patient ───────────────────────────────────────────────────────────────
    patientId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    patientName: { type: String, default: '' },
    patientMRN: { type: String, default: '' },

    // ── Source Package (reference only; data is snapshotted below) ─────────────
    packageId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'HospitalPackage',
        required: true,
        index: true
    },

    // ── Snapshot Data (frozen at assignment time) ──────────────────────────────
    packageName: { type: String, required: true },
    packageCode: { type: String, default: '' },
    packageCategory: { type: String, default: 'General' },
    snapshotServices: [snapshotServiceSchema],
    snapshotTotalPrice: { type: Number, required: true },
    snapshotDiscountedPrice: { type: Number, default: null },

    // ── Effective Price & Payment ──────────────────────────────────────────────
    effectivePrice: { type: Number, required: true }, // What patient actually pays
    paidAmount: { type: Number, default: 0 },
    paymentStatus: {
        type: String,
        enum: ['UNPAID', 'PARTIALLY_PAID', 'PAID'],
        default: 'UNPAID',
        index: true
    },
    paymentTransactionIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'PaymentTransaction' }],

    // ── Validity ──────────────────────────────────────────────────────────────
    assignedDate: { type: Date, default: Date.now },
    expiryDate: { type: Date, required: true },
    validityDays: { type: Number, required: true },

    // ── Usage Tracking ────────────────────────────────────────────────────────
    usageLog: [usageLogSchema],
    totalExtraCharges: { type: Number, default: 0 },

    // ── Status Lifecycle ──────────────────────────────────────────────────────
    status: {
        type: String,
        enum: ['ACTIVE', 'COMPLETED', 'EXPIRED', 'CANCELLED'],
        default: 'ACTIVE',
        index: true
    },

    // ── Audit Trail ───────────────────────────────────────────────────────────
    assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    assignedByName: { type: String, default: '' },
    completedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    cancellationReason: { type: String, default: '' },
    notes: { type: String, default: '' },
}, {
    timestamps: true,
    optimisticConcurrency: true
});

// ── Indexes ───────────────────────────────────────────────────────────────────
patientPackageAssignmentSchema.index({ hospitalId: 1, patientId: 1, status: 1 });
patientPackageAssignmentSchema.index({ hospitalId: 1, status: 1, createdAt: -1 });
patientPackageAssignmentSchema.index({ hospitalId: 1, packageId: 1 });
patientPackageAssignmentSchema.index({ expiryDate: 1 }); // For expiry cron jobs

const PatientPackageAssignment = mongoose.model('PatientPackageAssignment', patientPackageAssignmentSchema);

module.exports = PatientPackageAssignment;
module.exports.patientPackageAssignmentSchema = patientPackageAssignmentSchema;
module.exports.snapshotServiceSchema = snapshotServiceSchema;
module.exports.usageLogSchema = usageLogSchema;
