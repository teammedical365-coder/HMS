const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
    appointmentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Appointment',
        required: true,
        index: true
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
        enum: ['Doctor', 'Receptionist', 'Admin', 'Other'],
        default: 'Other'
    },
    uploadedAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Report', reportSchema);
