const mongoose = require('mongoose');

const serviceSchema = new mongoose.Schema({
  id: {
    type: String,
    required: [true, 'Service ID is required'],
    unique: true
  },
  title: {
    type: String,
    required: [true, 'Service title is required']
  },
  description: {
    type: String,
    required: [true, 'Service description is required']
  },
  icon: {
    type: String,
    default: '🏥'
  },
  color: {
    type: String,
    default: '#14C38E'
  },
  price: {
    type: Number,
    default: 0
  },
  duration: {
    type: String,
    default: ''
  },
  category: {
    type: String,
    default: ''
  },
  features: [{
    type: String
  }],
  active: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Add indexes for better query performance
serviceSchema.index({ active: 1 }); // Index for filtering active services

const Service = mongoose.model('Service', serviceSchema);

module.exports = Service;


