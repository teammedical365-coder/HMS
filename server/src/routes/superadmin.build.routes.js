const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const multer = require('multer');

const Hospital = require('../models/hospital.model');
const { verifyToken } = require('../middleware/auth.middleware');

// Configure multer for APK uploads
const apkStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dest = path.join(__dirname, '../../public/downloads/apks');
        if (!fs.existsSync(dest)) {
            fs.mkdirSync(dest, { recursive: true });
        }
        cb(null, dest);
    },
    filename: async (req, file, cb) => {
        try {
            const tenantId = req.body.tenantId;
            const hospital = await Hospital.findById(tenantId);
            const safeName = hospital?.name ? hospital.name.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() : 'cityhospital';
            cb(null, `${safeName}-release.apk`);
        } catch (err) {
            cb(err);
        }
    }
});
const uploadApk = multer({ storage: apkStorage });

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
        const safeAppName = (hospital.brandingSchema?.appName || hospital.branding?.appName || hospital.name || 'City Hospital')
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

        // 2. Setup GitHub API Call & Configuration
        const owner = process.env.GITHUB_OWNER || 'teammedical365-coder';
        const repo = process.env.GITHUB_REPO || 'HMS';
        const workflowId = 'white-label-build.yml'; // Must match exactly the filename in .github/workflows/
        const githubToken = process.env.GITHUB_PAT;
        const refBranch = 'main';

        if (!githubToken) {
             console.warn('[Build System] GITHUB_PAT is not set. Defaulting to mock local build mode.');
             hospital.isWhitelabeled = true;
             hospital.appConfig.buildStatus = 'COMPLETED';
             hospital.appConfig.lastBuiltAt = new Date();
             await hospital.save();
             return res.json({ success: true, message: 'Mock build completed', buildStatus: 'COMPLETED' });
        }

        // 3. Trigger GitHub Action
        const githubUrl = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflowId}/dispatches`;
        
        try {
            await axios.post(githubUrl, {
                ref: refBranch,
                inputs: {
                    tenantId: id.toString(),
                    hospitalName: safeAppName,
                    applicationId: safeApplicationId,
                    logoUrl: logoUrl,
                    themeColor: themeColor
                }
            }, {
                headers: {
                    'Accept': 'application/vnd.github+json',
                    'Authorization': `Bearer ${githubToken}`,
                    'X-GitHub-Api-Version': '2022-11-28'
                }
            });
        } catch (githubErr) {
            // 4. Comprehensive Error Diagnostics & Security
            const statusCode = githubErr.response?.status;
            
            if (statusCode === 404) {
                console.error(`[GitHub Actions Error 404] Failed to trigger workflow. Diagnostic Checklist:
1) Verify Repository Path: Owner='${owner}', Repo='${repo}'
2) Verify Workflow File: '${workflowId}' MUST exist on the default branch ('${refBranch}')
3) Verify Token Scope: The GITHUB_PAT must have 'repo' and 'workflow' permissions.
Note: GitHub returns 404 instead of 401/403 for missing scopes to prevent repository enumeration.`);
                throw new Error("Build dispatch failed: Repository or workflow configuration issue (404).");
            }

            // Log generic error but NEVER log the raw config (which contains the Bearer token)
            console.error(`[GitHub Actions Error ${statusCode || 'Unknown'}]`, githubErr.response?.data?.message || githubErr.message);
            throw new Error(`Build dispatch failed: ${githubErr.response?.data?.message || 'Internal pipeline error'}`);
        }

        // 5. Update Database on Success
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
        // Fallback error handler
        const errMessage = err.message || 'Failed to trigger build pipeline';
        console.error('[Build Orchestrator Error]', errMessage);
        
        try {
            const h = await Hospital.findById(req.params.id);
            if (h) {
                h.appConfig.buildStatus = 'FAILED';
                h.appConfig.buildError = errMessage;
                await h.save();
            }
        } catch(e) {
            console.error('Failed to update hospital status after error:', e.message);
        }

        res.status(500).json({ success: false, message: errMessage });
    }
});

/**
 * POST /api/superadmin/hospitals/:id/reset-build
 * Resets a stuck build status back to NOT_BUILT
 */
router.post('/:id/reset-build', verifyCentralAdmin, async (req, res) => {
    try {
        const hospital = await Hospital.findById(req.params.id);
        if (!hospital) {
            return res.status(404).json({ success: false, message: 'Hospital not found' });
        }
        
        if (hospital.appConfig) {
            hospital.appConfig.buildStatus = 'NOT_BUILT';
            await hospital.save();
        }
        
        return res.json({ success: true, message: 'Build status reset successfully' });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
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
 * POST /api/superadmin/hospitals/webhook/github/upload
 * Webhook for direct APK file upload from GitHub Actions
 */
router.post('/webhook/github/upload', uploadApk.single('apk'), async (req, res) => {
    try {
        const { secret } = req.query;
        const expectedSecret = process.env.GITHUB_WEBHOOK_SECRET || 'dev-secret-123';
        if (secret !== expectedSecret) {
            return res.status(403).json({ success: false, message: 'Unauthorized webhook request' });
        }

        const { tenantId } = req.body;
        if (!tenantId || !req.file) {
            return res.status(400).json({ success: false, message: 'Missing tenantId or APK file' });
        }

        const hospital = await Hospital.findById(tenantId);
        if (!hospital) {
            return res.status(404).json({ success: false, message: 'Tenant not found' });
        }

        hospital.appConfig.buildStatus = 'COMPLETED';
        hospital.appConfig.lastBuiltAt = new Date();
        hospital.appConfig.buildError = '';
        
        // Ensure apkUrl points back to the local static route instead of github
        const safeName = hospital.name ? hospital.name.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() : 'cityhospital';
        hospital.appConfig.apkUrl = `/downloads/apks/${safeName}-release.apk`;
        
        await hospital.save();
        return res.json({ success: true, message: 'APK uploaded and build status updated successfully' });

    } catch (err) {
        console.error('Upload webhook error:', err);
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

module.exports = router;/**
 * POST /api/superadmin/hospitals/:id/build-rn-app
 * Triggers the GitHub Actions white-label APK generation pipeline for React Native.
 */
router.post('/:id/build-rn-app', verifyCentralAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const hospital = await Hospital.findById(id);

        if (!hospital) {
            return res.status(404).json({ success: false, message: 'Hospital not found' });
        }

        if (!hospital.appConfig) {
            hospital.appConfig = {};
        }

        const safeAppName = (hospital.brandingSchema?.appName || hospital.branding?.appName || hospital.name || 'City Hospital')
            .replace(/[^a-zA-Z0-9\s]/g, '')
            .trim();
        
        let safeCode = hospital.hospitalCode;
        if (!safeCode) {
            safeCode = id.substring(0, 8);
        }
        const safeApplicationId = "com.medical365.${safeCode.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()}";
        
        const logoUrl = hospital.branding?.logoUrl || 'default';
        const themeColor = hospital.branding?.primaryColor || '#14b8a6';

        const owner = process.env.GITHUB_OWNER || 'teammedical365-coder';
        const repo = process.env.GITHUB_REPO_RN || 'HMS-APP';
        const workflowId = 'react-native-build.yml'; 
        const githubToken = process.env.GITHUB_PAT;
        const refBranch = 'main';

        if (!githubToken) {
             console.warn('[Build System] GITHUB_PAT is not set. Defaulting to mock local build mode.');
             hospital.isWhitelabeled = true;
             hospital.appConfig.rnBuildStatus = 'COMPLETED';
             hospital.appConfig.rnLastBuiltAt = new Date();
             await hospital.save();
             return res.json({ success: true, message: 'Mock RN build completed', buildStatus: 'COMPLETED' });
        }

        const githubUrl = "https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflowId}/dispatches";
        
        try {
            await axios.post(githubUrl, {
                ref: refBranch,
                inputs: {
                    tenantId: id.toString(),
                    hospitalName: safeAppName,
                    applicationId: safeApplicationId,
                    logoUrl: logoUrl,
                    themeColor: themeColor
                }
            }, {
                headers: {
                    'Accept': 'application/vnd.github+json',
                    'Authorization': "Bearer ${githubToken}",
                    'X-GitHub-Api-Version': '2022-11-28'
                }
            });
        } catch (githubErr) {
            throw new Error("RN Build dispatch failed: ${githubErr.response?.data?.message || 'Internal pipeline error'}");
        }

        hospital.isWhitelabeled = true;
        hospital.appConfig.rnBuildStatus = 'BUILDING';
        hospital.appConfig.rnBuildStartedAt = new Date();
        hospital.appConfig.rnBuildError = '';
        await hospital.save();

        return res.json({ 
            success: true, 
            message: 'RN App build started successfully!',
            buildStatus: 'BUILDING'
        });

    } catch (err) {
        const errMessage = err.message || 'Failed to trigger RN build pipeline';
        console.error('[RN Build Orchestrator Error]', errMessage);
        
        try {
            const h = await Hospital.findById(req.params.id);
            if (h) {
                h.appConfig.rnBuildStatus = 'FAILED';
                h.appConfig.rnBuildError = errMessage;
                await h.save();
            }
        } catch(e) {}

        res.status(500).json({ success: false, message: errMessage });
    }
});

/**
 * POST /api/superadmin/hospitals/:id/reset-rn-build
 */
router.post('/:id/reset-rn-build', verifyCentralAdmin, async (req, res) => {
    try {
        const hospital = await Hospital.findById(req.params.id);
        if (!hospital) return res.status(404).json({ success: false, message: 'Hospital not found' });
        
        if (hospital.appConfig) {
            hospital.appConfig.rnBuildStatus = 'NOT_BUILT';
            await hospital.save();
        }
        return res.json({ success: true, message: 'RN Build status reset successfully' });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

/**
 * GET /api/superadmin/hospitals/:id/build-rn-status
 */
router.get('/:id/build-rn-status', verifyCentralAdmin, async (req, res) => {
    try {
        const hospital = await Hospital.findById(req.params.id).select('appConfig name').lean();
        if (!hospital) return res.status(404).json({ success: false, message: 'Not found' });
        
        const safeName = hospital.name ? hospital.name.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() : 'cityhospital';
        let apkFile = "${safeName}-rn-release.apk";
        let aabFile = "${safeName}-rn-release.aab";
        let targetApkPath = path.join(__dirname, '../../public/downloads/apks', apkFile);

        if (!fs.existsSync(targetApkPath)) {
            apkFile = 'cityhospital-rn-release.apk';
            aabFile = 'cityhospital-rn-release.aab';
        }

        res.json({
            success: true,
            buildStatus: hospital.appConfig?.rnBuildStatus || 'COMPLETED',
            buildStartedAt: hospital.appConfig?.rnBuildStartedAt,
            lastBuiltAt: hospital.appConfig?.rnLastBuiltAt,
            buildError: hospital.appConfig?.rnBuildError || '',
            apkUrl: hospital.appConfig?.rnApkUrl || "/downloads/apks/${apkFile}",
            aabUrl: hospital.appConfig?.rnAabUrl || "/downloads/aabs/${aabFile}"
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Error fetching RN build status' });
    }
});
/**
 * POST /api/superadmin/hospitals/webhook/github-rn/upload
 * Webhook for direct RN APK file upload from GitHub Actions
 */
router.post('/webhook/github-rn/upload', uploadApk.single('apk'), async (req, res) => {
    try {
        const { secret } = req.query;
        const expectedSecret = process.env.GITHUB_WEBHOOK_SECRET || 'dev-secret-123';
        if (secret !== expectedSecret) {
            return res.status(403).json({ success: false, message: 'Unauthorized webhook request' });
        }

        const { tenantId } = req.body;
        if (!tenantId || !req.file) {
            return res.status(400).json({ success: false, message: 'Missing tenantId or APK file' });
        }

        const hospital = await Hospital.findById(tenantId);
        if (!hospital) {
            return res.status(404).json({ success: false, message: 'Tenant not found' });
        }

        hospital.appConfig.rnBuildStatus = 'COMPLETED';
        hospital.appConfig.rnLastBuiltAt = new Date();
        hospital.appConfig.rnBuildError = '';
        
        const safeName = hospital.name ? hospital.name.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() : 'cityhospital';
        hospital.appConfig.rnApkUrl = "/downloads/apks/${safeName}-rn-release.apk";
        
        await hospital.save();
        return res.json({ success: true, message: 'RN APK uploaded and build status updated successfully' });

    } catch (err) {
        console.error('Upload RN webhook error:', err);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
});
