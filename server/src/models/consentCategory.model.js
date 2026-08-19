const mongoose = require('mongoose');

const consentCategorySchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
        unique: true
    },
    description: {
        type: String,
        default: ''
    },
    isActive: {
        type: Boolean,
        default: true
    },
    sortOrder: {
        type: Number,
        default: 0
    }
}, { timestamps: true });

module.exports = mongoose.model('ConsentCategory', consentCategorySchema);
