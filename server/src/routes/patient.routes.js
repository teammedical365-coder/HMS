const express = require('express');
const router = express.Router();
const User = require('../models/user.model');
const { verifyToken } = require('../middleware/auth.middleware');

// SEARCH API: Identifies patient by Phone or Name
router.get('/search', verifyToken, async (req, res) => {
    try {
        const { term } = req.query; // e.g., ?term=9876543210

        const patients = await User.find({
            $or: [
                { phone: term },
                { patientId: term },
                { name: { $regex: term, $options: 'i' } } // Case-insensitive name search
            ]
        }).select('name phone patientId dob gender city');

        res.json({ success: true, data: patients });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});
// FULL HISTORY API: Chronological Timeline Aggregation
router.get('/:id/full-history', verifyToken, async (req, res) => {
    try {
        const userId = req.params.id;
        const roleData = req.user._roleData;

        // Role-checking middleware hardening
        const allowedRoles = ['doctor', 'administrator', 'admin', 'reception', 'lab', 'pharmacy'];
        if (!roleData || (!allowedRoles.includes(roleData.name.toLowerCase()) && req.user.role !== 'administrator')) {
            return res.status(403).json({ success: false, message: 'Unauthorized access to patient history' });
        }

        // Granular Permissions: If they are Pharmacy/Lab, restrict data or just verify they have access.
        // For now, let's assume they can view if they are in allowedRoles, but maybe filter out notes for Pharmacy/Lab
        const isRestrictedRole = ['pharmacy', 'lab'].includes(roleData.name.toLowerCase());

        const ClinicalVisit = require('../models/clinicalVisit.model');
        const LabReport = require('../models/labReport.model');
        const PharmacyOrder = require('../models/pharmacyOrder.model');
        const Appointment = require('../models/appointment.model');

        const [visits, labs, pharmacies, appointments, user] = await Promise.all([
            ClinicalVisit.find({ patientId: userId }).lean(),
            LabReport.find({ userId: userId }).lean(),
            PharmacyOrder.find({ userId: userId }).lean(),
            Appointment.find({ userId: userId }).lean(),
            User.findById(userId).populate('partner').lean()
        ]);

        if (!user) {
            return res.status(404).json({ success: false, message: 'Patient not found' });
        }

        let timeline = [];

        visits.forEach(v => {
            // Visit Summaries
            let summary = {
                primaryComplaint: v.intake?.chiefComplaint || 'No complaint recorded',
                doctorSeen: v.doctorConsultation?.doctorId || 'Pending',
                outcome: v.doctorConsultation?.diagnosis?.join(', ') || 'Processing'
            };

            let item = {
                type: 'clinicalVisit',
                date: v.visitDate || v.createdAt,
                data: v,
                summary
            };

            // Granular logic: hide clinicalNotes for restricted roles
            if (isRestrictedRole && item.data.doctorConsultation) {
                delete item.data.doctorConsultation.clinicalNotes;
            }

            timeline.push(item);
        });

        labs.forEach(l => {
            timeline.push({
                type: 'labReport',
                date: l.createdAt,
                data: l
            });
        });

        pharmacies.forEach(p => {
            timeline.push({
                type: 'pharmacyOrder',
                date: p.createdAt,
                data: p
            });
        });

        appointments.forEach(a => {
            timeline.push({
                type: 'appointment',
                date: a.appointmentDate,
                data: a
            });
        });

        // Sort chronological (descending)
        timeline.sort((a, b) => new Date(b.date) - new Date(a.date));

        res.json({ success: true, user, timeline });

    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;