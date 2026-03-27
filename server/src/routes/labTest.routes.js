const express = require('express');
const router = express.Router();
const LabTest = require('../models/labTest.model');
const { verifyToken, verifyAdminOrSuperAdmin } = require('../middleware/auth.middleware');

// 1. GET ALL LAB TESTS (Accessible to any authenticated staff: Admin, Doctor, Lab Tech, etc.)
router.get('/', verifyToken, async (req, res) => {
    try {
        const isAdmin = ['superadmin', 'admin', 'centraladmin', 'hospitaladmin'].includes(req.user.role);
        const hospitalId = req.query.hospitalId || (req.user.hospitalId ? req.user.hospitalId.toString() : null);

        // Build query: always include global tests; also include hospital-specific tests if hospitalId is known
        let query = {};
        if (hospitalId) {
            query = { $or: [{ hospitalId: null }, { hospitalId: hospitalId }] };
        } else {
            query = { hospitalId: null };
        }

        // Non-admins only see active tests
        if (!isAdmin) query.isActive = true;

        const labTests = await LabTest.find(query).sort({ name: 1 }).lean();

        // Resolve hospital-specific prices
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

        // Hospital admins create hospital-specific tests; central/super admins create global tests
        const isCentral = req.user.role === 'superadmin' || req.user.role === 'centraladmin';
        const hospitalId = isCentral ? null : (req.user.hospitalId || null);

        // Check uniqueness within the same scope (global or hospital-specific)
        const testExists = await LabTest.findOne({ name, hospitalId });
        if (testExists) {
            return res.status(400).json({ success: false, message: 'Lab test with this name already exists' });
        }

        const newTest = await LabTest.create({
            name, code, description, price, category, isActive, hospitalId
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

        const test = await LabTest.findById(req.params.id);
        if (!test) return res.status(404).json({ success: false, message: 'Lab test not found' });

        // Hospital admin can only edit their own hospital's tests
        const isCentral = req.user.role === 'superadmin' || req.user.role === 'centraladmin';
        if (!isCentral) {
            const testHid = test.hospitalId ? test.hospitalId.toString() : null;
            const userHid = req.user.hospitalId ? req.user.hospitalId.toString() : null;
            if (testHid !== userHid) {
                return res.status(403).json({ success: false, message: 'You can only edit tests created by your hospital' });
            }
        }

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
        const test = await LabTest.findById(req.params.id);
        if (!test) return res.status(404).json({ success: false, message: 'Lab test not found' });

        // Hospital admin can only delete their own hospital's tests
        const isCentral = req.user.role === 'superadmin' || req.user.role === 'centraladmin';
        if (!isCentral) {
            const testHid = test.hospitalId ? test.hospitalId.toString() : null;
            const userHid = req.user.hospitalId ? req.user.hospitalId.toString() : null;
            if (testHid !== userHid) {
                return res.status(403).json({ success: false, message: 'You can only delete tests created by your hospital' });
            }
        }

        await test.deleteOne();
        res.json({ success: true, message: 'Lab test deleted successfully' });
    } catch (error) {
        console.error('Delete Lab Test Error:', error);
        res.status(500).json({ success: false, message: 'Error deleting lab test' });
    }
});

module.exports = router;
