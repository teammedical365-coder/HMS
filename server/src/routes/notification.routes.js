const express = require('express');
const router = express.Router();
const Notification = require('../models/notification.model');
const { verifyToken } = require('../middleware/auth.middleware');

// GET all notifications for a user/role
router.get('/', verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const role = typeof req.user.role === 'string'
            ? req.user.role.toLowerCase()
            : req.user._roleData?.name?.toLowerCase();

        // Find notifications where user is explicitly recipient, OR their role is recipient
        const notifications = await Notification.find({
            $or: [
                { recipientId: userId },
                { recipientRole: role }
            ]
        })
            .populate('senderId', 'name')
            .sort({ createdAt: -1 })
            .limit(50); // Limit to recent

        res.json({ success: true, data: notifications });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Marking single notification as read
router.patch('/:id/read', verifyToken, async (req, res) => {
    try {
        const id = req.params.id;
        const notification = await Notification.findByIdAndUpdate(
            id,
            { status: 'Read' },
            { new: true }
        );
        res.json({ success: true, data: notification });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Mark all as read
router.patch('/read-all', verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const role = typeof req.user.role === 'string'
            ? req.user.role.toLowerCase()
            : req.user._roleData?.name?.toLowerCase();

        await Notification.updateMany({
            $or: [
                { recipientId: userId },
                { recipientRole: role }
            ],
            status: 'Unread'
        }, { status: 'Read' });

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
