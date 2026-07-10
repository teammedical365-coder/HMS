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
            appointments = await Appointment.find({ 
                $or: [
                    { clinicPatientId: { $in: objectIdList } }, 
                    { userId: { $in: objectIdList } }, 
                    { patientId: { $in: idList } }
                ], 
                ...hFilter 
            }).lean();
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
            const visitQuery = { $or: [{ patientId: { $in: idList } }], ...hFilter };
            const labQuery = { $or: [{ userId: { $in: objectIdList } }, { patientId: { $in: idList } }], ...hFilter };
            const pharmaQuery = { $or: [{ userId: { $in: objectIdList } }, { patientId: { $in: idList } }], ...hFilter };
            const apptQuery = { $or: [{ userId: { $in: objectIdList } }, { patientId: { $in: idList } }], ...hFilter };

            [visits, labs, pharmacies, appointments] = await Promise.all([
                ClinicalVisit.find(visitQuery).lean(),
                LabReport.find(labQuery).lean(),
                PharmacyOrder.find(pharmaQuery).lean(),
                Appointment.find(apptQuery).lean()
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

module.exports = router;