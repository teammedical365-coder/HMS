const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { verifyToken } = require('../middleware/auth.middleware');
const { resolveTenant } = require('../middleware/tenantMiddleware');
const { HospitalPolicy, POLICY_CATEGORIES } = require('../models/hospitalPolicy.model');
const { PolicyAcceptance } = require('../models/policyAcceptance.model');
const Hospital = require('../models/hospital.model');
const User = require('../models/user.model');
const { getTenantModels } = require('../db/tenantModels');

// Middleware to verify Hospital Admin permissions
const verifyHospitalAdmin = (req, res, next) => {
    if (!req.user) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const role = (req.user.role || '').toLowerCase();
    const dynamicRole = (req.user._roleData?.name || '').toLowerCase();
    const allowed = ['hospitaladmin', 'admin', 'superadmin', 'centraladmin'];
    if (allowed.includes(role) || allowed.includes(dynamicRole)) {
        return next();
    }
    return res.status(403).json({ success: false, message: 'Access denied: Hospital Admin access required.' });
};

// Initial general templates for new hospitals
const DEFAULT_POLICY_TEMPLATES = [
    {
        title: 'General Hospital Policy',
        category: 'General Hospital Policy',
        content: `1. Code of Conduct: All patients, attendants, and hospital staff are expected to conduct themselves with mutual dignity, respect, and civil behavior at all times on hospital premises.
2. Admission & Identification: Valid identification and authentic contact information must be provided during admission and OPD registration.
3. Safety & Hygiene: Strict sanitation standards and safety protocols must be followed within patient wards, clinical areas, and waiting rooms. Smoking, alcohol, and prohibited substances are strictly prohibited.`,
        isMandatory: true,
        displayOrder: 1,
        applicableTo: ['ALL']
    },
    {
        title: 'Appointment & Cancellation Policy',
        category: 'Appointment & Cancellation Policy',
        content: `1. Punctuality: Patients are requested to arrive at least 15 minutes prior to their scheduled appointment or token slot.
2. Cancellations & Rescheduling: Appointments may be cancelled or rescheduled up to 2 hours in advance through the hospital portal or reception counter.
3. Token Order: In token-based consultations, emergency triage cases take medical priority over sequential token numbers.`,
        isMandatory: true,
        displayOrder: 2,
        applicableTo: ['APPOINTMENT_BOOKING']
    },
    {
        title: 'Patient Privacy Policy',
        category: 'Patient Privacy Policy',
        content: `1. Confidentiality: All medical histories, diagnostic tests, consultations, and treatment summaries are confidential medical records protected by health data regulations.
2. Access & Sharing: Medical records will only be accessible to authorized healthcare professionals involved directly in your clinical care or as mandated by statutory healthcare regulations.
3. Data Integrity: Electronic health records (EHR) are secured with encryption and auditable access logs.`,
        isMandatory: true,
        displayOrder: 3,
        applicableTo: ['PATIENT_REGISTRATION', 'APPOINTMENT_BOOKING']
    },
    {
        title: 'Consultation Policy',
        category: 'Consultation Policy',
        content: `1. Clinical Evaluation: Diagnostic and therapeutic opinions are formed based upon objective clinical assessments, patient histories, and laboratory findings.
2. Second Opinions & Referrals: The hospital supports multi-disciplinary referrals when required for patient safety and optimal treatment outcomes.
3. Prescription Safety: Medications must only be taken as specifically prescribed by the consulting physician.`,
        isMandatory: false,
        displayOrder: 4,
        applicableTo: ['APPOINTMENT_BOOKING']
    },
    {
        title: 'Refund Policy',
        category: 'Refund Policy',
        content: `1. Non-Rendered Services: Full refunds are processed for appointments or diagnostic procedures cancelled within the permitted cancellation window prior to clinical consultation or specimen collection.
2. Consultation Services: Completed consultations and administered treatments are non-refundable.
3. Processing Time: Approved refunds are credited through the original payment mode within 5 to 7 business days.`,
        isMandatory: false,
        displayOrder: 5,
        applicableTo: ['ALL']
    },
    {
        title: 'Medical Records Policy',
        category: 'Medical Records Policy',
        content: `1. Patient Access: Patients or legally appointed guardians have the right to request copies of their clinical visit notes, discharge summaries, and laboratory reports.
2. Record Retention: Hospital records are preserved in secure electronic storage according to statutory medical retention mandates.
3. Electronic Copies: Digital reports are downloadable directly through the patient portal.`,
        isMandatory: false,
        displayOrder: 6,
        applicableTo: ['PATIENT_REGISTRATION']
    },
    {
        title: 'Patient Consent',
        category: 'Patient Consent',
        content: `1. Informed Consent: By agreeing, the patient consents to routine clinical examinations, diagnostic testing, and healthcare administration deemed necessary by attending physicians.
2. Specific Procedures: Invasive surgeries, anesthesia, and specialized interventions will require additional signed consent forms prior to the procedure.
3. Right to Withdraw: Patients retain the right to ask questions or decline specific procedures after understanding the medical implications.`,
        isMandatory: true,
        displayOrder: 7,
        applicableTo: ['PATIENT_REGISTRATION', 'APPOINTMENT_BOOKING']
    },
    {
        title: 'Emergency Disclaimer',
        category: 'Emergency Disclaimer',
        content: `1. Critical Emergencies: In case of acute life-threatening emergencies, immediate triage and emergency medical interventions are prioritized over administrative registrations.
2. Ambulatory & Trauma: Emergency trauma stabilization proceeds immediately under standard medical emergency protocols.`,
        isMandatory: false,
        displayOrder: 8,
        applicableTo: ['ALL']
    },
    {
        title: 'Data Usage Policy',
        category: 'Data Usage Policy',
        content: `1. Healthcare Operations: Demographic and clinical data are processed strictly for appointment management, healthcare delivery, electronic billing, and regulatory reporting.
2. No Third-Party Sales: The hospital never sells personal or clinical data to advertisers or unauthorized commercial third parties.`,
        isMandatory: false,
        displayOrder: 9,
        applicableTo: ['PATIENT_REGISTRATION']
    }
];

// Helper to resolve models from tenantDb or master fallback
function getPolicyModels(req) {
    if (req.tenantDb) {
        return getTenantModels(req.tenantDb);
    }
    return { HospitalPolicy, PolicyAcceptance };
}

// ─── 1. PUBLIC / ACTIVE POLICIES (Patient & Reception Access) ─────────────────
// GET /api/hospital-policies/active
// Returns only active policies for the resolved hospital context
router.get('/active', async (req, res) => {
    try {
        let hospitalId = req.query.hospitalId;

        // If not explicitly passed in query, try resolving from authenticated context or header
        if (!hospitalId && req.headers['authorization']) {
            try {
                const token = req.headers['authorization'].replace(/^Bearer\s+/i, '');
                const jwt = require('jsonwebtoken');
                const { JWT_SECRET } = require('../config/jwt');
                const decoded = jwt.verify(token, JWT_SECRET);
                if (decoded.hospitalId) hospitalId = decoded.hospitalId;
            } catch (_) {}
        }

        if (!hospitalId && req.headers['x-hospital-id']) {
            hospitalId = req.headers['x-hospital-id'];
        }

        if (!hospitalId) {
            // Check domain or slug
            const domain = req.query.domain || req.headers['host'];
            const slug = req.query.slug;
            if (domain || slug) {
                const hosp = await Hospital.findOne(slug ? { slug } : { customDomain: domain }).select('_id');
                if (hosp) hospitalId = hosp._id;
            }
        }

        if (!hospitalId || !mongoose.Types.ObjectId.isValid(hospitalId)) {
            return res.status(400).json({ success: false, message: 'Valid Hospital ID is required to fetch policies' });
        }

        const hospital = await Hospital.findById(hospitalId).select('name logo branding brandingSchema');
        if (!hospital) {
            return res.status(404).json({ success: false, message: 'Hospital not found' });
        }

        const filter = {
            hospitalId: new mongoose.Types.ObjectId(hospitalId),
            isActive: true
        };

        const applicableTo = req.query.applicableTo;
        if (applicableTo) {
            filter.applicableTo = { $in: [applicableTo, 'ALL'] };
        }

        let policies = await HospitalPolicy.find(filter)
            .select('title slug content category isMandatory version displayOrder updatedAt applicableTo')
            .sort({ displayOrder: 1, createdAt: 1 })
            .lean();

        // If newly created hospital with 0 policies, auto-seed defaults so patient/reception never see empty state
        if (policies.length === 0) {
            const seedDocs = DEFAULT_POLICY_TEMPLATES.map(t => ({
                ...t,
                hospitalId: hospital._id,
                version: 1
            }));
            await HospitalPolicy.insertMany(seedDocs);
            policies = await HospitalPolicy.find(filter)
                .select('title slug content category isMandatory version displayOrder updatedAt applicableTo')
                .sort({ displayOrder: 1, createdAt: 1 })
                .lean();
        }

        res.json({
            success: true,
            hospital: {
                id: hospital._id,
                name: hospital.name,
                logo: hospital.branding?.logoUrl || hospital.logo || '',
                emailDisplayName: hospital.branding?.emailDisplayName || hospital.name
            },
            policies,
            categories: POLICY_CATEGORIES
        });

    } catch (err) {
        console.error('Error fetching active hospital policies:', err);
        res.status(500).json({ success: false, message: 'Failed to retrieve hospital policies' });
    }
});

// Alias for public active policies
router.get('/public', (req, res) => {
    res.redirect(307, `/api/hospital-policies/active?${new URLSearchParams(req.query).toString()}`);
});

// ─── 2. HOSPITAL ADMIN: LIST ALL POLICIES ─────────────────────────────────────
// GET /api/hospital-policies
router.get('/', verifyToken, verifyHospitalAdmin, resolveTenant, async (req, res) => {
    try {
        const hospitalId = req.user.hospitalId || req.hospitalId;
        if (!hospitalId) {
            return res.status(400).json({ success: false, message: 'Hospital context required' });
        }

        const { HospitalPolicy: TenantPolicy } = getPolicyModels(req);

        let policies = await TenantPolicy.find({ hospitalId })
            .sort({ displayOrder: 1, createdAt: 1 })
            .lean();

        // Auto-seed initial templates if empty
        if (policies.length === 0) {
            const seedDocs = DEFAULT_POLICY_TEMPLATES.map(t => ({
                ...t,
                hospitalId,
                version: 1,
                createdBy: req.user._id
            }));
            await TenantPolicy.insertMany(seedDocs);
            policies = await TenantPolicy.find({ hospitalId })
                .sort({ displayOrder: 1, createdAt: 1 })
                .lean();
        }

        const hospital = await Hospital.findById(hospitalId).select('name logo branding');

        const stats = {
            total: policies.length,
            active: policies.filter(p => p.isActive).length,
            mandatory: policies.filter(p => p.isMandatory).length,
            inactive: policies.filter(p => !p.isActive).length
        };

        res.json({
            success: true,
            hospital: {
                id: hospital?._id || hospitalId,
                name: hospital?.name || 'Hospital',
                logo: hospital?.branding?.logoUrl || hospital?.logo || ''
            },
            policies,
            stats,
            categories: POLICY_CATEGORIES
        });

    } catch (err) {
        console.error('Error in GET /api/hospital-policies:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch hospital policies' });
    }
});

// ─── 3. HOSPITAL ADMIN: CREATE NEW POLICY ─────────────────────────────────────
// POST /api/hospital-policies
router.post('/', verifyToken, verifyHospitalAdmin, resolveTenant, async (req, res) => {
    try {
        const hospitalId = req.user.hospitalId || req.hospitalId;
        if (!hospitalId) {
            return res.status(400).json({ success: false, message: 'Hospital context required' });
        }

        const { title, content, category, isActive = true, isMandatory = true, displayOrder, applicableTo } = req.body;

        if (!title || !String(title).trim()) {
            return res.status(400).json({ success: false, message: 'Policy title is required' });
        }
        if (!content || !String(content).trim()) {
            return res.status(400).json({ success: false, message: 'Policy content is required' });
        }

        const { HospitalPolicy: TenantPolicy } = getPolicyModels(req);

        // Auto calculate display order if not provided
        let order = Number(displayOrder);
        if (isNaN(order)) {
            const count = await TenantPolicy.countDocuments({ hospitalId });
            order = count + 1;
        }

        const newPolicy = new TenantPolicy({
            hospitalId,
            title: String(title).trim(),
            content: String(content).trim(),
            category: category || 'General Hospital Policy',
            isActive: Boolean(isActive),
            isMandatory: Boolean(isMandatory),
            displayOrder: order,
            version: 1,
            applicableTo: Array.isArray(applicableTo) && applicableTo.length > 0 ? applicableTo : ['ALL'],
            createdBy: req.user._id,
            updatedBy: req.user._id
        });

        await newPolicy.save();

        res.status(201).json({
            success: true,
            message: 'Policy created successfully',
            policy: newPolicy
        });

    } catch (err) {
        console.error('Error creating policy:', err);
        res.status(500).json({ success: false, message: 'Failed to create policy' });
    }
});

// ─── 4. HOSPITAL ADMIN: UPDATE POLICY (VERSION INCREMENT) ─────────────────────
// PUT /api/hospital-policies/:id
router.put('/:id', verifyToken, verifyHospitalAdmin, resolveTenant, async (req, res) => {
    try {
        const hospitalId = req.user.hospitalId || req.hospitalId;
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid policy ID' });
        }

        const { HospitalPolicy: TenantPolicy } = getPolicyModels(req);

        // Enforce strict tenant ownership
        const policy = await TenantPolicy.findOne({ _id: id, hospitalId });
        if (!policy) {
            return res.status(404).json({ success: false, message: 'Policy not found or unauthorized' });
        }

        const { title, content, category, isActive, isMandatory, displayOrder, applicableTo } = req.body;

        const cleanTitle = title !== undefined ? String(title).trim() : policy.title;
        const cleanContent = content !== undefined ? String(content).trim() : policy.content;

        // Increment version if title or content changed (Part 20 & 23 requirement)
        const isContentChanged = cleanContent !== policy.content || cleanTitle !== policy.title;
        if (isContentChanged) {
            policy.version = (policy.version || 1) + 1;
        }

        policy.title = cleanTitle;
        policy.content = cleanContent;
        if (category !== undefined) policy.category = category;
        if (isActive !== undefined) policy.isActive = Boolean(isActive);
        if (isMandatory !== undefined) policy.isMandatory = Boolean(isMandatory);
        if (displayOrder !== undefined) policy.displayOrder = Number(displayOrder);
        if (applicableTo !== undefined) policy.applicableTo = Array.isArray(applicableTo) ? applicableTo : [applicableTo];
        policy.updatedBy = req.user._id;

        await policy.save();

        res.json({
            success: true,
            message: `Policy updated successfully${isContentChanged ? ` (version ${policy.version})` : ''}`,
            policy,
            versionIncremented: isContentChanged
        });

    } catch (err) {
        console.error('Error updating policy:', err);
        res.status(500).json({ success: false, message: 'Failed to update policy' });
    }
});

// ─── 5. HOSPITAL ADMIN: TOGGLE ACTIVE / INACTIVE ──────────────────────────────
// PATCH /api/hospital-policies/:id/status
router.patch('/:id/status', verifyToken, verifyHospitalAdmin, resolveTenant, async (req, res) => {
    try {
        const hospitalId = req.user.hospitalId || req.hospitalId;
        const { id } = req.params;
        const { isActive } = req.body;

        const { HospitalPolicy: TenantPolicy } = getPolicyModels(req);

        const policy = await TenantPolicy.findOne({ _id: id, hospitalId });
        if (!policy) {
            return res.status(404).json({ success: false, message: 'Policy not found or unauthorized' });
        }

        policy.isActive = isActive !== undefined ? Boolean(isActive) : !policy.isActive;
        policy.updatedBy = req.user._id;
        await policy.save();

        res.json({
            success: true,
            message: `Policy ${policy.isActive ? 'activated' : 'deactivated'} successfully`,
            policy
        });

    } catch (err) {
        console.error('Error updating policy status:', err);
        res.status(500).json({ success: false, message: 'Failed to toggle policy status' });
    }
});

// ─── 6. HOSPITAL ADMIN: REORDER POLICIES ──────────────────────────────────────
// PATCH /api/hospital-policies/reorder
router.patch('/reorder', verifyToken, verifyHospitalAdmin, resolveTenant, async (req, res) => {
    try {
        const hospitalId = req.user.hospitalId || req.hospitalId;
        const { items } = req.body; // Array of { id, displayOrder }

        if (!Array.isArray(items)) {
            return res.status(400).json({ success: false, message: 'Items array required for reordering' });
        }

        const { HospitalPolicy: TenantPolicy } = getPolicyModels(req);

        const updatePromises = items.map(item =>
            TenantPolicy.updateOne(
                { _id: item.id, hospitalId },
                { $set: { displayOrder: Number(item.displayOrder) } }
            )
        );

        await Promise.all(updatePromises);

        res.json({ success: true, message: 'Policies reordered successfully' });

    } catch (err) {
        console.error('Error reordering policies:', err);
        res.status(500).json({ success: false, message: 'Failed to reorder policies' });
    }
});

// ─── 7. HOSPITAL ADMIN: DELETE POLICY ─────────────────────────────────────────
// DELETE /api/hospital-policies/:id
router.delete('/:id', verifyToken, verifyHospitalAdmin, resolveTenant, async (req, res) => {
    try {
        const hospitalId = req.user.hospitalId || req.hospitalId;
        const { id } = req.params;

        const { HospitalPolicy: TenantPolicy } = getPolicyModels(req);

        const deleted = await TenantPolicy.findOneAndDelete({ _id: id, hospitalId });
        if (!deleted) {
            return res.status(404).json({ success: false, message: 'Policy not found or unauthorized' });
        }

        res.json({ success: true, message: 'Policy deleted successfully' });

    } catch (err) {
        console.error('Error deleting policy:', err);
        res.status(500).json({ success: false, message: 'Failed to delete policy' });
    }
});

// ─── 8. POLICY ACCEPTANCE (REGISTRATION & APPOINTMENTS AUDIT) ─────────────────
// POST /api/hospital-policies/accept
// Records auditable policy acceptance with snapshot of exact versions accepted
router.post('/accept', async (req, res) => {
    try {
        const {
            patientId,
            appointmentId,
            hospitalId: bodyHospitalId,
            policyIds,
            source = 'PATIENT_REGISTRATION',
            offlineSync
        } = req.body;

        // Resolve hospitalId securely
        let hospitalId = bodyHospitalId;
        let authUserId = null;

        if (req.headers['authorization']) {
            try {
                const token = req.headers['authorization'].replace(/^Bearer\s+/i, '');
                const jwt = require('jsonwebtoken');
                const { JWT_SECRET } = require('../config/jwt');
                const decoded = jwt.verify(token, JWT_SECRET);
                if (decoded.hospitalId) hospitalId = decoded.hospitalId;
                authUserId = decoded.userId || decoded.id || decoded.patientAuthId || null;
            } catch (_) {}
        }

        if (!hospitalId || !mongoose.Types.ObjectId.isValid(hospitalId)) {
            return res.status(400).json({ success: false, message: 'Valid hospitalId is required' });
        }

        if (!patientId || !mongoose.Types.ObjectId.isValid(patientId)) {
            return res.status(400).json({ success: false, message: 'Valid patientId is required' });
        }

        // Query active policies for this hospital
        let query = { hospitalId, isActive: true };
        if (Array.isArray(policyIds) && policyIds.length > 0) {
            query._id = { $in: policyIds };
        }

        const policies = await HospitalPolicy.find(query).lean();
        if (policies.length === 0) {
            return res.status(400).json({ success: false, message: 'No active policies found for this hospital to accept' });
        }

        // Build snapshot of accepted policies with immutable versions
        const acceptedAt = (offlineSync && offlineSync.offlineAcceptedAt)
            ? new Date(offlineSync.offlineAcceptedAt)
            : new Date();

        const policiesAccepted = policies.map(p => ({
            policyId: p._id,
            policyTitle: p.title,
            category: p.category,
            version: p.version || 1,
            acceptedAt
        }));

        const acceptanceDoc = new PolicyAcceptance({
            hospitalId,
            patientId,
            appointmentId: appointmentId && mongoose.Types.ObjectId.isValid(appointmentId) ? appointmentId : null,
            policiesAccepted,
            source: ['PATIENT_REGISTRATION', 'APPOINTMENT_BOOKING', 'PATIENT_PORTAL_SIGNUP', 'OTHER'].includes(source)
                ? source
                : 'OTHER',
            acceptedAt,
            acceptedBy: authUserId && mongoose.Types.ObjectId.isValid(authUserId) ? authUserId : patientId,
            ipAddress: req.ip || req.connection?.remoteAddress || '',
            userAgent: req.headers['user-agent'] || '',
            offlineSync: {
                isOfflineEvent: offlineSync === true || Boolean(offlineSync?.isOfflineEvent),
                offlineAcceptedAt: offlineSync?.offlineAcceptedAt ? new Date(offlineSync.offlineAcceptedAt) : ((offlineSync === true || offlineSync?.isOfflineEvent) ? acceptedAt : null),
                syncedAt: (offlineSync === true || offlineSync?.isOfflineEvent) ? new Date() : null
            }
        });

        await acceptanceDoc.save();

        res.status(201).json({
            success: true,
            message: 'Policy acceptance recorded successfully',
            acceptanceId: acceptanceDoc._id,
            acceptedCount: policiesAccepted.length,
            acceptedAt
        });

    } catch (err) {
        console.error('Error recording policy acceptance:', err);
        res.status(500).json({ success: false, message: 'Failed to record policy acceptance' });
    }
});

// ─── 9. ACCEPTANCE AUDIT HISTORY ──────────────────────────────────────────────
// GET /api/hospital-policies/history/:patientId
router.get('/history/:patientId', verifyToken, async (req, res) => {
    try {
        const { patientId } = req.params;
        const hospitalId = req.user.hospitalId;

        const query = { patientId };
        if (hospitalId) query.hospitalId = hospitalId;

        const history = await PolicyAcceptance.find(query)
            .populate('appointmentId', 'appointmentDate appointmentTime doctorName')
            .sort({ acceptedAt: -1 })
            .lean();

        res.json({ success: true, history });

    } catch (err) {
        console.error('Error fetching acceptance history:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch policy acceptance history' });
    }
});

// ─── 10. SEED DEFAULT TEMPLATES (MANUAL TRIGGER) ──────────────────────────────
// POST /api/hospital-policies/seed-defaults
router.post('/seed-defaults', verifyToken, verifyHospitalAdmin, resolveTenant, async (req, res) => {
    try {
        const hospitalId = req.user.hospitalId || req.hospitalId;
        if (!hospitalId) {
            return res.status(400).json({ success: false, message: 'Hospital context required' });
        }

        const { HospitalPolicy: TenantPolicy } = getPolicyModels(req);

        // Find existing titles to avoid duplicate seeding
        const existing = await TenantPolicy.find({ hospitalId }).select('title').lean();
        const existingTitles = new Set(existing.map(p => p.title.toLowerCase().trim()));

        const toInsert = DEFAULT_POLICY_TEMPLATES.filter(
            t => !existingTitles.has(t.title.toLowerCase().trim())
        ).map((t, idx) => ({
            ...t,
            hospitalId,
            displayOrder: existing.length + idx + 1,
            version: 1,
            createdBy: req.user._id
        }));

        if (toInsert.length > 0) {
            await TenantPolicy.insertMany(toInsert);
        }

        const allPolicies = await TenantPolicy.find({ hospitalId }).sort({ displayOrder: 1 });

        res.json({
            success: true,
            message: `Seeded ${toInsert.length} default policy templates`,
            policies: allPolicies
        });

    } catch (err) {
        console.error('Error seeding policy defaults:', err);
        res.status(500).json({ success: false, message: 'Failed to seed default policy templates' });
    }
});

module.exports = router;
