const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { verifyToken } = require('../middleware/auth.middleware');
const { resolveTenant } = require('../middleware/tenantMiddleware');
const { getTenantModels } = require('../db/tenantModels');

// Fallback Master Models
const MasterAdmission = require('../models/admission.model');
const MasterUser = require('../models/user.model');
const MasterInpatientOrder = require('../models/inpatientOrder.model');
const MasterMARRecord = require('../models/marRecord.model');
const MasterIPDVitals = require('../models/ipdVitals.model');
const MasterNursingNote = require('../models/nursingNote.model');
const MasterNursingTask = require('../models/nursingTask.model');
const MasterIPDIntakeOutput = require('../models/ipdIntakeOutput.model');
const MasterIPDLine = require('../models/ipdLine.model');
const MasterIPDCatheter = require('../models/ipdCatheter.model');
const MasterIPDWoundCare = require('../models/ipdWoundCare.model');
const MasterNurseHandover = require('../models/nurseHandover.model');
const MasterLabReport = require('../models/labReport.model');
const MasterSurgeryPlan = require('../models/surgeryPlan.model');
const MasterVial = require('../models/vial.model');
const MasterBed = require('../models/bed.model');
const AuditLog = require('../models/auditLog.model');

// Audit logger helper for nursing actions
const logNursingAudit = async ({ hospitalId, user, action, targetModel, targetId, targetLabel, req }) => {
    try {
        if (!hospitalId || !action) return;
        await AuditLog.create({
            clinicId: hospitalId,
            userId: user?._id || user?.userId || null,
            userName: user?.name || 'Staff',
            role: user?._roleData?.name || user?.role || 'nurse',
            action,
            targetModel: targetModel || 'Admission',
            targetId: targetId || null,
            targetLabel: targetLabel || '',
            ip: req?.ip || '',
            userAgent: req?.headers ? req.headers['user-agent'] || '' : '',
            success: true
        });
    } catch (auditErr) {
        console.error('Nursing audit log failed:', auditErr.message);
    }
};

// Helper: retrieve models bound to tenant connection
const getModels = (req) => {
    if (req.tenantDb) {
        const tenantModels = getTenantModels(req.tenantDb);
        return {
            ...tenantModels,
            User: MasterUser,
        };
    }
    return {
        Admission: MasterAdmission,
        InpatientOrder: MasterInpatientOrder,
        MARRecord: MasterMARRecord,
        IPDVitals: MasterIPDVitals,
        NursingNote: MasterNursingNote,
        NursingTask: MasterNursingTask,
        IPDIntakeOutput: MasterIPDIntakeOutput,
        IPDLine: MasterIPDLine,
        IPDCatheter: MasterIPDCatheter,
        IPDWoundCare: MasterIPDWoundCare,
        NurseHandover: MasterNurseHandover,
        LabReport: MasterLabReport,
        SurgeryPlan: MasterSurgeryPlan,
        Vial: MasterVial,
        Bed: MasterBed,
        User: MasterUser,
    };
};

// Helper: extract sanitized role name
const getUserRole = (req) => {
    return (req.user._roleData?.name || String(req.user.role || '')).toLowerCase().replace(/\s+/g, '');
};

const CLINICAL_READ_ROLES = ['nurse', 'staffnurse', 'headnurse', 'doctor', 'physician', 'surgeon', 'hospitaladmin', 'centraladmin', 'superadmin', 'admin', 'otmanager', 'otstaff'];
const NURSING_WRITE_ROLES = ['nurse', 'staffnurse', 'headnurse', 'doctor', 'physician', 'surgeon', 'hospitaladmin', 'centraladmin', 'superadmin', 'admin'];

// Middleware: verify clinical read permissions
const requireClinicalReadAccess = (req, res, next) => {
    const role = getUserRole(req);
    const perms = req.user._roleData?.permissions || [];
    if (CLINICAL_READ_ROLES.includes(role) || perms.includes('*') || perms.includes('nurse_access') || perms.includes('doctor_access') || perms.includes('ipd_view')) {
        return next();
    }
    return res.status(403).json({ success: false, message: 'Clinical authorization required' });
};

// Middleware: verify clinical nursing write permissions (excludes reception/cashier)
const requireNursingWriteAccess = (req, res, next) => {
    const role = getUserRole(req);
    const perms = req.user._roleData?.permissions || [];
    if (NURSING_WRITE_ROLES.includes(role) || perms.includes('*') || perms.includes('nurse_access') || perms.includes('ipd_clinical_manage')) {
        return next();
    }
    return res.status(403).json({ success: false, message: 'Clinical nursing write authorization required' });
};

// Helper: validate and find admission with tenant isolation
const findAdmissionOrFail = async (req, admissionId) => {
    if (!admissionId || !mongoose.Types.ObjectId.isValid(admissionId)) {
        throw new Error('Invalid admissionId format');
    }
    const hospitalId = req.hospitalId || req.user.hospitalId;
    const { Admission } = getModels(req);
    const admission = await Admission.findOne({ _id: admissionId, hospitalId }).lean();
    if (!admission) {
        throw new Error('Admission not found in current hospital context');
    }
    return admission;
};

// Helper: emit socket event after DB write
const emitSocket = (req, eventName, payload) => {
    const hospitalId = req.hospitalId || req.user.hospitalId;
    const io = req.app.get('io');
    if (io && hospitalId) {
        io.to(`hospital_${hospitalId}`).emit(eventName, {
            ...payload,
            hospitalId,
            timestamp: new Date()
        });
    }
};

// ============================================================================
// SECTION 1: NURSING NOTES (Append-only)
// ============================================================================

// POST /api/ipd-nursing/admissions/:admissionId/notes
router.post('/admissions/:admissionId/notes', verifyToken, resolveTenant, requireNursingWriteAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const { admissionId } = req.params;
        const { note, noteType, shift, priority } = req.body;

        if (!note || !String(note).trim()) {
            return res.status(400).json({ success: false, message: 'Note text is required' });
        }

        const admission = await findAdmissionOrFail(req, admissionId);
        const { NursingNote } = getModels(req);

        const newNote = new NursingNote({
            hospitalId,
            admissionId: admission._id,
            patientId: admission.patientId,
            nurseId: req.user._id || req.user.userId,
            noteType: noteType || 'GENERAL',
            note: String(note).trim(),
            shift: shift ? String(shift).trim() : '',
            priority: priority || 'Normal'
        });

        await newNote.save();

        emitSocket(req, 'nursing_note_created', {
            noteId: newNote._id,
            admissionId: admission._id,
            patientId: admission.patientId,
            noteType: newNote.noteType
        });

        res.status(201).json({ success: true, message: 'Nursing note recorded successfully', note: newNote, data: newNote });
    } catch (err) {
        res.status(err.message.includes('not found') ? 404 : 500).json({ success: false, message: err.message || 'Error recording nursing note' });
    }
});

// GET /api/ipd-nursing/admissions/:admissionId/notes
router.get('/admissions/:admissionId/notes', verifyToken, resolveTenant, requireClinicalReadAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const { admissionId } = req.params;
        await findAdmissionOrFail(req, admissionId);

        const { NursingNote, User } = getModels(req);
        const notes = await NursingNote.find({ admissionId, hospitalId })
            .sort({ createdAt: -1 })
            .lean();

        for (let n of notes) {
            if (n.nurseId) {
                n.nurseId = await User.findById(n.nurseId).select('name email role specialization').lean() || n.nurseId;
            }
        }

        res.json({ success: true, notes, data: notes });
    } catch (err) {
        res.status(err.message.includes('not found') ? 404 : 500).json({ success: false, message: err.message || 'Error fetching nursing notes' });
    }
});

// ============================================================================
// SECTION 2: NURSING TASKS
// ============================================================================

// POST /api/ipd-nursing/tasks
router.post('/tasks', verifyToken, resolveTenant, requireNursingWriteAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const { admissionId, title, description, taskType, priority, scheduledAt, assignedTo } = req.body;

        if (!title || !String(title).trim()) {
            return res.status(400).json({ success: false, message: 'Task title is required' });
        }

        const admission = await findAdmissionOrFail(req, admissionId);
        const { NursingTask } = getModels(req);

        const task = new NursingTask({
            hospitalId,
            admissionId: admission._id,
            patientId: admission.patientId,
            assignedTo: assignedTo && mongoose.Types.ObjectId.isValid(assignedTo) ? assignedTo : (req.user._id || req.user.userId),
            taskType: taskType || 'OTHER',
            title: String(title).trim(),
            description: description ? String(description).trim() : '',
            priority: priority || 'MEDIUM',
            scheduledAt: scheduledAt ? new Date(scheduledAt) : new Date(),
            status: 'PENDING',
            createdBy: req.user._id || req.user.userId
        });

        await task.save();

        emitSocket(req, 'nursing_task_created', {
            taskId: task._id,
            admissionId: admission._id,
            patientId: admission.patientId,
            title: task.title
        });

        res.status(201).json({ success: true, message: 'Task scheduled successfully', task, data: task });
    } catch (err) {
        res.status(err.message.includes('not found') ? 404 : 500).json({ success: false, message: err.message || 'Error creating nursing task' });
    }
});

// GET /api/ipd-nursing/admissions/:admissionId/tasks
router.get('/admissions/:admissionId/tasks', verifyToken, resolveTenant, requireClinicalReadAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const { admissionId } = req.params;
        await findAdmissionOrFail(req, admissionId);

        const { NursingTask, User } = getModels(req);
        const tasks = await NursingTask.find({ admissionId, hospitalId })
            .sort({ scheduledAt: 1, createdAt: -1 })
            .lean();

        for (let t of tasks) {
            if (t.assignedTo) {
                t.assignedTo = await User.findById(t.assignedTo).select('name email role').lean() || t.assignedTo;
            }
            if (t.completedBy) {
                t.completedBy = await User.findById(t.completedBy).select('name email role').lean() || t.completedBy;
            }
            if (t.createdBy) {
                t.createdBy = await User.findById(t.createdBy).select('name email role').lean() || t.createdBy;
            }
        }

        res.json({ success: true, tasks, data: tasks });
    } catch (err) {
        res.status(err.message.includes('not found') ? 404 : 500).json({ success: false, message: err.message || 'Error fetching tasks' });
    }
});

// PATCH /api/ipd-nursing/tasks/:taskId
router.patch('/tasks/:taskId', verifyToken, resolveTenant, requireNursingWriteAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const { taskId } = req.params;
        const { status, notes, startedAt, completedAt } = req.body;

        if (!mongoose.Types.ObjectId.isValid(taskId)) {
            return res.status(400).json({ success: false, message: 'Invalid taskId format' });
        }

        const { NursingTask } = getModels(req);
        const task = await NursingTask.findOne({ _id: taskId, hospitalId });
        if (!task) {
            return res.status(404).json({ success: false, message: 'Task not found' });
        }

        if (status) {
            task.status = status;
            if (status === 'IN_PROGRESS' && !task.startedAt) {
                task.startedAt = startedAt ? new Date(startedAt) : new Date();
            }
            if (['COMPLETED', 'SKIPPED', 'CANCELLED'].includes(status)) {
                task.completedAt = completedAt ? new Date(completedAt) : new Date();
                task.completedBy = req.user._id || req.user.userId;
            }
        }

        if (notes !== undefined) {
            task.notes = String(notes).trim();
        }

        await task.save();

        emitSocket(req, 'nursing_task_updated', {
            taskId: task._id,
            admissionId: task.admissionId,
            status: task.status
        });

        res.json({ success: true, message: 'Task updated successfully', task, data: task });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message || 'Error updating task' });
    }
});

// ============================================================================
// SECTION 3: INTAKE / OUTPUT (Fluid Balance)
// ============================================================================

// POST /api/ipd-nursing/admissions/:admissionId/intake-output
router.post('/admissions/:admissionId/intake-output', verifyToken, resolveTenant, requireNursingWriteAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const { admissionId } = req.params;
        const { category, type, amount, unit, source, notes, recordedAt } = req.body;

        if (!category || !['INTAKE', 'OUTPUT'].includes(category)) {
            return res.status(400).json({ success: false, message: 'Valid category (INTAKE or OUTPUT) is required' });
        }
        if (!type || !String(type).trim()) {
            return res.status(400).json({ success: false, message: 'Type is required (e.g. Oral, IV, Urine, Drain)' });
        }
        const numAmount = Number(amount);
        if (isNaN(numAmount) || numAmount <= 0) {
            return res.status(400).json({ success: false, message: 'Amount must be a positive number' });
        }

        const admission = await findAdmissionOrFail(req, admissionId);
        const { IPDIntakeOutput } = getModels(req);

        const ioRecord = new IPDIntakeOutput({
            hospitalId,
            admissionId: admission._id,
            patientId: admission.patientId,
            recordedBy: req.user._id || req.user.userId,
            recordedAt: recordedAt ? new Date(recordedAt) : new Date(),
            category,
            type: String(type).trim(),
            amount: numAmount,
            unit: unit === 'L' ? 'L' : 'ml',
            source: source ? String(source).trim() : '',
            notes: notes ? String(notes).trim() : ''
        });

        await ioRecord.save();

        emitSocket(req, 'intake_output_recorded', {
            recordId: ioRecord._id,
            admissionId: admission._id,
            category: ioRecord.category,
            amount: ioRecord.amount,
            unit: ioRecord.unit
        });

        res.status(201).json({ success: true, message: 'Intake/Output recorded successfully', record: ioRecord, data: ioRecord });
    } catch (err) {
        res.status(err.message.includes('not found') ? 404 : 500).json({ success: false, message: err.message || 'Error recording intake/output' });
    }
});

// GET /api/ipd-nursing/admissions/:admissionId/intake-output
router.get('/admissions/:admissionId/intake-output', verifyToken, resolveTenant, requireClinicalReadAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const { admissionId } = req.params;
        await findAdmissionOrFail(req, admissionId);

        const { IPDIntakeOutput, User } = getModels(req);
        const records = await IPDIntakeOutput.find({ admissionId, hospitalId })
            .sort({ recordedAt: -1 })
            .lean();

        for (let r of records) {
            if (r.recordedBy) {
                r.recordedBy = await User.findById(r.recordedBy).select('name email role').lean() || r.recordedBy;
            }
        }

        res.json({ success: true, records, data: records });
    } catch (err) {
        res.status(err.message.includes('not found') ? 404 : 500).json({ success: false, message: err.message || 'Error fetching intake/output' });
    }
});

// GET /api/ipd-nursing/admissions/:admissionId/intake-output/summary
router.get('/admissions/:admissionId/intake-output/summary', verifyToken, resolveTenant, requireClinicalReadAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const { admissionId } = req.params;
        await findAdmissionOrFail(req, admissionId);

        const { IPDIntakeOutput } = getModels(req);

        // Fetch records from last 24 hours (or all today)
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        const records = await IPDIntakeOutput.find({
            admissionId,
            hospitalId,
            recordedAt: { $gte: startOfDay }
        }).lean();

        let totalIntakeMl = 0;
        let totalOutputMl = 0;
        const intakeBreakdown = {};
        const outputBreakdown = {};

        records.forEach(r => {
            const valMl = r.unit === 'L' ? r.amount * 1000 : r.amount;
            if (r.category === 'INTAKE') {
                totalIntakeMl += valMl;
                intakeBreakdown[r.type] = (intakeBreakdown[r.type] || 0) + valMl;
            } else if (r.category === 'OUTPUT') {
                totalOutputMl += valMl;
                outputBreakdown[r.type] = (outputBreakdown[r.type] || 0) + valMl;
            }
        });

        const netBalanceMl = totalIntakeMl - totalOutputMl;

        res.json({
            success: true,
            summary: {
                totalIntakeMl,
                totalOutputMl,
                netBalanceMl,
                intakeBreakdown,
                outputBreakdown,
                recordsCount: records.length,
                since: startOfDay
            },
            data: {
                totalIntakeMl,
                totalOutputMl,
                netBalanceMl,
                intakeBreakdown,
                outputBreakdown
            }
        });
    } catch (err) {
        res.status(err.message.includes('not found') ? 404 : 500).json({ success: false, message: err.message || 'Error calculating summary' });
    }
});

// ============================================================================
// SECTION 4: IV / LINE TRACKING
// ============================================================================

// POST /api/ipd-nursing/admissions/:admissionId/lines
router.post('/admissions/:admissionId/lines', verifyToken, resolveTenant, requireNursingWriteAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const { admissionId } = req.params;
        const { lineType, site, gauge, notes, insertedAt } = req.body;

        if (!site || !String(site).trim()) {
            return res.status(400).json({ success: false, message: 'Anatomical site is required' });
        }

        const admission = await findAdmissionOrFail(req, admissionId);
        const { IPDLine } = getModels(req);

        const line = new IPDLine({
            hospitalId,
            admissionId: admission._id,
            patientId: admission.patientId,
            lineType: lineType || 'IV_CANNULA',
            site: String(site).trim(),
            gauge: gauge ? String(gauge).trim() : '',
            notes: notes ? String(notes).trim() : '',
            insertedAt: insertedAt ? new Date(insertedAt) : new Date(),
            insertedBy: req.user._id || req.user.userId,
            status: 'ACTIVE'
        });

        await line.save();

        emitSocket(req, 'line_status_changed', {
            lineId: line._id,
            admissionId: admission._id,
            status: 'ACTIVE',
            lineType: line.lineType
        });

        res.status(201).json({ success: true, message: 'Line inserted successfully', line, data: line });
    } catch (err) {
        res.status(err.message.includes('not found') ? 404 : 500).json({ success: false, message: err.message || 'Error inserting line' });
    }
});

// GET /api/ipd-nursing/admissions/:admissionId/lines
router.get('/admissions/:admissionId/lines', verifyToken, resolveTenant, requireClinicalReadAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const { admissionId } = req.params;
        await findAdmissionOrFail(req, admissionId);

        const { IPDLine, User } = getModels(req);
        const lines = await IPDLine.find({ admissionId, hospitalId })
            .sort({ insertedAt: -1 })
            .lean();

        for (let l of lines) {
            if (l.insertedBy) {
                l.insertedBy = await User.findById(l.insertedBy).select('name email role').lean() || l.insertedBy;
            }
            if (l.removedBy) {
                l.removedBy = await User.findById(l.removedBy).select('name email role').lean() || l.removedBy;
            }
        }

        res.json({ success: true, lines, data: lines });
    } catch (err) {
        res.status(err.message.includes('not found') ? 404 : 500).json({ success: false, message: err.message || 'Error fetching lines' });
    }
});

// PATCH /api/ipd-nursing/lines/:lineId/remove
router.patch('/lines/:lineId/remove', verifyToken, resolveTenant, requireNursingWriteAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const { lineId } = req.params;
        const { removalReason, notes, removedAt } = req.body;

        if (!mongoose.Types.ObjectId.isValid(lineId)) {
            return res.status(400).json({ success: false, message: 'Invalid lineId format' });
        }

        const { IPDLine } = getModels(req);
        const line = await IPDLine.findOne({ _id: lineId, hospitalId });
        if (!line) {
            return res.status(404).json({ success: false, message: 'Line record not found' });
        }

        if (line.status === 'REMOVED') {
            return res.status(400).json({ success: false, message: 'Line is already removed' });
        }

        line.status = 'REMOVED';
        line.removedAt = removedAt ? new Date(removedAt) : new Date();
        line.removedBy = req.user._id || req.user.userId;
        line.removalReason = removalReason ? String(removalReason).trim() : 'Routine removal / discharged';
        if (notes) line.notes = `${line.notes ? line.notes + ' | ' : ''}Removal: ${String(notes).trim()}`;

        await line.save();

        emitSocket(req, 'line_status_changed', {
            lineId: line._id,
            admissionId: line.admissionId,
            status: 'REMOVED'
        });

        res.json({ success: true, message: 'Line marked as removed', line, data: line });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message || 'Error removing line' });
    }
});

// ============================================================================
// SECTION 5: CATHETER TRACKING
// ============================================================================

// POST /api/ipd-nursing/admissions/:admissionId/catheters
router.post('/admissions/:admissionId/catheters', verifyToken, resolveTenant, requireNursingWriteAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const { admissionId } = req.params;
        const { catheterType, size, site, notes, insertedAt } = req.body;

        const admission = await findAdmissionOrFail(req, admissionId);
        const { IPDCatheter } = getModels(req);

        const catheter = new IPDCatheter({
            hospitalId,
            admissionId: admission._id,
            patientId: admission.patientId,
            catheterType: catheterType || 'FOLEY',
            size: size ? String(size).trim() : '',
            site: site ? String(site).trim() : '',
            notes: notes ? String(notes).trim() : '',
            insertedAt: insertedAt ? new Date(insertedAt) : new Date(),
            insertedBy: req.user._id || req.user.userId,
            status: 'ACTIVE'
        });

        await catheter.save();

        emitSocket(req, 'catheter_status_changed', {
            catheterId: catheter._id,
            admissionId: admission._id,
            status: 'ACTIVE',
            catheterType: catheter.catheterType
        });

        res.status(201).json({ success: true, message: 'Catheter inserted successfully', catheter, data: catheter });
    } catch (err) {
        res.status(err.message.includes('not found') ? 404 : 500).json({ success: false, message: err.message || 'Error inserting catheter' });
    }
});

// GET /api/ipd-nursing/admissions/:admissionId/catheters
router.get('/admissions/:admissionId/catheters', verifyToken, resolveTenant, requireClinicalReadAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const { admissionId } = req.params;
        await findAdmissionOrFail(req, admissionId);

        const { IPDCatheter, User } = getModels(req);
        const catheters = await IPDCatheter.find({ admissionId, hospitalId })
            .sort({ insertedAt: -1 })
            .lean();

        for (let c of catheters) {
            if (c.insertedBy) {
                c.insertedBy = await User.findById(c.insertedBy).select('name email role').lean() || c.insertedBy;
            }
            if (c.removedBy) {
                c.removedBy = await User.findById(c.removedBy).select('name email role').lean() || c.removedBy;
            }
        }

        res.json({ success: true, catheters, data: catheters });
    } catch (err) {
        res.status(err.message.includes('not found') ? 404 : 500).json({ success: false, message: err.message || 'Error fetching catheters' });
    }
});

// PATCH /api/ipd-nursing/catheters/:catheterId/remove
router.patch('/catheters/:catheterId/remove', verifyToken, resolveTenant, requireNursingWriteAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const { catheterId } = req.params;
        const { removalReason, notes, removedAt } = req.body;

        if (!mongoose.Types.ObjectId.isValid(catheterId)) {
            return res.status(400).json({ success: false, message: 'Invalid catheterId format' });
        }

        const { IPDCatheter } = getModels(req);
        const catheter = await IPDCatheter.findOne({ _id: catheterId, hospitalId });
        if (!catheter) {
            return res.status(404).json({ success: false, message: 'Catheter record not found' });
        }

        if (catheter.status === 'REMOVED') {
            return res.status(400).json({ success: false, message: 'Catheter is already removed' });
        }

        catheter.status = 'REMOVED';
        catheter.removedAt = removedAt ? new Date(removedAt) : new Date();
        catheter.removedBy = req.user._id || req.user.userId;
        catheter.removalReason = removalReason ? String(removalReason).trim() : 'Routine removal / discharged';
        if (notes) catheter.notes = `${catheter.notes ? catheter.notes + ' | ' : ''}Removal: ${String(notes).trim()}`;

        await catheter.save();

        emitSocket(req, 'catheter_status_changed', {
            catheterId: catheter._id,
            admissionId: catheter.admissionId,
            status: 'REMOVED'
        });

        res.json({ success: true, message: 'Catheter marked as removed', catheter, data: catheter });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message || 'Error removing catheter' });
    }
});

// ============================================================================
// SECTION 6: WOUND CARE / DRESSINGS (Append-only)
// ============================================================================

// POST /api/ipd-nursing/admissions/:admissionId/wound-care
router.post('/admissions/:admissionId/wound-care', verifyToken, resolveTenant, requireNursingWriteAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const { admissionId } = req.params;
        const { woundSite, woundType, condition, dressingType, drainageAmount, drainageType, notes, dressingChangedAt } = req.body;

        if (!woundSite || !String(woundSite).trim()) {
            return res.status(400).json({ success: false, message: 'Wound site is required' });
        }

        const admission = await findAdmissionOrFail(req, admissionId);
        const { IPDWoundCare } = getModels(req);

        const careRecord = new IPDWoundCare({
            hospitalId,
            admissionId: admission._id,
            patientId: admission.patientId,
            woundSite: String(woundSite).trim(),
            woundType: woundType || 'Surgical',
            condition: condition || 'Clean',
            dressingType: dressingType || 'Gauze',
            drainageAmount: drainageAmount || '',
            drainageType: drainageType || '',
            notes: notes ? String(notes).trim() : '',
            dressingChangedAt: dressingChangedAt ? new Date(dressingChangedAt) : new Date(),
            dressingChangedBy: req.user._id || req.user.userId
        });

        await careRecord.save();

        emitSocket(req, 'wound_care_recorded', {
            recordId: careRecord._id,
            admissionId: admission._id,
            woundSite: careRecord.woundSite
        });

        res.status(201).json({ success: true, message: 'Wound care recorded successfully', record: careRecord, data: careRecord });
    } catch (err) {
        res.status(err.message.includes('not found') ? 404 : 500).json({ success: false, message: err.message || 'Error recording wound care' });
    }
});

// GET /api/ipd-nursing/admissions/:admissionId/wound-care
router.get('/admissions/:admissionId/wound-care', verifyToken, resolveTenant, requireClinicalReadAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const { admissionId } = req.params;
        await findAdmissionOrFail(req, admissionId);

        const { IPDWoundCare, User } = getModels(req);
        const records = await IPDWoundCare.find({ admissionId, hospitalId })
            .sort({ dressingChangedAt: -1 })
            .lean();

        for (let w of records) {
            if (w.dressingChangedBy) {
                w.dressingChangedBy = await User.findById(w.dressingChangedBy).select('name email role').lean() || w.dressingChangedBy;
            }
        }

        res.json({ success: true, records, data: records });
    } catch (err) {
        res.status(err.message.includes('not found') ? 404 : 500).json({ success: false, message: err.message || 'Error fetching wound care' });
    }
});

// ============================================================================
// SECTION 7: SHIFT HANDOVER (Append-only)
// ============================================================================

// POST /api/ipd-nursing/admissions/:admissionId/handover
router.post('/admissions/:admissionId/handover', verifyToken, resolveTenant, requireNursingWriteAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const { admissionId } = req.params;
        const { toNurseId, shift, summary, importantObservations, pendingTasks, medicationConcerns, safetyConcerns, handoverAt } = req.body;

        if (!summary || !String(summary).trim()) {
            return res.status(400).json({ success: false, message: 'Clinical handover summary is required' });
        }

        const admission = await findAdmissionOrFail(req, admissionId);
        const { NurseHandover } = getModels(req);

        const handover = new NurseHandover({
            hospitalId,
            admissionId: admission._id,
            patientId: admission.patientId,
            fromNurseId: req.user._id || req.user.userId,
            toNurseId: toNurseId && mongoose.Types.ObjectId.isValid(toNurseId) ? toNurseId : undefined,
            shift: shift ? String(shift).trim() : 'Morning to Evening',
            summary: String(summary).trim(),
            importantObservations: importantObservations ? String(importantObservations).trim() : '',
            pendingTasks: pendingTasks ? String(pendingTasks).trim() : '',
            medicationConcerns: medicationConcerns ? String(medicationConcerns).trim() : '',
            safetyConcerns: safetyConcerns ? String(safetyConcerns).trim() : '',
            handoverAt: handoverAt ? new Date(handoverAt) : new Date()
        });

        await handover.save();

        emitSocket(req, 'nurse_handover_created', {
            handoverId: handover._id,
            admissionId: admission._id,
            shift: handover.shift
        });

        res.status(201).json({ success: true, message: 'Shift handover recorded successfully', handover, data: handover });
    } catch (err) {
        res.status(err.message.includes('not found') ? 404 : 500).json({ success: false, message: err.message || 'Error recording handover' });
    }
});

// GET /api/ipd-nursing/admissions/:admissionId/handover
router.get('/admissions/:admissionId/handover', verifyToken, resolveTenant, requireClinicalReadAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const { admissionId } = req.params;
        await findAdmissionOrFail(req, admissionId);

        const { NurseHandover, User } = getModels(req);
        const handovers = await NurseHandover.find({ admissionId, hospitalId })
            .sort({ handoverAt: -1 })
            .lean();

        for (let h of handovers) {
            if (h.fromNurseId) {
                h.fromNurseId = await User.findById(h.fromNurseId).select('name email role').lean() || h.fromNurseId;
            }
            if (h.toNurseId) {
                h.toNurseId = await User.findById(h.toNurseId).select('name email role').lean() || h.toNurseId;
            }
        }

        res.json({ success: true, handovers, data: handovers });
    } catch (err) {
        res.status(err.message.includes('not found') ? 404 : 500).json({ success: false, message: err.message || 'Error fetching handovers' });
    }
});

// ============================================================================
// SECTION 8: INVESTIGATION TRACKING (Reusing LabReport & Vial)
// ============================================================================

// GET /api/ipd-nursing/admissions/:admissionId/investigations
router.get('/admissions/:admissionId/investigations', verifyToken, resolveTenant, requireClinicalReadAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const { admissionId } = req.params;
        const admission = await findAdmissionOrFail(req, admissionId);

        const { LabReport, Vial, User } = getModels(req);
        const patientId = admission.patientId;

        // Fetch LabReports for this patient & hospital
        const labReports = await LabReport.find({
            hospitalId,
            $or: [{ userId: patientId }, { patientId: String(patientId) }]
        }).sort({ createdAt: -1 }).lean();

        // Fetch Vials for this patient & hospital
        const vials = await Vial.find({
            hospitalId,
            patientId
        }).sort({ receivedAt: -1 }).lean();

        // Map into unified investigation status items
        const investigations = labReports.map(report => {
            let stage = 'ORDERED';
            if (report.reportStatus === 'UPLOADED') {
                stage = 'COMPLETED';
            } else if (report.testStatus === 'DONE') {
                stage = 'PROCESSING';
            } else if (report.testStatus === 'IN_PROGRESS') {
                stage = 'PROCESSING';
            } else {
                stage = 'SAMPLE_PENDING';
            }

            return {
                id: report._id,
                testNames: report.testNames || [],
                testStatus: report.testStatus || 'PENDING',
                reportStatus: report.reportStatus || 'PENDING',
                paymentStatus: report.paymentStatus || 'PENDING',
                stage,
                reportFile: report.reportFile || null,
                notes: report.notes || '',
                createdAt: report.createdAt,
                updatedAt: report.updatedAt
            };
        });

        res.json({
            success: true,
            investigations,
            vials,
            data: { investigations, vials }
        });
    } catch (err) {
        res.status(err.message.includes('not found') ? 404 : 500).json({ success: false, message: err.message || 'Error fetching investigations' });
    }
});

// ============================================================================
// SECTION 9: OT & POST-OP LINKAGE (Reusing SurgeryPlan)
// ============================================================================

// GET /api/ipd-nursing/admissions/:admissionId/ot-plans
router.get('/admissions/:admissionId/ot-plans', verifyToken, resolveTenant, requireClinicalReadAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const { admissionId } = req.params;
        const admission = await findAdmissionOrFail(req, admissionId);

        const { SurgeryPlan, User } = getModels(req);
        const patientId = admission.patientId;

        const plans = await SurgeryPlan.find({
            hospitalId,
            patientId
        }).sort({ preferredDate: -1, createdAt: -1 }).lean();

        for (let p of plans) {
            if (p.surgeonId) {
                p.surgeonId = await User.findById(p.surgeonId).select('name specialization email phone').lean() || p.surgeonId;
            }
            if (p.doctorId) {
                p.doctorId = await User.findById(p.doctorId).select('name specialization email').lean() || p.doctorId;
            }
        }

        res.json({ success: true, surgeryPlans: plans, data: plans });
    } catch (err) {
        res.status(err.message.includes('not found') ? 404 : 500).json({ success: false, message: err.message || 'Error fetching OT plans' });
    }
});

// ============================================================================
// SECTION 10: UNIFIED IPD TIMELINE
// ============================================================================

// GET /api/ipd-nursing/admissions/:admissionId/timeline
router.get('/admissions/:admissionId/timeline', verifyToken, resolveTenant, requireClinicalReadAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const { admissionId } = req.params;
        const admission = await findAdmissionOrFail(req, admissionId);

        const {
            InpatientOrder,
            MARRecord,
            IPDVitals,
            NursingNote,
            NursingTask,
            IPDIntakeOutput,
            IPDLine,
            IPDCatheter,
            IPDWoundCare,
            NurseHandover,
            SurgeryPlan,
            LabReport,
            User
        } = getModels(req);

        // Fetch all streams in parallel
        const [
            orders,
            mars,
            vitals,
            notes,
            tasks,
            ioRecords,
            lines,
            catheters,
            woundCares,
            handovers,
            surgeries,
            labReports
        ] = await Promise.all([
            InpatientOrder.find({ admissionId, hospitalId }).lean(),
            MARRecord.find({ admissionId, hospitalId }).populate('orderId').lean(),
            IPDVitals.find({ admissionId, hospitalId }).lean(),
            NursingNote.find({ admissionId, hospitalId }).lean(),
            NursingTask.find({ admissionId, hospitalId }).lean(),
            IPDIntakeOutput.find({ admissionId, hospitalId }).lean(),
            IPDLine.find({ admissionId, hospitalId }).lean(),
            IPDCatheter.find({ admissionId, hospitalId }).lean(),
            IPDWoundCare.find({ admissionId, hospitalId }).lean(),
            NurseHandover.find({ admissionId, hospitalId }).lean(),
            SurgeryPlan.find({ patientId: admission.patientId, hospitalId }).lean(),
            LabReport.find({ hospitalId, $or: [{ userId: admission.patientId }, { patientId: String(admission.patientId) }] }).lean()
        ]);

        const events = [];

        // 1. Admission Event
        events.push({
            id: `adm_${admission._id}`,
            timestamp: admission.admissionDate || admission.createdAt,
            category: 'ADMISSION',
            type: 'ADMISSION',
            title: `Patient Admitted to ${admission.ward}`,
            description: `Bed ${admission.bedNumber}. Status: ${admission.status}`,
            badge: admission.ward,
            by: 'Reception / Admission'
        });

        // 2. Transfer Events
        if (admission.transferHistory && Array.isArray(admission.transferHistory)) {
            admission.transferHistory.forEach((tr, idx) => {
                events.push({
                    id: `trans_${tr._id || idx}`,
                    timestamp: tr.transferDate || tr.createdAt,
                    category: 'TRANSFER',
                    type: 'TRANSFER',
                    title: `Bed Transfer: ${tr.fromWard} (${tr.fromBedNumber}) ➔ ${tr.toWard} (${tr.toBedNumber})`,
                    description: tr.notes || 'Internal ward transfer',
                    badge: tr.toWard,
                    by: 'Administrative Transfer'
                });
            });
        }

        // 3. Discharge Event if discharged
        if (admission.status === 'Discharged' && admission.dischargeDate) {
            events.push({
                id: `disc_${admission._id}`,
                timestamp: admission.dischargeDate,
                category: 'DISCHARGE',
                type: 'DISCHARGE',
                title: `Patient Discharged`,
                description: `Discharged from ${admission.ward} (Bed ${admission.bedNumber})`,
                badge: 'Discharged',
                by: 'Discharge Desk'
            });
        }

        // 4. Clinical Orders
        orders.forEach(o => {
            events.push({
                id: `ord_${o._id}`,
                timestamp: o.createdAt,
                category: 'DOCTOR_ORDER',
                type: 'DOCTOR_ORDER',
                title: `Doctor Order: ${o.medicineName}`,
                description: `${o.dosageValue || ''} ${o.dosageUnit || ''} — ${o.route || 'Oral'} (${o.frequency || 'OD'})`,
                badge: o.status,
                by: 'Doctor'
            });
        });

        // 5. Vitals
        vitals.forEach(v => {
            const vparts = [];
            if (v.systolicBP) vparts.push(`BP ${v.systolicBP}/${v.diastolicBP || '?'}`);
            if (v.pulse) vparts.push(`HR ${v.pulse} bpm`);
            if (v.spo2) vparts.push(`SpO₂ ${v.spo2}%`);
            if (v.temperature) vparts.push(`Temp ${v.temperature}°F`);
            if (v.respiratoryRate) vparts.push(`RR ${v.respiratoryRate}/min`);
            if (v.painScore !== undefined && v.painScore !== null) vparts.push(`Pain ${v.painScore}/10`);

            events.push({
                id: `vit_${v._id}`,
                timestamp: v.recordedAt || v.createdAt,
                category: 'VITALS',
                type: 'VITALS',
                title: `Vitals Recorded`,
                description: vparts.join(' • ') || 'Vitals check',
                badge: v.spo2 && v.spo2 < 90 ? 'CRITICAL' : 'Recorded',
                by: 'Nursing'
            });
        });

        // 6. MAR Administrations
        mars.forEach(m => {
            if (['ADMINISTERED', 'HELD', 'REFUSED', 'MISSED'].includes(m.status)) {
                const medName = m.orderId?.medicineName || 'Medication';
                events.push({
                    id: `mar_${m._id}`,
                    timestamp: m.administeredTime || m.updatedAt || m.createdAt,
                    category: 'MAR',
                    type: `MAR_${m.status}`,
                    title: `MAR: ${medName} — ${m.status}`,
                    description: m.reason ? `Reason: ${m.reason}` : `Scheduled: ${new Date(m.scheduledTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
                    badge: m.status,
                    by: 'Nursing MAR'
                });
            }
        });

        // 7. Nursing Notes
        notes.forEach(n => {
            events.push({
                id: `note_${n._id}`,
                timestamp: n.createdAt,
                category: 'NURSING_NOTE',
                type: 'NURSING_NOTE',
                title: `Nursing Note (${n.noteType})`,
                description: n.note,
                badge: n.priority || 'Normal',
                by: 'Nurse'
            });
        });

        // 8. Nursing Tasks
        tasks.forEach(t => {
            if (t.status === 'COMPLETED') {
                events.push({
                    id: `task_${t._id}`,
                    timestamp: t.completedAt || t.updatedAt || t.createdAt,
                    category: 'NURSING_TASK',
                    type: 'TASK_COMPLETED',
                    title: `Task Completed: ${t.title}`,
                    description: t.notes || t.description || 'Clinical task executed',
                    badge: t.taskType,
                    by: 'Nursing Staff'
                });
            }
        });

        // 9. Intake / Output
        ioRecords.forEach(io => {
            events.push({
                id: `io_${io._id}`,
                timestamp: io.recordedAt || io.createdAt,
                category: 'INTAKE_OUTPUT',
                type: io.category,
                title: `${io.category === 'INTAKE' ? '💧 Fluid Intake' : '🚽 Fluid Output'}: ${io.type}`,
                description: `${io.amount} ${io.unit} ${io.source ? `(${io.source})` : ''} ${io.notes ? `— ${io.notes}` : ''}`.trim(),
                badge: `${io.amount} ${io.unit}`,
                by: 'Fluid Tracking'
            });
        });

        // 10. IV Lines (Insertion and Removal)
        lines.forEach(l => {
            events.push({
                id: `line_ins_${l._id}`,
                timestamp: l.insertedAt || l.createdAt,
                category: 'LINE',
                type: 'IV_INSERTED',
                title: `Line Inserted: ${l.lineType}`,
                description: `Site: ${l.site} ${l.gauge ? `(${l.gauge})` : ''}`,
                badge: 'Active',
                by: 'Nursing / Doctor'
            });
            if (l.status === 'REMOVED' && l.removedAt) {
                events.push({
                    id: `line_rem_${l._id}`,
                    timestamp: l.removedAt,
                    category: 'LINE',
                    type: 'IV_REMOVED',
                    title: `Line Removed: ${l.lineType}`,
                    description: `Site: ${l.site} • Reason: ${l.removalReason || 'Routine'}`,
                    badge: 'Removed',
                    by: 'Nursing'
                });
            }
        });

        // 11. Catheters (Insertion and Removal)
        catheters.forEach(c => {
            events.push({
                id: `cath_ins_${c._id}`,
                timestamp: c.insertedAt || c.createdAt,
                category: 'CATHETER',
                type: 'CATHETER_INSERTED',
                title: `Catheter Inserted: ${c.catheterType}`,
                description: `Size: ${c.size || 'Standard'} ${c.site ? `(${c.site})` : ''}`,
                badge: 'Active',
                by: 'Clinical Staff'
            });
            if (c.status === 'REMOVED' && c.removedAt) {
                events.push({
                    id: `cath_rem_${c._id}`,
                    timestamp: c.removedAt,
                    category: 'CATHETER',
                    type: 'CATHETER_REMOVED',
                    title: `Catheter Removed: ${c.catheterType}`,
                    description: `Reason: ${c.removalReason || 'Routine'}`,
                    badge: 'Removed',
                    by: 'Clinical Staff'
                });
            }
        });

        // 12. Wound Care
        woundCares.forEach(w => {
            events.push({
                id: `wound_${w._id}`,
                timestamp: w.dressingChangedAt || w.createdAt,
                category: 'WOUND_CARE',
                type: 'WOUND_CARE',
                title: `Dressing Change: ${w.woundSite}`,
                description: `Type: ${w.dressingType} • Condition: ${w.condition} ${w.drainageAmount ? `• Drainage: ${w.drainageAmount} ${w.drainageType}` : ''}`,
                badge: w.condition,
                by: 'Wound Care Nurse'
            });
        });

        // 13. Shift Handover
        handovers.forEach(h => {
            events.push({
                id: `handover_${h._id}`,
                timestamp: h.handoverAt || h.createdAt,
                category: 'HANDOVER',
                type: 'HANDOVER',
                title: `Shift Handover (${h.shift})`,
                description: h.summary,
                badge: h.shift,
                by: 'Shift Nurse'
            });
        });

        // 14. OT / Surgeries
        surgeries.forEach(s => {
            events.push({
                id: `ot_${s._id}`,
                timestamp: s.actualStartTime || s.preferredDate || s.createdAt,
                category: 'OT',
                type: 'OT_PROCEDURE',
                title: `OT Procedure: ${s.surgery}`,
                description: `Diagnosis: ${s.diagnosis || '—'} • Priority: ${s.priority || 'Normal'}`,
                badge: s.status,
                by: 'Surgical Team'
            });
        });

        // 15. Lab Reports
        labReports.forEach(lr => {
            events.push({
                id: `lab_${lr._id}`,
                timestamp: lr.createdAt,
                category: 'INVESTIGATION',
                type: 'INVESTIGATION',
                title: `Investigation: ${(lr.testNames || []).join(', ') || 'Lab Test'}`,
                description: `Status: ${lr.testStatus || 'PENDING'} • Report: ${lr.reportStatus || 'PENDING'}`,
                badge: lr.testStatus,
                by: 'Laboratory'
            });
        });

        // Sort chronologically (newest first)
        events.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        res.json({
            success: true,
            timeline: events,
            data: events,
            count: events.length
        });
    } catch (err) {
        res.status(err.message.includes('not found') ? 404 : 500).json({ success: false, message: err.message || 'Error generating timeline' });
    }
});

// ============================================================================
// SECTION 11: NURSE PATIENT ASSIGNMENT
// ============================================================================

// POST /api/ipd-nursing/admissions/:admissionId/assign-nurse
router.post('/admissions/:admissionId/assign-nurse', verifyToken, resolveTenant, requireNursingWriteAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const { admissionId } = req.params;
        const { nurseId, shift, notes } = req.body;

        if (!nurseId || !mongoose.Types.ObjectId.isValid(nurseId)) {
            return res.status(400).json({ success: false, message: 'Valid nurseId is required' });
        }

        const { Admission, User } = getModels(req);
        const admission = await Admission.findOne({ _id: admissionId, hospitalId });
        if (!admission) {
            return res.status(404).json({ success: false, message: 'Admission not found in hospital context' });
        }

        if (admission.status === 'Discharged') {
            return res.status(400).json({ success: false, message: 'Cannot assign nurse to a discharged patient' });
        }

        // Verify nurse exists
        const nurseUser = await MasterUser.findById(nurseId).select('name email role specialization');
        if (!nurseUser) {
            return res.status(404).json({ success: false, message: 'Nurse user not found' });
        }

        if (!admission.assignedNurses) {
            admission.assignedNurses = [];
        }

        // Check if this nurse is already active on this admission
        const existingActive = admission.assignedNurses.find(
            a => String(a.nurseId) === String(nurseId) && a.status === 'ACTIVE'
        );

        if (existingActive) {
            existingActive.shift = shift || existingActive.shift;
            if (notes) existingActive.notes = notes;
            existingActive.assignedAt = new Date();
            existingActive.assignedBy = req.user._id || req.user.userId;
        } else {
            admission.assignedNurses.push({
                nurseId,
                assignedAt: new Date(),
                assignedBy: req.user._id || req.user.userId,
                status: 'ACTIVE',
                shift: shift || 'All',
                notes: notes || ''
            });
        }

        await admission.save();

        emitSocket(req, 'nurse_assigned', {
            admissionId: admission._id,
            patientId: admission.patientId,
            nurseId,
            nurseName: nurseUser.name,
            shift: shift || 'All'
        });

        res.status(200).json({
            success: true,
            message: `Nurse ${nurseUser.name} assigned successfully`,
            assignedNurses: admission.assignedNurses,
            data: admission.assignedNurses
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message || 'Error assigning nurse' });
    }
});

// PATCH /api/ipd-nursing/admissions/:admissionId/unassign-nurse
router.patch('/admissions/:admissionId/unassign-nurse', verifyToken, resolveTenant, requireNursingWriteAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const { admissionId } = req.params;
        const { nurseId, notes } = req.body;

        if (!nurseId || !mongoose.Types.ObjectId.isValid(nurseId)) {
            return res.status(400).json({ success: false, message: 'Valid nurseId is required' });
        }

        const { Admission } = getModels(req);
        const admission = await Admission.findOne({ _id: admissionId, hospitalId });
        if (!admission) {
            return res.status(404).json({ success: false, message: 'Admission not found in hospital context' });
        }

        if (!admission.assignedNurses || admission.assignedNurses.length === 0) {
            return res.status(400).json({ success: false, message: 'No assigned nurses found for this admission' });
        }

        let updated = false;
        admission.assignedNurses.forEach(a => {
            if (String(a.nurseId) === String(nurseId) && a.status === 'ACTIVE') {
                a.status = 'UNASSIGNED';
                a.unassignedAt = new Date();
                a.unassignedBy = req.user._id || req.user.userId;
                if (notes) a.notes = `${a.notes ? a.notes + ' | ' : ''}Unassigned: ${notes}`;
                updated = true;
            }
        });

        if (!updated) {
            return res.status(400).json({ success: false, message: 'Nurse is not actively assigned to this admission' });
        }

        await admission.save();

        emitSocket(req, 'nurse_unassigned', {
            admissionId: admission._id,
            patientId: admission.patientId,
            nurseId
        });

        res.json({
            success: true,
            message: 'Nurse unassigned successfully',
            assignedNurses: admission.assignedNurses,
            data: admission.assignedNurses
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message || 'Error unassigning nurse' });
    }
});

// GET /api/ipd-nursing/admissions/:admissionId/assigned-nurses
router.get('/admissions/:admissionId/assigned-nurses', verifyToken, resolveTenant, requireClinicalReadAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const { admissionId } = req.params;
        const { Admission, User } = getModels(req);

        const admission = await Admission.findOne({ _id: admissionId, hospitalId }).lean();
        if (!admission) {
            return res.status(404).json({ success: false, message: 'Admission not found' });
        }

        const assignments = admission.assignedNurses || [];
        for (let a of assignments) {
            if (a.nurseId) {
                a.nurse = await User.findById(a.nurseId).select('name email role specialization phone').lean() || null;
            }
            if (a.assignedBy) {
                a.assignedByUser = await User.findById(a.assignedBy).select('name role').lean() || null;
            }
        }

        res.json({
            success: true,
            assignedNurses: assignments,
            activeNurses: assignments.filter(a => a.status === 'ACTIVE'),
            data: assignments
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message || 'Error fetching assigned nurses' });
    }
});

// GET /api/ipd-nursing/my-assigned-admissions
router.get('/my-assigned-admissions', verifyToken, resolveTenant, requireClinicalReadAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const nurseId = req.user._id || req.user.userId;
        const { Admission, User, Bed } = getModels(req);

        const admissions = await Admission.find({
            hospitalId,
            status: 'Admitted',
            'assignedNurses.nurseId': nurseId,
            'assignedNurses.status': 'ACTIVE'
        })
            .populate('patientId', 'name patientId mrn gender age phone aadhaarNumber bloodGroup')
            .populate('doctorId', 'name specialization email phone')
            .populate('bedId', 'bedNumber ward bedType status')
            .sort({ admissionDate: -1 })
            .lean();

        res.json({
            success: true,
            count: admissions.length,
            admissions,
            data: admissions
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message || 'Error fetching my assigned admissions' });
    }
});

// GET /api/ipd-nursing/staff/nurses
router.get('/staff/nurses', verifyToken, resolveTenant, requireClinicalReadAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const { Role } = getModels(req);

        // Find nurse roles
        const nurseRoles = await Role.find({
            $or: [
                { name: { $regex: /nurse/i } },
                { permissions: 'nurse_access' }
            ]
        }).select('_id name').lean();

        const roleIds = nurseRoles.map(r => r._id);
        const roleNames = ['nurse', 'staffnurse', 'headnurse'];

        const query = {
            $or: [
                { role: { $in: roleNames } },
                { role: { $in: roleIds } }
            ]
        };
        if (hospitalId) {
            query.hospitalId = hospitalId;
        }

        const nurses = await MasterUser.find(query)
            .select('name email role specialization phone')
            .lean();

        res.json({
            success: true,
            count: nurses.length,
            nurses,
            data: nurses
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message || 'Error fetching hospital nurses' });
    }
});

// ============================================================================
// SECTION 12: DISCHARGE READINESS & NURSING CLEARANCE
// ============================================================================

// GET /api/ipd-nursing/admissions/:admissionId/discharge-readiness
router.get('/admissions/:admissionId/discharge-readiness', verifyToken, resolveTenant, requireClinicalReadAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const { admissionId } = req.params;
        const admission = await findAdmissionOrFail(req, admissionId);

        const {
            IPDLine,
            IPDCatheter,
            MARRecord,
            NursingTask,
            LabReport,
            User
        } = getModels(req);

        // Parallel count checks
        const [
            activeLines,
            activeCatheters,
            dueMARCount,
            pendingTasksCount,
            pendingInvestigationsCount
        ] = await Promise.all([
            IPDLine.find({ admissionId, hospitalId, status: 'ACTIVE' }).lean(),
            IPDCatheter.find({ admissionId, hospitalId, status: 'ACTIVE' }).lean(),
            MARRecord.countDocuments({ admissionId, hospitalId, status: { $in: ['SCHEDULED', 'DUE'] } }),
            NursingTask.countDocuments({ admissionId, hospitalId, status: { $in: ['PENDING', 'DUE', 'IN_PROGRESS'] } }),
            LabReport.countDocuments({ hospitalId, $or: [{ userId: admission.patientId }, { patientId: String(admission.patientId) }], testStatus: { $ne: 'DONE' } })
        ]);

        const readiness = admission.dischargeReadiness || {
            doctorDischargeOrdered: false,
            nursingClearance: false,
            status: 'NOT_READY'
        };

        // Populate doctor and nurse if present
        let doctorUser = null;
        if (readiness.doctorDischargeDoctorId) {
            doctorUser = await User.findById(readiness.doctorDischargeDoctorId).select('name specialization email').lean();
        }
        let nurseUser = null;
        if (readiness.nursingClearedBy) {
            nurseUser = await User.findById(readiness.nursingClearedBy).select('name email role').lean();
        }

        // Calculate overall readiness
        let computedStatus = 'NOT_READY';
        if (admission.status === 'Discharged') {
            computedStatus = 'DISCHARGED';
        } else if (readiness.doctorDischargeOrdered && readiness.nursingClearance) {
            computedStatus = 'READY_FOR_DISCHARGE';
        } else if (readiness.nursingClearance) {
            computedStatus = 'NURSING_CLEARED';
        } else if (readiness.doctorDischargeOrdered) {
            computedStatus = 'DOCTOR_ORDERED';
        }

        const checklist = {
            doctorDischargeOrdered: !!readiness.doctorDischargeOrdered,
            doctorDischargeDate: readiness.doctorDischargeDate || null,
            doctorDischargeDoctor: doctorUser,
            doctorDischargeNotes: readiness.doctorDischargeNotes || '',
            nursingClearance: !!readiness.nursingClearance,
            nursingClearedAt: readiness.nursingClearedAt || null,
            nursingClearedNurse: nurseUser,
            nursingNotes: readiness.nursingNotes || '',
            activeLinesCount: activeLines.length,
            activeLines: activeLines.map(l => ({ type: l.lineType, site: l.site })),
            activeCathetersCount: activeCatheters.length,
            activeCatheters: activeCatheters.map(c => ({ type: c.catheterType, site: c.site })),
            dueMARCount,
            pendingTasksCount,
            pendingInvestigationsCount,
            paymentStatus: admission.paymentStatus || 'Pending',
            totalAmount: admission.totalAmount || 0,
            overallStatus: computedStatus,
            canDischargeAdministratively: computedStatus === 'READY_FOR_DISCHARGE' || readiness.doctorDischargeOrdered
        };

        res.json({
            success: true,
            readiness: checklist,
            data: checklist
        });
    } catch (err) {
        res.status(err.message.includes('not found') ? 404 : 500).json({ success: false, message: err.message || 'Error checking discharge readiness' });
    }
});

// POST /api/ipd-nursing/admissions/:admissionId/nursing-clearance
router.post('/admissions/:admissionId/nursing-clearance', verifyToken, resolveTenant, requireNursingWriteAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const { admissionId } = req.params;
        const { nursingNotes } = req.body;

        const { Admission, IPDLine, IPDCatheter } = getModels(req);
        const admission = await Admission.findOne({ _id: admissionId, hospitalId });
        if (!admission) {
            return res.status(404).json({ success: false, message: 'Admission not found' });
        }

        if (admission.status === 'Discharged') {
            return res.status(400).json({ success: false, message: 'Patient is already discharged' });
        }

        // Verify active lines/catheters warning
        const activeLines = await IPDLine.countDocuments({ admissionId, hospitalId, status: 'ACTIVE' });
        const activeCatheters = await IPDCatheter.countDocuments({ admissionId, hospitalId, status: 'ACTIVE' });

        if (!admission.dischargeReadiness) {
            admission.dischargeReadiness = {};
        }

        admission.dischargeReadiness.nursingClearance = true;
        admission.dischargeReadiness.nursingClearedAt = new Date();
        admission.dischargeReadiness.nursingClearedBy = req.user._id || req.user.userId;
        admission.dischargeReadiness.nursingNotes = nursingNotes ? String(nursingNotes).trim() : 'All lines and medications reconciled. Patient cleared clinically by nursing staff.';

        if (admission.dischargeReadiness.doctorDischargeOrdered) {
            admission.dischargeReadiness.status = 'READY_FOR_DISCHARGE';
        } else {
            admission.dischargeReadiness.status = 'NURSING_CLEARED';
        }

        await admission.save();

        emitSocket(req, 'discharge_readiness_changed', {
            admissionId: admission._id,
            patientId: admission.patientId,
            status: admission.dischargeReadiness.status,
            nursingClearance: true
        });

        res.json({
            success: true,
            message: 'Nursing clinical clearance successfully signed off',
            dischargeReadiness: admission.dischargeReadiness,
            hasActiveLines: activeLines > 0,
            hasActiveCatheters: activeCatheters > 0,
            data: admission.dischargeReadiness
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message || 'Error signing off nursing clearance' });
    }
});

// ============================================================================
// SECTION 13: IPD OPERATIONS METRICS & DASHBOARD
// ============================================================================

// GET /api/ipd-nursing/operations/metrics
router.get('/operations/metrics', verifyToken, resolveTenant, requireClinicalReadAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const {
            Bed,
            Admission,
            NursingTask,
            MARRecord,
            IPDVitals,
            SurgeryPlan,
            LabReport
        } = getModels(req);

        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        // Fetch beds
        const beds = await Bed.find({ hospitalId }).lean();
        const totalBeds = beds.length;
        const occupiedBeds = beds.filter(b => b.status === 'OCCUPIED').length;
        const availableBeds = beds.filter(b => b.status === 'AVAILABLE').length;
        const maintenanceBeds = beds.filter(b => b.status === 'MAINTENANCE').length;
        const occupancyRate = totalBeds > 0 ? Math.round((occupiedBeds / totalBeds) * 100) : 0;

        // Fetch active admissions
        const activeAdmissions = await Admission.find({ hospitalId, status: 'Admitted' }).lean();
        const activeAdmissionsCount = activeAdmissions.length;
        const activeAdmissionIds = activeAdmissions.map(a => a._id);

        // New admissions today
        const newAdmissionsToday = await Admission.countDocuments({
            hospitalId,
            admissionDate: { $gte: startOfDay }
        });

        // Discharges today
        const dischargesToday = await Admission.countDocuments({
            hospitalId,
            status: 'Discharged',
            dischargeDate: { $gte: startOfDay }
        });

        // Discharge pending orders (Doctor ordered discharge, but still Admitted)
        const dischargePendingCount = activeAdmissions.filter(
            a => a.dischargeReadiness?.doctorDischargeOrdered
        ).length;

        // Overdue tasks
        const overdueTasksCount = await NursingTask.countDocuments({
            hospitalId,
            admissionId: { $in: activeAdmissionIds },
            status: { $in: ['PENDING', 'IN_PROGRESS'] },
            scheduledAt: { $lt: new Date() }
        });

        // Due MAR records
        const medsDueCount = await MARRecord.countDocuments({
            hospitalId,
            admissionId: { $in: activeAdmissionIds },
            status: { $in: ['SCHEDULED', 'DUE'] },
            scheduledTime: { $lte: new Date(Date.now() + 60 * 60 * 1000) } // Next 1 hour or past
        });

        // OT & Post-op patients
        const otPatientsCount = await SurgeryPlan.countDocuments({
            hospitalId,
            status: { $in: ['PRE_OP', 'READY_FOR_OT', 'IN_OT', 'SURGERY_COMPLETED', 'POST_OP'] }
        });

        // Ward breakdown
        const wardMap = {};
        beds.forEach(b => {
            const w = b.ward || 'General';
            if (!wardMap[w]) {
                wardMap[w] = { ward: w, totalBeds: 0, occupiedBeds: 0, availableBeds: 0, activePatients: 0 };
            }
            wardMap[w].totalBeds += 1;
            if (b.status === 'OCCUPIED') wardMap[w].occupiedBeds += 1;
            if (b.status === 'AVAILABLE') wardMap[w].availableBeds += 1;
        });

        activeAdmissions.forEach(a => {
            const w = a.ward || 'General';
            if (wardMap[w]) {
                wardMap[w].activePatients += 1;
            }
        });

        const wardBreakdown = Object.values(wardMap);

        const metrics = {
            totalBeds,
            occupiedBeds,
            availableBeds,
            maintenanceBeds,
            occupancyRate,
            activeAdmissionsCount,
            newAdmissionsToday,
            dischargesToday,
            dischargePendingCount,
            overdueTasksCount,
            medsDueCount,
            otPatientsCount,
            wardBreakdown
        };

        res.json({
            success: true,
            metrics,
            data: metrics
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message || 'Error generating operations metrics' });
    }
});

// ============================================================================
// SECTION 14: PATIENT SAFETY & CLINICAL ALERTS
// ============================================================================

// GET /api/ipd-nursing/admissions/:admissionId/alerts
router.get('/admissions/:admissionId/alerts', verifyToken, resolveTenant, requireClinicalReadAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const { admissionId } = req.params;
        const admission = await findAdmissionOrFail(req, admissionId);

        const {
            IPDVitals,
            MARRecord,
            NursingTask,
            IPDLine,
            IPDCatheter
        } = getModels(req);

        const alerts = [];
        const now = new Date();

        // 1. Check Latest Vitals
        const latestVital = await IPDVitals.findOne({ admissionId, hospitalId }).sort({ recordedAt: -1 }).lean();
        if (latestVital) {
            if (latestVital.spo2 !== undefined && latestVital.spo2 < 90) {
                alerts.push({
                    type: 'CRITICAL_VITAL',
                    severity: 'HIGH',
                    title: `Critical SpO₂ Level (${latestVital.spo2}%)`,
                    message: 'Patient oxygen saturation is below 90%. Immediate clinical intervention required.',
                    timestamp: latestVital.recordedAt
                });
            }
            if (latestVital.systolicBP && (latestVital.systolicBP > 180 || latestVital.systolicBP < 85)) {
                alerts.push({
                    type: 'CRITICAL_VITAL',
                    severity: 'HIGH',
                    title: `Critical Blood Pressure (${latestVital.systolicBP}/${latestVital.diastolicBP})`,
                    message: 'Patient blood pressure is outside safe clinical limits.',
                    timestamp: latestVital.recordedAt
                });
            }
            if (latestVital.pulse && (latestVital.pulse > 130 || latestVital.pulse < 45)) {
                alerts.push({
                    type: 'CRITICAL_VITAL',
                    severity: 'HIGH',
                    title: `Critical Pulse Rate (${latestVital.pulse} bpm)`,
                    message: 'Patient pulse rate indicates severe tachycardia/bradycardia.',
                    timestamp: latestVital.recordedAt
                });
            }
        }

        // 2. Overdue MAR Medications
        const overdueMAR = await MARRecord.find({
            admissionId,
            hospitalId,
            status: { $in: ['SCHEDULED', 'DUE'] },
            scheduledTime: { $lt: new Date(now.getTime() - 15 * 60 * 1000) } // >15 mins late
        }).populate('orderId').lean();

        overdueMAR.forEach(m => {
            alerts.push({
                type: 'OVERDUE_MEDICATION',
                severity: 'MEDIUM',
                title: `Overdue Medication: ${m.orderId?.medicineName || 'Medication'}`,
                message: `Scheduled for ${new Date(m.scheduledTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}. Administration pending.`,
                timestamp: m.scheduledTime
            });
        });

        // 3. Overdue Nursing Tasks
        const overdueTasks = await NursingTask.find({
            admissionId,
            hospitalId,
            status: { $in: ['PENDING', 'IN_PROGRESS'] },
            scheduledAt: { $lt: now }
        }).lean();

        overdueTasks.forEach(t => {
            alerts.push({
                type: 'OVERDUE_TASK',
                severity: t.priority === 'URGENT' || t.priority === 'HIGH' ? 'HIGH' : 'MEDIUM',
                title: `Task Overdue: ${t.title}`,
                message: `Scheduled task (${t.taskType}) was due at ${new Date(t.scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`,
                timestamp: t.scheduledAt
            });
        });

        // 4. Line Dwell Time (>72 hours)
        const lines = await IPDLine.find({ admissionId, hospitalId, status: 'ACTIVE' }).lean();
        lines.forEach(l => {
            const hoursOld = (now - new Date(l.insertedAt)) / (1000 * 60 * 60);
            if (hoursOld >= 72) {
                alerts.push({
                    type: 'DEVICE_REVIEW',
                    severity: 'LOW',
                    title: `IV Cannula Review Due (${Math.round(hoursOld)}h dwell time)`,
                    message: `${l.lineType} at ${l.site} has been active for >72 hours. Inspect site for phlebitis / replace cannula.`,
                    timestamp: l.insertedAt
                });
            }
        });

        // 5. Catheter Dwell Time (>7 days)
        const caths = await IPDCatheter.find({ admissionId, hospitalId, status: 'ACTIVE' }).lean();
        caths.forEach(c => {
            const daysOld = (now - new Date(c.insertedAt)) / (1000 * 60 * 60 * 24);
            if (daysOld >= 7) {
                alerts.push({
                    type: 'DEVICE_REVIEW',
                    severity: 'LOW',
                    title: `Catheter Review Due (${Math.round(daysOld)} days in situ)`,
                    message: `${c.catheterType} catheter has been active for ${Math.round(daysOld)} days. Evaluate for removal/replacement.`,
                    timestamp: c.insertedAt
                });
            }
        });

        // 6. Discharge Block Alert
        if (admission.dischargeReadiness?.doctorDischargeOrdered && !admission.dischargeReadiness?.nursingClearance) {
            alerts.push({
                type: 'DISCHARGE_PENDING',
                severity: 'MEDIUM',
                title: 'Discharge Ordered by Doctor',
                message: 'Doctor has ordered discharge. Nursing clearance and line removal required before final discharge.',
                timestamp: admission.dischargeReadiness.doctorDischargeDate || now
            });
        }

        res.json({
            success: true,
            alerts,
            count: alerts.length,
            data: alerts
        });
    } catch (err) {
        res.status(err.message.includes('not found') ? 404 : 500).json({ success: false, message: err.message || 'Error fetching alerts' });
    }
});

// GET /api/ipd-nursing/alerts (Hospital-wide active inpatient alerts)
router.get('/alerts', verifyToken, resolveTenant, requireClinicalReadAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const { Admission, IPDVitals, MARRecord, NursingTask, IPDLine, User } = getModels(req);

        const activeAdmissions = await Admission.find({ hospitalId, status: 'Admitted' })
            .populate('patientId', 'name patientId mrn')
            .populate('bedId', 'bedNumber ward')
            .lean();

        const admissionMap = {};
        activeAdmissions.forEach(a => { admissionMap[String(a._id)] = a; });
        const activeIds = activeAdmissions.map(a => a._id);
        const now = new Date();

        const allAlerts = [];

        // Check overdue MAR across active patients
        const overdueMAR = await MARRecord.find({
            hospitalId,
            admissionId: { $in: activeIds },
            status: { $in: ['SCHEDULED', 'DUE'] },
            scheduledTime: { $lt: new Date(now.getTime() - 15 * 60 * 1000) }
        }).populate('orderId').lean();

        overdueMAR.forEach(m => {
            const adm = admissionMap[String(m.admissionId)];
            allAlerts.push({
                admissionId: m.admissionId,
                patientName: adm?.patientId?.name || 'Patient',
                ward: adm?.ward || '—',
                bedNumber: adm?.bedNumber || '—',
                type: 'OVERDUE_MEDICATION',
                severity: 'MEDIUM',
                title: `Overdue Med: ${m.orderId?.medicineName || 'Medication'}`,
                timestamp: m.scheduledTime
            });
        });

        // Check overdue tasks
        const overdueTasks = await NursingTask.find({
            hospitalId,
            admissionId: { $in: activeIds },
            status: { $in: ['PENDING', 'IN_PROGRESS'] },
            scheduledAt: { $lt: now }
        }).lean();

        overdueTasks.forEach(t => {
            const adm = admissionMap[String(t.admissionId)];
            allAlerts.push({
                admissionId: t.admissionId,
                patientName: adm?.patientId?.name || 'Patient',
                ward: adm?.ward || '—',
                bedNumber: adm?.bedNumber || '—',
                type: 'OVERDUE_TASK',
                severity: t.priority === 'URGENT' ? 'HIGH' : 'MEDIUM',
                title: `Overdue Task: ${t.title}`,
                timestamp: t.scheduledAt
            });
        });

        allAlerts.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        res.json({
            success: true,
            alerts: allAlerts,
            count: allAlerts.length,
            data: allAlerts
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message || 'Error fetching hospital alerts' });
    }
});

// ============================================================================
// SECTION 15: INVESTIGATION STATUS UPDATES
// ============================================================================

// PATCH /api/ipd-nursing/investigations/:reportId/status
router.patch('/investigations/:reportId/status', verifyToken, resolveTenant, requireNursingWriteAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const { reportId } = req.params;
        const { testStatus, notes } = req.body;

        if (!mongoose.Types.ObjectId.isValid(reportId)) {
            return res.status(400).json({ success: false, message: 'Invalid reportId format' });
        }

        const { LabReport } = getModels(req);
        const report = await LabReport.findOne({ _id: reportId, hospitalId });
        if (!report) {
            return res.status(404).json({ success: false, message: 'Investigation report not found' });
        }

        if (testStatus) {
            report.testStatus = testStatus; // PENDING, IN_PROGRESS, DONE
        }
        if (notes) {
            report.notes = (report.notes ? report.notes + ' | ' : '') + String(notes).trim();
        }

        await report.save();

        emitSocket(req, 'investigation_status_changed', {
            reportId: report._id,
            patientId: report.userId || report.patientId,
            testStatus: report.testStatus
        });

        res.json({
            success: true,
            message: 'Investigation status updated successfully',
            report,
            data: report
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message || 'Error updating investigation status' });
    }
});

// ============================================================================
// SECTION 16: SBAR SHIFT HANDOVER
// ============================================================================

// POST /api/ipd-nursing/admissions/:admissionId/handovers — Record Shift Handover
router.post('/admissions/:admissionId/handovers', verifyToken, resolveTenant, requireNursingWriteAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const { admissionId } = req.params;
        const {
            toNurseId,
            shift = 'Morning to Evening',
            summary,
            importantObservations = '',
            pendingTasks = '',
            medicationConcerns = '',
            safetyConcerns = ''
        } = req.body;

        if (!summary || !String(summary).trim()) {
            return res.status(400).json({ success: false, message: 'Handover summary (Situation) is required' });
        }

        const admission = await findAdmissionOrFail(req, admissionId);
        const { NurseHandover, IPDVitals, IPDLine, IPDCatheter, NursingTask } = getModels(req);

        const fromNurseId = req.user._id || req.user.userId;

        const handover = new NurseHandover({
            hospitalId,
            admissionId,
            patientId: admission.patientId,
            fromNurseId,
            toNurseId: toNurseId && mongoose.Types.ObjectId.isValid(toNurseId) ? toNurseId : undefined,
            shift,
            handoverAt: new Date(),
            summary: String(summary).trim(),
            importantObservations: String(importantObservations).trim(),
            pendingTasks: String(pendingTasks).trim(),
            medicationConcerns: String(medicationConcerns).trim(),
            safetyConcerns: String(safetyConcerns).trim()
        });

        await handover.save();

        await logNursingAudit({
            hospitalId,
            user: req.user,
            action: 'HANDOVER_COMPLETED',
            targetModel: 'NurseHandover',
            targetId: handover._id,
            targetLabel: `SBAR Handover recorded for admission ${admissionId} (${shift})`,
            req
        });

        emitSocket(req, 'nurse_handover_recorded', {
            admissionId,
            patientId: admission.patientId,
            handoverId: handover._id,
            fromNurse: req.user.name,
            shift
        });

        res.status(201).json({
            success: true,
            message: 'Shift handover recorded successfully',
            handover,
            data: handover
        });
    } catch (err) {
        console.error('Error creating handover:', err);
        res.status(500).json({ success: false, message: err.message || 'Error recording handover' });
    }
});

// GET /api/ipd-nursing/admissions/:admissionId/handovers — Get Handover History
router.get('/admissions/:admissionId/handovers', verifyToken, resolveTenant, requireClinicalReadAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const { admissionId } = req.params;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        const { NurseHandover } = getModels(req);

        const filter = { hospitalId, admissionId };
        const total = await NurseHandover.countDocuments(filter);
        const handovers = await NurseHandover.find(filter)
            .populate('fromNurseId', 'name email role')
            .populate('toNurseId', 'name email role')
            .sort({ handoverAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        res.json({
            success: true,
            count: handovers.length,
            total,
            page,
            totalPages: Math.ceil(total / limit) || 1,
            handovers,
            data: handovers
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message || 'Error fetching handovers' });
    }
});

// ============================================================================
// SECTION 17: IPD COMMAND CENTER & CENSUS OVERVIEW
// ============================================================================

// GET /api/ipd-nursing/command-center/overview — Full Census & Operational Metrics
router.get('/command-center/overview', verifyToken, resolveTenant, requireClinicalReadAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const { Admission, Bed, InpatientOrder, MARRecord, NursingTask, IPDVitals, User } = getModels(req);

        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

        // 1. Bed Statistics
        const allBeds = await Bed.find({ hospitalId }).lean();
        const totalBeds = allBeds.length;
        const occupiedBeds = allBeds.filter(b => b.status === 'OCCUPIED').length;
        const availableBeds = allBeds.filter(b => b.status === 'AVAILABLE').length;
        const maintenanceBeds = allBeds.filter(b => b.status === 'MAINTENANCE').length;
        const occupancyRate = totalBeds > 0 ? ((occupiedBeds / totalBeds) * 100).toFixed(1) : '0.0';

        // 2. Active Admissions
        const activeAdmissions = await Admission.find({ hospitalId, status: 'Admitted' })
            .populate('patientId', 'name age gender patientId mrn phone')
            .populate('doctorId', 'name specialization')
            .lean();

        const admittedTodayCount = await Admission.countDocuments({
            hospitalId,
            admissionDate: { $gte: startOfToday }
        });

        const dischargesTodayCount = await Admission.countDocuments({
            hospitalId,
            status: 'Discharged',
            dischargeDate: { $gte: startOfToday }
        });

        const dischargesPlannedCount = activeAdmissions.filter(a =>
            a.dischargeReadiness?.doctorDischargeOrdered ||
            ['DOCTOR_ORDERED', 'READY_FOR_DISCHARGE'].includes(a.dischargeReadiness?.status)
        ).length;

        const longStayCount = activeAdmissions.filter(a => {
            const admDate = new Date(a.admissionDate || a.createdAt);
            return (now - admDate) > (7 * 24 * 60 * 60 * 1000);
        }).length;

        // 3. Clinical Workload Metrics
        const activeAdmissionIds = activeAdmissions.map(a => a._id);

        const pendingMARRecords = await MARRecord.find({
            hospitalId,
            admissionId: { $in: activeAdmissionIds },
            status: 'SCHEDULED',
            scheduledTime: {
                $gte: startOfToday,
                $lte: new Date(now.getTime() + 24 * 60 * 60 * 1000)
            }
        }).lean();

        const overdueMARCount = pendingMARRecords.filter(m => new Date(m.scheduledTime) < now).length;
        const pendingMARCount = pendingMARRecords.length;

        const pendingTasks = await NursingTask.find({
            hospitalId,
            admissionId: { $in: activeAdmissionIds },
            status: { $in: ['PENDING', 'IN_PROGRESS'] }
        }).lean();

        const urgentTasksCount = pendingTasks.filter(t => ['HIGH', 'URGENT'].includes(t.priority)).length;

        // Open Doctor Order Clarifications
        const ordersWithClarifications = await InpatientOrder.find({
            hospitalId,
            admissionId: { $in: activeAdmissionIds },
            'clarifications.status': 'OPEN'
        }).lean();

        let openClarificationsCount = 0;
        ordersWithClarifications.forEach(o => {
            (o.clarifications || []).forEach(c => {
                if (c.status === 'OPEN') openClarificationsCount++;
            });
        });

        const unassignedPatientsCount = activeAdmissions.filter(a =>
            !a.assignedNurses || a.assignedNurses.filter(n => n.status === 'ACTIVE').length === 0
        ).length;

        // 4. Ward-by-Ward Breakdown
        const wardMap = {};
        allBeds.forEach(bed => {
            const w = bed.ward || 'General';
            if (!wardMap[w]) {
                wardMap[w] = {
                    wardName: w,
                    totalBeds: 0,
                    occupiedBeds: 0,
                    availableBeds: 0,
                    maintenanceBeds: 0,
                    activePatients: [],
                    criticalVitalsCount: 0,
                    pendingDosesCount: 0
                };
            }
            wardMap[w].totalBeds++;
            if (bed.status === 'OCCUPIED') wardMap[w].occupiedBeds++;
            else if (bed.status === 'AVAILABLE') wardMap[w].availableBeds++;
            else if (bed.status === 'MAINTENANCE') wardMap[w].maintenanceBeds++;
        });

        // Correlate active admissions per ward
        activeAdmissions.forEach(adm => {
            const w = adm.ward || 'General';
            if (wardMap[w]) {
                wardMap[w].activePatients.push({
                    admissionId: adm._id,
                    patientName: adm.patientId?.name,
                    bedNumber: adm.bedNumber,
                    doctorName: adm.doctorId?.name,
                    dischargeStatus: adm.dischargeReadiness?.status || 'NOT_READY'
                });
            }
        });

        // Correlate pending MAR doses per ward
        pendingMARRecords.forEach(m => {
            const adm = activeAdmissions.find(a => String(a._id) === String(m.admissionId));
            if (adm && wardMap[adm.ward]) {
                wardMap[adm.ward].pendingDosesCount++;
            }
        });

        const wardBreakdown = Object.values(wardMap).map(w => ({
            ...w,
            occupancyRate: w.totalBeds > 0 ? ((w.occupiedBeds / w.totalBeds) * 100).toFixed(1) : '0.0',
            activePatientsCount: w.activePatients.length
        }));

        res.json({
            success: true,
            census: {
                totalBeds,
                occupiedBeds,
                availableBeds,
                maintenanceBeds,
                occupancyRate: `${occupancyRate}%`,
                occupancyRateValue: parseFloat(occupancyRate),
                activeInpatients: activeAdmissions.length,
                admittedToday: admittedTodayCount,
                dischargesToday: dischargesTodayCount,
                dischargesPlanned: dischargesPlannedCount,
                longStayCount
            },
            clinicalWorkload: {
                pendingMedications: pendingMARCount,
                overdueMedications: overdueMARCount,
                pendingTasks: pendingTasks.length,
                urgentTasks: urgentTasksCount,
                openClarifications: openClarificationsCount,
                unassignedPatients: unassignedPatientsCount
            },
            wardBreakdown,
            timestamp: new Date()
        });
    } catch (err) {
        console.error('Command center overview error:', err);
        res.status(500).json({ success: false, message: err.message || 'Error fetching command center overview' });
    }
});

// ============================================================================
// SECTION 18: DYNAMIC PATIENT FLOW BOARD (8 STAGES)
// ============================================================================

// GET /api/ipd-nursing/command-center/flow-board — Dynamic Patient Flow Stages
router.get('/command-center/flow-board', verifyToken, resolveTenant, requireClinicalReadAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const { ward, search, stageFilter } = req.query;

        const { Admission, Bed, InpatientOrder, MARRecord, NursingTask, IPDVitals, LabReport, SurgeryPlan, User } = getModels(req);

        const now = new Date();
        const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

        // Fetch active admissions + recently discharged in last 24h
        const admissionFilter = {
            hospitalId,
            $or: [
                { status: 'Admitted' },
                { status: 'Discharged', dischargeDate: { $gte: oneDayAgo } }
            ]
        };

        if (ward && ward !== 'ALL') {
            admissionFilter.ward = ward;
        }

        const admissions = await Admission.find(admissionFilter)
            .populate('patientId', 'name age gender patientId mrn phone aadhaarNumber avatar')
            .populate('doctorId', 'name specialization phone')
            .populate('bedId', 'bedNumber ward bedType')
            .populate('assignedNurses.nurseId', 'name email phone')
            .sort({ admissionDate: -1 })
            .lean();

        const admissionIds = admissions.map(a => a._id);
        const patientIds = admissions.map(a => a.patientId?._id || a.patientId).filter(Boolean);

        // Batch fetch clinical dependencies for stage derivation
        const [
            allVitals,
            allSurgeries,
            allLabReports,
            allOrders,
            allMARs,
            allTasks
        ] = await Promise.all([
            IPDVitals.find({ hospitalId, admissionId: { $in: admissionIds } }).sort({ recordedAt: -1 }).lean(),
            SurgeryPlan.find({ hospitalId, patientId: { $in: patientIds } }).lean(),
            LabReport.find({ hospitalId, $or: [{ admissionId: { $in: admissionIds } }, { patientId: { $in: patientIds } }] }).lean(),
            InpatientOrder.find({ hospitalId, admissionId: { $in: admissionIds } }).lean(),
            MARRecord.find({ hospitalId, admissionId: { $in: admissionIds }, status: 'SCHEDULED' }).lean(),
            NursingTask.find({ hospitalId, admissionId: { $in: admissionIds }, status: { $in: ['PENDING', 'IN_PROGRESS'] } }).lean()
        ]);

        // Map data by admissionId
        const vitalsMap = {};
        allVitals.forEach(v => {
            const aid = String(v.admissionId);
            if (!vitalsMap[aid]) vitalsMap[aid] = v; // latest one
        });

        const surgeriesMap = {};
        allSurgeries.forEach(s => {
            const pid = String(s.patientId);
            if (!surgeriesMap[pid]) surgeriesMap[pid] = [];
            surgeriesMap[pid].push(s);
        });

        const labsMap = {};
        allLabReports.forEach(l => {
            const aid = String(l.admissionId || '');
            const pid = String(l.patientId || l.userId || '');
            if (aid) {
                if (!labsMap[aid]) labsMap[aid] = [];
                labsMap[aid].push(l);
            }
            if (pid) {
                if (!labsMap[pid]) labsMap[pid] = [];
                labsMap[pid].push(l);
            }
        });

        const ordersMap = {};
        allOrders.forEach(o => {
            const aid = String(o.admissionId);
            if (!ordersMap[aid]) ordersMap[aid] = [];
            ordersMap[aid].push(o);
        });

        const marsMap = {};
        allMARs.forEach(m => {
            const aid = String(m.admissionId);
            if (!marsMap[aid]) marsMap[aid] = [];
            marsMap[aid].push(m);
        });

        const tasksMap = {};
        allTasks.forEach(t => {
            const aid = String(t.admissionId);
            if (!tasksMap[aid]) tasksMap[aid] = [];
            tasksMap[aid].push(t);
        });

        // Stages Configuration
        const STAGES = [
            'ADMITTED',
            'ACTIVE_CARE',
            'INVESTIGATION',
            'PROCEDURE_OT',
            'POST_OP',
            'DISCHARGE_PLANNED',
            'DISCHARGE_CLEARANCE',
            'DISCHARGED'
        ];

        const board = {
            ADMITTED: [],
            ACTIVE_CARE: [],
            INVESTIGATION: [],
            PROCEDURE_OT: [],
            POST_OP: [],
            DISCHARGE_PLANNED: [],
            DISCHARGE_CLEARANCE: [],
            DISCHARGED: []
        };

        const flowCards = [];

        admissions.forEach(adm => {
            const aid = String(adm._id);
            const pid = String(adm.patientId?._id || adm.patientId);
            const admDate = new Date(adm.admissionDate || adm.createdAt);
            const losHours = Math.max(0, (now - admDate) / (1000 * 60 * 60));
            const losDays = (losHours / 24).toFixed(1);

            const latestVital = vitalsMap[aid] || null;
            const patientSurgeries = surgeriesMap[pid] || [];
            const patientLabs = labsMap[aid] || labsMap[pid] || [];
            const patientOrders = ordersMap[aid] || [];
            const pendingDoses = marsMap[aid] || [];
            const patientTasks = tasksMap[aid] || [];

            // Alerts & status checks
            let hasCriticalVitals = false;
            if (latestVital) {
                const s = latestVital.spo2;
                const p = latestVital.pulseRate;
                const t = latestVital.temperature;
                if ((s && s < 92) || (p && (p < 50 || p > 125)) || (t && t > 102.5)) {
                    hasCriticalVitals = true;
                }
            }

            let openClarificationsCount = 0;
            patientOrders.forEach(o => {
                (o.clarifications || []).forEach(c => {
                    if (c.status === 'OPEN') openClarificationsCount++;
                });
            });

            const pendingLabs = patientLabs.filter(l => ['Pending', 'IN_PROGRESS'].includes(l.status || l.testStatus));
            const activeSurgeries = patientSurgeries.filter(s => ['SCHEDULED', 'PRE_OP', 'READY_FOR_OT', 'IN_OT'].includes(s.status));
            const recentCompletedSurgeries = patientSurgeries.filter(s => ['SURGERY_COMPLETED', 'POST_OP'].includes(s.status));

            // Dynamic Stage Derivation (Strict Clinical Logic)
            let stage = 'ACTIVE_CARE';

            if (adm.status === 'Discharged') {
                stage = 'DISCHARGED';
            } else if (adm.dischargeReadiness?.status === 'READY_FOR_DISCHARGE') {
                stage = 'DISCHARGE_CLEARANCE';
            } else if (adm.dischargeReadiness?.doctorDischargeOrdered) {
                stage = 'DISCHARGE_PLANNED';
            } else if (activeSurgeries.length > 0) {
                stage = 'PROCEDURE_OT';
            } else if (recentCompletedSurgeries.length > 0) {
                stage = 'POST_OP';
            } else if (pendingLabs.length > 0) {
                stage = 'INVESTIGATION';
            } else if (losHours < 24) {
                stage = 'ADMITTED';
            } else {
                stage = 'ACTIVE_CARE';
            }

            const activeNurses = (adm.assignedNurses || [])
                .filter(n => n.status === 'ACTIVE')
                .map(n => ({
                    nurseId: n.nurseId?._id || n.nurseId,
                    name: n.nurseId?.name || 'Assigned Nurse',
                    shift: n.shift
                }));

            const card = {
                admissionId: adm._id,
                patient: {
                    id: adm.patientId?._id,
                    name: adm.patientId?.name || 'Unknown Patient',
                    age: adm.patientId?.age,
                    gender: adm.patientId?.gender,
                    mrn: adm.patientId?.mrn || adm.patientId?.patientId || '—',
                    phone: adm.patientId?.phone,
                    avatar: adm.patientId?.avatar
                },
                doctor: {
                    id: adm.doctorId?._id,
                    name: adm.doctorId?.name || 'Attending Doctor',
                    specialization: adm.doctorId?.specialization || ''
                },
                location: {
                    ward: adm.ward,
                    bedNumber: adm.bedNumber,
                    bedType: adm.bedId?.bedType || 'General'
                },
                admissionDate: adm.admissionDate,
                dischargeDate: adm.dischargeDate,
                losDays: parseFloat(losDays),
                stage,
                assignedNurses: activeNurses,
                dischargeReadinessStatus: adm.dischargeReadiness?.status || 'NOT_READY',
                hasDischargeSummary: !!adm.dischargeSummary?.status,
                dischargeSummaryStatus: adm.dischargeSummary?.status || 'NONE',
                latestVitals: latestVital ? {
                    temperature: latestVital.temperature,
                    bloodPressure: latestVital.bloodPressure,
                    pulseRate: latestVital.pulseRate,
                    spo2: latestVital.spo2,
                    painScore: latestVital.painScore,
                    recordedAt: latestVital.recordedAt
                } : null,
                workloadSummary: {
                    pendingTasksCount: patientTasks.length,
                    urgentTasksCount: patientTasks.filter(t => ['HIGH', 'URGENT'].includes(t.priority)).length,
                    pendingDosesCount: pendingDoses.length,
                    overdueDosesCount: pendingDoses.filter(d => new Date(d.scheduledTime) < now).length,
                    pendingLabsCount: pendingLabs.length,
                    openClarificationsCount,
                    hasCriticalVitals
                }
            };

            // Apply search filter if provided
            if (search && String(search).trim()) {
                const s = String(search).toLowerCase().trim();
                const matchName = (card.patient.name || '').toLowerCase().includes(s);
                const matchMrn = (card.patient.mrn || '').toLowerCase().includes(s);
                const matchBed = (card.location.bedNumber || '').toLowerCase().includes(s);
                const matchWard = (card.location.ward || '').toLowerCase().includes(s);
                if (!matchName && !matchMrn && !matchBed && !matchWard) {
                    return;
                }
            }

            if (!stageFilter || stageFilter === 'ALL' || stageFilter === stage) {
                flowCards.push(card);
                if (board[stage]) {
                    board[stage].push(card);
                }
            }
        });

        res.json({
            success: true,
            totalPatients: flowCards.length,
            stages: STAGES,
            board,
            cards: flowCards,
            timestamp: new Date()
        });
    } catch (err) {
        console.error('Command center flow board error:', err);
        res.status(500).json({ success: false, message: err.message || 'Error fetching patient flow board' });
    }
});

// ============================================================================
// SECTION 19: DISCHARGE BLOCKER ENGINE
// ============================================================================

// GET /api/ipd-nursing/admissions/:admissionId/discharge-blockers — Real-time Blocker Analysis
router.get('/admissions/:admissionId/discharge-blockers', verifyToken, resolveTenant, requireClinicalReadAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const { admissionId } = req.params;

        const { Admission, InpatientOrder, MARRecord, NursingTask, IPDLine, IPDCatheter, LabReport, User } = getModels(req);
        const admission = await Admission.findOne({ _id: admissionId, hospitalId })
            .populate('patientId', 'name age gender patientId mrn')
            .populate('doctorId', 'name')
            .lean();

        if (!admission) {
            return res.status(404).json({ success: false, message: 'Admission not found' });
        }

        const now = new Date();
        const blockers = [];

        // ── 1. BLOCKING CHECKS (Hard blockers preventing safety discharge) ────────
        // 1.1 Doctor Discharge Order
        if (!admission.dischargeReadiness?.doctorDischargeOrdered) {
            blockers.push({
                type: 'BLOCKING',
                code: 'DOCTOR_ORDER_PENDING',
                title: 'Doctor Discharge Order Missing',
                message: 'Attending doctor must evaluate patient and place clinical discharge order.',
                actionTarget: 'doctor-order'
            });
        }

        // 1.2 Structured Discharge Summary Finalization
        if (!admission.dischargeSummary || admission.dischargeSummary.status !== 'FINALIZED') {
            blockers.push({
                type: 'BLOCKING',
                code: 'DISCHARGE_SUMMARY_NOT_FINALIZED',
                title: 'Discharge Summary Not Finalized',
                message: admission.dischargeSummary?.status === 'DRAFT'
                    ? 'Discharge summary is in DRAFT state and requires doctor signature.'
                    : 'Structured clinical discharge summary has not been created.',
                actionTarget: 'discharge-summary'
            });
        }

        // 1.3 Nursing Safety Clearance
        if (!admission.dischargeReadiness?.nursingClearance) {
            blockers.push({
                type: 'BLOCKING',
                code: 'NURSING_CLEARANCE_PENDING',
                title: 'Nursing Safety Clearance Pending',
                message: 'Inpatient nurse must complete patient safety checklist and sign clearance.',
                actionTarget: 'nursing-clearance'
            });
        }

        // 1.4 Active Invasive Lines
        const activeLines = await IPDLine.find({ hospitalId, admissionId, status: 'ACTIVE' }).lean();
        if (activeLines.length > 0) {
            blockers.push({
                type: 'BLOCKING',
                code: 'ACTIVE_INVASIVE_LINES',
                title: 'Active Invasive Line(s) Present',
                message: `${activeLines.length} active IV/arterial line(s) must be discontinued before discharge.`,
                actionTarget: 'lines'
            });
        }

        // 1.5 Active Urinary / Drainage Catheters
        const activeCatheters = await IPDCatheter.find({ hospitalId, admissionId, status: 'ACTIVE' }).lean();
        if (activeCatheters.length > 0) {
            blockers.push({
                type: 'BLOCKING',
                code: 'ACTIVE_CATHETERS',
                title: 'Active Indwelling Catheter Present',
                message: `${activeCatheters.length} active catheter(s) must be removed or documented for home care.`,
                actionTarget: 'catheters'
            });
        }

        // 1.6 Pending High / Urgent Nursing Tasks
        const urgentPendingTasks = await NursingTask.find({
            hospitalId,
            admissionId,
            priority: { $in: ['HIGH', 'URGENT'] },
            status: { $in: ['PENDING', 'IN_PROGRESS'] }
        }).lean();

        if (urgentPendingTasks.length > 0) {
            blockers.push({
                type: 'BLOCKING',
                code: 'URGENT_TASKS_INCOMPLETE',
                title: 'Urgent Clinical Tasks Incomplete',
                message: `${urgentPendingTasks.length} high-priority nursing task(s) remain unfinished.`,
                actionTarget: 'tasks'
            });
        }

        // ── 2. WARNING CHECKS (Clinical & operational warnings) ────────────────────
        // 2.1 Overdue MAR Doses
        const overdueDoses = await MARRecord.find({
            hospitalId,
            admissionId,
            status: 'SCHEDULED',
            scheduledTime: { $lt: now }
        }).lean();

        if (overdueDoses.length > 0) {
            blockers.push({
                type: 'WARNING',
                code: 'OVERDUE_MAR_DOSES',
                title: 'Overdue Inpatient Medication Doses',
                message: `${overdueDoses.length} scheduled dose(s) are overdue and require administration or hold recording.`,
                actionTarget: 'mar'
            });
        }

        // 2.2 Pending Lab / Radiology Reports
        const pendingLabs = await LabReport.find({
            hospitalId,
            $or: [{ admissionId }, { patientId: admission.patientId?._id || admission.patientId }],
            status: { $in: ['Pending', 'IN_PROGRESS'] }
        }).lean();

        if (pendingLabs.length > 0) {
            blockers.push({
                type: 'WARNING',
                code: 'PENDING_INVESTIGATIONS',
                title: 'Pending Lab / Diagnostic Investigations',
                message: `${pendingLabs.length} diagnostic test(s) are still pending lab results.`,
                actionTarget: 'investigations'
            });
        }

        // 2.3 Open Doctor Order Clarifications
        const orders = await InpatientOrder.find({ hospitalId, admissionId }).lean();
        let openClarifications = 0;
        orders.forEach(o => {
            (o.clarifications || []).forEach(c => {
                if (c.status === 'OPEN') openClarifications++;
            });
        });

        if (openClarifications > 0) {
            blockers.push({
                type: 'WARNING',
                code: 'OPEN_CLARIFICATIONS',
                title: 'Unresolved Doctor Clarification Requests',
                message: `${openClarifications} open clarification request(s) on doctor orders.`,
                actionTarget: 'orders'
            });
        }

        // 2.4 Outstanding Billing / Financial Status
        if (admission.paymentStatus === 'Pending' && (admission.totalAmount || 0) > 0) {
            blockers.push({
                type: 'WARNING',
                code: 'BILLING_PAYMENT_PENDING',
                title: 'Pending Financial Clearance',
                message: `Admission billing balance of ₹${admission.totalAmount} is marked Pending.`,
                actionTarget: 'billing'
            });
        }

        // ── 3. INFO CHECKS (Best practice documentation) ─────────────────────────
        if (admission.dischargeSummary?.dischargeMedications?.length > 0) {
            blockers.push({
                type: 'INFO',
                code: 'DISCHARGE_MEDS_READY',
                title: 'Take-Home Medications Prescribed',
                message: `${admission.dischargeSummary.dischargeMedications.length} discharge medication(s) prescribed and ready for pharmacy dispensing.`,
                actionTarget: 'discharge-summary'
            });
        } else {
            blockers.push({
                type: 'INFO',
                code: 'NO_DISCHARGE_MEDS',
                title: 'No Take-Home Medications',
                message: 'No post-discharge take-home medications documented in discharge summary.',
                actionTarget: 'discharge-summary'
            });
        }

        if (!admission.dischargeSummary?.followUpDate) {
            blockers.push({
                type: 'INFO',
                code: 'FOLLOW_UP_DATE_NOT_SET',
                title: 'Follow-up Date Not Scheduled',
                message: 'No follow-up review date specified in discharge summary.',
                actionTarget: 'discharge-summary'
            });
        }

        const blockingCount = blockers.filter(b => b.type === 'BLOCKING').length;
        const warningCount = blockers.filter(b => b.type === 'WARNING').length;
        const infoCount = blockers.filter(b => b.type === 'INFO').length;

        res.json({
            success: true,
            admissionId,
            canDischarge: blockingCount === 0,
            summary: {
                blockingCount,
                warningCount,
                infoCount,
                total: blockers.length
            },
            dischargeReadiness: admission.dischargeReadiness,
            dischargeSummaryStatus: admission.dischargeSummary?.status || 'NONE',
            blockers
        });
    } catch (err) {
        console.error('Discharge blocker engine error:', err);
        res.status(500).json({ success: false, message: err.message || 'Error analyzing discharge blockers' });
    }
});

// ============================================================================
// SECTION 20: BED CONCURRENCY GUARD & RECONCILIATION TOOL
// ============================================================================

// POST /api/ipd-nursing/beds/reconcile — Admin Bed State Healing & Orphan Fixer
router.post('/beds/reconcile', verifyToken, resolveTenant, async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const role = getUserRole(req);
        const perms = req.user._roleData?.permissions || [];

        // Require admin / clinical supervisor access
        if (!['superadmin', 'centraladmin', 'hospitaladmin', 'admin', 'doctor', 'headnurse'].includes(role) && !perms.includes('*') && !perms.includes('bed_manage')) {
            return res.status(403).json({ success: false, message: 'Administrative bed reconciliation authorization required' });
        }

        const { Admission, Bed, User } = getModels(req);

        const allBeds = await Bed.find({ hospitalId });
        const activeAdmissions = await Admission.find({ hospitalId, status: 'Admitted' });

        const anomaliesFixed = [];
        const activeAdmissionBedMap = {};

        // 1. Check all active admissions and ensure their bed is marked OCCUPIED
        for (const adm of activeAdmissions) {
            activeAdmissionBedMap[String(adm.bedId)] = adm;
            const bed = allBeds.find(b => String(b._id) === String(adm.bedId));
            if (bed) {
                if (bed.status !== 'OCCUPIED' || String(bed.currentAdmission) !== String(adm._id) || String(bed.currentPatient) !== String(adm.patientId)) {
                    bed.status = 'OCCUPIED';
                    bed.currentAdmission = adm._id;
                    bed.currentPatient = adm.patientId;
                    await bed.save();
                    anomaliesFixed.push({
                        bedId: bed._id,
                        bedNumber: bed.bedNumber,
                        ward: bed.ward,
                        action: 'HEALED_OCCUPIED',
                        reason: `Bed was out of sync with active admission ${adm._id}`
                    });
                }
            }
        }

        // 2. Check all beds marked OCCUPIED: if no active admission references them, heal to AVAILABLE
        for (const bed of allBeds) {
            if (bed.status === 'OCCUPIED') {
                const referencingAdm = activeAdmissionBedMap[String(bed._id)];
                if (!referencingAdm) {
                    bed.status = 'AVAILABLE';
                    bed.currentAdmission = null;
                    bed.currentPatient = null;
                    await bed.save();
                    anomaliesFixed.push({
                        bedId: bed._id,
                        bedNumber: bed.bedNumber,
                        ward: bed.ward,
                        action: 'RESET_TO_AVAILABLE',
                        reason: `Bed was marked OCCUPIED without an active admitted patient`
                    });
                }
            }
        }

        await logNursingAudit({
            hospitalId,
            user: req.user,
            action: 'BED_RECONCILED',
            targetModel: 'Bed',
            targetLabel: `Reconciled ${allBeds.length} beds. Fixed ${anomaliesFixed.length} anomalies.`,
            req
        });

        emitSocket(req, 'bed_status_updated', {
            action: 'RECONCILED',
            healedCount: anomaliesFixed.length
        });

        res.json({
            success: true,
            message: `Bed reconciliation completed. ${anomaliesFixed.length} anomalies repaired.`,
            totalBedsChecked: allBeds.length,
            activeAdmissionsCount: activeAdmissions.length,
            anomaliesFixedCount: anomaliesFixed.length,
            anomaliesFixed
        });
    } catch (err) {
        console.error('Bed reconciliation error:', err);
        res.status(500).json({ success: false, message: err.message || 'Error reconciling beds' });
    }
});

// ============================================================================
// SECTION 21: IPD OPERATIONAL & CLINICAL ANALYTICS
// ============================================================================

// GET /api/ipd-nursing/analytics/census-trends — Historical Census Trends & ALOS
router.get('/analytics/census-trends', verifyToken, resolveTenant, requireClinicalReadAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const days = parseInt(req.query.days) || 14;

        const { Admission, Bed } = getModels(req);

        const now = new Date();
        const pastDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

        const allAdmissions = await Admission.find({
            hospitalId,
            admissionDate: { $gte: pastDate }
        }).lean();

        const dischargedInPeriod = await Admission.find({
            hospitalId,
            status: 'Discharged',
            dischargeDate: { $gte: pastDate }
        }).lean();

        // Calculate Average Length of Stay (ALOS)
        let totalLosDays = 0;
        dischargedInPeriod.forEach(adm => {
            const admDate = new Date(adm.admissionDate || adm.createdAt);
            const disDate = new Date(adm.dischargeDate);
            const stayDays = Math.max(0.5, (disDate - admDate) / (1000 * 60 * 60 * 24));
            totalLosDays += stayDays;
        });

        const alos = dischargedInPeriod.length > 0 ? (totalLosDays / dischargedInPeriod.length).toFixed(1) : '0.0';

        // Build Daily Timeline
        const dailyTrends = [];
        for (let i = days - 1; i >= 0; i--) {
            const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i, 0, 0, 0);
            const dayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i, 23, 59, 59);
            const dateStr = dayStart.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' });

            const admittedCount = allAdmissions.filter(a => {
                const d = new Date(a.admissionDate || a.createdAt);
                return d >= dayStart && d <= dayEnd;
            }).length;

            const dischargedCount = dischargedInPeriod.filter(a => {
                const d = new Date(a.dischargeDate);
                return d >= dayStart && d <= dayEnd;
            }).length;

            dailyTrends.push({
                date: dateStr,
                fullDate: dayStart.toISOString().split('T')[0],
                admissions: admittedCount,
                discharges: dischargedCount
            });
        }

        res.json({
            success: true,
            periodDays: days,
            alosDays: parseFloat(alos),
            totalAdmissionsInPeriod: allAdmissions.length,
            totalDischargesInPeriod: dischargedInPeriod.length,
            dailyTrends
        });
    } catch (err) {
        console.error('Census trends analytics error:', err);
        res.status(500).json({ success: false, message: err.message || 'Error fetching census trends' });
    }
});

// GET /api/ipd-nursing/analytics/nurse-workload — Nurse Patient Load & Task Completion
router.get('/analytics/nurse-workload', verifyToken, resolveTenant, requireClinicalReadAccess, async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const { Admission, NursingTask, MARRecord, User } = getModels(req);

        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        const activeAdmissions = await Admission.find({ hospitalId, status: 'Admitted' })
            .populate('assignedNurses.nurseId', 'name email')
            .lean();

        // Map assigned patients per nurse
        const nurseWorkloadMap = {};

        activeAdmissions.forEach(adm => {
            (adm.assignedNurses || []).forEach(n => {
                if (n.status === 'ACTIVE' && n.nurseId) {
                    const nid = String(n.nurseId._id || n.nurseId);
                    const nname = n.nurseId.name || 'Nurse';
                    if (!nurseWorkloadMap[nid]) {
                        nurseWorkloadMap[nid] = {
                            nurseId: nid,
                            nurseName: nname,
                            activePatientsCount: 0,
                            assignedWards: new Set(),
                            completedTasksToday: 0,
                            administeredDosesToday: 0
                        };
                    }
                    nurseWorkloadMap[nid].activePatientsCount++;
                    nurseWorkloadMap[nid].assignedWards.add(adm.ward || 'General');
                }
            });
        });

        // Query today's completed nursing tasks
        const completedTasksToday = await NursingTask.find({
            hospitalId,
            status: 'COMPLETED',
            completedAt: { $gte: startOfToday }
        }).lean();

        completedTasksToday.forEach(t => {
            if (t.completedBy) {
                const nid = String(t.completedBy);
                if (nurseWorkloadMap[nid]) {
                    nurseWorkloadMap[nid].completedTasksToday++;
                }
            }
        });

        // Query today's MAR administrations
        const administeredMARSToday = await MARRecord.find({
            hospitalId,
            status: 'GIVEN',
            administeredAt: { $gte: startOfToday }
        }).lean();

        administeredMARSToday.forEach(m => {
            if (m.administeredBy) {
                const nid = String(m.administeredBy);
                if (nurseWorkloadMap[nid]) {
                    nurseWorkloadMap[nid].administeredDosesToday++;
                }
            }
        });

        const workloadReport = Object.values(nurseWorkloadMap).map(w => ({
            ...w,
            assignedWards: Array.from(w.assignedWards)
        }));

        res.json({
            success: true,
            nursesCount: workloadReport.length,
            workload: workloadReport,
            data: workloadReport
        });
    } catch (err) {
        console.error('Nurse workload analytics error:', err);
        res.status(500).json({ success: false, message: err.message || 'Error fetching nurse workload' });
    }
});

module.exports = router;


