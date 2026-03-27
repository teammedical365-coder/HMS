// server/src/routes/pharmacyOrders.routes.js
const express = require('express');
const router = express.Router();
const PharmacyOrder = require('../models/pharmacyOrder.model');
const { verifyToken } = require('../middleware/auth.middleware');

const User = require('../models/user.model');

// GET all orders for the pharmacy dashboard (Admin/Pharmacy role)
router.get('/', verifyToken, async (req, res) => {
    try {
        let query = {};
        // HARD ISOLATION: Use hospitalId directly on the order document
        if (req.user.hospitalId) {
            query.hospitalId = req.user.hospitalId;
        }

        const orders = await PharmacyOrder.find(query)
            .populate('userId', 'name phone email')
            .populate('doctorId', 'name')
            .sort({ createdAt: -1 });
        res.json({ success: true, orders });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET orders for the currently logged-in patient (User role)
router.get('/my-orders', verifyToken, async (req, res) => {
    try {
        const orders = await PharmacyOrder.find({ userId: req.user.userId })
            .populate('doctorId', 'name')
            .sort({ createdAt: -1 });
        res.json({ success: true, orders });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error fetching your orders', error: error.message });
    }
});

// Complete order and payment
router.patch('/:id/complete', verifyToken, async (req, res) => {
    try {
        const { purchasedIndices } = req.body;
        // HARD ISOLATION: Only allow completing orders from your hospital
        const findQuery = { _id: req.params.id };
        if (req.user.hospitalId) findQuery.hospitalId = req.user.hospitalId;
        const order = await PharmacyOrder.findOne(findQuery);
        if (!order) return res.status(404).json({ success: false, message: "Order not found or unauthorized" });

        if (purchasedIndices && Array.isArray(purchasedIndices)) {
            order.items.forEach((item, idx) => {
                item.purchased = purchasedIndices.includes(idx);
            });
            order.markModified('items');
        } else {
            // Default: All purchased if none specified
            order.items.forEach(item => { item.purchased = true; });
            order.markModified('items');
        }

        order.paymentStatus = 'Paid';
        order.orderStatus = 'Completed';
        await order.save();

        const io = req.app.get('io');
        const Notification = require('../models/notification.model');

        const notificationItem = new Notification({
            senderId: req.user.id,
            recipientRole: 'doctor', // Or specific user Id: order.doctorId
            recipientId: order.doctorId,
            message: 'Prescription dispensed to patient.',
            referenceType: 'PharmacyOrder',
            referenceId: order._id,
            patientId: order.patientId.toString()
        });
        await notificationItem.save();

        if (io) {
            io.to(order.doctorId.toString()).emit('new_notification', notificationItem);
        }

        res.json({ success: true, message: 'Order completed successfully', order });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;