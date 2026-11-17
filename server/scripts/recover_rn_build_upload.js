/**
 * recover_rn_build_upload.js
 *
 * One-time, strictly guarded recovery script to reuse existing artifacts from failed Build #12:
 *
 * Target:
 * - Tenant ID: 6ad31d63f8f8b7ed40b397aa (City General Hospital)
 * - RN Build ID: rn-1794906316405-79b5f8b9
 * - Version Code: 12 | Version Name: 1.0.2
 * - Expected APK SHA-256: 7cf11c15bdc02bdc79f979050302b0bd43f74850ebe00b70a3323871a61953e1
 * - Expected AAB SHA-256: ad8cc653eb8f6d9dc61de375c54ac1e4acb50bcbc76624254ecb351b64945365
 * - Expected Error to Reactivate: "Artifact replacement failed: Your request contains invalid value for folder parameter."
 *
 * Usage:
 *   node scripts/recover_rn_build_upload.js --check
 *   node scripts/recover_rn_build_upload.js --apk-path <path> --aab-path <path> --execute
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');

const TARGET_TENANT_ID = '6ad31d63f8f8b7ed40b397aa';
const TARGET_RN_BUILD_ID = 'rn-1794906316405-79b5f8b9';
const TARGET_VERSION_CODE = 12;
const TARGET_VERSION_NAME = '1.0.2';
const EXPECTED_APK_SHA256 = '7cf11c15bdc02bdc79f979050302b0bd43f74850ebe00b70a3323871a61953e1';
const EXPECTED_AAB_SHA256 = 'ad8cc653eb8f6d9dc61de375c54ac1e4acb50bcbc76624254ecb351b64945365';
const EXPECTED_FAILURE_REASON = 'Artifact replacement failed: Your request contains invalid value for folder parameter.';

function computeFileSha256(filePath) {
    const hash = crypto.createHash('sha256');
    const buffer = fs.readFileSync(filePath);
    hash.update(buffer);
    return hash.digest('hex').toLowerCase();
}

async function getHospitalModel() {
    if (mongoose.models.Hospital) {
        return mongoose.models.Hospital;
    }
    const hospitalSchema = new mongoose.Schema({
        name: String,
        appConfig: mongoose.Schema.Types.Mixed,
    }, { timestamps: true });
    return mongoose.model('Hospital', hospitalSchema);
}

async function inspectCurrentState() {
    console.log('[Recovery Inspection] Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URL);
    const Hospital = await getHospitalModel();

    const hospital = await Hospital.findById(TARGET_TENANT_ID).lean();
    if (!hospital) {
        throw new Error(`Target hospital tenant ${TARGET_TENANT_ID} not found`);
    }

    const appConfig = hospital.appConfig || {};
    console.log('\n--- Current Hospital State ---');
    console.log(`Tenant ID:                   ${hospital._id}`);
    console.log(`Hospital Name:               ${hospital.name}`);
    console.log(`rnBuildId:                   ${appConfig.rnBuildId}`);
    console.log(`rnBuildStatus:               ${appConfig.rnBuildStatus}`);
    console.log(`rnBuildError:                ${appConfig.rnBuildError}`);
    console.log(`lastAllocatedVersionCode:    ${appConfig.lastAllocatedVersionCode}`);
    console.log(`pendingVersionCode:          ${appConfig.pendingVersionCode}`);
    console.log(`pendingVersionName:          ${appConfig.pendingVersionName}`);
    console.log(`versionCode:                 ${appConfig.versionCode}`);
    console.log(`versionName:                 ${appConfig.versionName}`);
    console.log(`updatedAt:                   ${hospital.updatedAt}`);
    console.log('------------------------------\n');

    const canReactivate = (
        appConfig.rnBuildId === TARGET_RN_BUILD_ID &&
        appConfig.rnBuildStatus === 'FAILED' &&
        appConfig.rnBuildError === EXPECTED_FAILURE_REASON &&
        appConfig.lastAllocatedVersionCode === TARGET_VERSION_CODE
    );

    return { hospital, canReactivate };
}

async function reactivateBuildState() {
    const Hospital = await getHospitalModel();

    console.log(`[Recovery Step 1] Narrowly reactivating build state for ${TARGET_TENANT_ID}...`);
    const result = await Hospital.findOneAndUpdate(
        {
            _id: TARGET_TENANT_ID,
            'appConfig.rnBuildId': TARGET_RN_BUILD_ID,
            'appConfig.rnBuildStatus': 'FAILED',
            'appConfig.rnBuildError': EXPECTED_FAILURE_REASON,
        },
        {
            $set: {
                'appConfig.rnBuildStatus': 'BUILDING',
                'appConfig.pendingVersionCode': TARGET_VERSION_CODE,
                'appConfig.pendingVersionName': TARGET_VERSION_NAME,
                'appConfig.rnBuildError': '',
            }
        },
        { new: true }
    );

    if (!result) {
        throw new Error(`Failed to reactivate build state. Guard condition failed: verify that tenant status is still FAILED with the exact folder validation error.`);
    }

    console.log(`✓ [Recovery Step 1 Complete] Status successfully transitioned FAILED -> BUILDING for rnBuildId: ${TARGET_RN_BUILD_ID}`);
    return result;
}

async function uploadRecoveredArtifacts(apkPath, aabPath) {
    const { uploadReleaseArtifact, resolveStorageAdapter } = require('../src/utils/artifactStorage.util');
    const Hospital = await getHospitalModel();

    console.log('[Recovery Step 2] Validating file checksums...');
    const actualApkSha = computeFileSha256(apkPath);
    const actualAabSha = computeFileSha256(aabPath);

    console.log(`APK SHA-256: ${actualApkSha}`);
    console.log(`Expected:    ${EXPECTED_APK_SHA256}`);
    if (actualApkSha !== EXPECTED_APK_SHA256) {
        throw new Error(`APK checksum mismatch! Aborting upload to prevent corrupt artifact persistence.`);
    }

    console.log(`AAB SHA-256: ${actualAabSha}`);
    console.log(`Expected:    ${EXPECTED_AAB_SHA256}`);
    if (actualAabSha !== EXPECTED_AAB_SHA256) {
        throw new Error(`AAB checksum mismatch! Aborting upload to prevent corrupt artifact persistence.`);
    }

    console.log('✓ Checksums verified match exact GitHub run 44052325199 artifacts.');

    // Transition BUILDING -> PROCESSING
    await Hospital.updateOne(
        { _id: TARGET_TENANT_ID, 'appConfig.rnBuildId': TARGET_RN_BUILD_ID },
        { $set: { 'appConfig.rnBuildStatus': 'PROCESSING' } }
    );

    let apkUpload = null;
    let aabUpload = null;

    try {
        console.log('[Recovery Step 3] Uploading APK to durable storage with sanitized folder path...');
        apkUpload = await uploadReleaseArtifact({
            filePath: apkPath,
            fileName: 'citygeneral-rn-release.apk',
            artifactType: 'APK',
            versionCode: TARGET_VERSION_CODE,
            versionName: TARGET_VERSION_NAME,
            applicationId: 'com.medical365.citygeneral',
            tenantId: TARGET_TENANT_ID,
            rnBuildId: TARGET_RN_BUILD_ID,
            expectedSha256: EXPECTED_APK_SHA256,
            requireRealProvider: true,
        });
        console.log(`✓ APK uploaded successfully:`);
        console.log(`  StorageKey: ${apkUpload.storageKey}`);
        console.log(`  PublicUrl:  ${apkUpload.publicUrl || '(private durable storage)'}`);

        console.log('[Recovery Step 4] Uploading AAB to durable storage with sanitized folder path...');
        aabUpload = await uploadReleaseArtifact({
            filePath: aabPath,
            fileName: 'citygeneral-rn-release.aab',
            artifactType: 'AAB',
            versionCode: TARGET_VERSION_CODE,
            versionName: TARGET_VERSION_NAME,
            applicationId: 'com.medical365.citygeneral',
            tenantId: TARGET_TENANT_ID,
            rnBuildId: TARGET_RN_BUILD_ID,
            expectedSha256: EXPECTED_AAB_SHA256,
            requireRealProvider: true,
        });
        console.log(`✓ AAB uploaded successfully:`);
        console.log(`  StorageKey: ${aabUpload.storageKey}`);
        console.log(`  PublicUrl:  ${aabUpload.publicUrl || '(private durable storage)'}`);
    } catch (uploadErr) {
        console.error('\n[Build Safety] Upload step failed:', uploadErr.message);

        // Orphaned APK Cleanup if AAB upload fails
        if (apkUpload && (apkUpload.fileId || apkUpload.storageKey)) {
            const orphanKey = apkUpload.fileId || apkUpload.storageKey;
            console.warn(`[Build Safety] Cleaning up orphaned APK from durable storage: ${orphanKey}`);
            try {
                const adapter = resolveStorageAdapter({ requireRealProvider: true });
                if (adapter && typeof adapter.delete === 'function') {
                    await adapter.delete(orphanKey);
                    console.log(`[Build Safety] Orphaned APK deleted successfully.`);
                }
                const ReleaseArtifact = require('../src/models/releaseArtifact.model');
                if (ReleaseArtifact && ReleaseArtifact.deleteOne) {
                    await ReleaseArtifact.deleteOne({ storageKey: apkUpload.storageKey });
                }
            } catch (cleanupErr) {
                console.error(`[Build Safety] Warning: failed to clean up orphaned APK:`, cleanupErr.message);
            }
        }

        // Keep DB state consistent on failure: preserve existing versionCode/versionName, mark FAILED
        try {
            await Hospital.updateOne(
                { _id: TARGET_TENANT_ID, 'appConfig.rnBuildId': TARGET_RN_BUILD_ID },
                {
                    $set: {
                        'appConfig.rnBuildStatus': 'FAILED',
                        'appConfig.rnBuildError': `Artifact replacement failed: ${uploadErr.message}`,
                        'appConfig.pendingVersionCode': null,
                        'appConfig.pendingVersionName': null,
                    }
                }
            );
        } catch (dbErr) {
            console.error('[Build Safety] Error updating hospital status after failure:', dbErr.message);
        }

        throw uploadErr;
    }

    // Update Hospital record to COMPLETED only after BOTH uploads succeed
    console.log('[Recovery Step 5] Finalizing Hospital record to COMPLETED...');
    const now = new Date();
    await Hospital.updateOne(
        { _id: TARGET_TENANT_ID, 'appConfig.rnBuildId': TARGET_RN_BUILD_ID },
        {
            $set: {
                'appConfig.rnBuildStatus': 'COMPLETED',
                'appConfig.rnLastBuiltAt': now,
                'appConfig.versionCode': TARGET_VERSION_CODE,
                'appConfig.versionName': TARGET_VERSION_NAME,
                'appConfig.pendingVersionCode': null,
                'appConfig.pendingVersionName': null,
                'appConfig.rnApkUrl': apkUpload.publicUrl || '',
                'appConfig.rnAabUrl': aabUpload.publicUrl || '',
                'appConfig.rnApkStorageKey': apkUpload.storageKey,
                'appConfig.rnAabStorageKey': aabUpload.storageKey,
                'appConfig.rnStorageProvider': apkUpload.provider,
                'appConfig.rnChecksumSha256': EXPECTED_APK_SHA256,
                'appConfig.rnBuildError': '',
            }
        }
    );

    console.log('\n================================================================');
    console.log('🎉 RECOVERY COMPLETED SUCCESSFULLY!');
    console.log(`Hospital ${TARGET_TENANT_ID} is now COMPLETED at Version Code ${TARGET_VERSION_CODE} (${TARGET_VERSION_NAME}).`);
    console.log('================================================================\n');
}

async function main() {
    const args = process.argv.slice(2);
    const isCheck = args.includes('--check');
    const isExecute = args.includes('--execute');

    let apkPath = null;
    let aabPath = null;
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--apk-path' && args[i + 1]) apkPath = args[i + 1];
        if (args[i] === '--aab-path' && args[i + 1]) aabPath = args[i + 1];
    }

    try {
        const { hospital, canReactivate } = await inspectCurrentState();

        if (isCheck || !isExecute) {
            console.log('Inspection Mode only. No changes were made.');
            console.log(`Can narrowly reactivate build state? ${canReactivate ? 'YES ✅' : 'NO ❌'}`);
            if (!canReactivate) {
                console.log('Reason: Database state does not match the exact guard conditions for recovery.');
            }
            process.exit(0);
        }

        if (!canReactivate) {
            throw new Error('Guard condition failed: cannot execute recovery on current database state.');
        }

        if (!apkPath || !fs.existsSync(apkPath)) {
            throw new Error(`Valid --apk-path required. File not found at: ${apkPath}`);
        }
        if (!aabPath || !fs.existsSync(aabPath)) {
            throw new Error(`Valid --aab-path required. File not found at: ${aabPath}`);
        }

        await reactivateBuildState();
        await uploadRecoveredArtifacts(apkPath, aabPath);
        process.exit(0);
    } catch (err) {
        console.error('\n❌ RECOVERY ERROR:', err.message);
        process.exit(1);
    }
}

main();

