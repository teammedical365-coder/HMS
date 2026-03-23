const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth.middleware');
const { resolveTenant } = require('../middleware/tenantMiddleware');
const { getTenantModels } = require('../db/tenantModels');
// Master models (used as fallback when no tenant context)
const MasterUser = require('../models/user.model');

// SEARCH API: Identifies patient by Phone or Name — scoped to hospital tenant
router.get('/search', verifyToken, resolveTenant, async (req, res) => {
    try {
        const { term } = req.query;

        let User = MasterUser;
        if (req.tenantDb) {
            ({ User } = getTenantModels(req.tenantDb));
        }

        const patients = await User.find({
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
        const hasAccess = allowedRoles.includes(userRole) || allowedRoles.includes(dynRole);

        if (!hasAccess && userRole !== 'superadmin') {
            return res.status(403).json({ success: false, message: 'Unauthorized access to patient history' });
        }

        const isRestrictedRole = ['pharmacy', 'lab'].includes((roleData.name || '').toLowerCase());

        // Use tenant models if available, fallback to master
        let User = MasterUser;
        let ClinicalVisit, LabReport, PharmacyOrder, Appointment;

        if (req.tenantDb) {
            const models = getTenantModels(req.tenantDb);
            User = models.User;
            Appointment = models.Appointment;
            LabReport = models.LabReport;
            PharmacyOrder = models.PharmacyOrder;
        } else {
            ClinicalVisit = require('../models/clinicalVisit.model');
            LabReport = require('../models/labReport.model');
            PharmacyOrder = require('../models/pharmacyOrder.model');
            Appointment = require('../models/appointment.model');
        }
        // ClinicalVisit is always from master for now (complex schema)
        if (!ClinicalVisit) ClinicalVisit = require('../models/clinicalVisit.model');

        // Determine if ID is ObjectId or patientId string
        const mongoose = require('mongoose');
        const isObjectId = mongoose.Types.ObjectId.isValid(userId);
        
        // Find the user first to get their actual ObjectId for relations
        const userQuery = isObjectId ? { _id: userId } : { patientId: userId };
        const user = await User.findOne(userQuery).lean();

        if (!user) {
            return res.status(404).json({ success: false, message: 'Patient not found' });
        }

        const realUserId = user._id;
        const patientIdStr = user.patientId || userId;

        const [visits, labs, pharmacies, appointments] = await Promise.all([
            ClinicalVisit.find({ $or: [{ patientId: realUserId }, { patientId: patientIdStr }] }).lean(),
            LabReport.find({ userId: realUserId }).lean(),
            PharmacyOrder.find({ userId: realUserId }).lean(),
            Appointment.find({ $or: [{ userId: realUserId }, { patientId: patientIdStr }] }).lean()
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