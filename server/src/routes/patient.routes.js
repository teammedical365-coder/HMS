const express = require('express');
const router = express.Router();
const User = require('../models/user.model');
const { verifyToken } = require('../middleware/auth.middleware');

// SEARCH API: Identifies patient by Phone or Name
router.get('/search', verifyToken, async (req, res) => {
    try {
        const { term } = req.query; // e.g., ?term=9876543210

        const patients = await User.find({
            $or: [
                { phone: term },
                { patientId: term },
                { name: { $regex: term, $options: 'i' } } // Case-insensitive name search
            ]
        }).select('name phone patientId dob gender city');

        res.json({ success: true, data: patients });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;