const express = require('express');
const router = express.Router();
const QuestionLibrary = require('../models/questionLibrary.model');
const Hospital = require('../models/hospital.model');
const { verifyAdminOrSuperAdmin, verifyToken } = require('../middleware/auth.middleware');
const { MASTER_DEFAULT_QUESTION_LIBRARY, resolveDepartmentQuestions } = require('../config/masterQuestionLibrary');

const defaultQuestionLibraryData = MASTER_DEFAULT_QUESTION_LIBRARY;

// Get the latest question library configuration
router.get('/', verifyToken, async (req, res) => {
    try {
        const hospitalId = req.user.hospitalId || null;
        let library = null;

        if (hospitalId) {
            library = await QuestionLibrary.findOne({ hospitalId }).sort({ version: -1 });
        }

        let hospital = null;
        let allowedDepartments = null;

        if (hospitalId) {
            hospital = await Hospital.findById(hospitalId);
            if (hospital && hospital.departments && hospital.departments.length > 0) {
                allowedDepartments = hospital.departments;
            } else if (hospital && hospital.clinicType === 'clinic') {
                allowedDepartments = ['General'];
            }
        }

        // If no hospital-specific library found, load the latest global library
        if (!library || !library.data || Object.keys(library.data).length === 0) {
            library = await QuestionLibrary.findOne({ hospitalId: null }).sort({ version: -1 });
        }

        // If still no library exists in DB, fallback to master defaultQuestionLibraryData
        if (!library || !library.data || Object.keys(library.data).length === 0) {
            library = {
                data: defaultQuestionLibraryData,
                version: 1,
                hospitalId: null
            };
            QuestionLibrary.create({ data: defaultQuestionLibraryData, version: 1, hospitalId: null }).catch(() => {});
        }

        // Merge existing library data with defaults to ensure all departments have questions
        const fullData = { ...defaultQuestionLibraryData, ...(library.data || {}) };

        // If Hospital Admin has specific allowed departments, strictly return only those departments
        if (hospitalId) {
            const filteredData = {};

            const targetDepts = (allowedDepartments && allowedDepartments.length > 0)
                ? allowedDepartments
                : Object.keys(fullData);

            for (const dept of targetDepts) {
                if (fullData[dept] && Object.keys(fullData[dept]).length > 0) {
                    filteredData[dept] = fullData[dept];
                } else {
                    // Fallback to default questions for this dept or general
                    filteredData[dept] = defaultQuestionLibraryData[dept] || defaultQuestionLibraryData["General Medicine"] || {};
                }
            }

            // Include any additional custom departments the hospital explicitly created
            for (const key of Object.keys(fullData)) {
                if (filteredData[key] === undefined) {
                    filteredData[key] = fullData[key];
                }
            }

            const libObj = library.toObject ? library.toObject() : { ...library };
            libObj.data = filteredData;
            library = libObj;
        } else {
            const libObj = library.toObject ? library.toObject() : { ...library };
            libObj.data = fullData;
            library = libObj;
        }

        res.json({ success: true, data: library, allowedDepartments });
    } catch (error) {
        console.error('Error fetching question library:', error);
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// Update or create question library
router.post('/', verifyAdminOrSuperAdmin, async (req, res) => {
    try {
        const { data } = req.body;
        const hospitalId = req.user.hospitalId || null;

        if (!data) return res.status(400).json({ success: false, message: 'Library data is required' });

        const latestLibrary = await QuestionLibrary.findOne({ hospitalId }).sort({ version: -1 });
        let newVersion = 1;
        if (latestLibrary) {
            newVersion = latestLibrary.version + 1;
        }

        const library = new QuestionLibrary({ data, version: newVersion, hospitalId });
        await library.save();

        res.status(201).json({ success: true, message: 'Question Library updated successfully', data: library });
    } catch (error) {
        console.error('Error updating question library:', error);
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

module.exports = router;
