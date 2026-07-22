const express = require('express');
const router = express.Router();
const PatientAuth = require('../models/patientAuth.model');
const Hospital = require('../models/hospital.model');
const User = require('../models/user.model');
const { checkPatientDoubleBooking } = require('../utils/appointmentValidator');

// Universal MRN Generator matching Hospital & Clinic exact formats
async function generateUniversalMRN(hospitalId, hospital, User) {
    if (hospital && hospital.clinicType === 'clinic') {
        const prefix = hospital.clinicCode || hospital.slug?.toUpperCase() || 'MRN';
        const count = await User.countDocuments({ hospitalId, role: 'patient' });
        return `${prefix}-${String(count + 1).padStart(3, '0')}`;
    }
    const hospitalCode = await Hospital.ensureHospitalCode(hospital);
    const count = await User.countDocuments({ hospitalId, role: 'patient' });
    const escapedCode = hospitalCode.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
    const regex = new RegExp(`^${escapedCode}-M365-(\\d+)$`, 'i');
    const existingPatients = await User.find({ hospitalId, mrn: regex }).select('mrn').lean();
    let maxSeq = count;
    for (const p of existingPatients) {
        if (p.mrn) {
            const match = p.mrn.match(regex);
            if (match && match[1]) {
                const num = parseInt(match[1], 10);
                if (!isNaN(num) && num > maxSeq) maxSeq = num;
            }
        }
    }
    let nextNum = maxSeq + 1;
    while (true) {
        const runningStr = String(nextNum).padStart(3, '0');
        const candidate = `${hospitalCode}-M365-${runningStr}`;
        const exists = await User.findOne({ $or: [{ mrn: candidate }, { patientId: candidate }] });
        if (!exists) return candidate;
        nextNum++;
    }
}

// POST /api/patient-auth/register
// Register a new patient authentication account
router.post('/register', async (req, res) => {
    try {
        let { name, email, mobile, password, hospitalId, age, aadhaarNumber } = req.body;

        let sanitizedPhone = mobile ? String(mobile).trim() : '';
        if (sanitizedPhone.startsWith('+91') && sanitizedPhone.length > 10) sanitizedPhone = sanitizedPhone.substring(3);
        else if (sanitizedPhone.startsWith('91') && sanitizedPhone.length > 10) sanitizedPhone = sanitizedPhone.substring(2);
        else if (sanitizedPhone.startsWith('0') && sanitizedPhone.length > 10) sanitizedPhone = sanitizedPhone.substring(1);
        sanitizedPhone = sanitizedPhone.replace(/\D/g, '').slice(0, 10);
        
        if (!sanitizedPhone || !/^\d{10}$/.test(sanitizedPhone)) {
            return res.status(400).json({
                success: false,
                message: "Validation Error",
                errors: { mobile: "Mobile number must be exactly 10 digits." }
            });
        }
        mobile = sanitizedPhone;

        // Basic validations
        if (!name) return res.status(400).json({ success: false, message: 'Full Name is required.' });
        if (!email) return res.status(400).json({ success: false, message: 'Email Address is required.' });
        if (!mobile) return res.status(400).json({ success: false, message: 'Mobile Number is required.' });
        if (!password) return res.status(400).json({ success: false, message: 'Password is required.' });
        if (!hospitalId) return res.status(400).json({ success: false, message: 'Hospital context is required.' });

        if (password.length < 8) {
            return res.status(400).json({ success: false, message: 'Password must be at least 8 characters long.' });
        }

        // Email format validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ success: false, message: 'Invalid email format.' });
        }

        // Mobile validation handled above

        // Check if hospital exists
        const hospital = await Hospital.findById(hospitalId);
        if (!hospital) {
            return res.status(404).json({ success: false, message: 'Hospital not found.' });
        }

        // Duplicate Check (Email or Mobile within the same hospital)
        const existingEmail = await PatientAuth.findOne({ email: email.toLowerCase(), hospitalId });
        if (existingEmail) {
            return res.status(400).json({ success: false, message: 'An account with this email already exists in this hospital.' });
        }

        const existingMobile = await PatientAuth.findOne({ mobile, hospitalId });
        if (existingMobile) {
            return res.status(400).json({ success: false, message: 'An account with this mobile number already exists in this hospital.' });
        }

        // Create new auth account
        const newPatientAccount = new PatientAuth({
            name,
            email,
            mobile,
            password,
            hospitalId,
            age,
            aadhaarNumber
        });

        await newPatientAccount.save();

        // Auto-link clinical User (Patient) profile ONLY if it already exists (e.g., from prior reception registration)
        try {
            const User = require('../models/user.model');
            let user = await User.findOne({ hospitalId, role: 'patient', $or: [{ phone: mobile }, ...(email ? [{ email: email.toLowerCase() }] : [])] });
            if (user) {
                if (hospital && hospital.clinicType !== 'clinic') {
                    const hospitalCode = await Hospital.ensureHospitalCode(hospital);
                    const escapedCode = hospitalCode.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
                    const validRegex = new RegExp(`^${escapedCode}-M365-\\d+$`, 'i');
                    if (!user.mrn || !validRegex.test(user.mrn)) {
                        const newMrn = await generateUniversalMRN(hospitalId, hospital, User);
                        user.mrn = newMrn;
                        user.patientId = newMrn;
                        await user.save();
                    }
                }
                newPatientAccount.linkedPatientProfileId = user._id;
                await newPatientAccount.save();
            }
        } catch (linkErr) {
            console.error("Error auto-linking User profile during signup:", linkErr);
        }

        res.status(201).json({
            success: true,
            message: 'Patient account created successfully.',
            account: {
                _id: newPatientAccount._id,
                name: newPatientAccount.name,
                email: newPatientAccount.email,
                mobile: newPatientAccount.mobile,
                hospitalId: newPatientAccount.hospitalId
            }
        });

    } catch (error) {
        console.error('Patient Registration Error:', error);
        res.status(500).json({ success: false, message: 'Internal server error during registration.' });
    }
});

// POST /api/patient-auth/login
// Login patient with email or mobile
router.post('/login', async (req, res) => {
    try {
        const { loginId, password, hospitalId } = req.body;

        if (!loginId || !password || !hospitalId) {
            return res.status(400).json({ success: false, message: 'Email/Mobile, password, and hospital reference are required.' });
        }

        // Find patient matching either email or mobile strictly within the current hospital
        const query = {
            $or: [
                { email: loginId.toLowerCase() },
                { mobile: loginId }
            ],
            hospitalId
        };

        const patient = await PatientAuth.findOne(query);
        if (!patient) {
            return res.status(401).json({ success: false, message: 'Invalid credentials.' });
        }

        if (patient.status !== 'Active') {
            return res.status(401).json({ success: false, message: 'Account is inactive. Please contact support.' });
        }

        const isMatch = await patient.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Invalid credentials.' });
        }

        // Generate Patient-scoped JWT
        const jwt = require('jsonwebtoken');
        const { v4: uuidv4 } = require('uuid');
        const { JWT_SECRET, JWT_EXPIRES_IN } = require('../config/jwt');

        const token = jwt.sign(
            {
                jti: uuidv4(),
                patientId: patient._id,
                email: patient.email,
                hospitalId: String(patient.hospitalId),
                role: 'patient'
            },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES_IN }
        );

        let mrn = null;
        if (!patient.linkedPatientProfileId) {
            try {
                const User = require('../models/user.model');
                let user = await User.findOne({ hospitalId: patient.hospitalId, role: 'patient', $or: [{ phone: patient.mobile }, ...(patient.email ? [{ email: patient.email.toLowerCase() }] : [])] });
                if (user) {
                    patient.linkedPatientProfileId = user._id;
                    await patient.save();
                }
            } catch (err) {
                console.error("Error linking patient during login:", err);
            }
        }

        if (patient.linkedPatientProfileId) {
            const User = require('../models/user.model');
            const Hospital = require('../models/hospital.model');
            const linkedProfile = await User.findById(patient.linkedPatientProfileId);
            if (linkedProfile) {
                const hospital = await Hospital.findById(patient.hospitalId);
                if (hospital && hospital.clinicType !== 'clinic') {
                    const hospitalCode = await Hospital.ensureHospitalCode(hospital);
                    const escapedCode = hospitalCode.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
                    const validRegex = new RegExp(`^${escapedCode}-M365-\\d+$`, 'i');
                    if (!linkedProfile.mrn || !validRegex.test(linkedProfile.mrn)) {
                        const newMrn = await generateUniversalMRN(patient.hospitalId, hospital, User);
                        linkedProfile.mrn = newMrn;
                        linkedProfile.patientId = newMrn;
                        await linkedProfile.save();
                    }
                }
                mrn = linkedProfile.mrn || linkedProfile.patientId || null;
            }
        }

        res.json({
            success: true,
            message: 'Logged in successfully.',
            token,
            user: {
                id: patient._id,
                name: patient.name,
                email: patient.email,
                mobile: patient.mobile,
                hospitalId: patient.hospitalId,
                role: 'patient',
                registrationStatus: patient.linkedPatientProfileId ? 'Completed' : 'Pending',
                linkedPatientProfileId: patient.linkedPatientProfileId,
                mrn: mrn
            }
        });

    } catch (error) {
        console.error('Patient Login Error:', error);
        res.status(500).json({ success: false, message: 'Internal server error during login.' });
    }
});

// POST /api/patient-auth/forgot-password
// Request reset password token
router.post('/forgot-password', async (req, res) => {
    try {
        const { email, hospitalId } = req.body;
        if (!email || !hospitalId) {
            return res.status(400).json({ success: false, message: 'Email and hospital reference are required.' });
        }

        const patient = await PatientAuth.findOne({ email: email.toLowerCase(), hospitalId });
        if (!patient) {
            // Note: Returning success anyway to protect user privacy (prevent email enumerations)
            // But we will also send the token in the response so they can proceed with local testing
            const jwt = require('jsonwebtoken');
            const { JWT_SECRET } = require('../config/jwt');
            const mockToken = jwt.sign(
                { email: email.toLowerCase(), hospitalId, purpose: 'reset-password' },
                JWT_SECRET,
                { expiresIn: '15m' }
            );
            return res.json({
                success: true,
                message: 'If the email exists, a password reset link has been generated.',
                token: mockToken,
                mock: true
            });
        }

        const jwt = require('jsonwebtoken');
        const { JWT_SECRET } = require('../config/jwt');
        const resetToken = jwt.sign(
            { email: patient.email, hospitalId, purpose: 'reset-password' },
            JWT_SECRET,
            { expiresIn: '15m' }
        );

        // Modular stub for email dispatch
        console.log(`[STUB] Sending reset password link to ${patient.email}: /patient/reset-password?token=${resetToken}`);

        res.json({
            success: true,
            message: 'Password reset link generated successfully.',
            token: resetToken,
            mock: false
        });

    } catch (error) {
        console.error('Forgot Password Error:', error);
        res.status(500).json({ success: false, message: 'Internal server error.' });
    }
});

// POST /api/patient-auth/reset-password
// Reset password using token
router.post('/reset-password', async (req, res) => {
    try {
        const { token, password } = req.body;
        if (!token || !password) {
            return res.status(400).json({ success: false, message: 'Token and new password are required.' });
        }

        if (password.length < 8) {
            return res.status(400).json({ success: false, message: 'Password must be at least 8 characters long.' });
        }

        const jwt = require('jsonwebtoken');
        const { JWT_SECRET } = require('../config/jwt');

        let decoded;
        try {
            decoded = jwt.verify(token, JWT_SECRET);
        } catch (err) {
            return res.status(400).json({ success: false, message: 'Invalid or expired reset token.' });
        }

        if (decoded.purpose !== 'reset-password') {
            return res.status(400).json({ success: false, message: 'Invalid token purpose.' });
        }

        const patient = await PatientAuth.findOne({ email: decoded.email, hospitalId: decoded.hospitalId });
        if (!patient) {
            return res.status(404).json({ success: false, message: 'Patient account not found.' });
        }

        // Update password (pre-save hook will hash it automatically)
        patient.password = password;
        await patient.save();

        res.json({ success: true, message: 'Password updated successfully. Please login with your new credentials.' });

    } catch (error) {
        console.error('Reset Password Error:', error);
        res.status(500).json({ success: false, message: 'Internal server error.' });
    }
});

// GET /api/patient-auth/me
// Verify patient token and return credentials
const { verifyPatientToken } = require('../middleware/auth.middleware');

router.get('/me', verifyPatientToken, async (req, res) => {
    let mrn = null;
    if (!req.patient.linkedPatientProfileId) {
        try {
            const User = require('../models/user.model');
            let user = await User.findOne({ hospitalId: req.patient.hospitalId, role: 'patient', $or: [{ phone: req.patient.mobile }, ...(req.patient.email ? [{ email: req.patient.email.toLowerCase() }] : [])] });
            if (user) {
                req.patient.linkedPatientProfileId = user._id;
                await req.patient.save();
            }
        } catch (err) {
            console.error("Error linking patient during /me:", err);
        }
    }

    if (req.patient.linkedPatientProfileId) {
        const User = require('../models/user.model');
        const Hospital = require('../models/hospital.model');
        const linkedProfile = await User.findById(req.patient.linkedPatientProfileId);
        if (linkedProfile) {
            const hospital = await Hospital.findById(req.patient.hospitalId);
            if (hospital && hospital.clinicType !== 'clinic') {
                const hospitalCode = await Hospital.ensureHospitalCode(hospital);
                const escapedCode = hospitalCode.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
                const validRegex = new RegExp(`^${escapedCode}-M365-\\d+$`, 'i');
                if (!linkedProfile.mrn || !validRegex.test(linkedProfile.mrn)) {
                    const newMrn = await generateUniversalMRN(req.patient.hospitalId, hospital, User);
                    linkedProfile.mrn = newMrn;
                    linkedProfile.patientId = newMrn;
                    await linkedProfile.save();
                }
            }
            mrn = linkedProfile.mrn || linkedProfile.patientId || null;
        }
    }

    res.json({
        success: true,
        user: {
            id: req.patient._id,
            name: req.patient.name,
            email: req.patient.email,
            mobile: req.patient.mobile,
            hospitalId: req.patient.hospitalId,
            role: 'patient',
            registrationStatus: req.patient.linkedPatientProfileId ? 'Completed' : 'Pending',
            linkedPatientProfileId: req.patient.linkedPatientProfileId,
            mrn: mrn
        }
    });
});

// GET /api/patient-auth/appointments
// Fetch appointments for the logged-in patient
const Appointment = require('../models/appointment.model');
router.get('/appointments', verifyPatientToken, async (req, res) => {
    try {
        if (!req.patient.linkedPatientProfileId) {
            return res.json({ success: true, appointments: [] });
        }

        const appointments = await Appointment.find({
            userId: req.patient.linkedPatientProfileId
        }).sort({ appointmentDate: -1, createdAt: -1 });

        res.json({ success: true, appointments });
    } catch (error) {
        console.error('Patient Appointments Fetch Error:', error);
        res.status(500).json({ success: false, message: 'Internal server error.' });
    }
});

// GET /api/patient-auth/followup-status
// Fetch follow-up status for the logged-in patient
router.get('/followup-status', verifyPatientToken, async (req, res) => {
    try {
        if (!req.patient.linkedPatientProfileId) {
            return res.json({
                success: true,
                active: false,
                lastConsultation: null,
                fee: 500,
                message: 'Patient profile not linked / First Visit',
                department: ''
            });
        }

        const User = require('../models/user.model');
        const patient = await User.findById(req.patient.linkedPatientProfileId);
        if (!patient) {
            return res.json({
                success: true,
                active: false,
                lastConsultation: null,
                fee: 500,
                message: 'Patient profile not found / First Visit',
                department: ''
            });
        }

        const hospitalId = req.patient.hospitalId || patient.hospitalId;
        if (!hospitalId) {
            return res.status(400).json({ success: false, message: 'No hospital linked' });
        }

        const hospital = await Hospital.findById(hospitalId).select('departmentFees departmentValidity appointmentFee');
        if (!hospital) {
            return res.status(404).json({ success: false, message: 'Hospital not found' });
        }

        const { department, auto, date } = req.query;
        let selectedDept = department;

        if (auto === 'true' || !selectedDept) {
            const lastAppt = await Appointment.findOne({
                userId: patient._id,
                status: { $ne: 'cancelled' }
            }).sort({ appointmentDate: -1 });

            if (!lastAppt) {
                return res.json({
                    success: true,
                    active: false,
                    lastConsultation: null,
                    fee: hospital.appointmentFee ?? 500,
                    message: 'First Consultation',
                    department: ''
                });
            }
            selectedDept = lastAppt.department || '';
        }

        if (!selectedDept) {
            return res.json({
                success: true,
                active: false,
                lastConsultation: null,
                fee: hospital.appointmentFee ?? 500,
                message: 'First Consultation',
                department: ''
            });
        }

        const validityDays = hospital.departmentValidity?.get(selectedDept) || 0;
        const deptFee = hospital.departmentFees?.get(selectedDept) ?? hospital.appointmentFee ?? 500;

        const lastApptForDept = await Appointment.findOne({
            userId: patient._id,
            department: selectedDept,
            status: { $ne: 'cancelled' }
        }).sort({ appointmentDate: -1 });

        if (!lastApptForDept || !lastApptForDept.appointmentDate) {
            return res.json({
                success: true,
                active: false,
                lastConsultation: null,
                fee: deptFee,
                message: 'First Consultation',
                department: selectedDept,
                doctorId: lastApptForDept?.doctorId || null,
                doctorName: lastApptForDept?.doctorName || null
            });
        }

        const lastDate = new Date(lastApptForDept.appointmentDate);
        lastDate.setUTCHours(0, 0, 0, 0);
        const validUntil = new Date(lastDate);
        validUntil.setDate(validUntil.getDate() + validityDays);

        const currentDate = date ? new Date(date) : new Date();
        currentDate.setUTCHours(0, 0, 0, 0);

        if (currentDate <= validUntil && validityDays > 0) {
            return res.json({
                success: true,
                active: true,
                validUntil: validUntil.toISOString().split('T')[0],
                lastConsultation: lastDate.toISOString().split('T')[0],
                fee: 0,
                message: 'Follow-up Active',
                department: selectedDept,
                doctorId: lastApptForDept.doctorId,
                doctorName: lastApptForDept.doctorName
            });
        } else {
            return res.json({
                success: true,
                active: false,
                validUntil: validUntil.toISOString().split('T')[0],
                lastConsultation: lastDate.toISOString().split('T')[0],
                fee: deptFee,
                message: 'Follow-up Expired',
                department: selectedDept,
                doctorId: lastApptForDept.doctorId,
                doctorName: lastApptForDept.doctorName
            });
        }
    } catch (error) {
        console.error('Patient Followup Status Error:', error);
        res.status(500).json({ success: false, message: 'Internal server error.' });
    }
});

// POST /api/patient-auth/book-appointment
// Book appointment specifically for the logged-in patient
router.post('/book-appointment', verifyPatientToken, async (req, res) => {
    try {
        if (!req.patient.linkedPatientProfileId) {
            return res.status(403).json({ success: false, message: 'Unauthorized: Profile not linked yet.' });
        }

        const { doctorId, date, time, notes, paymentMethod, paymentStatus, amount, department } = req.body;

        if (!doctorId || !date) {
            return res.status(400).json({ success: false, message: 'Doctor and date are required.' });
        }

        const reqDateMatch = String(date).split('T')[0];
        const todayMatch = new Date().toISOString().split('T')[0];
        if (reqDateMatch < todayMatch) {
            return res.status(400).json({ success: false, message: 'Cannot book appointments in the past.' });
        }

        const User = require('../models/user.model');
        const Doctor = require('../models/doctor.model');

        const patient = await User.findById(req.patient.linkedPatientProfileId);
        if (!patient) {
            return res.status(404).json({ success: false, message: 'Linked patient profile not found.' });
        }

        const doctor = await Doctor.findById(doctorId);
        if (!doctor) {
            return res.status(404).json({ success: false, message: 'Doctor not found.' });
        }

        const hospitalId = req.patient.hospitalId || patient.hospitalId;

        if (String(doctor.hospitalId) !== String(hospitalId)) {
            return res.status(403).json({ success: false, message: 'Unauthorized: Doctor belongs to another hospital.' });
        }

        const hospital = hospitalId ? await Hospital.findById(hospitalId).select('appointmentMode name address city state phone departmentFees departmentValidity appointmentFee') : null;
        const isTokenMode = hospital?.appointmentMode === 'token';

        let finalTime = time;
        let tokenNumber = null;

        const startOfDay = new Date(date);
        startOfDay.setUTCHours(0, 0, 0, 0);
        const endOfDay = new Date(date);
        endOfDay.setUTCHours(23, 59, 59, 999);

        if (isTokenMode) {
            const count = await Appointment.countDocuments({
                doctorId: doctor._id,
                appointmentDate: { $gte: startOfDay, $lte: endOfDay },
                status: { $ne: 'cancelled' }
            });
            tokenNumber = count + 1;
            finalTime = `token-${tokenNumber}`;
        } else {
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

        const patientConflict = await checkPatientDoubleBooking({
            userId: patient._id,
            patientId: patient.patientId,
            date,
            time: finalTime || time
        });
        if (patientConflict && patientConflict.conflict) {
            return res.status(400).json({ success: false, message: patientConflict.message });
        }

        let finalAmount = Number(amount) || doctor.consultationFee || 0;
        let visitType = 'New Consultation';

        if (department && hospital) {
            const validityDays = hospital.departmentValidity?.get(department) || 0;
            if (validityDays > 0) {
                const lastAppt = await Appointment.findOne({
                    userId: patient._id,
                    department,
                    status: { $ne: 'cancelled' }
                }).sort({ appointmentDate: -1 });

                if (lastAppt && lastAppt.appointmentDate) {
                    const lastDate = new Date(lastAppt.appointmentDate);
                    lastDate.setUTCHours(0, 0, 0, 0);
                    const validUntil = new Date(lastDate);
                    validUntil.setDate(validUntil.getDate() + validityDays);

                    const currentDate = new Date(date);
                    currentDate.setUTCHours(0, 0, 0, 0);

                    if (currentDate <= validUntil) {
                        finalAmount = 0;
                        visitType = 'Follow-up';
                    } else if (finalAmount === 0) {
                        finalAmount = hospital.departmentFees?.get(department) ?? hospital.appointmentFee ?? 500;
                        visitType = 'New Consultation';
                    } else {
                        visitType = 'New Consultation';
                    }
                }
            }
        }
        if (finalAmount === 0) {
            visitType = 'Follow-up';
        }

        const newAppointment = new Appointment({
            userId: patient._id,
            hospitalId,
            patientId: patient.patientId || 'WALK-IN',
            doctorId: doctor._id,
            doctorUserId: doctor.userId,
            doctorName: doctor.name,
            serviceId: doctor.services?.[0] || 'general',
            serviceName: 'Patient Portal Booking',
            department: department || doctor.departments?.[0] || 'General',
            visitType,
            appointmentDate: new Date(date),
            appointmentTime: finalTime || '',
            tokenNumber,
            amount: finalAmount,
            status: 'confirmed',
            paymentStatus: finalAmount === 0 ? 'Paid' : (paymentStatus || 'Paid'),
            paymentMethod: paymentMethod || 'Online',
            notes: notes || 'Booked directly via Patient Portal'
        });

        await newAppointment.save();

        res.json({ success: true, appointment: newAppointment });
    } catch (error) {
        console.error('Patient Book Appointment Error:', error);
        res.status(500).json({ success: false, message: 'Internal server error while booking appointment.' });
    }
});

// GET /api/patient-auth/profile
// Fetch complete demographic profile for the logged-in patient
router.get('/profile', verifyPatientToken, async (req, res) => {
    try {
        let userDoc = null;
        if (req.patient.linkedPatientProfileId) {
            userDoc = await User.findById(req.patient.linkedPatientProfileId)
                .populate('partner', 'name patientId')
                .populate('primaryDoctor', 'name')
                .select('-password -role')
                .lean();
        }

        const authDoc = await PatientAuth.findById(req.patient.id).lean();
        
        let hospitalName = 'Not Specified';
        let branch = '';
        if (userDoc?.hospitalId || authDoc?.hospitalId) {
            const hosp = await Hospital.findById(userDoc?.hospitalId || authDoc?.hospitalId).select('name branch').lean();
            if (hosp) {
                hospitalName = hosp.name;
                branch = hosp.branch || '';
            }
        }

        const mobileValue = userDoc?.phone || userDoc?.mobile || authDoc?.mobile || req.patient.mobile || '';
        const emailValue = userDoc?.email || authDoc?.email || req.patient.email || '';
        const nameValue = userDoc?.name || authDoc?.name || req.patient.name || '';
        const aadhaarValue = userDoc?.aadhaarNumber || authDoc?.aadhaarNumber || '';
        const ageValue = userDoc?.age || authDoc?.age || 'Not Specified';

        const profile = userDoc ? {
            ...userDoc,
            name: nameValue,
            email: emailValue,
            phone: mobileValue,
            mobile: mobileValue,
            aadhaarNumber: aadhaarValue,
            age: ageValue,
            hospitalName: hospitalName,
            branch: userDoc.branch || branch,
            primaryDoctorName: userDoc.primaryDoctor?.name || '',
            partnerName: userDoc.partner?.name || userDoc.ivfDetails?.partnerName || '',
            partnerMrn: userDoc.partner?.patientId || userDoc.ivfDetails?.partnerMrn || '',
            registrationDate: authDoc?.createdAt || userDoc?.createdAt || new Date()
        } : {
            name: nameValue,
            email: emailValue,
            mobile: mobileValue,
            phone: mobileValue,
            aadhaarNumber: aadhaarValue,
            gender: 'Not Specified',
            age: ageValue,
            bloodGroup: 'Not Specified',
            address: 'Not Specified',
            hospitalName: hospitalName,
            branch: branch,
            registrationDate: authDoc?.createdAt || new Date()
        };

        res.json({ success: true, profile });
    } catch (error) {
        console.error('Patient Profile Fetch Error:', error);
        res.status(500).json({ success: false, message: 'Internal server error.' });
    }
});

// PUT /api/patient-auth/appointments/:id/cancel
// Cancel an appointment specifically owned by the patient
router.put('/appointments/:id/cancel', verifyPatientToken, async (req, res) => {
    try {
        if (!req.patient.linkedPatientProfileId) {
            return res.status(403).json({ success: false, message: 'Unauthorized: Profile not linked.' });
        }

        const appointment = await Appointment.findOne({
            _id: req.params.id,
            userId: req.patient.linkedPatientProfileId
        });

        if (!appointment) {
            return res.status(404).json({ success: false, message: 'Appointment not found or unauthorized.' });
        }

        if (appointment.status === 'cancelled' || appointment.status === 'completed') {
            return res.status(400).json({ success: false, message: `Cannot cancel a ${appointment.status} appointment.` });
        }

        appointment.status = 'cancelled';
        await appointment.save();

        res.json({ success: true, message: 'Appointment cancelled successfully.', appointment });
    } catch (error) {
        console.error('Patient Appointment Cancel Error:', error);
        res.status(500).json({ success: false, message: 'Internal server error.' });
    }
});

// GET /api/patient-auth/documents
// Fetch all documents for the logged-in patient
router.get('/documents', verifyPatientToken, async (req, res) => {
    try {
        if (!req.patient.linkedPatientProfileId) {
            return res.json({ success: true, documents: [] });
        }

        const patientId = req.patient.linkedPatientProfileId;
        const hospitalId = req.patient.hospitalId;

        // Fetch User profile to get documents array, populate hospitalId for branding name
        const user = await User.findById(patientId).populate('hospitalId', 'name').lean();
        if (!user) {
            return res.status(404).json({ success: false, message: 'Patient profile not found.' });
        }

        // Verify patient hospitalId matches
        if (user.hospitalId && String(user.hospitalId._id || user.hospitalId) !== String(hospitalId)) {
            return res.status(403).json({ success: false, message: 'Access denied: Hospital mismatch.' });
        }

        const hospitalName = user.hospitalId?.name || 'Our Hospital';

        // Fetch all appointments for linking
        const Appointment = require('../models/appointment.model');
        const Report = require('../models/report.model');
        const apptQuery = { $or: [{ userId: patientId }, { patientId: patientId }] };
        if (hospitalId) apptQuery.hospitalId = hospitalId;
        const patientAppts = await Appointment.find(apptQuery).sort({ appointmentDate: -1 }).lean();
        const apptMap = {};
        for (const a of patientAppts) {
            apptMap[a._id.toString()] = a;
        }

        const findLinkedAppt = (item) => {
            if (item.appointmentId && apptMap[item.appointmentId.toString()]) {
                return apptMap[item.appointmentId.toString()];
            }
            if (patientAppts.length > 0) {
                const itemDate = new Date(item.date || item.uploadedAt || item.createdAt);
                if (!isNaN(itemDate.getTime())) {
                    const itemDateStr = itemDate.toISOString().split('T')[0];
                    const exactMatch = patientAppts.find(a => {
                        const aDateStr = new Date(a.appointmentDate).toISOString().split('T')[0];
                        const aDept = a.department || a.serviceName || '';
                        return aDateStr === itemDateStr && (!item.department || aDept.toLowerCase() === item.department.toLowerCase());
                    });
                    if (exactMatch) return exactMatch;
                    const dateMatch = patientAppts.find(a => {
                        const aDateStr = new Date(a.appointmentDate).toISOString().split('T')[0];
                        return aDateStr === itemDateStr;
                    });
                    if (dateMatch) return dateMatch;
                }
                if (item.department) {
                    const deptMatch = patientAppts.find(a => (a.department || a.serviceName || '').toLowerCase() === item.department.toLowerCase());
                    if (deptMatch) return deptMatch;
                }
                return patientAppts[0];
            }
            return null;
        };

        const enrichDoc = (docItem, defaultTitle, defaultType) => {
            const appt = findLinkedAppt(docItem);
            const dept = docItem.department || appt?.department || appt?.serviceName || 'General';
            const rawDocName = docItem.doctorName || docItem.uploadedBy || appt?.doctorName || 'Doctor';
            const docName = rawDocName.startsWith('Dr.') ? rawDocName : `Dr. ${rawDocName}`;
            return {
                fileName: docItem.fileName || docItem.name || defaultTitle,
                docType: docItem.docType || defaultType,
                url: docItem.url || docItem.fileUrl || docItem.filename || '',
                uploadedAt: docItem.date || docItem.uploadedAt || appt?.appointmentDate || new Date(),
                fileId: docItem.fileId || docItem._id || null,
                uploadedBy: docName,
                hospital: hospitalName,
                department: dept,
                appointmentDate: appt?.appointmentDate || docItem.date || docItem.uploadedAt || new Date(),
                doctorName: docName,
                appointmentStatus: appt?.status || (appt?.amount === 0 || appt?.visitType === 'Follow-up' ? 'Follow-up' : 'Completed'),
                appointmentId: appt?._id || null
            };
        };

        const fp = user.fertilityProfile || {};
        const baseDocs = Array.isArray(fp.documents) ? fp.documents.map(d => enrichDoc(d, 'Hospital Document', 'Hospital Documents')) : [];
        const prevReports = Array.isArray(fp.previousReports) ? fp.previousReports.map(r => enrichDoc(r, 'Medical Report', 'Medical Report')) : [];
        const doctorReports = Array.isArray(fp.reports) ? fp.reports.map(r => enrichDoc({
            ...r,
            url: r.url || r.fileUrl || (r.filename ? ((r.filename || '').startsWith('http') ? r.filename : `/api/patients/reports/${encodeURIComponent(r.filename)}`) : null)
        }, 'Medical Report', 'Medical Report')) : [];

        // Also fetch LabReports
        const LabReport = require('../models/labReport.model');
        const labQuery = { $or: [{ userId: patientId }, { patientId: patientId }] };
        if (hospitalId) labQuery.hospitalId = hospitalId;
        const labReports = await LabReport.find({ ...labQuery, 'data.fileUrl': { $ne: null } }).lean();
        const labDocs = labReports.map(l => {
            const appt = l.appointmentId ? apptMap[l.appointmentId.toString()] : null;
            const dept = appt?.department || appt?.serviceName || l.department || 'General';
            const rawDocName = appt?.doctorName || 'Doctor';
            const docName = rawDocName.startsWith('Dr.') ? rawDocName : `Dr. ${rawDocName}`;
            return {
                fileName: l.data?.reportName || l.data?.testName || 'Lab Investigation Report',
                docType: 'Lab Reports',
                url: l.data.fileUrl,
                uploadedAt: l.createdAt || appt?.appointmentDate || new Date(),
                fileId: l._id,
                uploadedBy: docName,
                hospital: hospitalName,
                department: dept,
                appointmentDate: appt?.appointmentDate || l.createdAt || new Date(),
                doctorName: docName,
                appointmentStatus: appt?.status || (appt?.amount === 0 || appt?.visitType === 'Follow-up' ? 'Follow-up' : 'Completed'),
                appointmentId: appt?._id || null
            };
        });

        // Also fetch standalone Reports
        const apptIds = patientAppts.map(a => a._id);
        const standaloneReports = await Report.find({ appointmentId: { $in: apptIds } }).lean();
        const standaloneDocs = standaloneReports.map(r => {
            const appt = r.appointmentId ? apptMap[r.appointmentId.toString()] : null;
            const dept = appt?.department || appt?.serviceName || 'General';
            const rawDocName = appt?.doctorName || r.uploadedByRole || 'Doctor';
            const docName = rawDocName.startsWith('Dr.') ? rawDocName : `Dr. ${rawDocName}`;
            return {
                fileName: r.fileName || 'Medical Report',
                docType: 'Medical Report',
                url: r.url,
                uploadedAt: r.uploadedAt || appt?.appointmentDate || new Date(),
                fileId: r.fileId || r._id,
                uploadedBy: docName,
                hospital: hospitalName,
                department: dept,
                appointmentDate: appt?.appointmentDate || r.uploadedAt || new Date(),
                doctorName: docName,
                appointmentStatus: appt?.status || (appt?.amount === 0 || appt?.visitType === 'Follow-up' ? 'Follow-up' : 'Completed'),
                appointmentId: appt?._id || null
            };
        });

        const allCombined = [...baseDocs, ...prevReports, ...doctorReports, ...labDocs, ...standaloneDocs];
        
        // Deduplicate
        const seen = new Set();
        const documents = [];
        for (const doc of allCombined) {
            const key = doc.url || doc.fileName;
            if (key && !seen.has(key)) {
                seen.add(key);
                documents.push(doc);
            }
        }

        // Sort by date descending
        documents.sort((a, b) => new Date(b.uploadedAt || 0) - new Date(a.uploadedAt || 0));

        res.json({ success: true, documents });
    } catch (error) {
        console.error('Patient Documents Fetch Error:', error);
        res.status(500).json({ success: false, message: 'Internal server error.' });
    }
});

// Helper: get models scoped to tenant or master for patient auth routes
const getPatientModels = (req) => {
    const { getTenantModels } = require('../db/tenantModels');
    const MasterAppointment = require('../models/appointment.model');
    const MasterLabReport = require('../models/labReport.model');
    const MasterPharmacyOrder = require('../models/pharmacyOrder.model');
    const MasterFacilityCharge = require('../models/facilityCharge.model');
    const MasterAdmission = require('../models/admission.model');
    const MasterPaymentTransaction = require('../models/paymentTransaction.model');
    const MasterUser = require('../models/user.model');

    if (req.tenantDb) return getTenantModels(req.tenantDb);
    return {
        User: MasterUser,
        Appointment: MasterAppointment,
        LabReport: MasterLabReport,
        PharmacyOrder: MasterPharmacyOrder,
        FacilityCharge: MasterFacilityCharge,
        Admission: MasterAdmission,
        PaymentTransaction: MasterPaymentTransaction,
    };
};

// GET /api/patient-auth/bills
// Fetch all hospital bills and payment history strictly for the logged-in patient
router.get('/bills', verifyPatientToken, async (req, res) => {
    try {
        if (!req.patient.linkedPatientProfileId) {
            return res.json({
                success: true,
                patient: null,
                hospital: { name: 'Our Hospital' },
                bills: [],
                paymentHistory: [],
                summary: { totalBills: 0, totalAmount: 0, paidAmount: 0, pendingAmount: 0, totalPayments: 0 }
            });
        }

        const patientId = req.patient.linkedPatientProfileId;
        const { Appointment, LabReport, PharmacyOrder, FacilityCharge, Admission, PaymentTransaction } = getPatientModels(req);
        
        const MasterAppointment = require('../models/appointment.model');
        const MasterLabReport = require('../models/labReport.model');
        const MasterPharmacyOrder = require('../models/pharmacyOrder.model');
        const MasterFacilityCharge = require('../models/facilityCharge.model');
        const MasterAdmission = require('../models/admission.model');
        const MasterPaymentTransaction = require('../models/paymentTransaction.model');

        const user = await User.findById(patientId).populate('hospitalId', 'name facilities').lean();
        if (!user) {
            return res.status(404).json({ success: false, message: 'Patient profile not found.' });
        }

        const hospital = user.hospitalId || null;
        const hospitalName = hospital?.name || 'Our Hospital';

        const patientFilter = {
            $or: [
                { userId: patientId },
                { patientId: patientId }
            ]
        };

        const fetchWithMasterFallback = async (Model, MasterModel, query) => {
            let results = await Model.find(query).lean();
            if (Model !== MasterModel) {
                const masterResults = await MasterModel.find(query).lean();
                const seen = new Set(results.map(r => r._id.toString()));
                for (const mr of masterResults) {
                    if (!seen.has(mr._id.toString())) results.push(mr);
                }
            }
            return results;
        };

        const [appointments, labReports, pharmacyOrders, facilityCharges, admissions, paymentTransactions] = await Promise.all([
            fetchWithMasterFallback(Appointment, MasterAppointment, patientFilter),
            fetchWithMasterFallback(LabReport, MasterLabReport, patientFilter),
            fetchWithMasterFallback(PharmacyOrder, MasterPharmacyOrder, patientFilter),
            fetchWithMasterFallback(FacilityCharge, MasterFacilityCharge, patientFilter),
            fetchWithMasterFallback(Admission, MasterAdmission, patientFilter),
            fetchWithMasterFallback(PaymentTransaction, MasterPaymentTransaction, patientFilter)
        ]);

        // Calculate ICU charges dynamically for admissions
        const icuFacility = hospital?.facilities?.find(f => f.name && f.name.toUpperCase().startsWith('ICU'));
        const icuRate = icuFacility ? (Number(icuFacility.pricePerDay) || 0) : 0;

        for (const adm of admissions) {
            if (adm.ward && adm.ward.toUpperCase().startsWith('ICU')) {
                const hasIcuCharge = adm.selectedFacilities?.some(f => f.facilityName && f.facilityName.toUpperCase().startsWith('ICU'));
                if (!hasIcuCharge && icuRate > 0) {
                    const startDate = new Date(adm.admissionDate || adm.createdAt);
                    const endDate = adm.dischargeDate ? new Date(adm.dischargeDate) : new Date();
                    const diffTime = Math.max(0, endDate - startDate);
                    const diffDays = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
                    const icuTotal = icuRate * diffDays;
                    
                    adm.selectedFacilities = adm.selectedFacilities || [];
                    adm.selectedFacilities.push({
                        facilityName: icuFacility.name,
                        pricePerDay: icuRate,
                        days: diffDays,
                        totalAmount: icuTotal
                    });
                    adm.totalAmount = (adm.totalAmount || 0) + icuTotal;
                }
            }
        }

        // Normalize every record into a unified bills array
        const bills = [];

        appointments.forEach(a => {
            const amount = Number(a.amount || a.fee || 0);
            const isPaid = a.paymentStatus === 'Paid' || a.paymentStatus === 'Waived';
            bills.push({
                id: a._id.toString(),
                billNumber: a.billNumber || `BILL-CON-${a._id.toString().slice(-6).toUpperCase()}`,
                rawCategory: 'Appointment',
                category: 'Consultation',
                date: a.appointmentDate || a.createdAt,
                amount: amount,
                paidAmount: isPaid ? amount : 0,
                pendingAmount: isPaid ? 0 : amount,
                status: isPaid ? 'Paid' : 'Pending',
                details: `Consultation with ${a.doctorName || 'Doctor'} (${a.serviceName || a.department || 'General OPD'})`
            });
        });

        labReports.forEach(l => {
            const amount = Number(l.amount || l.price || 0);
            const isPaid = l.paymentStatus === 'Paid' || l.paymentStatus === 'Waived';
            const testList = Array.isArray(l.testNames) && l.testNames.length > 0
                ? l.testNames.join(', ')
                : (l.testName || 'Laboratory Diagnostics');
            bills.push({
                id: l._id.toString(),
                billNumber: l.billNumber || `BILL-LAB-${l._id.toString().slice(-6).toUpperCase()}`,
                rawCategory: 'LabReport',
                category: 'Lab Test',
                date: l.createdAt,
                amount: amount,
                paidAmount: isPaid ? amount : 0,
                pendingAmount: isPaid ? 0 : amount,
                status: isPaid ? 'Paid' : 'Pending',
                details: `Tests: ${testList}`
            });
        });

        pharmacyOrders.forEach(p => {
            const amount = Number(p.totalAmount || 0);
            const isPaid = p.paymentStatus === 'Paid' || p.paymentStatus === 'Waived';
            const itemsList = Array.isArray(p.items) && p.items.length > 0
                ? p.items.map(i => `${i.medicineName || i.name || 'Medicine'} × ${i.qty || 1}`).join(', ')
                : 'Prescription Medicines';
            bills.push({
                id: p._id.toString(),
                billNumber: p.billNumber || `BILL-PHM-${p._id.toString().slice(-6).toUpperCase()}`,
                rawCategory: 'PharmacyOrder',
                category: 'Pharmacy',
                date: p.createdAt,
                amount: amount,
                paidAmount: isPaid ? amount : 0,
                pendingAmount: isPaid ? 0 : amount,
                status: isPaid ? 'Paid' : 'Pending',
                details: itemsList
            });
        });

        facilityCharges.forEach(f => {
            const amount = Number(f.totalAmount || 0);
            const isPaid = f.paymentStatus === 'Paid' || f.paymentStatus === 'Waived';
            const days = f.daysUsed || f.days || 1;
            bills.push({
                id: f._id.toString(),
                billNumber: f.billNumber || `BILL-FAC-${f._id.toString().slice(-6).toUpperCase()}`,
                rawCategory: 'FacilityCharge',
                category: 'Facility Charge',
                date: f.createdAt,
                amount: amount,
                paidAmount: isPaid ? amount : 0,
                pendingAmount: isPaid ? 0 : amount,
                status: isPaid ? 'Paid' : 'Pending',
                details: `${f.facilityName || 'Hospital Facility'} (${days} day${days > 1 ? 's' : ''} @ ₹${Number(f.pricePerDay || 0)}/day)`
            });
        });

        admissions.forEach(adm => {
            const amount = Number(adm.totalAmount || 0);
            const isPaid = adm.paymentStatus === 'Paid' || adm.paymentStatus === 'Waived';
            const facilitiesText = adm.selectedFacilities?.length
                ? ` + ${adm.selectedFacilities.map(f => f.facilityName).join(', ')}`
                : '';
            bills.push({
                id: adm._id.toString(),
                billNumber: adm.billNumber || `BILL-ADM-${adm._id.toString().slice(-6).toUpperCase()}`,
                rawCategory: 'Admission',
                category: 'Admission',
                date: adm.admissionDate || adm.createdAt,
                amount: amount,
                paidAmount: isPaid ? amount : 0,
                pendingAmount: isPaid ? 0 : amount,
                status: isPaid ? 'Paid' : 'Pending',
                details: `Hospitalization: Ward ${adm.ward || 'General'}${adm.bedNumber ? ', Bed ' + adm.bedNumber : ''}${facilitiesText}`
            });
        });

        // Sort bills newest first
        bills.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

        // Normalize payment transactions into clean history without sensitive data
        const paymentHistory = paymentTransactions.map(pt => ({
            id: pt._id.toString(),
            receiptNumber: `RCPT-${pt._id.toString().slice(-6).toUpperCase()}`,
            paymentDate: pt.paymentDate || pt.createdAt,
            paymentMode: pt.paymentMode || 'Cash',
            transactionId: pt.transactionId || pt.upiId || pt.bankReference || '—',
            upiId: pt.upiId || '',
            bankReference: pt.bankReference || '',
            cardDetails: pt.cardDetails ? `**** **** **** ${String(pt.cardDetails).slice(-4)}` : '',
            amount: Number(pt.amount || 0),
            status: pt.paymentStatus || 'Paid',
            description: pt.description || 'General Hospital Payment',
            proofUrl: pt.proofUrl || '',
            billedItems: pt.billedItems || {}
        })).sort((a, b) => new Date(b.paymentDate || 0) - new Date(a.paymentDate || 0));

        const totalAmount = bills.reduce((acc, b) => acc + b.amount, 0);
        const paidAmount = bills.reduce((acc, b) => acc + b.paidAmount, 0);
        const pendingAmount = bills.reduce((acc, b) => acc + b.pendingAmount, 0);

        res.json({
            success: true,
            patient: {
                _id: user._id,
                name: user.name,
                mrn: user.mrn || user.patientId || '—',
                phone: user.phone || '—',
                email: user.email || '—'
            },
            hospital: {
                name: hospitalName
            },
            bills,
            paymentHistory,
            summary: {
                totalBills: bills.length,
                totalAmount: totalAmount,
                paidAmount: paidAmount,
                pendingAmount: pendingAmount,
                totalPayments: paymentHistory.length
            }
        });

    } catch (error) {
        console.error('Patient Bills Fetch Error:', error);
        res.status(500).json({ success: false, message: 'Internal server error.' });
    }
});

// POST /api/patient-auth/bills/pay
// Pay one or more pending bills securely
router.post('/bills/pay', verifyPatientToken, async (req, res) => {
    try {
        if (!req.patient.linkedPatientProfileId) {
            return res.status(403).json({ success: false, message: 'Patient profile not linked.' });
        }

        const patientId = req.patient.linkedPatientProfileId;
        const {
            billIds = [],
            paymentMode = 'UPI',
            transactionId = '',
            upiId = '',
            cardDetails = '',
            bankReference = '',
            proofUrl = '',
            proofFileId = ''
        } = req.body;

        if (!Array.isArray(billIds) || billIds.length === 0) {
            return res.status(400).json({ success: false, message: 'No bills selected for payment.' });
        }

        const { Appointment, LabReport, PharmacyOrder, FacilityCharge, Admission, PaymentTransaction } = getPatientModels(req);
        
        const MasterAppointment = require('../models/appointment.model');
        const MasterLabReport = require('../models/labReport.model');
        const MasterPharmacyOrder = require('../models/pharmacyOrder.model');
        const MasterFacilityCharge = require('../models/facilityCharge.model');
        const MasterAdmission = require('../models/admission.model');
        const MasterPaymentTransaction = require('../models/paymentTransaction.model');

        const patientFilter = {
            _id: { $in: billIds },
            $or: [{ userId: patientId }, { patientId: patientId }]
        };

        const fetchWithMasterFallback = async (Model, MasterModel, query) => {
            let results = await Model.find(query);
            if (Model !== MasterModel) {
                const masterResults = await MasterModel.find(query);
                const seen = new Set(results.map(r => r._id.toString()));
                for (const mr of masterResults) {
                    if (!seen.has(mr._id.toString())) results.push(mr);
                }
            }
            return results;
        };

        const [appointments, labReports, pharmacyOrders, facilityCharges, admissions] = await Promise.all([
            fetchWithMasterFallback(Appointment, MasterAppointment, patientFilter),
            fetchWithMasterFallback(LabReport, MasterLabReport, patientFilter),
            fetchWithMasterFallback(PharmacyOrder, MasterPharmacyOrder, patientFilter),
            fetchWithMasterFallback(FacilityCharge, MasterFacilityCharge, patientFilter),
            fetchWithMasterFallback(Admission, MasterAdmission, patientFilter)
        ]);

        const totalMatched = appointments.length + labReports.length + pharmacyOrders.length + facilityCharges.length + admissions.length;
        if (totalMatched === 0) {
            return res.status(404).json({ success: false, message: 'Selected bills not found or unauthorized.' });
        }

        let totalAmount = 0;
        const appointmentIds = [];
        const labReportIds = [];
        const pharmacyOrderIds = [];
        const facilityChargeIds = [];
        const admissionIds = [];

        appointments.forEach(a => {
            if (a.paymentStatus !== 'Paid' && a.paymentStatus !== 'Waived') {
                totalAmount += Number(a.amount || a.fee || 0);
            }
            appointmentIds.push(a._id);
        });
        labReports.forEach(l => {
            if (l.paymentStatus !== 'Paid' && l.paymentStatus !== 'Waived') {
                totalAmount += Number(l.amount || l.price || 0);
            }
            labReportIds.push(l._id);
        });
        pharmacyOrders.forEach(p => {
            if (p.paymentStatus !== 'Paid' && p.paymentStatus !== 'Waived') {
                totalAmount += Number(p.totalAmount || 0);
            }
            pharmacyOrderIds.push(p._id);
        });
        facilityCharges.forEach(f => {
            if (f.paymentStatus !== 'Paid' && f.paymentStatus !== 'Waived') {
                totalAmount += Number(f.totalAmount || 0);
            }
            facilityChargeIds.push(f._id);
        });
        admissions.forEach(adm => {
            if (adm.paymentStatus !== 'Paid' && adm.paymentStatus !== 'Waived') {
                totalAmount += Number(adm.totalAmount || 0);
            }
            admissionIds.push(adm._id);
        });

        // Update paymentStatus across matched models
        await Promise.all([
            appointmentIds.length > 0 && Appointment.updateMany({ _id: { $in: appointmentIds } }, { $set: { paymentStatus: 'Paid', paymentMode } }),
            appointmentIds.length > 0 && Appointment !== MasterAppointment && MasterAppointment.updateMany({ _id: { $in: appointmentIds } }, { $set: { paymentStatus: 'Paid', paymentMode } }),

            labReportIds.length > 0 && LabReport.updateMany({ _id: { $in: labReportIds } }, { $set: { paymentStatus: 'Paid', paymentMode } }),
            labReportIds.length > 0 && LabReport !== MasterLabReport && MasterLabReport.updateMany({ _id: { $in: labReportIds } }, { $set: { paymentStatus: 'Paid', paymentMode } }),

            pharmacyOrderIds.length > 0 && PharmacyOrder.updateMany({ _id: { $in: pharmacyOrderIds } }, { $set: { paymentStatus: 'Paid' } }),
            pharmacyOrderIds.length > 0 && PharmacyOrder !== MasterPharmacyOrder && MasterPharmacyOrder.updateMany({ _id: { $in: pharmacyOrderIds } }, { $set: { paymentStatus: 'Paid' } }),

            facilityChargeIds.length > 0 && FacilityCharge.updateMany({ _id: { $in: facilityChargeIds } }, { $set: { paymentStatus: 'Paid' } }),
            facilityChargeIds.length > 0 && FacilityCharge !== MasterFacilityCharge && MasterFacilityCharge.updateMany({ _id: { $in: facilityChargeIds } }, { $set: { paymentStatus: 'Paid' } }),

            admissionIds.length > 0 && Admission.updateMany({ _id: { $in: admissionIds } }, { $set: { paymentStatus: 'Paid' } }),
            admissionIds.length > 0 && Admission !== MasterAdmission && MasterAdmission.updateMany({ _id: { $in: admissionIds } }, { $set: { paymentStatus: 'Paid' } })
        ].filter(Boolean));

        // Build dynamic description
        let descParts = [];
        if (appointmentIds.length > 0) descParts.push(`${appointmentIds.length} Consultation(s)`);
        if (labReportIds.length > 0) descParts.push(`${labReportIds.length} Lab Test(s)`);
        if (pharmacyOrderIds.length > 0) descParts.push(`${pharmacyOrderIds.length} Pharmacy Order(s)`);
        if (facilityChargeIds.length > 0) descParts.push(`${facilityChargeIds.length} Facility Charge(s)`);
        if (admissionIds.length > 0) descParts.push(`${admissionIds.length} Admission(s)`);

        const description = descParts.length > 0 ? `Online Payment: ${descParts.join(', ')}` : 'Patient Portal Payment';

        const pt = new PaymentTransaction({
            hospitalId: req.patient.hospitalId || null,
            patientId: patientId,
            paymentMode: paymentMode,
            paymentStatus: 'Paid',
            amount: totalAmount,
            transactionId: transactionId,
            upiId: upiId,
            cardDetails: cardDetails ? String(cardDetails).slice(-4) : '',
            bankReference: bankReference,
            proofUrl: proofUrl,
            proofFileId: proofFileId,
            description: description,
            billedItems: {
                appointments: appointmentIds,
                labReports: labReportIds,
                pharmacyOrders: pharmacyOrderIds,
                facilityCharges: facilityChargeIds,
                admissions: admissionIds
            }
        });
        await pt.save();

        res.json({
            success: true,
            message: `Payment of ₹${totalAmount} processed successfully.`,
            transactionId: pt._id
        });

    } catch (error) {
        console.error('Patient Bills Payment Error:', error);
        res.status(500).json({ success: false, message: 'Internal server error during payment.' });
    }
});

// ==========================================
// DEPARTMENT UPI — Patient-facing lookup
// ==========================================

// Get department UPI by role name (for patient dashboard payment QR)
router.get('/department-upi/:roleName', verifyPatientToken, async (req, res) => {
    try {
        const patientAuth = await PatientAuth.findById(req.patient._id || req.patient.id);
        if (!patientAuth || !patientAuth.hospitalId) {
            return res.status(400).json({ success: false, message: 'Patient hospital not found' });
        }

        const DepartmentUpi = require('../models/departmentUpi.model');
        const roleName = decodeURIComponent(req.params.roleName).trim();

        const upiDoc = await DepartmentUpi.findOne({
            hospitalId: patientAuth.hospitalId,
            staffRoleName: { $regex: new RegExp(`^${roleName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
            isActive: true
        });

        if (!upiDoc) {
            return res.json({ success: true, departmentUpi: null, message: 'No UPI account configured for this department' });
        }

        // Only expose what the patient needs
        res.json({
            success: true,
            departmentUpi: {
                upiId: upiDoc.upiId,
                label: upiDoc.label,
                staffRoleName: upiDoc.staffRoleName
            }
        });
    } catch (err) {
        console.error('Error fetching department UPI for patient:', err);
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// PUT /api/patient-auth/profile
// Update complete demographic profile for the logged-in patient
router.put('/profile', verifyPatientToken, async (req, res) => {
    try {
        const patientAuth = await PatientAuth.findById(req.patient.id);
        if (!patientAuth) {
            return res.status(404).json({ success: false, message: 'Patient account not found.' });
        }

        const updates = req.body;

        // 1. Update fields in PatientAuth
        if (updates.name) patientAuth.name = updates.name.trim();
        if (updates.email) patientAuth.email = updates.email.toLowerCase().trim();
        if (updates.mobile) {
            const ph = String(updates.mobile).replace(/\D/g, '').slice(0, 10);
            if (ph.length === 10) patientAuth.mobile = ph;
        }
        if (updates.age) patientAuth.age = Number(updates.age);
        if (updates.aadhaarNumber) patientAuth.aadhaarNumber = updates.aadhaarNumber;
        await patientAuth.save();

        // 2. Resolve or Create the clinical User profile
        let userDoc = null;
        if (patientAuth.linkedPatientProfileId) {
            userDoc = await User.findById(patientAuth.linkedPatientProfileId);
        }

        // If no linked profile exists, let's create a new User clinical record
        if (!userDoc) {
            const hospital = await Hospital.findById(patientAuth.hospitalId);
            const newMrn = await generateUniversalMRN(patientAuth.hospitalId, hospital, User);
            userDoc = new User({
                name: patientAuth.name,
                email: patientAuth.email,
                phone: patientAuth.mobile,
                role: 'patient',
                hospitalId: patientAuth.hospitalId,
                patientId: newMrn,
                mrn: newMrn,
                age: patientAuth.age,
                aadhaarNumber: patientAuth.aadhaarNumber,
                registrationType: 'Self',
                patientStatus: 'Active'
            });
            await userDoc.save();

            // Link the profile to patient auth
            patientAuth.linkedPatientProfileId = userDoc._id;
            await patientAuth.save();
        }

        // 3. Update clinical User document fields
        if (updates.name) userDoc.name = updates.name.trim();
        if (updates.email) userDoc.email = updates.email.toLowerCase().trim();
        if (updates.mobile) {
            const ph = String(updates.mobile).replace(/\D/g, '').slice(0, 10);
            if (ph.length === 10) userDoc.phone = ph;
        }
        
        // Static Demographics
        if (updates.dob !== undefined) userDoc.dob = updates.dob;
        if (updates.gender !== undefined) userDoc.gender = updates.gender;
        if (updates.bloodGroup !== undefined) userDoc.bloodGroup = updates.bloodGroup;
        if (updates.maritalStatus !== undefined) userDoc.maritalStatus = updates.maritalStatus;
        if (updates.nationality !== undefined) userDoc.nationality = updates.nationality;
        if (updates.occupation !== undefined) userDoc.occupation = updates.occupation;
        if (updates.age !== undefined) userDoc.age = Number(updates.age);
        if (updates.panNumber !== undefined) userDoc.panNumber = updates.panNumber;

        // Address
        if (updates.address !== undefined) userDoc.address = updates.address;
        if (updates.houseNo !== undefined) userDoc.houseNo = updates.houseNo;
        if (updates.buildingName !== undefined) userDoc.buildingName = updates.buildingName;
        if (updates.street !== undefined) userDoc.street = updates.street;
        if (updates.area !== undefined) userDoc.area = updates.area;
        if (updates.landmark !== undefined) userDoc.landmark = updates.landmark;
        if (updates.city !== undefined) userDoc.city = updates.city;
        if (updates.state !== undefined) userDoc.state = updates.state;
        if (updates.country !== undefined) userDoc.country = updates.country;
        if (updates.zipCode !== undefined) userDoc.zipCode = updates.zipCode;

        // Contact
        if (updates.alternateMobile !== undefined) userDoc.alternateMobile = updates.alternateMobile;
        if (updates.whatsappNumber !== undefined) userDoc.whatsappNumber = updates.whatsappNumber;

        // Emergency Contact
        if (updates.emergencyContact) {
            userDoc.emergencyContact = {
                name: updates.emergencyContact.name || userDoc.emergencyContact?.name || '',
                relation: updates.emergencyContact.relation || userDoc.emergencyContact?.relation || '',
                mobile: updates.emergencyContact.mobile || userDoc.emergencyContact?.mobile || ''
            };
        }

        // KYC / Aadhaar
        if (updates.aadhaarNumber !== undefined) userDoc.aadhaarNumber = updates.aadhaarNumber;
        if (updates.isAadhaarVerified !== undefined) userDoc.isAadhaarVerified = updates.isAadhaarVerified;

        // Avatar (Profile Picture)
        if (updates.avatar !== undefined) userDoc.avatar = updates.avatar;

        // Fertility Profile vitals
        if (userDoc.fertilityProfile === undefined || userDoc.fertilityProfile === null) {
            userDoc.fertilityProfile = {};
        }

        const fertFields = ['height', 'weight', 'bmi', 'allergies', 'chronicDiseases', 'medicalHistory', 'surgicalHistory', 'currentMedications'];
        fertFields.forEach(field => {
            if (updates[field] !== undefined) {
                userDoc.fertilityProfile[field] = updates[field];
            }
        });

        // Save modifications to mixed schema properly
        userDoc.markModified('fertilityProfile');
        userDoc.markModified('emergencyContact');
        
        await userDoc.save();

        // Send back updated profile in the same shape as GET /profile
        let hospitalName = 'Not Specified';
        let branch = '';
        if (userDoc.hospitalId) {
            const hosp = await Hospital.findById(userDoc.hospitalId).select('name branch').lean();
            if (hosp) {
                hospitalName = hosp.name;
                branch = hosp.branch || '';
            }
        }

        const profile = {
            ...userDoc.toObject(),
            name: userDoc.name,
            email: userDoc.email,
            phone: userDoc.phone,
            mobile: userDoc.phone,
            aadhaarNumber: userDoc.aadhaarNumber,
            age: userDoc.age,
            hospitalName: hospitalName,
            branch: userDoc.branch || branch,
            registrationDate: patientAuth.createdAt || userDoc.createdAt
        };

        res.json({ success: true, message: 'Profile updated successfully.', profile });

    } catch (error) {
        console.error('Patient Profile Update Error:', error);
        res.status(500).json({ success: false, message: 'Internal server error during profile update.' });
    }
});

module.exports = router;

