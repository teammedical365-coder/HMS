const mongoose = require('mongoose');

const consentTemplateSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    categoryId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ConsentCategory',
        required: true
    },
    description: {
        type: String,
        default: ''
    },
    originalFileName: {
        type: String,
        required: true
    },
    storedFilePath: {
        type: String,
        required: true
    },
    fileSize: {
        type: Number,
        default: 0
    },
    mimeType: {
        type: String,
        default: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    },
    isActive: {
        type: Boolean,
        default: true
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    version: {
        type: Number,
        default: 1
    },
    placeholders: {
        type: [String],
        default: ['patient_name', 'age', 'gender', 'address', 'doctor_name', 'hospital_name', 'today', 'current_time']
    }
}, { timestamps: true });

// Indexes for faster querying and text search
consentTemplateSchema.index({ categoryId: 1 });
consentTemplateSchema.index({ isActive: 1 });
consentTemplateSchema.index({ name: 'text' });

module.exports = mongoose.model('ConsentTemplate', consentTemplateSchema);
