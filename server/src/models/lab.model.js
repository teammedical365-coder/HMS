const mongoose = require('mongoose');

const labSchema = new mongoose.Schema({
  userId: { // ADD THIS: Links to the Login User
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false, // Optional for legacy records, required for new ones
    index: true
  },
  name: {
    type: String,
    required: [true, 'Lab name is required']
  },
  email: {
    type: String,
    required: [true, 'Email is required']
  },
  phone: { type: String, default: '' },
  address: { type: String, default: '' },
  services: [{ type: String }],
  availability: {
    monday: { available: Boolean, startTime: String, endTime: String },
    tuesday: { available: Boolean, startTime: String, endTime: String },
    wednesday: { available: Boolean, startTime: String, endTime: String },
    thursday: { available: Boolean, startTime: String, endTime: String },
    friday: { available: Boolean, startTime: String, endTime: String },
    saturday: { available: Boolean, startTime: String, endTime: String },
    sunday: { available: Boolean, startTime: String, endTime: String }
  },
  description: { type: String, default: '' },
  facilities: [{ type: String }]
}, {
  timestamps: true
});

const Lab = mongoose.model('Lab', labSchema);
module.exports = Lab;