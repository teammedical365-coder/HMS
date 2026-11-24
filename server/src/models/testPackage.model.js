const mongoose = require('mongoose');

const testPackageSchema = new mongoose.Schema({
    // Primary Identifiers
    name: {
        type: String,
        required: true,
        trim: true
    },
    packageName: {
        type: String,
        trim: true
    },
    code: {
        type: String,
        trim: true,
        default: ''
    },
    packageCode: {
        type: String,
        trim: true
    },

    // Multi-tenant Scoping (null = Global template package, ObjectId = Hospital custom package)
    hospitalId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Hospital',
        default: null,
        index: true
    },

    description: {
        type: String,
        default: ''
    },

    // Array of individual LabTest references
    tests: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'LabTest'
    }],

    // Pricing & Server-Side Savings
    price: {
        type: Number,
        default: 0,
        min: 0
    },
    standardPrice: {
        type: Number,
        default: 0,
        min: 0
    },
    discountedPrice: {
        type: Number,
        default: 0,
        min: 0
    },
    savings: {
        type: Number,
        default: 0
    },

    department: {
        type: String,
        trim: true,
        default: 'Health Packages'
    },
    category: {
        type: String,
        trim: true,
        default: 'General'
    },
    isActive: {
        type: Boolean,
        default: true,
        index: true
    },

    // Audit Info
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

// Pre-save synchronization hook
testPackageSchema.pre('validate', function(next) {
    if (this.packageName && !this.name) this.name = this.packageName;
    if (this.name && !this.packageName) this.packageName = this.name;

    if (this.packageCode && !this.code) this.code = this.packageCode;
    if (this.code && !this.packageCode) this.packageCode = this.code;

    if (typeof this.discountedPrice === 'number' && this.discountedPrice > 0) {
        this.price = this.discountedPrice;
    } else if (typeof this.standardPrice === 'number' && this.standardPrice > 0) {
        this.price = this.standardPrice;
    } else if (typeof this.price === 'number' && this.price > 0 && !this.standardPrice) {
        this.standardPrice = this.price;
    }

    // Compute savings server-side
    const base = Number(this.standardPrice || this.price) || 0;
    const disc = Number(this.discountedPrice) || base;
    this.savings = Math.max(0, base - disc);

    next();
});

testPackageSchema.index({ hospitalId: 1, code: 1 });
testPackageSchema.index({ hospitalId: 1, isActive: 1 });

const TestPackage = mongoose.model('TestPackage', testPackageSchema);

module.exports = TestPackage;
