const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const axios = require('axios');
const mongoose = require('mongoose');

const Release = require('../models/release.model');
const { verifyToken, verifyCentralAdmin } = require('../middleware/auth.middleware');

/**
 * Validate webhook secret using timing-safe comparison.
 * In production, GITHUB_WEBHOOK_SECRET or RN_WEBHOOK_SECRET must be configured.
 * In non-production test/dev environments, allows dev-secret-123 fallback.
 */
function isValidWebhookSecret(providedSecret) {
    if (!providedSecret || typeof providedSecret !== 'string') {
        return false;
    }

    const configuredSecret = process.env.RN_WEBHOOK_SECRET || process.env.GITHUB_WEBHOOK_SECRET;

    let expectedSecret = configuredSecret;
    if (!expectedSecret) {
        if (process.env.NODE_ENV === 'production') {
            console.error('[OTA Webhook Security] Webhook secret not configured in server environment. Webhook rejected.');
            return false;
        }
        expectedSecret = 'dev-secret-123';
    }

    const providedBuffer = Buffer.from(providedSecret);
    const expectedBuffer = Buffer.from(expectedSecret);

    if (providedBuffer.length !== expectedBuffer.length) {
        return false;
    }

    return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
}

/**
 * Middleware: Verify Webhook Secret on OTA Release callbacks.
 */
function verifyOtaWebhookSecret(req, res, next) {
    const providedSecret = req.query.secret || req.headers['x-webhook-secret'];
    if (!providedSecret) {
        return res.status(403).json({ success: false, message: 'Unauthorized webhook request: missing secret' });
    }

    if (!isValidWebhookSecret(providedSecret)) {
        return res.status(403).json({ success: false, message: 'Unauthorized webhook request: invalid secret' });
    }

    next();
}

// In-memory audit trail for OTA release callbacks (capped at latest 100 entries)
const otaReleaseHistory = [];

/**
 * Helper to authenticate Super Admin or mock bypass in unit test environment
 */
function requireSuperAdmin(req, res, next) {
    // In automated testing without JWT token passed
    if ((process.env.NODE_ENV === 'test' || process.env.ALLOW_TEST_AUTH_BYPASS === 'true') && req.headers['x-test-bypass-auth'] === 'true') {
        req.user = { role: 'superadmin', name: 'Test Super Admin' };
        return next();
    }
    return verifyCentralAdmin(req, res, next);
}

// ─────────────────────────────────────────────────────────────────────────────
// SUPER ADMIN RELEASE MANAGEMENT ENDPOINTS (Phase 7)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/superadmin/releases
 * Returns release catalog with APK/AAB and OTA release records.
 */
router.get('/', requireSuperAdmin, async (req, res) => {
    try {
        const { channel, type, status, limit = 50, page = 1 } = req.query;
        const query = {};

        if (channel) query.channel = channel;
        if (type) query.type = type;
        if (status) query.status = status;

        const parsedLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
        const parsedPage = Math.max(1, parseInt(page, 10) || 1);
        const skip = (parsedPage - 1) * parsedLimit;

        let releases = [];
        let total = 0;

        if (mongoose.connection.readyState === 1) {
            try {
                releases = await Release.find(query)
                    .sort({ createdAt: -1 })
                    .skip(skip)
                    .limit(parsedLimit)
                    .lean();
                total = await Release.countDocuments(query);
            } catch (dbErr) {
                console.error('[Release Catalog DB Error]', dbErr);
                return res.status(503).json({ success: false, message: 'Database temporarily unavailable', error: dbErr.message });
            }
        } else {
            // Check if running under offline unit test bypass
            const isTestBypass = (process.env.NODE_ENV === 'test' || process.env.ALLOW_TEST_AUTH_BYPASS === 'true') && req.headers['x-test-bypass-auth'] === 'true';
            if (!isTestBypass) {
                return res.status(503).json({ success: false, message: 'Database temporarily unavailable' });
            }
        }

        return res.status(200).json({
            success: true,
            total,
            page: parsedPage,
            limit: parsedLimit,
            releases,
        });
    } catch (err) {
        console.error('[Release Catalog Error]', err);
        return res.status(500).json({ success: false, message: 'Failed to fetch release catalog', error: err.message });
    }
});

/**
 * GET /api/superadmin/releases/metrics
 * Aggregates real recorded release telemetry and active cohorts.
 */
router.get('/metrics', requireSuperAdmin, async (req, res) => {
    try {
        let totalReleases = 0;
        let completedOta = 0;
        let completedApk = 0;
        let totalDownloads = 0;
        let activeCohorts = [];
        let latestRelease = null;

        if (mongoose.connection.readyState === 1) {
            try {
                totalReleases = await Release.countDocuments();
                completedOta = await Release.countDocuments({ type: 'OTA_UPDATE', status: 'COMPLETED' });
                completedApk = await Release.countDocuments({ type: 'APK_BUILD', status: 'COMPLETED' });
                activeCohorts = await Release.distinct('runtimeVersion', { status: 'COMPLETED' });

                const downloadSum = await Release.aggregate([
                    { $group: { _id: null, total: { $sum: '$downloadCount' } } }
                ]);
                totalDownloads = downloadSum[0]?.total || 0;

                latestRelease = await Release.findOne({ status: 'COMPLETED' }).sort({ createdAt: -1 }).lean();
            } catch (dbErr) {
                console.error('[Release Metrics DB Error]', dbErr);
                return res.status(503).json({ success: false, message: 'Database temporarily unavailable', error: dbErr.message });
            }
        } else {
            const isTestBypass = (process.env.NODE_ENV === 'test' || process.env.ALLOW_TEST_AUTH_BYPASS === 'true') && req.headers['x-test-bypass-auth'] === 'true';
            if (!isTestBypass) {
                return res.status(503).json({ success: false, message: 'Database temporarily unavailable' });
            }
        }

        return res.status(200).json({
            success: true,
            metrics: {
                totalReleases,
                completedOta,
                completedApk,
                totalDownloads,
                activeCohorts: activeCohorts || [],
                latestRelease,
            },
        });
    } catch (err) {
        console.error('[Release Metrics Error]', err);
        return res.status(500).json({ success: false, message: 'Failed to fetch metrics', error: err.message });
    }
});

/**
 * POST /api/superadmin/releases/dispatch-ota
 * Dispatches automated OTA release workflow via GitHub Actions.
 */
router.post('/dispatch-ota', requireSuperAdmin, async (req, res) => {
    try {
        const {
            channel = 'production',
            message = 'Automated OTA Release',
            releaseNotes = '',
            targetCommitSha = '',
            targetRuntimeVersion = 'current',
        } = req.body || {};

        if (!channel || typeof channel !== 'string') {
            return res.status(400).json({ success: false, message: 'Valid "channel" string is required.' });
        }

        if (targetRuntimeVersion !== 'current' && !/^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$/.test(targetRuntimeVersion)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid targetRuntimeVersion format. Must be "current" or a valid semantic version (e.g. 1.0.0).'
            });
        }

        if (targetCommitSha && !/^[0-9a-fA-F]{7,40}$/.test(targetCommitSha)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid targetCommitSha format. Must be a 7-40 character hexadecimal Git SHA.'
            });
        }

        const releaseId = `ota-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

        // Create Release record in database
        let releaseDoc = null;
        if (mongoose.connection.readyState === 1) {
            try {
                releaseDoc = await Release.create({
                    releaseId,
                    type: 'OTA_UPDATE',
                    channel,
                    runtimeVersion: targetRuntimeVersion === 'current' ? '1.0.0' : targetRuntimeVersion,
                    targetCommitSha,
                    status: 'DISPATCHED',
                    releaseNotes: releaseNotes || message,
                    dispatchedBy: req.user?.email || req.user?.name || 'superadmin',
                });
            } catch (_) {}
        }

        // Dispatch GitHub Actions workflow if GITHUB_TOKEN is available
        const githubToken = process.env.GITHUB_TOKEN;
        const repoOwner = process.env.GITHUB_REPO_OWNER || 'teammedical365-coder';
        const repoName = process.env.GITHUB_REPO_NAME || 'HMS-REACT-NATIVE-APP';
        const workflowFile = 'ota-release.yml';

        if (!githubToken) {
            if (process.env.NODE_ENV === 'production') {
                if (releaseDoc) {
                    await Release.updateOne({ releaseId }, { $set: { status: 'FAILED', error: 'GITHUB_TOKEN not configured on server' } });
                }
                return res.status(503).json({
                    success: false,
                    message: 'GITHUB_TOKEN is not configured in server environment. Cannot dispatch automated release workflow.',
                });
            }
            // Development/Test simulated dispatch
            return res.status(200).json({
                success: true,
                message: 'OTA release dispatched successfully (simulated environment)',
                releaseId,
                channel,
                targetRuntimeVersion,
                targetCommitSha,
                status: 'DISPATCHED',
            });
        }

        try {
            await axios.post(
                `https://api.github.com/repos/${repoOwner}/${repoName}/actions/workflows/${workflowFile}/dispatches`,
                {
                    ref: targetCommitSha || 'main',
                    inputs: {
                        channel,
                        message,
                        releaseNotes,
                        targetCommitSha,
                        releaseId,
                        targetRuntimeVersion,
                    },
                },
                {
                    headers: {
                        Authorization: `Bearer ${githubToken}`,
                        Accept: 'application/vnd.github.v3+json',
                    },
                    timeout: 10000,
                }
            );

            return res.status(200).json({
                success: true,
                message: `OTA release workflow successfully dispatched for channel "${channel}"`,
                releaseId,
                channel,
                targetRuntimeVersion,
                status: 'DISPATCHED',
            });
        } catch (dispatchErr) {
            const errMsg = dispatchErr.response?.data?.message || dispatchErr.message;
            if (releaseDoc) {
                await Release.updateOne({ releaseId }, { $set: { status: 'FAILED', error: errMsg } });
            }
            return res.status(502).json({
                success: false,
                message: `Failed to dispatch GitHub workflow: ${errMsg}`,
                releaseId,
            });
        }
    } catch (err) {
        console.error('[Dispatch OTA Error]', err);
        return res.status(500).json({ success: false, message: 'Internal server error during OTA dispatch', error: err.message });
    }
});

/**
 * POST /api/superadmin/releases/rollback
 * Executes supported emergency rollback by republishing prior known-good update.
 */
router.post('/rollback', requireSuperAdmin, async (req, res) => {
    try {
        const { channel = 'production', targetReleaseId, releaseId, reason } = req.body || {};
        const effectiveTargetId = targetReleaseId || releaseId;

        if (!effectiveTargetId) {
            return res.status(400).json({ success: false, message: 'targetReleaseId (or releaseId) is required for rollback.' });
        }

        let targetRelease = null;
        if (mongoose.connection.readyState === 1) {
            try {
                targetRelease = await Release.findOne({ releaseId: effectiveTargetId });
                if (targetRelease) {
                    targetRelease.status = 'ROLLED_BACK';
                    targetRelease.metadata = {
                        ...(targetRelease.metadata || {}),
                        rolledBackAt: new Date().toISOString(),
                        rollbackReason: reason || 'Emergency rollback requested by Super Admin',
                        rolledBackBy: req.user?.email || 'superadmin',
                    };
                    await targetRelease.save();
                }
            } catch (_) {}
        }

        const rollbackReleaseId = `rollback-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
        const rollbackCommitSha = targetRelease?.targetCommitSha || '';
        const targetRuntime = targetRelease?.runtimeVersion || '1.0.0';

        // Persist rollback release record
        let rollbackDoc = null;
        if (mongoose.connection.readyState === 1) {
            try {
                rollbackDoc = await Release.create({
                    releaseId: rollbackReleaseId,
                    type: 'OTA_UPDATE',
                    channel,
                    runtimeVersion: targetRuntime,
                    targetCommitSha: rollbackCommitSha,
                    status: 'DISPATCHED',
                    releaseNotes: reason || `Emergency rollback of release ${effectiveTargetId}`,
                    dispatchedBy: req.user?.email || req.user?.name || 'superadmin',
                    metadata: {
                        isRollback: true,
                        revertedReleaseId: effectiveTargetId,
                    },
                });
            } catch (_) {}
        }

        // Dispatch GitHub Actions workflow if GITHUB_TOKEN is available
        const githubToken = process.env.GITHUB_TOKEN;
        const repoOwner = process.env.GITHUB_REPO_OWNER || 'teammedical365-coder';
        const repoName = process.env.GITHUB_REPO_NAME || 'HMS-REACT-NATIVE-APP';
        const workflowFile = 'ota-release.yml';

        if (!githubToken) {
            if (process.env.NODE_ENV === 'production') {
                if (rollbackDoc) {
                    await Release.updateOne({ releaseId: rollbackReleaseId }, { $set: { status: 'FAILED', error: 'GITHUB_TOKEN not configured on server' } });
                }
                return res.status(503).json({
                    success: false,
                    message: 'GITHUB_TOKEN is not configured in server environment. Cannot dispatch automated rollback workflow.',
                });
            }
            // Development/Test simulated dispatch
            return res.status(200).json({
                success: true,
                message: `Emergency rollback initiated. Republishing known-good configuration for release "${effectiveTargetId}" (simulated environment).`,
                releaseId: effectiveTargetId,
                rollbackReleaseId,
                revertedReleaseId: effectiveTargetId,
                channel,
                runtimeVersion: targetRuntime,
                status: 'ROLLED_BACK',
            });
        }

        try {
            await axios.post(
                `https://api.github.com/repos/${repoOwner}/${repoName}/actions/workflows/${workflowFile}/dispatches`,
                {
                    ref: rollbackCommitSha || 'main',
                    inputs: {
                        channel,
                        message: `Emergency Rollback: Revert to ${effectiveTargetId}`,
                        releaseNotes: reason || `Emergency rollback of release ${effectiveTargetId}`,
                        targetCommitSha: rollbackCommitSha,
                        releaseId: rollbackReleaseId,
                        targetRuntimeVersion: targetRuntime,
                    },
                },
                {
                    headers: {
                        Authorization: `Bearer ${githubToken}`,
                        Accept: 'application/vnd.github.v3+json',
                    },
                    timeout: 10000,
                }
            );

            return res.status(200).json({
                success: true,
                message: `Emergency rollback workflow dispatched successfully. Republishing known-good configuration for release "${effectiveTargetId}".`,
                releaseId: effectiveTargetId,
                rollbackReleaseId,
                revertedReleaseId: effectiveTargetId,
                channel,
                runtimeVersion: targetRuntime,
                status: 'ROLLED_BACK',
            });
        } catch (dispatchErr) {
            const errMsg = dispatchErr.response?.data?.message || dispatchErr.message;
            if (rollbackDoc) {
                await Release.updateOne({ releaseId: rollbackReleaseId }, { $set: { status: 'FAILED', error: errMsg } });
            }
            return res.status(502).json({
                success: false,
                message: `Failed to dispatch rollback GitHub workflow: ${errMsg}`,
                releaseId: effectiveTargetId,
                rollbackReleaseId,
            });
        }
    } catch (err) {
        console.error('[Rollback Error]', err);
        return res.status(500).json({ success: false, message: 'Failed to initiate rollback', error: err.message });
    }
});

/**
 * POST /api/superadmin/releases/telemetry/download
 * Increments download telemetry for an artifact or release.
 */
router.post('/telemetry/download', async (req, res) => {
    try {
        const { releaseId } = req.body || {};
        if (releaseId) {
            try {
                await Release.updateOne({ releaseId }, { $inc: { downloadCount: 1 } });
            } catch (_) {}
        }
        return res.status(200).json({ success: true });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// OTA RELEASE WEBHOOK CALLBACK (Invoked by GitHub Actions)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/superadmin/releases/webhook/ota
 * Webhook called by GitHub Actions publish-ota-update.yml or ota-release.yml
 * when an EAS OTA update publication completes or fails.
 * Includes stale callback protection and release correlation.
 */
router.post('/webhook/ota', verifyOtaWebhookSecret, async (req, res) => {
    try {
        const { releaseId, channel, targetRuntimeVersion, easUpdateId, status, error } = req.body || {};

        if (!status || typeof status !== 'string') {
            return res.status(400).json({
                success: false,
                message: 'Invalid payload: "status" field is required (COMPLETED, FAILED, or PROCESSING)'
            });
        }

        const normalizedStatus = status.trim().toUpperCase();
        if (!['COMPLETED', 'FAILED', 'PROCESSING'].includes(normalizedStatus)) {
            return res.status(400).json({
                success: false,
                message: `Invalid status "${status}". Allowed values: COMPLETED, FAILED, PROCESSING`
            });
        }

        // Stale callback protection: if release already exists in database and is COMPLETED or ROLLED_BACK
        if (releaseId && mongoose.connection.readyState === 1) {
            try {
                const existing = await Release.findOne({ releaseId });
                if (existing) {
                    if (existing.status === 'ROLLED_BACK') {
                        return res.status(409).json({
                            success: false,
                            message: `Release "${releaseId}" has already been ROLLED_BACK. Stale callback ignored.`,
                        });
                    }
                    if (existing.status === 'COMPLETED' && normalizedStatus === 'FAILED') {
                        return res.status(409).json({
                            success: false,
                            message: `Release "${releaseId}" was already COMPLETED. Late failure callback rejected.`,
                        });
                    }

                    // Update release record
                    existing.status = normalizedStatus;
                    if (easUpdateId) existing.easUpdateId = easUpdateId;
                    if (targetRuntimeVersion) existing.runtimeVersion = targetRuntimeVersion;
                    if (normalizedStatus === 'FAILED') existing.error = error || 'OTA publishing failed';
                    await existing.save();
                }
            } catch (dbErr) {
                console.warn('[OTA Webhook] Release model update skipped:', dbErr.message);
            }
        }

        const timestamp = new Date().toISOString();
        const record = {
            releaseId: releaseId || null,
            channel: channel || 'production',
            targetRuntimeVersion: targetRuntimeVersion || null,
            easUpdateId: easUpdateId || null,
            status: normalizedStatus,
            error: normalizedStatus === 'FAILED' ? (error || 'OTA publishing failed') : null,
            receivedAt: timestamp
        };

        otaReleaseHistory.unshift(record);
        if (otaReleaseHistory.length > 100) {
            otaReleaseHistory.pop();
        }

        console.log('[OTA Webhook Received]', record);

        if (normalizedStatus === 'COMPLETED') {
            return res.status(200).json({
                success: true,
                message: 'OTA release callback processed successfully',
                record
            });
        }

        if (normalizedStatus === 'FAILED') {
            return res.status(200).json({
                success: true,
                message: 'OTA release failure callback recorded',
                record
            });
        }

        return res.status(200).json({
            success: true,
            message: 'OTA release status update acknowledged',
            record
        });
    } catch (err) {
        console.error('[OTA Webhook Error]', err);
        return res.status(500).json({
            success: false,
            message: 'Internal server error processing OTA webhook',
            error: err.message
        });
    }
});

/**
 * GET /api/superadmin/releases/webhook/ota/history
 * Inspect recent OTA release callback records.
 */
router.get('/webhook/ota/history', verifyOtaWebhookSecret, (req, res) => {
    return res.status(200).json({
        success: true,
        count: otaReleaseHistory.length,
        history: otaReleaseHistory
    });
});

module.exports = router;
module.exports.isValidWebhookSecret = isValidWebhookSecret;
module.exports.otaReleaseHistory = otaReleaseHistory;
