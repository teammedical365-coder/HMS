const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const multer = require('multer');
const { verifyToken } = require('../middleware/auth.middleware');
const { resolveTenant } = require('../middleware/tenantMiddleware');
const validateFileType = require('../utils/validateFileType');
const { sanitizeFilename } = validateFileType;
const imagekit = require('../utils/imagekit');
const MasterUser = require('../models/user.model');
const PatientInsurancePolicy = require('../models/patientInsurancePolicy.model');

const CARD_ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

const cardUpload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB max
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype && (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf')) {
            cb(null, true);
        } else {
            cb(new Error('Only image (JPG, PNG, WEBP) or PDF health card documents are allowed.'), false);
        }
    }
});

const STAFF_READ_ROLES = new Set([
    'reception', 'receptionist', 'frontdesk',
    'admin', 'hospitaladmin', 'superadmin', 'centraladmin',
    'doctor', 'nurse', 'accountant', 'billing', 'lab', 'pharmacist', 'pharmacy'
]);

const STAFF_WRITE_ROLES = new Set([
    'reception', 'receptionist', 'frontdesk',
    'admin', 'hospitaladmin', 'superadmin', 'centraladmin',
    'doctor', 'nurse', 'accountant', 'billing'
]);

const VERIFY_AUTHORIZED_ROLES = new Set([
    'admin', 'hospitaladmin', 'superadmin', 'centraladmin', 'accountant', 'billing'
]);

function getEffectiveRole(user) {
    const baseRole = typeof user?.role === 'string' ? user.role.toLowerCase().trim() : '';
    const dynRole = typeof user?._roleData?.name === 'string' ? user._roleData.name.toLowerCase().trim() : '';
    const permissions = Array.isArray(user?._roleData?.permissions) ? user._roleData.permissions : [];
    return { baseRole, dynRole, permissions };
}

function canReadPolicies(user, patientId) {
    const { baseRole, dynRole, permissions } = getEffectiveRole(user);
    if (STAFF_READ_ROLES.has(baseRole) || STAFF_READ_ROLES.has(dynRole)) return true;
    if (permissions.includes('*') || permissions.includes('reception_access') || permissions.includes('billing_access')) return true;
    if (baseRole === 'patient') {
        const callerId = String(user.patientId || user._id || '');
        return callerId && String(patientId) === callerId;
    }
    return false;
}

function canWritePolicies(user) {
    const { baseRole, dynRole, permissions } = getEffectiveRole(user);
    if (STAFF_WRITE_ROLES.has(baseRole) || STAFF_WRITE_ROLES.has(dynRole)) return true;
    if (permissions.includes('*') || permissions.includes('reception_access') || permissions.includes('billing_access')) return true;
    return false;
}

function canVerifyPolicies(user) {
    const { baseRole, dynRole, permissions } = getEffectiveRole(user);
    if (VERIFY_AUTHORIZED_ROLES.has(baseRole) || VERIFY_AUTHORIZED_ROLES.has(dynRole)) return true;
    if (permissions.includes('*') || permissions.includes('verify_insurance') || permissions.includes('billing_access')) return true;
    return false;
}

function resolveHospitalScope(req) {
    const tenantId = req.hospitalId || req.user?.hospitalId || null;
    return tenantId ? String(tenantId) : null;
}

function parseOptionalDate(val) {
    if (!val || val === '') return null;
    const d = new Date(val);
    return Number.isNaN(d.getTime()) ? 'INVALID' : d;
}

function sanitizeCardDocument(raw) {
    if (!raw || typeof raw !== 'object' || !raw.url) return null;
    return {
        url: String(raw.url).trim(),
        fileName: raw.fileName ? String(raw.fileName).trim() : '',
        originalName: raw.originalName ? String(raw.originalName).trim() : '',
        fileId: raw.fileId ? String(raw.fileId).trim() : '',
        mimeType: raw.mimeType ? String(raw.mimeType).trim() : '',
        size: Number(raw.size) || 0,
        uploadedAt: raw.uploadedAt ? new Date(raw.uploadedAt) : new Date(),
        uploadedBy: raw.uploadedBy || null
    };
}

function hasAnyMeaningfulPolicyData(payload = {}) {
    return Boolean(
        (payload.providerName && String(payload.providerName).trim()) ||
        (payload.policyNumber && String(payload.policyNumber).trim()) ||
        (payload.tpaOrMemberId && String(payload.tpaOrMemberId).trim()) ||
        (payload.policyHolderName && String(payload.policyHolderName).trim()) ||
        (payload.notes && String(payload.notes).trim()) ||
        (payload.cardDocument && payload.cardDocument.url)
    );
}

/**
 * Shared helper used by policy routes, registration, and appointment booking.
 * Never marks a policy Verified automatically; supports duplicate prevention.
 */
async function upsertPatientPolicy({ hospitalId, patientId, policyPayload, actorId }) {
    if (!hospitalId || !patientId || !policyPayload) {
        return { policy: null, skipped: true };
    }

    if (!hasAnyMeaningfulPolicyData(policyPayload)) {
        return { policy: null, skipped: true };
    }

    const policyType = PatientInsurancePolicy.POLICY_TYPES.includes(policyPayload.policyType)
        ? policyPayload.policyType
        : 'Private Health Insurance';

    const providerName = policyPayload.providerName ? String(policyPayload.providerName).trim() : '';
    const policyNumber = policyPayload.policyNumber ? String(policyPayload.policyNumber).trim() : '';
    const tpaOrMemberId = policyPayload.tpaOrMemberId ? String(policyPayload.tpaOrMemberId).trim() : '';
    const policyHolderName = policyPayload.policyHolderName ? String(policyPayload.policyHolderName).trim() : '';
    const relationshipWithPatient = policyPayload.relationshipWithPatient
        ? String(policyPayload.relationshipWithPatient).trim()
        : 'Self';
    const notes = policyPayload.notes ? String(policyPayload.notes).trim() : '';

    const validFrom = parseOptionalDate(policyPayload.validFrom);
    const validUntil = parseOptionalDate(policyPayload.validUntil);
    if (validFrom === 'INVALID' || validUntil === 'INVALID') {
        const err = new Error('Invalid policy validity date format.');
        err.statusCode = 400;
        throw err;
    }
    if (validFrom && validUntil && validUntil < validFrom) {
        const err = new Error('Policy Valid Until date cannot be earlier than Policy Valid From date.');
        err.statusCode = 400;
        throw err;
    }

    const normalizedPolicyNumber = PatientInsurancePolicy.normalizeIdentifier(policyNumber);
    const normalizedProvider = PatientInsurancePolicy.normalizeIdentifier(providerName);
    const normalizedMemberId = PatientInsurancePolicy.normalizeIdentifier(tpaOrMemberId);

    // Prevent duplicate policy creation across repeated booking/registration edits
    let existing = null;
    if (policyPayload._id && mongoose.Types.ObjectId.isValid(policyPayload._id)) {
        existing = await PatientInsurancePolicy.findOne({
            _id: policyPayload._id,
            hospitalId,
            patientId,
            isActive: true
        });
    }

    if (!existing && policyPayload.policyId && mongoose.Types.ObjectId.isValid(policyPayload.policyId)) {
        existing = await PatientInsurancePolicy.findOne({
            _id: policyPayload.policyId,
            hospitalId,
            patientId,
            isActive: true
        });
    }

    if (!existing && normalizedPolicyNumber) {
        const dedupQuery = {
            hospitalId,
            patientId,
            isActive: true,
            policyType,
            normalizedPolicyNumber
        };
        if (normalizedProvider) {
            dedupQuery.$or = [
                { normalizedProvider },
                { normalizedProvider: '' }
            ];
        }
        existing = await PatientInsurancePolicy.findOne(dedupQuery);
    }

    if (!existing && !normalizedPolicyNumber && normalizedMemberId) {
        existing = await PatientInsurancePolicy.findOne({
            hospitalId,
            patientId,
            isActive: true,
            policyType,
            normalizedProvider,
            normalizedMemberId
        });
    }

    const nextCardDoc = policyPayload.cardDocument !== undefined
        ? sanitizeCardDocument({ ...policyPayload.cardDocument, uploadedBy: actorId || null })
        : undefined;

    if (existing) {
        const identityChanged =
            existing.policyType !== policyType ||
            existing.normalizedProvider !== normalizedProvider ||
            existing.normalizedPolicyNumber !== normalizedPolicyNumber ||
            existing.normalizedMemberId !== normalizedMemberId;

        existing.policyType = policyType;
        existing.providerName = providerName;
        existing.policyNumber = policyNumber;
        existing.tpaOrMemberId = tpaOrMemberId;
        existing.policyHolderName = policyHolderName;
        existing.relationshipWithPatient = relationshipWithPatient;
        existing.validFrom = validFrom;
        existing.validUntil = validUntil;
        existing.notes = notes;
        if (nextCardDoc !== undefined) {
            existing.cardDocument = nextCardDoc;
        }
        if (typeof policyPayload.isPrimary === 'boolean') {
            existing.isPrimary = policyPayload.isPrimary;
        }
        // Never preserve Verified if core identifiers changed via registration/booking edit
        if (identityChanged && existing.verificationStatus === 'Verified') {
            existing.verificationStatus = 'Pending Verification';
            existing.verifiedBy = null;
            existing.verifiedByName = '';
            existing.verifiedAt = null;
        }
        existing.updatedBy = actorId || null;
        await existing.save();
        return { policy: existing, deduplicated: true, updated: true };
    }

    const existingCount = await PatientInsurancePolicy.countDocuments({
        hospitalId,
        patientId,
        isActive: true
    });

    const created = new PatientInsurancePolicy({
        hospitalId,
        patientId,
        policyType,
        providerName,
        policyNumber,
        tpaOrMemberId,
        policyHolderName,
        relationshipWithPatient,
        validFrom,
        validUntil,
        cardDocument: nextCardDoc || null,
        notes,
        // Always starts unverified unless explicitly checked later by authorized verifier
        verificationStatus: policyPayload.verificationStatus === 'Pending Verification'
            ? 'Pending Verification'
            : 'Not Verified',
        isPrimary: typeof policyPayload.isPrimary === 'boolean' ? policyPayload.isPrimary : existingCount === 0,
        createdBy: actorId || null,
        updatedBy: actorId || null
    });

    await created.save();
    return { policy: created, deduplicated: false, updated: false };
}

router.use(verifyToken);
router.use(resolveTenant);

// 1. POST /api/patient-policies/upload-card — Upload Insurance / Health Card Document (Image or PDF <= 10MB)
router.post('/upload-card', (req, res, next) => {
    cardUpload.single('file')(req, res, (err) => {
        if (err) {
            return res.status(400).json({ success: false, message: err.message || 'File upload failed.' });
        }
        next();
    });
}, async (req, res) => {
    try {
        if (!canWritePolicies(req.user)) {
            return res.status(403).json({ success: false, message: 'Access denied: Insufficient permissions to upload health card documents.' });
        }

        const file = req.file;
        if (!file) {
            return res.status(400).json({ success: false, message: 'No file selected for upload.' });
        }

        const typeError = await validateFileType(file, CARD_ALLOWED_MIMES);
        if (typeError) {
            return res.status(400).json({ success: false, message: typeError });
        }

        const safeName = sanitizeFilename(file.originalname || 'health_card');
        const uniqueFileName = `policy_card_${Date.now()}_${safeName}`;
        const result = await imagekit.upload({
            file: file.buffer,
            fileName: uniqueFileName,
            folder: '/patient-policies',
            tags: ['patient_insurance_card', file.mimetype]
        });

        const storedFileName = result.name || uniqueFileName;
        const document = {
            url: result.url,
            fileName: storedFileName,
            originalName: file.originalname || safeName,
            fileId: result.fileId || '',
            mimeType: file.mimetype,
            size: file.size || file.buffer.length,
            uploadedAt: new Date(),
            uploadedBy: req.user._id
        };

        res.json({ success: true, document });
    } catch (err) {
        console.error('Error uploading insurance card:', err);
        res.status(500).json({ success: false, message: 'Failed to upload insurance / health card document.' });
    }
});

// 2. GET /api/patient-policies/patient/:patientId — List active policies for a patient in current hospital tenant
router.get('/patient/:patientId', async (req, res) => {
    try {
        const { patientId } = req.params;
        if (!mongoose.Types.ObjectId.isValid(patientId)) {
            return res.status(400).json({ success: false, message: 'Invalid patient ID.' });
        }

        if (!canReadPolicies(req.user, patientId)) {
            return res.status(403).json({ success: false, message: 'Access denied.' });
        }

        const hospitalId = resolveHospitalScope(req);
        if (!hospitalId) {
            return res.status(400).json({ success: false, message: 'Hospital tenant scope is required.' });
        }

        const patient = await MasterUser.findOne({ _id: patientId, hospitalId })
            .select('_id hospitalId name mrn patientId')
            .lean();
        if (!patient) {
            return res.status(404).json({ success: false, message: 'Patient not found in this hospital.' });
        }

        const policies = await PatientInsurancePolicy.find({
            hospitalId,
            patientId,
            isActive: true
        }).sort({ isPrimary: -1, updatedAt: -1, createdAt: -1 }).lean();

        res.json({ success: true, policies });
    } catch (err) {
        console.error('Error fetching patient policies:', err);
        res.status(500).json({ success: false, message: 'Failed to load patient insurance policies.' });
    }
});

// 3. POST /api/patient-policies/patient/:patientId — Create or deduplicate-update a patient policy
router.post('/patient/:patientId', async (req, res) => {
    try {
        const { patientId } = req.params;
        if (!mongoose.Types.ObjectId.isValid(patientId)) {
            return res.status(400).json({ success: false, message: 'Invalid patient ID.' });
        }

        if (!canWritePolicies(req.user)) {
            return res.status(403).json({ success: false, message: 'Access denied: Insufficient permissions to manage policies.' });
        }

        const hospitalId = resolveHospitalScope(req);
        if (!hospitalId) {
            return res.status(400).json({ success: false, message: 'Hospital tenant scope is required.' });
        }

        const patient = await MasterUser.findOne({ _id: patientId, hospitalId })
            .select('_id hospitalId')
            .lean();
        if (!patient) {
            return res.status(404).json({ success: false, message: 'Patient not found in this hospital.' });
        }

        if (!hasAnyMeaningfulPolicyData(req.body)) {
            return res.status(400).json({ success: false, message: 'Please provide at least a provider/scheme name, policy number, member ID, or health card document.' });
        }

        const result = await upsertPatientPolicy({
            hospitalId,
            patientId,
            policyPayload: req.body,
            actorId: req.user._id
        });

        res.status(result.updated ? 200 : 201).json({
            success: true,
            policy: result.policy,
            deduplicated: Boolean(result.deduplicated)
        });
    } catch (err) {
        if (err.statusCode === 400) {
            return res.status(400).json({ success: false, message: err.message });
        }
        console.error('Error saving patient policy:', err);
        res.status(500).json({ success: false, message: 'Failed to save patient policy.' });
    }
});

// 4. PUT /api/patient-policies/:policyId — Update existing policy cleanly
router.put('/:policyId', async (req, res) => {
    try {
        const { policyId } = req.params;
        if (!mongoose.Types.ObjectId.isValid(policyId)) {
            return res.status(400).json({ success: false, message: 'Invalid policy ID.' });
        }

        if (!canWritePolicies(req.user)) {
            return res.status(403).json({ success: false, message: 'Access denied.' });
        }

        const hospitalId = resolveHospitalScope(req);
        if (!hospitalId) {
            return res.status(400).json({ success: false, message: 'Hospital tenant scope is required.' });
        }

        const existing = await PatientInsurancePolicy.findOne({
            _id: policyId,
            hospitalId,
            isActive: true
        });
        if (!existing) {
            return res.status(404).json({ success: false, message: 'Policy record not found in this hospital.' });
        }

        const result = await upsertPatientPolicy({
            hospitalId,
            patientId: existing.patientId,
            policyPayload: { ...req.body, _id: existing._id },
            actorId: req.user._id
        });

        res.json({ success: true, policy: result.policy });
    } catch (err) {
        if (err.statusCode === 400) {
            return res.status(400).json({ success: false, message: err.message });
        }
        console.error('Error updating patient policy:', err);
        res.status(500).json({ success: false, message: 'Failed to update patient policy.' });
    }
});

// 5. PATCH /api/patient-policies/:policyId/verify — Authorized manual verification status update
router.patch('/:policyId/verify', async (req, res) => {
    try {
        const { policyId } = req.params;
        if (!mongoose.Types.ObjectId.isValid(policyId)) {
            return res.status(400).json({ success: false, message: 'Invalid policy ID.' });
        }

        const hospitalId = resolveHospitalScope(req);
        if (!hospitalId) {
            return res.status(400).json({ success: false, message: 'Hospital tenant scope is required.' });
        }

        const { verificationStatus, verificationNotes } = req.body || {};
        if (!PatientInsurancePolicy.VERIFICATION_STATUSES.includes(verificationStatus)) {
            return res.status(400).json({
                success: false,
                message: `Invalid verification status. Allowed values: ${PatientInsurancePolicy.VERIFICATION_STATUSES.join(', ')}`
            });
        }

        // Only authorized roles can mark Verified, Rejected, or Expired; staff with write access can mark Pending Verification
        const requiresVerifierPrivilege = ['Verified', 'Rejected', 'Expired'].includes(verificationStatus);
        if (requiresVerifierPrivilege && !canVerifyPolicies(req.user)) {
            return res.status(403).json({
                success: false,
                message: 'Only authorized billing, accounts, or hospital admin staff can verify, reject, or expire an insurance policy.'
            });
        }
        if (!requiresVerifierPrivilege && !canWritePolicies(req.user)) {
            return res.status(403).json({ success: false, message: 'Access denied.' });
        }

        const policy = await PatientInsurancePolicy.findOne({
            _id: policyId,
            hospitalId,
            isActive: true
        });
        if (!policy) {
            return res.status(404).json({ success: false, message: 'Policy record not found in this hospital.' });
        }

        policy.verificationStatus = verificationStatus;
        if (verificationNotes !== undefined) {
            policy.verificationNotes = String(verificationNotes).trim();
        }
        if (verificationStatus === 'Verified') {
            policy.verifiedBy = req.user._id;
            policy.verifiedByName = req.user.name || req.user.role || 'Authorized Staff';
            policy.verifiedAt = new Date();
        } else if (verificationStatus === 'Not Verified' || verificationStatus === 'Pending Verification') {
            policy.verifiedBy = null;
            policy.verifiedByName = '';
            policy.verifiedAt = null;
        } else {
            policy.verifiedBy = req.user._id;
            policy.verifiedByName = req.user.name || req.user.role || 'Authorized Staff';
            policy.verifiedAt = new Date();
        }
        policy.updatedBy = req.user._id;

        await policy.save();
        res.json({ success: true, policy });
    } catch (err) {
        console.error('Error verifying patient policy:', err);
        res.status(500).json({ success: false, message: 'Failed to update policy verification status.' });
    }
});

// 6. DELETE /api/patient-policies/:policyId — Soft delete policy inside same tenant
router.delete('/:policyId', async (req, res) => {
    try {
        const { policyId } = req.params;
        if (!mongoose.Types.ObjectId.isValid(policyId)) {
            return res.status(400).json({ success: false, message: 'Invalid policy ID.' });
        }

        if (!canWritePolicies(req.user)) {
            return res.status(403).json({ success: false, message: 'Access denied.' });
        }

        const hospitalId = resolveHospitalScope(req);
        if (!hospitalId) {
            return res.status(400).json({ success: false, message: 'Hospital tenant scope is required.' });
        }

        const policy = await PatientInsurancePolicy.findOne({
            _id: policyId,
            hospitalId,
            isActive: true
        });
        if (!policy) {
            return res.status(404).json({ success: false, message: 'Policy record not found in this hospital.' });
        }

        policy.isActive = false;
        policy.isPrimary = false;
        policy.updatedBy = req.user._id;
        await policy.save();

        res.json({ success: true, message: 'Policy removed.' });
    } catch (err) {
        console.error('Error deleting patient policy:', err);
        res.status(500).json({ success: false, message: 'Failed to remove patient policy.' });
    }
});

module.exports = router;
module.exports.upsertPatientPolicy = upsertPatientPolicy;
module.exports.hasAnyMeaningfulPolicyData = hasAnyMeaningfulPolicyData;
