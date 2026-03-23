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
const Notification = require('../models/notification.model');
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
// (Moved below)

// 0. GET ALL DOCTORS (Public)
router.get('/', async (req, res) => {
    try {
        const { serviceId } = req.query;
        let query = {};

        // If serviceId filter is provided
        if (serviceId) {
            query.services = serviceId;
        }

        const doctors = await Doctor.find(query)
            .populate('userId', 'name email phone role')
            .select('name specialty services availability consultationFee image bio userId')
            .sort({ name: 1 })
            .lean();

        res.json({ success: true, doctors });
    } catch (error) {
        console.error('Get doctors error:', error);
        res.status(500).json({ success: false, message: 'Error fetching doctors' });
    }
});

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

// 1b. GET Full Patient Profile (comprehensive data)
router.get('/patients/:patientId/full-profile', verifyToken, async (req, res) => {
    try {
        const { patientId } = req.params;

        // Get patient info
        const patient = await User.findById(patientId).lean();
        if (!patient) return res.status(404).json({ success: false, message: 'Patient not found' });

        // Get all appointments for this patient
        const appointments = await Appointment.find({ userId: patientId })
            .populate('doctorId', 'name specialty')
            .sort({ appointmentDate: -1 })
            .lean();

        // Get lab reports
        const labReports = await LabReport.find({ userId: patientId })
            .sort({ createdAt: -1 })
            .lean();

        // Get pharmacy orders
        const pharmacyOrders = await PharmacyOrder.find({
            $or: [{ userId: patientId }, { patientId: patientId }]
        })
            .sort({ createdAt: -1 })
            .lean();

        res.json({
            success: true,
            patient: {
                _id: patient._id,
                name: patient.name,
                email: patient.email,
                phone: patient.phone,
                patientId: patient.patientId,
                dob: patient.dob,
                gender: patient.gender,
                bloodGroup: patient.bloodGroup,
                address: patient.address,
                city: patient.city,
                avatar: patient.avatar,
                aadhaarNumber: patient.aadhaarNumber,
                isAadhaarVerified: patient.isAadhaarVerified,
                fertilityProfile: patient.fertilityProfile || {},
                createdAt: patient.createdAt
            },
            appointments,
            labReports,
            pharmacyOrders
        });
    } catch (error) {
        console.error('Full profile error:', error);
        res.status(500).json({ success: false, message: 'Error fetching patient profile' });
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
        
        // Fetch doctor's specific departments, fallback to hospital departments
        const doctorUser = await User.findById(req.user.id || req.user.userId).populate('hospitalId');
        let departments = [];
        if (doctorUser && doctorUser.departments && doctorUser.departments.length > 0) {
            departments = doctorUser.departments;
        } else if (doctorUser && doctorUser.hospitalId && doctorUser.hospitalId.departments) {
            departments = doctorUser.hospitalId.departments;
        }

        res.json({ success: true, appointment, departments });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error fetching details' });
    }
});

// 5. GET Appointments List (for this doctor)
router.get('/appointments', verifyToken, async (req, res) => {
    try {
        const doctorUserId = req.user.id || req.user.userId;
        const query = await getDoctorQuery(doctorUserId);
        const appointments = await Appointment.find(query)
            .populate('userId', 'name email phone patientId fertilityProfile')
            .sort({ appointmentDate: 1, appointmentTime: 1 })
            .lean();
        res.json({ success: true, appointments });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error fetching appointments' });
    }
});

// 5b. GET ALL Appointments (for nurse/staff - all doctors)
router.get('/all-appointments', verifyToken, async (req, res) => {
    try {
        let query = {};
        if (req.user.hospitalId) {
            query.hospitalId = req.user.hospitalId;
        }

        const appointments = await Appointment.find(query)
            .populate('userId', 'name email phone patientId fertilityProfile')
            .populate('doctorId', 'name specialty')
            .populate('doctorUserId', 'name')
            .sort({ appointmentDate: -1, appointmentTime: 1 })
            .lean();

        // Attach doctor name from whichever field is available
        const enriched = appointments.map(a => ({
            ...a,
            doctorName: a.doctorId?.name || a.doctorUserId?.name || 'Not Assigned'
        }));

        res.json({ success: true, appointments: enriched });
    } catch (error) {
        console.error('All appointments error:', error);
        res.status(500).json({ success: false, message: 'Error fetching all appointments' });
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

        if (labTests) {
            if (typeof labTests === 'string') {
                try {
                    appointment.labTests = JSON.parse(labTests);
                } catch (e) {
                    appointment.labTests = labTests.split(',').map(t => t.trim()).filter(Boolean);
                }
            } else {
                appointment.labTests = labTests;
            }
        }

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

            let pId = appointment.patientId;
            let pName = 'Patient';
            if (!pId || !appointment.userId.name) {
                const pUser = await User.findById(appointment.userId);
                if (pUser) {
                    pId = pUser.patientId;
                    pName = pUser.name;
                }
            } else {
                pName = appointment.userId.name || pName;
            }

            let reportId;
            if (!existingReport) {
                const newReport = await LabReport.create({
                    appointmentId: appointment._id,
                    patientId: pId || 'N/A',
                    userId: appointment.userId,
                    doctorId: req.user.id,
                    labId: labId || null,
                    testNames: appointment.labTests,
                    testStatus: 'PENDING',
                    reportStatus: 'PENDING',
                    paymentStatus: 'PENDING'
                });
                reportId = newReport._id;
            } else {
                existingReport.testNames = appointment.labTests;
                existingReport.labId = labId || existingReport.labId;
                await existingReport.save();
                reportId = existingReport._id;
            }

            // --- Dispatch Lab Notification ---
            await Notification.create({
                senderId: req.user.id,
                recipientRole: 'lab',
                message: `New lab tests prescribed for ${pName} (${pId || 'N/A'})`,
                referenceType: 'LabReport',
                referenceId: reportId,
                patientId: pId || 'N/A'
            });

            const io = req.app.get('io');
            if (io) {
                io.to('lab').emit('newNotification', { message: `New lab tests prescribed for ${pName}` });
            }

        } else {
            // Remove pending reports if no tests prescribed anymore
            await LabReport.deleteOne({ appointmentId: appointment._id, testStatus: 'PENDING' });
        }

        // --- NEW: Create Pharmacy Order ---
        if (appointment.pharmacy && appointment.pharmacy.length > 0) {
            const existingOrder = await PharmacyOrder.findOne({ appointmentId: appointment._id });
            if (!existingOrder) {
                await PharmacyOrder.create({
                    appointmentId: appointment._id,
                    patientId: appointment.patientId || 'N/A',
                    userId: appointment.userId,
                    doctorId: req.user.id,
                    items: appointment.pharmacy.map(p => ({
                        medicineName: p.medicineName,
                        frequency: p.frequency,
                        duration: p.duration
                    })),
                    orderStatus: 'Upcoming',
                    paymentStatus: 'Pending'
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