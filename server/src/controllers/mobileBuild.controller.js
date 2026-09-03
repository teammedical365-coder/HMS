const axios = require('axios');
const Hospital = require('../models/hospital.model');

const triggerMobileBuild = async (req, res) => {
    try {
        const { id } = req.params;
        const hospital = await Hospital.findById(id);

        if (!hospital) {
            return res.status(404).json({ success: false, message: 'Hospital not found' });
        }

        const safeAppName = (hospital.brandingSchema?.appName || hospital.branding?.appName || hospital.name || 'City Hospital')
            .replace(/[^a-zA-Z0-9\s]/g, '').trim();
        const safeCode = hospital.hospitalCode || id.substring(0, 8);
        const safeApplicationId = `com.medical365.${safeCode.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()}`;
        const logoUrl = hospital.branding?.logoUrl || 'default';
        const themeColor = hospital.branding?.primaryColor || '#14b8a6';

        const owner = process.env.GITHUB_OWNER || 'teammedical365-coder';
        const repo = process.env.GITHUB_REPO || 'HMS';
        const workflowId = 'react-native-build.yml';
        const githubToken = process.env.GITHUB_PAT;

        if (!githubToken) {
            return res.status(500).json({ success: false, message: 'Missing GITHUB_PAT in environment' });
        }

        const githubUrl = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflowId}/dispatches`;

        await axios.post(githubUrl, {
            ref: 'main',
            inputs: {
                tenantId: id.toString(),
                hospitalName: safeAppName,
                applicationId: safeApplicationId,
                logoUrl: logoUrl,
                themeColor: themeColor
            }
        }, {
            headers: {
                'Accept': 'application/vnd.github+json',
                'Authorization': `Bearer ${githubToken}`,
                'X-GitHub-Api-Version': '2022-11-28'
            }
        });

        if (!hospital.appConfig) hospital.appConfig = {};
        hospital.isWhitelabeled = true;
        hospital.appConfig.rnBuildStatus = 'BUILDING';
        hospital.appConfig.rnBuildStartedAt = new Date();
        hospital.appConfig.rnBuildError = '';
        await hospital.save();

        return res.json({ success: true, message: 'Mobile App build started successfully!' });

    } catch (error) {
        console.error('[Mobile Build Controller Error]', error.response?.data || error.message);
        const status = error.response?.status || 500;
        return res.status(status).json({ success: false, message: 'Failed to trigger mobile build pipeline' });
    }
};

module.exports = { triggerMobileBuild };
