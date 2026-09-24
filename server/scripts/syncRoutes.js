const fs = require('fs');
const path = require('path');

// 1. Update assistant.routes.js
const assistantFile = path.join(__dirname, '../src/routes/assistant.routes.js');
let assistantCode = fs.readFileSync(assistantFile, 'utf8');

// Replace from "// MASTER CLINICAL QUESTION LIBRARY" up to "router.get('/preparation/:appointmentId'"
const startMarker = '// ─────────────────────────────────────────────────────────────────────────────\r\n// MASTER CLINICAL QUESTION LIBRARY';
const startMarkerLF = '// ─────────────────────────────────────────────────────────────────────────────\n// MASTER CLINICAL QUESTION LIBRARY';
const endMarker = "// 5. GET /api/assistant/preparation/:appointmentId";

let sIdx = assistantCode.indexOf('MASTER CLINICAL QUESTION LIBRARY');
if (sIdx !== -1) {
    // Find the comment line before it
    const preIdx = assistantCode.lastIndexOf('// ───', sIdx);
    const endIdx = assistantCode.indexOf(endMarker);

    if (preIdx !== -1 && endIdx !== -1) {
        const replacement = `// ─────────────────────────────────────────────────────────────────────────────
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
`;
        assistantCode = assistantCode.slice(0, preIdx) + replacement + assistantCode.slice(endIdx);
        fs.writeFileSync(assistantFile, assistantCode, 'utf8');
        console.log('Successfully updated assistant.routes.js');
    } else {
        console.error('Indices not found for assistant.routes.js', { preIdx, endIdx });
    }
}

// 2. Update questionLibrary.routes.js
const qlibFile = path.join(__dirname, '../src/routes/questionLibrary.routes.js');
let qlibCode = fs.readFileSync(qlibFile, 'utf8');

const qlibReplacement = `const express = require('express');
const router = express.Router();
const QuestionLibrary = require('../models/questionLibrary.model');
const Hospital = require('../models/hospital.model');
const { verifyAdminOrSuperAdmin, verifyToken } = require('../middleware/auth.middleware');
const { MASTER_DEFAULT_QUESTION_LIBRARY, resolveDepartmentQuestions } = require('../config/masterQuestionLibrary');

const defaultQuestionLibraryData = MASTER_DEFAULT_QUESTION_LIBRARY;
`;

const qlibGetStart = qlibCode.indexOf('// Get the latest question library configuration');
if (qlibGetStart !== -1) {
    qlibCode = qlibReplacement + '\n' + qlibCode.slice(qlibGetStart);
    fs.writeFileSync(qlibFile, qlibCode, 'utf8');
    console.log('Successfully updated questionLibrary.routes.js');
}

console.log('Done backend routes synchronization');
