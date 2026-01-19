const mongoose = require('mongoose');

const receptionSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Reception name is required']
  },
  email: {
    type: String,
    required: [true, 'Email is required']
  },
  phone: {
    type: String,
    default: ''
  },
  availability: {
    monday: { available: Boolean, startTime: String, endTime: String },
    tuesday: { available: Boolean, startTime: String, endTime: String },
    wednesday: { available: Boolean, startTime: String, endTime: String },
    thursday: { available: Boolean, startTime: String, endTime: String },
    friday: { available: Boolean, startTime: String, endTime: String },
    saturday: { available: Boolean, startTime: String, endTime: String },
    sunday: { available: Boolean, startTime: String, endTime: String }
  },
  description: {
    type: String,
    default: ''
  },
  services: [{
    type: String
  }]
}, {
  timestamps: true
});

const Reception = mongoose.model('Reception', receptionSchema);

module.exports = Reception;










