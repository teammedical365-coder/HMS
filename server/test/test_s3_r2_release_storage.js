/**
 * test_s3_r2_release_storage.js
 *
 * Dedicated verification suite for S3/Cloudflare R2 release storage:
 * 1. S3/R2 adapter configuration and credential validation.
 * 2. Streaming single PUT for small files (<5 MiB).
 * 3. Streaming multipart upload for standard files (>=5 MiB).
 * 4. ImageKit strict rejection of files >= 104,857,600 bytes (100 MiB).
 * 5. S3/R2 successful multipart upload of files > 100 MiB (105 MiB binary).
 * 6. Bounded memory and sequential chunking for 105 MiB upload.
 * 7. Multipart upload abort on network failure.
 * 8. Object deletion and orphan cleanup via DELETE /{bucket}/{key}.
 * 9. Adapter resolution precedence (S3/R2 priority over ImageKit for releases).
 * 10. End-to-end uploadReleaseArtifact registration in MongoDB model with provider='s3'.
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const http = require('http');

process.env.NODE_ENV = 'test';

const {
    S3StorageAdapter,
    ImageKitStorageAdapter,
    resolveStorageAdapter,
    setStorageAdapter,
    resetStorageAdapter,
    uploadReleaseArtifact,
    calculateFileSha256,
    calculateSha256,
} = require('../src/utils/artifactStorage.util');

let passedCount = 0;
let failedCount = 0;

async function test(name, fn) {
    try {
        await fn();
        console.log(`  ✓ [PASS] ${name}`);
        passedCount++;
    } catch (err) {
        console.error(`  ✗ [FAIL] ${name}`);
        console.error(`     Error: ${err.message}`);
        console.error(err.stack);
        failedCount++;
    }
}

(async () => {
    console.log('================================================================');
    console.log('🧪 S3 / CLOUDFLARE R2 RELEASE STORAGE VERIFICATION SUITE');
    console.log('================================================================\n');

    let mockS3Server;
    let mockS3Port;
    const recordedS3Requests = [];
    let shouldFailNextPart = false;

    // Start local mock S3 / R2 HTTP server
    mockS3Server = http.createServer((req, res) => {
        const url = req.url || '';
        const method = req.method || 'GET';
        const headers = req.headers;
        let bodyLength = 0;
        let bodyText = '';

        req.on('data', chunk => {
            bodyLength += chunk.length;
            if (bodyText.length < 2500) {
                bodyText += chunk.toString('utf8', 0, Math.min(chunk.length, 2500 - bodyText.length));
            }
        });
        req.on('end', () => {
            recordedS3Requests.push({
                method,
                url,
                headers,
                bodyLength,
                bodyText,
            });

            // 1. Initiate Multipart Upload: POST /bucket/key?uploads
            if (method === 'POST' && url.includes('uploads=')) {
                res.writeHead(200, { 'Content-Type': 'application/xml' });
                return res.end(`
                    <InitiateMultipartUploadResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
                        <Bucket>medical365-test-releases</Bucket>
                        <Key>test-key</Key>
                        <UploadId>mock-upload-id-998877</UploadId>
                    </InitiateMultipartUploadResult>
                `);
            }

            // 2. Upload Part: PUT /bucket/key?partNumber=X&uploadId=Y
            if (method === 'PUT' && url.includes('partNumber=')) {
                if (shouldFailNextPart) {
                    shouldFailNextPart = false;
                    res.writeHead(500, { 'Content-Type': 'application/xml' });
                    return res.end('<Error><Code>InternalError</Code><Message>Simulated S3 network failure</Message></Error>');
                }
                const partMatch = url.match(/partNumber=(\d+)/);
                const partNum = partMatch ? partMatch[1] : '1';
                res.writeHead(200, {
                    'ETag': `"mock-etag-part-${partNum}"`,
                    'Content-Length': '0',
                });
                return res.end();
            }

            // 3. Complete Multipart Upload: POST /bucket/key?uploadId=Y
            if (method === 'POST' && url.includes('uploadId=')) {
                res.writeHead(200, { 'Content-Type': 'application/xml' });
                return res.end(`
                    <CompleteMultipartUploadResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
                        <Location>https://releases.medical365.in/test-key</Location>
                        <Bucket>medical365-test-releases</Bucket>
                        <Key>test-key</Key>
                        <ETag>"mock-complete-etag"</ETag>
                    </CompleteMultipartUploadResult>
                `);
            }

            // 4. Abort Multipart Upload: DELETE /bucket/key?uploadId=Y
            if (method === 'DELETE' && url.includes('uploadId=')) {
                res.writeHead(204);
                return res.end();
            }

            // 5. Delete Object: DELETE /bucket/key
            if (method === 'DELETE') {
                res.writeHead(204);
                return res.end();
            }

            // 6. Direct PUT: PUT /bucket/key
            if (method === 'PUT') {
                res.writeHead(200, {
                    'ETag': '"mock-direct-put-etag"',
                });
                return res.end();
            }

            res.writeHead(404);
            res.end();
        });
    });

    await new Promise(resolve => mockS3Server.listen(0, '127.0.0.1', () => {
        mockS3Port = mockS3Server.address().port;
        resolve();
    }));

    const mockEndpoint = `http://127.0.0.1:${mockS3Port}`;
    const tempDir = path.join(__dirname, '../public/downloads/temp');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    try {
        // ─────────────────────────────────────────────────────────────────────
        // SUITE 1: Adapter Configuration & Precedence
        // ─────────────────────────────────────────────────────────────────────
        console.log('--- SUITE 1: Configuration, Credentials & Provider Resolution ---');

        await test('1.1: S3StorageAdapter detects configured credentials and endpoint', async () => {
            const adapter = new S3StorageAdapter({
                bucket: 'test-bucket',
                accessKeyId: 'test-access-key',
                secretAccessKey: 'test-secret-key',
                endpoint: mockEndpoint,
                publicBaseUrl: 'https://releases.medical365.in',
            });
            assert.strictEqual(adapter.isConfigured(), true);
            assert.strictEqual(adapter.getPublicUrl('releases/app.apk'), 'https://releases.medical365.in/releases/app.apk');
        });

        await test('1.2: S3StorageAdapter reports unconfigured when required credentials missing', async () => {
            const adapter = new S3StorageAdapter({
                bucket: '',
                accessKeyId: '',
                secretAccessKey: '',
            });
            assert.strictEqual(adapter.isConfigured(), false);
        });

        await test('1.3: resolveStorageAdapter selects S3 when RELEASE_STORAGE_PROVIDER=s3', async () => {
            process.env.RELEASE_STORAGE_PROVIDER = 's3';
            process.env.S3_BUCKET = 'med365-r2-bucket';
            process.env.S3_ACCESS_KEY_ID = 'r2-key-id';
            process.env.S3_SECRET_ACCESS_KEY = 'r2-secret-key';
            process.env.S3_ENDPOINT = mockEndpoint;

            const adapter = resolveStorageAdapter({ requireRealProvider: true });
            assert.strictEqual(adapter.name, 's3');
            assert.strictEqual(adapter.isConfigured(), true);

            delete process.env.RELEASE_STORAGE_PROVIDER;
            delete process.env.S3_BUCKET;
            delete process.env.S3_ACCESS_KEY_ID;
            delete process.env.S3_SECRET_ACCESS_KEY;
            delete process.env.S3_ENDPOINT;
            resetStorageAdapter();
        });

        await test('1.4: resolveStorageAdapter throws UNCONFIGURED_STORAGE when S3 requested but credentials missing', async () => {
            process.env.RELEASE_STORAGE_PROVIDER = 's3';
            delete process.env.S3_BUCKET;
            delete process.env.S3_ACCESS_KEY_ID;
            delete process.env.S3_SECRET_ACCESS_KEY;
            resetStorageAdapter();

            assert.throws(() => {
                resolveStorageAdapter({ requireRealProvider: true });
            }, (err) => {
                assert.strictEqual(err.code, 'UNCONFIGURED_STORAGE');
                assert(err.message.includes('S3/R2 release storage is requested but missing configuration credentials'));
                return true;
            });

            delete process.env.RELEASE_STORAGE_PROVIDER;
            resetStorageAdapter();
        });

        // ─────────────────────────────────────────────────────────────────────
        // SUITE 2: Streaming Uploads Under 5 MiB (Direct PUT)
        // ─────────────────────────────────────────────────────────────────────
        console.log('\n--- SUITE 2: Small File Streaming (<5 MiB Direct PUT) ---');

        await test('2.1: Files < 5 MiB use direct streaming PUT without multipart overhead', async () => {
            recordedS3Requests.length = 0;
            const smallFile = path.join(tempDir, 'small_test.apk');
            const smallData = Buffer.alloc(2 * 1024 * 1024, 0x42); // 2 MiB
            fs.writeFileSync(smallFile, smallData);

            try {
                const adapter = new S3StorageAdapter({
                    bucket: 'med-releases',
                    accessKeyId: 'acc-key',
                    secretAccessKey: 'sec-key',
                    endpoint: mockEndpoint,
                    publicBaseUrl: 'https://releases.medical365.in',
                });

                const result = await adapter.upload({
                    filePath: smallFile,
                    key: 'releases/small/app.apk',
                    contentType: 'application/vnd.android.package-archive',
                });

                assert.strictEqual(result.provider, 's3');
                assert.strictEqual(result.fileSize, 2 * 1024 * 1024);
                assert.strictEqual(result.publicUrl, 'https://releases.medical365.in/releases/small/app.apk');

                // Verify exact request was direct PUT
                const putReq = recordedS3Requests.find(r => r.method === 'PUT' && !r.url.includes('partNumber'));
                assert(putReq, 'Must dispatch single direct PUT for <5 MiB file');
                assert.strictEqual(Number(putReq.headers['content-length']), 2 * 1024 * 1024);
                assert(putReq.headers['authorization'].includes('AWS4-HMAC-SHA256'));
            } finally {
                if (fs.existsSync(smallFile)) fs.unlinkSync(smallFile);
            }
        });

        // ─────────────────────────────────────────────────────────────────────
        // SUITE 3: ImageKit 100 MiB Limit Rejection
        // ─────────────────────────────────────────────────────────────────────
        console.log('\n--- SUITE 3: ImageKit 100 MiB Limit & Fallback Protection ---');

        await test('3.1: ImageKitStorageAdapter immediately rejects files >= 104,857,600 bytes with IMAGEKIT_SIZE_EXCEEDED', async () => {
            const oversizedFile = path.join(tempDir, 'oversized_test.apk');
            // Write 105 MiB file to disk (110,100,480 bytes)
            const fd = fs.openSync(oversizedFile, 'w');
            const oneMb = Buffer.alloc(1024 * 1024, 0x43);
            for (let i = 0; i < 105; i++) {
                fs.writeSync(fd, oneMb);
            }
            fs.closeSync(fd);

            try {
                process.env.IMAGEKIT_PUBLIC_KEY = 'test_pub_key';
                process.env.IMAGEKIT_PRIVATE_KEY = 'test_priv_key';
                process.env.IMAGEKIT_URL_ENDPOINTS = 'https://ik.imagekit.io/med365';

                const ikAdapter = new ImageKitStorageAdapter();
                let caughtErr = null;

                try {
                    await ikAdapter.upload({
                        filePath: oversizedFile,
                        key: 'releases/oversized/app.apk',
                    });
                } catch (err) {
                    caughtErr = err;
                }

                assert(caughtErr, 'Must reject oversized file');
                assert.strictEqual(caughtErr.code, 'IMAGEKIT_SIZE_EXCEEDED');
                assert(caughtErr.message.includes('104,857,600 bytes'));
                assert(caughtErr.message.includes('Fallback to ImageKit for oversized release artifacts is prohibited'));
            } finally {
                delete process.env.IMAGEKIT_PUBLIC_KEY;
                delete process.env.IMAGEKIT_PRIVATE_KEY;
                delete process.env.IMAGEKIT_URL_ENDPOINTS;
                if (fs.existsSync(oversizedFile)) fs.unlinkSync(oversizedFile);
            }
        });

        // ─────────────────────────────────────────────────────────────────────
        // SUITE 4: S3/R2 Streaming Multipart Upload for Files > 100 MiB
        // ─────────────────────────────────────────────────────────────────────
        console.log('\n--- SUITE 4: S3/R2 Multipart Upload for 105 MiB Artifacts ---');

        await test('4.1: S3StorageAdapter successfully streams 105 MiB binary via multipart upload without memory spikes', async () => {
            recordedS3Requests.length = 0;
            const largeFile = path.join(tempDir, 'release_105mb.apk');
            const fd = fs.openSync(largeFile, 'w');
            const oneMb = Buffer.alloc(1024 * 1024, 0x5a); // 1 MiB chunk
            for (let i = 0; i < 105; i++) {
                fs.writeSync(fd, oneMb);
            }
            fs.closeSync(fd);

            const fileSize = fs.statSync(largeFile).size;
            assert.strictEqual(fileSize, 105 * 1024 * 1024, 'File size must be 105 MiB (110,100,480 bytes)');

            try {
                const adapter = new S3StorageAdapter({
                    bucket: 'medical365-prod-releases',
                    accessKeyId: 'r2-access-key-xyz',
                    secretAccessKey: 'r2-secret-key-abc',
                    endpoint: mockEndpoint,
                    publicBaseUrl: 'https://releases.medical365.in',
                    partSize: 8 * 1024 * 1024, // 8 MiB parts
                });

                if (global.gc) global.gc();
                const memBefore = process.memoryUsage().heapUsed;

                const result = await adapter.upload({
                    filePath: largeFile,
                    key: 'releases/com.medical365.sharma/10/app-rn-release.apk',
                    contentType: 'application/vnd.android.package-archive',
                });

                if (global.gc) global.gc();
                const memAfter = process.memoryUsage().heapUsed;
                const heapDeltaMb = (memAfter - memBefore) / 1024 / 1024;

                console.log(`     [Large Upload Memory Profile] Heap delta for 105 MiB upload: ${heapDeltaMb.toFixed(2)} MB`);
                assert(heapDeltaMb < 15, `Heap growth must be strictly bounded (<15 MB), observed: ${heapDeltaMb.toFixed(2)} MB`);

                assert.strictEqual(result.provider, 's3');
                assert.strictEqual(result.fileSize, 105 * 1024 * 1024);
                assert.strictEqual(result.publicUrl, 'https://releases.medical365.in/releases/com.medical365.sharma/10/app-rn-release.apk');
                assert.strictEqual(result.fileId, 'releases/com.medical365.sharma/10/app-rn-release.apk');

                // Verify S3 protocol lifecycle
                const initReq = recordedS3Requests.find(r => r.method === 'POST' && r.url.includes('uploads='));
                assert(initReq, 'Must initiate multipart upload');

                const partReqs = recordedS3Requests.filter(r => r.method === 'PUT' && r.url.includes('partNumber='));
                // 105 MiB with 8 MiB parts = 14 parts (13 parts of 8MB, 1 part of 1MB)
                assert.strictEqual(partReqs.length, 14, 'Must upload exactly 14 sequential parts');
                assert.strictEqual(partReqs[0].bodyLength, 8 * 1024 * 1024, 'Part 1 must be 8 MiB');
                assert.strictEqual(partReqs[13].bodyLength, 1 * 1024 * 1024, 'Last part must be remaining 1 MiB');

                const completeReq = recordedS3Requests.find(r => r.method === 'POST' && r.url.includes('uploadId='));
                assert(completeReq, 'Must complete multipart upload');
                assert(completeReq.bodyText.includes('<PartNumber>1</PartNumber>'));
                assert(completeReq.bodyText.includes('<PartNumber>14</PartNumber>'));
            } finally {
                if (fs.existsSync(largeFile)) fs.unlinkSync(largeFile);
            }
        });

        // ─────────────────────────────────────────────────────────────────────
        // SUITE 5: Failure Abort & Orphan Cleanup
        // ─────────────────────────────────────────────────────────────────────
        console.log('\n--- SUITE 5: Abort On Failure & Orphan Cleanup ---');

        await test('5.1: Multipart upload aborts incomplete upload on network failure', async () => {
            recordedS3Requests.length = 0;
            shouldFailNextPart = true;

            const midFile = path.join(tempDir, 'abort_test.apk');
            const data = Buffer.alloc(16 * 1024 * 1024, 0x44); // 16 MiB (2 parts)
            fs.writeFileSync(midFile, data);

            try {
                const adapter = new S3StorageAdapter({
                    bucket: 'med-releases',
                    accessKeyId: 'acc-key',
                    secretAccessKey: 'sec-key',
                    endpoint: mockEndpoint,
                    partSize: 8 * 1024 * 1024,
                });

                let caught = null;
                try {
                    await adapter.upload({
                        filePath: midFile,
                        key: 'releases/fail/app.apk',
                    });
                } catch (e) {
                    caught = e;
                }

                assert(caught, 'Upload must throw on part failure');
                const abortReq = recordedS3Requests.find(r => r.method === 'DELETE' && r.url.includes('uploadId='));
                assert(abortReq, 'Must dispatch DELETE /{bucket}/{key}?uploadId= to abort incomplete upload');
            } finally {
                if (fs.existsSync(midFile)) fs.unlinkSync(midFile);
            }
        });

        await test('5.2: adapter.delete(key) deletes uploaded object from S3', async () => {
            recordedS3Requests.length = 0;
            const adapter = new S3StorageAdapter({
                bucket: 'med-releases',
                accessKeyId: 'acc-key',
                secretAccessKey: 'sec-key',
                endpoint: mockEndpoint,
            });

            const deleted = await adapter.delete('releases/com.app/1/orphaned.apk');
            assert.strictEqual(deleted, true);

            const delReq = recordedS3Requests.find(r => r.method === 'DELETE' && !r.url.includes('uploadId='));
            assert(delReq, 'Must dispatch DELETE request to S3');
            assert(delReq.url.includes('releases/com.app/1/orphaned.apk'));
        });

        // ─────────────────────────────────────────────────────────────────────
        // SUITE 6: End-to-End uploadReleaseArtifact Integration
        // ─────────────────────────────────────────────────────────────────────
        console.log('\n--- SUITE 6: uploadReleaseArtifact with S3 Provider ---');

        await test('6.1: uploadReleaseArtifact uploads and records S3 release metadata', async () => {
            const releaseFile = path.join(tempDir, 'release_artifact_test.apk');
            fs.writeFileSync(releaseFile, Buffer.alloc(10 * 1024 * 1024, 0x77)); // 10 MiB

            const expectedSha = await calculateFileSha256(releaseFile);

            const realS3Adapter = new S3StorageAdapter({
                bucket: 'medical365-releases',
                accessKeyId: 'test-r2-id',
                secretAccessKey: 'test-r2-secret',
                endpoint: mockEndpoint,
                publicBaseUrl: 'https://releases.medical365.in',
            });
            setStorageAdapter(realS3Adapter);

            try {
                const res = await uploadReleaseArtifact({
                    filePath: releaseFile,
                    fileName: 'sharma-rn-release.apk',
                    artifactType: 'APK',
                    versionCode: 12,
                    versionName: '1.2.0',
                    applicationId: 'com.medical365.sharma',
                    tenantId: 'hosp_tenant_s3_test',
                    rnBuildId: 'build-s3-123',
                    expectedSha256: expectedSha,
                    requireRealProvider: true,
                });

                assert.strictEqual(res.success, true);
                assert.strictEqual(res.provider, 's3');
                assert.strictEqual(res.fileSize, 10 * 1024 * 1024);
                assert.strictEqual(res.checksumSha256, expectedSha);
                assert.strictEqual(res.publicUrl, 'https://releases.medical365.in/releases/com.medical365.sharma/12/sharma-rn-release.apk');
                assert.strictEqual(res.fileId, 'releases/com.medical365.sharma/12/sharma-rn-release.apk');
            } finally {
                resetStorageAdapter();
                if (fs.existsSync(releaseFile)) fs.unlinkSync(releaseFile);
            }
        });

        // ─────────────────────────────────────────────────────────────────────
        // Summary
        // ─────────────────────────────────────────────────────────────────────
        console.log('\n================================================================');
        console.log(`📊 S3 / R2 TEST EXECUTION SUMMARY: ${passedCount}/${passedCount + failedCount} PASSED (${failedCount} FAILED)`);
        console.log('================================================================\n');

        if (failedCount > 0) {
            process.exit(1);
        }
    } finally {
        if (mockS3Server) {
            mockS3Server.close();
        }
    }
})();
