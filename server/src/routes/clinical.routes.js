const express = require('express');
const router = express.Router();
const ClinicalVisit = require('../models/clinicalVisit.model');
const { verifyToken } = require('../middleware/auth.middleware');
const LabReport = require('../models/labReport.model');
const PharmacyOrder = require('../models/pharmacyOrder.model');

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
        const { diagnosis, prescription, labTests, notes } = req.body;

        const visit = await ClinicalVisit.findByIdAndUpdate(
            req.params.visitId,
            {
                doctorConsultation: {
                    doctorId: req.user.id,
                    timestamp: new Date(),
                    diagnosis,
                    prescription,
                    labTests, // Store here for history
                    procedureAdvice: notes,
                    clinicalNotes: notes
                },
                status: 'completed'
            },
            { new: true }
        );

        if (!visit) return res.status(404).json({ message: 'Visit not found' });

        // --- AUTOMATIC CREATION OF LINKED RECORDS ---

        // A. CREATE PHARMACY ORDER
        if (prescription && prescription.length > 0) {
            const pharmacyOrder = new PharmacyOrder({
                appointmentId: visit.appointmentId, // Assuming visit has appointmentId
                patientId: visit.patientId, // ObjectId of User
                userId: visit.patientId,    // Duplicate for schema compatibility
                doctorId: req.user.id,
                items: prescription.map(p => ({
                    medicineName: p.medicine,
                    frequency: p.dosage, // Mapping dosage to frequency/dosage
                    duration: p.duration
                })),
                orderStatus: 'Upcoming',
                paymentStatus: 'Pending'
            });
            await pharmacyOrder.save();
        }

        // B. CREATE LAB REQUEST
        if (labTests && labTests.length > 0) {
            // Check if patientId is ObjectId or String in LabReport schema
            // Schema says patientId: String (required) and userId: ObjectId.
            // visual check of schema: patientId allows String.
            const labReport = new LabReport({
                appointmentId: visit.appointmentId,
                patientId: visit.patientId.toString(), // Using User ID as string for now
                userId: visit.patientId,
                doctorId: req.user.id,
                testNames: labTests, // Array of strings
                testStatus: 'PENDING',
                reportStatus: 'PENDING',
                paymentStatus: 'PENDING'
                // labId is left empty, to be assigned or picked up by any lab
            });
            await labReport.save();
        }

        res.json({ success: true, data: visit });
    } catch (error) {
        console.error("Diagnosis Error:", error);
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;