const express = require('express');
const router = express.Router();
const ClinicalVisit = require('../models/clinicalVisit.model');
const { verifyToken } = require('../middleware/auth.middleware');

// 1. JUNIOR DR / NURSE: Create Visit & Add Vitals
router.post('/intake', verifyToken, async (req, res) => {
    try {
        const { patientId, vitals, intervalHistory, chiefComplaint } = req.body;

        const visit = new ClinicalVisit({
            patientId,
            intake: {
                filledBy: req.user.id,
                timestamp: new Date(),
                vitals,
                intervalHistory,
                chiefComplaint,
                completed: true
            },
            status: 'ready_for_doctor' // Triggers the patient to appear in Doctor's list
        });

        await visit.save();
        res.json({ success: true, data: visit });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// 2. SENIOR DOCTOR: Get Patient History (The "Timeline")
router.get('/history/:patientId', verifyToken, async (req, res) => {
    try {
        // Returns all previous visits sorted by date (newest first)
        // This gives the "fully intact medical knowledge"
        const history = await ClinicalVisit.find({ patientId: req.params.patientId })
            .sort({ visitDate: -1 })
            .populate('intake.filledBy', 'name')
            .populate('doctorConsultation.doctorId', 'name');

        res.json({ success: true, data: history });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// 3. SENIOR DOCTOR: Finalize Diagnosis
router.post('/diagnose/:visitId', verifyToken, async (req, res) => {
    try {
        const { diagnosis, prescription, notes } = req.body;

        const visit = await ClinicalVisit.findByIdAndUpdate(
            req.params.visitId,
            {
                doctorConsultation: {
                    doctorId: req.user.id,
                    timestamp: new Date(),
                    diagnosis,
                    prescription,
                    clinicalNotes: notes
                },
                status: 'completed'
            },
            { new: true }
        );
        res.json({ success: true, data: visit });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;