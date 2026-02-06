const express = require('express');
const router = express.Router();
const multer = require('multer');
const Appointment = require('../models/appointment.model');
const Doctor = require('../models/doctor.model');
const User = require('../models/user.model'); // Need User model to update profile
const Lab = require('../models/lab.model');
const LabReport = require('../models/labReport.model');
const Inventory = require('../models/inventory.model');
const PharmacyOrder = require('../models/pharmacyOrder.model');
const { verifyToken } = require('../middleware/auth.middleware');

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
});

// --- HELPER ---
const getDoctorQuery = async (userId) => {
    try {
        const doctorProfile = await Doctor.findOne({ userId });
        const query = { $or: [{ doctorUserId: userId }] };
        if (doctorProfile) {
            query.$or.push({ doctorId: doctorProfile._id });
        }
        return query;
    } catch (error) {
        return { doctorUserId: userId };
    }
};

// 1. GET Unique Patients
router.get('/patients', verifyToken, async (req, res) => {
    try {
        const doctorUserId = req.user.id || req.user.userId;
        const query = await getDoctorQuery(doctorUserId);

        const appointments = await Appointment.find(query)
            .populate('userId', 'name email phone patientId fertilityProfile')
            .sort({ appointmentDate: -1 })
            .lean();

        const uniquePatients = {};
        appointments.forEach(app => {
            if (app.userId && app.userId._id) {
                const pid = app.userId._id.toString();
                if (!uniquePatients[pid]) {
                    uniquePatients[pid] = {
                        _id: pid,
                        patientId: app.userId.patientId,
                        name: app.userId.name,
                        phone: app.userId.phone,
                        lastVisit: app.appointmentDate,
                        profile: app.userId.fertilityProfile
                    };
                }
            }
        });
        res.json({ success: true, patients: Object.values(uniquePatients) });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error fetching patients' });
    }
});

// 2. NEW: Update Patient Profile (Intake Data) by Doctor
router.put('/patients/:patientId/profile', verifyToken, async (req, res) => {
    try {
        const { patientId } = req.params;
        const updates = req.body; // Full profile object

        // We update the User's fertilityProfile field
        // We use dot notation for nested updates if we want partial, 
        // but here we likely want to save the form state.

        const user = await User.findById(patientId);
        if (!user) return res.status(404).json({ message: 'Patient not found' });

        // Merge existing profile with updates
        user.fertilityProfile = { ...user.fertilityProfile, ...updates };
        await user.save();

        res.json({ success: true, message: 'Patient history updated successfully', profile: user.fertilityProfile });
    } catch (error) {
        console.error("Update Profile Error:", error);
        res.status(500).json({ success: false, message: 'Failed to update profile' });
    }
});

// 3. START SESSION
router.post('/session/start', verifyToken, async (req, res) => {
    try {
        const { patientId } = req.body;
        const doctorUserId = req.user.id || req.user.userId;
        const doctor = await Doctor.findOne({ userId: doctorUserId });

        if (!doctor) return res.status(404).json({ message: 'Doctor profile not found' });

        const newSession = new Appointment({
            userId: patientId,
            doctorId: doctor._id,
            doctorUserId: doctorUserId,
            doctorName: doctor.name,
            serviceName: 'Counseling / Follow-up',
            appointmentDate: new Date(),
            appointmentTime: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
            status: 'confirmed',
            amount: doctor.consultationFee,
            paymentStatus: 'pending'
        });

        await newSession.save();
        res.json({ success: true, appointment: newSession });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// 4. GET Appointment Details
router.get('/appointments/:id', verifyToken, async (req, res) => {
    try {
        const appointment = await Appointment.findById(req.params.id)
            .populate('userId')
            .populate('labId', 'name')
            .lean();

        if (!appointment) return res.status(404).json({ success: false, message: 'Not found' });
        res.json({ success: true, appointment });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error fetching details' });
    }
});

// 5. GET Appointments List
router.get('/appointments', verifyToken, async (req, res) => {
    try {
        const doctorUserId = req.user.id || req.user.userId;
        const query = await getDoctorQuery(doctorUserId);
        const appointments = await Appointment.find(query)
            .populate('userId', 'name email phone patientId')
            .sort({ appointmentDate: 1, appointmentTime: 1 })
            .lean();
        res.json({ success: true, appointments });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error fetching appointments' });
    }
});

// 6. UPDATE Session (Notes)
router.patch('/appointments/:id/prescription', verifyToken, upload.single('prescriptionFile'), async (req, res) => {
    try {
        const { status, diagnosis, labTests, dietPlan, pharmacy, notes, labId } = req.body;
        const appointment = await Appointment.findById(req.params.id);
        if (!appointment) return res.status(404).json({ message: 'Not found' });

        if (labId) appointment.labId = labId;
        if (status) appointment.status = status;
        if (diagnosis) appointment.diagnosis = diagnosis;
        if (notes) appointment.doctorNotes = notes;

        if (labTests) appointment.labTests = typeof labTests === 'string' ? JSON.parse(labTests) : labTests;
        if (dietPlan) appointment.dietPlan = typeof dietPlan === 'string' ? JSON.parse(dietPlan) : dietPlan;

        if (pharmacy) {
            const p = typeof pharmacy === 'string' ? JSON.parse(pharmacy) : pharmacy;
            if (Array.isArray(p)) {
                appointment.pharmacy = p.map(item => ({
                    medicineName: item.medicineName || item.name,
                    frequency: item.frequency || '',
                    duration: item.duration || ''
                }));
            }
        }

        await appointment.save();

        if (appointment.labTests && appointment.labTests.length > 0) {
            const existingReport = await LabReport.findOne({ appointmentId: appointment._id });
            if (!existingReport) {
                await LabReport.create({
                    appointmentId: appointment._id,
                    patientId: appointment.patientId || 'N/A',
                    userId: appointment.userId,
                    doctorId: req.user.id,
                    labId: labId || null,
                    testNames: appointment.labTests,
                    status: 'pending'
                });
            }
        }
        res.json({ success: true, message: 'Saved', appointment });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Update failed', error: error.message });
    }
});

// 7. GET Patient History
router.get('/patients/:patientId/history', verifyToken, async (req, res) => {
    try {
        const history = await Appointment.find({ userId: req.params.patientId }).sort({ appointmentDate: -1 });
        res.json({ success: true, history });
    } catch (error) { res.status(500).json({ success: false }); }
});

// Utils
router.get('/labs-list', verifyToken, async (req, res) => {
    const labs = await Lab.find({}).select('name _id');
    res.json({ success: true, labs });
});
router.get('/medicines-list', verifyToken, async (req, res) => {
    const medicines = await Inventory.find({ stock: { $gt: 0 } }).select('name category stock');
    res.json({ success: true, medicines });
});
router.get('/:doctorId/booked-slots', async (req, res) => {
    const appointments = await Appointment.find({
        $or: [{ doctorId: req.params.doctorId }, { doctorUserId: req.params.doctorId }],
        appointmentDate: new Date(req.query.date),
        status: { $ne: 'cancelled' }
    });
    res.json({ success: true, bookedSlots: appointments.map(app => app.appointmentTime) });
});

module.exports = router;