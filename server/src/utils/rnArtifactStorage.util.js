const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const {
    calculateFileSha256,
    verifyDigest,
    PRODUCTION_RELEASE_CERT_SHA256,
    isValidZipArchive,
    isMockStorageUrl,
    isGitHubRunSummaryUrl,
    isPresignedUrl
} = require('./artifactStorage.util');

/**
 * rnArtifactStorage.util.js
 * 
 * Dedicated Local Artifact Storage Engine for Medical365 React Native Release APK & AAB binaries.
 * 
 * Invariants:
 * 1. Dedicated Local Filesystem Storage: Saves artifacts in a dedicated local directory (RN_ARTIFACTS_DIR),
 *    completely outside publicly served static directories.
 * 2. Tenant Isolation & Collision Prevention: Strict directory hierarchy
 *    <RN_ARTIFACTS_DIR>/<hospitalId>/<versionCode>/<buildId>/app-release.apk
 *    Guarantees hospitals with identical names never collide or overwrite each other.
 * 3. Path Traversal Protection: Strictly validates all identifiers and prevents directory traversal.
 * 4. Atomic Staging & Resilient Rollback: Uses .stage-<timestamp> and .bak-<timestamp> with atomic renames.
 *    If an upload or staging operation fails, previous artifacts are restored and partial files unlinked.
 * 5. Cryptographic Integrity & Attestation Binding: Validates SHA-256 digests and binds verified
 *    package ID and signing certificate fingerprints from authenticated build workflows.
 * 6. Cloud Storage Isolation: NEVER invokes ImageKit or external cloud storage for RN release binaries.
 *    Leaves all other HMS storage (images, patient reports, lab docs) completely untouched.
 */

/**
 * Returns the resolved base directory for RN release artifacts.
 * Defaults to `server/storage/rn-artifacts`.
 */
function getRNArtifactsBaseDir() {
    const customDir = process.env.RN_ARTIFACTS_DIR;
    const resolvedDir = customDir
        ? path.resolve(customDir)
        : path.resolve(__dirname, '../../storage/rn-artifacts');
    if (!fs.existsSync(resolvedDir)) {
        fs.mkdirSync(resolvedDir, { recursive: true });
    }
    return resolvedDir;
}

/**
 * Validates path identifier parameters (tenantId, versionCode, rnBuildId)
 * to prevent directory traversal or malformed paths.
 */
function validateRNPathIdentifiers({ tenantId, versionCode, rnBuildId }) {
    if (!tenantId || (typeof tenantId !== 'string' && typeof tenantId !== 'object')) {
        throw new Error('Invalid tenantId: must be a non-empty string or ObjectId');
    }
    const cleanTenantId = String(tenantId).trim();
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(cleanTenantId)) {
        throw new Error(`Invalid tenantId '${cleanTenantId}': contains disallowed characters`);
    }

    const cleanVersionCode = Number(versionCode);
    if (!Number.isInteger(cleanVersionCode) || cleanVersionCode < 1) {
        throw new Error(`Invalid versionCode '${versionCode}': must be a positive integer`);
    }

    if (!rnBuildId || typeof rnBuildId !== 'string') {
        throw new Error('Invalid rnBuildId: must be a non-empty string');
    }
    const cleanBuildId = rnBuildId.trim();
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(cleanBuildId)) {
        throw new Error(`Invalid rnBuildId '${cleanBuildId}': contains disallowed characters`);
    }

    return {
        cleanTenantId,
        cleanVersionCode,
        cleanBuildId
    };
}

/**
 * Resolves the directory and file paths for an RN artifact build.
 */
function getRNArtifactFilePaths({ tenantId, versionCode, rnBuildId }) {
    const { cleanTenantId, cleanVersionCode, cleanBuildId } = validateRNPathIdentifiers({
        tenantId,
        versionCode,
        rnBuildId
    });

    const baseDir = getRNArtifactsBaseDir();
    const targetDir = path.resolve(baseDir, cleanTenantId, String(cleanVersionCode), cleanBuildId);

    // Path traversal check
    if (!targetDir.startsWith(baseDir)) {
        throw new Error('Path traversal detected in RN artifact directory path');
    }

    const apkPath = path.resolve(targetDir, 'app-release.apk');
    const aabPath = path.resolve(targetDir, 'app-release.aab');

    // Canonical storage keys for DB records
    const apkStorageKey = `rn-artifacts/${cleanTenantId}/${cleanVersionCode}/${cleanBuildId}/app-release.apk`;
    const aabStorageKey = `rn-artifacts/${cleanTenantId}/${cleanVersionCode}/${cleanBuildId}/app-release.aab`;

    return {
        baseDir,
        targetDir,
        apkPath,
        aabPath,
        apkStorageKey,
        aabStorageKey,
        cleanTenantId,
        cleanVersionCode,
        cleanBuildId
    };
}

/**
 * Validates whether a stored or candidate URL is a safe, legitimate artifact URL.
 * Accepts:
 * 1. Genuine public cloud URLs (http:// or https://)
 * 2. Authenticated backend download routes (/api/superadmin/hospitals/.../download/...)
 * 3. Legacy local download paths (/downloads/...)
 * Rejects:
 * 1. Mock internal hosts (*.internal, mock-storage)
 * 2. GitHub Actions run-summary URLs
 * 3. Presigned temporary URLs
 */
function isSafeStoredArtifactUrl(url) {
    if (!url || typeof url !== 'string') return false;
    const trimmed = url.trim();
    if (isMockStorageUrl(trimmed) || isGitHubRunSummaryUrl(trimmed) || isPresignedUrl(trimmed)) {
        return false;
    }
    if (trimmed.startsWith('https://') || trimmed.startsWith('http://')) {
        return true;
    }
    if (trimmed.startsWith('/api/superadmin/hospitals/') || trimmed.startsWith('/downloads/')) {
        return true;
    }
    return false;
}

/**
 * Resolves an existing local file path from an RN storageKey or relative path.
 * Ensures the resolved file is strictly located inside RN_ARTIFACTS_DIR.
 * @param {string} storageKey 
 * @returns {string|null} Absolute path to artifact or null if not found
 */
function resolveRNArtifactDownloadPath(storageKey) {
    if (!storageKey || typeof storageKey !== 'string') return null;
    const baseDir = getRNArtifactsBaseDir();

    let relativeKey = storageKey.trim();
    if (relativeKey.startsWith('rn-artifacts/')) {
        relativeKey = relativeKey.substring('rn-artifacts/'.length);
    } else if (relativeKey.startsWith('rn-artifacts\\')) {
        relativeKey = relativeKey.substring('rn-artifacts\\'.length);
    }

    const resolved = path.resolve(baseDir, relativeKey);
    if (resolved.startsWith(baseDir) && fs.existsSync(resolved)) {
        return resolved;
    }

    return null;
}

/**
 * Stores RN release artifacts (APK and AAB) locally using atomic staging and renames.
 * Calculates cryptographic SHA-256 digests and persists metadata in ReleaseArtifact model.
 * 
 * @param {Object} params
 * @param {string} params.tempApkPath - Temporary file path of uploaded APK
 * @param {string} params.tempAabPath - Temporary file path of uploaded AAB
 * @param {string} params.tenantId - Hospital Tenant ID
 * @param {number} params.versionCode - Integer version code
 * @param {string} params.versionName - Semantic version name (e.g. 1.0.2)
 * @param {string} params.applicationId - Android application package ID
 * @param {string} params.rnBuildId - Build correlation ID
 * @param {string} [params.releaseId] - Release ID
 * @param {string} [params.expectedApkSha256] - Expected APK SHA-256 checksum from builder
 * @param {string} [params.expectedAabSha256] - Expected AAB SHA-256 checksum from builder
 * @param {string} [params.certFingerprintSha256] - Signer certificate SHA-256 fingerprint
 * @param {string} [params.signingMode] - 'legacy_debug' or 'production'
 * @returns {Promise<Object>} Storage results and metadata
 */
async function storeRNArtifactsLocal({
    tempApkPath,
    tempAabPath,
    tenantId,
    versionCode,
    versionName,
    applicationId,
    rnBuildId,
    releaseId,
    expectedApkSha256,
    expectedAabSha256,
    certFingerprintSha256,
    aabCertFingerprintSha256,
    signingMode = 'legacy_debug'
}) {
    if (!tempApkPath || !fs.existsSync(tempApkPath)) {
        throw new Error(`Temp APK file not found at ${tempApkPath}`);
    }
    if (!tempAabPath || !fs.existsSync(tempAabPath)) {
        throw new Error(`Temp AAB file not found at ${tempAabPath}`);
    }

    const apkSize = fs.statSync(tempApkPath).size;
    const aabSize = fs.statSync(tempAabPath).size;
    if (apkSize <= 0) throw new Error('Uploaded APK is empty (0 bytes)');
    if (aabSize <= 0) throw new Error('Uploaded AAB is empty (0 bytes)');

    if (!isValidZipArchive(tempApkPath)) {
        throw new Error('Uploaded APK file is not a valid ZIP/APK archive');
    }
    if (!isValidZipArchive(tempAabPath)) {
        throw new Error('Uploaded AAB file is not a valid ZIP/AAB archive');
    }

    const {
        targetDir,
        apkPath,
        aabPath,
        apkStorageKey,
        aabStorageKey,
        cleanTenantId,
        cleanVersionCode,
        cleanBuildId
    } = getRNArtifactFilePaths({ tenantId, versionCode, rnBuildId });

    if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
    }

    // 1. Calculate SHA-256 checksums from disk via streaming
    const actualApkSha256 = await calculateFileSha256(tempApkPath);
    if (expectedApkSha256 && !verifyDigest(actualApkSha256, expectedApkSha256)) {
        const err = new Error(`APK checksum mismatch: expected ${expectedApkSha256}, got ${actualApkSha256}`);
        err.code = 'INTEGRITY_MISMATCH';
        throw err;
    }

    const actualAabSha256 = await calculateFileSha256(tempAabPath);
    if (expectedAabSha256 && !verifyDigest(actualAabSha256, expectedAabSha256)) {
        const err = new Error(`AAB checksum mismatch: expected ${expectedAabSha256}, got ${actualAabSha256}`);
        err.code = 'INTEGRITY_MISMATCH';
        throw err;
    }

    // 2. Validate signing certificate fingerprint for production builds
    const cleanCertSha = certFingerprintSha256 ? String(certFingerprintSha256).replace(/[^a-fA-F0-9]/g, '').toUpperCase() : '';
    const cleanAabCertSha = aabCertFingerprintSha256 ? String(aabCertFingerprintSha256).replace(/[^a-fA-F0-9]/g, '').toUpperCase() : '';

    if (cleanCertSha && cleanAabCertSha && cleanCertSha !== cleanAabCertSha) {
        const err = new Error(`Signer certificate mismatch between APK (${cleanCertSha}) and AAB (${cleanAabCertSha})`);
        err.code = 'SIGNER_MISMATCH';
        throw err;
    }

    if (signingMode === 'production') {
        if (!cleanCertSha) {
            const err = new Error('Production APK upload requires verified certFingerprintSha256');
            err.code = 'MISSING_SIGNATURE_ATTESTATION';
            throw err;
        }
        if (cleanCertSha !== PRODUCTION_RELEASE_CERT_SHA256) {
            const err = new Error(`Production APK signature (${cleanCertSha}) does not match Medical365 production release certificate (${PRODUCTION_RELEASE_CERT_SHA256})`);
            err.code = 'CERT_SIGNATURE_MISMATCH';
            throw err;
        }
        if (cleanAabCertSha && cleanAabCertSha !== PRODUCTION_RELEASE_CERT_SHA256) {
            const err = new Error(`Production AAB signature (${cleanAabCertSha}) does not match Medical365 production release certificate (${PRODUCTION_RELEASE_CERT_SHA256})`);
            err.code = 'CERT_SIGNATURE_MISMATCH';
            throw err;
        }
    }

    // 3. Staging and Atomic Replacement Pipeline
    const opTimestamp = Date.now();
    const stageApk = path.join(targetDir, `app-release.apk.stage-${opTimestamp}`);
    const stageAab = path.join(targetDir, `app-release.aab.stage-${opTimestamp}`);
    const backupApk = path.join(targetDir, `app-release.apk.bak-${opTimestamp}`);
    const backupAab = path.join(targetDir, `app-release.aab.bak-${opTimestamp}`);

    let hasBackupApk = false;
    let hasBackupAab = false;

    try {
        // Stage files first
        fs.copyFileSync(tempApkPath, stageApk);
        fs.copyFileSync(tempAabPath, stageAab);

        // Backup existing artifacts if present
        if (fs.existsSync(apkPath)) {
            fs.copyFileSync(apkPath, backupApk);
            hasBackupApk = true;
        }
        if (fs.existsSync(aabPath)) {
            fs.copyFileSync(aabPath, backupAab);
            hasBackupAab = true;
        }

        // Atomic replacement via renameSync
        fs.renameSync(stageApk, apkPath);
        fs.renameSync(stageAab, aabPath);

        // Successfully replaced: clean up backups
        if (hasBackupApk && fs.existsSync(backupApk)) {
            try { fs.unlinkSync(backupApk); } catch (_) {}
        }
        if (hasBackupAab && fs.existsSync(backupAab)) {
            try { fs.unlinkSync(backupAab); } catch (_) {}
        }

        // 4. Record in ReleaseArtifact model if Mongoose is available
        try {
            const mongoose = require('mongoose');
            if (mongoose.connection && mongoose.connection.readyState === 1) {
                const ReleaseArtifact = require('../models/releaseArtifact.model');
                if (ReleaseArtifact && ReleaseArtifact.findOneAndUpdate) {
                    const finalAppId = (applicationId || 'com.medical365.app').trim().toLowerCase();
                    const finalVersionName = versionName || '1.0.0';

                    // Save APK record
                    await ReleaseArtifact.findOneAndUpdate(
                        { storageKey: apkStorageKey },
                        {
                            $set: {
                                storageKey: apkStorageKey,
                                artifactType: 'APK',
                                fileName: 'app-release.apk',
                                fileSize: apkSize,
                                checksumSha256: actualApkSha256,
                                versionCode: cleanVersionCode,
                                versionName: finalVersionName,
                                applicationId: finalAppId,
                                tenantId: cleanTenantId,
                                rnBuildId: cleanBuildId,
                                releaseId: releaseId || '',
                                provider: 'local',
                                publicUrl: `/api/superadmin/hospitals/${cleanTenantId}/download/rn-apk`,
                                metadata: {
                                    certFingerprintSha256: cleanCertSha,
                                    signingMode
                                }
                            }
                        },
                        { upsert: true, new: true }
                    );

                    // Save AAB record
                    await ReleaseArtifact.findOneAndUpdate(
                        { storageKey: aabStorageKey },
                        {
                            $set: {
                                storageKey: aabStorageKey,
                                artifactType: 'AAB',
                                fileName: 'app-release.aab',
                                fileSize: aabSize,
                                checksumSha256: actualAabSha256,
                                versionCode: cleanVersionCode,
                                versionName: finalVersionName,
                                applicationId: finalAppId,
                                tenantId: cleanTenantId,
                                rnBuildId: cleanBuildId,
                                releaseId: releaseId || '',
                                provider: 'local',
                                publicUrl: `/api/superadmin/hospitals/${cleanTenantId}/download/rn-aab`,
                                metadata: {
                                    certFingerprintSha256: cleanCertSha,
                                    signingMode
                                }
                            }
                        },
                        { upsert: true, new: true }
                    );
                }
            }
        } catch (dbErr) {
            console.warn('[RNLocalArtifactStorage] ReleaseArtifact DB record skipped (offline):', dbErr.message);
        }

        return {
            success: true,
            apkPath,
            aabPath,
            apkStorageKey,
            aabStorageKey,
            apkSize,
            aabSize,
            apkSha256: actualApkSha256,
            aabSha256: actualAabSha256,
            provider: 'local',
            cleanCertSha,
            cleanAabCertSha,
            signingMode
        };
    } catch (stagingErr) {
        // Rollback staging files
        if (fs.existsSync(stageApk)) {
            try { fs.unlinkSync(stageApk); } catch (_) {}
        }
        if (fs.existsSync(stageAab)) {
            try { fs.unlinkSync(stageAab); } catch (_) {}
        }

        // Restore destination files from backups if they existed
        if (hasBackupApk && fs.existsSync(backupApk)) {
            try {
                fs.copyFileSync(backupApk, apkPath);
                fs.unlinkSync(backupApk);
            } catch (_) {}
        }
        if (hasBackupAab && fs.existsSync(backupAab)) {
            try {
                fs.copyFileSync(backupAab, aabPath);
                fs.unlinkSync(backupAab);
            } catch (_) {}
        }

        throw stagingErr;
    }
}

module.exports = {
    getRNArtifactsBaseDir,
    validateRNPathIdentifiers,
    getRNArtifactFilePaths,
    isSafeStoredArtifactUrl,
    resolveRNArtifactDownloadPath,
    storeRNArtifactsLocal
};

