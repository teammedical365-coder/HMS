const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const { verifyToken } = require('../middleware/auth.middleware');
const User = require('../models/user.model');
const Hospital = require('../models/hospital.model');
const LabOrder = require('../models/labOrder.model');
const LabCounter = require('../models/labCounter.model');
const LabLocation = require('../models/labLocation.model');
const LabSample = require('../models/labSample.model');
const LabSampleHistory = require('../models/labSampleHistory.model');
const LabSampleTransfer = require('../models/labSampleTransfer.model');
const LabRecollectionRequest = require('../models/labRecollectionRequest.model');
const LabReport = require('../models/labReport.model');
const LabTestResult = require('../models/labTestResult.model');
const Appointment = require('../models/appointment.model');
const { generateCode128Svg } = require('../utils/code128');
const { syncPrescribedTestsToLmsOrder } = require('../services/lmsOrderSync.service');

// =========================================================================
// 1. SAMPLE SECURITY & ROLE MIDDLEWARE (STRICT TENANT & ROLE ISOLATION)
// =========================================================================
const resolveRoleAndPerms = (user) => {
    const roleData = user?._roleData;
    const roleName = String(roleData?.name || user?.roleName || user?.role || '').toLowerCase().trim();
    const perms = Array.isArray(roleData?.permissions)
        ? roleData.permissions
        : (Array.isArray(user?.permissions) ? user.permissions : []);
    return { roleName, perms };
};

const verifySampleAccess = (req, res, next) => {
    const user = req.user;
    if (!user) return res.status(401).json({ success: false, message: 'Authentication required' });

    const { roleName, perms } = resolveRoleAndPerms(user);

    const isAuthorized = (
        perms.includes('*') ||
        roleName.includes('admin') ||
        roleName.includes('manager') ||
        roleName.includes('phleb') ||
        roleName.includes('sample collector') ||
        roleName.includes('sample collection') ||
        roleName.includes('tech') ||
        roleName.includes('pathologist') ||
        roleName.includes('reception') ||
        perms.includes('samples:view') ||
        perms.includes('samples:collect') ||
        perms.includes('samples:receive') ||
        perms.includes('samples:process') ||
        perms.includes('lab_view')
    );

    if (!isAuthorized) {
        return res.status(403).json({ success: false, message: 'Access denied: Sample management permissions required' });
    }

    const isCentral = roleName === 'centraladmin' || roleName === 'superadmin';
    const resolvedHospitalId = isCentral
        ? (user.hospitalId || req.headers['x-hospital-id'] || null)
        : (user.hospitalId || null);

    if (!resolvedHospitalId || !mongoose.Types.ObjectId.isValid(resolvedHospitalId)) {
        return res.status(403).json({ success: false, message: 'Tenant hospital context is required for sample operations' });
    }

    req.hospitalId = resolvedHospitalId;
    next();
};

const verifyCollectionWriteAccess = (req, res, next) => {
    const { roleName, perms } = resolveRoleAndPerms(req.user);
    const canCollect = (
        perms.includes('*') ||
        roleName.includes('admin') ||
        roleName.includes('manager') ||
        roleName.includes('phleb') ||
        roleName.includes('sample collector') ||
        roleName.includes('sample collection') ||
        perms.includes('samples:collect') ||
        perms.includes('samples:recollect') ||
        perms.includes('lab_manage')
    );
    if (!canCollect) {
        return res.status(403).json({
            success: false,
            message: 'Access denied: Specimen collection / dispatch authorization required'
        });
    }
    next();
};

const verifyBenchWriteAccess = (req, res, next) => {
    const { roleName, perms } = resolveRoleAndPerms(req.user);
    const canProcess = (
        perms.includes('*') ||
        roleName.includes('admin') ||
        roleName.includes('manager') ||
        roleName.includes('tech') ||
        roleName.includes('pathologist') ||
        perms.includes('samples:receive') ||
        perms.includes('samples:process') ||
        perms.includes('samples:reject') ||
        perms.includes('lab_manage')
    );
    if (!canProcess) {
        return res.status(403).json({
            success: false,
            message: 'Access denied: Laboratory Technician / Accessioning authorization required'
        });
    }
    next();
};

// Sequence Generators
async function generateAtomicBarcode(hospitalId, hospital, dateStr) {
    const hospitalCode = await Hospital.ensureHospitalCode(hospital);
    const seq = await LabCounter.getNextSequence(hospitalId, 'sample_barcode', dateStr);
    return `SMP-${hospitalCode}-${dateStr}-${String(seq).padStart(4, '0')}`;
}

async function generateAtomicTransferNumber(hospitalId, hospital, dateStr) {
    const hospitalCode = await Hospital.ensureHospitalCode(hospital);
    const seq = await LabCounter.getNextSequence(hospitalId, 'transfer', dateStr);
    return `TRF-${hospitalCode}-${dateStr}-${String(seq).padStart(4, '0')}`;
}

// Helper: Log Sample History
async function logSampleHistory({ hospitalId, sampleId, barcode, previousStatus, newStatus, action, user, locationId = null, details = {} }) {
    try {
        await LabSampleHistory.create({
            hospitalId,
            sampleId,
            barcode,
            previousStatus,
            newStatus,
            action,
            performedBy: user._id,
            performedByName: user.name || 'Lab Staff',
            locationId,
            details,
            timestamp: new Date()
        });
    } catch (err) {
        console.error('[sample history log error]:', err);
    }
}

// =========================================================================
// 2. SAMPLE COLLECTION WORKSTATION APIS
// =========================================================================

/**
 * GET /api/lab/samples/collection-queue
 * Lists specimen collection items: pending draws from orders, active barcodes, and recollections.
 */
router.get('/collection-queue', verifyToken, verifySampleAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId;
        const { search = '', priority = '', status = '' } = req.query;

        // Auto-sync any unlinked HMS Doctor/Reception prescribed lab requests into Phase 4 LabOrders
        if (hospitalId && mongoose.Types.ObjectId.isValid(hospitalId)) {
            const [unsyncedReports, unsyncedAppts] = await Promise.all([
                LabReport.find({
                    hospitalId,
                    orderId: null,
                    reportStatus: 'PENDING',
                    'testNames.0': { $exists: true }
                }).limit(25).lean(),
                Appointment.find({
                    hospitalId,
                    status: { $nin: ['cancelled', 'Cancelled'] },
                    'labTests.0': { $exists: true }
                }).sort({ createdAt: -1 }).limit(20).lean().catch(() => [])
            ]);

            for (const rep of unsyncedReports) {
                await syncPrescribedTestsToLmsOrder({
                    hospitalId,
                    appointmentId: rep.appointmentId || null,
                    legacyLabReportId: rep._id,
                    userId: rep.userId,
                    patientId: rep.patientId,
                    doctorId: rep.doctorId,
                    labTests: rep.testNames,
                    sourceModule: 'HMS_DOCTOR'
                }).catch(() => {});
            }

            for (const appt of unsyncedAppts) {
                await syncPrescribedTestsToLmsOrder({
                    hospitalId,
                    appointmentId: appt._id,
                    userId: appt.userId,
                    patientId: appt.patientId,
                    doctorId: appt.doctorId,
                    doctorName: appt.doctorName || '',
                    labTests: appt.labTests,
                    sourceModule: 'HMS_RECEPTION'
                }).catch(() => {});
            }
        }

        // Query LabSample records across full collection & tracking lifecycle so workstation filters work accurately
        const sampleQuery = {
            hospitalId,
            status: status ? status : { $ne: 'CANCELLED' }
        };

        if (priority) sampleQuery.priority = priority;
        const safeTerm = search.trim() ? search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : '';
        const searchRegex = safeTerm ? new RegExp(safeTerm, 'i') : null;

        if (searchRegex) {
            sampleQuery.$or = [
                { barcode: searchRegex },
                { orderNumber: searchRegex },
                { 'patientSnapshot.name': searchRegex },
                { 'patientSnapshot.uhid': searchRegex },
                { 'patientSnapshot.mrn': searchRegex },
                { 'patientSnapshot.phone': searchRegex }
            ];
        }

        const rawSamples = await LabSample.find(sampleQuery).sort({ createdAt: -1 }).limit(150).lean();

        // Fetch confirmed/in-progress LabOrders for doctor metadata, tube counts & pending unbarcoded placeholders
        const orderQuery = {
            hospitalId,
            status: { $in: ['Confirmed', 'In Progress'] }
        };
        if (priority) orderQuery.priority = priority;

        const sampleIds = rawSamples.map((s) => s._id);
        const [orders, sampleParentOrders, sampleResults, recollections] = await Promise.all([
            LabOrder.find(orderQuery).sort({ createdAt: -1 }).limit(80).lean(),
            rawSamples.length > 0
                ? LabOrder.find({ _id: { $in: rawSamples.map((s) => s.orderId).filter(Boolean) } })
                    .select('_id referringDoctorName createdAt sourceModule samplePlaceholders status')
                    .lean()
                : Promise.resolve([]),
            sampleIds.length > 0
                ? LabTestResult.find({ hospitalId, sampleId: { $in: sampleIds } })
                    .select('sampleId testId resultStatus')
                    .lean()
                : Promise.resolve([]),
            LabRecollectionRequest.find({ hospitalId, status: { $ne: 'CANCELLED' } })
                .sort({ createdAt: -1 })
                .limit(50)
                .lean()
        ]);

        const orderMetaMap = new Map();
        orders.forEach((o) => orderMetaMap.set(String(o._id), o));
        sampleParentOrders.forEach((o) => orderMetaMap.set(String(o._id), o));

        const resultsBySampleMap = new Map();
        (sampleResults || []).forEach((r) => {
            const sid = String(r.sampleId);
            if (!resultsBySampleMap.has(sid)) resultsBySampleMap.set(sid, []);
            resultsBySampleMap.get(sid).push(r);
        });

        const deriveAnalysisStatus = (s, linkedResults = []) => {
            if (linkedResults.some((r) => r.resultStatus === 'CORRECTION_REQUESTED')) return 'Correction Needed';
            if (linkedResults.length > 0 && linkedResults.every((r) => ['VERIFIED', 'SUBMITTED', 'UNDER_REVIEW'].includes(r.resultStatus))) {
                return 'Completed';
            }
            if (s.status === 'PROCESSING_COMPLETED') return 'Completed';
            if (s.status === 'PROCESSING') return 'In Analyzer Run';
            if (s.status === 'ON_HOLD') return 'On Hold';
            if (s.status === 'REJECTED' || String(s.status || '').includes('RECOLLECTION')) return 'Halted';
            if (['PENDING_COLLECTION', 'BARCODE_GENERATED'].includes(s.status)) return 'Awaiting Sample';
            return 'Pending Analysis';
        };

        // Enrich samples with referringDoctorName, tube index/total & analysisStatus
        const samples = rawSamples.map((s) => {
            const parentOrd = orderMetaMap.get(String(s.orderId));
            const phList = parentOrd?.samplePlaceholders || [];
            const totalTubes = Math.max(1, phList.length);
            const matchedIdx = phList.findIndex(
                (ph) => String(ph.samplePlaceholderId) === String(s.specimenPlaceholderId) || String(ph._id) === String(s.specimenPlaceholderId)
            );
            const tubeIndex = matchedIdx >= 0 ? matchedIdx + 1 : 1;
            const linkedResults = resultsBySampleMap.get(String(s._id)) || [];

            return {
                ...s,
                referringDoctorName: parentOrd?.referringDoctorName || '',
                orderCreatedAt: parentOrd?.createdAt || s.createdAt,
                tubeIndex,
                tubeTotal: totalTubes,
                tubeLabel: `Tube ${tubeIndex}/${totalTubes}`,
                analysisStatus: deriveAnalysisStatus(s, linkedResults)
            };
        });

        // Build composite (orderId + placeholderId) set across ALL non-cancelled samples for these orders
        const activeOrderIds = orders.map((o) => o._id);
        const allOrderSamples = activeOrderIds.length > 0
            ? await LabSample.find({
                hospitalId,
                orderId: { $in: activeOrderIds },
                status: { $ne: 'CANCELLED' }
            }).select('orderId specimenPlaceholderId').lean()
            : [];

        const existingPlaceholderKeys = new Set(
            allOrderSamples.map((s) => `${String(s.orderId)}_${String(s.specimenPlaceholderId)}`)
        );

        const pendingPlaceholders = [];
        orders.forEach((ord) => {
            if (searchRegex) {
                const matchesOrder = (
                    searchRegex.test(ord.orderNumber || '') ||
                    searchRegex.test(ord.patientSnapshot?.name || '') ||
                    searchRegex.test(ord.patientSnapshot?.mrn || '') ||
                    searchRegex.test(ord.patientSnapshot?.uhid || '') ||
                    searchRegex.test(ord.patientSnapshot?.phone || '') ||
                    searchRegex.test(ord.referringDoctorName || '')
                );
                if (!matchesOrder) return;
            }

            const phList = ord.samplePlaceholders || [];
            const totalTubes = Math.max(1, phList.length);

            phList.forEach((ph, idx) => {
                const keyByCode = `${String(ord._id)}_${String(ph.samplePlaceholderId)}`;
                const keyByObjId = `${String(ord._id)}_${String(ph._id)}`;

                if (
                    ph.status === 'Pending Collection' &&
                    !existingPlaceholderKeys.has(keyByCode) &&
                    !existingPlaceholderKeys.has(keyByObjId)
                ) {
                    pendingPlaceholders.push({
                        isPlaceholderOnly: true,
                        orderId: ord._id,
                        orderNumber: ord.orderNumber,
                        tokenNumber: ord.tokenNumber,
                        patientId: ord.patient,
                        patientSnapshot: ord.patientSnapshot,
                        referringDoctorName: ord.referringDoctorName || '',
                        sourceModule: ord.sourceModule || 'LMS_DIRECT',
                        specimenPlaceholderId: ph.samplePlaceholderId || ph._id,
                        specimenType: ph.specimenType,
                        containerType: ph.containerType,
                        requiredVolume: ph.requiredVolume,
                        testCodes: ph.testCodes || [],
                        testNames: ph.testNames || [],
                        priority: ord.priority,
                        collectionType: ord.collectionType,
                        status: 'PENDING_COLLECTION',
                        analysisStatus: 'Awaiting Sample',
                        tubeIndex: idx + 1,
                        tubeTotal: totalTubes,
                        tubeLabel: `Tube ${idx + 1}/${totalTubes}`,
                        orderCreatedAt: ord.createdAt,
                        createdAt: ord.createdAt
                    });
                }
            });
        });

        res.json({
            success: true,
            samples,
            pendingPlaceholders,
            recollections,
            total: samples.length + pendingPlaceholders.length
        });
    } catch (error) {
        console.error('[lab sample] collection queue error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch collection queue: ' + error.message });
    }
});

/**
 * POST /api/lab/samples/generate-barcode
 * Generate a unique Code 128 barcode for a specimen placeholder and create/activate physical LabSample record.
 */
router.post('/generate-barcode', verifyToken, verifySampleAccess, verifyCollectionWriteAccess, async (req, res) => {
    try {
        const { orderId, specimenPlaceholderId } = req.body;
        const hospitalId = req.hospitalId;

        if (!orderId || !specimenPlaceholderId) {
            return res.status(400).json({ success: false, message: 'Order ID and Specimen Placeholder ID are required' });
        }

        const order = await LabOrder.findOne({ _id: orderId, hospitalId });
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found in this laboratory tenant' });
        }

        const placeholder = (order.samplePlaceholders || []).find(
            p => String(p._id) === String(specimenPlaceholderId) || String(p.samplePlaceholderId) === String(specimenPlaceholderId)
        );

        if (!placeholder) {
            return res.status(404).json({ success: false, message: 'Specimen placeholder not found in this order' });
        }

        // Prevent duplicate barcode generation for the same tube/placeholder
        const candidateIds = [String(placeholder.samplePlaceholderId || ''), String(placeholder._id || '')].filter(Boolean);
        let sample = await LabSample.findOne({
            hospitalId,
            orderId,
            specimenPlaceholderId: { $in: candidateIds },
            status: { $ne: 'CANCELLED' }
        });

        if (sample && sample.barcode) {
            return res.json({
                success: true,
                message: 'Barcode already generated',
                sample,
                barcodeSvg: generateCode128Svg(sample.barcode)
            });
        }

        const hospital = await Hospital.findById(hospitalId);
        const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const barcode = await generateAtomicBarcode(hospitalId, hospital, todayStr);

        // Map tests for this placeholder
        const phTestCodes = placeholder.testCodes || [];
        const matchedTests = (order.tests || []).filter(t => phTestCodes.includes(t.testCode)).map(t => ({
            testId: t.testId,
            testCode: t.testCode,
            testName: t.testName,
            department: t.department
        }));

        sample = new LabSample({
            hospitalId,
            barcode,
            orderId: order._id,
            orderNumber: order.orderNumber,
            tokenNumber: order.tokenNumber,
            patientId: order.patient,
            patientSnapshot: order.patientSnapshot,
            specimenPlaceholderId: placeholder.samplePlaceholderId || placeholder._id,
            tests: matchedTests.length > 0 ? matchedTests : (order.tests || []).map(t => ({
                testId: t.testId,
                testCode: t.testCode,
                testName: t.testName,
                department: t.department
            })),
            specimenType: placeholder.specimenType,
            containerType: placeholder.containerType,
            requiredVolume: placeholder.requiredVolume,
            priority: order.priority,
            collectionType: order.collectionType,
            status: 'BARCODE_GENERATED',
            collectionLocationId: order.locationId || null,
            currentLocationId: order.locationId || null,
            labelPrintCount: 1,
            lastPrintedAt: new Date(),
            lastPrintedBy: req.user._id
        });

        await sample.save();

        await logSampleHistory({
            hospitalId,
            sampleId: sample._id,
            barcode: sample.barcode,
            previousStatus: 'PENDING_COLLECTION',
            newStatus: 'BARCODE_GENERATED',
            action: 'BARCODE_GENERATED',
            user: req.user,
            locationId: order.locationId,
            details: { specimenType: sample.specimenType, containerType: sample.containerType }
        });

        res.status(201).json({
            success: true,
            message: 'Barcode generated successfully',
            sample,
            barcodeSvg: generateCode128Svg(sample.barcode)
        });
    } catch (error) {
        console.error('[lab sample] generate barcode error:', error);
        res.status(500).json({ success: false, message: 'Failed to generate barcode: ' + error.message });
    }
});

/**
 * POST /api/lab/samples/:id/collect
 * Confirm physical collection of blood / urine specimen by phlebotomist.
 */
router.post(['/samples/:id/collect', '/:id/collect'], verifyToken, verifySampleAccess, verifyCollectionWriteAccess, async (req, res) => {
    try {
        const { id } = req.params;
        const {
            collectedVolume = '2-3 mL',
            collectionNotes = '',
            collectedAt = null,
            locationId = null,
            labelConfirmedAttached = true,
            dispatchToLab = false
        } = req.body;
        const hospitalId = req.hospitalId;

        const sample = await LabSample.findOne({ _id: id, hospitalId });
        if (!sample) {
            return res.status(404).json({ success: false, message: 'Sample record not found' });
        }

        // Prevent duplicate collection unless recollection pending
        if (['COLLECTED', 'DISPATCHED', 'IN_TRANSIT', 'ACCESSION_PENDING', 'RECEIVED_AT_PROCESSING_LAB', 'ACCEPTED', 'PROCESSING', 'PROCESSING_COMPLETED'].includes(sample.status)) {
            return res.status(400).json({ success: false, message: `Sample is already collected (Current status: ${sample.status})` });
        }

        const parsedCollectedAt = collectedAt ? new Date(collectedAt) : new Date();
        const effectiveCollectedAt = Number.isNaN(parsedCollectedAt.getTime()) ? new Date() : parsedCollectedAt;

        const prevStatus = sample.status;
        const nextStatus = dispatchToLab ? 'DISPATCHED' : 'COLLECTED';
        sample.status = nextStatus;
        sample.collectedVolume = String(collectedVolume || sample.requiredVolume || '2-3 mL').trim();
        const labelNote = labelConfirmedAttached ? '[Barcode Label Verified Attached]' : '';
        sample.collectionNotes = [labelNote, collectionNotes ? collectionNotes.trim() : ''].filter(Boolean).join(' ');
        sample.collectedBy = req.user._id;
        sample.collectedByName = req.user.name || 'Sample Collector';
        sample.collectedAt = effectiveCollectedAt;
        if (locationId) sample.currentLocationId = locationId;

        await sample.save();

        // Sync Phase 4 LabOrder placeholder status to 'Collected'
        await LabOrder.updateOne(
            {
                _id: sample.orderId,
                hospitalId,
                'samplePlaceholders.samplePlaceholderId': sample.specimenPlaceholderId
            },
            {
                $set: { 'samplePlaceholders.$.status': 'Collected' }
            }
        ).catch(() => {});

        let transferRecord = null;
        if (dispatchToLab) {
            const [hospital, activeLocations] = await Promise.all([
                Hospital.findById(hospitalId),
                LabLocation.find({ hospitalId, isActive: true }).sort({ isProcessingLab: -1, createdAt: 1 })
            ]);
            let destLoc = activeLocations.find((l) => l.isProcessingLab) || activeLocations[0] || null;
            if (!destLoc && hospital) {
                destLoc = await LabLocation.create({
                    hospitalId,
                    locationName: `${hospital.name} — Main Processing Lab`,
                    locationCode: 'MAIN-01',
                    locationType: 'PROCESSING_LAB',
                    isProcessingLab: true,
                    isActive: true,
                    contactPerson: 'Laboratory Director',
                    phone: hospital.phone || '',
                    email: hospital.email || ''
                });
            }
            if (destLoc && hospital) {
                const srcLoc = (sample.collectionLocationId && activeLocations.find((l) => String(l._id) === String(sample.collectionLocationId))) || destLoc;
                const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
                const transferNumber = await generateAtomicTransferNumber(hospitalId, hospital, todayStr);
                sample.processingLocationId = destLoc._id;
                await sample.save();

                transferRecord = await LabSampleTransfer.create({
                    hospitalId,
                    transferNumber,
                    sourceLocationId: srcLoc._id,
                    sourceLocationName: srcLoc.locationName,
                    destinationLocationId: destLoc._id,
                    destinationLocationName: destLoc.locationName,
                    samples: [{
                        sampleId: sample._id,
                        barcode: sample.barcode,
                        specimenType: sample.specimenType,
                        containerType: sample.containerType,
                        patientName: sample.patientSnapshot?.name || '',
                        testNames: (sample.tests || []).map((t) => t.testName)
                    }],
                    status: 'DISPATCHED',
                    courierName: 'Internal Sample Collection Dispatch',
                    dispatchedBy: req.user._id,
                    dispatchedByName: req.user.name || 'Sample Collector',
                    dispatchedAt: new Date(),
                    notes: collectionNotes || 'Dispatched upon specimen collection'
                });
            }
        }

        await logSampleHistory({
            hospitalId,
            sampleId: sample._id,
            barcode: sample.barcode,
            previousStatus: prevStatus,
            newStatus: nextStatus,
            action: dispatchToLab ? 'COLLECTED_AND_DISPATCHED_TO_LAB' : 'COLLECTION_CONFIRMED',
            user: req.user,
            locationId: sample.currentLocationId,
            details: {
                collectedVolume: sample.collectedVolume,
                collectedAt: effectiveCollectedAt,
                labelConfirmedAttached: Boolean(labelConfirmedAttached),
                transferNumber: transferRecord?.transferNumber || null,
                notes: collectionNotes
            }
        });

        res.json({
            success: true,
            message: dispatchToLab
                ? 'Sample collected and dispatched to Processing Laboratory'
                : 'Sample collection confirmed successfully',
            sample,
            transfer: transferRecord
        });
    } catch (error) {
        console.error('[lab sample] collect sample error:', error);
        res.status(500).json({ success: false, message: 'Failed to confirm collection: ' + error.message });
    }
});

/**
 * POST /api/lab/samples/:id/dispatch-to-lab
 * Dispatch a collected, barcoded specimen to the Processing Laboratory using Phase 6 chain-of-custody transfer.
 * Never marks sample as received before actual laboratory receipt is confirmed.
 */
router.post(['/samples/:id/dispatch-to-lab', '/:id/dispatch-to-lab'], verifyToken, verifySampleAccess, verifyCollectionWriteAccess, async (req, res) => {
    try {
        const { id } = req.params;
        const { courierName = 'Internal Laboratory Runner', transportReference = '', notes = '' } = req.body || {};
        const hospitalId = req.hospitalId;

        const sample = await LabSample.findOne({ _id: id, hospitalId });
        if (!sample) {
            return res.status(404).json({ success: false, message: 'Sample record not found' });
        }

        if (sample.status !== 'COLLECTED') {
            return res.status(400).json({
                success: false,
                message: `Only COLLECTED samples can be dispatched to the processing lab (Current status: ${sample.status})`
            });
        }

        const [hospital, activeLocations] = await Promise.all([
            Hospital.findById(hospitalId),
            LabLocation.find({ hospitalId, isActive: true }).sort({ isProcessingLab: -1, createdAt: 1 })
        ]);

        let destLoc = activeLocations.find((l) => l.isProcessingLab) || activeLocations[0] || null;
        if (!destLoc && hospital) {
            destLoc = await LabLocation.create({
                hospitalId,
                locationName: `${hospital.name} — Main Processing Lab`,
                locationCode: 'MAIN-01',
                locationType: 'PROCESSING_LAB',
                isProcessingLab: true,
                isActive: true,
                contactPerson: 'Laboratory Director',
                phone: hospital.phone || '',
                email: hospital.email || ''
            });
        }

        const srcLoc = (sample.collectionLocationId && activeLocations.find((l) => String(l._id) === String(sample.collectionLocationId))) || destLoc;
        const prevStatus = sample.status;
        sample.status = 'DISPATCHED';
        if (destLoc) {
            sample.processingLocationId = destLoc._id;
        }
        await sample.save();

        let transferRecord = null;
        if (destLoc && hospital) {
            const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
            const transferNumber = await generateAtomicTransferNumber(hospitalId, hospital, todayStr);
            transferRecord = await LabSampleTransfer.create({
                hospitalId,
                transferNumber,
                sourceLocationId: srcLoc._id,
                sourceLocationName: srcLoc.locationName,
                destinationLocationId: destLoc._id,
                destinationLocationName: destLoc.locationName,
                samples: [{
                    sampleId: sample._id,
                    barcode: sample.barcode,
                    specimenType: sample.specimenType,
                    containerType: sample.containerType,
                    patientName: sample.patientSnapshot?.name || '',
                    testNames: (sample.tests || []).map((t) => t.testName)
                }],
                status: 'DISPATCHED',
                courierName: String(courierName || 'Internal Laboratory Runner').trim(),
                transportReference: String(transportReference || '').trim(),
                dispatchedBy: req.user._id,
                dispatchedByName: req.user.name || 'Sample Collector',
                dispatchedAt: new Date(),
                notes: notes || 'Dispatched from Sample Collection to Processing Laboratory'
            });
        }

        await logSampleHistory({
            hospitalId,
            sampleId: sample._id,
            barcode: sample.barcode,
            previousStatus: prevStatus,
            newStatus: 'DISPATCHED',
            action: 'SAMPLE_DISPATCHED_TO_LAB',
            user: req.user,
            locationId: sample.currentLocationId || srcLoc?._id || null,
            details: {
                transferNumber: transferRecord?.transferNumber || null,
                destinationLocationName: destLoc?.locationName || 'Processing Laboratory',
                dispatchedAt: new Date(),
                courierName,
                transportReference,
                notes: notes || 'Handed over from Sample Collection to Processing Laboratory'
            }
        });

        res.json({
            success: true,
            message: transferRecord
                ? `Sample ${sample.barcode} dispatched to ${destLoc.locationName} (${transferRecord.transferNumber})`
                : `Sample ${sample.barcode} dispatched to Processing Laboratory`,
            sample,
            transfer: transferRecord
        });
    } catch (error) {
        console.error('[lab sample] dispatch to lab error:', error);
        res.status(500).json({ success: false, message: 'Failed to dispatch sample: ' + error.message });
    }
});

/**
 * GET /api/lab/samples/:id/label
 * Return barcode label data for printing.
 */
router.get(['/samples/:id/label', '/:id/label'], verifyToken, verifySampleAccess, async (req, res) => {
    try {
        const { id } = req.params;
        const hospitalId = req.hospitalId;

        const [sample, hospital] = await Promise.all([
            LabSample.findOne({ _id: id, hospitalId }).lean(),
            Hospital.findById(hospitalId).select('name code address branding').lean()
        ]);

        if (!sample) {
            return res.status(404).json({ success: false, message: 'Sample not found' });
        }

        const orderDoc = sample.orderId
            ? await LabOrder.findById(sample.orderId).select('referringDoctorName samplePlaceholders').lean()
            : null;

        const phList = orderDoc?.samplePlaceholders || [];
        const totalTubes = Math.max(1, phList.length);
        const matchedIdx = phList.findIndex(
            (ph) => String(ph.samplePlaceholderId) === String(sample.specimenPlaceholderId) || String(ph._id) === String(sample.specimenPlaceholderId)
        );
        const tubeLabel = `Tube ${matchedIdx >= 0 ? matchedIdx + 1 : 1}/${totalTubes}`;

        const barcodeSvg = generateCode128Svg(sample.barcode, { height: 45, barWidth: 1.8 });
        const resolvedHospitalName = hospital?.branding?.appName || hospital?.name || 'Medical 365';

        res.json({
            success: true,
            labelData: {
                hospitalName: resolvedHospitalName,
                barcode: sample.barcode,
                barcodeSvg,
                patientName: sample.patientSnapshot?.name,
                mrn: sample.patientSnapshot?.mrn || sample.patientSnapshot?.uhid || 'N/A',
                uhid: sample.patientSnapshot?.uhid || sample.patientSnapshot?.mrn || 'N/A',
                doctorName: orderDoc?.referringDoctorName || '',
                orderNumber: sample.orderNumber,
                tokenNumber: sample.tokenNumber,
                specimenType: sample.specimenType,
                containerType: sample.containerType,
                tubeLabel,
                priority: sample.priority,
                testsSummary: (sample.tests || []).map(t => t.testName || t.testCode).join(', '),
                collectedAt: sample.collectedAt || null,
                collectedByName: sample.collectedByName || ''
            }
        });
    } catch (error) {
        console.error('[lab sample] get label error:', error);
        res.status(500).json({ success: false, message: 'Failed to generate label: ' + error.message });
    }
});

/**
 * POST /api/lab/samples/:id/reprint-label
 * Audit and count barcode label reprint.
 */
router.post(['/samples/:id/reprint-label', '/:id/reprint-label'], verifyToken, verifySampleAccess, async (req, res) => {
    try {
        const { id } = req.params;
        const hospitalId = req.hospitalId;

        const sample = await LabSample.findOne({ _id: id, hospitalId });
        if (!sample) {
            return res.status(404).json({ success: false, message: 'Sample not found' });
        }

        sample.labelPrintCount = (sample.labelPrintCount || 0) + 1;
        sample.lastPrintedAt = new Date();
        sample.lastPrintedBy = req.user._id;
        await sample.save();

        await logSampleHistory({
            hospitalId,
            sampleId: sample._id,
            barcode: sample.barcode,
            previousStatus: sample.status,
            newStatus: sample.status,
            action: 'BARCODE_REPRINTED',
            user: req.user,
            details: { printCount: sample.labelPrintCount }
        });

        res.json({
            success: true,
            message: 'Barcode label reprint recorded',
            printCount: sample.labelPrintCount
        });
    } catch (error) {
        console.error('[lab sample] reprint label error:', error);
        res.status(500).json({ success: false, message: 'Failed to record reprint: ' + error.message });
    }
});

// =========================================================================
// 3. ACCESSIONING WORKSTATION APIS
// =========================================================================

/**
 * GET /api/lab/samples/accession-queue
 * Samples awaiting quality check, acceptance, or rejection.
 */
router.get('/accession-queue', verifyToken, verifySampleAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId;
        const { search = '', status = '', priority = '' } = req.query;

        const query = {
            hospitalId,
            status: status ? status : { $in: ['COLLECTED', 'DISPATCHED', 'IN_TRANSIT', 'ACCESSION_PENDING', 'RECEIVED_AT_PROCESSING_LAB'] }
        };

        if (priority) query.priority = priority;
        if (search) {
            const safe = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(safe, 'i');
            query.$or = [
                { barcode: regex },
                { orderNumber: regex },
                { 'patientSnapshot.name': regex },
                { 'patientSnapshot.mrn': regex },
                { 'patientSnapshot.uhid': regex }
            ];
        }

        const samples = await LabSample.find(query).sort({ priority: -1, collectedAt: -1 }).limit(100).lean();

        res.json({
            success: true,
            samples,
            total: samples.length
        });
    } catch (error) {
        console.error('[lab sample] accession queue error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch accession queue: ' + error.message });
    }
});

/**
 * POST /api/lab/samples/:id/receive
 * Lab Technician confirms physical receipt & barcode scan of a dispatched specimen at the Processing Lab.
 */
router.post(['/samples/:id/receive', '/:id/receive'], verifyToken, verifySampleAccess, verifyBenchWriteAccess, async (req, res) => {
    try {
        const { id } = req.params;
        const { notes = '', locationId = null } = req.body || {};
        const hospitalId = req.hospitalId;

        const sample = await LabSample.findOne({ _id: id, hospitalId });
        if (!sample) {
            return res.status(404).json({ success: false, message: 'Sample not found in this hospital laboratory' });
        }

        const receivableStates = ['COLLECTED', 'DISPATCHED', 'IN_TRANSIT', 'ACCESSION_PENDING'];
        if (!receivableStates.includes(sample.status)) {
            return res.status(400).json({
                success: false,
                message: `Cannot mark sample as Received at Lab from status "${sample.status}". Sample must be collected and dispatched first.`
            });
        }

        const prevStatus = sample.status;
        sample.status = 'RECEIVED_AT_PROCESSING_LAB';
        if (locationId) {
            sample.currentLocationId = locationId;
        } else if (sample.processingLocationId) {
            sample.currentLocationId = sample.processingLocationId;
        }
        await sample.save();

        // Reconcile any active LabSampleTransfer manifest containing this sample
        const openTransfers = await LabSampleTransfer.find({
            hospitalId,
            status: 'DISPATCHED',
            'samples.sampleId': sample._id
        });

        for (const trf of openTransfers) {
            const manifestIds = (trf.samples || []).map((m) => m.sampleId);
            const unreceivedCount = await LabSample.countDocuments({
                hospitalId,
                _id: { $in: manifestIds },
                status: { $in: ['COLLECTED', 'DISPATCHED', 'IN_TRANSIT', 'ACCESSION_PENDING'] }
            });
            if (unreceivedCount === 0) {
                trf.status = 'RECEIVED';
                trf.receivedBy = req.user._id;
                trf.receivedByName = req.user.name || 'Lab Technician';
                trf.receivedAt = new Date();
                await trf.save();
            }
        }

        await logSampleHistory({
            hospitalId,
            sampleId: sample._id,
            barcode: sample.barcode,
            previousStatus: prevStatus,
            newStatus: 'RECEIVED_AT_PROCESSING_LAB',
            action: 'SAMPLE_RECEIVED_AT_LAB',
            user: req.user,
            locationId: sample.currentLocationId,
            details: { notes: notes || 'Barcode scanned and specimen received at Laboratory Bench' }
        });

        res.json({
            success: true,
            message: `Specimen ${sample.barcode} received at Processing Laboratory`,
            sample
        });
    } catch (error) {
        console.error('[lab sample] receive sample error:', error);
        res.status(500).json({ success: false, message: 'Failed to receive sample: ' + error.message });
    }
});

/**
 * POST /api/lab/samples/:id/accept
 * Sample inspection passed: mark Accepted and route to Processing Queue.
 */
router.post(['/samples/:id/accept', '/:id/accept'], verifyToken, verifySampleAccess, verifyBenchWriteAccess, async (req, res) => {
    try {
        const { id } = req.params;
        const { sampleCondition = 'Normal', accessionNotes = '', locationId = null } = req.body;
        const hospitalId = req.hospitalId;

        const sample = await LabSample.findOne({ _id: id, hospitalId });
        if (!sample) {
            return res.status(404).json({ success: false, message: 'Sample not found' });
        }

        const validTransitions = ['COLLECTED', 'DISPATCHED', 'IN_TRANSIT', 'ACCESSION_PENDING', 'RECEIVED_AT_PROCESSING_LAB'];
        if (!validTransitions.includes(sample.status)) {
            return res.status(400).json({
                success: false,
                message: `Cannot accept sample in status "${sample.status}". Sample must be collected or received first.`
            });
        }

        const prevStatus = sample.status;
        sample.status = 'ACCEPTED';
        sample.sampleCondition = sampleCondition;
        sample.accessionNotes = accessionNotes;
        sample.accessionedBy = req.user._id;
        sample.accessionedByName = req.user.name || 'Lab Technician';
        sample.accessionedAt = new Date();
        if (locationId) {
            sample.currentLocationId = locationId;
        } else if (sample.processingLocationId) {
            sample.currentLocationId = sample.processingLocationId;
        }

        await sample.save();

        // Reconcile any active LabSampleTransfer manifest containing this sample
        await LabSampleTransfer.updateMany(
            { hospitalId, status: 'DISPATCHED', 'samples.sampleId': sample._id, 'samples.1': { $exists: false } },
            {
                $set: {
                    status: 'RECEIVED',
                    receivedBy: req.user._id,
                    receivedByName: req.user.name || 'Lab Technician',
                    receivedAt: new Date()
                }
            }
        ).catch(() => {});

        await logSampleHistory({
            hospitalId,
            sampleId: sample._id,
            barcode: sample.barcode,
            previousStatus: prevStatus,
            newStatus: 'ACCEPTED',
            action: 'ACCESSION_ACCEPTED',
            user: req.user,
            locationId: sample.currentLocationId,
            details: { sampleCondition, notes: accessionNotes }
        });

        res.json({
            success: true,
            message: 'Sample accepted into laboratory technical workflow',
            sample
        });
    } catch (error) {
        console.error('[lab sample] accept sample error:', error);
        res.status(500).json({ success: false, message: 'Failed to accept sample: ' + error.message });
    }
});

/**
 * POST /api/lab/samples/:id/reject
 * Reject defective specimen (hemolyzed, clotted, leaking) and trigger recollection workflow.
 */
router.post(['/samples/:id/reject', '/:id/reject'], verifyToken, verifySampleAccess, verifyBenchWriteAccess, async (req, res) => {
    try {
        const { id } = req.params;
        const { reason, notes = '', requestRecollection = true } = req.body;
        const hospitalId = req.hospitalId;

        if (!reason || !reason.trim()) {
            return res.status(400).json({ success: false, message: 'Mandatory rejection reason is required for sample quality audit' });
        }

        const sample = await LabSample.findOne({ _id: id, hospitalId });
        if (!sample) {
            return res.status(404).json({ success: false, message: 'Sample not found' });
        }

        const prevStatus = sample.status;
        sample.status = requestRecollection ? 'RECOLLECTION_REQUESTED' : 'REJECTED';
        sample.rejection = {
            isRejected: true,
            reason: reason.trim(),
            rejectedBy: req.user._id,
            rejectedAt: new Date(),
            notes
        };

        let recollectionReq = null;
        if (requestRecollection) {
            recollectionReq = new LabRecollectionRequest({
                hospitalId,
                orderId: sample.orderId,
                orderNumber: sample.orderNumber,
                patientId: sample.patientId,
                patientName: sample.patientSnapshot?.name || '',
                originalSampleId: sample._id,
                originalBarcode: sample.barcode,
                specimenPlaceholderId: sample.specimenPlaceholderId,
                specimenType: sample.specimenType,
                containerType: sample.containerType,
                reason: reason.trim(),
                status: 'REQUESTED',
                requestedBy: req.user._id,
                requestedByName: req.user.name || 'Technician',
                notes
            });
            await recollectionReq.save();
            sample.recollection.recollectionRequestId = recollectionReq._id;

            // Update Phase 4 LabOrder recollection tracking
            await LabOrder.updateOne(
                { hospitalId, _id: sample.orderId },
                {
                    $push: {
                        recollectionRequests: {
                            samplePlaceholderId: sample.specimenPlaceholderId,
                            specimenType: sample.specimenType,
                            containerType: sample.containerType,
                            reason: reason.trim(),
                            requestedBy: req.user._id,
                            requestedAt: new Date(),
                            status: 'Pending'
                        }
                    }
                }
            );
        }

        await sample.save();

        await logSampleHistory({
            hospitalId,
            sampleId: sample._id,
            barcode: sample.barcode,
            previousStatus: prevStatus,
            newStatus: sample.status,
            action: 'ACCESSION_REJECTED',
            user: req.user,
            locationId: sample.currentLocationId,
            details: { reason, requestRecollection, notes }
        });

        res.json({
            success: true,
            message: requestRecollection ? 'Sample rejected and recollection request initiated' : 'Sample rejected',
            sample,
            recollectionRequest: recollectionReq
        });
    } catch (error) {
        console.error('[lab sample] reject sample error:', error);
        res.status(500).json({ success: false, message: 'Failed to reject sample: ' + error.message });
    }
});

// =========================================================================
// 4. RECOLLECTION WORKFLOW APIS
// =========================================================================

/**
 * GET /api/lab/samples/recollections
 * List all active recollection requests.
 */
router.get('/recollections', verifyToken, verifySampleAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId;
        const { status = '' } = req.query;

        const query = { hospitalId };
        if (status) query.status = status;

        const recollections = await LabRecollectionRequest.find(query)
            .sort({ createdAt: -1 })
            .limit(100)
            .lean();

        res.json({
            success: true,
            recollections,
            total: recollections.length
        });
    } catch (error) {
        console.error('[lab sample] get recollections error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch recollections: ' + error.message });
    }
});

/**
 * POST /api/lab/samples/recollections/:id/recollect
 * Phlebotomist confirms redrawing the sample: generates new barcode and linked replacement sample.
 */
router.post(['/recollections/:id/recollect', '/:id/recollect'], verifyToken, verifySampleAccess, verifyCollectionWriteAccess, async (req, res) => {
    try {
        const { id } = req.params;
        const { collectedVolume = '2-3 mL', notes = '' } = req.body;
        const hospitalId = req.hospitalId;

        const recollection = await LabRecollectionRequest.findOne({ _id: id, hospitalId });
        if (!recollection) {
            return res.status(404).json({ success: false, message: 'Recollection request not found' });
        }

        if (recollection.status === 'RECOLLECTED') {
            return res.status(400).json({ success: false, message: 'This recollection request has already been completed' });
        }

        const originalSample = await LabSample.findById(recollection.originalSampleId);
        if (!originalSample) {
            return res.status(404).json({ success: false, message: 'Original sample record not found' });
        }

        const hospital = await Hospital.findById(hospitalId);
        const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const newBarcode = await generateAtomicBarcode(hospitalId, hospital, todayStr);

        // Create replacement physical sample
        const replacementSample = new LabSample({
            hospitalId,
            barcode: newBarcode,
            orderId: originalSample.orderId,
            orderNumber: originalSample.orderNumber,
            tokenNumber: originalSample.tokenNumber,
            patientId: originalSample.patientId,
            patientSnapshot: originalSample.patientSnapshot,
            specimenPlaceholderId: originalSample.specimenPlaceholderId,
            tests: originalSample.tests,
            specimenType: originalSample.specimenType,
            containerType: originalSample.containerType,
            requiredVolume: originalSample.requiredVolume,
            collectedVolume,
            priority: originalSample.priority,
            collectionType: originalSample.collectionType,
            status: 'COLLECTED',
            collectionLocationId: originalSample.collectionLocationId,
            currentLocationId: originalSample.currentLocationId,
            collectedBy: req.user._id,
            collectedByName: req.user.name || 'Phlebotomist',
            collectedAt: new Date(),
            collectionNotes: notes || `Replacement draw for ${originalSample.barcode}`,
            recollection: {
                isRecollection: true,
                originalSampleId: originalSample._id,
                originalBarcode: originalSample.barcode,
                recollectionRequestId: recollection._id
            }
        });

        await replacementSample.save();

        // Update recollection request state
        recollection.status = 'RECOLLECTED';
        recollection.replacementSampleId = replacementSample._id;
        recollection.replacementBarcode = replacementSample.barcode;
        recollection.recollectedAt = new Date();
        recollection.recollectedBy = req.user._id;
        await recollection.save();

        await logSampleHistory({
            hospitalId,
            sampleId: replacementSample._id,
            barcode: replacementSample.barcode,
            previousStatus: 'RECOLLECTION_PENDING',
            newStatus: 'COLLECTED',
            action: 'REPLACEMENT_SAMPLE_COLLECTED',
            user: req.user,
            details: { originalBarcode: originalSample.barcode, recollectionReason: recollection.reason }
        });

        res.status(201).json({
            success: true,
            message: 'Replacement sample recollected successfully with new unique barcode',
            replacementSample,
            barcodeSvg: generateCode128Svg(replacementSample.barcode)
        });
    } catch (error) {
        console.error('[lab sample] recollect sample error:', error);
        res.status(500).json({ success: false, message: 'Failed to process recollection: ' + error.message });
    }
});

// =========================================================================
// 5. SAMPLE PROCESSING QUEUE APIS (BENCH TESTING)
// =========================================================================

/**
 * GET /api/lab/samples/processing-queue
 * Samples accepted and queued for testing on technical analyzers.
 */
router.get('/processing-queue', verifyToken, verifySampleAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId;
        const { search = '', status = '', priority = '' } = req.query;

        const safeTerm = search.trim() ? search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : '';
        const searchRegex = safeTerm ? new RegExp(safeTerm, 'i') : null;
        const searchClause = searchRegex
            ? {
                $or: [
                    { barcode: searchRegex },
                    { orderNumber: searchRegex },
                    { 'patientSnapshot.name': searchRegex },
                    { 'patientSnapshot.mrn': searchRegex },
                    { 'patientSnapshot.uhid': searchRegex }
                ]
            }
            : {};

        const benchQuery = {
            hospitalId,
            status: status ? status : { $in: ['ACCEPTED', 'PROCESSING_PENDING', 'PROCESSING', 'ON_HOLD'] },
            ...searchClause
        };
        if (priority) benchQuery.priority = priority;

        const inboundQuery = {
            hospitalId,
            status: { $in: ['COLLECTED', 'DISPATCHED', 'IN_TRANSIT', 'ACCESSION_PENDING', 'RECEIVED_AT_PROCESSING_LAB'] },
            ...searchClause
        };
        if (priority) inboundQuery.priority = priority;

        const allSamplesQuery = {
            hospitalId,
            status: { $ne: 'CANCELLED' },
            ...searchClause
        };
        if (priority) allSamplesQuery.priority = priority;

        const [
            samples,
            inboundSamples,
            allPhysicalSamples,
            activeOrders,
            activeLocations,
            activeAnalyzerCount,
            awaitingIntakeCount
        ] = await Promise.all([
            LabSample.find(benchQuery).sort({ priority: -1, accessionedAt: -1, updatedAt: -1 }).limit(100).lean(),
            status ? Promise.resolve([]) : LabSample.find(inboundQuery).sort({ priority: -1, collectedAt: -1 }).limit(80).lean(),
            LabSample.find(allSamplesQuery).sort({ updatedAt: -1, createdAt: -1 }).limit(120).lean(),
            LabOrder.find({ hospitalId, status: { $in: ['Confirmed', 'In Progress'] }, ...(priority ? { priority } : {}) })
                .sort({ createdAt: -1 })
                .limit(50)
                .lean(),
            LabLocation.find({ hospitalId, isActive: true }).sort({ isProcessingLab: -1, createdAt: 1 }).select('locationName locationCode isProcessingLab instruments').lean(),
            LabSample.countDocuments({ hospitalId, status: 'PROCESSING' }),
            LabSample.countDocuments({
                hospitalId,
                status: { $in: ['DISPATCHED', 'IN_TRANSIT', 'ACCESSION_PENDING', 'COLLECTED', 'RECEIVED_AT_PROCESSING_LAB', 'ACCEPTED'] }
            })
        ]);

        // Derive unbarcoded awaiting-collection placeholders for the "All Tubes" view (shown honestly as Awaiting Collection)
        const existingKeySet = new Set(
            allPhysicalSamples.map((s) => `${String(s.orderId)}_${String(s.specimenPlaceholderId)}`)
        );
        const pendingOrderTubes = [];
        (activeOrders || []).forEach((ord) => {
            if (searchRegex) {
                const matchesOrd = (
                    searchRegex.test(ord.orderNumber || '') ||
                    searchRegex.test(ord.patientSnapshot?.name || '') ||
                    searchRegex.test(ord.patientSnapshot?.mrn || '') ||
                    searchRegex.test(ord.patientSnapshot?.uhid || '')
                );
                if (!matchesOrd) return;
            }
            (ord.samplePlaceholders || []).forEach((ph, idx) => {
                const k1 = `${String(ord._id)}_${String(ph.samplePlaceholderId)}`;
                const k2 = `${String(ord._id)}_${String(ph._id)}`;
                if (ph.status === 'Pending Collection' && !existingKeySet.has(k1) && !existingKeySet.has(k2)) {
                    pendingOrderTubes.push({
                        _id: `ph_${ord._id}_${ph.samplePlaceholderId || idx}`,
                        isPlaceholderOnly: true,
                        barcode: null,
                        orderId: ord._id,
                        orderNumber: ord.orderNumber,
                        patientSnapshot: ord.patientSnapshot,
                        specimenType: ph.specimenType,
                        containerType: ph.containerType,
                        requiredVolume: ph.requiredVolume,
                        tests: (ph.testNames || []).map((tn, tIdx) => ({
                            testName: tn,
                            testCode: ph.testCodes?.[tIdx] || tn
                        })),
                        priority: ord.priority || 'Routine',
                        status: 'PENDING_COLLECTION',
                        createdAt: ord.createdAt
                    });
                }
            });
        });

        // Gather real configured instruments from tenant LabLocation records (never hardcoded)
        const instruments = [];
        (activeLocations || []).forEach((loc) => {
            (loc.instruments || []).forEach((inst) => {
                if (inst && inst.isActive !== false && inst.name) {
                    instruments.push({
                        id: String(inst._id || `${loc._id}_${inst.name}`),
                        name: inst.name,
                        instrumentCode: inst.instrumentCode || '',
                        instrumentType: inst.instrumentType || 'Laboratory Analyzer',
                        department: inst.department || '',
                        locationName: loc.locationName || '',
                        operationalStatus: inst.operationalStatus || 'UNVERIFIED',
                        availability: inst.availability || 'AVAILABLE',
                        integrationVerified: Boolean(inst.integrationVerified)
                    });
                }
            });
        });

        const instrumentsReadyCount = instruments.filter(
            (i) => (i.operationalStatus === 'OPERATIONAL' || i.operationalStatus === 'READY') && i.availability !== 'UNAVAILABLE'
        ).length;

        const allTubes = [...allPhysicalSamples, ...pendingOrderTubes];

        res.json({
            success: true,
            samples,
            inboundSamples,
            allTubes,
            instruments,
            benchMetrics: {
                activeOnAnalyzers: activeAnalyzerCount,
                awaitingIntake: awaitingIntakeCount,
                instrumentsConfigured: instruments.length,
                instrumentsReady: instrumentsReadyCount,
                activeQueueCount: inboundSamples.length + samples.length,
                allTubesCount: allTubes.length
            },
            total: samples.length
        });
    } catch (error) {
        console.error('[lab sample] processing queue error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch processing queue: ' + error.message });
    }
});

/**
 * POST /api/lab/samples/:id/bench-stage
 * Server-validated Phase 6 Bench Stage & Analyzer Status Transition API.
 * Strictly enforces valid stage transitions without bypassing accessioning or acceptance.
 */
router.post(['/samples/:id/bench-stage', '/:id/bench-stage'], verifyToken, verifySampleAccess, verifyBenchWriteAccess, async (req, res) => {
    try {
        const { id } = req.params;
        const {
            targetStage,
            analyzerReference = '',
            sampleCondition = 'Normal',
            holdReason = '',
            notes = ''
        } = req.body || {};
        const hospitalId = req.hospitalId;

        if (!targetStage) {
            return res.status(400).json({ success: false, message: 'Target bench stage is required' });
        }

        const sample = await LabSample.findOne({ _id: id, hospitalId });
        if (!sample) {
            return res.status(404).json({ success: false, message: 'Sample not found in this hospital laboratory' });
        }

        const current = sample.status;
        const allowedTransitions = {
            COLLECTED: ['RECEIVED_AT_PROCESSING_LAB', 'ACCEPTED'],
            DISPATCHED: ['RECEIVED_AT_PROCESSING_LAB', 'ACCEPTED'],
            IN_TRANSIT: ['RECEIVED_AT_PROCESSING_LAB', 'ACCEPTED'],
            ACCESSION_PENDING: ['RECEIVED_AT_PROCESSING_LAB', 'ACCEPTED'],
            RECEIVED_AT_PROCESSING_LAB: ['ACCEPTED'],
            ACCEPTED: ['PROCESSING', 'ON_HOLD'],
            PROCESSING_PENDING: ['PROCESSING', 'ON_HOLD'],
            PROCESSING: ['PROCESSING_COMPLETED', 'ON_HOLD'],
            ON_HOLD: sample.processing?.startedAt ? ['PROCESSING', 'PROCESSING_COMPLETED'] : ['PROCESSING']
        };

        const validNext = allowedTransitions[current] || [];
        if (!validNext.includes(targetStage)) {
            return res.status(400).json({
                success: false,
                message: `Invalid bench stage transition from "${current}" to "${targetStage}". Follow standard specimen receipt, acceptance, and analyzer run stages.`
            });
        }

        // Validate analyzer reference if provided
        const cleanAnalyzerRef = String(analyzerReference || '').trim();

        const prevStatus = sample.status;
        sample.status = targetStage;

        if (targetStage === 'RECEIVED_AT_PROCESSING_LAB') {
            if (sample.processingLocationId) sample.currentLocationId = sample.processingLocationId;
            await LabSampleTransfer.updateMany(
                { hospitalId, status: 'DISPATCHED', 'samples.sampleId': sample._id, 'samples.1': { $exists: false } },
                {
                    $set: {
                        status: 'RECEIVED',
                        receivedBy: req.user._id,
                        receivedByName: req.user.name || 'Lab Technician',
                        receivedAt: new Date()
                    }
                }
            ).catch(() => {});
        } else if (targetStage === 'ACCEPTED') {
            sample.sampleCondition = sampleCondition || 'Normal';
            sample.accessionNotes = notes || sample.accessionNotes || 'Verified & accepted at Technical Bench';
            sample.accessionedBy = req.user._id;
            sample.accessionedByName = req.user.name || 'Lab Technician';
            sample.accessionedAt = new Date();
            if (sample.processingLocationId) sample.currentLocationId = sample.processingLocationId;
            await LabSampleTransfer.updateMany(
                { hospitalId, status: 'DISPATCHED', 'samples.sampleId': sample._id, 'samples.1': { $exists: false } },
                {
                    $set: {
                        status: 'RECEIVED',
                        receivedBy: req.user._id,
                        receivedByName: req.user.name || 'Lab Technician',
                        receivedAt: new Date()
                    }
                }
            ).catch(() => {});
        } else if (targetStage === 'PROCESSING') {
            if (!sample.processing.startedAt) {
                sample.processing.startedAt = new Date();
                sample.processing.startedBy = req.user._id;
            }
            sample.processing.analyzerReference = cleanAnalyzerRef || sample.processing.analyzerReference || 'Manual Bench Workstation';
            if (notes) sample.processing.notes = notes;
            await LabOrder.updateOne({ _id: sample.orderId, hospitalId }, { $set: { status: 'In Progress' } }).catch(() => {});
        } else if (targetStage === 'ON_HOLD') {
            if (cleanAnalyzerRef) sample.processing.analyzerReference = cleanAnalyzerRef;
            sample.processing.holdReason = String(holdReason || notes || 'Analyzer run placed on hold').trim();
        } else if (targetStage === 'PROCESSING_COMPLETED') {
            if (cleanAnalyzerRef) sample.processing.analyzerReference = cleanAnalyzerRef;
            sample.processing.completedAt = new Date();
            sample.processing.completedBy = req.user._id;
            if (notes) {
                sample.processing.notes = sample.processing.notes
                    ? `${sample.processing.notes} | ${notes}`
                    : notes;
            }
            await LabOrder.updateOne({ _id: sample.orderId, hospitalId }, { $set: { status: 'In Progress' } }).catch(() => {});
        }

        await sample.save();

        await logSampleHistory({
            hospitalId,
            sampleId: sample._id,
            barcode: sample.barcode,
            previousStatus: prevStatus,
            newStatus: targetStage,
            action: `BENCH_STAGE_${targetStage}`,
            user: req.user,
            locationId: sample.currentLocationId,
            details: {
                analyzerReference: sample.processing?.analyzerReference || '',
                sampleCondition: sample.sampleCondition,
                holdReason: targetStage === 'ON_HOLD' ? sample.processing?.holdReason : undefined,
                notes
            }
        });

        res.json({
            success: true,
            message: `Sample ${sample.barcode} updated to ${targetStage.replace(/_/g, ' ')}`,
            sample
        });
    } catch (error) {
        console.error('[lab sample] bench stage update error:', error);
        res.status(500).json({ success: false, message: 'Failed to update analyzer status: ' + error.message });
    }
});

/**
 * POST /api/lab/samples/:id/processing/start
 * Mark sample processing started on analyzer / bench.
 */
router.post(['/samples/:id/processing/start', '/:id/processing/start'], verifyToken, verifySampleAccess, verifyBenchWriteAccess, async (req, res) => {
    try {
        const { id } = req.params;
        const { analyzerReference = 'Automated Analyzer', notes = '' } = req.body;
        const hospitalId = req.hospitalId;

        const sample = await LabSample.findOne({ _id: id, hospitalId });
        if (!sample) {
            return res.status(404).json({ success: false, message: 'Sample not found' });
        }

        const validTransitions = ['ACCEPTED', 'PROCESSING_PENDING', 'ON_HOLD'];
        if (!validTransitions.includes(sample.status)) {
            return res.status(400).json({
                success: false,
                message: `Cannot start processing from status "${sample.status}". Sample must be ACCEPTED first.`
            });
        }

        const prevStatus = sample.status;
        sample.status = 'PROCESSING';
        sample.processing.startedAt = new Date();
        sample.processing.startedBy = req.user._id;
        sample.processing.analyzerReference = analyzerReference;
        sample.processing.notes = notes;

        await sample.save();

        await logSampleHistory({
            hospitalId,
            sampleId: sample._id,
            barcode: sample.barcode,
            previousStatus: prevStatus,
            newStatus: 'PROCESSING',
            action: 'PROCESSING_STARTED',
            user: req.user,
            details: { analyzerReference, notes }
        });

        res.json({
            success: true,
            message: 'Sample testing started on bench',
            sample
        });
    } catch (error) {
        console.error('[lab sample] start processing error:', error);
        res.status(500).json({ success: false, message: 'Failed to start processing: ' + error.message });
    }
});

/**
 * POST /api/lab/samples/:id/processing/complete
 * Technical run finished on bench (moves to Phase 7 result verification).
 */
router.post(['/samples/:id/processing/complete', '/:id/processing/complete'], verifyToken, verifySampleAccess, verifyBenchWriteAccess, async (req, res) => {
    try {
        const { id } = req.params;
        const { notes = '' } = req.body;
        const hospitalId = req.hospitalId;

        const sample = await LabSample.findOne({ _id: id, hospitalId });
        if (!sample) {
            return res.status(404).json({ success: false, message: 'Sample not found' });
        }

        if (sample.status !== 'PROCESSING') {
            return res.status(400).json({
                success: false,
                message: `Sample status is "${sample.status}". Processing must be in PROGRESS before completing.`
            });
        }

        const prevStatus = sample.status;
        sample.status = 'PROCESSING_COMPLETED';
        sample.processing.completedAt = new Date();
        sample.processing.completedBy = req.user._id;
        if (notes) sample.processing.notes += ` | ${notes}`;

        await sample.save();

        // Update overall LabOrder status to In Progress
        await LabOrder.updateOne({ _id: sample.orderId }, { $set: { status: 'In Progress' } });

        await logSampleHistory({
            hospitalId,
            sampleId: sample._id,
            barcode: sample.barcode,
            previousStatus: prevStatus,
            newStatus: 'PROCESSING_COMPLETED',
            action: 'PROCESSING_COMPLETED',
            user: req.user,
            details: { notes }
        });

        res.json({
            success: true,
            message: 'Sample processing completed on technical bench',
            sample
        });
    } catch (error) {
        console.error('[lab sample] complete processing error:', error);
        res.status(500).json({ success: false, message: 'Failed to complete processing: ' + error.message });
    }
});

/**
 * POST /api/lab/samples/:id/processing/hold
 * Put sample on hold due to analyzer maintenance or calibration.
 */
router.post(['/samples/:id/processing/hold', '/:id/processing/hold'], verifyToken, verifySampleAccess, verifyBenchWriteAccess, async (req, res) => {
    try {
        const { id } = req.params;
        const { holdReason = 'Analyzer maintenance / recalibration' } = req.body;
        const hospitalId = req.hospitalId;

        const sample = await LabSample.findOne({ _id: id, hospitalId });
        if (!sample) {
            return res.status(404).json({ success: false, message: 'Sample not found' });
        }

        const prevStatus = sample.status;
        sample.status = 'ON_HOLD';
        sample.processing.holdReason = holdReason;
        await sample.save();

        await logSampleHistory({
            hospitalId,
            sampleId: sample._id,
            barcode: sample.barcode,
            previousStatus: prevStatus,
            newStatus: 'ON_HOLD',
            action: 'PROCESSING_ON_HOLD',
            user: req.user,
            details: { holdReason }
        });

        res.json({
            success: true,
            message: 'Sample placed on hold',
            sample
        });
    } catch (error) {
        console.error('[lab sample] hold sample error:', error);
        res.status(500).json({ success: false, message: 'Failed to hold sample: ' + error.message });
    }
});

// =========================================================================
// 6. MULTI-LOCATION SAMPLE TRANSFERS APIS
// =========================================================================

/**
 * POST /api/lab/samples/transfers
 * Dispatch batch of samples from collection centre to central processing lab.
 */
router.post('/transfers', verifyToken, verifySampleAccess, async (req, res) => {
    try {
        const { sourceLocationId, destinationLocationId, sampleIds = [], courierName = '', transportReference = '', notes = '' } = req.body;
        const hospitalId = req.hospitalId;

        if (!sourceLocationId || !destinationLocationId || !Array.isArray(sampleIds) || sampleIds.length === 0) {
            return res.status(400).json({ success: false, message: 'Source location, destination location, and sample list are required' });
        }

        const [srcLoc, destLoc] = await Promise.all([
            LabLocation.findOne({ _id: sourceLocationId, hospitalId }),
            LabLocation.findOne({ _id: destinationLocationId, hospitalId, isActive: true })
        ]);

        if (!srcLoc || !destLoc) {
            return res.status(400).json({ success: false, message: 'Invalid or inactive laboratory location specified' });
        }

        const samples = await LabSample.find({ _id: { $in: sampleIds }, hospitalId });
        if (samples.length === 0) {
            return res.status(400).json({ success: false, message: 'No valid samples found for transfer' });
        }

        const hospital = await Hospital.findById(hospitalId);
        const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const transferNumber = await generateAtomicTransferNumber(hospitalId, hospital, todayStr);

        const sampleManifest = [];
        for (const s of samples) {
            const prev = s.status;
            s.status = 'DISPATCHED';
            s.processingLocationId = destLoc._id;
            await s.save();

            sampleManifest.push({
                sampleId: s._id,
                barcode: s.barcode,
                specimenType: s.specimenType,
                containerType: s.containerType,
                patientName: s.patientSnapshot?.name || '',
                testNames: (s.tests || []).map(t => t.testName)
            });

            await logSampleHistory({
                hospitalId,
                sampleId: s._id,
                barcode: s.barcode,
                previousStatus: prev,
                newStatus: 'DISPATCHED',
                action: 'SAMPLE_DISPATCHED',
                user: req.user,
                locationId: srcLoc._id,
                details: { transferNumber, destination: destLoc.locationName }
            });
        }

        const transfer = new LabSampleTransfer({
            hospitalId,
            transferNumber,
            sourceLocationId: srcLoc._id,
            sourceLocationName: srcLoc.locationName,
            destinationLocationId: destLoc._id,
            destinationLocationName: destLoc.locationName,
            samples: sampleManifest,
            status: 'DISPATCHED',
            courierName,
            transportReference,
            dispatchedBy: req.user._id,
            dispatchedByName: req.user.name || 'Dispatcher',
            dispatchedAt: new Date(),
            notes
        });

        await transfer.save();

        res.status(201).json({
            success: true,
            message: `Sample transfer ${transferNumber} created and dispatched`,
            transfer
        });
    } catch (error) {
        console.error('[lab sample] create transfer error:', error);
        res.status(500).json({ success: false, message: 'Failed to create transfer: ' + error.message });
    }
});

/**
 * GET /api/lab/samples/transfers
 * List multi-location transfers.
 */
router.get('/transfers', verifyToken, verifySampleAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId;
        const { status = '' } = req.query;

        const query = { hospitalId };
        if (status) query.status = status;

        const transfers = await LabSampleTransfer.find(query).sort({ createdAt: -1 }).limit(100).lean();

        res.json({
            success: true,
            transfers,
            total: transfers.length
        });
    } catch (error) {
        console.error('[lab sample] get transfers error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch transfers: ' + error.message });
    }
});

/**
 * POST /api/lab/samples/transfers/:id/receive
 * Check-in and receive transferred samples at central processing laboratory.
 */
router.post(['/transfers/:id/receive', '/:id/receive'], verifyToken, verifySampleAccess, async (req, res) => {
    try {
        const { id } = req.params;
        const hospitalId = req.hospitalId;

        const transfer = await LabSampleTransfer.findOne({ _id: id, hospitalId });
        if (!transfer) {
            return res.status(404).json({ success: false, message: 'Transfer record not found' });
        }

        if (transfer.status === 'RECEIVED') {
            return res.status(400).json({ success: false, message: 'Transfer batch has already been received' });
        }

        transfer.status = 'RECEIVED';
        transfer.receivedBy = req.user._id;
        transfer.receivedByName = req.user.name || 'Lab Receiving Officer';
        transfer.receivedAt = new Date();
        await transfer.save();

        // Update all samples in manifest
        const sampleIds = (transfer.samples || []).map(s => s.sampleId);
        const samples = await LabSample.find({ _id: { $in: sampleIds }, hospitalId });

        for (const s of samples) {
            const prev = s.status;
            s.status = 'RECEIVED_AT_PROCESSING_LAB';
            s.currentLocationId = transfer.destinationLocationId;
            await s.save();

            await logSampleHistory({
                hospitalId,
                sampleId: s._id,
                barcode: s.barcode,
                previousStatus: prev,
                newStatus: 'RECEIVED_AT_PROCESSING_LAB',
                action: 'SAMPLE_RECEIVED_AT_LAB',
                user: req.user,
                locationId: transfer.destinationLocationId,
                details: { transferNumber: transfer.transferNumber }
            });
        }

        res.json({
            success: true,
            message: `Transfer ${transfer.transferNumber} received successfully at processing laboratory`,
            transfer
        });
    } catch (error) {
        console.error('[lab sample] receive transfer error:', error);
        res.status(500).json({ success: false, message: 'Failed to receive transfer: ' + error.message });
    }
});

// =========================================================================
// 7. SAMPLE DASHBOARD & TIMELINE APIS
// =========================================================================

/**
 * GET /api/lab/samples/dashboard
 * Aggregated live sample metrics across technical workstations.
 */
router.get('/dashboard', verifyToken, verifySampleAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId;

        const counts = await LabSample.aggregate([
            { $match: { hospitalId: new mongoose.Types.ObjectId(hospitalId) } },
            { $group: { _id: '$status', count: { $sum: 1 } } }
        ]);

        const stats = {
            pendingCollection: 0,
            barcodeGenerated: 0,
            collected: 0,
            accessionPending: 0,
            accepted: 0,
            rejected: 0,
            recollectionRequested: 0,
            dispatched: 0,
            receivedAtLab: 0,
            processing: 0,
            processingCompleted: 0,
            onHold: 0,
            totalSamples: 0
        };

        counts.forEach(c => {
            stats.totalSamples += c.count;
            if (c._id === 'PENDING_COLLECTION') stats.pendingCollection = c.count;
            else if (c._id === 'BARCODE_GENERATED') stats.barcodeGenerated = c.count;
            else if (c._id === 'COLLECTED') stats.collected = c.count;
            else if (c._id === 'ACCEPTED') stats.accepted = c.count;
            else if (c._id === 'REJECTED') stats.rejected = c.count;
            else if (c._id === 'RECOLLECTION_REQUESTED' || c._id === 'RECOLLECTION_PENDING') stats.recollectionRequested += c.count;
            else if (c._id === 'DISPATCHED' || c._id === 'IN_TRANSIT') stats.dispatched += c.count;
            else if (c._id === 'RECEIVED_AT_PROCESSING_LAB') stats.receivedAtLab = c.count;
            else if (c._id === 'PROCESSING') stats.processing = c.count;
            else if (c._id === 'PROCESSING_COMPLETED') stats.processingCompleted = c.count;
            else if (c._id === 'ON_HOLD') stats.onHold = c.count;
        });

        // Also add pending placeholders from orders
        const pendingOrders = await LabOrder.countDocuments({ hospitalId, status: 'Confirmed' });

        res.json({
            success: true,
            stats: {
                ...stats,
                pendingOrderRequisitions: pendingOrders
            }
        });
    } catch (error) {
        console.error('[lab sample] dashboard stats error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch sample metrics: ' + error.message });
    }
});

/**
 * GET /api/lab/samples/:id/timeline
 * Complete chronological timeline for a specific sample.
 */
router.get(['/samples/:id/timeline', '/:id/timeline', '/samples/:id', '/:id'], verifyToken, verifySampleAccess, async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid sample ID format' });
        }
        const hospitalId = req.hospitalId;

        const sample = await LabSample.findOne({ _id: id, hospitalId }).lean();
        if (!sample) {
            return res.status(404).json({ success: false, message: 'Sample not found' });
        }

        const history = await LabSampleHistory.find({ hospitalId, sampleId: id })
            .sort({ timestamp: 1 })
            .lean();

        res.json({
            success: true,
            sample,
            history
        });
    } catch (error) {
        console.error('[lab sample] get timeline error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch timeline: ' + error.message });
    }
});

module.exports = router;
