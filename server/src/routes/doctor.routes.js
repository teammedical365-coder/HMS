const express = require('express');
const router = express.Router();
const multer = require('multer');
const Appointment = require('../models/appointment.model');
const Doctor = require('../models/doctor.model');
const Service = require('../models/service.model');
const Lab = require('../models/lab.model');
const LabReport = require('../models/labReport.model');
const Inventory = require('../models/inventory.model');
const PharmacyOrder = require('../models/pharmacyOrder.model'); // Added for automatic order sync
const { verifyToken } = require('../middleware/auth.middleware');
const imagekit = require('../utils/imagekit');

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
    },
});

// --- ROUTE: Get Available Labs for Dropdown ---
router.get('/labs-list', verifyToken, async (req, res) => {
    try {
        if (req.user.role !== 'doctor') return res.status(403).json({ message: 'Access denied' });
        const labs = await Lab.find({}).select('name _id address');
        res.json({ success: true, labs });
    } catch (error) {
        console.error("Error fetching labs:", error);
        res.status(500).json({ success: false, message: 'Error fetching labs' });
    }
});

// --- ROUTE: Get In-Stock Medicines from Inventory ---
router.get('/medicines-list', verifyToken, async (req, res) => {
    try {
        if (req.user.role !== 'doctor') return res.status(403).json({ message: 'Access denied' });

        // Only fetch medicines that are actually in stock
        const medicines = await Inventory.find({ stock: { $gt: 0 } })
            .select('name category stock sellingPrice unit')
            .sort({ name: 1 });

        res.json({ success: true, medicines });
    } catch (error) {
        console.error("Error fetching medicines:", error);
        res.status(500).json({ success: false, message: 'Error fetching medicines' });
    }
});

// GET Public Doctors List
router.get('/', async (req, res) => {
    try {
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        const { serviceId } = req.query;
        let query = {};

        if (serviceId) {
            const cleanName = serviceId.replace(/-/g, ' ');
            const serviceDoc = await Service.findOne({
                $or: [
                    { id: serviceId },
                    { title: { $regex: cleanName, $options: 'i' } }
                ]
            });
            if (serviceDoc) {
                query = { services: { $in: [serviceDoc.id, serviceDoc.title, serviceDoc._id.toString()] } };
            }
        }

        const doctors = await Doctor.find(query)
            .populate('userId', 'name email phone role')
            .sort({ createdAt: -1 })
            .lean();

        res.json({ success: true, doctors });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error fetching doctors' });
    }
});

// GET Doctor Appointments
router.get('/appointments', verifyToken, async (req, res) => {
    try {
        if (req.user.role !== 'doctor') return res.status(403).json({ message: 'Access denied' });
        const doctorUserId = req.user.id || req.user.userId;
        const appointments = await Appointment.find({ doctorUserId })
            .populate('userId', 'name email phone patientId')
            .populate('labId', 'name')
            .sort({ appointmentDate: 1, appointmentTime: 1 })
            .lean();
        res.json({ success: true, appointments });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error fetching appointments' });
    }
});

// UPDATE Availability
router.put('/availability', verifyToken, async (req, res) => {
    try {
        if (req.user.role !== 'doctor') return res.status(403).json({ message: 'Access denied' });
        const { availability } = req.body;
        const userId = req.user.id || req.user.userId;
        const doctor = await Doctor.findOneAndUpdate({ userId }, { $set: { availability } }, { new: true });
        res.json({ success: true, availability: doctor.availability });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Update failed' });
    }
});

// CANCEL Appointment
router.patch('/appointments/:id/cancel', verifyToken, async (req, res) => {
    try {
        if (req.user.role !== 'doctor') return res.status(403).json({ message: 'Access denied' });
        const appointment = await Appointment.findById(req.params.id);
        if (!appointment || appointment.doctorUserId.toString() !== (req.user.id || req.user.userId)) {
            return res.status(403).json({ message: 'Not authorized' });
        }
        appointment.status = 'cancelled';
        await appointment.save();
        res.json({ success: true, message: 'Appointment cancelled' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Cancellation failed' });
    }
});

// UPLOAD Prescription & Sync Lab/Pharmacy Orders
router.patch('/appointments/:id/prescription', verifyToken, upload.single('prescriptionFile'), async (req, res) => {
    try {
        if (req.user.role !== 'doctor') return res.status(403).json({ message: 'Access denied' });

        const { status, diagnosis, labTests, dietPlan, pharmacy, labId } = req.body;
        const appointmentId = req.params.id;
        const doctorUserId = req.user.id || req.user.userId;

        const appointment = await Appointment.findOne({ _id: appointmentId, doctorUserId })
            .populate('userId', 'patientId');

        if (!appointment) return res.status(404).json({ message: 'Appointment not found' });

        // 1. Update Lab Selection & File Upload
        if (labId) appointment.labId = labId;
        if (req.file) {
            const result = await imagekit.upload({
                file: req.file.buffer,
                fileName: `prescription_${appointmentId}_${Date.now()}`,
                folder: '/crm'
            });
            if (!appointment.prescriptions) appointment.prescriptions = [];
            appointment.prescriptions.push({
                url: result.url,
                fileId: result.fileId,
                name: req.file.originalname,
                uploadedAt: new Date(),
                type: 'doctor_prescription'
            });
            appointment.prescription = result.url;
        }

        // 2. Update Basic Clinical Data
        if (status) appointment.status = status;
        if (diagnosis) { appointment.diagnosis = diagnosis; appointment.notes = diagnosis; }

        // 3. Parse and Save Medications & Lab Tests
        let parsedLabTests = [];
        if (labTests) {
            parsedLabTests = typeof labTests === 'string' ? JSON.parse(labTests) : labTests;
            appointment.labTests = parsedLabTests;
        }
        if (dietPlan) appointment.dietPlan = typeof dietPlan === 'string' ? JSON.parse(dietPlan) : dietPlan;

        if (pharmacy) {
            const p = typeof pharmacy === 'string' ? JSON.parse(pharmacy) : pharmacy;
            if (Array.isArray(p)) {
                appointment.pharmacy = p.map(item => ({
                    medicineName: item.name || item.medicineName,
                    frequency: item.frequency || '',
                    duration: item.duration || ''
                }));
            }
        }

        const savedDoc = await appointment.save();

        // 4. AUTOMATIC LAB REPORT SYNC
        if (parsedLabTests && parsedLabTests.length > 0) {
            const existingReport = await LabReport.findOne({ appointmentId: appointment._id });
            if (existingReport) {
                existingReport.testNames = parsedLabTests;
                if (labId) existingReport.labId = labId;
                await existingReport.save();
            } else {
                await LabReport.create({
                    appointmentId: appointment._id,
                    patientId: appointment.userId?.patientId || 'N/A',
                    userId: appointment.userId?._id,
                    doctorId: doctorUserId,
                    labId: labId || null,
                    testNames: parsedLabTests
                });
            }
        }

        // 5. AUTOMATIC PHARMACY ORDER SYNC (Added Logic)
        if (appointment.pharmacy && appointment.pharmacy.length > 0) {
            try {
                const existingOrder = await PharmacyOrder.findOne({ appointmentId: appointment._id });
                const orderData = {
                    appointmentId: appointment._id,
                    patientId: appointment.userId?.patientId || 'N/A',
                    userId: appointment.userId?._id,
                    doctorId: doctorUserId,
                    items: appointment.pharmacy,
                    orderStatus: 'Upcoming', // Initially "Upcoming" until payment
                    paymentStatus: 'Pending'
                };

                if (existingOrder) {
                    existingOrder.items = appointment.pharmacy;
                    await existingOrder.save();
                } else {
                    await PharmacyOrder.create(orderData);
                }
            } catch (pharmaError) {
                console.error("[DOCTOR] Pharmacy Sync Error:", pharmaError);
            }
        }

        res.json({ success: true, message: 'Treatment plan saved', appointment: savedDoc });
    } catch (error) {
        console.error('Update error:', error);
        res.status(500).json({ success: false, message: 'Update failed' });
    }
});

// DELETE Prescription
router.delete('/appointments/:id/prescriptions/:prescriptionId', verifyToken, async (req, res) => {
    try {
        const appointment = await Appointment.findOne({ _id: req.params.id, doctorUserId: req.user.id || req.user.userId });
        if (!appointment) return res.status(404).json({ message: 'Appointment not found' });
        appointment.prescriptions.pull({ _id: req.params.prescriptionId });
        await appointment.save();
        res.json({ success: true, message: 'Removed' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Delete failed' });
    }
});

// GET Unique Patients
router.get('/patients', verifyToken, async (req, res) => {
    try {
        const doctorUserId = req.user.id || req.user.userId;
        const appointments = await Appointment.find({ doctorUserId }).populate('userId', 'name email phone patientId');
        const uniquePatientsMap = new Map();

        appointments.forEach(app => {
            if (app.userId) {
                const id = app.userId.patientId || app.userId._id.toString();
                if (!uniquePatientsMap.has(id)) {
                    uniquePatientsMap.set(id, {
                        _id: app.userId._id,
                        patientId: id,
                        name: app.userId.name,
                        lastAppointmentDate: app.appointmentDate
                    });
                }
            }
        });
        res.json({ success: true, patients: Array.from(uniquePatientsMap.values()) });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error' });
    }
});

// GET Patient History
router.get('/patients/:patientId/history', verifyToken, async (req, res) => {
    try {
        const { patientId } = req.params;
        const doctorUserId = req.user.id || req.user.userId;
        const query = patientId.startsWith('P-') ? { patientId } : { userId: patientId };
        const history = await Appointment.find({ ...query, doctorUserId }).sort({ appointmentDate: -1 }).populate('labId', 'name');
        res.json({ success: true, history });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error' });
    }
});

// GET Booked Slots
router.get('/:doctorId/booked-slots', async (req, res) => {
    try {
        const appointments = await Appointment.find({
            $or: [{ doctorId: req.params.doctorId }, { doctorUserId: req.params.doctorId }],
            appointmentDate: new Date(req.query.date),
            status: { $ne: 'cancelled' }
        });
        res.json({ success: true, bookedSlots: appointments.map(app => app.appointmentTime) });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error' });
    }
});

module.exports = router;