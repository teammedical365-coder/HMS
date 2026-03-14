const mongoose = require('mongoose');

const testPackageSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    code: {
        type: String,
        trim: true,
        default: ''
    },
    description: {
        type: String,
        default: ''
    },
    tests: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'LabTest'
    }],
    price: {
        type: Number,
        default: 0
    },
    discountedPrice: {
        type: Number,
        default: 0
    },
    category: {
        type: String,
        default: 'General'
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

const TestPackage = mongoose.model('TestPackage', testPackageSchema);

module.exports = TestPackage;
