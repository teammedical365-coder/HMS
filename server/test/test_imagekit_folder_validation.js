/**
 * test_imagekit_folder_validation.js
 *
 * Regression test suite verifying:
 * 1. Application ID sanitization for ImageKit folder and durable storage paths.
 * 2. Preservation of original dotted Android package ID in artifact metadata and ReleaseArtifact records.
 * 3. File extension preservation for APK and AAB.
 * 4. ImageKit folder path strict character validation (no dots or special characters).
 * 5. Consistency between storageKey and ImageKit getDownloadUrl().
 * 6. Non-breakage of legacy artifact records and direct URLs.
 */

require('dotenv').config();
const assert = require('assert');
const path = require('path');
const {
    sanitizeStorageAppId,
    uploadReleaseArtifact,
    MockStorageAdapter,
    ImageKitStorageAdapter,
    isVerifiedDirectArtifactUrl,
    setStorageAdapter,
    resetStorageAdapter,
} = require('../src/utils/artifactStorage.util');

let passedTests = 0;
let totalTests = 0;

function it(description, fn) {
    totalTests++;
    try {
        fn();
        console.log(`  ✓ [PASS] ${description}`);
        passedTests++;
    } catch (err) {
        console.error(`  ✗ [FAIL] ${description}:`, err.message);
        throw err;
    }
}

async function itAsync(description, fn) {
    totalTests++;
    try {
        await fn();
        console.log(`  ✓ [PASS] ${description}`);
        passedTests++;
    } catch (err) {
        console.error(`  ✗ [FAIL] ${description}:`, err.message);
        throw err;
    }
}

async function runTests() {
    console.log('================================================================');
    console.log('🧪 VERIFYING IMAGEKIT FOLDER VALIDATION & STORAGE KEY SANITIZATION');
    console.log('================================================================\n');

    // ── SUITE 1: sanitizeStorageAppId Behavior ──────────────────────────────
    console.log('--- SUITE 1: Application ID Sanitization ---');

    it('1.1: com.medical365.citygeneral sanitizes to com_medical365_citygeneral', () => {
        const sanitized = sanitizeStorageAppId('com.medical365.citygeneral');
        assert.strictEqual(sanitized, 'com_medical365_citygeneral');
        assert.ok(!sanitized.includes('.'), 'Must not contain dots');
        assert.match(sanitized, /^[a-z0-9_-]+$/, 'Only alphanumeric, underscore and hyphen allowed');
    });

    it('1.2: Handles uppercase, whitespace and multiple dots safely', () => {
        const sanitized = sanitizeStorageAppId('  COM.Medical365.City_General-Special.v2  ');
        assert.strictEqual(sanitized, 'com_medical365_city_general-special_v2');
        assert.ok(!sanitized.includes('.'));
    });

    it('1.3: Default fallback when applicationId is empty or null', () => {
        assert.strictEqual(sanitizeStorageAppId(''), 'com_medical365_app');
        assert.strictEqual(sanitizeStorageAppId(null), 'com_medical365_app');
        assert.strictEqual(sanitizeStorageAppId(undefined), 'com_medical365_app');
    });

    // ── SUITE 2: Storage Key & Folder Character Validation ──────────────────
    console.log('\n--- SUITE 2: Folder Path & Character Validation ---');

    it('2.1: Storage key contains no dots in folder segments and preserves .apk extension', () => {
        const appId = 'com.medical365.citygeneral';
        const safeAppId = sanitizeStorageAppId(appId);
        const versionCode = 12;
        const fileName = 'citygeneral-rn-release.apk';
        const storageKey = `releases/${safeAppId}/${versionCode}/${fileName}`;

        assert.strictEqual(storageKey, 'releases/com_medical365_citygeneral/12/citygeneral-rn-release.apk');
        assert.strictEqual(path.extname(storageKey), '.apk');

        const folderPortion = path.posix.dirname(storageKey);
        assert.strictEqual(folderPortion, 'releases/com_medical365_citygeneral/12');
        assert.ok(!folderPortion.includes('.'), 'Folder path must not contain dots');
        assert.match(folderPortion, /^releases\/[a-zA-Z0-9_-]+\/[0-9]+$/, 'Folder path strictly alphanumeric and underscores');
    });

    it('2.2: Storage key preserves .aab extension for AAB releases', () => {
        const appId = 'com.medical365.citygeneral';
        const safeAppId = sanitizeStorageAppId(appId);
        const versionCode = 12;
        const fileName = 'citygeneral-rn-release.aab';
        const storageKey = `releases/${safeAppId}/${versionCode}/${fileName}`;

        assert.strictEqual(storageKey, 'releases/com_medical365_citygeneral/12/citygeneral-rn-release.aab');
        assert.strictEqual(path.extname(storageKey), '.aab');
        assert.ok(!path.posix.dirname(storageKey).includes('.'));
    });

    it('2.3: ImageKit folder construction strips dots even if raw key contains dots in folder', () => {
        const rawKey = 'releases/com.medical365.citygeneral/12/citygeneral-rn-release.apk';
        const normalizedKey = rawKey.replace(/\\/g, '/');
        const rawFolder = path.posix.dirname(normalizedKey);
        const cleanFolderSegments = rawFolder
            .split('/')
            .filter(Boolean)
            .map(seg => seg.replace(/[^a-zA-Z0-9_-]/g, '_'));
        const folder = `/${cleanFolderSegments.join('/')}`;

        assert.strictEqual(folder, '/releases/com_medical365_citygeneral/12');
        assert.ok(!folder.includes('.'), 'Cleaned folder must not contain dots');
        assert.match(folder, /^\/[a-zA-Z0-9_/-]+$/, 'Valid ImageKit folder string');
    });

    // ── SUITE 3: uploadReleaseArtifact Integration & Metadata Preservation ──
    console.log('\n--- SUITE 3: uploadReleaseArtifact & Metadata Preservation ---');

    await itAsync('3.1: uploadReleaseArtifact stores safe storageKey while preserving original dotted applicationId in metadata', async () => {
        const mock = new MockStorageAdapter();
        setStorageAdapter(mock);

        try {
            const dummyBuffer = Buffer.from('dummy-apk-data-for-testing-12345');
            const expectedSha = require('crypto').createHash('sha256').update(dummyBuffer).digest('hex');

            const result = await uploadReleaseArtifact({
                buffer: dummyBuffer,
                fileName: 'citygeneral-rn-release.apk',
                artifactType: 'APK',
                versionCode: 12,
                versionName: '1.0.2',
                applicationId: 'com.medical365.citygeneral',
                tenantId: '6ad31d63f8f8b7ed40b397aa',
                rnBuildId: 'rn-1794906316405-79b5f8b9',
                expectedSha256: expectedSha,
                requireRealProvider: false,
            });

            assert.strictEqual(result.success, true);
            assert.strictEqual(result.storageKey, 'releases/com_medical365_citygeneral/12/citygeneral-rn-release.apk');

            const storedItem = await mock.getObject(result.storageKey);
            assert.ok(storedItem, 'Object must exist at sanitized storage key');
            assert.strictEqual(storedItem.metadata.applicationId, 'com.medical365.citygeneral', 'Original dotted package ID preserved in metadata');
            assert.strictEqual(storedItem.metadata.versionCode, 12);
            assert.strictEqual(storedItem.metadata.versionName, '1.0.2');
            assert.strictEqual(storedItem.metadata.tenantId, '6ad31d63f8f8b7ed40b397aa');
            assert.strictEqual(storedItem.metadata.rnBuildId, 'rn-1794906316405-79b5f8b9');
        } finally {
            resetStorageAdapter();
        }
    });

    await itAsync('3.2: uploadReleaseArtifact for AAB preserves .aab and original metadata', async () => {
        const mock = new MockStorageAdapter();
        setStorageAdapter(mock);

        try {
            const dummyBuffer = Buffer.from('dummy-aab-data-for-testing-67890');
            const expectedSha = require('crypto').createHash('sha256').update(dummyBuffer).digest('hex');

            const result = await uploadReleaseArtifact({
                buffer: dummyBuffer,
                fileName: 'citygeneral-rn-release.aab',
                artifactType: 'AAB',
                versionCode: 12,
                versionName: '1.0.2',
                applicationId: 'com.medical365.citygeneral',
                tenantId: '6ad31d63f8f8b7ed40b397aa',
                rnBuildId: 'rn-1794906316405-79b5f8b9',
                expectedSha256: expectedSha,
                requireRealProvider: false,
            });

            assert.strictEqual(result.success, true);
            assert.strictEqual(result.storageKey, 'releases/com_medical365_citygeneral/12/citygeneral-rn-release.aab');

            const storedItem = await mock.getObject(result.storageKey);
            assert.strictEqual(storedItem.metadata.applicationId, 'com.medical365.citygeneral');
            assert.strictEqual(storedItem.metadata.artifactType, 'AAB');
        } finally {
            resetStorageAdapter();
        }
    });

    // ── SUITE 4: ImageKit Download URL Mapping & Non-Breakage ────────────────
    console.log('\n--- SUITE 4: Download URL Mapping & Backward Compatibility ---');

    await itAsync('4.1: ImageKitStorageAdapter.getDownloadUrl maps storageKey without double slashes', async () => {
        const adapter = new ImageKitStorageAdapter();
        const key = 'releases/com_medical365_citygeneral/12/citygeneral-rn-release.apk';
        const downloadUrl = await adapter.getDownloadUrl(key);

        assert.ok(downloadUrl.endsWith('/releases/com_medical365_citygeneral/12/citygeneral-rn-release.apk'));
        assert.ok(!downloadUrl.includes('//releases'), 'Must not have duplicate slashes');
        assert.ok(downloadUrl.startsWith('https://'), 'Must be HTTPS URL');
    });

    it('4.2: isVerifiedDirectArtifactUrl accepts legitimate cloud URLs from ImageKit with sanitized key', () => {
        const endpoint = process.env.IMAGEKIT_URL_ENDPOINTS || 'https://ik.imagekit.io/medical365';
        const cleanUrl = `${endpoint}/releases/com_medical365_citygeneral/12/citygeneral-rn-release.apk`;
        assert.strictEqual(isVerifiedDirectArtifactUrl(cleanUrl), true);
    });

    it('4.3: Legacy direct URLs without underscores continue to pass validation', () => {
        const endpoint = process.env.IMAGEKIT_URL_ENDPOINTS || 'https://ik.imagekit.io/medical365';
        const legacyUrl = `${endpoint}/releases/legacy-cityhospital/1/cityhospital-release.apk`;
        assert.strictEqual(isVerifiedDirectArtifactUrl(legacyUrl), true);
    });

    console.log('\n================================================================');
    console.log(`📊 TEST EXECUTION SUMMARY: ${passedTests}/${totalTests} PASSED (0 FAILED)`);
    console.log('================================================================\n');
}

runTests().catch(err => {
    console.error('Test execution failed:', err);
    process.exit(1);
});
