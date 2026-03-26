const express = require('express');
const router = express.Router();
const LabTest = require('../models/labTest.model');
const { verifyToken, verifyAdminOrSuperAdmin } = require('../middleware/auth.middleware');

// 1. GET ALL LAB TESTS (Accessible to any authenticated staff: Admin, Doctor, Lab Tech, etc.)
router.get('/', verifyToken, async (req, res) => {
    try {
        const query = {};
        // If not admin, only show active tests
        if (req.user.role !== 'superadmin' && req.user.role !== 'admin' && req.user.role !== 'centraladmin' && req.user.role !== 'hospitaladmin') {
            query.isActive = true;
        }

        const labTests = await LabTest.find(query).sort({ name: 1 }).lean();

        // If hospitalId is provided (or from token), resolve hospital-specific prices
        const hospitalId = req.query.hospitalId || req.user.hospitalId;
        if (hospitalId) {
            const hid = hospitalId.toString();
            labTests.forEach(test => {
                const hospitalPrice = test.hospitalPrices && test.hospitalPrices[hid];
                test.effectivePrice = hospitalPrice !== undefined ? hospitalPrice : test.price;
            });
        } else {
            labTests.forEach(test => {
                test.effectivePrice = test.price;
            });
        }

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
        const { name, code, description, price, category, isActive, hospitalPrices } = req.body;

        const updateData = {};
        if (name !== undefined) updateData.name = name;
        if (code !== undefined) updateData.code = code;
        if (description !== undefined) updateData.description = description;
        if (price !== undefined) updateData.price = price;
        if (category !== undefined) updateData.category = category;
        if (isActive !== undefined) updateData.isActive = isActive;
        if (hospitalPrices !== undefined) updateData.hospitalPrices = hospitalPrices;

        const updatedTest = await LabTest.findByIdAndUpdate(
            req.params.id,
            updateData,
            { new: true, runValidators: true }
        );

        if (!updatedTest) return res.status(404).json({ success: false, message: 'Lab test not found' });

        res.json({ success: true, message: 'Lab test updated', data: updatedTest });
    } catch (error) {
        console.error('Update Lab Test Error:', error);
        res.status(500).json({ success: false, message: 'Error updating lab test' });
    }
});

// 5. SET HOSPITAL-SPECIFIC PRICE FOR A LAB TEST
router.put('/:id/hospital-price', verifyAdminOrSuperAdmin, async (req, res) => {
    try {
        const { hospitalId, price } = req.body;
        if (!hospitalId) return res.status(400).json({ success: false, message: 'hospitalId is required' });

        const test = await LabTest.findById(req.params.id);
        if (!test) return res.status(404).json({ success: false, message: 'Lab test not found' });

        if (price === null || price === undefined || price === '') {
            // Remove hospital-specific price (fall back to default)
            test.hospitalPrices.delete(hospitalId);
        } else {
            test.hospitalPrices.set(hospitalId, Number(price));
        }
        await test.save();

        res.json({ success: true, message: 'Hospital price updated', data: test });
    } catch (error) {
        console.error('Set Hospital Price Error:', error);
        res.status(500).json({ success: false, message: 'Error setting hospital price' });
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
