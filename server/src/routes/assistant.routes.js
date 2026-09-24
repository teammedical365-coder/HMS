const express = require('express');
const router = express.Router();
const multer = require('multer');
const mongoose = require('mongoose');

const User = require('../models/user.model');
const Doctor = require('../models/doctor.model');
const Appointment = require('../models/appointment.model');
const QuestionLibrary = require('../models/questionLibrary.model');
const Hospital = require('../models/hospital.model');
const DoctorAssistantPreparation = require('../models/doctorAssistantPreparation.model');
const Notification = require('../models/notification.model');
const AuditLog = require('../models/auditLog.model');

const { verifyToken } = require('../middleware/auth.middleware');
const imagekit = require('../utils/imagekit');
const validateFileType = require('../utils/validateFileType');

const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'application/pdf'];
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        if (ALLOWED_MIMES.includes(file.mimetype)) cb(null, true);
        else cb(new Error('Only JPEG, PNG and PDF allowed'), false);
    },
});

/**
 * Helper: Resolve Assistant's Authorized Context (Doctors & Departments)
 * Multi-tenant safe: uses req.user context from JWT and database.
 */
async function getAssistantContext(user) {
    const userId = user._id || user.id || user.userId;
    const hospitalId = user.hospitalId || null;
    const roleName = (user._roleData?.name || (typeof user.role === 'string' ? user.role : (user.role?.name || ''))).toLowerCase().replace(/\s+/g, '');

    const isGlobalAdmin = roleName === 'centraladmin' || roleName === 'superadmin';
    const isHospitalAdmin = roleName === 'hospitaladmin';

    // Admins have access to all hospital doctors & departments
    if (isGlobalAdmin || isHospitalAdmin) {
        const query = hospitalId ? { hospitalId, status: { $ne: 'Inactive' } } : { status: { $ne: 'Inactive' } };
        const doctors = await Doctor.find(query).select('name specialty departments userId hospitalId doctorId image availability').lean();
        const deptsSet = new Set();
        doctors.forEach(d => (d.departments || []).forEach(dept => dept && deptsSet.add(dept)));

        if (hospitalId) {
            const hosp = await Hospital.findById(hospitalId).select('departments').lean();
            if (hosp?.departments) hosp.departments.forEach(dept => dept && deptsSet.add(dept));
        }

        if (deptsSet.size === 0) {
            deptsSet.add('General Medicine');
            deptsSet.add('General');
        }

        return {
            isAdmin: true,
            assignedDoctors: doctors,
            doctorIds: doctors.map(d => d._id),
            doctorUserIds: doctors.map(d => d.userId).filter(Boolean),
            authorizedDepartments: Array.from(deptsSet)
        };
    }

    // Doctors accessing assistant preparation view
    if ((roleName.includes('doctor') || roleName === 'doctor') && !roleName.includes('assistant')) {
        const doctorProfile = await Doctor.findOne({ userId, ...(hospitalId ? { hospitalId } : {}) }).lean();
        const docDepartments = doctorProfile?.departments || user.departments || ['General'];
        return {
            isDoctor: true,
            assignedDoctors: doctorProfile ? [doctorProfile] : [],
            doctorIds: doctorProfile ? [doctorProfile._id] : [],
            doctorUserIds: [userId],
            authorizedDepartments: docDepartments
        };
    }

    // Doctor Assistant / Clinical Assistant
    const userDoc = await User.findById(userId).populate({
        path: 'assignedDoctors',
        match: hospitalId ? { hospitalId, status: { $ne: 'Inactive' } } : { status: { $ne: 'Inactive' } }
    }).lean();

    let assignedDocs = userDoc?.assignedDoctors || [];
    // If no specific doctors assigned in profile, default to all active doctors for their hospital (or all active doctors)
    if (assignedDocs.length === 0) {
        const docQuery = hospitalId ? { hospitalId, status: { $ne: 'Inactive' } } : { status: { $ne: 'Inactive' } };
        assignedDocs = await Doctor.find(docQuery)
            .select('name specialty departments userId hospitalId doctorId image availability')
            .lean();
    }

    const deptsSet = new Set();

    assignedDocs.forEach(d => {
        if (d.departments && d.departments.length > 0) {
            d.departments.forEach(dept => dept && deptsSet.add(dept));
        } else if (d.specialty) {
            deptsSet.add(d.specialty);
        }
    });

    // If user explicitly has departments assigned in user profile, union them
    if (userDoc?.departments && userDoc.departments.length > 0) {
        userDoc.departments.forEach(dept => dept && deptsSet.add(dept));
    }

    // Union hospital configured departments
    if (hospitalId) {
        const hosp = await Hospital.findById(hospitalId).select('departments').lean();
        if (hosp?.departments && hosp.departments.length > 0) {
            hosp.departments.forEach(dept => dept && deptsSet.add(dept));
        }
    }

    // Always ensure all default specialties are available
    if (deptsSet.size === 0) {
        Object.keys(MASTER_DEFAULT_QUESTION_LIBRARY).forEach(k => deptsSet.add(k));
    }

    return {
        isAssistant: true,
        assignedDoctors: assignedDocs,
        doctorIds: assignedDocs.map(d => d._id),
        doctorUserIds: assignedDocs.map(d => d.userId).filter(Boolean),
        authorizedDepartments: Array.from(deptsSet)
    };
}

/**
 * Helper: Calculate Checklist & Progress Percentage
 */
function calculateChecklistAndProgress(prep) {
    const v = prep.vitals || {};
    const h = prep.preparation || {};
    const qAnswers = prep.questionnaireAnswers || {};
    const reports = prep.reportReferences || [];
    const investigations = prep.investigationSuggestions || [];
    const draftNotes = prep.draftClinicalNotes || '';

    const hasVitals = Boolean(v.bp || v.pulse || v.temperature || v.weight || v.height || v.spo2 || v.bloodSugar);
    const hasComplaint = Boolean(h.chiefComplaint && h.chiefComplaint.trim().length > 0);
    const hasHistory = Boolean(h.historyOfPresentIllness || h.pastMedicalHistory || h.allergies || h.currentMedicines);
    const hasQuestions = Boolean(Object.keys(qAnswers).length > 0);
    const hasReports = reports.length > 0;
    const hasInvestigations = investigations.length > 0;
    const hasDraftNotes = Boolean(draftNotes && draftNotes.trim().length > 0);

    const checklist = {
        patientVerified: Boolean(prep.checklist?.patientVerified),
        vitalsDone: hasVitals,
        complaintDone: hasComplaint,
        historyDone: hasHistory,
        questionsDone: hasQuestions,
        reportsDone: hasReports,
        investigationsDone: hasInvestigations,
        consentDone: Boolean(prep.checklist?.consentDone),
        draftNotesDone: hasDraftNotes
    };

    const items = [
        checklist.patientVerified,
        checklist.vitalsDone,
        checklist.complaintDone,
        checklist.historyDone,
        checklist.questionsDone,
        checklist.draftNotesDone
    ];

    const completedCount = items.filter(Boolean).length;
    const progressPercentage = Math.round((completedCount / items.length) * 100);

    return { checklist, progressPercentage };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. GET /api/assistant/dashboard — Summary Metrics & My Doctors
// ─────────────────────────────────────────────────────────────────────────────
router.get('/dashboard', verifyToken, async (req, res) => {
    try {
        const hospitalId = req.user.hospitalId;
        const ctx = await getAssistantContext(req.user);

        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);

        const appointmentQuery = {
            appointmentDate: { $gte: todayStart, $lte: todayEnd },
            status: { $ne: 'cancelled' }
        };

        if (hospitalId) appointmentQuery.hospitalId = hospitalId;

        // If not admin, restrict to assigned doctors
        if (!ctx.isAdmin) {
            appointmentQuery.$or = [
                { doctorId: { $in: ctx.doctorIds } },
                { doctorUserId: { $in: ctx.doctorUserIds } }
            ];
        }

        const todayAppointments = await Appointment.find(appointmentQuery)
            .populate('userId', 'name patientId uhid age gender phone bloodGroup')
            .populate('doctorId', 'name specialty departments image')
            .sort({ appointmentTime: 1, createdAt: 1 })
            .lean();

        const apptIds = todayAppointments.map(a => a._id);
        const preps = await DoctorAssistantPreparation.find({ appointmentId: { $in: apptIds } }).lean();
        const prepMap = new Map();
        preps.forEach(p => prepMap.set(String(p.appointmentId), p));

        // Queue with merged preparation status
        let waitingCount = 0;
        let inProgressCount = 0;
        let readyForDoctorCount = 0;
        let completedCount = 0;

        const patientQueue = todayAppointments.map(app => {
            const prep = prepMap.get(String(app._id));
            let prepStatus = prep?.status || 'waiting_for_assistant';
            if (app.status === 'completed') prepStatus = 'completed';

            if (prepStatus === 'waiting_for_assistant') waitingCount++;
            else if (prepStatus === 'preparation_in_progress') inProgressCount++;
            else if (prepStatus === 'ready_for_doctor') readyForDoctorCount++;
            else if (prepStatus === 'completed') completedCount++;

            return {
                appointmentId: app._id,
                appointmentDate: app.appointmentDate,
                appointmentTime: app.appointmentTime || '--:--',
                tokenNumber: app.tokenNumber || null,
                status: app.status,
                preparationStatus: prepStatus,
                progressPercentage: prep?.progressPercentage || 0,
                patient: {
                    _id: app.userId?._id,
                    name: app.userId?.name || 'Unknown Patient',
                    uhid: app.userId?.uhid || app.userId?.patientId || app.patientId || 'N/A',
                    age: app.userId?.age || null,
                    gender: app.userId?.gender || 'N/A',
                    phone: app.userId?.phone || ''
                },
                doctor: {
                    _id: app.doctorId?._id || app.doctorId,
                    name: app.doctorId?.name || app.doctorName || 'Doctor',
                    department: app.department || app.doctorId?.departments?.[0] || app.doctorId?.specialty || 'General'
                },
                department: app.department || app.doctorId?.departments?.[0] || 'General',
                preparedBy: prep?.preparedBy || null,
                readyAt: prep?.readyAt || null
            };
        });

        // Compute today's counts per assigned doctor
        const myDoctors = ctx.assignedDoctors.map(doc => {
            const docIdStr = String(doc._id);
            const docUserIdStr = String(doc.userId || '');
            const count = todayAppointments.filter(a =>
                String(a.doctorId?._id || a.doctorId) === docIdStr ||
                String(a.doctorUserId || '') === docUserIdStr
            ).length;

            return {
                _id: doc._id,
                name: doc.name,
                specialty: doc.specialty || '',
                departments: doc.departments || [],
                image: doc.image || '👨‍⚕️',
                todayPatientsCount: count
            };
        });

        // Recent preparation activities
        const recentActivities = await AuditLog.find({
            clinicId: hospitalId,
            action: { $in: ['PREPARATION_STARTED', 'VITALS_RECORDED', 'VITALS_UPDATED', 'QUESTIONNAIRE_UPDATED', 'REPORT_UPLOADED', 'INVESTIGATION_SUGGESTED', 'MARKED_READY', 'DOCTOR_REVIEW_STARTED'] }
        })
            .sort({ createdAt: -1 })
            .limit(10)
            .lean();

        res.json({
            success: true,
            summary: {
                totalTodayPatients: todayAppointments.length,
                waiting: waitingCount,
                inProgress: inProgressCount,
                readyForDoctor: readyForDoctorCount,
                completed: completedCount
            },
            myDoctors,
            authorizedDepartments: ctx.authorizedDepartments,
            patientQueue,
            recentActivities
        });
    } catch (error) {
        console.error('Error fetching assistant dashboard:', error);
        res.status(500).json({ success: false, message: 'Failed to load assistant dashboard' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. GET /api/assistant/doctors — List Assigned Doctors & Departments
// ─────────────────────────────────────────────────────────────────────────────
router.get('/doctors', verifyToken, async (req, res) => {
    try {
        const ctx = await getAssistantContext(req.user);
        res.json({
            success: true,
            doctors: ctx.assignedDoctors,
            authorizedDepartments: ctx.authorizedDepartments
        });
    } catch (error) {
        console.error('Error fetching assistant doctors:', error);
        res.status(500).json({ success: false, message: 'Failed to load doctors' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. GET /api/assistant/appointments — Full Queue with Filtering
// ─────────────────────────────────────────────────────────────────────────────
router.get('/appointments', verifyToken, async (req, res) => {
    try {
        const hospitalId = req.user.hospitalId;
        const ctx = await getAssistantContext(req.user);
        const { date, doctorId, department, status, search } = req.query;

        let dateFilter = {};
        if (date && date !== 'ALL') {
            const dStart = new Date(date);
            dStart.setHours(0, 0, 0, 0);
            const dEnd = new Date(date);
            dEnd.setHours(23, 59, 59, 999);
            dateFilter = { appointmentDate: { $gte: dStart, $lte: dEnd } };
        } else if (!date) {
            // Default: today or any recent appointments
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);
            const todayEnd = new Date();
            todayEnd.setHours(23, 59, 59, 999);
            dateFilter = { appointmentDate: { $gte: todayStart, $lte: todayEnd } };
        }

        const query = {
            ...dateFilter,
            status: { $ne: 'cancelled' }
        };

        if (hospitalId) query.hospitalId = hospitalId;

        // Doctor filter
        if (doctorId && doctorId !== 'All') {
            query.doctorId = doctorId;
        } else if (!ctx.isAdmin && ctx.doctorIds && ctx.doctorIds.length > 0) {
            query.$or = [
                { doctorId: { $in: ctx.doctorIds } },
                { doctorUserId: { $in: ctx.doctorUserIds } }
            ];
        }

        // Department filter with regex to ignore whitespace or casing differences
        if (department && department !== 'All' && department !== '') {
            query.department = { $regex: new RegExp(`^${department.trim()}$`, 'i') };
        }

        const appointments = await Appointment.find(query)
            .populate('userId', 'name patientId uhid age gender phone bloodGroup avatar')
            .populate('doctorId', 'name specialty departments image')
            .sort({ appointmentTime: 1, createdAt: 1 })
            .lean();

        const apptIds = appointments.map(a => a._id);
        const preps = await DoctorAssistantPreparation.find({ appointmentId: { $in: apptIds } }).lean();
        const prepMap = new Map();
        preps.forEach(p => prepMap.set(String(p.appointmentId), p));

        let formattedList = appointments.map(app => {
            const prep = prepMap.get(String(app._id));
            let prepStatus = prep?.status || 'waiting_for_assistant';
            if (app.status === 'completed') prepStatus = 'completed';

            return {
                _id: app._id,
                appointmentId: app._id,
                appointmentDate: app.appointmentDate,
                appointmentTime: app.appointmentTime || '--:--',
                tokenNumber: app.tokenNumber || null,
                status: app.status,
                preparationStatus: prepStatus,
                progressPercentage: prep?.progressPercentage || 0,
                patient: {
                    _id: app.userId?._id,
                    name: app.userId?.name || 'Unknown Patient',
                    uhid: app.userId?.uhid || app.userId?.patientId || app.patientId || 'N/A',
                    age: app.userId?.age || null,
                    gender: app.userId?.gender || 'N/A',
                    phone: app.userId?.phone || '',
                    avatar: app.userId?.avatar || null
                },
                doctor: {
                    _id: app.doctorId?._id || app.doctorId,
                    name: app.doctorId?.name || app.doctorName || 'Doctor',
                    department: app.department || app.doctorId?.departments?.[0] || 'General'
                },
                department: app.department || app.doctorId?.departments?.[0] || 'General',
                preparedBy: prep?.preparedBy || null,
                preparedAt: prep?.preparedAt || null,
                readyAt: prep?.readyAt || null,
                checklist: prep?.checklist || {}
            };
        });

        if (status) {
            formattedList = formattedList.filter(item => item.preparationStatus === status || item.status === status);
        }

        if (search && search.trim()) {
            const s = search.trim().toLowerCase();
            formattedList = formattedList.filter(item =>
                (item.patient.name || '').toLowerCase().includes(s) ||
                (item.patient.uhid || '').toLowerCase().includes(s) ||
                (item.patient.phone || '').includes(s) ||
                (item.doctor.name || '').toLowerCase().includes(s)
            );
        }

        res.json({
            success: true,
            appointments: formattedList,
            authorizedDepartments: ctx.authorizedDepartments
        });
    } catch (error) {
        console.error('Error fetching assistant appointments queue:', error);
        res.status(500).json({ success: false, message: 'Failed to load appointments queue' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// MASTER CLINICAL QUESTION LIBRARY (Standardized Protocols with Full Options)
// ─────────────────────────────────────────────────────────────────────────────
const { MASTER_DEFAULT_QUESTION_LIBRARY, resolveDepartmentQuestions } = require('../config/masterQuestionLibrary');

// ─────────────────────────────────────────────────────────────────────────────
// 4. GET /api/assistant/question-library — Authorized Question Library Only
// ─────────────────────────────────────────────────────────────────────────────
router.get('/question-library', verifyToken, async (req, res) => {
    try {
        const hospitalId = req.user.hospitalId || null;
        const ctx = await getAssistantContext(req.user);
        const { department, doctorId } = req.query;

        // Fetch Question Library from DB
        let library = null;
        if (hospitalId) {
            library = await QuestionLibrary.findOne({ hospitalId }).sort({ version: -1 });
        }
        if (!library || !library.data || Object.keys(library.data).length === 0) {
            library = await QuestionLibrary.findOne({ hospitalId: null }).sort({ version: -1 });
        }

        // Merge DB data with master default to guarantee no empty gaps
        const mergedData = { ...MASTER_DEFAULT_QUESTION_LIBRARY, ...(library?.data || {}) };

        // Fetch all active hospital doctors for filtering
        let hospitalDoctors = [];
        if (hospitalId) {
            hospitalDoctors = await Doctor.find({ hospitalId, status: { $ne: 'Inactive' } })
                .select('name specialty departments userId hospitalId doctorId image availability')
                .lean();
        }
        if (!hospitalDoctors || hospitalDoctors.length === 0) {
            hospitalDoctors = ctx.assignedDoctors || [];
        }
        if (!hospitalDoctors || hospitalDoctors.length === 0) {
            hospitalDoctors = await Doctor.find({ status: { $ne: 'Inactive' } })
                .select('name specialty departments userId hospitalId doctorId image availability')
                .limit(50)
                .lean();
        }

        // If doctorId is provided, resolve that doctor's department
        let activeDepartment = department;
        if (doctorId && (!activeDepartment || activeDepartment === '')) {
            const doc = hospitalDoctors.find(d => String(d._id) === String(doctorId)) ||
                        ctx.assignedDoctors.find(d => String(d._id) === String(doctorId));
            if (doc) {
                activeDepartment = doc.departments?.[0] || doc.specialty || 'General Medicine';
            }
        }

        // Determine target departments to return
        let targetDepartments = [];
        if (activeDepartment && activeDepartment !== 'All' && activeDepartment !== '') {
            targetDepartments = [activeDepartment];
        } else {
            // When 'All' or no specific dept is selected, return all departments in the library
            targetDepartments = Object.keys(MASTER_DEFAULT_QUESTION_LIBRARY);
        }

        const filteredData = {};
        for (const dept of targetDepartments) {
            const q = resolveDepartmentQuestions(mergedData, dept);
            if (q && Object.keys(q).length > 0) {
                filteredData[dept] = q;
            } else if (MASTER_DEFAULT_QUESTION_LIBRARY[dept]) {
                filteredData[dept] = MASTER_DEFAULT_QUESTION_LIBRARY[dept];
            }
        }

        // Guarantee filteredData is never empty
        if (Object.keys(filteredData).length === 0) {
            Object.keys(MASTER_DEFAULT_QUESTION_LIBRARY).forEach(k => {
                filteredData[k] = MASTER_DEFAULT_QUESTION_LIBRARY[k];
            });
        }

        res.json({
            success: true,
            doctors: hospitalDoctors || [],
            authorizedDepartments: Object.keys(MASTER_DEFAULT_QUESTION_LIBRARY),
            allDepartments: Object.keys(MASTER_DEFAULT_QUESTION_LIBRARY),
            selectedDepartment: activeDepartment || 'All',
            selectedDoctorId: doctorId || '',
            data: filteredData
        });
    } catch (error) {
        console.error('Error fetching assistant question library:', error);
        res.status(500).json({ success: false, message: 'Failed to load question library' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. GET /api/assistant/preparation/:appointmentId — Get Full Prep Details
// ─────────────────────────────────────────────────────────────────────────────
router.get('/preparation/:appointmentId', verifyToken, async (req, res) => {
    try {
        const { appointmentId } = req.params;
        const hospitalId = req.user.hospitalId;
        const ctx = await getAssistantContext(req.user);

        const apptQuery = { _id: appointmentId };
        if (hospitalId) apptQuery.hospitalId = hospitalId;

        const appointment = await Appointment.findOne(apptQuery)
            .populate('userId')
            .populate('doctorId')
            .lean();

        if (!appointment) {
            return res.status(404).json({ success: false, message: 'Appointment not found or access denied' });
        }

        // Verify authorization for this doctor
        if (!ctx.isAdmin && !ctx.isDoctor) {
            const isAssigned = ctx.doctorIds.some(id => String(id) === String(appointment.doctorId?._id || appointment.doctorId)) ||
                               ctx.doctorUserIds.some(uid => String(uid) === String(appointment.doctorUserId));
            if (!isAssigned && ctx.doctorIds.length > 0) {
                // If assistant has specific doctor assignments and this is not one of them
                return res.status(403).json({ success: false, message: 'Unauthorized: This appointment is with an unassigned doctor' });
            }
        }

        // Determine doctor's primary department
        const docDept = appointment.department ||
                        appointment.doctorId?.departments?.[0] ||
                        appointment.doctorId?.specialty ||
                        'General Medicine';

        // Find or create preparation record
        let prep = await DoctorAssistantPreparation.findOne({ appointmentId }).lean();
        if (!prep) {
            const newPrep = new DoctorAssistantPreparation({
                hospitalId: appointment.hospitalId || hospitalId,
                assistantId: req.user._id,
                doctorId: appointment.doctorId?._id || appointment.doctorId,
                doctorUserId: appointment.doctorUserId || appointment.doctorId?.userId || null,
                department: docDept,
                patientId: appointment.userId?._id || appointment.patientId,
                appointmentId: appointment._id,
                status: 'waiting_for_assistant',
                vitals: {
                    height: appointment.vitals?.height || '',
                    weight: appointment.vitals?.weight || '',
                    bmi: appointment.vitals?.bmi || '',
                    bp: appointment.vitals?.bp || '',
                    pulse: appointment.vitals?.pulse || '',
                    temperature: appointment.vitals?.temperature || '',
                    spo2: appointment.vitals?.spo2 || '',
                    rr: appointment.vitals?.rr || ''
                }
            });
            await newPrep.save();
            prep = newPrep.toObject();
        }

        // Fetch department Question Library with robust fallback
        let library = null;
        if (hospitalId) {
            library = await QuestionLibrary.findOne({ hospitalId }).sort({ version: -1 });
        }
        if (!library || !library.data || Object.keys(library.data).length === 0) {
            library = await QuestionLibrary.findOne({ hospitalId: null }).sort({ version: -1 });
        }

        const rawLibData = { ...MASTER_DEFAULT_QUESTION_LIBRARY, ...(library?.data || {}) };
        
        // Support dynamic department switching via query param (?dept=...)
        const requestedDept = req.query.dept || req.query.department;
        const activeTargetDept = requestedDept || prep?.department || docDept;
        const departmentQuestions = resolveDepartmentQuestions(rawLibData, activeTargetDept);

        res.json({
            success: true,
            appointment,
            department: activeTargetDept,
            doctorDepartment: docDept,
            preparation: prep,
            departmentQuestions,
            availableDepartments: Object.keys(rawLibData),
            assignedDoctors: ctx.assignedDoctors || []
        });
    } catch (error) {
        console.error('Error fetching preparation details:', error);
        res.status(500).json({ success: false, message: 'Failed to load patient preparation details' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. PUT /api/assistant/preparation/:appointmentId/vitals — Update Vitals
// ─────────────────────────────────────────────────────────────────────────────
router.put('/preparation/:appointmentId/vitals', verifyToken, async (req, res) => {
    try {
        const { appointmentId } = req.params;
        const hospitalId = req.user.hospitalId;
        const { height, weight, bp, pulse, temperature, spo2, rr, bloodSugar, painScore } = req.body;

        const prep = await DoctorAssistantPreparation.findOne({ appointmentId, ...(hospitalId ? { hospitalId } : {}) });
        if (!prep) return res.status(404).json({ success: false, message: 'Preparation record not found' });

        // Calculate BMI
        let calculatedBmi = '';
        if (height && weight && parseFloat(height) > 0 && parseFloat(weight) > 0) {
            const heightInMeters = parseFloat(height) / 100;
            calculatedBmi = (parseFloat(weight) / (heightInMeters * heightInMeters)).toFixed(1);
        }

        prep.vitals = {
            height: height || '',
            weight: weight || '',
            bmi: calculatedBmi || prep.vitals?.bmi || '',
            bp: bp || '',
            pulse: pulse || '',
            temperature: temperature || '',
            spo2: spo2 || '',
            rr: rr || '',
            bloodSugar: bloodSugar || '',
            painScore: painScore !== undefined ? String(painScore) : '',
            recordedAt: new Date(),
            recordedBy: req.user._id
        };

        if (prep.status === 'waiting_for_assistant') {
            prep.status = 'preparation_in_progress';
        }

        const { checklist, progressPercentage } = calculateChecklistAndProgress(prep);
        prep.checklist = checklist;
        prep.progressPercentage = progressPercentage;
        await prep.save();

        // Sync to Appointment vitals so existing doctor consultation sees it instantly
        await Appointment.findByIdAndUpdate(appointmentId, {
            vitals: {
                weight: prep.vitals.weight,
                height: prep.vitals.height,
                bmi: prep.vitals.bmi,
                bp: prep.vitals.bp,
                pulse: prep.vitals.pulse,
                temperature: prep.vitals.temperature,
                spo2: prep.vitals.spo2,
                rr: prep.vitals.rr
            }
        });

        // Audit Log
        const audit = new AuditLog({
            clinicId: hospitalId || prep.hospitalId,
            userId: req.user._id,
            userName: req.user.name || 'Assistant',
            role: 'Doctor Assistant',
            action: 'VITALS_RECORDED',
            targetModel: 'DoctorAssistantPreparation',
            targetId: prep._id,
            targetLabel: `Vitals recorded for Appt #${appointmentId}`,
            ip: req.ip || '',
            userAgent: req.headers['user-agent'] || ''
        });
        await audit.save().catch(e => console.error('AuditLog error:', e.message));

        const io = req.app.get('io');
        if (io) {
            io.emit('assistant_vitals_updated', {
                appointmentId,
                vitals: prep.vitals,
                progressPercentage: prep.progressPercentage
            });
        }

        res.json({ success: true, message: 'Vitals saved successfully', preparation: prep });
    } catch (error) {
        console.error('Error updating vitals:', error);
        res.status(500).json({ success: false, message: 'Failed to update vitals' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. PUT /api/assistant/preparation/:appointmentId/history — Update Clinical History
// ─────────────────────────────────────────────────────────────────────────────
router.put('/preparation/:appointmentId/history', verifyToken, async (req, res) => {
    try {
        const { appointmentId } = req.params;
        const hospitalId = req.user.hospitalId;
        const historyData = req.body;

        const prep = await DoctorAssistantPreparation.findOne({ appointmentId, ...(hospitalId ? { hospitalId } : {}) });
        if (!prep) return res.status(404).json({ success: false, message: 'Preparation record not found' });

        prep.preparation = {
            chiefComplaint: historyData.chiefComplaint || '',
            historyOfPresentIllness: historyData.historyOfPresentIllness || '',
            pastMedicalHistory: historyData.pastMedicalHistory || '',
            pastSurgicalHistory: historyData.pastSurgicalHistory || '',
            familyHistory: historyData.familyHistory || '',
            allergies: historyData.allergies || '',
            currentMedicines: historyData.currentMedicines || '',
            lifestyle: historyData.lifestyle || '',
            assistantRemarks: historyData.assistantRemarks || ''
        };

        if (prep.status === 'waiting_for_assistant') {
            prep.status = 'preparation_in_progress';
        }

        const { checklist, progressPercentage } = calculateChecklistAndProgress(prep);
        prep.checklist = checklist;
        prep.progressPercentage = progressPercentage;
        await prep.save();

        res.json({ success: true, message: 'Clinical history saved successfully', preparation: prep });
    } catch (error) {
        console.error('Error updating clinical history:', error);
        res.status(500).json({ success: false, message: 'Failed to save clinical history' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. PUT /api/assistant/preparation/:appointmentId/questionnaire — Update Questionnaire Answers
// ─────────────────────────────────────────────────────────────────────────────
router.put('/preparation/:appointmentId/questionnaire', verifyToken, async (req, res) => {
    try {
        const { appointmentId } = req.params;
        const hospitalId = req.user.hospitalId;
        const { questionnaireAnswers } = req.body;

        const prep = await DoctorAssistantPreparation.findOne({ appointmentId, ...(hospitalId ? { hospitalId } : {}) });
        if (!prep) return res.status(404).json({ success: false, message: 'Preparation record not found' });

        prep.questionnaireAnswers = questionnaireAnswers || {};
        prep.markModified('questionnaireAnswers');

        if (prep.status === 'waiting_for_assistant') {
            prep.status = 'preparation_in_progress';
        }

        const { checklist, progressPercentage } = calculateChecklistAndProgress(prep);
        prep.checklist = checklist;
        prep.progressPercentage = progressPercentage;
        await prep.save();

        // Also sync to Appointment & Patient
        await Appointment.findByIdAndUpdate(appointmentId, {
            $set: {
                questionnaireAnswers: prep.questionnaireAnswers,
                assistantPreparation: prep._id,
                preparationStatus: prep.status
            }
        }).catch(() => {});

        if (prep.patientId) {
            await User.findByIdAndUpdate(prep.patientId, {
                $set: {
                    'fertilityProfile.intakeData': prep.questionnaireAnswers
                }
            }).catch(() => {});
        }

        // Audit Log
        const audit = new AuditLog({
            clinicId: hospitalId || prep.hospitalId,
            userId: req.user._id,
            userName: req.user.name || 'Assistant',
            role: 'Doctor Assistant',
            action: 'QUESTIONNAIRE_UPDATED',
            targetModel: 'DoctorAssistantPreparation',
            targetId: prep._id,
            targetLabel: `Questionnaire answers updated for Appt #${appointmentId}`,
            ip: req.ip || '',
            userAgent: req.headers['user-agent'] || ''
        });
        await audit.save().catch(e => console.error('AuditLog error:', e.message));

        res.json({ success: true, message: 'Questionnaire responses saved successfully', preparation: prep });
    } catch (error) {
        console.error('Error updating questionnaire:', error);
        res.status(500).json({ success: false, message: 'Failed to save questionnaire responses' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. POST /api/assistant/preparation/:appointmentId/reports — Upload Reports & Files
// ─────────────────────────────────────────────────────────────────────────────
router.post('/preparation/:appointmentId/reports', verifyToken, upload.single('file'), async (req, res) => {
    try {
        const { appointmentId } = req.params;
        const hospitalId = req.user.hospitalId;
        const { name, docType } = req.body;

        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file provided' });
        }

        const prep = await DoctorAssistantPreparation.findOne({ appointmentId, ...(hospitalId ? { hospitalId } : {}) });
        if (!prep) return res.status(404).json({ success: false, message: 'Preparation record not found' });

        // Upload using ImageKit
        const uploadResponse = await imagekit.upload({
            file: req.file.buffer,
            fileName: `${Date.now()}_${req.file.originalname}`,
            folder: '/medical365/patient_reports'
        });

        const newReport = {
            name: name || req.file.originalname,
            url: uploadResponse.url,
            fileId: uploadResponse.fileId,
            docType: docType || 'Previous Report',
            uploadedAt: new Date(),
            uploadedBy: req.user.name || 'Doctor Assistant'
        };

        prep.reportReferences.push(newReport);
        const { checklist, progressPercentage } = calculateChecklistAndProgress(prep);
        prep.checklist = checklist;
        prep.progressPercentage = progressPercentage;
        await prep.save();

        // Also append to Appointment.prescriptions for legacy views
        await Appointment.findByIdAndUpdate(appointmentId, {
            $push: {
                prescriptions: {
                    name: newReport.name,
                    url: newReport.url,
                    fileId: newReport.fileId,
                    type: newReport.docType,
                    uploadedAt: newReport.uploadedAt
                }
            }
        });

        // Audit Log
        const audit = new AuditLog({
            clinicId: hospitalId || prep.hospitalId,
            userId: req.user._id,
            userName: req.user.name || 'Assistant',
            role: 'Doctor Assistant',
            action: 'REPORT_UPLOADED',
            targetModel: 'DoctorAssistantPreparation',
            targetId: prep._id,
            targetLabel: `Uploaded report "${newReport.name}" for Appt #${appointmentId}`,
            ip: req.ip || '',
            userAgent: req.headers['user-agent'] || ''
        });
        await audit.save().catch(e => console.error('AuditLog error:', e.message));

        res.json({ success: true, message: 'Report uploaded successfully', report: newReport, preparation: prep });
    } catch (error) {
        console.error('Error uploading report:', error);
        res.status(500).json({ success: false, message: 'Failed to upload report' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. PUT /api/assistant/preparation/:appointmentId/investigations — Suggested Investigations
// ─────────────────────────────────────────────────────────────────────────────
router.put('/preparation/:appointmentId/investigations', verifyToken, async (req, res) => {
    try {
        const { appointmentId } = req.params;
        const hospitalId = req.user.hospitalId;
        const { investigations } = req.body;

        const prep = await DoctorAssistantPreparation.findOne({ appointmentId, ...(hospitalId ? { hospitalId } : {}) });
        if (!prep) return res.status(404).json({ success: false, message: 'Preparation record not found' });

        prep.investigationSuggestions = Array.isArray(investigations) ? investigations : [];
        const { checklist, progressPercentage } = calculateChecklistAndProgress(prep);
        prep.checklist = checklist;
        prep.progressPercentage = progressPercentage;
        await prep.save();

        // Audit Log
        const audit = new AuditLog({
            clinicId: hospitalId || prep.hospitalId,
            userId: req.user._id,
            userName: req.user.name || 'Assistant',
            role: 'Doctor Assistant',
            action: 'INVESTIGATION_SUGGESTED',
            targetModel: 'DoctorAssistantPreparation',
            targetId: prep._id,
            targetLabel: `Suggested investigations updated for Appt #${appointmentId}`,
            ip: req.ip || '',
            userAgent: req.headers['user-agent'] || ''
        });
        await audit.save().catch(e => console.error('AuditLog error:', e.message));

        res.json({ success: true, message: 'Suggested investigations saved', preparation: prep });
    } catch (error) {
        console.error('Error updating investigations:', error);
        res.status(500).json({ success: false, message: 'Failed to save investigations' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// 11. PUT /api/assistant/preparation/:appointmentId/notes — Draft Clinical Notes
// ─────────────────────────────────────────────────────────────────────────────
router.put('/preparation/:appointmentId/notes', verifyToken, async (req, res) => {
    try {
        const { appointmentId } = req.params;
        const hospitalId = req.user.hospitalId;
        const { draftClinicalNotes } = req.body;

        const prep = await DoctorAssistantPreparation.findOne({ appointmentId, ...(hospitalId ? { hospitalId } : {}) });
        if (!prep) return res.status(404).json({ success: false, message: 'Preparation record not found' });

        prep.draftClinicalNotes = draftClinicalNotes || '';
        const { checklist, progressPercentage } = calculateChecklistAndProgress(prep);
        prep.checklist = checklist;
        prep.progressPercentage = progressPercentage;
        await prep.save();

        // Audit Log
        const audit = new AuditLog({
            clinicId: hospitalId || prep.hospitalId,
            userId: req.user._id,
            userName: req.user.name || 'Assistant',
            role: 'Doctor Assistant',
            action: 'DRAFT_NOTE_UPDATED',
            targetModel: 'DoctorAssistantPreparation',
            targetId: prep._id,
            targetLabel: `Draft note updated for Appt #${appointmentId}`,
            ip: req.ip || '',
            userAgent: req.headers['user-agent'] || ''
        });
        await audit.save().catch(e => console.error('AuditLog error:', e.message));

        res.json({ success: true, message: 'Draft notes saved', preparation: prep });
    } catch (error) {
        console.error('Error updating draft notes:', error);
        res.status(500).json({ success: false, message: 'Failed to save draft notes' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// 12. POST /api/assistant/preparation/:appointmentId/mark-ready — Mark Ready For Doctor
// ─────────────────────────────────────────────────────────────────────────────
router.post('/preparation/:appointmentId/mark-ready', verifyToken, async (req, res) => {
    try {
        const { appointmentId } = req.params;
        const hospitalId = req.user.hospitalId;

        const prep = await DoctorAssistantPreparation.findOne({ appointmentId, ...(hospitalId ? { hospitalId } : {}) });
        if (!prep) return res.status(404).json({ success: false, message: 'Preparation record not found' });

        // Update status & timestamps
        prep.status = 'ready_for_doctor';
        prep.preparedBy = req.user._id;
        prep.preparedAt = prep.preparedAt || new Date();
        prep.readyAt = new Date();

        const { checklist, progressPercentage } = calculateChecklistAndProgress(prep);
        prep.checklist = checklist;
        prep.progressPercentage = Math.max(progressPercentage, 80); // Min 80% if marked ready
        await prep.save();

        // Sync to Appointment
        await Appointment.findByIdAndUpdate(appointmentId, {
            $set: {
                preparationStatus: 'ready_for_doctor',
                assistantPreparation: prep._id,
                vitals: {
                    weight: prep.vitals?.weight || '',
                    height: prep.vitals?.height || '',
                    bmi: prep.vitals?.bmi || '',
                    bp: prep.vitals?.bp || '',
                    pulse: prep.vitals?.pulse || '',
                    temperature: prep.vitals?.temperature || '',
                    spo2: prep.vitals?.spo2 || '',
                    rr: prep.vitals?.rr || ''
                },
                questionnaireAnswers: prep.questionnaireAnswers || {}
            }
        }).catch(() => {});

        const appointment = await Appointment.findById(appointmentId).populate('userId', 'name uhid patientId').lean();

        // Create Notification for assigned doctor
        const patientName = appointment?.userId?.name || 'Patient';
        const docUserId = prep.doctorUserId || appointment?.doctorUserId;

        const notif = new Notification({
            senderId: req.user._id,
            hospitalId: hospitalId || prep.hospitalId,
            recipientRole: 'doctor',
            recipientId: docUserId || undefined,
            message: `Patient preparation complete for ${patientName} (${prep.department}). Ready for consultation.`,
            referenceType: 'DoctorAssistantPreparation',
            referenceId: prep._id,
            patientId: String(appointment?.userId?._id || appointment?.patientId || '')
        });
        await notif.save().catch(e => console.error('Notification save error:', e.message));

        // Audit Log
        const audit = new AuditLog({
            clinicId: hospitalId || prep.hospitalId,
            userId: req.user._id,
            userName: req.user.name || 'Assistant',
            role: 'Doctor Assistant',
            action: 'MARKED_READY',
            targetModel: 'DoctorAssistantPreparation',
            targetId: prep._id,
            targetLabel: `Patient ${patientName} marked READY FOR DOCTOR for Appt #${appointmentId}`,
            ip: req.ip || '',
            userAgent: req.headers['user-agent'] || ''
        });
        await audit.save().catch(e => console.error('AuditLog error:', e.message));

        // Socket.IO real-time emission
        const io = req.app.get('io');
        if (io) {
            io.emit('patient_ready_for_doctor', {
                appointmentId,
                preparationId: prep._id,
                doctorUserId: docUserId,
                patientName,
                department: prep.department,
                readyAt: prep.readyAt
            });
            if (docUserId) {
                io.to(`user_${docUserId}`).emit('new_notification', notif);
            }
            io.to('doctor').emit('new_notification', notif);
        }

        res.json({
            success: true,
            message: 'Patient marked Ready for Doctor successfully',
            preparation: prep
        });
    } catch (error) {
        console.error('Error marking ready for doctor:', error);
        res.status(500).json({ success: false, message: 'Failed to mark ready for doctor' });
    }
});

module.exports = router;
