const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const { verifyToken } = require('../middleware/auth.middleware');
const User = require('../models/user.model');
const Hospital = require('../models/hospital.model');
const LabOrder = require('../models/labOrder.model');
const LabTest = require('../models/labTest.model');
const LabSample = require('../models/labSample.model');
const LabLocation = require('../models/labLocation.model');
const LabTestResult = require('../models/labTestResult.model');
const LabResultHistory = require('../models/labResultHistory.model');
const LabCriticalAlert = require('../models/labCriticalAlert.model');
const { evaluateParameter } = require('../utils/referenceRangeEngine');

// =========================================================================
// 1. ROLE & PERMISSION MIDDLEWARE
// =========================================================================
const verifyResultAccess = (req, res, next) => {
    const user = req.user;
    if (!user) return res.status(401).json({ success: false, message: 'Authentication required' });

    const roleData = user._roleData;
    const roleName = String(roleData?.name || user.role || '').toLowerCase();
    const perms = roleData?.permissions || [];

    // Receptionists and Accountants are strictly blocked from clinical result entry/verification
    if (roleName.includes('reception') || roleName.includes('accountant')) {
        return res.status(403).json({
            success: false,
            message: 'Access denied: Receptionists and Accountants cannot access clinical laboratory result entry or verification'
        });
    }

    const isAuthorized = (
        perms.includes('*') ||
        roleName.includes('admin') ||
        roleName.includes('manager') ||
        roleName.includes('tech') ||
        roleName.includes('pathologist') ||
        perms.includes('results:view') ||
        perms.includes('results:enter') ||
        perms.includes('results:verify') ||
        perms.includes('lab_view')
    );

    if (!isAuthorized) {
        return res.status(403).json({ success: false, message: 'Access denied: Result workflow permissions required' });
    }

    req.hospitalId = req.user.hospitalId || req.headers['x-hospital-id'] || null;
    next();
};

const verifyVerificationPermission = (req, res, next) => {
    const user = req.user;
    const roleData = user._roleData;
    const roleName = String(roleData?.name || user.role || '').toLowerCase();
    const perms = roleData?.permissions || [];

    const canVerify = (
        perms.includes('*') ||
        roleName.includes('admin') ||
        roleName.includes('pathologist') ||
        perms.includes('results:verify')
    );

    if (!canVerify) {
        return res.status(403).json({
            success: false,
            message: 'Access denied: Pathologist verification permissions required'
        });
    }

    next();
};

// Helper: Log Result History
async function logResultHistory({ hospitalId, resultId, orderId, testId, testCode, previousStatus, newStatus, action, revisionNumber, user, details = {} }) {
    try {
        await LabResultHistory.create({
            hospitalId,
            resultId,
            orderId,
            testId,
            testCode,
            previousStatus,
            newStatus,
            action,
            revisionNumber,
            performedBy: user._id,
            performedByName: user.name || 'Lab Staff',
            details,
            timestamp: new Date()
        });
    } catch (err) {
        console.error('[result history log error]:', err);
    }
}

// =========================================================================
// 2. RESULT ENTRY QUEUE & INITIALIZATION
// =========================================================================

/**
 * GET /api/lab/results/entry-queue
 * Lists eligible samples/orders awaiting technician result entry.
 */
router.get('/entry-queue', verifyToken, verifyResultAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId;
        const { search = '', department = '', priority = '', status = '' } = req.query;

        // Query eligible samples: accepted or processing on bench
        const sampleQuery = {
            hospitalId,
            status: { $in: ['ACCEPTED', 'PROCESSING', 'PROCESSING_COMPLETED', 'COLLECTED'] }
        };

        if (priority) sampleQuery.priority = priority;

        if (search) {
            const regex = new RegExp(search.trim(), 'i');
            sampleQuery.$or = [
                { barcode: regex },
                { orderNumber: regex },
                { 'patientSnapshot.name': regex },
                { 'patientSnapshot.uhid': regex },
                { 'patientSnapshot.phone': regex }
            ];
        }

        const samples = await LabSample.find(sampleQuery)
            .sort({ priority: -1, createdAt: -1 })
            .limit(100)
            .lean();

        // Check which tests already have results
        const sampleIds = samples.map(s => s._id);
        const existingResults = await LabTestResult.find({
            hospitalId,
            sampleId: { $in: sampleIds }
        }).lean();

        const resultMap = {};
        existingResults.forEach(r => {
            const key = `${r.sampleId}_${r.testId}`;
            resultMap[key] = r;
        });

        // Flatten tests within eligible samples
        const queueItems = [];
        for (const s of samples) {
            for (const t of (s.tests || [])) {
                if (department && t.department && t.department !== department) continue;

                const key = `${s._id}_${t.testId}`;
                const resDoc = resultMap[key];

                // If filter by status requested
                if (status && resDoc && resDoc.resultStatus !== status) continue;
                if (status && !resDoc && status !== 'PENDING') continue;

                // Do not display if already final verified
                if (resDoc && resDoc.resultStatus === 'VERIFIED') continue;

                queueItems.push({
                    sampleId: s._id,
                    barcode: s.barcode,
                    orderId: s.orderId,
                    orderNumber: s.orderNumber,
                    tokenNumber: s.tokenNumber,
                    patientSnapshot: s.patientSnapshot,
                    specimenType: s.specimenType,
                    containerType: s.containerType,
                    priority: s.priority,
                    sampleStatus: s.status,
                    testId: t.testId,
                    testCode: t.testCode,
                    testName: t.testName,
                    department: t.department || 'General Pathology',
                    resultId: resDoc ? resDoc._id : null,
                    resultStatus: resDoc ? resDoc.resultStatus : 'PENDING',
                    revisionNumber: resDoc ? resDoc.revisionNumber : 1,
                    hasCritical: resDoc ? resDoc.hasCriticalParameters : false,
                    hasAbnormal: resDoc ? resDoc.hasAbnormalParameters : false,
                    updatedAt: resDoc ? resDoc.updatedAt : s.updatedAt
                });
            }
        }

        res.json({
            success: true,
            total: queueItems.length,
            queue: queueItems
        });
    } catch (error) {
        console.error('[results] entry-queue error:', error);
        res.status(500).json({ success: false, message: 'Failed to load entry queue: ' + error.message });
    }
});

/**
 * POST /api/lab/results/initialize
 * Initializes or loads a result document for a given sample and test.
 */
router.post('/initialize', verifyToken, verifyResultAccess, async (req, res) => {
    try {
        const { sampleId, testId, orderId } = req.body;
        const hospitalId = req.hospitalId;

        if (!testId) {
            return res.status(400).json({ success: false, message: 'testId is required' });
        }

        // Check if result already exists
        let result = await LabTestResult.findOne({
            hospitalId,
            ...(sampleId ? { sampleId } : {}),
            ...(orderId ? { orderId } : {}),
            testId
        });

        if (result) {
            return res.json({ success: true, result });
        }

        // Fetch parent sample, order, and test definition
        const [sample, test] = await Promise.all([
            sampleId ? LabSample.findOne({ _id: sampleId, hospitalId }) : null,
            LabTest.findOne({ _id: testId })
        ]);

        if (!test) {
            return res.status(404).json({ success: false, message: 'Master test not found in catalog' });
        }

        let order = null;
        if (orderId || sample?.orderId) {
            order = await LabOrder.findOne({ _id: orderId || sample?.orderId, hospitalId });
        }

        if (!order && !sample) {
            return res.status(400).json({ success: false, message: 'Valid sample or order required to initialize test result' });
        }

        const patientSnapshot = sample?.patientSnapshot || order?.patientSnapshot || {
            name: 'Patient',
            age: 30,
            gender: 'Any'
        };

        // Build parameter rows from Phase 3 master catalog
        const parameters = (test.parameters || []).map((p, idx) => {
            const evaluated = evaluateParameter({
                parameter: p,
                enteredValue: p.defaultValue || '',
                patient: patientSnapshot
            });

            return {
                parameterId: p._id,
                parameterName: p.parameterName,
                parameterCode: p.parameterCode || '',
                dataType: p.dataType || 'Numeric',
                decimalPlaces: p.decimalPlaces != null ? p.decimalPlaces : 0,
                enteredValue: evaluated.enteredValue || '',
                numericValue: evaluated.numericValue,
                unit: p.unit || '',
                referenceRangeSnapshot: evaluated.referenceRangeSnapshot || {},
                referenceRangeText: evaluated.referenceRangeText || 'Not Configured',
                abnormalFlag: evaluated.abnormalFlag || 'NORMAL',
                criticalFlag: evaluated.criticalFlag || false,
                remarks: '',
                displayOrder: p.displayOrder || (idx + 1),
                isRequired: p.isRequired !== false,
                choices: p.choices || []
            };
        });

        result = await LabTestResult.create({
            hospitalId,
            patientId: sample?.patientId || order?.patient,
            patientSnapshot,
            orderId: order?._id || sample?.orderId,
            orderNumber: order?.orderNumber || sample?.orderNumber || 'ORD',
            tokenNumber: order?.tokenNumber || sample?.tokenNumber || 1,
            sampleId: sample?._id || null,
            barcode: sample?.barcode || 'N/A',
            testId: test._id,
            testCode: test.testCode || test.code || 'TEST',
            testName: test.testName || test.name,
            department: test.department || 'General Pathology',
            processingLocationId: sample?.currentLocationId || null,
            priority: sample?.priority || order?.priority || 'Routine',
            resultStatus: 'PENDING',
            resultParameters: parameters,
            revisionNumber: 1
        });

        res.json({ success: true, result });
    } catch (error) {
        console.error('[results] initialize error:', error);
        res.status(500).json({ success: false, message: 'Failed to initialize result template: ' + error.message });
    }
});

/**
 * GET /api/lab/results/:id
 * Retrieves full result document with parameters and history.
 */
router.get('/:id', verifyToken, verifyResultAccess, async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid result ID format' });
        }
        const hospitalId = req.hospitalId;

        const result = await LabTestResult.findOne({ _id: id, hospitalId }).lean();
        if (!result) {
            return res.status(404).json({ success: false, message: 'Result record not found' });
        }

        const history = await LabResultHistory.find({ hospitalId, resultId: id })
            .sort({ timestamp: -1 })
            .lean();

        res.json({
            success: true,
            result,
            history
        });
    } catch (error) {
        console.error('[results] get by id error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch result: ' + error.message });
    }
});

// =========================================================================
// 3. DRAFT & SUBMISSION WORKFLOW
// =========================================================================

/**
 * PUT/POST /api/lab/results/:id/draft
 * Saves parameter values as DRAFT.
 */
router.all(['/:id/draft'], verifyToken, verifyResultAccess, async (req, res) => {
    try {
        const { id } = req.params;
        const { parameters = [], overallRemarks = '', clinicalNotes = '' } = req.body;
        const hospitalId = req.hospitalId;

        const result = await LabTestResult.findOne({ _id: id, hospitalId });
        if (!result) {
            return res.status(404).json({ success: false, message: 'Result record not found' });
        }

        if (result.resultStatus === 'VERIFIED') {
            return res.status(400).json({ success: false, message: 'Verified results cannot be directly edited as draft. Use the amendment workflow.' });
        }

        // Fetch master test to validate against current master definitions
        const masterTest = await LabTest.findById(result.testId).lean();
        const masterParamMap = {};
        if (masterTest && Array.isArray(masterTest.parameters)) {
            masterTest.parameters.forEach(p => {
                masterParamMap[String(p._id)] = p;
                if (p.parameterCode) masterParamMap[p.parameterCode] = p;
            });
        }

        let hasAbnormal = false;
        let hasCritical = false;

        const updatedParams = parameters.map((inParam, idx) => {
            const masterDef = masterParamMap[String(inParam.parameterId)] || masterParamMap[inParam.parameterCode] || {
                parameterName: inParam.parameterName,
                dataType: inParam.dataType,
                unit: inParam.unit,
                decimalPlaces: inParam.decimalPlaces,
                choices: inParam.choices
            };

            const evaluated = evaluateParameter({
                parameter: masterDef,
                enteredValue: inParam.enteredValue,
                patient: result.patientSnapshot
            });

            if (evaluated.abnormalFlag && evaluated.abnormalFlag !== 'NORMAL' && evaluated.abnormalFlag !== 'NOT_APPLICABLE') {
                hasAbnormal = true;
            }
            if (evaluated.criticalFlag) {
                hasCritical = true;
            }

            return {
                parameterId: inParam.parameterId || masterDef._id,
                parameterName: inParam.parameterName || masterDef.parameterName,
                parameterCode: inParam.parameterCode || masterDef.parameterCode || '',
                dataType: inParam.dataType || masterDef.dataType || 'Numeric',
                decimalPlaces: inParam.decimalPlaces != null ? inParam.decimalPlaces : (masterDef.decimalPlaces || 0),
                enteredValue: evaluated.enteredValue,
                numericValue: evaluated.numericValue,
                unit: inParam.unit || masterDef.unit || '',
                referenceRangeSnapshot: evaluated.referenceRangeSnapshot || inParam.referenceRangeSnapshot || {},
                referenceRangeText: evaluated.referenceRangeText || inParam.referenceRangeText || 'Not Configured',
                abnormalFlag: evaluated.abnormalFlag,
                criticalFlag: evaluated.criticalFlag,
                remarks: inParam.remarks || '',
                displayOrder: inParam.displayOrder || (idx + 1),
                isRequired: inParam.isRequired !== false,
                choices: inParam.choices || masterDef.choices || []
            };
        });

        const prevStatus = result.resultStatus;
        result.resultParameters = updatedParams;
        result.hasAbnormalParameters = hasAbnormal;
        result.hasCriticalParameters = hasCritical;
        result.overallRemarks = overallRemarks;
        result.clinicalNotes = clinicalNotes;
        result.resultStatus = 'DRAFT';
        result.enteredBy = req.user._id;
        result.enteredByName = req.user.name || 'Technician';
        result.enteredAt = new Date();

        await result.save();

        await logResultHistory({
            hospitalId,
            resultId: result._id,
            orderId: result.orderId,
            testId: result.testId,
            testCode: result.testCode,
            previousStatus: prevStatus,
            newStatus: 'DRAFT',
            action: 'DRAFT_SAVED',
            revisionNumber: result.revisionNumber,
            user: req.user,
            details: { hasAbnormal, hasCritical, parameterCount: updatedParams.length }
        });

        res.json({
            success: true,
            message: 'Result draft saved successfully',
            result
        });
    } catch (error) {
        console.error('[results] save draft error:', error);
        res.status(500).json({ success: false, message: 'Failed to save draft: ' + error.message });
    }
});

/**
 * POST /api/lab/results/:id/submit
 * Validates all required findings and moves result to SUBMITTED for Pathologist review.
 */
router.post('/:id/submit', verifyToken, verifyResultAccess, async (req, res) => {
    try {
        const { id } = req.params;
        const { parameters = [], overallRemarks = '', clinicalNotes = '' } = req.body;
        const hospitalId = req.hospitalId;

        const result = await LabTestResult.findOne({ _id: id, hospitalId });
        if (!result) {
            return res.status(404).json({ success: false, message: 'Result record not found' });
        }

        if (result.resultStatus === 'VERIFIED') {
            return res.status(400).json({ success: false, message: 'Verified results cannot be resubmitted. Use the amendment workflow.' });
        }

        const paramsToProcess = (parameters && parameters.length > 0) ? parameters : result.resultParameters;

        // Fetch master test
        const masterTest = await LabTest.findById(result.testId).lean();
        const masterParamMap = {};
        if (masterTest && Array.isArray(masterTest.parameters)) {
            masterTest.parameters.forEach(p => {
                masterParamMap[String(p._id)] = p;
                if (p.parameterCode) masterParamMap[p.parameterCode] = p;
            });
        }

        let hasAbnormal = false;
        let hasCritical = false;
        const criticalAlertsToCreate = [];

        // Validate each parameter
        const processedParams = [];
        for (let idx = 0; idx < paramsToProcess.length; idx++) {
            const p = paramsToProcess[idx];
            const masterDef = masterParamMap[String(p.parameterId)] || masterParamMap[p.parameterCode] || p;

            // Required Check
            if (p.isRequired !== false && masterDef.isRequired !== false) {
                if (p.enteredValue == null || String(p.enteredValue).trim() === '') {
                    return res.status(400).json({
                        success: false,
                        message: `Parameter "${p.parameterName}" is mandatory and cannot be left blank for verification submission.`
                    });
                }
            }

            const evaluated = evaluateParameter({
                parameter: masterDef,
                enteredValue: p.enteredValue,
                patient: result.patientSnapshot
            });

            if (evaluated.abnormalFlag && evaluated.abnormalFlag !== 'NORMAL' && evaluated.abnormalFlag !== 'NOT_APPLICABLE') {
                hasAbnormal = true;
            }

            let alertId = null;
            if (evaluated.criticalFlag) {
                hasCritical = true;

                // Queue Critical Alert Document
                const alertDoc = {
                    hospitalId,
                    resultId: result._id,
                    patientId: result.patientId,
                    patientName: result.patientSnapshot.name,
                    uhid: result.patientSnapshot.uhid,
                    orderId: result.orderId,
                    orderNumber: result.orderNumber,
                    sampleId: result.sampleId,
                    barcode: result.barcode,
                    testId: result.testId,
                    testCode: result.testCode,
                    testName: result.testName,
                    department: result.department,
                    parameterId: p.parameterId,
                    parameterName: p.parameterName,
                    parameterCode: p.parameterCode || '',
                    criticalValue: evaluated.enteredValue,
                    criticalThreshold: {
                        type: evaluated.abnormalFlag,
                        limit: evaluated.abnormalFlag === 'LOW' ? evaluated.referenceRangeSnapshot?.criticalLow : evaluated.referenceRangeSnapshot?.criticalHigh,
                        unit: p.unit || ''
                    },
                    alertStatus: 'PENDING',
                    detectedAt: new Date()
                };
                criticalAlertsToCreate.push(alertDoc);
            }

            processedParams.push({
                parameterId: p.parameterId,
                parameterName: p.parameterName,
                parameterCode: p.parameterCode || '',
                dataType: p.dataType || 'Numeric',
                decimalPlaces: p.decimalPlaces != null ? p.decimalPlaces : (masterDef.decimalPlaces || 0),
                enteredValue: evaluated.enteredValue,
                numericValue: evaluated.numericValue,
                unit: p.unit || masterDef.unit || '',
                referenceRangeSnapshot: evaluated.referenceRangeSnapshot || {},
                referenceRangeText: evaluated.referenceRangeText || 'Not Configured',
                abnormalFlag: evaluated.abnormalFlag,
                criticalFlag: evaluated.criticalFlag,
                remarks: p.remarks || '',
                displayOrder: p.displayOrder || (idx + 1),
                isRequired: p.isRequired !== false,
                choices: p.choices || masterDef.choices || []
            });
        }

        // Insert Critical Alerts
        if (criticalAlertsToCreate.length > 0) {
            const createdAlerts = await LabCriticalAlert.insertMany(criticalAlertsToCreate);
            createdAlerts.forEach((a, idx) => {
                const targetParam = processedParams.find(pr => String(pr.parameterId) === String(a.parameterId) || pr.parameterName === a.parameterName);
                if (targetParam) targetParam.criticalAlertId = a._id;
            });
        }

        const prevStatus = result.resultStatus;
        result.resultParameters = processedParams;
        result.hasAbnormalParameters = hasAbnormal;
        result.hasCriticalParameters = hasCritical;
        if (overallRemarks) result.overallRemarks = overallRemarks;
        if (clinicalNotes) result.clinicalNotes = clinicalNotes;
        result.resultStatus = 'SUBMITTED';
        result.submittedBy = req.user._id;
        result.submittedByName = req.user.name || 'Technician';
        result.submittedAt = new Date();

        await result.save();

        await logResultHistory({
            hospitalId,
            resultId: result._id,
            orderId: result.orderId,
            testId: result.testId,
            testCode: result.testCode,
            previousStatus: prevStatus,
            newStatus: 'SUBMITTED',
            action: 'SUBMITTED_FOR_VERIFICATION',
            revisionNumber: result.revisionNumber,
            user: req.user,
            details: { hasAbnormal, hasCritical, criticalAlertCount: criticalAlertsToCreate.length }
        });

        res.json({
            success: true,
            message: 'Results successfully submitted for Pathologist verification' + (hasCritical ? ' (CRITICAL VALUE ALERT TRIGGERED)' : ''),
            result
        });
    } catch (error) {
        console.error('[results] submit error:', error);
        res.status(500).json({ success: false, message: 'Failed to submit results: ' + error.message });
    }
});

// =========================================================================
// 4. PATHOLOGIST VERIFICATION WORKSTATION APIS
// =========================================================================

/**
 * GET /api/lab/results/verification-queue
 * Lists results submitted for pathologist medical verification.
 */
router.get('/verification-queue', verifyToken, verifyResultAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId;
        const { search = '', department = '', priority = '', abnormalOnly = '', criticalOnly = '' } = req.query;

        const query = {
            hospitalId,
            resultStatus: { $in: ['SUBMITTED', 'UNDER_REVIEW', 'CORRECTION_REQUESTED'] }
        };

        if (department) query.department = department;
        if (priority) query.priority = priority;
        if (abnormalOnly === 'true') query.hasAbnormalParameters = true;
        if (criticalOnly === 'true') query.hasCriticalParameters = true;

        if (search) {
            const regex = new RegExp(search.trim(), 'i');
            query.$or = [
                { barcode: regex },
                { orderNumber: regex },
                { testCode: regex },
                { testName: regex },
                { 'patientSnapshot.name': regex },
                { 'patientSnapshot.uhid': regex }
            ];
        }

        const queue = await LabTestResult.find(query)
            .sort({ hasCriticalParameters: -1, priority: -1, submittedAt: -1 })
            .limit(100)
            .lean();

        res.json({
            success: true,
            total: queue.length,
            queue
        });
    } catch (error) {
        console.error('[results] verification-queue error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch verification queue: ' + error.message });
    }
});

/**
 * POST /api/lab/results/:id/verify
 * Pathologist approves and locks clinical result.
 */
router.post('/:id/verify', verifyToken, verifyResultAccess, verifyVerificationPermission, async (req, res) => {
    try {
        const { id } = req.params;
        const { overallRemarks = '' } = req.body;
        const hospitalId = req.hospitalId;

        const result = await LabTestResult.findOne({ _id: id, hospitalId });
        if (!result) {
            return res.status(404).json({ success: false, message: 'Result record not found' });
        }

        const eligibleStatuses = ['SUBMITTED', 'UNDER_REVIEW'];
        if (!eligibleStatuses.includes(result.resultStatus)) {
            return res.status(400).json({
                success: false,
                message: `Cannot verify result in status "${result.resultStatus}". Result must be SUBMITTED or UNDER_REVIEW.`
            });
        }

        // Strict Technician / Pathologist Self-Approval Guard
        const roleData = req.user._roleData;
        const roleName = String(roleData?.name || req.user.role || '').toLowerCase();
        const isAdmin = roleName.includes('admin') || roleName === 'superadmin';

        if (result.enteredBy && String(result.enteredBy) === String(req.user._id) && !isAdmin) {
            return res.status(403).json({
                success: false,
                message: 'Clinical Safety Violation: The technician who entered this result cannot verify their own results. Independent pathologist sign-off is mandatory.'
            });
        }

        const prevStatus = result.resultStatus;
        result.resultStatus = 'VERIFIED';
        result.verifiedBy = req.user._id;
        result.verifiedByName = req.user.name || 'Pathologist';
        result.verifiedAt = new Date();
        if (overallRemarks) result.overallRemarks = overallRemarks;

        await result.save();

        // Check if all tests for parent LabOrder are now verified
        const orderResults = await LabTestResult.find({ hospitalId, orderId: result.orderId });
        const allVerified = orderResults.every(r => r.resultStatus === 'VERIFIED');
        if (allVerified) {
            await LabOrder.updateOne({ _id: result.orderId }, { $set: { status: 'Completed' } });
        }

        await logResultHistory({
            hospitalId,
            resultId: result._id,
            orderId: result.orderId,
            testId: result.testId,
            testCode: result.testCode,
            previousStatus: prevStatus,
            newStatus: 'VERIFIED',
            action: 'RESULT_VERIFIED',
            revisionNumber: result.revisionNumber,
            user: req.user,
            details: { verifiedBy: req.user.name, allOrderTestsCompleted: allVerified }
        });

        res.json({
            success: true,
            message: 'Laboratory results successfully verified and clinically signed off',
            result
        });
    } catch (error) {
        console.error('[results] verify error:', error);
        res.status(500).json({ success: false, message: 'Failed to verify result: ' + error.message });
    }
});

/**
 * POST /api/lab/results/:id/reject
 * Pathologist rejects result with mandatory reason.
 */
router.post('/:id/reject', verifyToken, verifyResultAccess, verifyVerificationPermission, async (req, res) => {
    try {
        const { id } = req.params;
        const { rejectionReason, notes = '' } = req.body;
        const hospitalId = req.hospitalId;

        if (!rejectionReason || !rejectionReason.trim()) {
            return res.status(400).json({ success: false, message: 'Mandatory clinical rejection reason is required' });
        }

        const result = await LabTestResult.findOne({ _id: id, hospitalId });
        if (!result) {
            return res.status(404).json({ success: false, message: 'Result record not found' });
        }

        const prevStatus = result.resultStatus;
        result.resultStatus = 'REJECTED';
        result.rejectionReason = rejectionReason.trim();
        result.rejectedBy = req.user._id;
        result.rejectedByName = req.user.name || 'Pathologist';
        result.rejectedAt = new Date();
        if (notes) result.clinicalNotes = `${result.clinicalNotes} | Rejection Note: ${notes}`.trim();

        await result.save();

        await logResultHistory({
            hospitalId,
            resultId: result._id,
            orderId: result.orderId,
            testId: result.testId,
            testCode: result.testCode,
            previousStatus: prevStatus,
            newStatus: 'REJECTED',
            action: 'RESULT_REJECTED',
            revisionNumber: result.revisionNumber,
            user: req.user,
            details: { rejectionReason, notes }
        });

        res.json({
            success: true,
            message: 'Result rejected and returned with audit reason',
            result
        });
    } catch (error) {
        console.error('[results] reject error:', error);
        res.status(500).json({ success: false, message: 'Failed to reject result: ' + error.message });
    }
});

/**
 * POST /api/lab/results/:id/request-correction
 * Pathologist requests technician correction with review notes.
 */
router.post('/:id/request-correction', verifyToken, verifyResultAccess, verifyVerificationPermission, async (req, res) => {
    try {
        const { id } = req.params;
        const { correctionReason, notes = '' } = req.body;
        const hospitalId = req.hospitalId;

        if (!correctionReason || !correctionReason.trim()) {
            return res.status(400).json({ success: false, message: 'Mandatory correction instructions are required' });
        }

        const result = await LabTestResult.findOne({ _id: id, hospitalId });
        if (!result) {
            return res.status(404).json({ success: false, message: 'Result record not found' });
        }

        const prevStatus = result.resultStatus;
        result.resultStatus = 'CORRECTION_REQUESTED';
        result.correctionReason = correctionReason.trim();
        result.correctionRequestedBy = req.user._id;
        result.correctionRequestedByName = req.user.name || 'Pathologist';
        result.correctionRequestedAt = new Date();
        if (notes) result.clinicalNotes = `${result.clinicalNotes} | Correction Notes: ${notes}`.trim();

        await result.save();

        await logResultHistory({
            hospitalId,
            resultId: result._id,
            orderId: result.orderId,
            testId: result.testId,
            testCode: result.testCode,
            previousStatus: prevStatus,
            newStatus: 'CORRECTION_REQUESTED',
            action: 'CORRECTION_REQUESTED',
            revisionNumber: result.revisionNumber,
            user: req.user,
            details: { correctionReason, notes }
        });

        res.json({
            success: true,
            message: 'Correction requested and assigned back to laboratory bench',
            result
        });
    } catch (error) {
        console.error('[results] request-correction error:', error);
        res.status(500).json({ success: false, message: 'Failed to request correction: ' + error.message });
    }
});

// =========================================================================
// 5. AMENDMENT & REVISION WORKFLOW
// =========================================================================

/**
 * POST /api/lab/results/:id/amendment
 * Creates a formal audited revision of a result (e.g. for correction or post-verification amendment).
 */
router.post('/:id/amendment', verifyToken, verifyResultAccess, async (req, res) => {
    try {
        const { id } = req.params;
        const { reason, parameters = [] } = req.body;
        const hospitalId = req.hospitalId;

        if (!reason || !reason.trim()) {
            return res.status(400).json({ success: false, message: 'Mandatory clinical reason is required for result revision/amendment' });
        }

        const result = await LabTestResult.findOne({ _id: id, hospitalId });
        if (!result) {
            return res.status(404).json({ success: false, message: 'Result record not found' });
        }

        // Snapshot current parameters into correctionHistory
        result.correctionHistory.push({
            revisionNumber: result.revisionNumber,
            previousParameters: result.resultParameters,
            reason: reason.trim(),
            changedBy: req.user._id,
            changedByName: req.user.name || 'Staff',
            changedAt: new Date()
        });

        result.revisionNumber += 1;

        // Re-evaluate parameters if supplied
        if (parameters && parameters.length > 0) {
            const masterTest = await LabTest.findById(result.testId).lean();
            const masterParamMap = {};
            if (masterTest && Array.isArray(masterTest.parameters)) {
                masterTest.parameters.forEach(p => { masterParamMap[String(p._id)] = p; });
            }

            let hasAbnormal = false;
            let hasCritical = false;

            result.resultParameters = parameters.map((p, idx) => {
                const masterDef = masterParamMap[String(p.parameterId)] || p;
                const evaluated = evaluateParameter({
                    parameter: masterDef,
                    enteredValue: p.enteredValue,
                    patient: result.patientSnapshot
                });

                if (evaluated.abnormalFlag && evaluated.abnormalFlag !== 'NORMAL' && evaluated.abnormalFlag !== 'NOT_APPLICABLE') {
                    hasAbnormal = true;
                }
                if (evaluated.criticalFlag) hasCritical = true;

                return {
                    parameterId: p.parameterId,
                    parameterName: p.parameterName,
                    parameterCode: p.parameterCode || '',
                    dataType: p.dataType || 'Numeric',
                    decimalPlaces: p.decimalPlaces != null ? p.decimalPlaces : 0,
                    enteredValue: evaluated.enteredValue,
                    numericValue: evaluated.numericValue,
                    unit: p.unit || '',
                    referenceRangeSnapshot: evaluated.referenceRangeSnapshot || {},
                    referenceRangeText: evaluated.referenceRangeText || 'Not Configured',
                    abnormalFlag: evaluated.abnormalFlag,
                    criticalFlag: evaluated.criticalFlag,
                    remarks: p.remarks || '',
                    displayOrder: p.displayOrder || (idx + 1),
                    isRequired: p.isRequired !== false,
                    choices: p.choices || []
                };
            });

            result.hasAbnormalParameters = hasAbnormal;
            result.hasCriticalParameters = hasCritical;
        }

        const prevStatus = result.resultStatus;
        result.resultStatus = 'DRAFT';
        result.enteredBy = req.user._id;
        result.enteredByName = req.user.name;
        result.enteredAt = new Date();

        await result.save();

        await logResultHistory({
            hospitalId,
            resultId: result._id,
            orderId: result.orderId,
            testId: result.testId,
            testCode: result.testCode,
            previousStatus: prevStatus,
            newStatus: 'DRAFT',
            action: 'AMENDMENT_CREATED',
            revisionNumber: result.revisionNumber,
            user: req.user,
            details: { reason, newRevision: result.revisionNumber }
        });

        res.json({
            success: true,
            message: `Result amended to Revision ${result.revisionNumber}. Ready for technician editing and resubmission.`,
            result
        });
    } catch (error) {
        console.error('[results] amendment error:', error);
        res.status(500).json({ success: false, message: 'Failed to create amendment: ' + error.message });
    }
});

/**
 * GET /api/lab/results/:id/history
 * Complete audit timeline of a specific test result.
 */
router.get('/:id/history', verifyToken, verifyResultAccess, async (req, res) => {
    try {
        const { id } = req.params;
        const hospitalId = req.hospitalId;

        const [result, auditLogs] = await Promise.all([
            LabTestResult.findOne({ _id: id, hospitalId }).select('revisionNumber correctionHistory testName orderNumber barcode').lean(),
            LabResultHistory.find({ hospitalId, resultId: id }).sort({ timestamp: -1 }).lean()
        ]);

        if (!result) {
            return res.status(404).json({ success: false, message: 'Result not found' });
        }

        res.json({
            success: true,
            revisionNumber: result.revisionNumber,
            correctionHistory: result.correctionHistory || [],
            auditLogs
        });
    } catch (error) {
        console.error('[results] history error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch result history: ' + error.message });
    }
});

// =========================================================================
// 6. CRITICAL RESULT ALERTS APIS
// =========================================================================

/**
 * GET /api/lab/results/critical-alerts
 * Lists internal critical value alerts.
 */
router.get('/critical-alerts', verifyToken, verifyResultAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId;
        const { alertStatus = '', department = '' } = req.query;

        const query = { hospitalId };
        if (alertStatus) query.alertStatus = alertStatus;
        if (department) query.department = department;

        const alerts = await LabCriticalAlert.find(query)
            .sort({ detectedAt: -1 })
            .limit(100)
            .lean();

        res.json({
            success: true,
            total: alerts.length,
            alerts
        });
    } catch (error) {
        console.error('[results] critical alerts error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch critical alerts: ' + error.message });
    }
});

/**
 * POST /api/lab/results/critical-alerts/:id/acknowledge
 * Acknowledges clinical critical alert with clinician notification audit.
 */
router.post('/critical-alerts/:id/acknowledge', verifyToken, verifyResultAccess, async (req, res) => {
    try {
        const { id } = req.params;
        const { actionTaken = 'Attending clinician notified by telephone', notes = '' } = req.body;
        const hospitalId = req.hospitalId;

        const alert = await LabCriticalAlert.findOne({ _id: id, hospitalId });
        if (!alert) {
            return res.status(404).json({ success: false, message: 'Critical alert not found' });
        }

        alert.alertStatus = 'ACKNOWLEDGED';
        alert.acknowledgedBy = req.user._id;
        alert.acknowledgedByName = req.user.name || 'Authorized Staff';
        alert.acknowledgedAt = new Date();
        alert.actionTaken = actionTaken;
        if (notes) alert.notes = notes;

        await alert.save();

        res.json({
            success: true,
            message: 'Critical value alert acknowledged and audit logged',
            alert
        });
    } catch (error) {
        console.error('[results] acknowledge alert error:', error);
        res.status(500).json({ success: false, message: 'Failed to acknowledge alert: ' + error.message });
    }
});

/**
 * POST /api/lab/results/critical-alerts/:id/escalate
 * Escalates unacknowledged critical alert.
 */
router.post('/critical-alerts/:id/escalate', verifyToken, verifyResultAccess, async (req, res) => {
    try {
        const { id } = req.params;
        const { notes = 'Escalated to Head of Department / Lab Director' } = req.body;
        const hospitalId = req.hospitalId;

        const alert = await LabCriticalAlert.findOne({ _id: id, hospitalId });
        if (!alert) {
            return res.status(404).json({ success: false, message: 'Critical alert not found' });
        }

        alert.alertStatus = 'ESCALATED';
        alert.escalatedBy = req.user._id;
        alert.escalatedByName = req.user.name || 'Lab Staff';
        alert.escalatedAt = new Date();
        alert.notes = notes;

        await alert.save();

        res.json({
            success: true,
            message: 'Critical value alert successfully escalated',
            alert
        });
    } catch (error) {
        console.error('[results] escalate alert error:', error);
        res.status(500).json({ success: false, message: 'Failed to escalate alert: ' + error.message });
    }
});

// =========================================================================
// 7. RESULT DASHBOARD & DEPARTMENT AGGREGATIONS
// =========================================================================

/**
 * GET /api/lab/results/dashboard
 * Aggregated live metrics across result workflow.
 */
router.get('/dashboard', verifyToken, verifyResultAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId;

        const counts = await LabTestResult.aggregate([
            { $match: { hospitalId: new mongoose.Types.ObjectId(hospitalId) } },
            { $group: { _id: '$resultStatus', count: { $sum: 1 } } }
        ]);

        const stats = {
            pending: 0,
            draft: 0,
            submitted: 0,
            underReview: 0,
            correctionRequested: 0,
            rejected: 0,
            verified: 0,
            total: 0
        };

        counts.forEach(c => {
            stats.total += c.count;
            if (c._id === 'PENDING') stats.pending = c.count;
            else if (c._id === 'DRAFT') stats.draft = c.count;
            else if (c._id === 'SUBMITTED') stats.submitted = c.count;
            else if (c._id === 'UNDER_REVIEW') stats.underReview = c.count;
            else if (c._id === 'CORRECTION_REQUESTED') stats.correctionRequested = c.count;
            else if (c._id === 'REJECTED') stats.rejected = c.count;
            else if (c._id === 'VERIFIED') stats.verified = c.count;
        });

        // Count pending critical alerts
        const [pendingCriticalAlerts, totalCriticalAlerts] = await Promise.all([
            LabCriticalAlert.countDocuments({ hospitalId, alertStatus: 'PENDING' }),
            LabCriticalAlert.countDocuments({ hospitalId })
        ]);

        res.json({
            success: true,
            stats: {
                ...stats,
                pendingVerification: stats.submitted + stats.underReview,
                pendingCriticalAlerts,
                totalCriticalAlerts
            }
        });
    } catch (error) {
        console.error('[results] dashboard stats error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch result metrics: ' + error.message });
    }
});

/**
 * GET /api/lab/results/department-summary
 * Workload distribution grouped by clinical laboratory department.
 */
router.get('/department-summary', verifyToken, verifyResultAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId;

        const summary = await LabTestResult.aggregate([
            { $match: { hospitalId: new mongoose.Types.ObjectId(hospitalId) } },
            {
                $group: {
                    _id: '$department',
                    total: { $sum: 1 },
                    pending: { $sum: { $cond: [{ $eq: ['$resultStatus', 'PENDING'] }, 1, 0] } },
                    draft: { $sum: { $cond: [{ $eq: ['$resultStatus', 'DRAFT'] }, 1, 0] } },
                    submitted: { $sum: { $cond: [{ $eq: ['$resultStatus', 'SUBMITTED'] }, 1, 0] } },
                    verified: { $sum: { $cond: [{ $eq: ['$resultStatus', 'VERIFIED'] }, 1, 0] } },
                    critical: { $sum: { $cond: ['$hasCriticalParameters', 1, 0] } }
                }
            },
            { $sort: { total: -1 } }
        ]);

        res.json({
            success: true,
            summary
        });
    } catch (error) {
        console.error('[results] department-summary error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch department summary: ' + error.message });
    }
});

module.exports = router;
