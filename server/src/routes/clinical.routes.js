const express = require('express');
const router = express.Router();
const ClinicalVisit = require('../models/clinicalVisit.model');
const { verifyToken } = require('../middleware/auth.middleware');
const LabReport = require('../models/labReport.model');
const PharmacyOrder = require('../models/pharmacyOrder.model');

// 1. NURSE: Create Visit & Add Vitals
router.post('/intake', verifyToken, async (req, res) => {
    try {
        const { patientId, vitals, intervalHistory, chiefComplaint } = req.body;

        const visit = new ClinicalVisit({
            patientId,
            hospitalId: req.user.hospitalId,   // RLS: scope to hospital
            intake: {
                filledBy: req.user.id,
                timestamp: new Date(),
                vitals,
                intervalHistory,
                chiefComplaint,
                completed: true
            },
            status: 'ready_for_doctor'
        });

        await visit.save();
        res.json({ success: true, data: visit });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// 2. DOCTOR: Get Patient History
router.get('/history/:patientId', verifyToken, async (req, res) => {
    try {
        // RLS: scope by hospitalId so cross-hospital data never leaks
        const filter = { patientId: req.params.patientId };
        if (req.user.hospitalId) filter.hospitalId = req.user.hospitalId;

        const history = await ClinicalVisit.find(filter)
            .sort({ visitDate: -1 })
            .populate('intake.filledBy', 'name')
            .populate('doctorConsultation.doctorId', 'name');

        res.json({ success: true, history });   // key: history (was: data)
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// 3. DOCTOR: Finalize Diagnosis
router.post('/diagnose/:visitId', verifyToken, async (req, res) => {
    try {
        const { diagnosis, prescription, labTests, notes } = req.body;

        // RLS: validate the visit belongs to this hospital before updating
        const visitFilter = { _id: req.params.visitId };
        if (req.user.hospitalId) visitFilter.hospitalId = req.user.hospitalId;

        const visit = await ClinicalVisit.findOneAndUpdate(
            visitFilter,
            {
                doctorConsultation: {
                    doctorId: req.user.id,
                    timestamp: new Date(),
                    diagnosis,
                    prescription,
                    labTests,
                    procedureAdvice: notes,
                    clinicalNotes: notes
                },
                status: 'completed'
            },
            { new: true }
        );

        if (!visit) return res.status(404).json({ message: 'Visit not found or access denied' });

        const io = req.app.get('io');
        const Notification = require('../models/notification.model');

        // A. CREATE PHARMACY ORDER — wrapped so it never blocks consultation completion
        if (prescription && prescription.length > 0) {
            try {
                const pharmacyOrder = new PharmacyOrder({
                    appointmentId: visit.appointmentId || visit._id,
                    patientId: visit.patientId.toString(),
                    userId: visit.patientId,
                    doctorId: req.user.id,
                    hospitalId: req.user.hospitalId,    // RLS: set hospitalId
                    items: prescription.map(p => ({
                        medicineName: p.medicine,
                        frequency: p.dosage,
                        duration: p.duration
                    })),
                    orderStatus: 'Upcoming',
                    paymentStatus: 'Pending'
                });
                await pharmacyOrder.save();

                const notif = new Notification({
                    senderId: req.user.id,
                    recipientRole: 'pharmacy',
                    hospitalId: req.user.hospitalId,
                    message: 'New prescription received for dispensing.',
                    referenceType: 'PharmacyOrder',
                    referenceId: pharmacyOrder._id,
                    patientId: visit.patientId.toString()
                });
                await notif.save();
                if (io) io.to('pharmacy').emit('new_notification', notif);
            } catch (pharmacyErr) {
                console.error('Pharmacy order creation failed (non-blocking):', pharmacyErr.message);
            }
        }

        // B. CREATE LAB REQUEST — wrapped so it never blocks consultation completion
        if (labTests && labTests.length > 0) {
            try {
                const labReport = new LabReport({
                    appointmentId: visit.appointmentId || visit._id,
                    patientId: visit.patientId.toString(),
                    userId: visit.patientId,
                    doctorId: req.user.id,
                    hospitalId: req.user.hospitalId,    // RLS: set hospitalId
                    testNames: labTests,
                    testStatus: 'PENDING',
                    reportStatus: 'PENDING',
                    paymentStatus: 'PENDING'
                });
                await labReport.save();

                const notif = new Notification({
                    senderId: req.user.id,
                    recipientRole: 'lab',
                    hospitalId: req.user.hospitalId,
                    message: 'New lab test requested.',
                    referenceType: 'LabReport',
                    referenceId: labReport._id,
                    patientId: visit.patientId.toString()
                });
                await notif.save();
                if (io) io.to('lab').emit('new_notification', notif);
            } catch (labErr) {
                console.error('Lab report creation failed (non-blocking):', labErr.message);
            }
        }

        res.json({ success: true, data: visit });
    } catch (error) {
        console.error('Diagnosis Error:', error);
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
