const express = require('express');
const router = express.Router();
const QuestionLibrary = require('../models/questionLibrary.model');
const { verifyAdminOrSuperAdmin, verifyToken } = require('../middleware/auth.middleware');

// Get the latest question library configuration
router.get('/', verifyToken, async (req, res) => {
    try {
        const library = await QuestionLibrary.findOne().sort({ version: -1 });
        if (!library) {
            return res.json({ success: true, data: { data: {} } });
        }
        res.json({ success: true, data: library });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Update or create question library
router.post('/', verifyAdminOrSuperAdmin, async (req, res) => {
    try {
        const { data } = req.body;

        if (!data) return res.status(400).json({ success: false, message: 'Library data is required' });

        const latestLibrary = await QuestionLibrary.findOne().sort({ version: -1 });
        let newVersion = 1;
        if (latestLibrary) {
            newVersion = latestLibrary.version + 1;
        }

        const library = new QuestionLibrary({ data, version: newVersion });
        await library.save();

        res.status(201).json({ success: true, message: 'Question Library updated successfully', data: library });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
