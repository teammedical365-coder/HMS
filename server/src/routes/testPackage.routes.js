const express = require('express');
const router = express.Router();
const TestPackage = require('../models/testPackage.model');
const { verifyToken, verifyAdminOrSuperAdmin } = require('../middleware/auth.middleware');

// 1. GET ALL TEST PACKAGES (Accessible to any authenticated staff)
router.get('/', verifyToken, async (req, res) => {
    try {
        const query = {};
        // If not admin, only show active packages
        if (req.user.role !== 'superadmin' && req.user.role !== 'admin') {
            query.isActive = true;
        }

        const packages = await TestPackage.find(query)
            .populate('tests', 'name code price category isActive')
            .sort({ name: 1 });

        res.json({ success: true, count: packages.length, data: packages });
    } catch (error) {
        console.error('Fetch Test Packages Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

// 2. GET SINGLE PACKAGE
router.get('/:id', verifyToken, async (req, res) => {
    try {
        const pkg = await TestPackage.findById(req.params.id)
            .populate('tests', 'name code price category isActive');

        if (!pkg) return res.status(404).json({ success: false, message: 'Package not found' });

        res.json({ success: true, data: pkg });
    } catch (error) {
        console.error('Fetch Package Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

// 3. CREATE A NEW TEST PACKAGE
router.post('/', verifyAdminOrSuperAdmin, async (req, res) => {
    try {
        const { name, code, description, tests, price, discountedPrice, category, isActive } = req.body;

        if (!name) {
            return res.status(400).json({ success: false, message: 'Package name is required' });
        }

        const exists = await TestPackage.findOne({ name });
        if (exists) {
            return res.status(400).json({ success: false, message: 'A package with this name already exists' });
        }

        const newPackage = await TestPackage.create({
            name, code, description, tests: tests || [], price, discountedPrice, category, isActive
        });

        // Populate the tests before sending response
        const populated = await TestPackage.findById(newPackage._id)
            .populate('tests', 'name code price category isActive');

        res.status(201).json({ success: true, message: 'Test package created', data: populated });
    } catch (error) {
        console.error('Create Test Package Error:', error);
        res.status(500).json({ success: false, message: 'Error creating test package', error: error.message });
    }
});

// 4. UPDATE A TEST PACKAGE
router.put('/:id', verifyAdminOrSuperAdmin, async (req, res) => {
    try {
        const { name, code, description, tests, price, discountedPrice, category, isActive } = req.body;

        const updatedPackage = await TestPackage.findByIdAndUpdate(
            req.params.id,
            { name, code, description, tests: tests || [], price, discountedPrice, category, isActive },
            { new: true, runValidators: true }
        ).populate('tests', 'name code price category isActive');

        if (!updatedPackage) return res.status(404).json({ success: false, message: 'Test package not found' });

        res.json({ success: true, message: 'Test package updated', data: updatedPackage });
    } catch (error) {
        console.error('Update Test Package Error:', error);
        res.status(500).json({ success: false, message: 'Error updating test package' });
    }
});

// 5. DELETE A TEST PACKAGE
router.delete('/:id', verifyAdminOrSuperAdmin, async (req, res) => {
    try {
        const pkg = await TestPackage.findByIdAndDelete(req.params.id);
        if (!pkg) return res.status(404).json({ success: false, message: 'Test package not found' });

        res.json({ success: true, message: 'Test package deleted successfully' });
    } catch (error) {
        console.error('Delete Test Package Error:', error);
        res.status(500).json({ success: false, message: 'Error deleting test package' });
    }
});

module.exports = router;
