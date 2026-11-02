const crypto = require('crypto');
const axios = require('axios');
const Hospital = require('../models/hospital.model');
const { atomicClaimBuildWithVersion, handleBuildDispatchFailure } = require('../utils/versionAllocation.util');
const { reservePackageIdForHospital } = require('../utils/applicationId.util');

const triggerMobileBuild = async (req, res) => {
    const { id } = req.params;
    const { versionCode: requestedCode, versionName: requestedName } = req.body || {};
    const rnBuildId = `rn-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

    let claimResult;
    try {
        claimResult = await atomicClaimBuildWithVersion({
            HospitalModel: Hospital,
            hospitalId: id,
            requestedVersionCode: requestedCode,
            requestedVersionName: requestedName,
            rnBuildId
        });
    } catch (err) {
        return res.status(err.statusCode || 400).json({
            success: false,
            message: err.message,
            ...(err.buildStatus ? { buildStatus: err.buildStatus } : {})
        });
    }

    const { hospital, versionCode: nextVersionCode, versionName: nextVersionName } = claimResult;

    try {
        const safeAppName = (hospital.brandingSchema?.appName || hospital.branding?.appName || hospital.name || 'Medical 365')
            .replace(/[^a-zA-Z0-9\s]/g, '').trim();

        const { applicationId: safeApplicationId } = await reservePackageIdForHospital(hospital, Hospital);

        const logoUrl = hospital.branding?.logoUrl || 'default';
        const themeColor = hospital.branding?.primaryColor || '#14b8a6';

        const owner = process.env.GITHUB_OWNER || 'teammedical365-coder';
        const repo = process.env.GITHUB_MOBILE_REPO || 'HMS-REACT-NATIVE-APP';
        const workflowId = 'react-native-build.yml';
        const githubToken = process.env.GITHUB_PAT;

        if (!githubToken) {
            const errorMsg = 'Missing GITHUB_PAT in environment';
            await handleBuildDispatchFailure(Hospital, id, errorMsg);
            return res.status(500).json({ success: false, message: errorMsg, buildStatus: 'FAILED' });
        }

        const githubUrl = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflowId}/dispatches`;

        await axios.post(githubUrl, {
            ref: 'main',
            inputs: {
                tenantId: id.toString(),
                hospitalName: safeAppName,
                applicationId: safeApplicationId,
                logoUrl: logoUrl,
                themeColor: themeColor,
                rnBuildId: rnBuildId,
                versionCode: nextVersionCode.toString(),
                versionName: nextVersionName
            }
        }, {
            headers: {
                'Accept': 'application/vnd.github+json',
                'Authorization': `Bearer ${githubToken}`,
                'X-GitHub-Api-Version': '2022-11-28'
            }
        });

        await Hospital.findByIdAndUpdate(id, {
            $set: {
                'appConfig.androidPackageId': safeApplicationId
            }
        });

        return res.json({
            success: true,
            message: 'Mobile App build started successfully!',
            rnBuildId: rnBuildId,
            versionCode: nextVersionCode,
            versionName: nextVersionName
        });

    } catch (error) {
        console.error('[Mobile Build Controller Error]', error.response?.data || error.message);
        const errMsg = error.response?.data?.message || error.message || 'Failed to trigger mobile build pipeline';
        await handleBuildDispatchFailure(Hospital, id, errMsg);
        const status = error.response?.status || 500;
        return res.status(status).json({ success: false, message: errMsg, buildStatus: 'FAILED' });
    }
};

module.exports = { triggerMobileBuild };
