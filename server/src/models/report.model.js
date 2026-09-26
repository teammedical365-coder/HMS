const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
    appointmentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Appointment',
        required: false,
        index: true
    },
    patientId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        index: true
    },
    category: {
        type: String,
        default: 'LAB_REPORT'
    },
    notes: {
        type: String,
        default: ''
    },
    fileName: {
        type: String,
        required: true
    },
    url: {
        type: String,
        required: true
    },
    fileId: {
        type: String,
        required: true
    },
    mimeType: String,
    size: Number,
    uploadedByRole: {
        type: String,
        enum: ['Doctor', 'Nurse', 'Receptionist', 'Admin', 'Staff', 'Patient', 'Other'],
        default: 'Other'
    },
    hospitalId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Hospital',
        index: true
    },
    uploadedAt: {
        type: Date,
        default: Date.now
    },
    extractedText: {
        type: String,
        default: ''
    }
});

module.exports = mongoose.model('Report', reportSchema);
