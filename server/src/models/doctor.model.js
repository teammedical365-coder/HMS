const mongoose = require('mongoose');

const doctorSchema = new mongoose.Schema({
  doctorId: {
    type: String,
    required: true,
    unique: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false,
    unique: true,
    sparse: true // Allows multiple null values
  },
  name: {
    type: String,
    required: [true, 'Doctor name is required']
  },
  email: {
    type: String,
    required: [true, 'Email is required']
  },
  phone: {
    type: String,
    default: ''
  },
  specialty: {
    type: String,
    default: ''
  },
  experience: {
    type: String,
    default: ''
  },
  education: {
    type: String,
    default: ''
  },
  services: [{
    type: String
  }],
  availability: {
    monday: { available: Boolean, startTime: String, endTime: String },
    tuesday: { available: Boolean, startTime: String, endTime: String },
    wednesday: { available: Boolean, startTime: String, endTime: String },
    thursday: { available: Boolean, startTime: String, endTime: String },
    friday: { available: Boolean, startTime: String, endTime: String },
    saturday: { available: Boolean, startTime: String, endTime: String },
    sunday: { available: Boolean, startTime: String, endTime: String }
  },
  successRate: {
    type: String,
    default: '90%'
  },
  patientsCount: {
    type: String,
    default: '100+'
  },
  image: {
    type: String,
    default: '👨‍⚕️'
  },
  bio: {
    type: String,
    default: ''
  },
  consultationFee: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Add indexes for better query performance
doctorSchema.index({ services: 1 }); // Index for filtering by services
doctorSchema.index({ userId: 1 }); // Index for finding doctor by user
doctorSchema.index({ doctorId: 1 }); // Index for finding by doctorId
doctorSchema.index({ email: 1 }); // Index for email lookups

const Doctor = mongoose.model('Doctor', doctorSchema);
//doctor dda
module.exports = Doctor;

