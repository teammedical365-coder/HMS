const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const axios = require('axios');

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
 * Triggers the GitHub Actions white-label APK generation pipeline.
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

        // 1. Rigorous Manual Validation & Sanitization
        // Remove special characters that could break scripts or paths
        const safeAppName = (hospital.branding?.appName || hospital.name || 'City Hospital')
            .replace(/[^a-zA-Z0-9\s]/g, '')
            .trim();
        
        // Use derived hospital code for applicationId, fallback to id
        let safeCode = hospital.hospitalCode;
        if (!safeCode) {
            safeCode = id.substring(0, 8);
        }
        const safeApplicationId = `com.medical365.${safeCode.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()}`;
        
        const logoUrl = hospital.branding?.logoUrl || 'default';
        const themeColor = hospital.branding?.primaryColor || '#14b8a6';

        // 2. Setup GitHub API Call
        const owner = process.env.GITHUB_OWNER || 'hms-admin';
        const repo = process.env.GITHUB_REPO || 'hms-white-label';
        const workflowId = 'white-label-build.yml';
        const githubToken = process.env.GITHUB_PAT;

        if (!githubToken) {
             console.warn('[Build System] GITHUB_PAT is not set. Defaulting to mock local build mode.');
             // Mock build for development without PAT
             hospital.isWhitelabeled = true;
             hospital.appConfig.buildStatus = 'COMPLETED';
             hospital.appConfig.lastBuiltAt = new Date();
             await hospital.save();
             return res.json({ success: true, message: 'Mock build completed', buildStatus: 'COMPLETED' });
        }

        // 3. Trigger GitHub Action
        const githubUrl = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflowId}/dispatches`;
        
        await axios.post(githubUrl, {
            ref: 'main',
            inputs: {
                tenantId: id.toString(),
                hospitalName: safeAppName,
                applicationId: safeApplicationId,
                logoUrl: logoUrl,
                themeColor: themeColor
            }
        }, {
            headers: {
                'Accept': 'application/vnd.github.v3+json',
                'Authorization': `Bearer ${githubToken}`,
                'X-GitHub-Api-Version': '2022-11-28'
            }
        });

        // 4. Update Database
        hospital.isWhitelabeled = true;
        hospital.appConfig.buildStatus = 'BUILDING';
        hospital.appConfig.buildStartedAt = new Date();
        hospital.appConfig.buildError = '';
        await hospital.save();

        return res.json({ 
            success: true, 
            message: 'App build started successfully!',
            buildStatus: 'BUILDING'
        });

    } catch (err) {
        console.error('Build trigger error:', err.response?.data || err.message);
        const errMessage = err.response?.data?.message || 'Failed to trigger build pipeline';
        
        // Also update db to FAILED if we had a hospital ID
        try {
            const h = await Hospital.findById(req.params.id);
            if (h) {
                h.appConfig.buildStatus = 'FAILED';
                h.appConfig.buildError = errMessage;
                await h.save();
            }
        } catch(e) {}

        res.status(500).json({ success: false, message: errMessage });
    }
});

/**
 * POST /api/superadmin/hospitals/webhook/github
 * Webhook called by GitHub Actions when a build finishes.
 */
router.post('/webhook/github', async (req, res) => {
    try {
        const { secret } = req.query;
        // Verify webhook secret
        const expectedSecret = process.env.GITHUB_WEBHOOK_SECRET || 'dev-secret-123';
        if (secret !== expectedSecret) {
            return res.status(403).json({ success: false, message: 'Unauthorized webhook request' });
        }

        const { tenantId, status, apkUrl, aabUrl, error } = req.body;

        if (!tenantId || !status) {
            return res.status(400).json({ success: false, message: 'Missing required payload fields' });
        }

        const hospital = await Hospital.findById(tenantId);
        if (!hospital) {
            return res.status(404).json({ success: false, message: 'Tenant not found' });
        }

        if (status === 'COMPLETED') {
            hospital.appConfig.buildStatus = 'COMPLETED';
            hospital.appConfig.lastBuiltAt = new Date();
            // Assume the APK is uploaded to a predictable URL or passed from GitHub
            // Alternatively, they are hosted on GitHub releases.
            hospital.appConfig.apkUrl = apkUrl || hospital.appConfig.apkUrl;
            hospital.appConfig.aabUrl = aabUrl || hospital.appConfig.aabUrl;
            hospital.appConfig.buildError = '';
        } else if (status === 'FAILED') {
            hospital.appConfig.buildStatus = 'FAILED';
            hospital.appConfig.buildError = error || 'GitHub Action pipeline failed';
        }

        await hospital.save();
        return res.json({ success: true, message: 'Build status updated successfully' });

    } catch (err) {
        console.error('Webhook processing error:', err);
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