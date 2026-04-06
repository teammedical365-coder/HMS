// server/src/routes/pharmacyOrders.routes.js
const express = require('express');
const router = express.Router();
const PharmacyOrder = require('../models/pharmacyOrder.model');
const Inventory = require('../models/inventory.model');
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

        // Determine which items are purchased
        const purchasedSet = new Set(
            purchasedIndices && Array.isArray(purchasedIndices)
                ? purchasedIndices
                : order.items.map((_, i) => i) // default: all
        );

        // Look up prices from inventory and decrement stock for purchased items
        let totalAmount = 0;
        for (let idx = 0; idx < order.items.length; idx++) {
            const item = order.items[idx];
            const wasPurchased = purchasedSet.has(idx);
            item.purchased = wasPurchased;

            if (wasPurchased) {
                // Extract medicine name — strip trailing " - DosageMg" if appended
                let rawName = item.medicineName.trim();
                let actualName = rawName.includes(' - ')
                    ? rawName.substring(0, rawName.lastIndexOf(' - ')).trim()
                    : rawName;
                // Normalize both sides to avoid casing/spacing mismatches
                actualName = actualName.toLowerCase().trim();

                const escapedName = actualName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const invQuery = { name: { $regex: new RegExp(`^${escapedName}$`, 'i') } };
                if (req.user.hospitalId) invQuery.hospitalId = req.user.hospitalId;
                let invItem = await Inventory.findOne(invQuery);

                // Fallback: partial match if exact fails
                if (!invItem) {
                    const fallbackQuery = { name: { $regex: escapedName, $options: 'i' } };
                    if (req.user.hospitalId) fallbackQuery.hospitalId = req.user.hospitalId;
                    invItem = await Inventory.findOne(fallbackQuery);
                }

                if (!invItem) {
                    console.warn(`[Inventory] No match for medicine: "${item.medicineName}" (normalized: "${actualName}")`);
                }

                if (invItem) {
                    item.price = invItem.sellingPrice || 0;
                    totalAmount += invItem.sellingPrice || 0;
                    // Decrement stock
                    if (invItem.stock > 0) {
                        invItem.stock = Math.max(0, invItem.stock - 1);
                        await invItem.save();
                    }
                }
            }
        }
        order.markModified('items');
        order.totalAmount = totalAmount;

        // Only mark Paid if at least one item was dispensed; otherwise keep Pending
        order.paymentStatus = totalAmount > 0 ? 'Paid' : 'Pending';
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