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
            // Remove protocol, query strings, paths, and trailing slash
            let cleanDomain = domain.replace(/^https?:\/\//i, '').split('/')[0].split('?')[0].split(':')[0].toLowerCase();
            
            // Intercept Central Admin domain prior to DB lookup
            if (cleanDomain.includes('admin.medical365.in')) {
                return res.status(200).json({
                    success: true,
                    tenant: {
                        id: 'central-admin-system',
                        isCentralAdmin: true,
                        name: 'Central Management',
                        slug: 'admin',
                        customDomain: 'admin.medical365.in',
                        branding: {},
                        theme: 'admin-default',
                        features: ['ALL_MODULES']
                    }
                });
            }
            
            if (cleanDomain.endsWith('.medical365.in')) {
                query.slug = cleanDomain.replace('.medical365.in', '');
            } else if (cleanDomain.endsWith('.localhost')) {
                query.slug = cleanDomain.replace('.localhost', '');
            } else {
                query.$or = [
                    { customDomain: cleanDomain },
                    { slug: cleanDomain }
                ];
            }
        } else if (slug) {
            query.slug = slug.toLowerCase();
        }

        const hospital = await Hospital.findOne(query)
            .select('name slug customDomain branding subscriptionPlan')
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
                branding: hospital.branding || {},
                subscriptionPlan: hospital.subscriptionPlan || 'none'
            }
        });
    } catch (err) {
        console.error('Get tenant-config error:', err);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
});

// Get authentication configuration flags (public — used by frontend to adapt login flow)
router.get('/auth-config', (req, res) => {
    res.set('Cache-Control', 'public, max-age=60');
    res.json({
        success: true,
        otpEnabled: process.env.AUTH_OTP_ENABLED !== 'false',
    });
});


// Dynamic PWA Manifest Route (MASTER FIX)
router.get('/manifest.json', async (req, res) => {
    try {
        // 1. Frontend khud batayega wo kaunsa hospital hai (?domain=...)
        const referer = req.get('referer');
        let requestingDomain = req.query.domain || 
                               (referer ? new URL(referer).hostname : null) || 
                               req.headers.host;

        let cleanDomain = requestingDomain.replace(/^https?:\/\//i, '').split('/')[0].split(':')[0].toLowerCase();
        
        // Absolute URL banayenge Chrome ke error ko rokne ke liye
        const frontendUrl = `https://${cleanDomain}`;

        const Hospital = require('../models/hospital.model');
        let query = null;
        
        if (cleanDomain.endsWith('.medical365.in')) {
            query = { slug: cleanDomain.replace('.medical365.in', '') };
        } else if (cleanDomain.endsWith('.localhost')) {
            query = { slug: cleanDomain.replace('.localhost', '') };
        } else if (!cleanDomain.includes('localhost') && cleanDomain !== 'medical365.in') {
            query = { $or: [{ customDomain: cleanDomain }, { slug: cleanDomain }] };
        }

        let hospital = null;
        if (query) {
            hospital = await Hospital.findOne(query).select('name branding').lean();
        }

        // 2. Default Fallback (With Absolute URLs & Fixed Purpose)
        const manifest = {
            name: "Medical 365",
            short_name: "Hospital",
            start_url: `${frontendUrl}/`, // FIX: Absolute URL
            display: "standalone",
            background_color: "#ffffff",
            theme_color: "#14b8a6",
            icons: [
                {
                    src: `${frontendUrl}/icon-192x192.png`, 
                    sizes: "192x192",
                    type: "image/png",
                    purpose: "any" // FIX: Chrome wants strictly "any"
                },
                {
                    src: `${frontendUrl}/icon-512x512.png`,
                    sizes: "512x512",
                    type: "image/png",
                    purpose: "maskable" // FIX: Chrome wants strictly "maskable"
                }
            ]
        };

        // 3. Agar Hospital mil gaya, toh uski details daalo
        if (hospital) {
            manifest.name = hospital.name || manifest.name;
            manifest.short_name = hospital.name || manifest.short_name;
            if (hospital.branding?.primaryColor) {
                manifest.theme_color = hospital.branding.primaryColor;
            }
            if (hospital.branding?.logoUrl) {
                const logoUrl = hospital.branding.logoUrl;
                manifest.icons = [
                    {
                        src: logoUrl,
                        sizes: "192x192",
                        type: "image/png",
                        purpose: "any"
                    },
                    {
                        src: logoUrl,
                        sizes: "512x512",
                        type: "image/png",
                        purpose: "maskable"
                    }
                ];
            }
        }

        // CORS allow karein taaki frontend isko read kar sake
        res.set('Access-Control-Allow-Origin', '*');
        res.set('Cache-Control', 'public, max-age=300');
        res.json(manifest);
    } catch (err) {
        console.error('Dynamic manifest error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Endpoint 1: Fetch branding details based on requested domain/slug
router.get('/branding', async (req, res) => {
    try {
        const { domain, slug } = req.query;
        if (!domain && !slug) {
            return res.status(400).json({ error: 'Please provide a domain or slug' });
        }

        const Hospital = require('../models/hospital.model');
        const query = {};
        if (domain) query['brandingSchema.customDomain'] = domain;
        if (slug) query.slug = slug;

        const hospital = await Hospital.findOne(query);

        if (!hospital || !hospital.whiteLabelEnabled) {
            return res.status(404).json({ error: 'Branding not found or white-label disabled' });
        }

        res.json({ branding: hospital.brandingSchema });
    } catch (error) {
        res.status(500).json({ error: 'Server error fetching branding details' });
    }
});

// Endpoint 2: Dynamic PWA Manifest (Phase 2 White-Label Request)
router.get('/manifest', async (req, res) => {
    try {
        const { domain, slug } = req.query;
        let hospital = null;
        
        const Hospital = require('../models/hospital.model');

        if (domain || slug) {
            const query = {};
            if (domain) query['brandingSchema.customDomain'] = domain;
            if (slug) query.slug = slug;
            hospital = await Hospital.findOne(query);
        }

        // The default Medical 365 manifest object
        const defaultManifest = {
            name: "Medical 365",
            short_name: "Medical 365",
            start_url: "/",
            display: "standalone",
            background_color: "#ffffff",
            theme_color: "#14b8a6",
            icons: [
                {
                    src: "/icons/default-icon-192.png",
                    sizes: "192x192",
                    type: "image/png"
                },
                {
                    src: "/icons/default-icon-512.png",
                    sizes: "512x512",
                    type: "image/png"
                }
            ]
        };

        // If white-label is enabled, merge custom branding over the default manifest
        if (hospital && hospital.whiteLabelEnabled && hospital.brandingSchema) {
            const dynamicManifest = {
                ...defaultManifest,
                name: hospital.brandingSchema.appName || defaultManifest.name,
                short_name: hospital.brandingSchema.appName || defaultManifest.short_name,
                theme_color: hospital.brandingSchema.themeColors?.primary || defaultManifest.theme_color,
                icons: [
                    {
                        src: hospital.brandingSchema.logoUrl || defaultManifest.icons[0].src,
                        sizes: "192x192", 
                        type: "image/png"
                    },
                    {
                        src: hospital.brandingSchema.logoUrl || defaultManifest.icons[1].src,
                        sizes: "512x512",
                        type: "image/png"
                    }
                ]
            };
            return res.json(dynamicManifest);
        }

        // Otherwise return the default config
        res.json(defaultManifest);
    } catch (error) {
        res.status(500).json({ error: 'Server error generating manifest' });
    }
});

module.exports = router;
