const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const axios = require('axios');
const multer = require('multer');

const Hospital = require('../models/hospital.model');
const { verifyToken } = require('../middleware/auth.middleware');
const { triggerMobileBuild } = require('../controllers/mobileBuild.controller');

/**
 * Validate webhook secret using timing-safe comparison.
 * In production, GITHUB_WEBHOOK_SECRET must be set in environment;
 * requests are rejected if the secret is missing or mismatched.
 */
function isValidWebhookSecret(providedSecret) {
    if (!providedSecret || typeof providedSecret !== 'string') {
        return false;
    }

    const configuredSecret = process.env.GITHUB_WEBHOOK_SECRET;

    // In production, require GITHUB_WEBHOOK_SECRET to be configured in environment
    let expectedSecret = configuredSecret;
    if (!expectedSecret) {
        if (process.env.NODE_ENV === 'production') {
            console.error('[Webhook Security] GITHUB_WEBHOOK_SECRET is not configured in server environment. Webhook rejected.');
            return false;
        }
        // In local development / test environments only:
        expectedSecret = 'dev-secret-123';
    }

    const providedBuffer = Buffer.from(providedSecret);
    const expectedBuffer = Buffer.from(expectedSecret);

    if (providedBuffer.length !== expectedBuffer.length) {
        return false;
    }

    return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
}

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
            const isRn = req.originalUrl?.includes('github-rn') || req.path?.includes('github-rn');
            cb(null, isRn ? `${safeName}-rn-release.apk` : `${safeName}-release.apk`);
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
 * POST /api/superadmin/hospitals/:id/trigger-mobile-build
 * Triggers the React Native Mobile Build in an isolated controller
 */
router.post('/:id/trigger-mobile-build', verifyCentralAdmin, triggerMobileBuild);

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

        // Duplicate build protection: prevent concurrent builds
        if (hospital.appConfig.buildStatus === 'BUILDING') {
            return res.status(409).json({
                success: false,
                message: 'A build is already in progress.',
                buildStatus: 'BUILDING'
            });
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
        const workflowId = process.env.GITHUB_WORKFLOW || 'white-label-build.yml'; // Must match exactly the filename in .github/workflows/
        const githubToken = process.env.GITHUB_PAT || process.env.GITHUB_TOKEN || process.env.GH_TOKEN || process.env.GIT_PAT;
        const refBranch = process.env.GITHUB_REF || 'main';

        if (!githubToken) {
            const errorMsg = 'GitHub Token is not configured. Please set GITHUB_PAT or GITHUB_TOKEN in server environment to enable automated GitHub builds.';
            console.error(`[Build System Error] ${errorMsg}`);
            hospital.appConfig.buildStatus = 'FAILED';
            hospital.appConfig.buildError = errorMsg;
            await hospital.save();
            return res.status(500).json({
                success: false,
                message: errorMsg,
                buildStatus: 'FAILED'
            });
        }

        // 3. Trigger GitHub Action via workflow_dispatch
        const githubUrl = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflowId}/dispatches`;
        
        let dispatchRes;
        try {
            dispatchRes = await axios.post(githubUrl, {
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
                    'Authorization': `Bearer ${githubToken.trim()}`,
                    'X-GitHub-Api-Version': '2022-11-28'
                },
                timeout: 15000
            });
        } catch (githubErr) {
            // 4. Comprehensive Error Diagnostics & Security
            const statusCode = githubErr.response?.status;
            const errorData = githubErr.response?.data;
            const errorDetails = errorData?.message || githubErr.message;
            console.error(`[GitHub Actions Dispatch Error ${statusCode || 'Network'}]`, errorDetails);

            let friendlyMessage;
            if (statusCode === 401) {
                friendlyMessage = 'GitHub API Error (401): Bad credentials. Check GITHUB_PAT / GITHUB_TOKEN validity.';
            } else if (statusCode === 403) {
                friendlyMessage = 'GitHub API Error (403): Forbidden. Token lacks "repo" or "workflow" permissions.';
            } else if (statusCode === 404) {
                friendlyMessage = `GitHub API Error (404): Workflow '${workflowId}' not found in '${owner}/${repo}' on branch '${refBranch}'. Verify repository path and workflow filename.`;
            } else if (statusCode === 422) {
                friendlyMessage = `GitHub API Error (422): Unprocessable Entity. ${errorDetails}`;
            } else {
                friendlyMessage = `GitHub API Error (${statusCode || 'Network'}): ${errorDetails}`;
            }

            hospital.appConfig.buildStatus = 'FAILED';
            hospital.appConfig.buildError = friendlyMessage;
            await hospital.save();

            return res.status(statusCode || 500).json({
                success: false,
                message: friendlyMessage,
                buildStatus: 'FAILED'
            });
        }

        // 5. Update Database on Success (GitHub returns 204 No Content for successful workflow_dispatch)
        if (dispatchRes.status === 204 || dispatchRes.status === 200 || dispatchRes.status === 201) {
            console.log(`[Build System] Successfully dispatched GitHub workflow '${workflowId}' for tenant ${id} (HTTP ${dispatchRes.status}).`);
            hospital.isWhitelabeled = true;
            hospital.appConfig.buildStatus = 'BUILDING';
            hospital.appConfig.buildStartedAt = new Date();
            hospital.appConfig.buildError = '';
            await hospital.save();

            return res.json({ 
                success: true, 
                message: `App build started successfully on GitHub Actions (HTTP ${dispatchRes.status})`,
                buildStatus: 'BUILDING'
            });
        } else {
            const unexpectedMsg = `Unexpected response from GitHub: HTTP ${dispatchRes.status}`;
            console.warn(`[Build System] ${unexpectedMsg}`);
            hospital.appConfig.buildStatus = 'FAILED';
            hospital.appConfig.buildError = unexpectedMsg;
            await hospital.save();

            return res.status(500).json({
                success: false,
                message: unexpectedMsg,
                buildStatus: 'FAILED'
            });
        }

    } catch (err) {
        // Fallback error handler
        const errMessage = err.message || 'Failed to trigger build pipeline';
        console.error('[Build Orchestrator Error]', errMessage);
        
        try {
            const h = await Hospital.findById(req.params.id);
            if (h) {
                if (!h.appConfig) h.appConfig = {};
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
        if (!isValidWebhookSecret(secret)) {
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
        if (!isValidWebhookSecret(secret)) {
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

        const buildStatus = hospital.appConfig?.buildStatus || 'NOT_BUILT';

        res.json({
            success: true,
            buildStatus: buildStatus,
            buildStartedAt: hospital.appConfig?.buildStartedAt,
            lastBuiltAt: hospital.appConfig?.lastBuiltAt,
            buildError: hospital.appConfig?.buildError || '',
            apkUrl: buildStatus === 'COMPLETED' ? (hospital.appConfig?.apkUrl || `/downloads/apks/${apkFile}`) : '',
            aabUrl: buildStatus === 'COMPLETED' ? (hospital.appConfig?.aabUrl || `/downloads/aabs/${aabFile}`) : ''
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

/**
 * GET /api/superadmin/hospitals/:id/download/rn-apk
 */
router.get('/:id/download/rn-apk', async (req, res) => {
    try {
        const hospital = await Hospital.findById(req.params.id);
        const safeName = hospital?.name ? hospital.name.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() : 'cityhospital';
        
        let filePath = path.join(__dirname, '../../public/downloads/apks', `${safeName}-rn-release.apk`);
        if (!fs.existsSync(filePath)) {
            filePath = path.join(__dirname, '../../public/downloads/apks/cityhospital-rn-release.apk');
        }

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: "RN APK file not found on server." });
        }

        res.setHeader('Content-Type', 'application/vnd.android.package-archive');
        res.setHeader('Content-Disposition', `attachment; filename="${hospital?.slug || safeName}-rn-release.apk"`);
        return res.sendFile(path.resolve(filePath));
    } catch (err) {
        console.error('Download RN APK error:', err);
        res.status(500).json({ message: 'Internal Server Error' });
    }
});

/**
 * GET /api/superadmin/hospitals/:id/download/rn-aab
 */
router.get('/:id/download/rn-aab', async (req, res) => {
    try {
        const hospital = await Hospital.findById(req.params.id);
        const safeName = hospital?.name ? hospital.name.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() : 'cityhospital';
        
        let filePath = path.join(__dirname, '../../public/downloads/aabs', `${safeName}-rn-release.aab`);
        if (!fs.existsSync(filePath)) {
            filePath = path.join(__dirname, '../../public/downloads/aabs/cityhospital-rn-release.aab');
        }

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ message: "RN AAB binary not found on server." });
        }
        
        res.download(filePath);
    } catch (err) {
        console.error('Download RN AAB error:', err);
        res.status(500).json({ message: 'Internal Server Error' });
    }
});

/**
 * Helper: Safely delete temporary uploaded files
 */
function safeDeleteFiles(files) {
    if (!Array.isArray(files)) return;
    for (const f of files) {
        try {
            if (f && f.path && fs.existsSync(f.path)) {
                fs.unlinkSync(f.path);
            }
        } catch (e) {
            console.error('[Build System] Error removing temp file:', e.message);
        }
    }
}

/**
 * Helper: Validate that a file is a valid ZIP archive (APKs and AABs are standard ZIP files)
 */
function isValidZipArchive(filePath) {
    try {
        if (!fs.existsSync(filePath)) return false;
        const fd = fs.openSync(filePath, 'r');
        const buffer = Buffer.alloc(4);
        const bytesRead = fs.readSync(fd, buffer, 0, 4, 0);
        fs.closeSync(fd);
        if (bytesRead < 4) return false;
        // Standard ZIP local file header begins with 0x50, 0x4B (ASCII 'PK')
        return buffer[0] === 0x50 && buffer[1] === 0x4B &&
            (buffer[2] === 0x03 || buffer[2] === 0x05 || buffer[2] === 0x07) &&
            (buffer[3] === 0x04 || buffer[3] === 0x06 || buffer[3] === 0x08);
    } catch (e) {
        return false;
    }
}

/**
 * Middleware: Verify RN Webhook Secret before any upload/multer processing.
 * Strictly requires GITHUB_WEBHOOK_SECRET in production (no dev-secret fallback).
 * Uses timing-safe comparison.
 */
function verifyRNWebhookSecret(req, res, next) {
    const providedSecret = req.query.secret;
    if (!providedSecret || typeof providedSecret !== 'string') {
        return res.status(403).json({ success: false, message: 'Unauthorized webhook request' });
    }

    const expectedSecret = process.env.GITHUB_WEBHOOK_SECRET;
    if (!expectedSecret) {
        console.error('[RN Webhook Security] GITHUB_WEBHOOK_SECRET is not configured on server. Webhook rejected.');
        return res.status(403).json({ success: false, message: 'Unauthorized: Webhook secret not configured on server' });
    }

    const providedBuffer = Buffer.from(providedSecret);
    const expectedBuffer = Buffer.from(expectedSecret);

    if (providedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(providedBuffer, expectedBuffer)) {
        return res.status(403).json({ success: false, message: 'Unauthorized webhook request' });
    }

    next();
}

// Temporary storage directory for incoming RN build uploads (independent of multipart body ordering)
const rnTempDir = path.join(__dirname, '../../public/downloads/temp');
if (!fs.existsSync(rnTempDir)) {
    fs.mkdirSync(rnTempDir, { recursive: true });
}

const rnBuildStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, rnTempDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
        const ext = file.fieldname === 'aab' ? '.aab' : '.apk';
        cb(null, `rn-build-${uniqueSuffix}${ext}`);
    }
});

const ALLOWED_APK_MIMES = [
    'application/vnd.android.package-archive',
    'application/octet-stream',
    'application/zip',
    'application/x-zip-compressed'
];

const ALLOWED_AAB_MIMES = [
    'application/octet-stream',
    'application/zip',
    'application/x-zip-compressed',
    'application/x-authorware-bin'
];

const uploadRnBuild = multer({
    storage: rnBuildStorage,
    limits: {
        fileSize: 250 * 1024 * 1024, // 250 MB limit per file
        files: 2
    },
    fileFilter: (req, file, cb) => {
        if (file.fieldname !== 'apk' && file.fieldname !== 'aab') {
            return cb(new Error(`Unexpected upload field '${file.fieldname}'. Only 'apk' and 'aab' are accepted.`));
        }
        const ext = path.extname(file.originalname || '').toLowerCase();
        if (file.fieldname === 'apk') {
            if (ext !== '.apk') {
                return cb(new Error(`Field 'apk' requires a file with .apk extension (received '${ext}')`));
            }
            if (!ALLOWED_APK_MIMES.includes(file.mimetype)) {
                return cb(new Error(`Invalid MIME type '${file.mimetype}' for APK file`));
            }
        } else if (file.fieldname === 'aab') {
            if (ext !== '.aab') {
                return cb(new Error(`Field 'aab' requires a file with .aab extension (received '${ext}')`));
            }
            if (!ALLOWED_AAB_MIMES.includes(file.mimetype)) {
                return cb(new Error(`Invalid MIME type '${file.mimetype}' for AAB file`));
            }
        }
        cb(null, true);
    }
});

/**
 * POST /api/superadmin/hospitals/:id/build-rn-app
 * Triggers the GitHub Actions white-label APK generation pipeline for React Native.
 */
router.post('/:id/build-rn-app', verifyCentralAdmin, async (req, res) => {
    const { id } = req.params;

    // Unique rnBuildId for build correlation & idempotency
    const rnBuildId = `rn-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

    // Atomic claim logic using findOneAndUpdate to prevent duplicate dispatch races
    const hospital = await Hospital.findOneAndUpdate(
        {
            _id: id,
            'appConfig.rnBuildStatus': { $nin: ['BUILDING', 'PROCESSING'] }
        },
        {
            $set: {
                isWhitelabeled: true,
                'appConfig.rnBuildStatus': 'BUILDING',
                'appConfig.rnBuildStartedAt': new Date(),
                'appConfig.rnBuildId': rnBuildId,
                'appConfig.rnBuildError': ''
            }
        },
        { new: true }
    );

    if (!hospital) {
        const existing = await Hospital.findById(id);
        if (!existing) {
            return res.status(404).json({ success: false, message: 'Hospital not found' });
        }
        return res.status(409).json({
            success: false,
            message: 'A mobile build is already in progress.',
            buildStatus: 'BUILDING'
        });
    }

    try {
        const safeAppName = (hospital.brandingSchema?.appName || hospital.branding?.appName || hospital.name || 'City Hospital')
            .replace(/[^a-zA-Z0-9\s]/g, '')
            .trim();
        
        let safeCode = hospital.hospitalCode;
        if (!safeCode) {
            safeCode = id.substring(0, 8);
        }
        const safeApplicationId = `com.medical365.${safeCode.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()}`;
        
        const logoUrl = hospital.branding?.logoUrl || 'default';
        const themeColor = hospital.branding?.primaryColor || '#14b8a6';

        const owner = process.env.GITHUB_OWNER || 'teammedical365-coder';
        const repo = process.env.GITHUB_RN_REPO || (process.env.GITHUB_REPO && process.env.GITHUB_REPO !== 'HMS' ? process.env.GITHUB_REPO : 'HMS-REACT-NATIVE-APP');
        const workflowId = 'react-native-build.yml'; 
        const githubToken = process.env.GITHUB_PAT || process.env.GITHUB_TOKEN || process.env.GH_TOKEN || process.env.GIT_PAT;
        const refBranch = process.env.GITHUB_REF || 'main';

        if (!githubToken) {
            const errorMsg = 'GitHub Token is not configured. Please set GITHUB_PAT or GITHUB_TOKEN in server environment to enable automated GitHub builds.';
            console.error(`[RN Build System Error] ${errorMsg}`);
            await Hospital.findByIdAndUpdate(id, {
                $set: {
                    'appConfig.rnBuildStatus': 'FAILED',
                    'appConfig.rnBuildError': errorMsg
                }
            });
            return res.status(500).json({
                success: false,
                message: errorMsg,
                buildStatus: 'FAILED'
            });
        }

        const githubUrl = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflowId}/dispatches`;
        
        let dispatchRes;
        try {
            dispatchRes = await axios.post(githubUrl, {
                ref: refBranch,
                inputs: {
                    tenantId: id.toString(),
                    hospitalName: safeAppName,
                    applicationId: safeApplicationId,
                    logoUrl: logoUrl,
                    themeColor: themeColor,
                    rnBuildId: rnBuildId
                }
            }, {
                headers: {
                    'Accept': 'application/vnd.github+json',
                    'Authorization': `Bearer ${githubToken.trim()}`,
                    'X-GitHub-Api-Version': '2022-11-28'
                },
                timeout: 15000
            });
        } catch (githubErr) {
            const statusCode = githubErr.response?.status;
            const errorData = githubErr.response?.data;
            const errorDetails = errorData?.message || githubErr.message;
            console.error(`[GitHub Actions RN Dispatch Error ${statusCode || 'Network'}]`, errorDetails);

            let friendlyMessage;
            if (statusCode === 401) {
                friendlyMessage = 'GitHub API Error (401): Bad credentials. Check GITHUB_PAT / GITHUB_TOKEN validity.';
            } else if (statusCode === 403) {
                friendlyMessage = 'GitHub API Error (403): Forbidden. Token lacks "repo" or "workflow" permissions.';
            } else if (statusCode === 404) {
                friendlyMessage = `GitHub API Error (404): Workflow '${workflowId}' not found in '${owner}/${repo}' on branch '${refBranch}'. Verify repository path and workflow filename.`;
            } else if (statusCode === 422) {
                friendlyMessage = `GitHub API Error (422): Unprocessable Entity. ${errorDetails}`;
            } else {
                friendlyMessage = `GitHub API Error (${statusCode || 'Network'}): ${errorDetails}`;
            }

            await Hospital.findByIdAndUpdate(id, {
                $set: {
                    'appConfig.rnBuildStatus': 'FAILED',
                    'appConfig.rnBuildError': friendlyMessage
                }
            });

            return res.status(statusCode || 500).json({
                success: false,
                message: friendlyMessage,
                buildStatus: 'FAILED'
            });
        }

        if (dispatchRes.status === 204 || dispatchRes.status === 200 || dispatchRes.status === 201) {
            console.log(`[Build System] Successfully dispatched GitHub RN workflow '${workflowId}' for tenant ${id} (HTTP ${dispatchRes.status}).`);
            return res.json({ 
                success: true, 
                message: `RN App build started successfully on GitHub Actions (HTTP ${dispatchRes.status})`,
                buildStatus: 'BUILDING',
                rnBuildId: rnBuildId
            });
        } else {
            const unexpectedMsg = `Unexpected response from GitHub: HTTP ${dispatchRes.status}`;
            console.warn(`[Build System] ${unexpectedMsg}`);
            await Hospital.findByIdAndUpdate(id, {
                $set: {
                    'appConfig.rnBuildStatus': 'FAILED',
                    'appConfig.rnBuildError': unexpectedMsg
                }
            });

            return res.status(500).json({
                success: false,
                message: unexpectedMsg,
                buildStatus: 'FAILED'
            });
        }

    } catch (err) {
        const errMessage = err.message || 'Failed to trigger RN build pipeline';
        console.error('[RN Build Orchestrator Error]', errMessage);
        
        try {
            await Hospital.findByIdAndUpdate(id, {
                $set: {
                    'appConfig.rnBuildStatus': 'FAILED',
                    'appConfig.rnBuildError': errMessage
                }
            });
        } catch(e) {
            console.error('Failed to update hospital status after error:', e.message);
        }

        res.status(500).json({ success: false, message: errMessage, buildStatus: 'FAILED' });
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
            hospital.appConfig.rnBuildId = '';
            hospital.appConfig.rnBuildError = '';
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
        let apkFile = `${safeName}-rn-release.apk`;
        let aabFile = `${safeName}-rn-release.aab`;
        let targetApkPath = path.join(__dirname, '../../public/downloads/apks', apkFile);

        if (!fs.existsSync(targetApkPath)) {
            apkFile = 'cityhospital-rn-release.apk';
            aabFile = 'cityhospital-rn-release.aab';
        }

        const rnBuildStatus = hospital.appConfig?.rnBuildStatus || 'NOT_BUILT';

        res.json({
            success: true,
            buildStatus: rnBuildStatus,
            rnBuildId: hospital.appConfig?.rnBuildId || '',
            buildStartedAt: hospital.appConfig?.rnBuildStartedAt,
            lastBuiltAt: hospital.appConfig?.rnLastBuiltAt,
            buildError: hospital.appConfig?.rnBuildError || '',
            apkUrl: rnBuildStatus === 'COMPLETED' ? (hospital.appConfig?.rnApkUrl || `/downloads/apks/${apkFile}`) : '',
            aabUrl: rnBuildStatus === 'COMPLETED' ? (hospital.appConfig?.rnAabUrl || `/downloads/aabs/${aabFile}`) : ''
        });
    } catch (err) {
        console.error('RN build status error:', err);
        res.status(500).json({ success: false, message: 'Error fetching RN build status' });
    }
});

/**
 * POST /api/superadmin/hospitals/webhook/github-rn
 * Webhook called by GitHub Actions when a React Native build finishes or fails.
 * Authenticates before processing and protects COMPLETED builds from late failure callbacks.
 */
router.post('/webhook/github-rn', verifyRNWebhookSecret, async (req, res) => {
    try {
        const { tenantId, rnBuildId, status, error } = req.body;

        if (!tenantId || !status || !rnBuildId) {
            return res.status(400).json({ success: false, message: 'Missing required payload fields: tenantId, rnBuildId, and status' });
        }

        const hospital = await Hospital.findById(tenantId);
        if (!hospital) {
            return res.status(404).json({ success: false, message: 'Tenant not found' });
        }

        if (!hospital.appConfig) {
            hospital.appConfig = {};
        }

        const currentStatus = hospital.appConfig.rnBuildStatus;
        const activeBuildId = hospital.appConfig.rnBuildId;

        // Build correlation is mandatory: every callback must match the active build exactly.
        if (!activeBuildId || rnBuildId !== activeBuildId) {
            console.warn(`[RN Webhook] Rejecting callback for rnBuildId '${rnBuildId}' (active build is '${activeBuildId || 'NONE'}').`);
            return res.status(409).json({
                success: false,
                message: 'Callback rejected: rnBuildId does not match the active RN build'
            });
        }

        if (status === 'COMPLETED') {
            // Idempotent: return success if already COMPLETED without rewriting
            if (currentStatus === 'COMPLETED') {
                return res.json({ success: true, message: 'RN Build is already COMPLETED (idempotent callback)' });
            }
            // Only transition BUILDING or PROCESSING -> COMPLETED for a new build
            if (currentStatus !== 'BUILDING' && currentStatus !== 'PROCESSING') {
                return res.status(409).json({
                    success: false,
                    message: `Invalid build state transition: expected BUILDING or PROCESSING, current is '${currentStatus || 'NOT_BUILT'}'`
                });
            }
            hospital.appConfig.rnBuildStatus = 'COMPLETED';
            hospital.appConfig.rnLastBuiltAt = new Date();
            hospital.appConfig.rnBuildError = '';
        } else if (status === 'FAILED') {
            // State protection:
            // - BUILDING -> FAILED is allowed
            // - PROCESSING -> FAILED must be ignored safely (do not overwrite active artifact finalization)
            // - COMPLETED -> FAILED must be ignored safely
            if (currentStatus === 'COMPLETED' || currentStatus === 'PROCESSING') {
                console.warn(`[RN Webhook] Ignoring late/concurrent FAILED webhook for tenant ${tenantId} as build status is '${currentStatus}'.`);
                return res.json({ 
                    success: true, 
                    message: `Ignored FAILED callback; build status is currently '${currentStatus}'.` 
                });
            }
            if (currentStatus !== 'BUILDING') {
                console.warn(`[RN Webhook] Ignoring FAILED webhook for tenant ${tenantId} as build status is '${currentStatus || 'NOT_BUILT'}'.`);
                return res.json({ 
                    success: true, 
                    message: `Ignored FAILED callback; build status is '${currentStatus || 'NOT_BUILT'}'.` 
                });
            }
            hospital.appConfig.rnBuildStatus = 'FAILED';
            hospital.appConfig.rnBuildError = error || 'GitHub Action pipeline failed';
        } else {
            return res.status(400).json({ success: false, message: `Unknown status '${status}'` });
        }

        await hospital.save();
        return res.json({ success: true, message: 'RN Build status updated successfully' });

    } catch (err) {
        console.error('RN Webhook processing error:', err);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
});

/**
 * POST /api/superadmin/hospitals/webhook/github-rn/upload
 * DEPRECATED: Legacy single-file RN upload endpoint.
 * Authenticates before multer and returns HTTP 410 Gone.
 */
router.post('/webhook/github-rn/upload', verifyRNWebhookSecret, async (req, res) => {
    return res.status(410).json({
        success: false,
        message: 'Endpoint deprecated (410 Gone). Combined APK and AAB upload is required via /webhook/github-rn/upload-build.'
    });
});

/**
 * POST /api/superadmin/hospitals/webhook/github-rn/upload-build
 * Webhook for combined RN APK and AAB file upload from GitHub Actions.
 * Authenticates BEFORE multer and resolves tenantId from query parameters before file persistence.
 */
router.post(
    '/webhook/github-rn/upload-build',
    verifyRNWebhookSecret,
    (req, res, next) => {
        uploadRnBuild.fields([
            { name: 'apk', maxCount: 1 },
            { name: 'aab', maxCount: 1 }
        ])(req, res, (err) => {
            if (err) {
                const tempFiles = [req.files?.apk?.[0], req.files?.aab?.[0]].filter(Boolean);
                safeDeleteFiles(tempFiles);
                return res.status(400).json({ success: false, message: `Upload error: ${err.message}` });
            }
            next();
        });
    },
    async (req, res) => {
        const apkFile = req.files?.apk?.[0];
        const aabFile = req.files?.aab?.[0];
        const tempFiles = [apkFile, aabFile].filter(Boolean);

        let destApk = null;
        let destAab = null;
        let stageApk = null;
        let stageAab = null;
        let backupApk = null;
        let backupAab = null;
        let hasBackupApk = false;
        let hasBackupAab = false;

        try {
            // Resolve tenantId and rnBuildId from req.query first, then fallback to req.body
            const tenantId = req.query.tenantId || req.body?.tenantId;
            const rnBuildId = req.query.rnBuildId || req.body?.rnBuildId;

            if (!tenantId || !rnBuildId) {
                safeDeleteFiles(tempFiles);
                return res.status(400).json({ success: false, message: 'Missing tenantId or rnBuildId in query parameters or body' });
            }

            // Both files must be present
            if (!apkFile || !aabFile) {
                safeDeleteFiles(tempFiles);
                return res.status(400).json({
                    success: false,
                    message: 'Missing required build files: both apk and aab are required'
                });
            }

            // Explicit extension validation & reject field/extension mismatch
            const apkExt = path.extname(apkFile.originalname || '').toLowerCase();
            const aabExt = path.extname(aabFile.originalname || '').toLowerCase();
            if (apkExt !== '.apk' || aabExt !== '.aab') {
                safeDeleteFiles(tempFiles);
                return res.status(400).json({
                    success: false,
                    message: 'Field and extension mismatch: apk field requires .apk and aab field requires .aab'
                });
            }

            // Explicit MIME type validation
            if (!ALLOWED_APK_MIMES.includes(apkFile.mimetype)) {
                safeDeleteFiles(tempFiles);
                return res.status(400).json({
                    success: false,
                    message: `Invalid MIME type '${apkFile.mimetype}' for APK file`
                });
            }
            if (!ALLOWED_AAB_MIMES.includes(aabFile.mimetype)) {
                safeDeleteFiles(tempFiles);
                return res.status(400).json({
                    success: false,
                    message: `Invalid MIME type '${aabFile.mimetype}' for AAB file`
                });
            }

            // Verify both files are non-empty
            if (apkFile.size <= 0 || aabFile.size <= 0) {
                safeDeleteFiles(tempFiles);
                return res.status(400).json({
                    success: false,
                    message: 'Invalid build files: zero-byte files are not accepted'
                });
            }

            // Keep ZIP magic/signature validation
            if (!isValidZipArchive(apkFile.path)) {
                safeDeleteFiles(tempFiles);
                return res.status(400).json({
                    success: false,
                    message: 'Invalid APK file: missing valid ZIP archive header'
                });
            }
            if (!isValidZipArchive(aabFile.path)) {
                safeDeleteFiles(tempFiles);
                return res.status(400).json({
                    success: false,
                    message: 'Invalid AAB file: missing valid ZIP archive header'
                });
            }

            const hospital = await Hospital.findById(tenantId);
            if (!hospital) {
                safeDeleteFiles(tempFiles);
                return res.status(404).json({ success: false, message: 'Tenant not found' });
            }

            const activeBuildId = hospital.appConfig?.rnBuildId;
            // Build correlation is mandatory: only the currently active build may finalize artifacts.
            if (!activeBuildId || rnBuildId !== activeBuildId) {
                safeDeleteFiles(tempFiles);
                console.warn(`[RN Upload Webhook] Rejecting upload for rnBuildId '${rnBuildId}' (active build is '${activeBuildId || 'NONE'}').`);
                return res.status(409).json({
                    success: false,
                    message: 'Upload rejected: rnBuildId does not match the active RN build'
                });
            }

            const safeName = hospital.name ? hospital.name.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() : 'cityhospital';

            const apkDir = path.join(__dirname, '../../public/downloads/apks');
            const aabDir = path.join(__dirname, '../../public/downloads/aabs');
            if (!fs.existsSync(apkDir)) fs.mkdirSync(apkDir, { recursive: true });
            if (!fs.existsSync(aabDir)) fs.mkdirSync(aabDir, { recursive: true });

            destApk = path.join(apkDir, `${safeName}-rn-release.apk`);
            destAab = path.join(aabDir, `${safeName}-rn-release.aab`);

            // Idempotency check before attempting transition:
            // If already COMPLETED and same existing artifacts exist on disk,
            // return success without rewriting files or modifying DB.
            if (hospital.appConfig?.rnBuildStatus === 'COMPLETED' && fs.existsSync(destApk) && fs.existsSync(destAab)) {
                safeDeleteFiles(tempFiles);
                return res.json({
                    success: true,
                    message: 'RN Build is already COMPLETED with existing artifacts (idempotent callback)',
                    apkUrl: hospital.appConfig?.rnApkUrl || `/downloads/apks/${safeName}-rn-release.apk`,
                    aabUrl: hospital.appConfig?.rnAabUrl || `/downloads/aabs/${safeName}-rn-release.aab`
                });
            }

            // Atomic claim transition: BUILDING -> PROCESSING
            // Ensures duplicate concurrent callbacks do not race to process or overwrite.
            const claimQuery = {
                _id: tenantId,
                'appConfig.rnBuildStatus': 'BUILDING'
            };
            if (rnBuildId) {
                claimQuery['appConfig.rnBuildId'] = rnBuildId;
            }

            const claimedHospital = await Hospital.findOneAndUpdate(
                claimQuery,
                {
                    $set: {
                        'appConfig.rnBuildStatus': 'PROCESSING'
                    }
                },
                { new: true }
            );

            if (!claimedHospital) {
                safeDeleteFiles(tempFiles);
                // Check if a concurrent callback already completed the build
                const currentDoc = await Hospital.findById(tenantId);
                if (currentDoc?.appConfig?.rnBuildStatus === 'COMPLETED' && fs.existsSync(destApk) && fs.existsSync(destAab)) {
                    return res.json({
                        success: true,
                        message: 'RN Build is already COMPLETED with existing artifacts (idempotent callback)',
                        apkUrl: currentDoc.appConfig?.rnApkUrl || `/downloads/apks/${safeName}-rn-release.apk`,
                        aabUrl: currentDoc.appConfig?.rnAabUrl || `/downloads/aabs/${safeName}-rn-release.aab`
                    });
                }
                return res.status(409).json({
                    success: false,
                    message: `Invalid build state transition: expected status BUILDING, but current status is '${currentDoc?.appConfig?.rnBuildStatus || 'NOT_BUILT'}'`
                });
            }

            // --- SAFE REPLACEMENT PIPELINE ---
            const opTimestamp = Date.now();

            // 1. Stage new APK and AAB first (never touch existing artifacts yet)
            stageApk = path.join(apkDir, `${safeName}-rn-release.apk.stage-${opTimestamp}`);
            stageAab = path.join(aabDir, `${safeName}-rn-release.aab.stage-${opTimestamp}`);
            fs.copyFileSync(apkFile.path, stageApk);
            fs.copyFileSync(aabFile.path, stageAab);

            // 2. Preserve/backup existing APK/AAB before replacement
            backupApk = path.join(apkDir, `${safeName}-rn-release.apk.bak-${opTimestamp}`);
            backupAab = path.join(aabDir, `${safeName}-rn-release.aab.bak-${opTimestamp}`);

            if (fs.existsSync(destApk)) {
                fs.copyFileSync(destApk, backupApk);
                hasBackupApk = true;
            }
            if (fs.existsSync(destAab)) {
                fs.copyFileSync(destAab, backupAab);
                hasBackupAab = true;
            }

            // 3. Move staged files into destination paths
            fs.renameSync(stageApk, destApk);
            stageApk = null; // Successfully moved

            fs.renameSync(stageAab, destAab);
            stageAab = null; // Successfully moved

            // Clean up temp uploads now that new artifacts are in destination
            safeDeleteFiles(tempFiles);

            // 4. Final atomic transition: PROCESSING -> COMPLETED
            const completedHospital = await Hospital.findOneAndUpdate(
                {
                    _id: tenantId,
                    'appConfig.rnBuildStatus': 'PROCESSING',
                    'appConfig.rnBuildId': rnBuildId
                },
                {
                    $set: {
                        'appConfig.rnBuildStatus': 'COMPLETED',
                        'appConfig.rnLastBuiltAt': new Date(),
                        'appConfig.rnBuildError': '',
                        'appConfig.rnApkUrl': `/downloads/apks/${safeName}-rn-release.apk`,
                        'appConfig.rnAabUrl': `/downloads/aabs/${safeName}-rn-release.aab`
                    }
                },
                { new: true }
            );

            if (!completedHospital) {
                throw new Error('Failed to update hospital status from PROCESSING to COMPLETED in database');
            }

            // 5. On success: remove old backups
            if (hasBackupApk && backupApk && fs.existsSync(backupApk)) {
                try { fs.unlinkSync(backupApk); } catch (e) {}
            }
            if (hasBackupAab && backupAab && fs.existsSync(backupAab)) {
                try { fs.unlinkSync(backupAab); } catch (e) {}
            }

            return res.json({
                success: true,
                message: 'RN APK and AAB uploaded and build status updated successfully',
                apkUrl: completedHospital.appConfig.rnApkUrl,
                aabUrl: completedHospital.appConfig.rnAabUrl
            });
        } catch (err) {
            safeDeleteFiles(tempFiles);

            // On failure: restore previous artifacts from backup
            if (hasBackupApk && backupApk && fs.existsSync(backupApk) && destApk) {
                try {
                    fs.copyFileSync(backupApk, destApk);
                    fs.unlinkSync(backupApk);
                    console.warn(`[Build Safety] Restored previous valid APK from backup: ${destApk}`);
                } catch (e) {
                    console.error('[Build Safety] Error restoring APK from backup:', e.message);
                }
            } else if (!hasBackupApk && destApk && fs.existsSync(destApk)) {
                // If there was no previous valid APK, remove partial file
                try { fs.unlinkSync(destApk); } catch (e) {}
            }

            if (hasBackupAab && backupAab && fs.existsSync(backupAab) && destAab) {
                try {
                    fs.copyFileSync(backupAab, destAab);
                    fs.unlinkSync(backupAab);
                    console.warn(`[Build Safety] Restored previous valid AAB from backup: ${destAab}`);
                } catch (e) {
                    console.error('[Build Safety] Error restoring AAB from backup:', e.message);
                }
            } else if (!hasBackupAab && destAab && fs.existsSync(destAab)) {
                // If there was no previous valid AAB, remove partial file
                try { fs.unlinkSync(destAab); } catch (e) {}
            }

            // Remove any dangling staging files
            if (stageApk && fs.existsSync(stageApk)) {
                try { fs.unlinkSync(stageApk); } catch (e) {}
            }
            if (stageAab && fs.existsSync(stageAab)) {
                try { fs.unlinkSync(stageAab); } catch (e) {}
            }

            // Keep DB state consistent
            try {
                const tenantId = req.query.tenantId || req.body?.tenantId;
                if (tenantId) {
                    await Hospital.findOneAndUpdate(
                        { _id: tenantId, 'appConfig.rnBuildStatus': 'PROCESSING', 'appConfig.rnBuildId': rnBuildId },
                        {
                            $set: {
                                'appConfig.rnBuildStatus': 'FAILED',
                                'appConfig.rnBuildError': `Artifact replacement failed: ${err.message}`
                            }
                        }
                    );
                }
            } catch (dbErr) {
                console.error('[Build Safety] Error updating hospital status after failure:', dbErr.message);
            }

            console.error('Upload RN combined build webhook error:', err);
            return res.status(500).json({ success: false, message: 'Internal Server Error' });
        }
    }
);

module.exports = router;
