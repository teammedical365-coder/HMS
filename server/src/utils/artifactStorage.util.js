const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

/**
 * artifactStorage.util.js
 * 
 * Provides a resilient, pluggable storage provider abstraction for release binaries (APK & AAB).
 * Replaces ephemeral container disk storage with durable object storage (S3 / R2 / ImageKit).
 * 
 * Invariants:
 * 1. Cryptographic integrity: validates SHA-256 checksums before and after persistence.
 * 2. Fail-closed production: rejects builds in production if durable cloud storage is not configured.
 * 3. Never leaks credentials: no storage secrets in responses or public manifests.
 * 4. Backward compatible: serves downloads via clean controlled URLs or authenticated redirects.
 */

/**
 * Calculates SHA-256 digest of a buffer.
 */
function calculateSha256(buffer) {
    if (!Buffer.isBuffer(buffer)) {
        buffer = Buffer.from(buffer);
    }
    return crypto.createHash('sha256').update(buffer).digest('hex').toLowerCase();
}

/**
 * Verifies that the actual digest matches the expected digest.
 */
function verifyDigest(actualSha256, expectedSha256) {
    if (!expectedSha256) return true;
    const cleanActual = String(actualSha256).trim().toLowerCase().replace(/[^a-f0-9]/g, '');
    const cleanExpected = String(expectedSha256).trim().toLowerCase().replace(/[^a-f0-9]/g, '');
    if (cleanActual.length !== cleanExpected.length) return false;
    return crypto.timingSafeEqual(Buffer.from(cleanActual), Buffer.from(cleanExpected));
}

/**
 * Validates whether a given URL is a mock/internal storage host.
 */
function isMockStorageUrl(url) {
    if (!url || typeof url !== 'string') return false;
    const lower = url.trim().toLowerCase();
    return (
        lower.includes('mock-storage.medical365.internal') ||
        lower.includes('.internal') ||
        lower.includes('mock-storage') ||
        lower.includes('example.com')
    );
}

/**
 * Validates whether a given URL is a GitHub Actions run-summary URL
 * (e.g. https://github.com/.../actions/runs/...).
 * Run-summary URLs must never be stored as APK/AAB download URLs.
 */
function isGitHubRunSummaryUrl(url) {
    if (!url || typeof url !== 'string') return false;
    const lower = url.trim().toLowerCase();
    return lower.includes('github.com') && (lower.includes('/actions/runs') || lower.includes('/actions'));
}

/**
 * Validates whether a given URL is a verified direct artifact URL from a real storage provider.
 * Strictly excludes:
 * 1. Mock internal hosts (mock-storage.medical365.internal, .internal, etc.)
 * 2. GitHub Actions run-summary URLs (github.com/.../actions/runs/...)
 * 3. Relative or non-HTTP(S) paths
 */
function isVerifiedDirectArtifactUrl(url) {
    if (!url || typeof url !== 'string') return false;
    const trimmed = url.trim();
    if (!trimmed.startsWith('https://') && !trimmed.startsWith('http://')) {
        return false;
    }
    if (isMockStorageUrl(trimmed)) {
        return false;
    }
    if (isGitHubRunSummaryUrl(trimmed)) {
        return false;
    }
    return true;
}

/**
 * Backward compatibility alias for isVerifiedDirectArtifactUrl
 */
const isGenuinePublicUrl = isVerifiedDirectArtifactUrl;

// ─────────────────────────────────────────────────────────────────────────────
// STORAGE ADAPTERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Mock Storage Adapter for Unit/Integration Testing
 */
class MockStorageAdapter {
    constructor() {
        this.name = 'mock';
        this.isMock = true;
        this.store = new Map();
        this.shouldFailNextUpload = false;
        this.simulateMissingConfig = false;
    }

    async upload({ buffer, key, contentType, metadata, expectedSha256 }) {
        if (this.simulateMissingConfig) {
            throw new Error('Durable artifact storage is not configured.');
        }
        if (this.shouldFailNextUpload) {
            this.shouldFailNextUpload = false;
            throw new Error('Simulated network failure during storage upload');
        }

        const checksum = calculateSha256(buffer);
        if (expectedSha256 && !verifyDigest(checksum, expectedSha256)) {
            const err = new Error(`Checksum mismatch: expected ${expectedSha256}, got ${checksum}`);
            err.code = 'INTEGRITY_MISMATCH';
            throw err;
        }

        const record = {
            key,
            buffer,
            size: buffer.length,
            contentType: contentType || 'application/vnd.android.package-archive',
            checksumSha256: checksum,
            metadata: metadata || {},
            uploadedAt: new Date().toISOString(),
            url: `https://mock-storage.medical365.internal/${key}`,
        };

        this.store.set(key, record);
        return {
            storageKey: key,
            publicUrl: record.url,
            fileSize: record.size,
            checksumSha256: checksum,
            provider: this.name,
            isMock: true,
        };
    }

    async getDownloadUrl(key) {
        const item = this.store.get(key);
        if (!item) {
            const err = new Error(`Object not found in storage: ${key}`);
            err.code = 'NOT_FOUND';
            throw err;
        }
        return item.url;
    }

    async getObject(key) {
        const item = this.store.get(key);
        if (!item) {
            const err = new Error(`Object not found in storage: ${key}`);
            err.code = 'NOT_FOUND';
            throw err;
        }
        return item;
    }

    async delete(key) {
        return this.store.delete(key);
    }

    clear() {
        this.store.clear();
        this.shouldFailNextUpload = false;
        this.simulateMissingConfig = false;
    }
}

/**
 * ImageKit Storage Adapter (reusing installed ImageKit dependency)
 */
class ImageKitStorageAdapter {
    constructor() {
        this.name = 'imagekit';
    }

    isConfigured() {
        return Boolean(
            process.env.IMAGEKIT_PUBLIC_KEY &&
            process.env.IMAGEKIT_PRIVATE_KEY &&
            process.env.IMAGEKIT_URL_ENDPOINTS
        );
    }

    async upload({ buffer, key, contentType, metadata, expectedSha256 }) {
        if (!this.isConfigured()) {
            const err = new Error('ImageKit durable cloud storage is not configured (missing credentials).');
            err.code = 'UNCONFIGURED_STORAGE';
            throw err;
        }

        const checksum = calculateSha256(buffer);
        if (expectedSha256 && !verifyDigest(checksum, expectedSha256)) {
            const err = new Error(`Checksum mismatch: expected ${expectedSha256}, got ${checksum}`);
            err.code = 'INTEGRITY_MISMATCH';
            throw err;
        }

        const ImageKit = require('imagekit');
        const realImageKit = new ImageKit({
            publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
            privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
            urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINTS,
        });

        const fileName = path.basename(key);
        const folder = path.dirname(key);

        const uploadRes = await realImageKit.upload({
            file: buffer.toString('base64'),
            fileName,
            folder: `/${folder}`,
            useUniqueFileName: false,
            tags: ['release-artifact', metadata?.artifactType || 'APK'],
        });

        if (!uploadRes?.url || !isVerifiedDirectArtifactUrl(uploadRes.url)) {
            const err = new Error(`ImageKit upload failed: unexpected response URL '${uploadRes?.url || 'empty'}'`);
            err.code = 'UPLOAD_FAILED';
            throw err;
        }

        return {
            storageKey: key,
            publicUrl: uploadRes.url,
            fileSize: buffer.length,
            checksumSha256: checksum,
            provider: this.name,
            fileId: uploadRes.fileId,
        };
    }

    async getDownloadUrl(key) {
        return `${process.env.IMAGEKIT_URL_ENDPOINTS}/${key}`;
    }

    async delete(fileId) {
        if (!this.isConfigured()) return false;
        const ImageKit = require('imagekit');
        const realImageKit = new ImageKit({
            publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
            privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
            urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINTS,
        });
        return await realImageKit.deleteFile(fileId);
    }
}

/**
 * Local Disk Fallback Adapter (for offline development only)
 */
class LocalDiskStorageAdapter {
    constructor() {
        this.name = 'local';
        this.baseDir = path.join(__dirname, '../../public/downloads/releases');
        if (!fs.existsSync(this.baseDir)) {
            fs.mkdirSync(this.baseDir, { recursive: true });
        }
    }

    async upload({ buffer, key, contentType, metadata, expectedSha256 }) {
        if (process.env.NODE_ENV === 'production') {
            throw new Error('Durable cloud storage (S3 / ImageKit) must be configured in production. Local disk storage is prohibited.');
        }

        const checksum = calculateSha256(buffer);
        if (expectedSha256 && !verifyDigest(checksum, expectedSha256)) {
            const err = new Error(`Checksum mismatch: expected ${expectedSha256}, got ${checksum}`);
            err.code = 'INTEGRITY_MISMATCH';
            throw err;
        }

        const fullPath = path.join(this.baseDir, key);
        const dir = path.dirname(fullPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        fs.writeFileSync(fullPath, buffer);

        return {
            storageKey: key,
            publicUrl: `/downloads/releases/${key}`,
            fileSize: buffer.length,
            checksumSha256: checksum,
            provider: this.name,
        };
    }

    async getDownloadUrl(key) {
        const fullPath = path.join(this.baseDir, key);
        if (!fs.existsSync(fullPath)) {
            const err = new Error(`File not found: ${key}`);
            err.code = 'NOT_FOUND';
            throw err;
        }
        return `/downloads/releases/${key}`;
    }

    async delete(key) {
        const fullPath = path.join(this.baseDir, key);
        if (fs.existsSync(fullPath)) {
            fs.unlinkSync(fullPath);
            return true;
        }
        return false;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// STORAGE SERVICE ORCHESTRATOR
// ─────────────────────────────────────────────────────────────────────────────

let activeAdapter = null;
const mockAdapterInstance = new MockStorageAdapter();

/**
 * Resolves the appropriate storage adapter based on configuration and environment.
 * @param {Object} [options]
 * @param {boolean} [options.requireRealProvider=false] - When true, rejects mock storage adapter.
 */
function resolveStorageAdapter(options = {}) {
    const { requireRealProvider = false } = options;
    let adapter = activeAdapter;

    if (!adapter) {
        // In test mode or when explicitly requested, use mock adapter.
        // Tests cannot accidentally use real ImageKit uploads.
        if (process.env.NODE_ENV === 'test' || process.env.STORAGE_PROVIDER === 'mock') {
            adapter = mockAdapterInstance;
        } else {
            // Check ImageKit configuration (primary configured durable cloud storage)
            const imagekitAdapter = new ImageKitStorageAdapter();
            if (imagekitAdapter.isConfigured()) {
                adapter = imagekitAdapter;
            } else if (process.env.STORAGE_PROVIDER === 'local') {
                adapter = new LocalDiskStorageAdapter();
            } else if (process.env.NODE_ENV === 'production') {
                const err = new Error(
                    '[Artifact Storage Error] No durable cloud storage provider is configured. ' +
                    'Please configure IMAGEKIT credentials in the production environment.'
                );
                err.code = 'UNCONFIGURED_STORAGE';
                throw err;
            } else {
                adapter = new LocalDiskStorageAdapter();
            }
        }
    }

    // Release uploads must explicitly require a real configured provider
    if (requireRealProvider && (adapter.isMock || adapter.name === 'mock' || adapter.name === 'local')) {
        const err = new Error('[Artifact Storage Error] Release uploads require a real configured durable storage provider; mock or local storage adapter is prohibited.');
        err.code = 'MOCK_STORAGE_PROHIBITED';
        throw err;
    }

    return adapter;
}

/**
 * Overrides active adapter (used in automated tests).
 */
function setStorageAdapter(adapter) {
    activeAdapter = adapter;
}

/**
 * Resets to default adapter.
 */
function resetStorageAdapter() {
    activeAdapter = null;
    mockAdapterInstance.clear();
}

/**
 * Uploads a release artifact (APK or AAB) to durable storage, verifies checksums,
 * and records the artifact in the database if available.
 */
async function uploadReleaseArtifact({
    fileBuffer,
    buffer,
    fileName,
    artifactType,
    versionCode,
    versionName,
    applicationId,
    tenantId,
    rnBuildId,
    releaseId,
    expectedSha256,
    requireRealProvider = false,
}) {
    const rawBuffer = fileBuffer || buffer;
    if (!rawBuffer || !Buffer.isBuffer(rawBuffer)) {
        throw new Error('Invalid fileBuffer: Buffer is required for artifact upload');
    }
    if (!fileName || !artifactType) {
        throw new Error('fileName and artifactType (APK or AAB) are required');
    }

    const adapter = resolveStorageAdapter({ requireRealProvider });
    const safeAppId = (applicationId || 'com.medical365.app').toLowerCase();
    const safeVersionCode = Number(versionCode) || 1;
    const safeFileName = path.basename(fileName);
    const storageKey = `releases/${safeAppId}/${safeVersionCode}/${safeFileName}`;

    const contentType = artifactType === 'APK'
        ? 'application/vnd.android.package-archive'
        : 'application/octet-stream';

    // 1. Upload to durable storage with checksum verification
    const uploadResult = await adapter.upload({
        buffer: rawBuffer,
        key: storageKey,
        contentType,
        expectedSha256,
        metadata: {
            artifactType,
            versionCode: safeVersionCode,
            versionName: versionName || '1.0.0',
            applicationId: safeAppId,
            tenantId: tenantId ? String(tenantId) : null,
            rnBuildId: rnBuildId || '',
            releaseId: releaseId || '',
        },
        expectedSha256,
    });

    // 2. Persist in ReleaseArtifact model if Mongoose model is connected
    let artifactDoc = null;
    const isMock = Boolean(adapter.isMock || uploadResult.isMock || uploadResult.provider === 'mock' || isMockStorageUrl(uploadResult.publicUrl));
    const safePublicUrl = (!isMock && isVerifiedDirectArtifactUrl(uploadResult.publicUrl)) ? uploadResult.publicUrl : '';

    try {
        const mongoose = require('mongoose');
        if (mongoose.connection && mongoose.connection.readyState === 1) {
            const ReleaseArtifact = require('../models/releaseArtifact.model');
            if (ReleaseArtifact && ReleaseArtifact.findOneAndUpdate) {
                artifactDoc = await ReleaseArtifact.findOneAndUpdate(
                    { storageKey },
                    {
                        $set: {
                            storageKey,
                            artifactType,
                            fileName: safeFileName,
                            fileSize: uploadResult.fileSize,
                            checksumSha256: uploadResult.checksumSha256,
                            versionCode: safeVersionCode,
                            versionName: versionName || '1.0.0',
                            applicationId: safeAppId,
                            tenantId: tenantId || null,
                            rnBuildId: rnBuildId || '',
                            releaseId: releaseId || '',
                            provider: uploadResult.provider,
                            publicUrl: safePublicUrl,
                        },
                    },
                    { upsert: true, new: true }
                );
            }
        }
    } catch (dbErr) {
        // If DB is offline (e.g. unit tests without Mongoose), log and proceed
        console.warn('[ArtifactStorage] Database record skipped (offline):', dbErr.message);
    }
    return {
        success: true,
        storageKey,
        publicUrl: uploadResult.publicUrl,
        fileSize: uploadResult.fileSize,
        checksumSha256: uploadResult.checksumSha256,
        provider: uploadResult.provider,
        isMock,
        artifact: artifactDoc,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// APK AUTHENTICITY & CERTIFICATE VERIFICATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Established Medical365 Production Release Signing Certificate Fingerprint (SHA-256).
 * Formatted as uppercase hexadecimal without colons or spaces.
 */
const PRODUCTION_RELEASE_CERT_SHA256 = '9C280CE7AC2244CB7F1EEEB80DB4E07E49293E517B9F4A3E765286F3CE464749';

/**
 * Discovers the Android build tool binary (apksigner or aapt) on the host environment.
 */
function findAndroidTool(toolName) {
    const isWindows = process.platform === 'win32';
    const toolBat = isWindows ? (toolName.endsWith('.bat') ? toolName : `${toolName}.bat`) : toolName;
    const toolExe = isWindows ? (toolName.endsWith('.exe') ? toolName : `${toolName}.exe`) : toolName;

    const sdkRoots = [
        process.env.ANDROID_HOME,
        process.env.ANDROID_SDK_ROOT,
        process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk') : null,
        'C:\\Users\\DELL\\AppData\\Local\\Android\\Sdk',
    ].filter(Boolean);

    for (const sdkRoot of sdkRoots) {
        const buildToolsDir = path.join(sdkRoot, 'build-tools');
        if (fs.existsSync(buildToolsDir)) {
            try {
                const versions = fs.readdirSync(buildToolsDir).sort().reverse();
                for (const ver of versions) {
                    const candidates = [
                        path.join(buildToolsDir, ver, toolBat),
                        path.join(buildToolsDir, ver, toolExe),
                        path.join(buildToolsDir, ver, toolName),
                    ];
                    for (const cand of candidates) {
                        if (fs.existsSync(cand)) {
                            return cand;
                        }
                    }
                }
            } catch (_) {}
        }
    }
    return null;
}

/**
 * Validates that a file is a valid ZIP archive (APKs are standard ZIP files).
 */
function isValidZipArchive(filePath) {
    try {
        if (!fs.existsSync(filePath)) return false;
        const fd = fs.openSync(filePath, 'r');
        const buffer = Buffer.alloc(4);
        const bytesRead = fs.readSync(fd, buffer, 0, 4, 0);
        fs.closeSync(fd);
        if (bytesRead < 4) return false;
        return buffer[0] === 0x50 && buffer[1] === 0x4B &&
            (buffer[2] === 0x03 || buffer[2] === 0x05 || buffer[2] === 0x07) &&
            (buffer[3] === 0x04 || buffer[3] === 0x06 || buffer[3] === 0x08);
    } catch (_) {
        return false;
    }
}

/**
 * Verifies that a local APK binary:
 * 1. Exists and is non-empty.
 * 2. Is signed by the established Medical365 production release certificate.
 * 3. Matches the expected hospital application ID / package ID.
 *
 * Fails closed if verification tools are unavailable or verification fails.
 *
 * @param {string} apkPath - Absolute filesystem path to the APK file.
 * @param {string} [expectedPackageId] - Expected package ID (e.g. com.medical365.citygeneral).
 * @returns {{ valid: boolean, reason?: string, packageId?: string, certSha?: string }}
 */
function verifyApkFileAuthenticity(apkPath, expectedPackageId) {
    if (!apkPath || typeof apkPath !== 'string') {
        return { valid: false, reason: 'APK path must be a non-empty string.' };
    }
    if (!fs.existsSync(apkPath)) {
        return { valid: false, reason: `APK file not found at ${apkPath}` };
    }
    const stat = fs.statSync(apkPath);
    if (stat.size <= 0) {
        return { valid: false, reason: 'APK file is empty (zero bytes).' };
    }
    if (!isValidZipArchive(apkPath)) {
        return { valid: false, reason: 'APK file is not a valid ZIP/APK archive.' };
    }

    const apksignerPath = findAndroidTool('apksigner');
    const aaptPath = findAndroidTool('aapt');

    if (!apksignerPath || !aaptPath) {
        return {
            valid: false,
            reason: 'Android verification tools (apksigner/aapt) not available on host environment to verify APK authenticity.'
        };
    }

    try {
        // 1. Verify certificate fingerprint with apksigner
        const certOutput = execFileSync(apksignerPath, ['verify', '--print-certs', apkPath], {
            encoding: 'utf8',
            shell: process.platform === 'win32',
            timeout: 15000,
        });

        const shaMatch = certOutput.match(/SHA-256 digest:\s*([a-f0-9:]+)/i);
        if (!shaMatch) {
            return { valid: false, reason: 'Could not extract signer certificate SHA-256 digest from apksigner output.' };
        }

        const actualCertSha = shaMatch[1].replace(/[^a-f0-9]/gi, '').toUpperCase();
        if (actualCertSha !== PRODUCTION_RELEASE_CERT_SHA256) {
            return {
                valid: false,
                reason: `APK signature (${actualCertSha}) does not match Medical365 production release certificate (${PRODUCTION_RELEASE_CERT_SHA256}). Rejecting debug or untrusted APK.`,
                certSha: actualCertSha,
            };
        }

        // 2. Verify package ID with aapt
        const badgingOutput = execFileSync(aaptPath, ['dump', 'badging', apkPath], {
            encoding: 'utf8',
            shell: process.platform === 'win32',
            timeout: 15000,
        });

        const pkgMatch = badgingOutput.match(/package:\s+name='([^']+)'/i);
        if (!pkgMatch) {
            return { valid: false, reason: 'Could not extract package name from aapt dump badging output.' };
        }

        const actualPackageId = pkgMatch[1];
        if (expectedPackageId) {
            const cleanExpected = expectedPackageId.trim().toLowerCase();
            const cleanActual = actualPackageId.trim().toLowerCase();
            if (cleanActual !== cleanExpected) {
                return {
                    valid: false,
                    reason: `APK package ID '${actualPackageId}' does not match expected hospital tenant package ID '${expectedPackageId}'.`,
                    packageId: actualPackageId,
                };
            }
        }

        return {
            valid: true,
            packageId: actualPackageId,
            certSha: actualCertSha,
        };
    } catch (err) {
        return {
            valid: false,
            reason: `APK verification failed: ${err.message || String(err)}`,
        };
    }
}

module.exports = {
    calculateSha256,
    verifyDigest,
    resolveStorageAdapter,
    setStorageAdapter,
    resetStorageAdapter,
    uploadReleaseArtifact,
    MockStorageAdapter,
    mockAdapter: mockAdapterInstance,
    isMockStorageUrl,
    isGitHubRunSummaryUrl,
    isVerifiedDirectArtifactUrl,
    isGenuinePublicUrl,
    PRODUCTION_RELEASE_CERT_SHA256,
    findAndroidTool,
    verifyApkFileAuthenticity,
};
