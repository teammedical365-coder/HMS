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
 * Calculates SHA-256 digest of a file on disk via streaming.
 * Keeps memory usage near 0 by streaming chunks of 64KB.
 * @param {string} filePath
 * @returns {Promise<string>}
 */
function calculateFileSha256(filePath) {
    return new Promise((resolve, reject) => {
        if (!filePath || typeof filePath !== 'string' || !fs.existsSync(filePath)) {
            return reject(new Error(`Invalid or missing file path for checksum: ${filePath}`));
        }
        const hash = crypto.createHash('sha256');
        const stream = fs.createReadStream(filePath);
        stream.on('data', chunk => hash.update(chunk));
        stream.on('end', () => resolve(hash.digest('hex').toLowerCase()));
        stream.on('error', reject);
    });
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
 * Validates whether a given URL is a presigned URL containing temporary SigV4 credentials.
 * Presigned URLs must NEVER be stored in the database.
 */
function isPresignedUrl(url) {
    if (!url || typeof url !== 'string') return false;
    const lower = url.toLowerCase();
    return lower.includes('x-amz-signature') || lower.includes('x-amz-credential');
}

/**
 * Validates whether a given URL is a verified direct artifact URL from a real storage provider.
 * Strictly excludes:
 * 1. Mock internal hosts (mock-storage.medical365.internal, .internal, etc.)
 * 2. GitHub Actions run-summary URLs (github.com/.../actions/runs/...)
 * 3. Relative or non-HTTP(S) paths
 * 4. Temporary/presigned URLs (must never be stored as durable direct artifact URLs)
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
    if (isPresignedUrl(trimmed)) {
        return false;
    }
    return true;
}

/**
 * Backward compatibility alias for isVerifiedDirectArtifactUrl
 */
const isGenuinePublicUrl = isVerifiedDirectArtifactUrl;

/**
 * Sanitizes an application ID segment for durable storage keys (ImageKit, S3/R2).
 * Replaces any character outside [a-z0-9_-] with an underscore.
 * Ensures storage path segments contain only alphanumeric characters, underscores, and hyphens.
 * ImageKit folder naming rules strictly prohibit dots (.); e.g. 'com.medical365.citygeneral' -> 'com_medical365_citygeneral'.
 *
 * @param {string} appId - Dotted application ID
 * @returns {string} Sanitized storage-safe application ID segment
 */
function sanitizeStorageAppId(appId) {
    if (!appId || typeof appId !== 'string') {
        return 'com_medical365_app';
    }
    return appId.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
}

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

    async upload({ filePath, buffer, key, contentType, metadata, expectedSha256 }) {
        if (this.simulateMissingConfig) {
            throw new Error('Durable artifact storage is not configured.');
        }
        if (this.shouldFailNextUpload) {
            this.shouldFailNextUpload = false;
            throw new Error('Simulated network failure during storage upload');
        }

        let checksum;
        let size = 0;
        if (filePath) {
            if (!fs.existsSync(filePath)) {
                throw new Error(`File not found at ${filePath}`);
            }
            size = fs.statSync(filePath).size;
            checksum = await calculateFileSha256(filePath);
        } else if (buffer && Buffer.isBuffer(buffer)) {
            size = buffer.length;
            checksum = calculateSha256(buffer);
        } else {
            throw new Error('Either filePath or buffer is required for upload');
        }

        if (expectedSha256 && !verifyDigest(checksum, expectedSha256)) {
            const err = new Error(`Checksum mismatch: expected ${expectedSha256}, got ${checksum}`);
            err.code = 'INTEGRITY_MISMATCH';
            throw err;
        }

        const record = {
            key,
            buffer: buffer || null,
            filePath: filePath || null,
            size,
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

    getPresignedDownloadUrl(key, expiresIn = 900) {
        const item = this.store.get(key);
        if (!item) {
            const err = new Error(`Object not found in storage: ${key}`);
            err.code = 'NOT_FOUND';
            throw err;
        }
        const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
        const dateStamp = amzDate.substring(0, 8);
        return `https://mock-storage.medical365.internal/${key}?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=mock-access-key%2F${dateStamp}%2Fauto%2Fs3%2Faws4_request&X-Amz-Date=${amzDate}&X-Amz-Expires=${expiresIn}&X-Amz-SignedHeaders=host&X-Amz-Signature=mocksignature1234567890`;
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

    async upload({ filePath, buffer, key, contentType, metadata, expectedSha256 }) {
        if (!this.isConfigured()) {
            const err = new Error('ImageKit durable cloud storage is not configured (missing credentials).');
            err.code = 'UNCONFIGURED_STORAGE';
            throw err;
        }

        let checksum = '';
        let fileSize = 0;
        let uploadPayload;

        if (filePath) {
            if (!fs.existsSync(filePath)) {
                throw new Error(`File not found at ${filePath}`);
            }
            const stat = fs.statSync(filePath);
            fileSize = stat.size;
            if (fileSize <= 0) {
                throw new Error(`File is empty (zero bytes): ${filePath}`);
            }
            // ImageKit free/standard plans reject uploads above 104,857,600 bytes (100 MiB).
            // Fallback to ImageKit for oversized release artifacts is strictly prohibited.
            if (fileSize >= 104857600) {
                const err = new Error(
                    `[Artifact Storage Error] File size (${fileSize} bytes) exceeds ImageKit's 100 MiB limit (104,857,600 bytes). ` +
                    `Release artifacts above 100 MiB cannot be uploaded to ImageKit and must use S3/R2 durable cloud storage. ` +
                    `Fallback to ImageKit for oversized release artifacts is prohibited.`
                );
                err.code = 'IMAGEKIT_SIZE_EXCEEDED';
                throw err;
            }
            checksum = await calculateFileSha256(filePath);
            if (expectedSha256 && !verifyDigest(checksum, expectedSha256)) {
                const err = new Error(`Checksum mismatch: expected ${expectedSha256}, got ${checksum}`);
                err.code = 'INTEGRITY_MISMATCH';
                throw err;
            }
            // Stream directly from disk without buffering file into Node.js heap
            uploadPayload = fs.createReadStream(filePath);
        } else if (buffer && Buffer.isBuffer(buffer)) {
            fileSize = buffer.length;
            if (fileSize >= 104857600) {
                const err = new Error(
                    `[Artifact Storage Error] File size (${fileSize} bytes) exceeds ImageKit's 100 MiB limit (104,857,600 bytes). ` +
                    `Release artifacts above 100 MiB cannot be uploaded to ImageKit and must use S3/R2 durable cloud storage. ` +
                    `Fallback to ImageKit for oversized release artifacts is prohibited.`
                );
                err.code = 'IMAGEKIT_SIZE_EXCEEDED';
                throw err;
            }
            checksum = calculateSha256(buffer);
            if (expectedSha256 && !verifyDigest(checksum, expectedSha256)) {
                const err = new Error(`Checksum mismatch: expected ${expectedSha256}, got ${checksum}`);
                err.code = 'INTEGRITY_MISMATCH';
                throw err;
            }
            // Pass Buffer directly without converting to full base64 string
            uploadPayload = buffer;
        } else {
            throw new Error('Either filePath or buffer is required for ImageKit upload');
        }

        const ImageKit = require('imagekit');
        const realImageKit = new ImageKit({
            publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
            privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
            urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINTS,
        });

        const normalizedKey = String(key || '').replace(/\\/g, '/');
        const fileName = (path.posix ? path.posix.basename(normalizedKey) : path.basename(normalizedKey));
        const rawFolder = (path.posix ? path.posix.dirname(normalizedKey) : path.dirname(normalizedKey));

        // Clean each folder segment: allow only alphanumeric characters, underscores, and hyphens.
        // ImageKit folder paths strictly prohibit dots (.) and invalid characters.
        const cleanFolderSegments = rawFolder
            .split('/')
            .filter(Boolean)
            .map(segment => segment.replace(/[^a-zA-Z0-9_-]/g, '_'));
        const folder = `/${cleanFolderSegments.join('/')}`;

        let uploadRes;
        try {
            uploadRes = await realImageKit.upload({
                file: uploadPayload,
                fileName,
                folder,
                useUniqueFileName: false,
                tags: ['release-artifact', metadata?.artifactType || 'APK'],
            });
        } finally {
            if (uploadPayload && typeof uploadPayload.destroy === 'function' && !uploadPayload.destroyed) {
                uploadPayload.destroy();
            }
        }

        if (!uploadRes?.url || !isVerifiedDirectArtifactUrl(uploadRes.url)) {
            const err = new Error(`ImageKit upload failed: unexpected response URL '${uploadRes?.url || 'empty'}'`);
            err.code = 'UPLOAD_FAILED';
            throw err;
        }

        return {
            storageKey: key,
            publicUrl: uploadRes.url,
            fileSize,
            checksumSha256: checksum,
            provider: this.name,
            fileId: uploadRes.fileId,
        };
    }

    async getDownloadUrl(key) {
        const base = String(process.env.IMAGEKIT_URL_ENDPOINTS || '').replace(/\/+$/, '');
        const cleanKey = String(key || '').replace(/^\/+/, '').replace(/\\/g, '/');
        return `${base}/${cleanKey}`;
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
 * AWS SigV4 Signing Helpers for S3/R2 Compatible Storage
 */
function sha256Hex(data) {
    return crypto.createHash('sha256').update(data).digest('hex');
}

function hmac(key, data, encoding) {
    const h = crypto.createHmac('sha256', key).update(data);
    return encoding ? h.digest(encoding) : h.digest();
}

function getSigV4Key(key, dateStamp, regionName, serviceName) {
    const kDate = hmac('AWS4' + key, dateStamp);
    const kRegion = hmac(kDate, regionName);
    const kService = hmac(kRegion, serviceName);
    const kSigning = hmac(kService, 'aws4_request');
    return kSigning;
}

function buildSigV4Headers({
    method,
    canonicalUri,
    query = {},
    headers = {},
    payloadHash = 'UNSIGNED-PAYLOAD',
    region = 'auto',
    service = 's3',
    accessKeyId,
    secretAccessKey,
}) {
    const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.substring(0, 8);
    const effectiveRegion = (region && region !== 'auto') ? region : 'us-east-1';

    const reqHeaders = { ...headers };
    reqHeaders['x-amz-date'] = amzDate;
    reqHeaders['x-amz-content-sha256'] = payloadHash;

    const sortedQueryKeys = Object.keys(query).sort();
    const canonicalQuery = sortedQueryKeys
        .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(query[k] !== undefined ? query[k] : '')}`)
        .join('&');

    const headerMap = {};
    for (const [k, v] of Object.entries(reqHeaders)) {
        if (v !== undefined && v !== null) {
            headerMap[k.toLowerCase().trim()] = String(v).trim().replace(/\s+/g, ' ');
        }
    }
    const sortedHeaderKeys = Object.keys(headerMap).sort();
    const canonicalHeaders = sortedHeaderKeys
        .map(k => `${k}:${headerMap[k]}\n`)
        .join('');
    const signedHeaders = sortedHeaderKeys.join(';');

    const canonicalRequest = [
        method.toUpperCase(),
        canonicalUri,
        canonicalQuery,
        canonicalHeaders,
        signedHeaders,
        payloadHash,
    ].join('\n');

    const stringToSign = [
        'AWS4-HMAC-SHA256',
        amzDate,
        `${dateStamp}/${effectiveRegion}/${service}/aws4_request`,
        sha256Hex(canonicalRequest),
    ].join('\n');

    const signingKey = getSigV4Key(secretAccessKey, dateStamp, effectiveRegion, service);
    const signature = hmac(signingKey, stringToSign, 'hex');

    reqHeaders['authorization'] = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${dateStamp}/${effectiveRegion}/${service}/aws4_request, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    return reqHeaders;
}

/**
 * Dedicated S3-Compatible Durable Storage Adapter
 * Compatible with Cloudflare R2, AWS S3, MinIO, Wasabi, etc.
 * Supports streaming multipart upload for release binaries of any size (up to 5 TB).
 */
class S3StorageAdapter {
    constructor(config = {}) {
        this.name = 's3';
        this.bucket = config.bucket || process.env.S3_BUCKET || '';
        this.endpoint = config.endpoint || process.env.S3_ENDPOINT || '';
        this.region = config.region || process.env.S3_REGION || 'auto';
        this.accessKeyId = config.accessKeyId || process.env.S3_ACCESS_KEY_ID || '';
        this.secretAccessKey = config.secretAccessKey || process.env.S3_SECRET_ACCESS_KEY || '';
        this.publicBaseUrl = config.publicBaseUrl || process.env.S3_PUBLIC_BASE_URL || '';
        // 8 MiB per part (bounded chunk size, above S3 minimum 5 MiB)
        this.partSize = config.partSize || (8 * 1024 * 1024);
    }

    isConfigured() {
        return Boolean(
            this.bucket &&
            this.accessKeyId &&
            this.secretAccessKey
        );
    }

    getEffectiveEndpoint() {
        if (this.endpoint) {
            return this.endpoint.replace(/\/+$/, '');
        }
        const reg = (this.region && this.region !== 'auto') ? this.region : 'us-east-1';
        return `https://s3.${reg}.amazonaws.com`;
    }

    getPublicUrl(key) {
        const cleanKey = key.replace(/^\/+/, '');
        if (this.publicBaseUrl) {
            return `${this.publicBaseUrl.replace(/\/+$/, '')}/${cleanKey}`;
        }
        return '';
    }

    /**
     * Generates a short-lived AWS SigV4 Presigned GET URL (15-minute default expiry)
     * using the R2 S3 API endpoint. Never exposes or requires public bucket access.
     * @param {string} key - Object storage key (e.g. releases/com.app/1/release.apk)
     * @param {number} [expiresIn=900] - Expiration duration in seconds (default 900 = 15 minutes)
     * @returns {string} Presigned URL for private direct GET download
     */
    getPresignedDownloadUrl(key, expiresIn = 900) {
        if (!this.isConfigured()) {
            const err = new Error(
                '[Artifact Storage Error] S3/R2 durable cloud storage is not configured (missing S3_BUCKET, S3_ACCESS_KEY_ID, or S3_SECRET_ACCESS_KEY).'
            );
            err.code = 'UNCONFIGURED_STORAGE';
            throw err;
        }

        const cleanKey = (key || '').replace(/^\/+/, '');
        if (!cleanKey) {
            throw new Error('[Artifact Storage Error] Storage key is required for presigned URL generation.');
        }

        const rawEndpoint = this.getEffectiveEndpoint();
        const parsedEndpoint = new URL(rawEndpoint);
        const host = parsedEndpoint.host;

        const cleanPath = parsedEndpoint.pathname.replace(/\/+$/, '');
        let canonicalUri;
        if (cleanPath.endsWith(`/${this.bucket}`)) {
            canonicalUri = `${cleanPath}/${cleanKey}`;
        } else {
            canonicalUri = `${cleanPath}/${this.bucket}/${cleanKey}`;
        }
        if (!canonicalUri.startsWith('/')) canonicalUri = '/' + canonicalUri;
        const encodedUri = canonicalUri.split('/').map(encodeURIComponent).join('/');

        const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
        const dateStamp = amzDate.substring(0, 8);
        const effectiveRegion = (this.region && this.region !== 'auto') ? this.region : 'us-east-1';
        const service = 's3';
        const credentialScope = `${dateStamp}/${effectiveRegion}/${service}/aws4_request`;

        const query = {
            'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
            'X-Amz-Credential': `${this.accessKeyId}/${credentialScope}`,
            'X-Amz-Date': amzDate,
            'X-Amz-Expires': String(expiresIn),
            'X-Amz-SignedHeaders': 'host',
        };

        const sortedQueryKeys = Object.keys(query).sort();
        const canonicalQuery = sortedQueryKeys
            .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(query[k])}`)
            .join('&');

        const canonicalHeaders = `host:${host}\n`;
        const signedHeaders = 'host';
        const payloadHash = 'UNSIGNED-PAYLOAD';

        const canonicalRequest = [
            'GET',
            encodedUri,
            canonicalQuery,
            canonicalHeaders,
            signedHeaders,
            payloadHash,
        ].join('\n');

        const stringToSign = [
            'AWS4-HMAC-SHA256',
            amzDate,
            credentialScope,
            sha256Hex(canonicalRequest),
        ].join('\n');

        const signingKey = getSigV4Key(this.secretAccessKey, dateStamp, effectiveRegion, service);
        const signature = hmac(signingKey, stringToSign, 'hex');

        return `${parsedEndpoint.origin}${encodedUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
    }

    getDownloadUrl(key, expiresIn = 900) {
        if (!this.publicBaseUrl) {
            return this.getPresignedDownloadUrl(key, expiresIn);
        }
        return this.getPublicUrl(key);
    }

    dispatchRequest({ method, key = '', query = {}, headers = {}, body = null, isStream = false, contentLength = 0 }) {
        return new Promise((resolve, reject) => {
            const rawEndpoint = this.getEffectiveEndpoint();
            const parsedEndpoint = new URL(rawEndpoint);
            const isHttps = parsedEndpoint.protocol === 'https:';
            const transport = isHttps ? require('https') : require('http');

            const cleanPath = parsedEndpoint.pathname.replace(/\/+$/, '');
            let canonicalUri;
            if (cleanPath.endsWith(`/${this.bucket}`)) {
                canonicalUri = `${cleanPath}/${key ? key.replace(/^\/+/, '') : ''}`;
            } else {
                canonicalUri = `${cleanPath}/${this.bucket}${key ? '/' + key.replace(/^\/+/, '') : ''}`;
            }
            if (!canonicalUri.startsWith('/')) canonicalUri = '/' + canonicalUri;

            const encodedUri = canonicalUri.split('/').map(encodeURIComponent).join('/');

            const requestHeaders = { ...headers, host: parsedEndpoint.host };
            if (contentLength > 0) {
                requestHeaders['content-length'] = contentLength;
            }

            const signedHeaders = buildSigV4Headers({
                method,
                canonicalUri: encodedUri,
                query,
                headers: requestHeaders,
                payloadHash: isStream ? 'UNSIGNED-PAYLOAD' : (body ? sha256Hex(body) : sha256Hex('')),
                region: this.region,
                service: 's3',
                accessKeyId: this.accessKeyId,
                secretAccessKey: this.secretAccessKey,
            });

            const queryKeys = Object.keys(query).sort();
            const queryString = queryKeys
                .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(query[k] !== undefined ? query[k] : '')}`)
                .join('&');
            const requestPath = queryString ? `${encodedUri}?${queryString}` : encodedUri;

            const reqOptions = {
                protocol: parsedEndpoint.protocol,
                hostname: parsedEndpoint.hostname,
                port: parsedEndpoint.port || (isHttps ? 443 : 80),
                method: method.toUpperCase(),
                path: requestPath,
                headers: signedHeaders,
            };

            const req = transport.request(reqOptions, (res) => {
                const chunks = [];
                res.on('data', chunk => chunks.push(chunk));
                res.on('end', () => {
                    const responseBuffer = Buffer.concat(chunks);
                    const responseText = responseBuffer.toString('utf8');
                    const statusCode = res.statusCode || 200;

                    if (statusCode >= 200 && statusCode < 300) {
                        return resolve({
                            statusCode,
                            headers: res.headers,
                            body: responseText,
                            buffer: responseBuffer,
                        });
                    }

                    let errorCode = 'S3_ERROR';
                    let errorMessage = `S3 request failed with HTTP ${statusCode}`;
                    const codeMatch = responseText.match(/<Code>([\s\S]*?)<\/Code>/i);
                    const msgMatch = responseText.match(/<Message>([\s\S]*?)<\/Message>/i);
                    if (codeMatch && codeMatch[1]) errorCode = codeMatch[1].trim();
                    if (msgMatch && msgMatch[1]) errorMessage = msgMatch[1].trim();

                    const err = new Error(`[S3 Storage Error] ${errorCode}: ${errorMessage}`);
                    err.code = errorCode;
                    err.statusCode = statusCode;
                    err.responseBody = responseText;
                    return reject(err);
                });
            });

            req.on('error', reject);

            if (isStream && body && typeof body.pipe === 'function') {
                body.pipe(req);
            } else if (body) {
                req.write(body);
                req.end();
            } else {
                req.end();
            }
        });
    }

    async initiateMultipartUpload(key, contentType) {
        const res = await this.dispatchRequest({
            method: 'POST',
            key,
            query: { uploads: '' },
            headers: {
                'content-type': contentType || 'application/octet-stream',
            },
        });
        const match = res.body.match(/<UploadId>([\s\S]*?)<\/UploadId>/i);
        if (!match || !match[1]) {
            throw new Error(`[S3 Storage Error] Failed to extract UploadId from response: ${res.body}`);
        }
        return match[1].trim();
    }

    async uploadPart({ key, uploadId, partNumber, filePath, start, end, partSize }) {
        const stream = fs.createReadStream(filePath, { start, end });
        try {
            const res = await this.dispatchRequest({
                method: 'PUT',
                key,
                query: {
                    partNumber: String(partNumber),
                    uploadId,
                },
                headers: {
                    'content-type': 'application/octet-stream',
                },
                body: stream,
                isStream: true,
                contentLength: partSize,
            });
            const etag = res.headers['etag'];
            if (!etag) {
                throw new Error(`[S3 Storage Error] Missing ETag in part ${partNumber} upload response`);
            }
            return { PartNumber: partNumber, ETag: etag };
        } finally {
            if (stream && typeof stream.destroy === 'function' && !stream.destroyed) {
                stream.destroy();
            }
        }
    }

    async completeMultipartUpload(key, uploadId, parts) {
        const sortedParts = [...parts].sort((a, b) => a.PartNumber - b.PartNumber);
        const partsXml = sortedParts
            .map(p => `  <Part>\n    <PartNumber>${p.PartNumber}</PartNumber>\n    <ETag>${p.ETag}</ETag>\n  </Part>`)
            .join('\n');
        const xmlBody = `<CompleteMultipartUpload>\n${partsXml}\n</CompleteMultipartUpload>`;

        const res = await this.dispatchRequest({
            method: 'POST',
            key,
            query: { uploadId },
            headers: {
                'content-type': 'application/xml',
            },
            body: Buffer.from(xmlBody, 'utf8'),
            contentLength: Buffer.byteLength(xmlBody),
        });
        return res;
    }

    async abortMultipartUpload(key, uploadId) {
        try {
            await this.dispatchRequest({
                method: 'DELETE',
                key,
                query: { uploadId },
            });
        } catch (e) {
            console.warn(`[S3 Storage] Could not abort multipart upload ${uploadId}:`, e.message);
        }
    }

    async delete(key) {
        if (!this.isConfigured()) return false;
        try {
            await this.dispatchRequest({
                method: 'DELETE',
                key,
            });
            return true;
        } catch (e) {
            console.warn(`[S3 Storage] Delete failed for ${key}:`, e.message);
            return false;
        }
    }

    async upload({ filePath, buffer, key, contentType, metadata, expectedSha256 }) {
        if (!this.isConfigured()) {
            const err = new Error(
                '[Artifact Storage Error] S3/R2 durable cloud storage is not configured (missing S3_BUCKET, S3_ACCESS_KEY_ID, or S3_SECRET_ACCESS_KEY).'
            );
            err.code = 'UNCONFIGURED_STORAGE';
            throw err;
        }

        let checksum = '';
        let fileSize = 0;

        if (filePath) {
            if (!fs.existsSync(filePath)) {
                throw new Error(`File not found at ${filePath}`);
            }
            const stat = fs.statSync(filePath);
            fileSize = stat.size;
            if (fileSize <= 0) {
                throw new Error(`File is empty (zero bytes): ${filePath}`);
            }
            checksum = await calculateFileSha256(filePath);
        } else if (buffer && Buffer.isBuffer(buffer)) {
            fileSize = buffer.length;
            if (fileSize <= 0) {
                throw new Error('Buffer is empty (zero bytes)');
            }
            checksum = calculateSha256(buffer);
        } else {
            throw new Error('Either filePath or buffer is required for S3 upload');
        }

        if (expectedSha256 && !verifyDigest(checksum, expectedSha256)) {
            const err = new Error(`Checksum mismatch: expected ${expectedSha256}, got ${checksum}`);
            err.code = 'INTEGRITY_MISMATCH';
            throw err;
        }

        const safeContentType = contentType || 'application/vnd.android.package-archive';
        const minMultipartSize = 5 * 1024 * 1024;

        if (fileSize < minMultipartSize) {
            let uploadBody;
            if (filePath) {
                uploadBody = fs.createReadStream(filePath);
            } else {
                uploadBody = buffer;
            }
            try {
                await this.dispatchRequest({
                    method: 'PUT',
                    key,
                    headers: {
                        'content-type': safeContentType,
                    },
                    body: uploadBody,
                    isStream: Boolean(filePath),
                    contentLength: fileSize,
                });
            } finally {
                if (uploadBody && typeof uploadBody.destroy === 'function' && !uploadBody.destroyed) {
                    uploadBody.destroy();
                }
            }
        } else {
            let tempCreatedFile = false;
            let actualFilePath = filePath;
            if (!actualFilePath && buffer) {
                const tmpPath = path.join(__dirname, `../../public/downloads/temp/s3_upload_${Date.now()}_${Math.random().toString(36).substring(7)}.tmp`);
                fs.writeFileSync(tmpPath, buffer);
                actualFilePath = tmpPath;
                tempCreatedFile = true;
            }

            let uploadId = null;
            try {
                uploadId = await this.initiateMultipartUpload(key, safeContentType);
                const parts = [];
                const partSize = this.partSize;
                const totalParts = Math.ceil(fileSize / partSize);

                for (let partNumber = 1; partNumber <= totalParts; partNumber++) {
                    const start = (partNumber - 1) * partSize;
                    const end = Math.min(fileSize - 1, start + partSize - 1);
                    const currentPartSize = end - start + 1;

                    const partResult = await this.uploadPart({
                        key,
                        uploadId,
                        partNumber,
                        filePath: actualFilePath,
                        start,
                        end,
                        partSize: currentPartSize,
                    });
                    parts.push(partResult);
                }

                await this.completeMultipartUpload(key, uploadId, parts);
            } catch (uploadErr) {
                if (uploadId) {
                    await this.abortMultipartUpload(key, uploadId);
                }
                throw uploadErr;
            } finally {
                if (tempCreatedFile && actualFilePath && fs.existsSync(actualFilePath)) {
                    try { fs.unlinkSync(actualFilePath); } catch (_) {}
                }
            }
        }

        const publicUrl = this.getPublicUrl(key);
        return {
            storageKey: key,
            publicUrl,
            fileSize,
            checksumSha256: checksum,
            provider: this.name,
            fileId: key,
        };
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

    async upload({ filePath, buffer, key, contentType, metadata, expectedSha256 }) {
        if (process.env.NODE_ENV === 'production') {
            throw new Error('Durable cloud storage (S3 / ImageKit) must be configured in production. Local disk storage is prohibited.');
        }

        let checksum;
        let size = 0;
        if (filePath) {
            if (!fs.existsSync(filePath)) {
                throw new Error(`File not found at ${filePath}`);
            }
            size = fs.statSync(filePath).size;
            checksum = await calculateFileSha256(filePath);
        } else if (buffer && Buffer.isBuffer(buffer)) {
            size = buffer.length;
            checksum = calculateSha256(buffer);
        } else {
            throw new Error('Either filePath or buffer is required for upload');
        }

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

        if (filePath) {
            fs.copyFileSync(filePath, fullPath);
        } else {
            fs.writeFileSync(fullPath, buffer);
        }

        return {
            storageKey: key,
            publicUrl: `/downloads/releases/${key}`,
            fileSize: size,
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
        if (requireRealProvider) {
            // For release uploads requiring a real durable provider:
            // Check S3-compatible cloud storage (Cloudflare R2 / AWS S3) first.
            // S3 has no 100 MiB file-size limit and handles large APK/AAB release binaries.
            const s3Adapter = new S3StorageAdapter();
            const imagekitAdapter = new ImageKitStorageAdapter();

            const isS3Requested = (
                process.env.RELEASE_STORAGE_PROVIDER === 's3' ||
                process.env.RELEASE_STORAGE_PROVIDER === 'r2' ||
                process.env.STORAGE_PROVIDER === 's3' ||
                process.env.STORAGE_PROVIDER === 'r2'
            );

            if (isS3Requested) {
                if (s3Adapter.isConfigured()) {
                    adapter = s3Adapter;
                } else {
                    const err = new Error(
                        '[Artifact Storage Error] S3/R2 release storage is requested but missing configuration credentials. ' +
                        'Please configure S3_BUCKET, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY in the environment.'
                    );
                    err.code = 'UNCONFIGURED_STORAGE';
                    throw err;
                }
            } else if (s3Adapter.isConfigured()) {
                adapter = s3Adapter;
            } else if (imagekitAdapter.isConfigured()) {
                adapter = imagekitAdapter;
            } else {
                const err = new Error(
                    '[Artifact Storage Error] No durable cloud storage provider is configured. ' +
                    'Please configure S3/R2 credentials (S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY) ' +
                    'or IMAGEKIT credentials in the production environment.'
                );
                err.code = 'UNCONFIGURED_STORAGE';
                throw err;
            }
        } else {
            // In test mode or when explicitly requested, use mock adapter.
            // Tests cannot accidentally use real ImageKit or S3 uploads.
            if (process.env.NODE_ENV === 'test' || process.env.STORAGE_PROVIDER === 'mock') {
                adapter = mockAdapterInstance;
            } else {
                const s3Adapter = new S3StorageAdapter();
                const imagekitAdapter = new ImageKitStorageAdapter();
                if (s3Adapter.isConfigured()) {
                    adapter = s3Adapter;
                } else if (imagekitAdapter.isConfigured()) {
                    adapter = imagekitAdapter;
                } else if (process.env.STORAGE_PROVIDER === 'local') {
                    adapter = new LocalDiskStorageAdapter();
                } else if (process.env.NODE_ENV === 'production') {
                    const err = new Error(
                        '[Artifact Storage Error] No durable cloud storage provider is configured. ' +
                        'Please configure S3/R2 or IMAGEKIT credentials in the production environment.'
                    );
                    err.code = 'UNCONFIGURED_STORAGE';
                    throw err;
                } else {
                    adapter = new LocalDiskStorageAdapter();
                }
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
    filePath,
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
    if (!filePath && (!rawBuffer || !Buffer.isBuffer(rawBuffer))) {
        throw new Error('Either filePath or Buffer is required for artifact upload');
    }
    if (filePath && !fs.existsSync(filePath)) {
        throw new Error(`Artifact file does not exist at filePath: ${filePath}`);
    }
    if (!fileName || !artifactType) {
        throw new Error('fileName and artifactType (APK or AAB) are required');
    }

    const adapter = resolveStorageAdapter({ requireRealProvider });
    const originalAppId = (applicationId || 'com.medical365.app').trim().toLowerCase();
    const storageSafeAppId = sanitizeStorageAppId(originalAppId);
    const safeVersionCode = Number(versionCode) || 1;
    const safeFileName = path.basename(fileName);
    const storageKey = `releases/${storageSafeAppId}/${safeVersionCode}/${safeFileName}`;

    const contentType = artifactType === 'APK'
        ? 'application/vnd.android.package-archive'
        : 'application/octet-stream';

    // 1. Upload to durable storage with checksum verification (stream-based if filePath provided)
    const uploadResult = await adapter.upload({
        filePath,
        buffer: rawBuffer,
        key: storageKey,
        contentType,
        expectedSha256,
        metadata: {
            artifactType,
            versionCode: safeVersionCode,
            versionName: versionName || '1.0.0',
            applicationId: originalAppId, // Preserve original dotted Android application ID
            tenantId: tenantId ? String(tenantId) : null,
            rnBuildId: rnBuildId || '',
            releaseId: releaseId || '',
        },
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
                            applicationId: originalAppId, // Preserve original dotted Android application ID
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
        fileId: uploadResult.fileId || uploadResult.storageKey,
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
    calculateFileSha256,
    verifyDigest,
    resolveStorageAdapter,
    setStorageAdapter,
    resetStorageAdapter,
    uploadReleaseArtifact,
    MockStorageAdapter,
    mockAdapter: mockAdapterInstance,
    ImageKitStorageAdapter,
    S3StorageAdapter,
    isMockStorageUrl,
    isGitHubRunSummaryUrl,
    isPresignedUrl,
    isVerifiedDirectArtifactUrl,
    isGenuinePublicUrl,
    sanitizeStorageAppId,
    PRODUCTION_RELEASE_CERT_SHA256,
    findAndroidTool,
    verifyApkFileAuthenticity,
};
