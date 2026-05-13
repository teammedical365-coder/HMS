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
    res.status(500).json({ success: false, message: 'Error fetching services' });
  }
});

// Get tenant configuration by domain or slug for white-labeling
router.get('/tenant-config', async (req, res) => {
    try {
        const { domain, slug } = req.query;
        if (!domain && !slug) {
            return res.status(400).json({ success: false, message: 'Must provide domain or slug' });
        }

        const Hospital = require('../models/hospital.model');
        let query = {};
        
        if (domain) {
            // Remove protocol and trailing slash if mistakenly sent
            const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase();
            // Try to match customDomain directly. If it ends with .medical365.in, we can extract the slug.
            if (cleanDomain.endsWith('.medical365.in')) {
                query.slug = cleanDomain.replace('.medical365.in', '');
            } else {
                query.customDomain = cleanDomain;
            }
        } else if (slug) {
            query.slug = slug.toLowerCase();
        }

        const hospital = await Hospital.findOne(query)
            .select('name slug customDomain branding')
            .lean();

        if (!hospital) {
            return res.status(404).json({ success: false, message: 'Tenant not found' });
        }

        // Add short cache
        res.set('Cache-Control', 'public, max-age=600');
        res.json({
            success: true,
            tenant: {
                id: hospital._id,
                name: hospital.name,
                slug: hospital.slug,
                customDomain: hospital.customDomain,
                branding: hospital.branding || {}
            }
        });
    } catch (err) {
        console.error('Get tenant-config error:', err);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
});

module.exports = router;


