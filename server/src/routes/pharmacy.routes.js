const express = require('express');
const router = express.Router();
const Inventory = require('../models/inventory.model');
const { verifyToken } = require('../middleware/auth.middleware');

const User = require('../models/user.model');
const Role = require('../models/role.model');

// GET all inventory
router.get('/inventory', verifyToken, async (req, res) => {
    try {
        let pharmacyIds = [req.user.id];
        let query = { pharmacyId: req.user.id };

        if (req.user.hospitalId) {
            const pharmacyRoles = await Role.find({ name: { $regex: /pharmac/i } });
            if (pharmacyRoles.length > 0) {
                const pharmacists = await User.find({ hospitalId: req.user.hospitalId, role: { $in: pharmacyRoles.map(r => r._id) } });
                const ids = pharmacists.map(p => p._id);
                if (ids.length > 0) pharmacyIds = ids;
            }
            query = {
                $or: [
                    { pharmacyId: { $in: pharmacyIds } },
                    { hospitalId: req.user.hospitalId }
                ]
            };
        } else {
             query = { pharmacyId: req.user.id };
        }

        const items = await Inventory.find(query).sort({ createdAt: -1 });
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
            pharmacyId: req.user.id,
            hospitalId: req.user.hospitalId
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
        const deleteQuery = { _id: req.params.id, pharmacyId: req.user.id };
        if (req.user.hospitalId) deleteQuery.hospitalId = req.user.hospitalId;
        const deletedItem = await Inventory.findOneAndDelete(deleteQuery);

        if (!deletedItem) {
            return res.status(404).json({ success: false, message: "Item not found or unauthorized" });
        }

        res.json({ success: true, message: 'Item deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;