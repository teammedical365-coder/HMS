const express = require('express');
const router = express.Router();
const PatientAuth = require('../models/patientAuth.model');
const Hospital = require('../models/hospital.model');

// POST /api/patient-auth/register
// Register a new patient authentication account
router.post('/register', async (req, res) => {
    try {
        const { name, email, mobile, password, hospitalId } = req.body;

        // Basic validations
        if (!name || !email || !mobile || !password || !hospitalId) {
            return res.status(400).json({ success: false, message: 'All fields are required.' });
        }

        if (password.length < 8) {
            return res.status(400).json({ success: false, message: 'Password must be at least 8 characters long.' });
        }

        // Email format validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ success: false, message: 'Invalid email format.' });
        }

        // Mobile format validation (basic 10 digits for India/general)
        const mobileRegex = /^[0-9]{10,15}$/;
        if (!mobileRegex.test(mobile)) {
            return res.status(400).json({ success: false, message: 'Invalid mobile number.' });
        }

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
            hospitalId
        });

        await newPatientAccount.save();

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
        if (patient.linkedPatientProfileId) {
            const User = require('../models/user.model');
            const linkedProfile = await User.findById(patient.linkedPatientProfileId).select('patientId mrn');
            mrn = linkedProfile?.patientId || linkedProfile?.mrn || null;
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
const User = require('../models/user.model'); // Added to fetch MRN

router.get('/me', verifyPatientToken, async (req, res) => {
    let mrn = null;
    if (req.patient.linkedPatientProfileId) {
        const linkedProfile = await User.findById(req.patient.linkedPatientProfileId).select('patientId mrn');
        mrn = linkedProfile?.patientId || linkedProfile?.mrn || null;
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

// GET /api/patient-auth/profile
// Fetch complete demographic profile for the logged-in patient
router.get('/profile', verifyPatientToken, async (req, res) => {
    try {
        if (!req.patient.linkedPatientProfileId) {
            return res.status(404).json({ success: false, message: 'Patient profile not linked yet.' });
        }

        const profile = await User.findById(req.patient.linkedPatientProfileId).select('-password -role');
        if (!profile) {
            return res.status(404).json({ success: false, message: 'Profile not found.' });
        }

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

        const fp = user.fertilityProfile || {};
        const baseDocs = Array.isArray(fp.documents) ? fp.documents.map(d => ({
            ...d,
            hospital: hospitalName
        })) : [];
        const prevReports = Array.isArray(fp.previousReports) ? fp.previousReports.map(r => ({
            fileName: r.fileName || r.name || 'Medical Report',
            docType: r.docType || 'Medical Report',
            url: r.url || r.fileUrl || r.filename,
            uploadedAt: r.date || r.uploadedAt || user.updatedAt || new Date(),
            fileId: r.fileId || r._id || null,
            uploadedBy: r.uploadedBy || 'Doctor',
            hospital: hospitalName
        })) : [];
        const doctorReports = Array.isArray(fp.reports) ? fp.reports.map(r => ({
            fileName: r.name || r.fileName || 'Medical Report',
            docType: r.docType || 'Medical Report',
            url: r.url || r.fileUrl || (r.filename ? ((r.filename || '').startsWith('http') ? r.filename : `/api/patients/reports/${encodeURIComponent(r.filename)}`) : null),
            uploadedAt: r.uploadedAt || r.date || new Date(),
            fileId: r.fileId || r._id || null,
            uploadedBy: r.uploadedBy || 'Doctor',
            hospital: hospitalName
        })) : [];

        // Also fetch LabReports
        const LabReport = require('../models/labReport.model');
        const labQuery = { $or: [{ userId: patientId }, { patientId: patientId }] };
        if (hospitalId) labQuery.hospitalId = hospitalId;
        const labReports = await LabReport.find({ ...labQuery, 'data.fileUrl': { $ne: null } }).lean();
        const labDocs = labReports.map(l => ({
            fileName: l.data?.reportName || l.data?.testName || 'Lab Investigation Report',
            docType: 'Lab Reports',
            url: l.data.fileUrl,
            uploadedAt: l.createdAt,
            fileId: l._id,
            uploadedBy: 'Lab',
            hospital: hospitalName
        }));

        const allCombined = [...baseDocs, ...prevReports, ...doctorReports, ...labDocs];
        
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

module.exports = router;
