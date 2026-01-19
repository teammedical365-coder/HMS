const express = require('express');
const router = express.Router();
const Service = require('../models/service.model');
const Doctor = require('../models/doctor.model');

// Get all active services (public route)
router.get('/services', async (req, res) => {
  try {
    // Add cache headers for better performance (5 minutes cache)
    res.set('Cache-Control', 'public, max-age=300');
    
    // Select only needed fields for better performance
    const services = await Service.find({ active: true })
      .select('id title description icon color price duration category features active')
      .sort({ createdAt: -1 })
      .lean(); // Use lean() for better performance (returns plain JS objects)
    
    res.json({ 
      success: true, 
      services,
      count: services.length,
      cached: true
    });
  } catch (error) {
    console.error('Get services error:', error);
    res.status(500).json({ success: false, message: 'Error fetching services', error: error.message });
  }
});

module.exports = router;


