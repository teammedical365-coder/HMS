const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth.middleware');
const { resolveTenant } = require('../middleware/tenantMiddleware');
const auditLog = require('../middleware/audit.middleware');
const MasterUser = require('../models/user.model');

// Serve patient report files via public endpoint (guarantees proxy compatibility)
router.get('/reports/:filename', (req, res) => {
    try {
        const path = require('path');
        const fs = require('fs');
        const filename = req.params.filename;
        const filePath = path.join(__dirname, '../../uploads/patient-reports', filename);

        if (fs.existsSync(filePath)) {
            return res.sendFile(filePath);
        } else {
            return res.status(404).send('Report file not found');
        }
    } catch (error) {
        console.error('Error serving report file:', error);
        res.status(500).send('Internal server error');
    }
});

// SEARCH API: Identifies patient by Phone or Name — scoped to hospital tenant
router.get('/search', verifyToken, resolveTenant, async (req, res) => {
    try {
        const { term } = req.query;
        if (!term || typeof term !== 'string' || term.trim().length < 2) {
            return res.status(400).json({ success: false, message: 'Search term must be at least 2 characters' });
        }

        // Escape special regex characters to prevent regex injection
        const safeTerm = term.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regexTerm = { $regex: safeTerm, $options: 'i' };
        let hFilter = {};
        if (req.user.hospitalId) {
            hFilter = {
                $or: [
                    { hospitalId: req.user.hospitalId },
                    { hospitalId: { $exists: false } },
                    { hospitalId: null }
                ]
            };
        }

        const patients = await MasterUser.find({
            $and: [
                hFilter,
                {
                    $or: [
                        { phone: regexTerm },
                        { patientId: regexTerm },
                        { mrn: regexTerm },
                        { name: regexTerm }
                    ]
                }
            ]
        }).select('name phone patientId mrn dob gender city').limit(50);

        res.json({ success: true, data: patients });
    } catch (error) {
        console.error('[patient-search]', error.message);
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// FULL HISTORY API: Chronological Timeline — scoped to hospital tenant
router.get('/:id/full-history', verifyToken, resolveTenant, auditLog('VIEW_PATIENT', (req) => ({ model: 'User', id: req.params.id })), async (req, res) => {
    try {
        const userId = req.params.id;
        const roleData = req.user._roleData;

        const allowedRoles = ['doctor', 'clinic doctor', 'nurse', 'superadmin', 'admin', 'reception', 'receptionist', 'lab', 'pharmacy', 'centraladmin', 'hospitaladmin'];
        const userRole = (req.user.role ? String(req.user.role) : '').toLowerCase();
        const dynRole = (roleData?.name || '').toLowerCase();
        
        // Ensure that explicit permissions are checked instead of just strictly hardcoded names
        const hasPermission = (req.user.permissions || []).includes('patient_view') || 
                              (req.user.permissions || []).includes('visit_diagnose') ||
                              (req.user._roleData?.permissions || []).includes('patient_view') ||
                              (req.user._roleData?.permissions || []).includes('visit_diagnose');

        const hasAccess = allowedRoles.includes(userRole) || allowedRoles.includes(dynRole) || hasPermission;

        if (!hasAccess && userRole !== 'superadmin') {
            return res.status(403).json({ success: false, message: 'Unauthorized access to patient history' });
        }

        const isRestrictedRole = ['pharmacy', 'lab'].includes((roleData?.name || '').toLowerCase());

        // All clinical data is stored in master DB — hospitalId filter provides hospital isolation
        const ClinicalVisit = require('../models/clinicalVisit.model');
        const LabReport = require('../models/labReport.model');
        const PharmacyOrder = require('../models/pharmacyOrder.model');
        const Appointment = require('../models/appointment.model');

        const mongoose = require('mongoose');
        const isObjectId = mongoose.Types.ObjectId.isValid(userId) && userId.length === 24;

        // Reject obviously invalid IDs early — prevents arbitrary string lookups
        if (!isObjectId && (!/^[A-Za-z0-9_-]{3,30}$/.test(userId))) {
            return res.status(400).json({ success: false, message: 'Invalid patient identifier' });
        }

        const userQuery = isObjectId ? { _id: userId } : { patientId: userId };
        // Always scope to hospital for data isolation
        if (req.user.hospitalId) userQuery.hospitalId = req.user.hospitalId;
        
        let user = await MasterUser.findOne(userQuery).lean();
        let isClinicPatient = false;

        if (!user) {
            // Check if it's a ClinicPatient
            const ClinicPatient = require('../models/clinicPatient.model');
            const clinicQuery = isObjectId ? { _id: userId } : { patientUid: userId };
            if (req.user.hospitalId) clinicQuery.clinicId = req.user.hospitalId;
            
            const cp = await ClinicPatient.findOne(clinicQuery).lean();
            if (cp) {
                user = cp;
                isClinicPatient = true;
            }
        }

        if (!user) {
            return res.status(404).json({ success: false, message: 'Patient not found' });
        }

        // Ensure the endpoint works only with Clinic APIs when accessed by Clinic Doctor
        if (dynRole === 'clinic doctor' && !isClinicPatient) {
            return res.status(403).json({ success: false, message: 'Clinic Doctors can only access Clinic Patient history.' });
        }

        const realUserId = user._id;
        const patientIdStr = user.patientId || user.patientUid || userId;

        let department = req.query.department;

        // HARD ISOLATION: Scope all data to the staff's hospital
        const hid = req.user.hospitalId;
        const hFilter = hid ? { hospitalId: hid } : {};

        let visits = [];
        let labs = [];
        let pharmacies = [];
        let appointments = [];
        let plans = [];

        const idList = [realUserId];
        if (patientIdStr && String(patientIdStr) !== String(realUserId)) {
            idList.push(patientIdStr);
        }

        // Filter valid ObjectIds for ObjectId Mongoose fields to prevent CastErrors
        const objectIdList = idList.filter(id => mongoose.Types.ObjectId.isValid(id));

        if (isClinicPatient) {
            const TreatmentPlan = require('../models/treatmentPlan.model');
            // Clinic patients store appointments with clinicPatientId field
            let clinicApptQuery = { 
                $or: [
                    { clinicPatientId: { $in: objectIdList } }, 
                    { userId: { $in: objectIdList } }, 
                    { patientId: { $in: idList } }
                ], 
                ...hFilter 
            };
            if (department) {
                clinicApptQuery.$and = [{
                    $or: [
                        { department: { $regex: new RegExp(`^${department}$`, 'i') } },
                        { serviceName: { $regex: new RegExp(`^${department}$`, 'i') } }
                    ]
                }];
            } else {
                clinicApptQuery.$and = [{
                    $or: [
                        { department: { $in: [null, ''] } },
                        { serviceName: { $in: [null, ''] } },
                        { department: { $exists: false } }
                    ]
                }];
            }
            appointments = await Appointment.find(clinicApptQuery).lean();
            // Clinic treatment plans
            plans = await TreatmentPlan.find({ clinicPatientId: { $in: objectIdList }, ...hFilter }).lean();

            // Populate latest vitals fallback if patient document vitals are empty
            if (!user.vitals || !Object.values(user.vitals || {}).some(v => v !== '' && v !== null && v !== undefined)) {
                const latestApptWithVitals = appointments
                    .filter(a => a.vitals && (a.vitals.weight || a.vitals.height || a.vitals.bp || a.vitals.temperature || a.vitals.pulse))
                    .sort((a, b) => new Date(b.appointmentDate) - new Date(a.appointmentDate))[0];
                if (latestApptWithVitals) {
                    user.vitals = {
                        weight:          latestApptWithVitals.vitals.weight || '',
                        height:          latestApptWithVitals.vitals.height || '',
                        bmi:             latestApptWithVitals.vitals.bmi || '',
                        bloodPressure:   latestApptWithVitals.vitals.bp || latestApptWithVitals.vitals.bloodPressure || '',
                        pulse:           latestApptWithVitals.vitals.pulse || '',
                        temperature:     latestApptWithVitals.vitals.temperature || '',
                        spo2:            latestApptWithVitals.vitals.spo2 || '',
                        respiratoryRate: latestApptWithVitals.vitals.rr || latestApptWithVitals.vitals.respiratoryRate || '',
                        lastRecorded:    latestApptWithVitals.appointmentDate
                    };
                }
            }

            // Map ClinicPatient fields to look like User/fertilityProfile structure for frontend compatibility
            user.fertilityProfile = {
                address: user.address || '',
                bloodGroup: user.bloodGroup || '',
                allergies: user.allergies || '',
                chronicConditions: user.chronicConditions || '',
                medicalNotes: user.medicalNotes || '',
                vitals: {
                    weight:          user.vitals?.weight || '',
                    height:          user.vitals?.height || '',
                    bmi:             user.vitals?.bmi || '',
                    bloodPressure:   user.vitals?.bloodPressure || '',
                    pulse:           user.vitals?.pulse || '',
                    temperature:     user.vitals?.temperature || '',
                    spo2:            user.vitals?.spo2 || '',
                    respiratoryRate: user.vitals?.respiratoryRate || '',
                    lastRecorded:    user.vitals?.lastRecorded || null
                }
            };
        } else {
            // Hospital queries
            let visitQuery = { $or: [{ patientId: { $in: idList } }], ...hFilter };
            let labQuery = { $or: [{ userId: { $in: objectIdList } }, { patientId: { $in: idList } }], ...hFilter };
            let pharmaQuery = { $or: [{ userId: { $in: objectIdList } }, { patientId: { $in: idList } }], ...hFilter };
            let apptQuery = { $or: [{ userId: { $in: objectIdList } }, { patientId: { $in: idList } }], ...hFilter };

            if (department) {
                apptQuery.$and = [{
                    $or: [
                        { department: { $regex: new RegExp(`^${department}$`, 'i') } },
                        { serviceName: { $regex: new RegExp(`^${department}$`, 'i') } }
                    ]
                }];
            } else {
                apptQuery.$and = [{
                    $or: [
                        { department: { $in: [null, ''] } },
                        { serviceName: { $in: [null, ''] } },
                        { department: { $exists: false } }
                    ]
                }];
            }

            appointments = await Appointment.find(apptQuery).lean();

            const deptApptIds = appointments.map(a => a._id);
            visitQuery.appointmentId = { $in: deptApptIds };
            labQuery.appointmentId = { $in: deptApptIds };
            pharmaQuery.appointmentId = { $in: deptApptIds };

            [visits, labs, pharmacies] = await Promise.all([
                ClinicalVisit.find(visitQuery).lean(),
                LabReport.find(labQuery).lean(),
                PharmacyOrder.find(pharmaQuery).lean()
            ]);
        }

        let timeline = [];

        visits.forEach(v => {
            let summary = {
                primaryComplaint: v.intake?.chiefComplaint || 'No complaint recorded',
                doctorSeen: v.doctorConsultation?.doctorId || 'Pending',
                outcome: Array.isArray(v.doctorConsultation?.diagnosis) ? v.doctorConsultation.diagnosis.join(', ') : (v.doctorConsultation?.diagnosis || 'Processing')
            };
            let item = { type: 'clinicalVisit', date: v.visitDate || v.createdAt, data: v, summary };
            if (isRestrictedRole && item.data.doctorConsultation) {
                delete item.data.doctorConsultation.clinicalNotes;
            }
            timeline.push(item);
        });

        labs.forEach(l => timeline.push({ type: 'labReport', date: l.createdAt, data: l }));
        pharmacies.forEach(p => timeline.push({ type: 'pharmacyOrder', date: p.createdAt, data: p }));
        appointments.forEach(a => timeline.push({ type: 'appointment', date: a.appointmentDate, data: a }));

        (plans || []).forEach(tp => {
            timeline.push({
                type: 'treatmentPlan',
                date: tp.createdAt || new Date(),
                data: {
                    title: tp.title || 'Untitled Plan',
                    description: tp.description || '',
                    totalAmount: tp.totalAmount || 0,
                    totalPaid: tp.totalPaid || 0,
                    pendingBalance: tp.pendingBalance || 0,
                    status: tp.status || 'Draft',
                    visits: tp.visits || []
                }
            });
        });

        timeline.sort((a, b) => new Date(b.date) - new Date(a.date));

        res.json({ success: true, user, timeline });
    } catch (error) {
        console.error("CRITICAL PROFILE ROUTE TRACE:", error.stack);
        return res.status(500).json({ error: error.message, stack: error.stack });
    }
});

// ─── CONSENT FORM MANAGEMENT ─────────────────────────────────────────────────
const multer = require('multer');
const consentUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Only images and PDFs are allowed'), false);
        }
    }
});

// POST /api/patients/:id/consent — Upload a consent form
router.post('/:id/consent', verifyToken, resolveTenant, consentUpload.single('consentFile'), async (req, res) => {
    try {
        const userId = req.params.id;
        const hid = req.user.hospitalId;

        const userQuery = { _id: userId };
        if (hid) userQuery.hospitalId = hid;

        const user = await MasterUser.findOne(userQuery);
        if (!user) return res.status(404).json({ success: false, message: 'Patient not found' });

        if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });

        const imagekit = require('../utils/imagekit');
        const result = await imagekit.upload({
            file: req.file.buffer,
            fileName: `consent_${userId}_${Date.now()}_${req.file.originalname}`,
            folder: '/consent-forms',
            tags: ['consent', req.file.mimetype]
        });

        const consentEntry = {
            fileName: req.file.originalname,
            url: result.url,
            fileId: result.fileId,
            mimeType: req.file.mimetype,
            uploadedAt: new Date(),
            uploadedBy: req.user.name || req.user._id
        };

        if (!user.fertilityProfile) user.fertilityProfile = {};
        if (!Array.isArray(user.fertilityProfile.consentForms)) {
            user.fertilityProfile.consentForms = [];
        }
        user.fertilityProfile.consentForms.push(consentEntry);
        user.markModified('fertilityProfile');
        await user.save();

        res.json({ success: true, message: 'Consent form uploaded', consent: consentEntry });
    } catch (error) {
        console.error('[consent-upload]', error.message);
        res.status(500).json({ success: false, message: 'Upload failed' });
    }
});

// GET /api/patients/:id/consent — Fetch consent forms
router.get('/:id/consent', verifyToken, resolveTenant, async (req, res) => {
    try {
        const userId = req.params.id;
        const hid = req.user.hospitalId;

        const userQuery = { _id: userId };
        if (hid) userQuery.hospitalId = hid;

        const user = await MasterUser.findOne(userQuery).lean();
        if (!user) return res.status(404).json({ success: false, message: 'Patient not found' });

        const consentForms = user.fertilityProfile?.consentForms || [];
        res.json({ success: true, consentForms });
    } catch (error) {
        console.error('[consent-fetch]', error.message);
        res.status(500).json({ success: false, message: 'Failed to fetch consent forms' });
    }
});

// DELETE /api/patients/:id/consent/:index — Delete a consent form
router.delete('/:id/consent/:index', verifyToken, resolveTenant, async (req, res) => {
    try {
        const userId = req.params.id;
        const index = parseInt(req.params.index, 10);
        const { fileId } = req.body || {};

        const user = await MasterUser.findOne({ _id: userId });
        if (!user) return res.status(404).json({ success: false, message: 'Patient not found' });

        if (!user.fertilityProfile || !Array.isArray(user.fertilityProfile.consentForms)) {
            return res.status(404).json({ success: false, message: 'No consent forms found' });
        }

        let removed = null;
        if (!isNaN(index) && index >= 0 && index < user.fertilityProfile.consentForms.length) {
            removed = user.fertilityProfile.consentForms.splice(index, 1)[0];
        } else if (fileId) {
            const idx = user.fertilityProfile.consentForms.findIndex(c => c.fileId === fileId || c._id?.toString() === fileId);
            if (idx !== -1) removed = user.fertilityProfile.consentForms.splice(idx, 1)[0];
        }

        if (!removed) {
            return res.status(404).json({ success: false, message: 'Consent form not found' });
        }

        user.markModified('fertilityProfile');
        await user.save();

        if (removed.fileId) {
            try {
                const imagekit = require('../utils/imagekit');
                await imagekit.deleteFile(removed.fileId);
            } catch (ikErr) {
                console.warn('[consent-ik-delete]', ikErr.message);
            }
        }

        res.json({ success: true, message: 'Consent form deleted successfully', consentForms: user.fertilityProfile.consentForms });
    } catch (error) {
        console.error('[consent-delete]', error.message);
        res.status(500).json({ success: false, message: 'Failed to delete consent form' });
    }
});

// POST /api/patients/:id/documents — Upload a general document (lab report, scan, etc.)
router.post('/:id/documents', verifyToken, resolveTenant, consentUpload.single('document'), async (req, res) => {
    try {
        const userId = req.params.id;
        const hid = req.user.hospitalId;

        const userQuery = { _id: userId };
        if (hid) userQuery.hospitalId = hid;

        const user = await MasterUser.findOne(userQuery);
        if (!user) return res.status(404).json({ success: false, message: 'Patient not found' });

        if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });

        const imagekit = require('../utils/imagekit');
        const result = await imagekit.upload({
            file: req.file.buffer,
            fileName: `doc_${userId}_${Date.now()}_${req.file.originalname}`,
            folder: '/patient-documents',
            tags: ['patient-document', req.file.mimetype]
        });

        const docEntry = {
            fileName: req.file.originalname,
            docType: req.body.docType || 'General',
            url: result.url,
            fileId: result.fileId,
            mimeType: req.file.mimetype,
            uploadedAt: new Date(),
            uploadedBy: req.user.name || req.user._id
        };

        if (!user.fertilityProfile) user.fertilityProfile = {};
        if (!Array.isArray(user.fertilityProfile.documents)) {
            user.fertilityProfile.documents = [];
        }
        user.fertilityProfile.documents.push(docEntry);
        user.markModified('fertilityProfile');
        await user.save();

        res.json({ success: true, message: 'Document uploaded', document: docEntry });
    } catch (error) {
        console.error('[document-upload] FULL ERROR:', error);
        res.status(500).json({ success: false, message: 'Upload failed', error: error.message, stack: error.stack });
    }
});

// GET /api/patients/:id/documents — Fetch all uploaded documents
router.get('/:id/documents', verifyToken, resolveTenant, async (req, res) => {
    try {
        const userId = req.params.id;
        const hid = req.user.hospitalId;

        const userQuery = { _id: userId };
        if (hid) userQuery.hospitalId = hid;

        const user = await MasterUser.findOne(userQuery).lean();
        if (!user) return res.status(404).json({ success: false, message: 'Patient not found' });

        const fp = user.fertilityProfile || {};
        const baseDocs = Array.isArray(fp.documents) ? fp.documents : [];
        const prevReports = Array.isArray(fp.previousReports) ? fp.previousReports.map(r => ({
            fileName: r.fileName || r.name || 'Medical Report',
            docType: r.docType || 'Medical Report',
            url: r.url || r.fileUrl || r.filename,
            uploadedAt: r.date || r.uploadedAt || user.updatedAt || new Date(),
            fileId: r.fileId || r._id || null,
            uploadedBy: r.uploadedBy || 'Doctor'
        })) : [];
        const doctorReports = Array.isArray(fp.reports) ? fp.reports.map(r => ({
            fileName: r.name || r.fileName || 'Medical Report',
            docType: r.docType || 'Medical Report',
            url: r.url || r.fileUrl || (r.filename ? ((r.filename || '').startsWith('http') ? r.filename : `/api/patients/reports/${encodeURIComponent(r.filename)}`) : null),
            uploadedAt: r.uploadedAt || r.date || new Date(),
            fileId: r.fileId || r._id || null,
            uploadedBy: r.uploadedBy || 'Doctor'
        })) : [];

        let department = req.query.department;
        const mongoose = require('mongoose');

        let deptApptIds = [];
        const Appointment = require('../models/appointment.model');
        let apptQuery = { $or: [{ userId: userId }, { patientId: userId }], hospitalId: hid };
        
        if (department) {
            apptQuery.$and = [{
                $or: [
                    { department: { $regex: new RegExp(`^${department}$`, 'i') } },
                    { serviceName: { $regex: new RegExp(`^${department}$`, 'i') } }
                ]
            }];
        } else {
            apptQuery.$and = [{
                $or: [
                    { department: { $in: [null, ''] } },
                    { serviceName: { $in: [null, ''] } },
                    { department: { $exists: false } }
                ]
            }];
        }
        
        const appts = await Appointment.find(apptQuery).lean();
        deptApptIds = appts.map(a => a._id);

        // Also check if any LabReports exist with fileUrl
        const LabReport = require('../models/labReport.model');
        let labQuery = { $or: [{ userId: userId }, { patientId: userId }] };
        if (hid) labQuery.hospitalId = hid;
        labQuery.appointmentId = { $in: deptApptIds };
        const labReports = await LabReport.find({ ...labQuery, 'data.fileUrl': { $ne: null } }).lean();
        const labDocs = labReports.map(l => ({
            fileName: l.data?.reportName || l.data?.testName || 'Lab Investigation Report',
            docType: 'Lab Report',
            url: l.data.fileUrl,
            uploadedAt: l.createdAt,
            fileId: l._id,
            uploadedBy: 'Lab'
        }));

        const allCombined = [...baseDocs, ...prevReports, ...doctorReports, ...labDocs];
        const seen = new Set();
        const documents = [];
        for (const doc of allCombined) {
            const key = doc.url || doc.fileName;
            if (key && !seen.has(key)) {
                seen.add(key);
                documents.push(doc);
            }
        }

        documents.sort((a, b) => new Date(b.uploadedAt || 0) - new Date(a.uploadedAt || 0));

        res.json({ success: true, documents });
    } catch (error) {
        console.error('[documents-fetch]', error.message);
        res.status(500).json({ success: false, message: 'Failed to fetch documents' });
    }
});

// DELETE /api/patients/:id/documents/:index — Delete a general document
router.delete('/:id/documents/:index', verifyToken, resolveTenant, async (req, res) => {
    try {
        const userId = req.params.id;
        const index = parseInt(req.params.index, 10);
        const { fileId, url, fileName } = req.body || {};

        const user = await MasterUser.findOne({ _id: userId });
        if (!user) return res.status(404).json({ success: false, message: 'Patient not found' });

        if (!user.fertilityProfile) user.fertilityProfile = {};
        const fp = user.fertilityProfile;
        let removed = null;
        let modified = false;

        // Helper to match an item against fileId, url, or fileName
        const isMatch = (item) => {
            if (!item) return false;
            if (fileId && (item.fileId === fileId || item._id?.toString() === fileId)) return true;
            if (url && (item.url === url || item.fileUrl === url || item.filename === url)) return true;
            if (fileName && (item.fileName === fileName || item.name === fileName)) return true;
            return false;
        };

        // 1. Check fertilityProfile.documents
        if (Array.isArray(fp.documents)) {
            if (!isNaN(index) && index >= 0 && index < fp.documents.length && (!fileId && !url)) {
                removed = fp.documents.splice(index, 1)[0];
                modified = true;
            } else {
                const idx = fp.documents.findIndex(isMatch);
                if (idx !== -1) {
                    removed = fp.documents.splice(idx, 1)[0];
                    modified = true;
                }
            }
        }

        // 2. Check fertilityProfile.previousReports
        if (Array.isArray(fp.previousReports)) {
            const idx = fp.previousReports.findIndex(isMatch);
            if (idx !== -1) {
                if (!removed) removed = fp.previousReports[idx];
                fp.previousReports.splice(idx, 1);
                modified = true;
            }
        }

        // 3. Check fertilityProfile.reports
        if (Array.isArray(fp.reports)) {
            const idx = fp.reports.findIndex(isMatch);
            if (idx !== -1) {
                if (!removed) removed = fp.reports[idx];
                fp.reports.splice(idx, 1);
                modified = true;
            }
        }

        // 4. Check LabReport
        const LabReport = require('../models/labReport.model');
        if (fileId && fileId.length === 24) {
            const lab = await LabReport.findById(fileId);
            if (lab) {
                if (!removed) removed = { fileId: lab._id, url: lab.data?.fileUrl };
                await LabReport.findByIdAndDelete(fileId);
                modified = true;
            }
        } else if (url) {
            const lab = await LabReport.findOne({ 'data.fileUrl': url });
            if (lab) {
                if (!removed) removed = { fileId: lab._id, url: lab.data?.fileUrl };
                await LabReport.findByIdAndDelete(lab._id);
                modified = true;
            }
        }

        if (!modified && !removed) {
            return res.status(404).json({ success: false, message: 'Document not found' });
        }

        if (modified) {
            user.markModified('fertilityProfile');
            await user.save();
        }

        if (removed && removed.fileId) {
            try {
                const imagekit = require('../utils/imagekit');
                await imagekit.deleteFile(removed.fileId);
            } catch (ikErr) {
                console.warn('[document-ik-delete]', ikErr.message);
            }
        }

        // Return updated unified documents
        const baseDocs = Array.isArray(fp.documents) ? fp.documents : [];
        const prevReports = Array.isArray(fp.previousReports) ? fp.previousReports.map(r => ({
            fileName: r.fileName || r.name || 'Medical Report',
            docType: r.docType || 'Medical Report',
            url: r.url || r.fileUrl || r.filename,
            uploadedAt: r.date || r.uploadedAt || user.updatedAt || new Date(),
            fileId: r.fileId || r._id || null,
            uploadedBy: r.uploadedBy || 'Doctor'
        })) : [];
        const doctorReports = Array.isArray(fp.reports) ? fp.reports.map(r => ({
            fileName: r.name || r.fileName || 'Medical Report',
            docType: r.docType || 'Medical Report',
            url: r.url || r.fileUrl || (r.filename ? ((r.filename || '').startsWith('http') ? r.filename : `/api/patients/reports/${encodeURIComponent(r.filename)}`) : null),
            uploadedAt: r.uploadedAt || r.date || new Date(),
            fileId: r.fileId || r._id || null,
            uploadedBy: r.uploadedBy || 'Doctor'
        })) : [];

        const hid = req.user.hospitalId;
        const labQuery = { $or: [{ userId: userId }, { patientId: userId }] };
        if (hid) labQuery.hospitalId = hid;
        const labReports = await LabReport.find({ ...labQuery, 'data.fileUrl': { $ne: null } }).lean();
        const labDocs = labReports.map(l => ({
            fileName: l.data?.reportName || l.data?.testName || 'Lab Investigation Report',
            docType: 'Lab Report',
            url: l.data.fileUrl,
            uploadedAt: l.createdAt,
            fileId: l._id,
            uploadedBy: 'Lab'
        }));

        const allCombined = [...baseDocs, ...prevReports, ...doctorReports, ...labDocs];
        const seen = new Set();
        const documents = [];
        for (const doc of allCombined) {
            const key = doc.url || doc.fileName;
            if (key && !seen.has(key)) {
                seen.add(key);
                documents.push(doc);
            }
        }
        documents.sort((a, b) => new Date(b.uploadedAt || 0) - new Date(a.uploadedAt || 0));

        res.json({ success: true, message: 'Document deleted successfully', documents });
    } catch (error) {
        console.error('[document-delete]', error.message);
        res.status(500).json({ success: false, message: 'Failed to delete document' });
    }
});

module.exports = router;