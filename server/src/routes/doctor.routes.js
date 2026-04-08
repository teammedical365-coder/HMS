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
const getDoctorQuery = async (userId, hospitalId) => {
    try {
        const doctorProfile = await Doctor.findOne({ userId });
        const query = { $or: [{ doctorUserId: userId }] };
        if (doctorProfile) {
            query.$or.push({ doctorId: doctorProfile._id });
        }
        // HARD ISOLATION: always scope to hospital
        if (hospitalId) {
            query.hospitalId = hospitalId;
        }
        return query;
    } catch (error) {
        const q = { doctorUserId: userId };
        if (hospitalId) q.hospitalId = hospitalId;
        return q;
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

        let hospitalIdFilter = req.query.hospitalId || null;

        // If no explicit query param, check if they sent a valid token (e.g. Receptionist fetching doctors)
        if (!hospitalIdFilter && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
            try {
                const token = req.headers.authorization.split(' ')[1];
                const jwt = require('jsonwebtoken');
                const decoded = jwt.verify(token, process.env.JWT_SECRET || 'a7ad54f3356c02e5256a7a148afecede');
                if (decoded.hospitalId) {
                    hospitalIdFilter = decoded.hospitalId;
                }
            } catch (err) {
                // Ignore gracefully for public guests
            }
        }

        // Apply absolute hospital isolation filter if requested or inferred
        if (hospitalIdFilter) {
            // Need mongoose to cast toObjectId sometimes, but usually string match works if schema defines it as ObjectId
            query.hospitalId = hospitalIdFilter;
        }

        const doctors = await Doctor.find(query)
            .populate('userId', 'name email phone role')
            .select('name specialty services availability consultationFee image bio userId departments')
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
        const query = await getDoctorQuery(doctorUserId, req.user.hospitalId);

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
        const hid = req.user.hospitalId;

        // Get patient info — scope to hospital
        const patientQuery = { _id: patientId };
        if (hid) patientQuery.hospitalId = hid;
        const patient = await User.findOne(patientQuery).lean();
        if (!patient) return res.status(404).json({ success: false, message: 'Patient not found' });

        // Scope all sub-queries to hospital
        const apptQ = { userId: patientId };
        const labQ = { userId: patientId };
        const rxQ = { $or: [{ userId: patientId }, { patientId: patientId }] };
        if (hid) {
            apptQ.hospitalId = hid;
            labQ.hospitalId = hid;
            rxQ.hospitalId = hid;
        }

        const [appointments, labReports, pharmacyOrders] = await Promise.all([
            Appointment.find(apptQ).populate('doctorId', 'name specialty').sort({ appointmentDate: -1 }).lean(),
            LabReport.find(labQ).sort({ createdAt: -1 }).lean(),
            PharmacyOrder.find(rxQ).sort({ createdAt: -1 }).lean()
        ]);

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
        const updates = req.body;
        const hospitalId = req.user.hospitalId;

        // Verify patient belongs to same hospital
        const findQuery = { _id: patientId };
        if (hospitalId) findQuery.hospitalId = hospitalId;
        const user = await User.findOne(findQuery);
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
            hospitalId: req.user.hospitalId || doctor.hospitalId,
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
        const apptQuery = { _id: req.params.id };
        if (req.user.hospitalId) apptQuery.hospitalId = req.user.hospitalId;
        const appointment = await Appointment.findOne(apptQuery)
            .populate('userId')
            .populate('labId', 'name')
            .lean();

        if (!appointment) return res.status(404).json({ success: false, message: 'Not found or unauthorized' });
        
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
        const query = await getDoctorQuery(doctorUserId, req.user.hospitalId);
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
// DEPARTMENT ISOLATION: If the requesting user has departments assigned,
// only show appointments where the doctor belongs to one of those departments.
router.get('/all-appointments', verifyToken, async (req, res) => {
    try {
        let query = {};
        if (req.user.hospitalId) {
            query.hospitalId = req.user.hospitalId;
        }

        // Check if the requesting user has department restrictions
        const requestingUser = await User.findById(req.user.id || req.user.userId).lean();
        const userDepts = requestingUser?.departments || [];

        let departmentDoctorIds = null;
        if (userDepts.length > 0) {
            // Find all doctors in those departments within this hospital
            const deptFilter = { departments: { $in: userDepts } };
            if (req.user.hospitalId) deptFilter.hospitalId = req.user.hospitalId;
            const deptDoctors = await Doctor.find(deptFilter).select('_id userId').lean();
            departmentDoctorIds = {
                docIds: deptDoctors.map(d => d._id),
                userIds: deptDoctors.filter(d => d.userId).map(d => d.userId)
            };
            // Scope appointments to only those doctors
            query.$or = [
                { doctorId: { $in: departmentDoctorIds.docIds } },
                { doctorUserId: { $in: departmentDoctorIds.userIds } }
            ];
        }

        const appointments = await Appointment.find(query)
            .populate('userId', 'name email phone patientId fertilityProfile')
            .populate('doctorId', 'name specialty departments')
            .populate('doctorUserId', 'name')
            .sort({ appointmentDate: -1, appointmentTime: 1 })
            .lean();

        // Attach doctor name from whichever field is available
        const enriched = appointments.map(a => ({
            ...a,
            doctorName: a.doctorId?.name || a.doctorUserId?.name || a.doctorName || 'Not Assigned'
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
        const findQuery = { _id: req.params.id };
        if (req.user.hospitalId) findQuery.hospitalId = req.user.hospitalId;
        const appointment = await Appointment.findOne(findQuery);
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
                    saltName: item.saltName || '',
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
            
            // Dynamically calculate total amount for these lab tests
            const LabTest = require('../models/labTest.model');
            const allTests = await LabTest.find();
            let totalAmount = 0;
            const hidStr = (req.user.hospitalId || appointment.hospitalId || '').toString();
            (appointment.labTests || []).forEach(testName => {
                const testObj = allTests.find(t => t.name.trim().toLowerCase() === testName.trim().toLowerCase());
                if (testObj) {
                    if (hidStr && testObj.hospitalPrices && testObj.hospitalPrices.has && testObj.hospitalPrices.has(hidStr)) {
                        totalAmount += testObj.hospitalPrices.get(hidStr) || 0;
                    } else if (hidStr && testObj.hospitalPrices && typeof testObj.hospitalPrices === 'object' && testObj.hospitalPrices[hidStr]) {
                        totalAmount += testObj.hospitalPrices[hidStr];
                    } else {
                        totalAmount += testObj.price || 0;
                    }
                }
            });

            if (!existingReport) {
                const newReport = await LabReport.create({
                    appointmentId: appointment._id,
                    patientId: pId || 'N/A',
                    userId: appointment.userId,
                    doctorId: req.user.id,
                    hospitalId: req.user.hospitalId || appointment.hospitalId,
                    labId: labId || null,
                    testNames: appointment.labTests,
                    testStatus: 'PENDING',
                    reportStatus: 'PENDING',
                    paymentStatus: 'PENDING',
                    amount: totalAmount
                });
                reportId = newReport._id;
            } else {
                existingReport.testNames = appointment.labTests;
                existingReport.labId = labId || existingReport.labId;
                existingReport.amount = totalAmount; // Update price in case tests were added/removed
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
                    hospitalId: req.user.hospitalId || appointment.hospitalId,
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
        const histQuery = { userId: req.params.patientId };
        if (req.user.hospitalId) histQuery.hospitalId = req.user.hospitalId;
        const history = await Appointment.find(histQuery).sort({ appointmentDate: -1 });
        res.json({ success: true, history });
    } catch (error) { res.status(500).json({ success: false }); }
});

// Utils
router.get('/labs-list', verifyToken, async (req, res) => {
    const labQuery = {};
    if (req.user.hospitalId) labQuery.hospitalId = req.user.hospitalId;
    const labs = await Lab.find(labQuery).select('name _id');
    res.json({ success: true, labs });
});
router.get('/medicines-list', verifyToken, async (req, res) => {
    const medQuery = { stock: { $gt: 0 } };
    if (req.user.hospitalId) medQuery.hospitalId = req.user.hospitalId;
    const medicines = await Inventory.find(medQuery).select('name category stock');
    res.json({ success: true, medicines });
});
router.get('/:doctorId/booked-slots', async (req, res) => {
    const query = {
        $or: [{ doctorId: req.params.doctorId }, { doctorUserId: req.params.doctorId }],
        appointmentDate: new Date(req.query.date),
        status: { $ne: 'cancelled' }
    };
    // Hospital isolation: only show slots for this hospital's doctor
    if (req.query.hospitalId) {
        query.hospitalId = req.query.hospitalId;
    }
    const appointments = await Appointment.find(query);
    res.json({ success: true, bookedSlots: appointments.map(app => app.appointmentTime) });
});

module.exports = router;