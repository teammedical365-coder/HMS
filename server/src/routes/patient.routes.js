const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth.middleware');
const { resolveTenant } = require('../middleware/tenantMiddleware');
const MasterUser = require('../models/user.model');

// SEARCH API: Identifies patient by Phone or Name — scoped to hospital tenant
router.get('/search', verifyToken, resolveTenant, async (req, res) => {
    try {
        const { term } = req.query;

        const patients = await MasterUser.find({
            $or: [
                { phone: term },
                { patientId: term },
                { mrn: term },
                { name: { $regex: term, $options: 'i' } }
            ]
        }).select('name phone patientId mrn dob gender city');

        res.json({ success: true, data: patients });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// FULL HISTORY API: Chronological Timeline — scoped to hospital tenant
router.get('/:id/full-history', verifyToken, resolveTenant, async (req, res) => {
    try {
        const userId = req.params.id;
        const roleData = req.user._roleData;

        const allowedRoles = ['doctor', 'nurse', 'superadmin', 'admin', 'reception', 'lab', 'pharmacy', 'centraladmin', 'hospitaladmin'];
        const userRole = (req.user.role || '').toLowerCase();
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

        // Determine if ID is ObjectId or patientId string
        const mongoose = require('mongoose');
        const isObjectId = mongoose.Types.ObjectId.isValid(userId);
        
        // Find the user first to get their actual ObjectId for relations
        // Always use MasterUser — patients are registered in master DB
        const userQuery = isObjectId ? { _id: userId } : { patientId: userId };
        const user = await MasterUser.findOne(userQuery).lean();

        if (!user) {
            return res.status(404).json({ success: false, message: 'Patient not found' });
        }

        const realUserId = user._id;
        const patientIdStr = user.patientId || userId;

        // HARD ISOLATION: Scope all data to the staff's hospital
        const hid = req.user.hospitalId;
        const hFilter = hid ? { hospitalId: hid } : {};

        const [visits, labs, pharmacies, appointments] = await Promise.all([
            ClinicalVisit.find({ $or: [{ patientId: realUserId }, { patientId: patientIdStr }], ...hFilter }).lean(),
            LabReport.find({ userId: realUserId, ...hFilter }).lean(),
            PharmacyOrder.find({ userId: realUserId, ...hFilter }).lean(),
            Appointment.find({ $or: [{ userId: realUserId }, { patientId: patientIdStr }], ...hFilter }).lean()
        ]);

        let timeline = [];

        visits.forEach(v => {
            let summary = {
                primaryComplaint: v.intake?.chiefComplaint || 'No complaint recorded',
                doctorSeen: v.doctorConsultation?.doctorId || 'Pending',
                outcome: v.doctorConsultation?.diagnosis?.join(', ') || 'Processing'
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

        timeline.sort((a, b) => new Date(b.date) - new Date(a.date));

        res.json({ success: true, user, timeline });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;