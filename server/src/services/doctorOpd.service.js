/**
 * doctorOpd.service.js
 * 
 * Comprehensive backend business logic for Free Doctor OPD Plan (Phase 3).
 * 
 * Modules:
 * 1. Patient Monitoring (Search, listing, full profile, unlimited records)
 * 2. Doctor Patient Tray (Today's queue, waiting, in-consultation, completed, cancelled)
 * 3. Appointment Management (Create, details, reschedule, cancel, quota enforcement)
 * 4. Money Tracker (Fee recording, payment, daily/monthly/total collections, exact split payment calculation)
 * 5. Revisit Schedule (Follow-up dates, today/upcoming/overdue revisits, quota-governed follow-up booking)
 * 6. Prescriptions (Manual prescription saving, previous history retrieval)
 * 7. Basic OPD Reports (Queue, patients, collections, payment breakdown, revisits)
 */

const mongoose = require('mongoose');
const Appointment = require('../models/appointment.model');
const Doctor = require('../models/doctor.model');
const User = require('../models/user.model');
const ClinicPatient = require('../models/clinicPatient.model');
const PaymentTransaction = require('../models/paymentTransaction.model');
const ClinicalVisit = require('../models/clinicalVisit.model');
const quotaService = require('./appointmentQuota.service');

// Helper: resolve Doctor object & query constraints for this authenticated doctor
async function resolveDoctorContext(user, doctorIdParam = null) {
    const userId = user.id || user.userId || user._id;
    const hospitalId = user.hospitalId;

    let doctorDoc = null;
    if (doctorIdParam && mongoose.Types.ObjectId.isValid(doctorIdParam)) {
        doctorDoc = await Doctor.findOne({ _id: doctorIdParam, ...(hospitalId ? { hospitalId } : {}) });
    }

    if (!doctorDoc && userId) {
        doctorDoc = await Doctor.findOne({ userId, ...(hospitalId ? { hospitalId } : {}) });
    }

    const doctorId = doctorDoc ? doctorDoc._id : null;
    const doctorUserId = userId;
    const doctorName = doctorDoc ? doctorDoc.name : (user.name || 'Doctor');

    return { doctorDoc, doctorId, doctorUserId, doctorName, hospitalId };
}

// Build query filter matching doctor ownership
function getDoctorApptFilter(doctorId, doctorUserId, hospitalId) {
    const filter = {};
    if (hospitalId) filter.hospitalId = hospitalId;

    const orClauses = [];
    if (doctorId) orClauses.push({ doctorId });
    if (doctorUserId) orClauses.push({ doctorUserId });

    if (orClauses.length > 0) {
        filter.$or = orClauses;
    }
    return filter;
}

// Calculate financial collections breakdown respecting Split payments
function calculateCollectionBreakdown(records) {
    let total = 0;
    let cash = 0;
    let upi = 0;
    let card = 0;
    let other = 0;

    for (const item of records) {
        const itemAmount = Number(item.amount) || 0;
        total += itemAmount;

        if (Array.isArray(item.splitPayments) && item.splitPayments.length > 0) {
            for (const part of item.splitPayments) {
                const partAmt = Number(part.amount) || 0;
                const m = String(part.method || '').toLowerCase().trim();
                if (m.includes('cash')) cash += partAmt;
                else if (m.includes('upi')) upi += partAmt;
                else if (m.includes('card')) card += partAmt;
                else other += partAmt;
            }
        } else {
            const m = String(item.paymentMethod || item.paymentMode || 'Cash').toLowerCase().trim();
            if (m.includes('cash')) cash += itemAmount;
            else if (m.includes('upi')) upi += itemAmount;
            else if (m.includes('card')) card += itemAmount;
            else other += itemAmount;
        }
    }

    return {
        total: Math.round(total * 100) / 100,
        cash: Math.round(cash * 100) / 100,
        upi: Math.round(upi * 100) / 100,
        card: Math.round(card * 100) / 100,
        other: Math.round(other * 100) / 100
    };
}

// ============================================================================
// 1. PATIENT MONITORING MODULE
// ============================================================================

async function searchPatients({ hospitalId, query = '', page = 1, limit = 20 }) {
    if (!hospitalId) throw new Error('Hospital ID is required for patient search');

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const trimmed = String(query).trim();
    const isObjectId = mongoose.Types.ObjectId.isValid(trimmed) && trimmed.length === 24;

    // Search Users (Hospital Patients)
    const userQuery = { hospitalId, role: 'patient' };
    if (trimmed) {
        if (isObjectId) {
            userQuery.$or = [
                { _id: new mongoose.Types.ObjectId(trimmed) },
                { patientId: trimmed },
                { mrn: trimmed }
            ];
        } else {
            userQuery.$or = [
                { name: { $regex: trimmed, $options: 'i' } },
                { phone: { $regex: trimmed, $options: 'i' } },
                { patientId: { $regex: trimmed, $options: 'i' } },
                { mrn: { $regex: trimmed, $options: 'i' } }
            ];
        }
    }

    // Search ClinicPatients (Clinic Patients)
    const clinicQuery = { clinicId: hospitalId };
    if (trimmed) {
        if (isObjectId) {
            clinicQuery.$or = [
                { _id: new mongoose.Types.ObjectId(trimmed) },
                { patientUid: trimmed }
            ];
        } else {
            clinicQuery.$or = [
                { name: { $regex: trimmed, $options: 'i' } },
                { phone: { $regex: trimmed, $options: 'i' } },
                { patientUid: { $regex: trimmed, $options: 'i' } }
            ];
        }
    }

    const [userCount, clinicCount] = await Promise.all([
        User.countDocuments(userQuery),
        ClinicPatient.countDocuments(clinicQuery)
    ]);
    const totalCount = userCount + clinicCount;

    // Fetch records
    const [users, clinicPatients] = await Promise.all([
        User.find(userQuery)
            .select('_id name phone email patientId mrn gender age dob bloodGroup address createdAt')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limitNum)
            .lean(),
        ClinicPatient.find(clinicQuery)
            .select('_id name phone email patientUid gender age dob bloodGroup address createdAt')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limitNum)
            .lean()
    ]);

    const formattedUsers = users.map(u => ({
        _id: u._id,
        patientId: u.patientId || u.mrn || String(u._id),
        name: u.name,
        phone: u.phone,
        email: u.email,
        gender: u.gender,
        age: u.age,
        dob: u.dob,
        bloodGroup: u.bloodGroup,
        address: u.address,
        createdAt: u.createdAt,
        type: 'hospital'
    }));

    const formattedClinics = clinicPatients.map(c => ({
        _id: c._id,
        patientId: c.patientUid,
        name: c.name,
        phone: c.phone,
        email: c.email,
        gender: c.gender,
        age: c.age,
        dob: c.dob,
        bloodGroup: c.bloodGroup,
        address: c.address,
        createdAt: c.createdAt,
        type: 'clinic'
    }));

    const combined = [...formattedUsers, ...formattedClinics].slice(0, limitNum);

    return {
        patients: combined,
        total: totalCount,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(totalCount / limitNum) || 1
    };
}

async function registerPatient({
    hospitalId,
    name,
    phone,
    gender = 'Male',
    age = null,
    dob = null,
    bloodGroup = '',
    address = '',
    allergies = '',
    chronicConditions = '',
    medicalNotes = '',
    email = ''
}) {
    if (!hospitalId) throw new Error('Hospital/Clinic context required');
    if (!name || typeof name !== 'string' || name.trim().length < 2) {
        throw new Error('Patient full name is required (min 2 characters)');
    }
    const cleanPhone = String(phone || '').replace(/\D/g, '').slice(-10);
    if (cleanPhone.length !== 10) {
        throw new Error('Valid 10-digit phone number is required');
    }

    const cleanEmail = (email && typeof email === 'string' && email.trim().length > 0)
        ? email.trim().toLowerCase()
        : undefined;

    if (cleanEmail && !/^\S+@\S+\.\S+$/.test(cleanEmail)) {
        throw new Error('Please enter a valid email address');
    }

    // Check if patient already exists in this clinic by phone
    let existing = await ClinicPatient.findOne({ clinicId: hospitalId, phone: cleanPhone });
    if (existing) {
        return {
            patient: existing,
            existing: true,
            message: `Patient with phone ${cleanPhone} is already registered (${existing.patientUid})`
        };
    }

    // Check if patient already exists in this clinic by email
    if (cleanEmail) {
        const existingEmail = await ClinicPatient.findOne({ clinicId: hospitalId, email: cleanEmail });
        if (existingEmail) {
            return {
                patient: existingEmail,
                existing: true,
                message: `Patient with email ${cleanEmail} is already registered (${existingEmail.patientUid})`
            };
        }
    }

    // Generate unique patientUid
    const Hospital = require('../models/hospital.model');
    const hosp = await Hospital.findById(hospitalId).select('clinicCode name');
    let prefix = hosp?.clinicCode;
    if (!prefix && hosp?.name) {
        prefix = hosp.name.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || 'OPD';
    }
    if (!prefix) prefix = 'OPD';

    const count = await ClinicPatient.countDocuments({ clinicId: hospitalId });
    const patientUid = `${prefix}-${String(count + 1).padStart(3, '0')}`;

    const newPatient = new ClinicPatient({
        clinicId: hospitalId,
        patientUid,
        name: name.trim(),
        phone: cleanPhone,
        email: cleanEmail,
        gender: gender || 'Male',
        age: (age && Number(age) > 0) ? Number(age) : 1,
        dob: dob ? new Date(dob) : undefined,
        bloodGroup: bloodGroup ? bloodGroup.trim() : undefined,
        address: address ? address.trim() : undefined,
        allergies: allergies ? allergies.trim() : undefined,
        chronicConditions: chronicConditions ? chronicConditions.trim() : undefined,
        medicalNotes: medicalNotes ? medicalNotes.trim() : undefined
    });

    await newPatient.save();
    return {
        patient: newPatient,
        existing: false,
        message: `Patient registered successfully (${patientUid})`
    };
}

async function getPatientOverview({ hospitalId, patientId }) {
    if (!hospitalId || !patientId) throw new Error('Hospital ID and Patient ID are required');

    const isObjectId = mongoose.Types.ObjectId.isValid(patientId) && String(patientId).length === 24;

    // 1. Find patient record
    let patient = null;
    let isClinic = false;

    if (isObjectId) {
        patient = await User.findOne({ _id: patientId, hospitalId }).lean();
        if (!patient) {
            patient = await ClinicPatient.findOne({ _id: patientId, clinicId: hospitalId }).lean();
            if (patient) isClinic = true;
        }
    } else {
        patient = await User.findOne({
            hospitalId,
            $or: [{ patientId }, { mrn: patientId }]
        }).lean();
        if (!patient) {
            patient = await ClinicPatient.findOne({ clinicId: hospitalId, patientUid: patientId }).lean();
            if (patient) isClinic = true;
        }
    }

    if (!patient) return null;

    // 2. Fetch past appointments
    const apptFilter = {
        hospitalId,
        $or: [
            { userId: patient._id },
            { clinicPatientId: patient._id },
            { patientId: patient.patientId || patient.patientUid }
        ]
    };

    const appointments = await Appointment.find(apptFilter)
        .populate('doctorId', 'name specialty consultationFee')
        .sort({ appointmentDate: -1 })
        .lean();

    // 3. Fetch past clinical visits
    const clinicalVisits = await ClinicalVisit.find({
        hospitalId,
        $or: [
            { patientId: patient._id },
            { patientId: String(patient._id) }
        ]
    }).sort({ createdAt: -1 }).lean();

    // 4. Resolve latest vitals
    let vitals = {};
    if (appointments.length > 0 && appointments[0].vitals) {
        vitals = appointments[0].vitals;
    } else if (patient.vitals) {
        vitals = patient.vitals;
    }

    // 5. Gather prescriptions
    const prescriptions = appointments
        .filter(a => (a.pharmacy && a.pharmacy.length > 0) || a.prescription || (a.prescriptions && a.prescriptions.length > 0))
        .map(a => ({
            appointmentId: a._id,
            date: a.appointmentDate,
            doctorName: a.doctorName || a.doctorId?.name || 'Doctor',
            diagnosis: a.diagnosis || '',
            medicines: a.pharmacy || [],
            prescriptionUrl: a.prescription || (a.prescriptions?.[0]?.url || ''),
            vitals: a.vitals || {}
        }));

    return {
        patient: {
            _id: patient._id,
            patientId: patient.patientId || patient.patientUid || String(patient._id),
            name: patient.name,
            phone: patient.phone,
            email: patient.email,
            gender: patient.gender,
            age: patient.age,
            dob: patient.dob,
            bloodGroup: patient.bloodGroup || '',
            address: patient.address || '',
            allergies: patient.allergies || '',
            chronicConditions: patient.chronicConditions || '',
            medicalNotes: patient.medicalNotes || '',
            fertilityProfile: patient.fertilityProfile || {},
            type: isClinic ? 'clinic' : 'hospital',
            createdAt: patient.createdAt
        },
        vitals,
        appointments,
        clinicalVisits,
        prescriptions,
        totalVisits: appointments.length
    };
}

// ============================================================================
// 2. DOCTOR PATIENT TRAY MODULE
// ============================================================================

async function getDoctorTray({ hospitalId, doctorId, doctorUserId, dateStr }) {
    const { start, end, dateStr: istDateStr } = quotaService.getIstDayRange(dateStr || new Date());

    const filter = {
        hospitalId,
        appointmentDate: { $gte: start, $lte: end }
    };

    const docClauses = [];
    if (doctorId) docClauses.push({ doctorId });
    if (doctorUserId) docClauses.push({ doctorUserId });
    if (docClauses.length > 0) {
        filter.$or = docClauses;
    }

    const appointments = await Appointment.find(filter)
        .populate('userId', 'name phone email patientId mrn gender age')
        .populate('clinicPatientId', 'name phone email patientUid gender age')
        .populate('doctorId', 'name specialty consultationFee')
        .sort({ appointmentTime: 1, createdAt: 1 })
        .lean();

    const waiting = [];
    const inConsultation = [];
    const completed = [];
    const cancelled = [];

    for (const appt of appointments) {
        const patientName = appt.userId?.name || appt.clinicPatientId?.name || 'Walk-in Patient';
        const patientPhone = appt.userId?.phone || appt.clinicPatientId?.phone || '';
        const patientCode = appt.userId?.patientId || appt.userId?.mrn || appt.clinicPatientId?.patientUid || appt.patientId || 'N/A';

        const enrichedAppt = {
            ...appt,
            patientName,
            patientPhone,
            patientCode
        };

        if (appt.status === 'cancelled') {
            cancelled.push(enrichedAppt);
        } else if (appt.status === 'completed') {
            completed.push(enrichedAppt);
        } else if (appt.status === 'in-consultation') {
            inConsultation.push(enrichedAppt);
        } else {
            // 'pending' or 'confirmed'
            waiting.push(enrichedAppt);
        }
    }

    return {
        date: istDateStr,
        todayAppointments: appointments,
        waiting,
        inConsultation,
        completed,
        cancelled,
        summary: {
            total: appointments.length,
            waitingCount: waiting.length,
            inConsultationCount: inConsultation.length,
            completedCount: completed.length,
            cancelledCount: cancelled.length
        }
    };
}

async function startConsultation({ hospitalId, doctorId, doctorUserId, appointmentId }) {
    if (!mongoose.Types.ObjectId.isValid(appointmentId)) throw new Error('Invalid appointment ID');

    const appt = await Appointment.findOne({ _id: appointmentId, hospitalId });
    if (!appt) throw new Error('Appointment not found or unauthorized');

    if (appt.status === 'cancelled') {
        throw new Error('Cannot start consultation for a cancelled appointment');
    }

    appt.status = 'in-consultation';
    await appt.save();
    return appt;
}

async function completeConsultation({ hospitalId, doctorId, doctorUserId, appointmentId, payload = {} }) {
    if (!mongoose.Types.ObjectId.isValid(appointmentId)) throw new Error('Invalid appointment ID');

    const appt = await Appointment.findOne({ _id: appointmentId, hospitalId });
    if (!appt) throw new Error('Appointment not found or unauthorized');

    appt.status = 'completed';

    if (payload.diagnosis !== undefined) appt.diagnosis = payload.diagnosis;
    if (payload.doctorNotes !== undefined) appt.doctorNotes = payload.doctorNotes;
    if (payload.notes !== undefined) appt.notes = payload.notes;
    if (payload.symptoms !== undefined) appt.symptoms = payload.symptoms;

    if (Array.isArray(payload.pharmacy)) {
        appt.pharmacy = payload.pharmacy.map(p => ({
            medicineName: p.medicineName || p.name || '',
            saltName: p.saltName || '',
            dosage: p.dosage || '',
            frequency: p.frequency || '',
            duration: p.duration || '',
            instructions: p.instructions || ''
        }));
    }

    if (payload.vitals && typeof payload.vitals === 'object') {
        appt.vitals = { ...appt.vitals, ...payload.vitals };
    }

    if (payload.followUpDate) {
        appt.followUpDate = new Date(payload.followUpDate);
    }

    await appt.save();
    return appt;
}

// ============================================================================
// 3. APPOINTMENT MANAGEMENT MODULE
// ============================================================================

async function createAppointment({
    hospitalId,
    doctorId,
    doctorUserId,
    doctorName,
    patientId,
    appointmentDate,
    appointmentTime = '',
    amount = 0,
    paymentMethod = 'Cash',
    notes = '',
    followUpDate = null,
    visitType = 'New Consultation',
    diagnosis = '',
    pharmacy = []
}) {
    if (!hospitalId || !appointmentDate) {
        throw new Error('Hospital ID and appointment date are required');
    }

    const { dateStr } = quotaService.getIstDayRange(appointmentDate);

    // 1. Quota reservation (Atomic Phase 2 service)
    const quotaResult = await quotaService.reserveAppointmentSlot({
        hospitalId,
        doctorId,
        appointmentDate: dateStr,
        AppointmentModel: Appointment
    });

    if (!quotaResult.allowed) {
        const err = new Error(quotaResult.message || 'Daily appointment quota exceeded');
        err.statusCode = 403;
        err.isQuotaError = true;
        throw err;
    }

    try {
        // Resolve patient identity
        let userId = null;
        let clinicPatientId = null;
        let patientCode = 'N/A';

        if (patientId) {
            const isObjectId = mongoose.Types.ObjectId.isValid(patientId) && String(patientId).length === 24;
            let pUser = null;
            if (isObjectId) {
                pUser = await User.findOne({ _id: patientId, hospitalId });
                if (!pUser) {
                    const cPatient = await ClinicPatient.findOne({ _id: patientId, clinicId: hospitalId });
                    if (cPatient) {
                        clinicPatientId = cPatient._id;
                        patientCode = cPatient.patientUid;
                    }
                } else {
                    userId = pUser._id;
                    patientCode = pUser.patientId || pUser.mrn || String(pUser._id);
                }
            } else {
                pUser = await User.findOne({ hospitalId, $or: [{ patientId }, { mrn: patientId }] });
                if (pUser) {
                    userId = pUser._id;
                    patientCode = pUser.patientId || pUser.mrn;
                } else {
                    const cPatient = await ClinicPatient.findOne({ clinicId: hospitalId, patientUid: patientId });
                    if (cPatient) {
                        clinicPatientId = cPatient._id;
                        patientCode = cPatient.patientUid;
                    }
                }
            }
        }

        const newAppt = new Appointment({
            hospitalId,
            doctorId: doctorId || null,
            doctorUserId: doctorUserId || null,
            doctorName: doctorName || 'Doctor',
            userId,
            clinicPatientId,
            patientId: patientCode,
            appointmentDate: new Date(dateStr),
            appointmentTime: appointmentTime || '10:00',
            amount: Number(amount) || 0,
            paymentMethod: paymentMethod || 'Cash',
            paymentStatus: Number(amount) > 0 ? 'Pending' : 'Paid',
            status: 'confirmed',
            notes,
            visitType: visitType || 'New Consultation',
            followUpDate: followUpDate ? new Date(followUpDate) : null,
            diagnosis,
            pharmacy
        });

        await newAppt.save();
        return newAppt;
    } catch (saveErr) {
        // Release reservation if save fails
        if (quotaResult.reserved) {
            await quotaService.releaseAppointmentSlot({
                hospitalId,
                doctorId,
                appointmentDate: dateStr
            }).catch(relErr => console.error('[doctorOpd] Slot release error after save failure:', relErr.message));
        }
        throw saveErr;
    }
}

async function rescheduleAppointment({ hospitalId, doctorId, appointmentId, newDate, newTime }) {
    if (!mongoose.Types.ObjectId.isValid(appointmentId)) throw new Error('Invalid appointment ID');
    if (!newDate) throw new Error('New appointment date is required');

    const appt = await Appointment.findOne({ _id: appointmentId, hospitalId });
    if (!appt) throw new Error('Appointment not found or unauthorized');

    const effectiveDoctorId = doctorId || appt.doctorId;

    // Cross-day atomic rescheduling check
    const quotaResched = await quotaService.rescheduleAppointmentSlot({
        hospitalId,
        doctorId: effectiveDoctorId,
        oldDate: appt.appointmentDate,
        newDate,
        AppointmentModel: Appointment
    });

    if (!quotaResched.allowed) {
        const err = new Error(quotaResched.message || 'Cannot reschedule: destination quota reached');
        err.statusCode = 403;
        err.isQuotaError = true;
        throw err;
    }

    const { dateStr } = quotaService.getIstDayRange(newDate);
    appt.appointmentDate = new Date(dateStr);
    if (newTime) appt.appointmentTime = newTime;
    if (appt.status === 'cancelled') appt.status = 'confirmed';

    await appt.save();
    return appt;
}

async function cancelAppointment({ hospitalId, doctorId, appointmentId, reason = '' }) {
    if (!mongoose.Types.ObjectId.isValid(appointmentId)) throw new Error('Invalid appointment ID');

    const appt = await Appointment.findOne({ _id: appointmentId, hospitalId });
    if (!appt) throw new Error('Appointment not found or unauthorized');

    if (appt.status === 'cancelled') {
        return appt; // Already cancelled, no duplicate quota release
    }

    appt.status = 'cancelled';
    if (reason) appt.notes = `${appt.notes || ''} [Cancelled: ${reason}]`.trim();
    await appt.save();

    // Release daily quota
    await quotaService.releaseAppointmentSlot({
        hospitalId,
        doctorId: doctorId || appt.doctorId,
        appointmentDate: appt.appointmentDate
    });

    return appt;
}

// ============================================================================
// 4. MONEY TRACKER MODULE
// ============================================================================

async function recordPayment({
    hospitalId,
    doctorId,
    doctorUserId,
    appointmentId,
    amount,
    paymentMethod = 'Cash',
    splitPayments = [],
    transactionId = '',
    upiId = '',
    cardDetails = '',
    bankReference = '',
    proofUrl = '',
    description = ''
}) {
    if (!mongoose.Types.ObjectId.isValid(appointmentId)) throw new Error('Invalid appointment ID');

    const appt = await Appointment.findOne({ _id: appointmentId, hospitalId });
    if (!appt) throw new Error('Appointment not found or unauthorized');

    const finalAmount = Number(amount) !== undefined && !isNaN(Number(amount)) ? Number(amount) : (Number(appt.amount) || 0);

    // Validate Split payments
    let validSplit = [];
    let effectiveMethod = paymentMethod || 'Cash';

    if (paymentMethod === 'Split' || (Array.isArray(splitPayments) && splitPayments.length > 0)) {
        effectiveMethod = 'Split';
        validSplit = splitPayments.map(p => ({
            method: p.method || 'Cash',
            amount: Number(p.amount) || 0
        }));

        const splitTotal = validSplit.reduce((sum, item) => sum + item.amount, 0);
        if (Math.abs(splitTotal - finalAmount) > 0.01) {
            throw new Error(`Split payment sum (₹${splitTotal}) does not match total amount (₹${finalAmount})`);
        }
    }

    appt.amount = finalAmount;
    appt.paymentMethod = effectiveMethod;
    appt.splitPayments = validSplit;
    appt.paymentStatus = 'Paid';
    appt.cardRef = transactionId || cardDetails || '';
    appt.upiScreenshotUrl = proofUrl || '';
    await appt.save();

    // Create / Update PaymentTransaction
    let pt = await PaymentTransaction.findOne({
        hospitalId,
        'billedItems.appointments': appt._id
    });

    const ptData = {
        hospitalId,
        patientId: appt.userId || appt.clinicPatientId || appt.bookedBy || new mongoose.Types.ObjectId(),
        paymentMode: effectiveMethod,
        paymentStatus: 'Paid',
        amount: finalAmount,
        splitPayments: validSplit,
        transactionId: transactionId || '',
        upiId: upiId || '',
        cardDetails: cardDetails || '',
        bankReference: bankReference || '',
        proofUrl: proofUrl || '',
        description: description || `OPD Consultation Fee - Dr. ${appt.doctorName}`,
        billedItems: { appointments: [appt._id] },
        addedBy: doctorUserId || doctorId || null
    };

    if (pt) {
        Object.assign(pt, ptData);
        await pt.save();
    } else {
        try {
            pt = await PaymentTransaction.create(ptData);
        } catch (ptErr) {
            console.warn('[doctorOpd] PaymentTransaction create warning:', ptErr.message);
        }
    }

    return { appointment: appt, transaction: pt };
}

async function getMoneySummary({ hospitalId, doctorId, doctorUserId }) {
    const todayRange = quotaService.getIstDayRange(new Date());

    // IST Month range: 1st of current IST month to end of today
    const [year, month] = todayRange.dateStr.split('-').map(Number);
    const startOfMonthUtc = Date.UTC(year, month - 1, 1, 0, 0, 0, 0) - (5 * 60 + 30) * 60 * 1000;
    const monthRange = {
        start: new Date(startOfMonthUtc),
        end: todayRange.end
    };

    // IST Week range: Monday of current week to end of today
    const nowUtc = Date.now();
    const istOffset = (5 * 60 + 30) * 60 * 1000;
    const nowIst = new Date(nowUtc + istOffset);
    const dayOfWeek = (nowIst.getUTCDay() + 6) % 7; // 0 = Mon, 6 = Sun
    const startOfWeekIst = new Date(nowIst);
    startOfWeekIst.setUTCDate(nowIst.getUTCDate() - dayOfWeek);
    startOfWeekIst.setUTCHours(0, 0, 0, 0);
    const startOfWeekUtc = new Date(startOfWeekIst.getTime() - istOffset);
    const weekRange = {
        start: startOfWeekUtc,
        end: todayRange.end
    };

    const baseFilter = {
        hospitalId,
        paymentStatus: { $in: ['Paid', 'paid'] },
        status: { $ne: 'cancelled' }
    };

    const docClauses = [];
    if (doctorId) docClauses.push({ doctorId });
    if (doctorUserId) docClauses.push({ doctorUserId });
    if (docClauses.length > 0) baseFilter.$or = docClauses;

    // Fetch daily paid appointments
    const dailyFilter = { ...baseFilter, appointmentDate: { $gte: todayRange.start, $lte: todayRange.end } };
    const dailyAppts = await Appointment.find(dailyFilter).select('amount paymentMethod splitPayments').lean();

    // Fetch weekly paid appointments
    const weeklyFilter = { ...baseFilter, appointmentDate: { $gte: weekRange.start, $lte: weekRange.end } };
    const weeklyAppts = await Appointment.find(weeklyFilter).select('amount paymentMethod splitPayments').lean();

    // Fetch monthly paid appointments
    const monthlyFilter = { ...baseFilter, appointmentDate: { $gte: monthRange.start, $lte: monthRange.end } };
    const monthlyAppts = await Appointment.find(monthlyFilter).select('amount paymentMethod splitPayments').lean();

    // Fetch all-time paid appointments
    const totalAppts = await Appointment.find(baseFilter).select('amount paymentMethod splitPayments').lean();

    // Fetch pending payments
    const pendingFilter = {
        hospitalId,
        paymentStatus: { $in: ['Pending', 'pending'] },
        status: { $ne: 'cancelled' },
        amount: { $gt: 0 }
    };
    if (docClauses.length > 0) pendingFilter.$or = docClauses;

    const pendingAppts = await Appointment.find(pendingFilter).select('amount').lean();
    const pendingAmount = pendingAppts.reduce((sum, a) => sum + (Number(a.amount) || 0), 0);

    const dailyBreakdown = calculateCollectionBreakdown(dailyAppts);
    const weeklyBreakdown = calculateCollectionBreakdown(weeklyAppts);
    const monthlyBreakdown = calculateCollectionBreakdown(monthlyAppts);
    const totalBreakdown = calculateCollectionBreakdown(totalAppts);

    return {
        daily: dailyBreakdown,
        weekly: weeklyBreakdown,
        monthly: monthlyBreakdown,
        total: totalBreakdown,
        pending: {
            amount: Math.round(pendingAmount * 100) / 100,
            count: pendingAppts.length
        }
    };
}

async function getTransactionsList({
    hospitalId,
    doctorId,
    doctorUserId,
    startDate,
    endDate,
    paymentMethod,
    page = 1,
    limit = 20
}) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const filter = {
        hospitalId,
        paymentStatus: { $in: ['Paid', 'paid'] }
    };

    if (startDate || endDate) {
        filter.appointmentDate = {};
        if (startDate) {
            const { start } = quotaService.getIstDayRange(startDate);
            filter.appointmentDate.$gte = start;
        }
        if (endDate) {
            const { end } = quotaService.getIstDayRange(endDate);
            filter.appointmentDate.$lte = end;
        }
    }

    if (paymentMethod && paymentMethod !== 'all') {
        const pm = paymentMethod.toLowerCase();
        if (pm === 'split') {
            filter.$or = [{ paymentMethod: 'Split' }, { 'splitPayments.0': { $exists: true } }];
        } else {
            filter.$or = [
                { paymentMethod: new RegExp(`^${pm}$`, 'i') },
                { 'splitPayments.method': new RegExp(`^${pm}$`, 'i') }
            ];
        }
    }

    const docClauses = [];
    if (doctorId) docClauses.push({ doctorId });
    if (doctorUserId) docClauses.push({ doctorUserId });
    if (docClauses.length > 0) {
        if (filter.$or) {
            filter.$and = [{ $or: filter.$or }, { $or: docClauses }];
            delete filter.$or;
        } else {
            filter.$or = docClauses;
        }
    }

    const total = await Appointment.countDocuments(filter);
    const transactions = await Appointment.find(filter)
        .populate('userId', 'name phone email patientId mrn')
        .populate('clinicPatientId', 'name phone email patientUid')
        .populate('doctorId', 'name specialty')
        .sort({ appointmentDate: -1, createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean();

    const formatted = transactions.map(t => {
        const patientName = t.userId?.name || t.clinicPatientId?.name || t.patientName || 'Walk-in';
        const patientPhone = t.userId?.phone || t.clinicPatientId?.phone || t.patientPhone || '';
        const patientEmail = t.userId?.email || t.clinicPatientId?.email || '';
        const patientCode = t.userId?.patientId || t.userId?.mrn || t.clinicPatientId?.patientUid || t.patientId || 'N/A';
        return {
            _id: t._id,
            appointmentId: t._id,
            date: t.appointmentDate,
            amount: t.amount,
            paymentMethod: t.paymentMethod,
            paymentStatus: t.paymentStatus,
            splitPayments: t.splitPayments || [],
            patientName,
            patientPhone,
            patientEmail,
            patientCode,
            doctorName: t.doctorName || t.doctorId?.name || 'Doctor',
            receiptUrl: t.receiptUrl || '',
            transactionId: t.transactionId || '',
            createdAt: t.createdAt
        };
    });

    return {
        transactions: formatted,
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum) || 1
    };
}

// ============================================================================
// 5. REVISIT SCHEDULE MODULE
// ============================================================================

async function saveFollowUpDate({ hospitalId, doctorId, appointmentId, followUpDate }) {
    if (!mongoose.Types.ObjectId.isValid(appointmentId)) throw new Error('Invalid appointment ID');
    if (!followUpDate) throw new Error('Follow-up date is required');

    const appt = await Appointment.findOne({ _id: appointmentId, hospitalId });
    if (!appt) throw new Error('Appointment not found or unauthorized');

    const dateObj = new Date(followUpDate);
    if (isNaN(dateObj.getTime())) throw new Error('Invalid follow-up date');

    appt.followUpDate = dateObj;
    await appt.save();
    return appt;
}

async function getRevisits({
    hospitalId,
    doctorId,
    doctorUserId,
    filter = 'all',
    patientId = null,
    page = 1,
    limit = 20
}) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const todayRange = quotaService.getIstDayRange(new Date());

    const query = {
        hospitalId,
        followUpDate: { $ne: null }
    };

    if (patientId) {
        const isObjectId = mongoose.Types.ObjectId.isValid(patientId) && String(patientId).length === 24;
        if (isObjectId) {
            query.$or = [{ userId: patientId }, { clinicPatientId: patientId }];
        } else {
            query.patientId = patientId;
        }
    }

    const docClauses = [];
    if (doctorId) docClauses.push({ doctorId });
    if (doctorUserId) docClauses.push({ doctorUserId });
    if (docClauses.length > 0) {
        if (query.$or) {
            query.$and = [{ $or: query.$or }, { $or: docClauses }];
            delete query.$or;
        } else {
            query.$or = docClauses;
        }
    }

    // Apply revisit status filters
    const filterKey = String(filter).toLowerCase();
    if (filterKey === 'today') {
        query.followUpDate = { $gte: todayRange.start, $lte: todayRange.end };
    } else if (filterKey === 'upcoming') {
        query.followUpDate = { $gt: todayRange.end };
    } else if (filterKey === 'overdue' || filterKey === 'pending') {
        query.followUpDate = { $lt: todayRange.start };
    } else if (filterKey === 'completed') {
        query.visitType = 'Follow-up';
        query.status = 'completed';
    }

    const total = await Appointment.countDocuments(query);
    const appointments = await Appointment.find(query)
        .populate('userId', 'name phone email patientId mrn')
        .populate('clinicPatientId', 'name phone email patientUid')
        .populate('doctorId', 'name specialty')
        .sort({ followUpDate: 1 })
        .skip(skip)
        .limit(limitNum)
        .lean();

    const formatted = appointments.map(a => {
        const patientName = a.userId?.name || a.clinicPatientId?.name || 'Patient';
        const patientPhone = a.userId?.phone || a.clinicPatientId?.phone || '';
        const patientCode = a.userId?.patientId || a.userId?.mrn || a.clinicPatientId?.patientUid || a.patientId || 'N/A';

        let statusCategory = 'upcoming';
        const fTime = new Date(a.followUpDate).getTime();
        if (fTime >= todayRange.start.getTime() && fTime <= todayRange.end.getTime()) {
            statusCategory = 'today';
        } else if (fTime < todayRange.start.getTime()) {
            statusCategory = 'overdue';
        }

        return {
            _id: a._id,
            originalAppointmentDate: a.appointmentDate,
            followUpDate: a.followUpDate,
            statusCategory,
            status: a.status,
            patientName,
            patientPhone,
            patientCode,
            userId: a.userId?._id,
            clinicPatientId: a.clinicPatientId?._id,
            doctorName: a.doctorName || a.doctorId?.name || 'Doctor',
            diagnosis: a.diagnosis || '',
            notes: a.notes || a.doctorNotes || ''
        };
    });

    return {
        revisits: formatted,
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum) || 1
    };
}

async function bookFollowUpAppointment({
    hospitalId,
    doctorId,
    doctorUserId,
    originalAppointmentId,
    appointmentDate,
    appointmentTime = '10:00',
    notes = ''
}) {
    if (!mongoose.Types.ObjectId.isValid(originalAppointmentId)) {
        throw new Error('Invalid original appointment ID');
    }

    const originalAppt = await Appointment.findOne({ _id: originalAppointmentId, hospitalId });
    if (!originalAppt) throw new Error('Original appointment not found or unauthorized');

    const effectiveDoctorId = doctorId || originalAppt.doctorId;

    // Must consume Phase 2 daily quota
    return await createAppointment({
        hospitalId,
        doctorId: effectiveDoctorId,
        doctorUserId: doctorUserId || originalAppt.doctorUserId,
        doctorName: originalAppt.doctorName,
        patientId: String(originalAppt.userId || originalAppt.clinicPatientId || originalAppt.patientId),
        appointmentDate,
        appointmentTime,
        amount: 0, // Follow-up consultation fee policy
        paymentMethod: 'Cash',
        notes: notes || `Follow-up visit for previous consult #${originalAppt._id}`,
        visitType: 'Follow-up'
    });
}

// ============================================================================
// 6. PRESCRIPTION MODULE
// ============================================================================

async function savePrescription({
    hospitalId,
    doctorId,
    doctorUserId,
    appointmentId,
    patientId,
    medicines = [],
    diagnosis = '',
    vitals = null,
    doctorNotes = ''
}) {
    let appt = null;
    if (appointmentId && mongoose.Types.ObjectId.isValid(appointmentId)) {
        appt = await Appointment.findOne({ _id: appointmentId, hospitalId });
    }

    if (!appt && patientId) {
        // Look for today's appointment first
        const { start, end } = quotaService.getIstDayRange();
        const patientObjId = mongoose.Types.ObjectId.isValid(patientId) ? new mongoose.Types.ObjectId(patientId) : null;
        
        appt = await Appointment.findOne({
            hospitalId,
            $or: [
                ...(patientObjId ? [{ userId: patientObjId }, { clinicPatientId: patientObjId }] : []),
                { patientId }
            ],
            appointmentDate: { $gte: start, $lte: end }
        }).sort({ createdAt: -1 });

        // If no appointment today, create an appointment or consultation record
        if (!appt) {
            appt = await createAppointment({
                hospitalId,
                doctorId,
                doctorUserId,
                patientId,
                appointmentDate: new Date(),
                visitType: 'New Consultation',
                notes: 'Prescription recorded from Patient Profile'
            });
        }
    }

    if (!appt) throw new Error('Valid Appointment ID or Patient ID is required to save prescription');

    if (!Array.isArray(medicines)) {
        throw new Error('Medicines must be an array');
    }

    appt.pharmacy = medicines.map(m => ({
        medicineName: m.medicineName || m.name || '',
        saltName: m.saltName || '',
        dosage: m.dosage || '',
        frequency: m.frequency || '',
        duration: m.duration || '',
        instructions: m.instructions || ''
    }));

    if (diagnosis) appt.diagnosis = diagnosis;
    if (doctorNotes) appt.doctorNotes = doctorNotes;
    if (vitals && typeof vitals === 'object') {
        appt.vitals = { ...appt.vitals, ...vitals };
    }

    // Auto mark status as completed when prescription is saved
    if (appt.status === 'in-consultation' || appt.status === 'confirmed' || appt.status === 'pending') {
        appt.status = 'completed';
    }

    await appt.save();
    return appt;
}

async function getPatientPrescriptions({ hospitalId, patientId }) {
    if (!hospitalId || !patientId) throw new Error('Hospital ID and Patient ID are required');

    const isObjectId = mongoose.Types.ObjectId.isValid(patientId) && String(patientId).length === 24;
    const query = {
        hospitalId,
        $or: [
            ...(isObjectId ? [{ userId: patientId }, { clinicPatientId: patientId }] : []),
            { patientId }
        ],
        $and: [
            {
                $or: [
                    { 'pharmacy.0': { $exists: true } },
                    { prescription: { $ne: '' } },
                    { 'prescriptions.0': { $exists: true } }
                ]
            }
        ]
    };

    const appointments = await Appointment.find(query)
        .populate('doctorId', 'name specialty')
        .sort({ appointmentDate: -1 })
        .lean();

    return appointments.map(a => ({
        appointmentId: a._id,
        appointmentDate: a.appointmentDate,
        doctorName: a.doctorName || a.doctorId?.name || 'Doctor',
        diagnosis: a.diagnosis || '',
        medicines: a.pharmacy || [],
        vitals: a.vitals || {},
        notes: a.doctorNotes || a.notes || '',
        prescriptionUrl: a.prescription || (a.prescriptions?.[0]?.url || '')
    }));
}

// ============================================================================
// 7. BASIC OPD REPORTS MODULE
// ============================================================================

async function getOpdSummaryReport({ hospitalId, doctorId, doctorUserId, dateStr }) {
    const todayRange = quotaService.getIstDayRange(dateStr || new Date());

    const docClauses = [];
    if (doctorId) docClauses.push({ doctorId });
    if (doctorUserId) docClauses.push({ doctorUserId });

    const baseToday = {
        hospitalId,
        appointmentDate: { $gte: todayRange.start, $lte: todayRange.end }
    };
    if (docClauses.length > 0) baseToday.$or = docClauses;

    // 1. Appointments counts for today
    const [totalToday, completedToday, cancelledToday, waitingToday, inConsultationToday] = await Promise.all([
        Appointment.countDocuments(baseToday),
        Appointment.countDocuments({ ...baseToday, status: 'completed' }),
        Appointment.countDocuments({ ...baseToday, status: 'cancelled' }),
        Appointment.countDocuments({ ...baseToday, status: { $in: ['pending', 'confirmed'] } }),
        Appointment.countDocuments({ ...baseToday, status: 'in-consultation' })
    ]);

    // 2. Total registered patients in tenant
    const [hospitalPatientCount, clinicPatientCount] = await Promise.all([
        User.countDocuments({ hospitalId, role: 'patient' }),
        ClinicPatient.countDocuments({ clinicId: hospitalId })
    ]);
    const totalRegisteredPatients = hospitalPatientCount + clinicPatientCount;

    // 3. Financial Collections (Daily, Monthly, with Split Breakdown)
    const moneySummary = await getMoneySummary({ hospitalId, doctorId, doctorUserId });

    // 4. Revisits metrics
    const revisitBase = { hospitalId, followUpDate: { $ne: null } };
    if (docClauses.length > 0) revisitBase.$or = docClauses;

    const [upcomingRevisits, pendingRevisits] = await Promise.all([
        Appointment.countDocuments({ ...revisitBase, followUpDate: { $gt: todayRange.end } }),
        Appointment.countDocuments({
            ...revisitBase,
            followUpDate: { $lte: todayRange.end },
            status: { $ne: 'completed' }
        })
    ]);

    return {
        date: todayRange.dateStr,
        todayTotalAppointments: totalToday,
        completedConsultations: completedToday,
        cancelledAppointments: cancelledToday,
        waitingPatients: waitingToday,
        inConsultationPatients: inConsultationToday,
        totalRegisteredPatients,
        dailyCollections: moneySummary.daily.total,
        monthlyCollections: moneySummary.monthly.total,
        totalCollections: moneySummary.total.total,
        dailyBreakdown: moneySummary.daily,
        monthlyBreakdown: moneySummary.monthly,
        upcomingRevisits,
        pendingRevisits
    };
}

module.exports = {
    resolveDoctorContext,
    getDoctorApptFilter,
    calculateCollectionBreakdown,
    // Module 1
    registerPatient,
    searchPatients,
    getPatientOverview,
    // Module 2
    getDoctorTray,
    startConsultation,
    completeConsultation,
    // Module 3
    createAppointment,
    rescheduleAppointment,
    cancelAppointment,
    // Module 4
    recordPayment,
    getMoneySummary,
    getTransactionsList,
    // Module 5
    saveFollowUpDate,
    getRevisits,
    bookFollowUpAppointment,
    // Module 6
    savePrescription,
    getPatientPrescriptions,
    // Module 7
    getOpdSummaryReport
};

