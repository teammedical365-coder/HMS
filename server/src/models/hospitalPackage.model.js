const mongoose = require('mongoose');

/**
 * HospitalPackage — defines a hospital-level service package (e.g., "Maternity Gold", "Surgery Basic").
 *
 * Created & managed ONLY by Hospital Admin.
 * Packages bundle multiple hospital services at a fixed or discounted total price.
 * Only ACTIVE packages can be assigned to new patients.
 * Packages with patient assignments are NEVER hard-deleted — only soft-deactivated.
 */

const packageServiceSchema = new mongoose.Schema({
    serviceName: { type: String, required: true, trim: true },
    serviceCategory: {
        type: String,
        enum: ['Consultation', 'Lab', 'Pharmacy', 'Facility', 'Surgery', 'Procedure', 'Nursing', 'Other'],
        default: 'Other'
    },
    // How many times this service is included (e.g., 3 consultations, 5 lab tests)
    // -1 means unlimited
    includedQuantity: { type: Number, default: 1, min: -1 },
    // Unit price for "extra" usage beyond includedQuantity
    extraChargePerUnit: { type: Number, default: 0, min: 0 },
    // The price this service contributes to the package total (informational)
    unitPrice: { type: Number, default: 0, min: 0 },
    notes: { type: String, default: '', trim: true }
}, { _id: true });

const hospitalPackageSchema = new mongoose.Schema({
    // ── Tenant Isolation ──────────────────────────────────────────────────────
    hospitalId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Hospital',
        required: true,
        index: true
    },

    // ── Package Identity ──────────────────────────────────────────────────────
    name: {
        type: String,
        required: [true, 'Package name is required'],
        trim: true
    },
    code: {
        type: String,
        trim: true,
        uppercase: true,
        default: ''
    },
    description: { type: String, default: '', trim: true },
    category: {
        type: String,
        enum: ['General', 'Maternity', 'Surgery', 'Wellness', 'Dialysis', 'Physiotherapy', 'Dental', 'Eye', 'Cardiology', 'Other'],
        default: 'General'
    },

    // ── Included Services ─────────────────────────────────────────────────────
    services: [packageServiceSchema],

    // ── Pricing ───────────────────────────────────────────────────────────────
    totalPrice: {
        type: Number,
        required: [true, 'Package total price is required'],
        min: [0, 'Price cannot be negative']
    },
    discountedPrice: {
        type: Number,
        default: null,
        min: [0, 'Discounted price cannot be negative']
    },

    // ── Validity ──────────────────────────────────────────────────────────────
    validityDays: {
        type: Number,
        default: 365,
        min: [1, 'Validity must be at least 1 day']
    },

    // ── Status ────────────────────────────────────────────────────────────────
    isActive: {
        type: Boolean,
        default: true,
        index: true
    },

    // ── Audit ─────────────────────────────────────────────────────────────────
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    // ── Stats (denormalized for admin dashboard) ──────────────────────────────
    totalAssignments: { type: Number, default: 0 },
}, {
    timestamps: true
});

// ── Indexes ───────────────────────────────────────────────────────────────────
hospitalPackageSchema.index({ hospitalId: 1, isActive: 1 });
hospitalPackageSchema.index({ hospitalId: 1, code: 1 }, { unique: true, sparse: true });
hospitalPackageSchema.index({ hospitalId: 1, category: 1 });

// ── Export schema separately for tenant model factory ─────────────────────────
const HospitalPackage = mongoose.model('HospitalPackage', hospitalPackageSchema);

module.exports = HospitalPackage;
module.exports.hospitalPackageSchema = hospitalPackageSchema;
module.exports.packageServiceSchema = packageServiceSchema;
