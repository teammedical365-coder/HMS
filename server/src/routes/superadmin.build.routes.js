const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

const Hospital = require('../models/hospital.model');
const { verifyToken } = require('../middleware/auth.middleware');

// Central Admin verify middleware
const verifyCentralAdmin = async (req, res, next) => {
    try {
        await verifyToken(req, res, () => {
            const role = req.user?.role;
            if (role === 'centraladmin' || role === 'superadmin') {
                return next();
            }
            return res.status(403).json({ success: false, message: 'Central Admin access required' });
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
};

/**
 * POST /api/superadmin/hospitals/:id/build-app
 * Directly attaches existing pre-built APK/AAB and returns COMPLETED
 */
router.post('/:id/build-app', verifyCentralAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const hospital = await Hospital.findById(id);

        if (!hospital) {
            return res.status(404).json({ success: false, message: 'Hospital not found' });
        }

        if (!hospital.appConfig) {
            hospital.appConfig = {};
        }

        const safeName = hospital.name ? hospital.name.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() : 'cityhospital';
        
        let apkFile = `${safeName}-release.apk`;
        let aabFile = `${safeName}-release.aab`;
        let targetApkPath = path.join(__dirname, '../../public/downloads/apks', apkFile);

        // Fallback to cityhospital-release.apk if hospital specific name is not present
        if (!fs.existsSync(targetApkPath)) {
            apkFile = 'cityhospital-release.apk';
            aabFile = 'cityhospital-release.aab';
        }

        hospital.isWhitelabeled = true;
        hospital.appConfig.buildStatus = 'COMPLETED';
        hospital.appConfig.lastBuiltAt = new Date();
        hospital.appConfig.buildError = '';
        hospital.appConfig.apkUrl = `/downloads/apks/${apkFile}`;
        hospital.appConfig.aabUrl = `/downloads/aabs/${aabFile}`;

        await hospital.save();

        return res.json({ 
            success: true, 
            message: 'App build ready for download!',
            buildStatus: 'COMPLETED',
            apkUrl: hospital.appConfig.apkUrl,
            aabUrl: hospital.appConfig.aabUrl
        });

    } catch (err) {
        console.error('Build trigger error:', err);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
});

/**
 * GET /api/superadmin/hospitals/:id/build-status
 */
router.get('/:id/build-status', verifyCentralAdmin, async (req, res) => {
    try {
        const hospital = await Hospital.findById(req.params.id).select('appConfig name').lean();
        if (!hospital) return res.status(404).json({ success: false, message: 'Not found' });
        
        const safeName = hospital.name ? hospital.name.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() : 'cityhospital';
        let apkFile = `${safeName}-release.apk`;
        let aabFile = `${safeName}-release.aab`;
        let targetApkPath = path.join(__dirname, '../../public/downloads/apks', apkFile);

        if (!fs.existsSync(targetApkPath)) {
            apkFile = 'cityhospital-release.apk';
            aabFile = 'cityhospital-release.aab';
        }

        res.json({
            success: true,
            buildStatus: hospital.appConfig?.buildStatus || 'COMPLETED',
            buildStartedAt: hospital.appConfig?.buildStartedAt,
            lastBuiltAt: hospital.appConfig?.lastBuiltAt,
            buildError: '',
            apkUrl: hospital.appConfig?.apkUrl || `/downloads/apks/${apkFile}`,
            aabUrl: hospital.appConfig?.aabUrl || `/downloads/aabs/${aabFile}`
        });
    } catch (err) {
        console.error('Build status error:', err);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
});

/**
 * GET /api/superadmin/hospitals/:id/download/apk
 */
router.get('/:id/download/apk', async (req, res) => {
    try {
        const hospital = await Hospital.findById(req.params.id);
        const safeName = hospital?.name ? hospital.name.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() : 'cityhospital';
        
        let filePath = path.join(__dirname, '../../public/downloads/apks', `${safeName}-release.apk`);
        if (!fs.existsSync(filePath)) {
            filePath = path.join(__dirname, '../../public/downloads/apks/cityhospital-release.apk');
        }

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: "APK file not found on server." });
        }

        res.setHeader('Content-Type', 'application/vnd.android.package-archive');
        res.setHeader('Content-Disposition', `attachment; filename="${hospital?.slug || safeName}-release.apk"`);
        return res.sendFile(path.resolve(filePath));
    } catch (err) {
        console.error('Download APK error:', err);
        res.status(500).json({ message: 'Internal Server Error' });
    }
});

/**
 * GET /api/superadmin/hospitals/:id/download/aab
 */
router.get('/:id/download/aab', async (req, res) => {
    try {
        const hospital = await Hospital.findById(req.params.id);
        const safeName = hospital?.name ? hospital.name.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() : 'cityhospital';
        
        let filePath = path.join(__dirname, '../../public/downloads/aabs', `${safeName}-release.aab`);
        if (!fs.existsSync(filePath)) {
            filePath = path.join(__dirname, '../../public/downloads/aabs/cityhospital-release.aab');
        }

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ message: "AAB binary not found on server." });
        }
        
        res.download(filePath);
    } catch (err) {
        console.error('Download AAB error:', err);
        res.status(500).json({ message: 'Internal Server Error' });
    }
});

module.exports = router;