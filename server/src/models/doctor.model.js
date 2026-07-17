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
    sparse: true
  },
  hospitalId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Hospital',
    default: null,
    index: true
  },
  name: {
    type: String,
    required: [true, 'Doctor name is required'],
    minlength: 2
  },
  email: { type: String, required: true, lowercase: true, trim: true, match: /^\S+@\S+\.\S+$/ },
  phone: { type: String, required: true, match: /^\d{10}$/ },
  age: {
    type: Number,
    required: [true, 'Age is required'],
    min: 1
  },
  aadhaarNumber: {
    type: String,
    required: [true, 'Aadhaar number is required'],
    match: /^\d{12}$/
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
  departments: [{
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
  },
  status: {
    type: String,
    enum: ['Active', 'Inactive'],
    default: 'Active',
    index: true
  },
  isAvailable: {
    type: Boolean,
    default: true,
    index: true
  }
}, {
  timestamps: true
});

// Add indexes for better query performance
doctorSchema.index({ services: 1 }); // Index for filtering by services
doctorSchema.index({ email: 1 }); // Index for email lookups

const Doctor = mongoose.model('Doctor', doctorSchema);
//doctor dda
module.exports = Doctor;

