const express = require('express');
const router = express.Router();
const LabTest = require('../models/labTest.model');
const { verifyToken, verifyAdminOrSuperAdmin } = require('../middleware/auth.middleware');

// 1. GET ALL LAB TESTS (Accessible to any authenticated staff: Admin, Doctor, Lab Tech, etc.)
router.get('/', verifyToken, async (req, res) => {
    try {
        const query = {};
        // If not admin, only show active tests
        if (req.user.role !== 'superadmin' && req.user.role !== 'admin') {
            query.isActive = true;
        }

        const labTests = await LabTest.find(query).sort({ name: 1 });
        res.json({ success: true, count: labTests.length, data: labTests });
    } catch (error) {
        console.error('Fetch Lab Tests Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

// 2. CREATE A NEW LAB TEST
router.post('/', verifyAdminOrSuperAdmin, async (req, res) => {
    try {
        const { name, code, description, price, category, isActive } = req.body;

        if (!name) {
            return res.status(400).json({ success: false, message: 'Test name is required' });
        }

        const testExists = await LabTest.findOne({ name });
        if (testExists) {
            return res.status(400).json({ success: false, message: 'Lab test with this name already exists' });
        }

        const newTest = await LabTest.create({
            name, code, description, price, category, isActive
        });

        res.status(201).json({ success: true, message: 'Lab test created', data: newTest });
    } catch (error) {
        console.error('Create Lab Test Error:', error);
        res.status(500).json({ success: false, message: 'Error creating lab test', error: error.message });
    }
});

// 3. UPDATE A LAB TEST
router.put('/:id', verifyAdminOrSuperAdmin, async (req, res) => {
    try {
        const { name, code, description, price, category, isActive } = req.body;

        const updatedTest = await LabTest.findByIdAndUpdate(
            req.params.id,
            { name, code, description, price, category, isActive },
            { new: true, runValidators: true }
        );

        if (!updatedTest) return res.status(404).json({ success: false, message: 'Lab test not found' });

        res.json({ success: true, message: 'Lab test updated', data: updatedTest });
    } catch (error) {
        console.error('Update Lab Test Error:', error);
        res.status(500).json({ success: false, message: 'Error updating lab test' });
    }
});

// 4. DELETE A LAB TEST
router.delete('/:id', verifyAdminOrSuperAdmin, async (req, res) => {
    try {
        const test = await LabTest.findByIdAndDelete(req.params.id);
        if (!test) return res.status(404).json({ success: false, message: 'Lab test not found' });

        res.json({ success: true, message: 'Lab test deleted successfully' });
    } catch (error) {
        console.error('Delete Lab Test Error:', error);
        res.status(500).json({ success: false, message: 'Error deleting lab test' });
    }
});

module.exports = router;
