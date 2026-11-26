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

    const isCentral = roleName === 'centraladmin' || roleName === 'superadmin';
    req.hospitalId = isCentral
        ? (req.user.hospitalId || req.headers['x-hospital-id'] || (req.tenant ? req.tenant._id : null))
        : (req.user.hospitalId || (req.tenant ? req.tenant._id : null));

    if (!req.hospitalId && !isCentral) {
        return res.status(403).json({ success: false, message: 'Hospital tenant context required' });
    }

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

// Helper: Normalize test names/codes for catalog matching
function normalizeTestTokens(raw = '') {
    const str = String(raw || '').trim();
    const lower = str.toLowerCase();
    const parenMatch = str.match(/\(([a-zA-Z0-9\-\s]{2,15})\)/);
    const parenCode = parenMatch ? parenMatch[1].trim().toLowerCase() : '';
    const baseName = lower
        .replace(/\([^)]*\)/g, ' ')
        .replace(/&/g, ' and ')
        .replace(/\bmicroscopy\b/g, '')
        .replace(/\bexamination\b/g, '')
        .replace(/\btest\b/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
    return { lower, parenCode, baseName };
}

function isAutoStubParameterList(params = [], testName = '') {
    const active = (params || []).filter((p) => p && p.isActive !== false);
    if (active.length === 0) return true;
    if (active.length > 1) return false;
    const only = active[0];
    const sameAsTestName = String(only.parameterName || '').trim().toLowerCase() === String(testName || '').trim().toLowerCase();
    const hasRanges = Array.isArray(only.referenceRanges) && only.referenceRanges.length > 0;
    const hasChoices = Array.isArray(only.choices) && only.choices.length > 0;
    return (
        only.dataType === 'Text' &&
        !only.unit &&
        !hasRanges &&
        !hasChoices &&
        sameAsTestName
    );
}

/**
 * Resolves the authoritative Phase 3 LabTest definition and its active configured parameters.
 * If the linked LabTest was auto-provisioned as a 1-field text placeholder from HMS sync,
 * checks if a richer configured LabTest exists in the tenant/global catalog with matching name/code.
 */
async function resolveAuthoritativeCatalogTest(testDoc, hospitalId) {
    if (!testDoc) return { effectiveTest: null, activeParameters: [] };

    let effectiveTest = testDoc.toObject ? testDoc.toObject() : testDoc;
    let activeParams = (effectiveTest.parameters || []).filter((p) => p && p.isActive !== false);

    if (isAutoStubParameterList(activeParams, effectiveTest.testName || effectiveTest.name)) {
        const { lower, parenCode, baseName } = normalizeTestTokens(effectiveTest.testName || effectiveTest.name);
        const candidates = await LabTest.find({
            _id: { $ne: effectiveTest._id },
            isActive: { $ne: false },
            $or: [
                ...(hospitalId ? [{ hospitalId }] : []),
                { hospitalId: null },
                { hospitalId: { $exists: false } }
            ]
        }).lean();

        const hidStr = hospitalId ? String(hospitalId) : '';
        const richCandidates = candidates
            .filter((c) => {
                const cActive = (c.parameters || []).filter((p) => p && p.isActive !== false);
                return cActive.length > 0 && !isAutoStubParameterList(cActive, c.testName || c.name);
            })
            .sort((a, b) => {
                const aTenant = hidStr && String(a.hospitalId || '') === hidStr ? 0 : 1;
                const bTenant = hidStr && String(b.hospitalId || '') === hidStr ? 0 : 1;
                if (aTenant !== bTenant) return aTenant - bTenant;
                return (b.parameters?.length || 0) - (a.parameters?.length || 0);
            });

        const matchedRich = richCandidates.find((c) => {
            const cTokens = normalizeTestTokens(c.testName || c.name);
            const cCode = String(c.testCode || c.code || '').trim().toLowerCase();
            const cShort = String(c.shortName || '').trim().toLowerCase();
            return (
                (cTokens.lower && cTokens.lower === lower) ||
                (cTokens.baseName && baseName && cTokens.baseName === baseName) ||
                (parenCode && (cCode === parenCode || cShort === parenCode)) ||
                (cTokens.parenCode && (cTokens.parenCode === lower || cTokens.parenCode === parenCode))
            );
        });

        if (matchedRich) {
            effectiveTest = matchedRich;
            activeParams = (matchedRich.parameters || []).filter((p) => p && p.isActive !== false);
        }
    }

    const sortedParams = [...activeParams].sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));
    return { effectiveTest, activeParameters: sortedParams };
}

/**
 * Builds or non-destructively synchronizes resultParameters from configured catalog parameters,
 * preserving any values/remarks already entered by the technician.
 */
function buildSyncedResultParameters(existingParams = [], catalogParams = [], patientSnapshot = {}) {
    if (!Array.isArray(catalogParams) || catalogParams.length === 0) {
        return existingParams || [];
    }

    return catalogParams.map((p, idx) => {
        const pIdStr = p._id ? String(p._id) : '';
        const pCodeLower = String(p.parameterCode || '').trim().toLowerCase();
        const pNameLower = String(p.parameterName || '').trim().toLowerCase();

        const existing = (existingParams || []).find((ep) => {
            if (pIdStr && ep.parameterId && String(ep.parameterId) === pIdStr) return true;
            if (pCodeLower && ep.parameterCode && String(ep.parameterCode).trim().toLowerCase() === pCodeLower) return true;
            if (pNameLower && ep.parameterName && String(ep.parameterName).trim().toLowerCase() === pNameLower) return true;
            return false;
        });

        const rawVal = existing && existing.enteredValue !== undefined && existing.enteredValue !== null
            ? existing.enteredValue
            : (p.defaultValue || '');

        const evaluated = evaluateParameter({
            parameter: p,
            enteredValue: rawVal,
            patient: patientSnapshot
        });

        return {
            parameterId: p._id || existing?.parameterId,
            parameterName: p.parameterName,
            parameterCode: p.parameterCode || '',
            dataType: p.dataType || 'Numeric',
            decimalPlaces: p.decimalPlaces != null ? p.decimalPlaces : 0,
            enteredValue: evaluated.enteredValue != null ? String(evaluated.enteredValue) : '',
            numericValue: evaluated.numericValue,
            unit: p.unit || '',
            referenceRangeSnapshot: evaluated.referenceRangeSnapshot || {},
            referenceRangeText: evaluated.referenceRangeText || 'Not Configured',
            abnormalFlag: evaluated.abnormalFlag || 'NORMAL',
            criticalFlag: Boolean(evaluated.criticalFlag),
            criticalAlertId: existing?.criticalAlertId || null,
            remarks: existing?.remarks || '',
            displayOrder: p.displayOrder || (idx + 1),
            isRequired: p.isRequired !== false,
            choices: Array.isArray(p.choices) ? p.choices : []
        };
    });
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
            status: { $in: ['ACCEPTED', 'PROCESSING', 'PROCESSING_COMPLETED', 'COLLECTED', 'RECEIVED_AT_PROCESSING_LAB'] }
        };

        if (priority) sampleQuery.priority = priority;

        if (search) {
            const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(escaped, 'i');
            sampleQuery.$or = [
                { barcode: regex },
                { orderNumber: regex },
                { 'patientSnapshot.name': regex },
                { 'patientSnapshot.mrn': regex },
                { 'patientSnapshot.uhid': regex },
                { 'patientSnapshot.phone': regex }
            ];
        }

        const samples = await LabSample.find(sampleQuery)
            .sort({ priority: -1, createdAt: -1 })
            .limit(100)
            .lean();

        // Check existing results by BOTH sampleId+testId and orderId+testId (matches unique index)
        const sampleIds = samples.map((s) => s._id);
        const orderIds = samples.map((s) => s.orderId).filter(Boolean);
        const existingResults = (sampleIds.length > 0 || orderIds.length > 0)
            ? await LabTestResult.find({
                hospitalId,
                $or: [
                    ...(sampleIds.length > 0 ? [{ sampleId: { $in: sampleIds } }] : []),
                    ...(orderIds.length > 0 ? [{ orderId: { $in: orderIds } }] : [])
                ]
            }).lean()
            : [];

        const resultBySampleTest = {};
        const resultByOrderTest = {};
        existingResults.forEach((r) => {
            if (r.sampleId && r.testId) {
                resultBySampleTest[`${r.sampleId}_${r.testId}`] = r;
            }
            if (r.orderId && r.testId) {
                resultByOrderTest[`${r.orderId}_${r.testId}`] = r;
            }
        });

        // Flatten tests within eligible samples
        const queueItems = [];
        for (const s of samples) {
            for (const t of (s.tests || [])) {
                if (department && t.department && t.department !== department) continue;

                const resDoc = resultBySampleTest[`${s._id}_${t.testId}`] || resultByOrderTest[`${s.orderId}_${t.testId}`] || null;

                // Filter by status if requested
                if (status && resDoc && resDoc.resultStatus !== status) continue;
                if (status && !resDoc && status !== 'PENDING') continue;

                // Hide verified or pathologist-queued items unless explicitly searched by barcode/status
                if (resDoc && resDoc.resultStatus === 'VERIFIED') continue;
                if (!status && !search && resDoc && ['SUBMITTED', 'UNDER_REVIEW'].includes(resDoc.resultStatus)) continue;

                queueItems.push({
                    sampleId: s._id,
                    barcode: s.barcode,
                    orderId: s.orderId,
                    orderNumber: s.orderNumber,
                    tokenNumber: s.tokenNumber,
                    patientSnapshot: {
                        ...(s.patientSnapshot || {}),
                        mrn: s.patientSnapshot?.mrn || s.patientSnapshot?.uhid || ''
                    },
                    specimenType: s.specimenType,
                    containerType: s.containerType,
                    priority: s.priority,
                    sampleStatus: s.status,
                    testId: t.testId,
                    testCode: resDoc?.testCode || t.testCode,
                    testName: resDoc?.testName || t.testName,
                    department: resDoc?.department || t.department || 'General Pathology',
                    resultId: resDoc ? resDoc._id : null,
                    resultStatus: resDoc ? resDoc.resultStatus : 'PENDING',
                    revisionNumber: resDoc ? resDoc.revisionNumber : 1,
                    hasCritical: resDoc ? resDoc.hasCriticalParameters : false,
                    hasAbnormal: resDoc ? resDoc.hasAbnormalParameters : false,
                    correctionReason: resDoc?.correctionReason || '',
                    rejectionReason: resDoc?.rejectionReason || '',
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
 * Atomically initializes or retrieves a result document for { hospitalId, orderId, testId }
 * without ever throwing E11000 duplicate key errors under concurrent requests or recollections.
 */
router.post('/initialize', verifyToken, verifyResultAccess, async (req, res) => {
    try {
        const { sampleId, testId, orderId } = req.body;
        const hospitalId = req.hospitalId;

        if (!testId || !mongoose.Types.ObjectId.isValid(testId)) {
            return res.status(400).json({ success: false, message: 'Valid testId is required' });
        }

        // Fetch parent sample and catalog test definition in parallel
        const [sample, test] = await Promise.all([
            (sampleId && mongoose.Types.ObjectId.isValid(sampleId))
                ? LabSample.findOne({ _id: sampleId, hospitalId }).lean()
                : null,
            LabTest.findById(testId).lean()
        ]);

        if (!test) {
            return res.status(404).json({ success: false, message: 'Master test not found in catalog' });
        }

        const candidateOrderId = orderId || sample?.orderId;
        const order = (candidateOrderId && mongoose.Types.ObjectId.isValid(candidateOrderId))
            ? await LabOrder.findOne({ _id: candidateOrderId, hospitalId }).lean()
            : null;

        const effectiveOrderId = order?._id || sample?.orderId || (mongoose.Types.ObjectId.isValid(orderId) ? orderId : null);

        if (!effectiveOrderId) {
            return res.status(400).json({ success: false, message: 'Valid sample or lab order is required to initialize test result' });
        }

        const rawSnapshot = sample?.patientSnapshot || order?.patientSnapshot || {
            name: 'Registered Patient',
            age: 30,
            gender: 'Any'
        };
        const patientSnapshot = {
            ...rawSnapshot,
            uhid: rawSnapshot.uhid || rawSnapshot.mrn || ''
        };

        const { effectiveTest, activeParameters } = await resolveAuthoritativeCatalogTest(test, hospitalId);
        const initialParameters = buildSyncedResultParameters([], activeParameters, patientSnapshot);

        const newDocPayload = {
            hospitalId,
            patientId: sample?.patientId || order?.patient || null,
            patientSnapshot,
            orderId: effectiveOrderId,
            orderNumber: order?.orderNumber || sample?.orderNumber || 'ORD',
            tokenNumber: order?.tokenNumber || sample?.tokenNumber || 1,
            sampleId: sample?._id || null,
            barcode: sample?.barcode || 'N/A',
            testId: test._id,
            testCode: effectiveTest?.testCode || effectiveTest?.code || test.testCode || test.code || 'TEST',
            testName: test.testName || test.name || effectiveTest?.testName,
            department: effectiveTest?.department || test.department || 'General Pathology',
            processingLocationId: sample?.currentLocationId || null,
            priority: sample?.priority || order?.priority || 'Routine',
            resultStatus: 'PENDING',
            resultParameters: initialParameters,
            revisionNumber: 1
        };

        // Atomic idempotent upsert keyed by exact unique index { hospitalId, orderId, testId }
        let result = null;
        try {
            result = await LabTestResult.findOneAndUpdate(
                { hospitalId, orderId: effectiveOrderId, testId: test._id },
                { $setOnInsert: newDocPayload },
                { new: true, upsert: true }
            );
        } catch (upsertErr) {
            if (upsertErr && upsertErr.code === 11000) {
                result = await LabTestResult.findOne({ hospitalId, orderId: effectiveOrderId, testId: test._id });
            } else {
                throw upsertErr;
            }
        }

        if (!result) {
            result = await LabTestResult.findOne({ hospitalId, orderId: effectiveOrderId, testId: test._id });
        }

        // If unverified, keep latest barcoded sample link & non-destructively sync newly configured catalog parameters
        if (result && result.resultStatus !== 'VERIFIED') {
            let needsSave = false;

            if (sample && (!result.sampleId || String(result.sampleId) !== String(sample._id))) {
                result.sampleId = sample._id;
                result.barcode = sample.barcode || result.barcode;
                needsSave = true;
            } else if (sample?.barcode && (!result.barcode || result.barcode === 'N/A')) {
                result.barcode = sample.barcode;
                needsSave = true;
            }

            if (
                ['PENDING', 'DRAFT', 'CORRECTION_REQUESTED', 'REJECTED'].includes(result.resultStatus) &&
                activeParameters.length > 0
            ) {
                const synced = buildSyncedResultParameters(result.resultParameters, activeParameters, result.patientSnapshot || patientSnapshot);
                const currentCount = (result.resultParameters || []).length;
                const currentIsStub = isAutoStubParameterList(result.resultParameters, result.testName);
                if (currentCount !== synced.length || currentIsStub) {
                    result.resultParameters = synced;
                    needsSave = true;
                }
            }

            if (needsSave) {
                await result.save();
            }
        }

        const history = result
            ? await LabResultHistory.find({ hospitalId, resultId: result._id }).sort({ timestamp: -1 }).lean()
            : [];

        const resultObj = result?.toObject ? result.toObject() : result;
        if (resultObj && resultObj.patientSnapshot) {
            resultObj.patientSnapshot.mrn = resultObj.patientSnapshot.mrn || resultObj.patientSnapshot.uhid || '';
        }

        res.json({
            success: true,
            result: resultObj,
            sample: sample ? { specimenType: sample.specimenType, containerType: sample.containerType, status: sample.status } : null,
            history
        });
    } catch (error) {
        console.error('[results] initialize error:', error);
        res.status(500).json({ success: false, message: 'Failed to initialize result template: ' + error.message });
    }
});

/**
 * GET /api/lab/results/history-list
 * Lists verified, rejected, and correction-requested results for Pathologist History & Audit view.
 */
router.get('/history-list', verifyToken, verifyResultAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId;
        const { search = '', department = '', status = '' } = req.query;

        const allowedHistoryStatuses = ['VERIFIED', 'REJECTED', 'CORRECTION_REQUESTED'];
        const query = {
            hospitalId,
            resultStatus: status && allowedHistoryStatuses.includes(status)
                ? status
                : { $in: allowedHistoryStatuses }
        };

        if (department) query.department = department;

        if (search) {
            const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(escaped, 'i');
            query.$or = [
                { barcode: regex },
                { orderNumber: regex },
                { testCode: regex },
                { testName: regex },
                { 'patientSnapshot.name': regex },
                { 'patientSnapshot.uhid': regex }
            ];
        }

        const results = await LabTestResult.find(query)
            .sort({ verifiedAt: -1, updatedAt: -1 })
            .limit(150)
            .lean();

        const normalized = results.map((r) => ({
            ...r,
            patientSnapshot: {
                ...(r.patientSnapshot || {}),
                mrn: r.patientSnapshot?.mrn || r.patientSnapshot?.uhid || ''
            }
        }));

        res.json({
            success: true,
            total: normalized.length,
            results: normalized
        });
    } catch (error) {
        console.error('[results] history-list error:', error);
        res.status(500).json({ success: false, message: 'Failed to load verified results history: ' + error.message });
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
 * Lists results strictly eligible for Pathologist review (SUBMITTED & UNDER_REVIEW).
 */
router.get('/verification-queue', verifyToken, verifyResultAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId;
        const { search = '', department = '', priority = '', abnormalOnly = '', criticalOnly = '', status = '' } = req.query;

        const eligibleStatuses = ['SUBMITTED', 'UNDER_REVIEW'];
        const query = {
            hospitalId,
            resultStatus: (status && eligibleStatuses.includes(status))
                ? status
                : { $in: eligibleStatuses }
        };

        if (department) query.department = department;
        if (priority) query.priority = priority;
        if (abnormalOnly === 'true') query.hasAbnormalParameters = true;
        if (criticalOnly === 'true') query.hasCriticalParameters = true;

        if (search) {
            const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(escaped, 'i');
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
            .sort({ hasCriticalParameters: -1, priority: -1, submittedAt: -1, updatedAt: -1 })
            .limit(100)
            .lean();

        const normalizedQueue = queue.map((r) => ({
            ...r,
            patientSnapshot: {
                ...(r.patientSnapshot || {}),
                mrn: r.patientSnapshot?.mrn || r.patientSnapshot?.uhid || ''
            }
        }));

        res.json({
            success: true,
            total: normalizedQueue.length,
            queue: normalizedQueue
        });
    } catch (error) {
        console.error('[results] verification-queue error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch verification queue: ' + error.message });
    }
});

/**
 * POST /api/lab/results/:id/start-review
 * Marks a SUBMITTED result as UNDER_REVIEW when opened by an authorized Pathologist.
 */
router.post('/:id/start-review', verifyToken, verifyResultAccess, verifyVerificationPermission, async (req, res) => {
    try {
        const { id } = req.params;
        const hospitalId = req.hospitalId;

        const result = await LabTestResult.findOne({ _id: id, hospitalId });
        if (!result) {
            return res.status(404).json({ success: false, message: 'Result record not found' });
        }

        if (result.resultStatus === 'SUBMITTED') {
            result.resultStatus = 'UNDER_REVIEW';
            result.reviewedBy = req.user._id;
            result.reviewedByName = req.user.name || 'Pathologist';
            result.reviewedAt = new Date();
            await result.save();

            await logResultHistory({
                hospitalId,
                resultId: result._id,
                orderId: result.orderId,
                testId: result.testId,
                testCode: result.testCode,
                previousStatus: 'SUBMITTED',
                newStatus: 'UNDER_REVIEW',
                action: 'REVIEW_STARTED',
                revisionNumber: result.revisionNumber,
                user: req.user,
                details: { reviewedBy: req.user.name }
            });
        }

        res.json({ success: true, result });
    } catch (error) {
        console.error('[results] start-review error:', error);
        res.status(500).json({ success: false, message: 'Failed to update review state: ' + error.message });
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

        const enteredSameUser = result.enteredBy && String(result.enteredBy) === String(req.user._id);
        const submittedSameUser = result.submittedBy && String(result.submittedBy) === String(req.user._id);
        if ((enteredSameUser || submittedSameUser) && !isAdmin) {
            return res.status(403).json({
                success: false,
                message: 'Clinical Safety Violation: The technician who entered or submitted this result cannot verify their own results. Independent pathologist sign-off is mandatory.'
            });
        }

        const prevStatus = result.resultStatus;
        result.resultStatus = 'VERIFIED';
        result.verifiedBy = req.user._id;
        result.verifiedByName = req.user.name || 'Pathologist';
        result.verifiedAt = new Date();
        if (overallRemarks) result.overallRemarks = overallRemarks;
        if (req.body.clinicalNotes !== undefined) result.clinicalNotes = req.body.clinicalNotes;

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

        if (result.resultStatus === 'VERIFIED') {
            return res.status(400).json({
                success: false,
                message: 'Verified results are immutable and cannot be directly rejected. Create an audited amendment instead.'
            });
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

        if (result.resultStatus === 'VERIFIED') {
            return res.status(400).json({
                success: false,
                message: 'Verified results are immutable. Create an audited amendment to revise verified findings.'
            });
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

        if (result.resultStatus === 'VERIFIED') {
            const roleData = req.user._roleData;
            const roleName = String(roleData?.name || req.user.role || '').toLowerCase();
            const perms = roleData?.permissions || [];
            const canAmendVerified = perms.includes('*') || roleName.includes('admin') || roleName.includes('pathologist') || perms.includes('results:verify');
            if (!canAmendVerified) {
                return res.status(403).json({
                    success: false,
                    message: 'Only an authorized Pathologist or Laboratory Administrator can initiate an amendment on a verified result.'
                });
            }
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
 * Aggregated live metrics across result & pathologist verification workflow.
 */
router.get('/dashboard', verifyToken, verifyResultAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId;
        const matchFilter = (hospitalId && mongoose.Types.ObjectId.isValid(hospitalId))
            ? { hospitalId: new mongoose.Types.ObjectId(hospitalId) }
            : (hospitalId ? { hospitalId } : {});

        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const [counts, verifiedTodayCount, pendingCriticalAlerts, totalCriticalAlerts] = await Promise.all([
            LabTestResult.aggregate([
                { $match: matchFilter },
                { $group: { _id: '$resultStatus', count: { $sum: 1 } } }
            ]),
            LabTestResult.countDocuments({
                ...(hospitalId ? { hospitalId } : {}),
                resultStatus: 'VERIFIED',
                verifiedAt: { $gte: todayStart }
            }),
            LabCriticalAlert.countDocuments({ ...(hospitalId ? { hospitalId } : {}), alertStatus: 'PENDING' }),
            LabCriticalAlert.countDocuments({ ...(hospitalId ? { hospitalId } : {}) })
        ]);

        const stats = {
            pending: 0,
            draft: 0,
            submitted: 0,
            underReview: 0,
            correctionRequested: 0,
            rejected: 0,
            verified: 0,
            verifiedToday: verifiedTodayCount,
            total: 0
        };

        counts.forEach((c) => {
            stats.total += c.count;
            if (c._id === 'PENDING') stats.pending = c.count;
            else if (c._id === 'DRAFT') stats.draft = c.count;
            else if (c._id === 'SUBMITTED') stats.submitted = c.count;
            else if (c._id === 'UNDER_REVIEW') stats.underReview = c.count;
            else if (c._id === 'CORRECTION_REQUESTED') stats.correctionRequested = c.count;
            else if (c._id === 'REJECTED') stats.rejected = c.count;
            else if (c._id === 'VERIFIED') stats.verified = c.count;
        });

        res.json({
            success: true,
            stats: {
                ...stats,
                pendingVerification: stats.submitted,
                awaitingPathologistTotal: stats.submitted + stats.underReview,
                rejectedResults: stats.rejected,
                criticalAlerts: pendingCriticalAlerts,
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
        const matchFilter = (hospitalId && mongoose.Types.ObjectId.isValid(hospitalId))
            ? { hospitalId: new mongoose.Types.ObjectId(hospitalId) }
            : (hospitalId ? { hospitalId } : {});

        const summary = await LabTestResult.aggregate([
            { $match: matchFilter },
            {
                $group: {
                    _id: '$department',
                    total: { $sum: 1 },
                    pending: { $sum: { $cond: [{ $eq: ['$resultStatus', 'PENDING'] }, 1, 0] } },
                    draft: { $sum: { $cond: [{ $eq: ['$resultStatus', 'DRAFT'] }, 1, 0] } },
                    submitted: { $sum: { $cond: [{ $in: ['$resultStatus', ['SUBMITTED', 'UNDER_REVIEW']] }, 1, 0] } },
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

/**
 * GET /api/lab/results/:id
 * Retrieves full result document with synchronized catalog parameters, sample metadata, and audit history.
 * Placed after static GET routes so named endpoints (/dashboard, /verification-queue, /critical-alerts) never collide.
 */
router.get('/:id', verifyToken, verifyResultAccess, async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid result ID format' });
        }
        const hospitalId = req.hospitalId;

        let result = await LabTestResult.findOne({ _id: id, hospitalId });
        if (!result) {
            return res.status(404).json({ success: false, message: 'Result record not found' });
        }

        // Non-destructively sync editable results with active Phase 3 Test Catalogue parameters
        if (['PENDING', 'DRAFT', 'CORRECTION_REQUESTED', 'REJECTED'].includes(result.resultStatus) && result.testId) {
            const masterTest = await LabTest.findById(result.testId).lean();
            if (masterTest) {
                const { activeParameters } = await resolveAuthoritativeCatalogTest(masterTest, hospitalId);
                if (activeParameters.length > 0) {
                    const synced = buildSyncedResultParameters(result.resultParameters, activeParameters, result.patientSnapshot || {});
                    const currentCount = (result.resultParameters || []).length;
                    const currentIsStub = isAutoStubParameterList(result.resultParameters, result.testName);
                    if (currentCount !== synced.length || currentIsStub) {
                        result.resultParameters = synced;
                        await result.save();
                    }
                }
            }
        }

        const [history, sample] = await Promise.all([
            LabResultHistory.find({ hospitalId, resultId: id }).sort({ timestamp: -1 }).lean(),
            result.sampleId ? LabSample.findOne({ _id: result.sampleId, hospitalId }).select('specimenType containerType status barcode collectedAt').lean() : null
        ]);

        const resultObj = result.toObject ? result.toObject() : result;
        if (resultObj && resultObj.patientSnapshot) {
            resultObj.patientSnapshot.mrn = resultObj.patientSnapshot.mrn || resultObj.patientSnapshot.uhid || '';
        }

        res.json({
            success: true,
            result: resultObj,
            sample,
            history
        });
    } catch (error) {
        console.error('[results] get by id error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch result: ' + error.message });
    }
});

module.exports = router;
