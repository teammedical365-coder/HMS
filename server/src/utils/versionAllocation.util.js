/**
 * versionAllocation.util.js
 * 
 * Version Code & Semantic Versioning automation for hospital native Android builds.
 * 
 * Android Version Code rules:
 * - Positive 32-bit integer: 1 <= versionCode <= 2,100,000,000.
 * - Existing/default Android versionCode: 1 is treated as the potential installed baseline.
 *   The next upgrade build must allocate at least 2, not reuse 1.
 * - Every subsequent build receives a strictly higher code than the confirmed version
 *   and the highest reserved/allocated version.
 * 
 * Version Name rules:
 * - Semantic versioning: MAJOR.MINOR.PATCH[-PRERELEASE] (e.g. 1.0.0, 1.0.1, 2.1.0-beta.1).
 * - For native releases, an explicit version bump is required, or a higher patch version
 *   is safely allocated automatically.
 * - Old runtime versions are NEVER silently reused after a native change.
 * 
 * Fail-safe allocation & concurrency rules:
 * - A single atomic claim function `atomicClaimBuildWithVersion` ensures both backend
 *   entry points use one consistent implementation and do not allocate twice.
 * - If workflow dispatch fails, `handleBuildDispatchFailure` preserves lastAllocatedVersionCode
 *   so the reserved version code is burned and NOT silently reused for a different build.
 * - Bounded validation rejects malformed, zero, negative, float, lower, or out-of-range values.
 */

const SEMVER_REGEX = /^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$/;
const MAX_ANDROID_VERSION_CODE = 2100000000;

/**
 * Validates a version code value.
 * @param {any} code 
 * @returns {boolean}
 */
function isValidVersionCode(code) {
    if (code === null || code === undefined) return false;
    const num = Number(code);
    if (!Number.isInteger(num)) return false;
    if (num < 1 || num > MAX_ANDROID_VERSION_CODE) return false;
    return true;
}

/**
 * Validates a version name string against semantic versioning.
 * @param {any} name 
 * @returns {boolean}
 */
function isValidVersionName(name) {
    if (typeof name !== 'string') return false;
    const trimmed = name.trim();
    if (!trimmed) return false;
    return SEMVER_REGEX.test(trimmed);
}

/**
 * Parses a semantic version string into major, minor, patch, prerelease components.
 * @param {string} versionStr 
 * @returns {{ major: number, minor: number, patch: number, prerelease: string|null }|null}
 */
function parseSemver(versionStr) {
    if (typeof versionStr !== 'string') return null;
    const match = versionStr.trim().match(/^([0-9]+)\.([0-9]+)\.([0-9]+)(?:-([0-9A-Za-z.-]+))?$/);
    if (!match) return null;
    return {
        major: parseInt(match[1], 10),
        minor: parseInt(match[2], 10),
        patch: parseInt(match[3], 10),
        prerelease: match[4] || null
    };
}

/**
 * Compares two semantic version strings.
 * Returns > 0 if v1 > v2, 0 if v1 == v2, < 0 if v1 < v2.
 * @param {string} v1 
 * @param {string} v2 
 * @returns {number}
 */
function compareSemver(v1, v2) {
    const p1 = parseSemver(v1);
    const p2 = parseSemver(v2);
    if (!p1 || !p2) {
        throw new Error(`Invalid semver comparison between '${v1}' and '${v2}'.`);
    }

    if (p1.major !== p2.major) return p1.major - p2.major;
    if (p1.minor !== p2.minor) return p1.minor - p2.minor;
    if (p1.patch !== p2.patch) return p1.patch - p2.patch;

    // Prerelease comparison: a stable release (no prerelease) is higher than a prerelease
    if (!p1.prerelease && p2.prerelease) return 1;
    if (p1.prerelease && !p2.prerelease) return -1;
    if (p1.prerelease && p2.prerelease) {
        return p1.prerelease.localeCompare(p2.prerelease);
    }
    return 0;
}

/**
 * Safely bumps the patch number of a semantic version string.
 * @param {string} versionStr 
 * @returns {string}
 */
function bumpPatchVersion(versionStr) {
    const parsed = parseSemver(versionStr);
    if (!parsed) return '1.0.1';
    return `${parsed.major}.${parsed.minor}.${parsed.patch + 1}`;
}

/**
 * Allocates the next version code and version name for a hospital native release.
 * 
 * Rules:
 * 1. Default/existing Android versionCode 1 is treated as the installed baseline.
 *    The next upgrade build allocates 2, not reusing 1.
 * 2. Every subsequent build gets a strictly higher code than the confirmed version
 *    and the highest reserved/allocated version.
 * 3. Never silently reuse an old runtime version after a native change: auto-bumps patch
 *    or requires an explicit higher SemVer bump.
 * 
 * @param {object} hospital - Hospital Mongoose document or plain object
 * @param {number|string} [requestedCode] - Optional explicitly requested versionCode
 * @param {string} [requestedName] - Optional explicitly requested versionName
 * @returns {{ versionCode: number, versionName: string }}
 * @throws {Error} if validation fails or requested values are <= previous/baseline values
 */
function allocateNextVersion(hospital, requestedCode, requestedName) {
    const appConfig = hospital?.appConfig || {};
    const confirmedCode = Number(appConfig.versionCode) || 1;
    const lastAllocated = Number(appConfig.lastAllocatedVersionCode) || 0;

    // Existing/default Android versionCode 1 is treated as the potential installed baseline.
    // The highest known version code is at least 1.
    const highestKnownCode = Math.max(1, confirmedCode, lastAllocated);

    let nextCode;
    if (requestedCode !== undefined && requestedCode !== null && String(requestedCode).trim() !== '') {
        const parsed = Number(requestedCode);
        if (!isValidVersionCode(parsed)) {
            throw new Error(`Invalid versionCode: '${requestedCode}'. Must be a positive integer between 1 and ${MAX_ANDROID_VERSION_CODE}.`);
        }
        if (parsed <= highestKnownCode) {
            throw new Error(`Invalid versionCode: requested ${parsed} must be strictly greater than previous/baseline version (${highestKnownCode}).`);
        }
        nextCode = parsed;
    } else {
        // Next build allocates strictly higher code than baseline and highest reserved (1 -> 2 -> 3)
        nextCode = highestKnownCode + 1;
    }

    if (nextCode > MAX_ANDROID_VERSION_CODE) {
        throw new Error(`Version code allocation exceeded maximum Android limit (${MAX_ANDROID_VERSION_CODE}).`);
    }

    // Determine previous confirmed/baseline versionName
    const prevVersionName = (appConfig.versionName && isValidVersionName(appConfig.versionName))
        ? appConfig.versionName.trim()
        : ((appConfig.appVersion && isValidVersionName(appConfig.appVersion))
            ? appConfig.appVersion.trim()
            : '1.0.0');

    let nextName;
    if (requestedName !== undefined && requestedName !== null && String(requestedName).trim() !== '') {
        const trimmed = String(requestedName).trim();
        if (!isValidVersionName(trimmed)) {
            throw new Error(`Invalid versionName: '${requestedName}'. Expected semantic version format (e.g. 1.0.0).`);
        }
        if (compareSemver(trimmed, prevVersionName) <= 0) {
            throw new Error(`Invalid versionName: requested '${trimmed}' must be strictly greater than previous release version ('${prevVersionName}').`);
        }
        nextName = trimmed;
    } else {
        // For native releases, safely allocate a higher patch version; never silently reuse an old runtime version
        nextName = bumpPatchVersion(prevVersionName);
    }

    return {
        versionCode: nextCode,
        versionName: nextName
    };
}

/**
 * Atomically reserves a new build slot and allocates the next versionCode and versionName
 * for a hospital, preventing duplicate build races and duplicate version code allocations.
 * Shared by all backend build entry points to ensure single, consistent allocation.
 * 
 * @param {object} params
 * @param {object} params.HospitalModel - Mongoose Hospital model
 * @param {string} params.hospitalId - Hospital ObjectId string
 * @param {number|string} [params.requestedVersionCode] - Optional explicitly requested versionCode
 * @param {string} [params.requestedVersionName] - Optional explicitly requested versionName
 * @param {string} params.rnBuildId - Unique build correlation ID
 * @returns {Promise<{ hospital: object, versionCode: number, versionName: string }>}
 */
async function atomicClaimBuildWithVersion({
    HospitalModel,
    hospitalId,
    requestedVersionCode,
    requestedVersionName,
    rnBuildId
}) {
    const existing = await HospitalModel.findById(hospitalId);
    if (!existing) {
        const notFoundErr = new Error('Hospital not found');
        notFoundErr.statusCode = 404;
        throw notFoundErr;
    }

    // Allocate next version code and version name with strict validation
    const { versionCode, versionName } = allocateNextVersion(
        existing,
        requestedVersionCode,
        requestedVersionName
    );

    // Atomically claim the build slot
    const claimed = await HospitalModel.findOneAndUpdate(
        {
            _id: hospitalId,
            'appConfig.rnBuildStatus': { $nin: ['BUILDING', 'PROCESSING'] }
        },
        {
            $set: {
                isWhitelabeled: true,
                'appConfig.rnBuildStatus': 'BUILDING',
                'appConfig.rnBuildStartedAt': new Date(),
                'appConfig.rnBuildId': rnBuildId,
                'appConfig.rnBuildError': '',
                'appConfig.pendingVersionCode': versionCode,
                'appConfig.pendingVersionName': versionName,
                'appConfig.lastAllocatedVersionCode': versionCode
            }
        },
        { new: true }
    );

    if (!claimed) {
        const conflictErr = new Error('A mobile build is already in progress.');
        conflictErr.statusCode = 409;
        conflictErr.buildStatus = 'BUILDING';
        throw conflictErr;
    }

    return {
        hospital: claimed,
        versionCode,
        versionName
    };
}

/**
 * Safely marks build as failed on dispatch error, clearing pending versions while
 * preserving lastAllocatedVersionCode so the reserved version code is burned and not reused.
 * 
 * @param {object} HospitalModel 
 * @param {string} hospitalId 
 * @param {string} errorMessage 
 */
async function handleBuildDispatchFailure(HospitalModel, hospitalId, errorMessage) {
    await HospitalModel.findByIdAndUpdate(hospitalId, {
        $set: {
            'appConfig.rnBuildStatus': 'FAILED',
            'appConfig.rnBuildError': errorMessage,
            'appConfig.pendingVersionCode': null,
            'appConfig.pendingVersionName': null
            // Note: lastAllocatedVersionCode is retained so this version is not silently reused!
        }
    });
}

module.exports = {
    SEMVER_REGEX,
    MAX_ANDROID_VERSION_CODE,
    isValidVersionCode,
    isValidVersionName,
    parseSemver,
    compareSemver,
    bumpPatchVersion,
    allocateNextVersion,
    atomicClaimBuildWithVersion,
    handleBuildDispatchFailure
};
