const express = require('express');
const router = express.Router();
const Medicine = require('../models/medicine.model');
const { verifyAdminOrSuperAdmin, verifyToken } = require('../middleware/auth.middleware');

// Get all medicines
router.get('/', verifyToken, async (req, res) => {
    try {
        const medicines = await Medicine.find({}).sort({ name: 1 });
        res.json({ success: true, data: medicines });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Add a new medicine
router.post('/', verifyAdminOrSuperAdmin, async (req, res) => {
    try {
        const { name, genericName, category, description } = req.body;

        const existing = await Medicine.findOne({ name });
        if (existing) return res.status(400).json({ success: false, message: 'Medicine already exists' });

        const medicine = new Medicine({ name, genericName, category, description });
        await medicine.save();

        res.status(201).json({ success: true, message: 'Medicine added successfully', data: medicine });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Update a medicine
router.put('/:id', verifyAdminOrSuperAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, genericName, category, description } = req.body;
        const medicine = await Medicine.findByIdAndUpdate(id, { name, genericName, category, description }, { new: true });

        if (!medicine) return res.status(404).json({ success: false, message: 'Medicine not found' });

        res.json({ success: true, message: 'Medicine updated successfully', data: medicine });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Delete a medicine
router.delete('/:id', verifyAdminOrSuperAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const medicine = await Medicine.findByIdAndDelete(id);

        if (!medicine) return res.status(404).json({ success: false, message: 'Medicine not found' });

        res.json({ success: true, message: 'Medicine deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
