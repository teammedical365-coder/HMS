const mongoose = require('mongoose');

// 1. Reference Range Schema with Age/Gender & Critical Values
const referenceRangeSchema = new mongoose.Schema({
    minAge: {
        type: Number,
        default: 0
    },
    maxAge: {
        type: Number,
        default: 120
    },
    ageUnit: {
        type: String,
        enum: ['Days', 'Months', 'Years'],
        default: 'Years'
    },
    gender: {
        type: String,
        enum: ['Male', 'Female', 'Other', 'Any'],
        default: 'Any'
    },
    normalMin: {
        type: Number,
        default: null
    },
    normalMax: {
        type: Number,
        default: null
    },
    criticalLow: {
        type: Number,
        default: null
    },
    criticalHigh: {
        type: Number,
        default: null
    },
    unit: {
        type: String,
        default: ''
    },
    interpretationNotes: {
        type: String,
        default: ''
    }
}, { _id: true });

// 2. Test Parameter Schema
const testParameterSchema = new mongoose.Schema({
    parameterName: {
        type: String,
        required: true,
        trim: true
    },
    parameterCode: {
        type: String,
        trim: true,
        default: ''
    },
    unit: {
        type: String,
        trim: true,
        default: ''
    },
    dataType: {
        type: String,
        enum: ['Numeric', 'Text', 'Choice'],
        default: 'Numeric'
    },
    decimalPlaces: {
        type: Number,
        default: 0,
        min: 0,
        max: 6
    },
    displayOrder: {
        type: Number,
        default: 1
    },
    isRequired: {
        type: Boolean,
        default: true
    },
    defaultValue: {
        type: String,
        default: ''
    },
    choices: [{
        type: String,
        trim: true
    }],
    referenceRanges: [referenceRangeSchema],
    isActive: {
        type: Boolean,
        default: true
    }
}, { _id: true, timestamps: true });

// 3. Master Test Catalog Schema (Preserves legacy fields & aliases Phase 3 specs)
const labTestSchema = new mongoose.Schema({
    // Primary Name
    name: {
        type: String,
        required: true,
        trim: true,
        index: true
    },
    testName: {
        type: String,
        trim: true
    },
    shortName: {
        type: String,
        trim: true,
        default: ''
    },

    // Multi-tenant Scoping (null = Global standard test, ObjectId = Hospital custom test)
    hospitalId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Hospital',
        default: null,
        index: true
    },

    // Identifiers
    code: {
        type: String,
        trim: true,
        default: '',
        index: true
    },
    testCode: {
        type: String,
        trim: true
    },

    // Classification
    department: {
        type: String,
        trim: true,
        default: 'General Pathology',
        index: true
    },
    category: {
        type: String,
        trim: true,
        default: 'General'
    },
    description: {
        type: String,
        default: ''
    },

    // Specimen & Collection Rules
    specimenType: {
        type: String,
        trim: true,
        default: 'Whole Blood'
    },
    containerType: {
        type: String,
        trim: true,
        default: 'EDTA Tube'
    },
    requiredVolume: {
        type: String,
        default: '2-3 ml'
    },
    fastingRequired: {
        type: Boolean,
        default: false
    },
    fastingInstructions: {
        type: String,
        default: ''
    },
    turnaroundTime: {
        type: Number,
        default: 24 // in hours
    },
    tatUnit: {
        type: String,
        enum: ['Hours', 'hours', 'Days', 'days', 'Minutes', 'minutes', 'h', 'd', 'm'],
        default: 'Hours'
    },

    // Standard Tariff & Pricing
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
    hospitalPrices: {
        type: Map,
        of: Number,
        default: {}
    },

    // Test Parameters & Range Matrix
    parameters: [testParameterSchema],

    // Operational Status
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

// Bidirectional synchronization between legacy and Phase 3 alias fields
labTestSchema.pre('validate', function(next) {
    if (this.testName && !this.name) this.name = this.testName;
    if (this.name && !this.testName) this.testName = this.name;

    if (this.testCode && !this.code) this.code = this.testCode;
    if (this.code && !this.testCode) this.testCode = this.code;

    if (this.isModified('standardPrice') && !this.isModified('price')) {
        this.price = this.standardPrice;
    } else if (this.isModified('price') && !this.isModified('standardPrice')) {
        this.standardPrice = this.price;
    } else {
        if (typeof this.standardPrice === 'number' && (this.price === undefined || this.price === 0)) {
            this.price = this.standardPrice;
        } else if (typeof this.price === 'number' && (this.standardPrice === undefined || this.standardPrice === 0)) {
            this.standardPrice = this.price;
        }
    }

    // Default code if none provided
    if (!this.code && this.name) {
        const slug = this.name.replace(/[^a-zA-Z0-9]/g, '').slice(0, 6).toUpperCase();
        this.code = slug;
        this.testCode = slug;
    }

    next();
});

// Compound multi-tenant indexes
labTestSchema.index({ hospitalId: 1, code: 1 });
labTestSchema.index({ hospitalId: 1, department: 1, isActive: 1 });

const LabTest = mongoose.model('LabTest', labTestSchema);

module.exports = LabTest;
