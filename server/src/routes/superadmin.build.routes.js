const express = require('express');
const router = express.Router();
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const Hospital = require('../models/hospital.model');
const { verifyToken } = require('../middleware/auth.middleware');

// Central Admin verify middleware
const verifyCentralAdmin = async (req, res, next) => {
    try {
        await verifyToken(req, res, () => {
            const role = req.user.role;
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
 * Trigger background Capacitor/Android native build.
 */
router.post('/:id/build-app', verifyCentralAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const hospital = await Hospital.findById(id);

        if (!hospital) {
            return res.status(404).json({ success: false, message: 'Hospital not found' });
        }

        // Initialize appConfig if missing
        if (!hospital.appConfig) {
            hospital.appConfig = {};
        }

        if (hospital.appConfig.buildStatus === 'BUILDING') {
            return res.status(400).json({ success: false, message: 'App is already building.' });
        }

        // Force white-label flag to true so the engine proceeds
        hospital.isWhitelabeled = true;
        hospital.appConfig.buildStatus = 'BUILDING';
        hospital.appConfig.buildStartedAt = new Date();
        hospital.appConfig.buildError = '';
        await hospital.save();

        // Respond immediately so frontend can begin polling
        res.json({ success: true, message: 'Build initiated successfully.' });

        // Spawn background task
        const scriptPath = path.join(__dirname, '../../scripts/build-whitelabel.js');
        
        // Ensure scripts/build-whitelabel.js runs successfully non-blocking
        const child = spawn('node', [scriptPath, `--tenantId=${hospital._id.toString()}`], {
            cwd: path.join(__dirname, '../../'),
            stdio: ['ignore', 'pipe', 'pipe'] // Capture stdout/stderr, ignore stdin
        });

        let outputLog = '';

        child.stdout.on('data', (data) => {
            const str = data.toString();
            outputLog += str;
            console.log(`[Build Output] ${str}`);
        });

        child.stderr.on('data', (data) => {
            const str = data.toString();
            outputLog += str;
            console.error(`[Build Error] ${str}`);
        });

        child.on('close', async (code) => {
            console.log(`[White-Label Build] Process exited with code ${code} for hospital ${id}`);
            try {
                const updatedHospital = await Hospital.findById(id);
                const safeName = updatedHospital.name.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'app';
                const apkPath = path.join(__dirname, '../../public/downloads/apks', `${safeName}-release.apk`);
                const aabPath = path.join(__dirname, '../../public/downloads/aabs', `${safeName}-release.aab`);

                let fileIsValid = false;
                if (fs.existsSync(apkPath) && fs.existsSync(aabPath)) {
                    const apkStat = fs.statSync(apkPath);
                    const aabStat = fs.statSync(aabPath);
                    if (apkStat.size >= 1000000 && aabStat.size >= 1000000) {
                        try {
                            const apkFd = fs.openSync(apkPath, 'r');
                            const aabFd = fs.openSync(aabPath, 'r');
                            const apkHeader = Buffer.alloc(2);
                            const aabHeader = Buffer.alloc(2);
                            fs.readSync(apkFd, apkHeader, 0, 2, 0);
                            fs.readSync(aabFd, aabHeader, 0, 2, 0);
                            fs.closeSync(apkFd);
                            fs.closeSync(aabFd);
                            
                            if (apkHeader.toString('hex') === '504b' && aabHeader.toString('hex') === '504b') {
                                fileIsValid = true;
                            } else {
                                console.error('[White-Label Build] Invalid ZIP header detected in generated APK or AAB.');
                            }
                        } catch (headerErr) {
                            console.error('[White-Label Build] Error reading binary headers:', headerErr);
                        }
                    }
                }

                if (code === 0 && fileIsValid) {
                    updatedHospital.appConfig.buildStatus = 'COMPLETED';
                    updatedHospital.appConfig.lastBuiltAt = new Date();
                    
                    // Assign download URLs
                    updatedHospital.appConfig.apkUrl = `/downloads/apks/${safeName}-release.apk`;
                    updatedHospital.appConfig.aabUrl = `/downloads/aabs/${safeName}-release.aab`;
                } else {
                    updatedHospital.appConfig.buildStatus = 'FAILED';
                    if (!fileIsValid && code === 0) {
                        updatedHospital.appConfig.buildError = "Build script succeeded, but generated APK or AAB is missing or under 1MB.";
                    } else {
                        updatedHospital.appConfig.buildError = outputLog.substring(0, 500) || "Build process failed with non-zero exit code.";
                    }
                    console.error(`[Build Error Reason] ${updatedHospital.appConfig.buildError}`);
                }
                await updatedHospital.save();
            } catch (dbErr) {
                console.error('[White-Label Build] Failed to update DB after build:', dbErr);
            }
        });

    } catch (err) {
        console.error('Build trigger error:', err);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
});

/**
 * GET /api/superadmin/hospitals/:id/build-status
 * Poll endpoint for the frontend.
 */
router.get('/:id/build-status', verifyCentralAdmin, async (req, res) => {
    try {
        const hospital = await Hospital.findById(req.params.id).select('appConfig').lean();
        if (!hospital) return res.status(404).json({ success: false, message: 'Not found' });
        
        res.json({
            success: true,
            buildStatus: hospital.appConfig?.buildStatus || 'NOT_BUILT',
            buildStartedAt: hospital.appConfig?.buildStartedAt,
            lastBuiltAt: hospital.appConfig?.lastBuiltAt,
            buildError: hospital.appConfig?.buildError,
            apkUrl: hospital.appConfig?.apkUrl,
            aabUrl: hospital.appConfig?.aabUrl
        });
    } catch (err) {
        console.error('Build status error:', err);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
});

/**
 * GET /api/superadmin/hospitals/:id/download/apk
 * Download APK explicitly (with proper 404 fallback instead of Vite SPA)
 */
router.get('/:id/download/apk', async (req, res) => {
    try {
        const hospital = await Hospital.findById(req.params.id);
        if (!hospital) return res.status(404).json({ message: 'Hospital not found' });
        
        const safeName = hospital.name.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'app';
        const filePath = path.join(__dirname, '../../public/downloads/apks', `${safeName}-release.apk`);
        
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: "APK file not generated yet. Please trigger build." });
        }

        const stat = fs.statSync(filePath);
        if (stat.size < 1000000) { // If less than 1MB, it's not a real APK
            return res.status(500).json({ error: "Invalid APK binary size detected." });
        }

        res.setHeader('Content-Type', 'application/vnd.android.package-archive');
        res.setHeader('Content-Disposition', `attachment; filename="${hospital.slug || safeName}-release.apk"`);
        return res.sendFile(path.resolve(filePath));
    } catch (err) {
        console.error('Download APK error:', err);
        res.status(500).json({ message: 'Internal Server Error' });
    }
});

/**
 * GET /api/superadmin/hospitals/:id/download/aab
 * Download AAB explicitly (with proper 404 fallback instead of Vite SPA)
 */
router.get('/:id/download/aab', async (req, res) => {
    try {
        const hospital = await Hospital.findById(req.params.id);
        if (!hospital) return res.status(404).json({ message: 'Hospital not found' });
        
        const safeName = hospital.name.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'app';
        const filePath = path.join(__dirname, '../../public/downloads/aabs', `${safeName}-release.aab`);
        
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ message: "AAB binary not found on server. Please re-run build." });
        }
        
        res.download(filePath);
    } catch (err) {
        console.error('Download AAB error:', err);
        res.status(500).json({ message: 'Internal Server Error' });
    }
});

module.exports = router;
