const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', index: true },
    recipientRole: { type: String, required: true }, // e.g., 'lab', 'pharmacy', 'doctor'
    recipientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Optional, if directed to specific user
    message: { type: String, required: true },
    status: { type: String, enum: ['Unread', 'Read'], default: 'Unread' },
    referenceType: { type: String, required: true }, // e.g., 'ClinicalVisit', 'PharmacyOrder', 'LabReport'
    referenceId: { type: mongoose.Schema.Types.ObjectId, required: true },
    patientId: { type: String, required: true } // Displayed to know which patient
}, { timestamps: true });

module.exports = mongoose.model('Notification', notificationSchema);
