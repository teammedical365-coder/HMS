const express = require('express');
const router = express.Router();
const Appointment = require('../models/appointment.model');
const User = require('../models/user.model');
const Doctor = require('../models/doctor.model'); // Required to fetch doctor details
const { verifyToken } = require('../middleware/auth.middleware');

const verifyReception = (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    const userRole = req.user.role;
    const dynamicRoleName = req.user._roleData?.name;
    const permissions = req.user._roleData?.permissions || [];

    // Normalize
    const roleStr = typeof userRole === 'string' ? userRole.toLowerCase() : '';
    const dynRoleStr = dynamicRoleName ? dynamicRoleName.toLowerCase() : '';

    // Expanded Allowed Roles list (Substring Check)
    const allowed = ['reception', 'admin', 'superadmin', 'staff', 'front'];

    const hasAccess = allowed.some(keyword => dynRoleStr.includes(keyword) || roleStr.includes(keyword));

    if (hasAccess) {
        return next();
    }

    // Also check Permissions if available
    if (permissions.includes('reception_access') || permissions.includes('*')) {
        return next();
    }

    // Expanded debug info in error for troubleshooting
    return res.status(403).json({
        success: false,
        message: `Access denied: Reception access only. Your role: ${dynamicRoleName || userRole}`
    });
};

// 1. REGISTER (WALK-IN)
router.post('/register', verifyToken, verifyReception, async (req, res) => {
    try {
        let { name, email, phone } = req.body;

        // Sanitize — trim whitespace and convert empty strings to undefined
        name = name ? String(name).trim() : undefined;
        phone = phone ? String(phone).trim() : undefined;
        email = email ? String(email).trim() : undefined; // crucial: empty string -> undefined

        // Phone is required for identification, Email is optional
        if (!name || !phone) {
            return res.status(400).json({ success: false, message: 'Name and Phone are required' });
        }

        // Check if patient exists by Phone (or Email if provided)
        const orClauses = [{ phone }];
        if (email) orClauses.push({ email });

        let userQuery = { $or: orClauses };
        if (req.user.hospitalId) {
            userQuery.hospitalId = req.user.hospitalId;
        }

        let user = await User.findOne(userQuery);

        if (user) {
            // Update name if changed
            user.name = name;
            // Only update email if provided and different (avoid overwriting with empty)
            if (email && email !== user.email) user.email = email;

            // Backfill PatientId for legacy walk-ins that were created without one
            if (!user.patientId) {
                user.patientId = 'MRN-' + Date.now() + Math.floor(Math.random() * 1000);
            }

            await user.save();
            return res.status(200).json({ success: true, message: 'Patient record updated!', user });
        }

        // Create New Walk-in Patient — use collision-resistant ID
        const patientId = 'MRN-' + Date.now() + Math.floor(Math.random() * 1000);

        const userData = {
            name,
            phone,
            role: 'patient',
            patientId,
            fertilityProfile: {},
            hospitalId: req.user.hospitalId || undefined
        };

        // Only attach email if it actually exists, to prevent duplicate sparse index errors
        if (email) userData.email = email;

        const newUser = new User(userData);

        await newUser.save();
        res.status(201).json({ success: true, message: 'Patient registered successfully!', user: newUser });
    } catch (error) {
        console.error("Register Error:", error);
        if (error.code === 11000) {
            // Tell the user exactly which field is duplicated
            const field = Object.keys(error.keyPattern || {})[0] || 'field';
            const friendlyField = field === 'phone' ? 'Phone number'
                : field === 'email' ? 'Email'
                    : field === 'patientId' ? 'Patient ID'
                        : field;
            return res.status(400).json({
                success: false,
                message: `A patient with this ${friendlyField} already exists. Please search for the existing patient instead.`
            });
        }
        res.status(500).json({ success: false, message: error.message });
    }
});

// 1.5 AADHAAR VERIFICATION (OTP FLOW - SIMULATED)
router.post('/send-aadhaar-otp', verifyToken, verifyReception, async (req, res) => {
    try {
        const { aadhaarNumber } = req.body;
        if (!/^\d{12}$/.test(aadhaarNumber)) return res.status(400).json({ success: false, message: 'Invalid Aadhaar Format (12 digits required)' });

        // Simulate Check: Reject "9999..."
        if (aadhaarNumber.startsWith('9999')) return res.status(400).json({ success: false, message: 'Verification Failed: Invalid Aadhaar Number (Simulated).' });

        // Simulate API Delay
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Simulate Sending OTP
        res.json({ success: true, message: 'OTP sent to mobile linked with Aadhaar (Simulated: Use 123456)' });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

router.post('/verify-aadhaar-otp', verifyToken, verifyReception, async (req, res) => {
    try {
        const { aadhaarNumber, otp } = req.body;

        // Mock OTP Validation (Use '123456' for success)
        if (otp !== '123456') {
            return res.status(400).json({ success: false, message: 'Invalid OTP. Try 123456.' });
        }

        // Check if Aadhaar is already linked
        const existingUser = await User.findOne({ aadhaarNumber });
        if (existingUser) {
            return res.status(409).json({ success: false, message: `Aadhaar already linked to patient: ${existingUser.name} (${existingUser.phone})` });
        }

        // Mock KYC Data Return
        const mockKYCData = {
            verified: true,
            fullName: "Simulated Aadhaar User",
            dob: "1995-05-20",
            gender: "Female",
            address: "42, Simulated Residency, Connaught Place, New Delhi - 110001",
            photo: "https://via.placeholder.com/150"
        };

        res.json({ success: true, message: 'Aadhaar Verified Successfully', data: mockKYCData });
    } catch (e) {
        console.error(e);
        res.status(500).json({ message: e.message });
    }
});

// 2. SEARCH
router.get('/search-patients', verifyToken, verifyReception, async (req, res) => {
    try {
        const { query } = req.query;
        if (!query || query.length < 2) return res.json({ success: true, patients: [] });

        const queryFilter = {
            role: { $in: ['user', 'patient'] },
            $or: [
                { name: { $regex: query, $options: 'i' } },
                { phone: { $regex: query, $options: 'i' } },
                { patientId: { $regex: query, $options: 'i' } }
            ]
        };

        if (req.user.hospitalId) {
            queryFilter.hospitalId = req.user.hospitalId;
        }

        const patients = await User.find(queryFilter).select('name phone email patientId fertilityProfile');

        res.json({ success: true, patients });
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

// 3. UPDATE INTAKE
router.put('/intake/:userId', verifyToken, verifyReception, async (req, res) => {
    try {
        const { userId } = req.params;
        const updates = req.body;
        const updateQuery = {};

        // Map Root fields
        if (updates.firstName || updates.lastName) updateQuery.name = `${updates.firstName || ''} ${updates.lastName || ''}`.trim();
        if (updates.email) updateQuery.email = updates.email;
        if (updates.phone || updates.mobile) updateQuery.phone = updates.phone || updates.mobile;
        if (updates.address) updateQuery.address = updates.address;
        if (updates.city) updateQuery.city = updates.city;
        if (updates.state) updateQuery.state = updates.state;
        if (updates.zipCode) updateQuery.zipCode = updates.zipCode;

        // Update Root Aadhaar Fields
        if (updates.aadhaar) updateQuery.aadhaarNumber = updates.aadhaar;
        if (updates.isAadhaarVerified !== undefined) updateQuery.isAadhaarVerified = updates.isAadhaarVerified;

        // Map Fertility Profile fields
        const profileFields = [
            'title', 'firstName', 'middleName', 'lastName', 'dob', 'age', 'gender', 'maritalStatus', 'occupation',
            'aadhaar', 'altPhone', 'patientCategory', 'nationality', 'isInternational', 'language', 'languagesKnown',
            'height', 'weight', 'bmi', 'bloodGroup',
            'partnerTitle', 'partnerFirstName', 'partnerLastName', 'partnerDob', 'partnerAge', 'partnerAadhaar',
            'partnerMobile', 'partnerAltPhone', 'partnerEmail', 'partnerAddressSame', 'partnerAddress',
            'partnerArea', 'partnerCity', 'partnerState', 'partnerCountry', 'partnerPinCode', 'partnerNationality',
            'partnerHeight', 'partnerWeight', 'partnerBmi', 'partnerBloodGroup',
            'reasonForVisit', 'speciality', 'doctor', 'referralType', 'visitDate', 'visitTime',
            'infertilityType', 'chiefComplaint', 'historyPulse', 'historyBp', 'infertilityDuration', 'marriageDuration', 'generalComments',
            'lmpDate', 'menstrualRegularity', 'menstrualFlow', 'menstrualPain', 'cycleDetails',
            'familyHistory', 'medicalHistoryDiabetes', 'medicalHistoryHypertension', 'medicalHistoryThyroid',
            'medicalHistoryHeart', 'medicalHistoryAsthma', 'medicalHistoryTb', 'medicalHistoryOther', 'medicalHistoryPcos',
            'para', 'abortion', 'ectopic', 'liveBirth', 'recurrentLoss', 'obstetricComments',
            'pastInvestigations', 'partnerBp', 'partnerMedicalComments',
            'labResults', 'hormonalValues', 'usgRemarks', 'psychiatricHistory', 'sexualHistory', 'identificationMarks', 'addictionHistory',
            'treatmentHistory',
            'examGeneral', 'examSystemic', 'examBreast', 'examAbdomen', 'examSpeculum', 'examVaginal',
            'hirsutism', 'galactorrhoea', 'papSmear',
            'usgType', 'afcRight', 'afcLeft', 'amh', 'uterusSize', 'uterusPosition',
            'ovaryRightSize', 'ovaryLeftSize', 'endometriumThickness',
            'diagnosisInfertilityType', 'maleFactor', 'femaleFactor', 'diagnosisYears', 'diagnosisOthers',
            'doctorNotes', 'prescriptionComments', 'procedureAdvice', 'followUpDate'
        ];

        profileFields.forEach(field => {
            if (updates[field] !== undefined) {
                updateQuery[`fertilityProfile.${field}`] = updates[field];
            }
        });

        const updatedUser = await User.findByIdAndUpdate(userId, { $set: updateQuery }, { new: true, runValidators: false });
        if (!updatedUser) return res.status(404).json({ success: false, message: 'Patient not found' });
        res.json({ success: true, message: 'Updated', user: updatedUser });
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

// 4. APPOINTMENTS
router.get('/appointments', verifyToken, verifyReception, async (req, res) => {
    try {
        let queryFilter = {};
        if (req.user.hospitalId) queryFilter.hospitalId = req.user.hospitalId;

        // Default: today's active appointments only (reception queue view)
        // Pass ?all=true to get full history
        if (req.query.all !== 'true') {
            const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
            const todayEnd   = new Date(); todayEnd.setHours(23, 59, 59, 999);
            queryFilter.appointmentDate = { $gte: todayStart, $lte: todayEnd };
            queryFilter.status = { $nin: ['cancelled', 'completed'] };
        }

        const appointments = await Appointment.find(queryFilter)
            .populate('userId', 'name email phone patientId')
            .populate('doctorId', 'name')
            .sort({ tokenNumber: 1, appointmentTime: 1 })
            .lean();
        res.json({ success: true, appointments });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

// 5. RESCHEDULE & CANCEL
router.patch('/appointments/:id/reschedule', verifyToken, verifyReception, async (req, res) => {
    const { id } = req.params; const { date, time } = req.body;
    const reschQuery = { _id: id };
    if (req.user.hospitalId) reschQuery.hospitalId = req.user.hospitalId;
    const appt = await Appointment.findOne(reschQuery);
    if (!appt) return res.status(404).json({ success: false, message: 'Appointment not found or unauthorized' });
    appt.appointmentDate = date;
    appt.appointmentTime = time;
    appt.status = 'confirmed';
    await appt.save();
    res.json({ success: true });
});
router.patch('/appointments/:id/cancel', verifyToken, verifyReception, async (req, res) => {
    const cancelQuery = { _id: req.params.id };
    if (req.user.hospitalId) cancelQuery.hospitalId = req.user.hospitalId;
    const appt = await Appointment.findOneAndUpdate(cancelQuery, { status: 'cancelled' });
    if (!appt) return res.status(404).json({ success: false, message: 'Appointment not found or unauthorized' });
    res.json({ success: true });
});

// 6. BOOK APPOINTMENT (NEW: Assign Doctor)
router.post('/book-appointment', verifyToken, verifyReception, async (req, res) => {
    try {
        const { patientId, doctorId, date, time, notes, paymentMethod, paymentStatus, amount } = req.body;

        if (!patientId || !doctorId || !date) {
            return res.status(400).json({ success: false, message: 'Missing booking details' });
        }

        const reqDateMatch = String(date).split('T')[0];
        const todayMatch = new Date().toISOString().split('T')[0];
        if (reqDateMatch < todayMatch) {
            return res.status(400).json({ success: false, message: 'Cannot book appointments in the past' });
        }

        const patient = await User.findById(patientId);
        if (!patient) return res.status(404).json({ success: false, message: 'Patient not found' });

        const doctor = await Doctor.findById(doctorId);
        if (!doctor) return res.status(404).json({ success: false, message: 'Doctor not found' });

        const hospitalId = req.user.hospitalId || patient.hospitalId;

        // Determine appointment mode
        const Hospital = require('../models/hospital.model');
        const hospital = hospitalId ? await Hospital.findById(hospitalId).select('appointmentMode') : null;
        const isTokenMode = hospital?.appointmentMode === 'token';

        let finalTime = time;
        let tokenNumber = null;

        const startOfDay = new Date(date);
        startOfDay.setUTCHours(0, 0, 0, 0);
        const endOfDay = new Date(date);
        endOfDay.setUTCHours(23, 59, 59, 999);

        if (isTokenMode) {
            // Token mode: assign next sequential token for this doctor on this date
            const count = await Appointment.countDocuments({
                doctorId: doctor._id,
                appointmentDate: { $gte: startOfDay, $lte: endOfDay },
                status: { $ne: 'cancelled' }
            });
            tokenNumber = count + 1;
            finalTime = `token-${tokenNumber}`;
        } else {
            // Slot mode: time required, check double-booking
            if (!time) {
                return res.status(400).json({ success: false, message: 'Appointment time is required for slot-based booking' });
            }
            const existing = await Appointment.findOne({
                doctorId: doctor._id,
                appointmentDate: { $gte: startOfDay, $lte: endOfDay },
                appointmentTime: time,
                status: { $ne: 'cancelled' }
            });
            if (existing) {
                return res.status(400).json({ success: false, message: 'Slot already booked for this doctor at this time!' });
            }
        }

        const newAppointment = new Appointment({
            userId: patient._id,
            hospitalId,
            patientId: patient.patientId || 'WALK-IN',
            doctorId: doctor._id,
            doctorUserId: doctor.userId,
            doctorName: doctor.name,
            serviceId: doctor.services?.[0] || 'general',
            serviceName: 'Walk-in Visit',
            appointmentDate: new Date(date),
            appointmentTime: finalTime || '',
            tokenNumber,
            amount: Number(amount) || doctor.consultationFee || 0,
            status: 'confirmed',
            paymentStatus: paymentStatus || 'Paid',
            paymentMethod: paymentMethod || 'Cash',
            notes: notes || 'Walk-in created by reception',
            bookedBy: req.user._id
        });

        await newAppointment.save();
        res.json({ success: true, message: 'Appointment booked successfully!', appointment: newAppointment, tokenNumber });

    } catch (error) {
        console.error("Reception Booking Error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// 7b. CONFIRM PAYMENT for an existing appointment
router.patch('/appointments/:id/confirm-payment', verifyToken, verifyReception, async (req, res) => {
    try {
        const { paymentMethod, amount } = req.body;
        const findQuery = { _id: req.params.id };
        if (req.user.hospitalId) findQuery.hospitalId = req.user.hospitalId;
        const appt = await Appointment.findOne(findQuery);
        if (!appt) return res.status(404).json({ success: false, message: 'Appointment not found or unauthorized' });
        appt.paymentStatus = 'Paid';
        appt.paymentMethod = paymentMethod || appt.paymentMethod || 'Cash';
        if (amount !== undefined) appt.amount = amount;
        await appt.save();
        res.json({ success: true, appointment: appt });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// 7. PATIENT CHECK-IN (Reception to Doctor/Clinic Workflow)
router.post('/check-in', verifyToken, verifyReception, async (req, res) => {
    try {
        const { patientId, appointmentId } = req.body;

        if (!patientId) {
            return res.status(400).json({ success: false, message: 'Patient ID is required' });
        }

        const ClinicalVisit = require('../models/clinicalVisit.model');
        const Notification = require('../models/notification.model');
        const io = req.app.get('io');

        // Create clinical visit for today
        const visit = new ClinicalVisit({
            patientId,
            appointmentId: appointmentId || null,
            status: 'check_in'
        });
        await visit.save();

        if (appointmentId) {
            // Update appointment status
            await Appointment.findByIdAndUpdate(appointmentId, { status: 'completed' }); // Or maybe a new status like 'in_progress'
        }

        // Emit socket event to update Reception/Doctor grids
        if (io) {
            io.emit('patient_status_changed', { visitId: visit._id, patientId, status: 'check_in', appointmentId });
        }

        res.json({ success: true, message: 'Patient checked in successfully', visit });
    } catch (error) {
        console.error("Check-in Error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// 8. TRANSACTIONS
router.get('/transactions', verifyToken, verifyReception, async (req, res) => {
    try {
        let queryFilter = { amount: { $gt: 0 }, bookedBy: req.user._id };
        if (req.user.hospitalId) {
            queryFilter.hospitalId = req.user.hospitalId;
        }
        const transactions = await Appointment.find(queryFilter)
            .populate('userId', 'name phone patientId email')
            .populate('doctorId', 'name')
            .sort({ createdAt: -1 })
            .limit(100)
            .lean();
        res.json({ success: true, transactions });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

module.exports = router;