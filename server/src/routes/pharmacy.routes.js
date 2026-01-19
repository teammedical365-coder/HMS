const express = require('express');
const router = express.Router();
const Inventory = require('../models/inventory.model');
const { verifyToken } = require('../middleware/auth.middleware');

// GET all inventory
router.get('/inventory', verifyToken, async (req, res) => {
    try {
        const items = await Inventory.find({ pharmacyId: req.user.id }).sort({ createdAt: -1 });
        res.json({ success: true, data: items });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// POST new medicine
router.post('/inventory', verifyToken, async (req, res) => {
    try {
        const newItem = new Inventory({
            ...req.body,
            pharmacyId: req.user.id
        });

        await newItem.save();
        res.status(201).json({ success: true, data: newItem });
    } catch (error) {
        // FIX: Send back the specific Mongoose error message
        console.error("Mongoose Save Error:", error.message);
        res.status(400).json({
            success: false,
            message: error.message // This will now say EXACTLY what failed
        });
    }
});

// DELETE medicine
router.delete('/inventory/:id', verifyToken, async (req, res) => {
    try {
        const deletedItem = await Inventory.findOneAndDelete({
            _id: req.params.id,
            pharmacyId: req.user.id
        });

        if (!deletedItem) {
            return res.status(404).json({ success: false, message: "Item not found or unauthorized" });
        }

        res.json({ success: true, message: 'Item deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;