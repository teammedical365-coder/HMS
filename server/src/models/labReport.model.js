const mongoose = require('mongoose');

const labReportSchema = new mongoose.Schema({
  appointmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Appointment',
    required: true,
    index: true
  },
  patientId: {
    type: String, // Persistent ID like P-101
    required: true
  },
  userId: { // Patient's User ObjectId
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  doctorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User', // Linking to the Doctor's User ID for notifications/queries
    required: true
  },
  labId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Lab' // Optional: If you want to assign to a specific lab later
  },
  testNames: [{
    type: String,
    required: true
  }],
  testStatus: {
    type: String,
    enum: ['PENDING', 'IN_PROGRESS', 'DONE'],
    default: 'PENDING',
    index: true
  },
  reportStatus: {
    type: String,
    enum: ['PENDING', 'UPLOADED'],
    default: 'PENDING'
  },
  paymentStatus: {
    type: String,
    enum: ['PENDING', 'PAID'],
    default: 'PENDING',
    index: true
  },
  paymentMode: {
    type: String,
    enum: ['CASH', 'ONLINE', 'UPI', 'CARD', 'NONE'],
    default: 'NONE'
  },
  amount: {
    type: Number,
    default: 0
  },
  reportFile: {
    url: String,
    fileId: String,
    name: String,
    uploadedAt: Date
  },
  notes: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});

const LabReport = mongoose.model('LabReport', labReportSchema);

module.exports = LabReport;