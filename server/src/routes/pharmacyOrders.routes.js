// server/src/routes/pharmacyOrders.routes.js
const express = require('express');
const router = express.Router();
const PharmacyOrder = require('../models/pharmacyOrder.model');
const Inventory = require('../models/inventory.model');
const { verifyToken } = require('../middleware/auth.middleware');

const User = require('../models/user.model');

// Helper to dynamically resolve prices for old pending orders
const resolveMissingPrices = async (orders, req) => {
    return await Promise.all(orders.map(async (order) => {
        let orderObj = order.toObject ? order.toObject() : order;
        orderObj.items = await Promise.all((orderObj.items || []).map(async (item) => {
            if (!item.price || item.price === 0) {
                let actualName = item.medicineName.trim();
                actualName = actualName.includes(' - ') ? actualName.substring(0, actualName.lastIndexOf(' - ')).trim() : actualName;
                actualName = actualName.toLowerCase().trim();
                const flexNamePattern = actualName.replace(/\s+/g, '\\s*');
                
                const invQuery = { name: { $regex: new RegExp(`^${flexNamePattern}$`, 'i') } };
                const hospitalToUse = orderObj.hospitalId || req.user.hospitalId;
                if (hospitalToUse) invQuery.hospitalId = hospitalToUse;
                
                let invItem = await Inventory.findOne(invQuery);
                if (!invItem) {
                    const fallbackQuery = { name: { $regex: new RegExp(flexNamePattern, 'i') } };
                    if (hospitalToUse) fallbackQuery.hospitalId = hospitalToUse;
                    invItem = await Inventory.findOne(fallbackQuery);
                }
                
                if (invItem) {
                    const s2b = invItem.unitConfig?.saleToBaseMultiplier || 1;
                    const sp = invItem.pricingConfig?.sellingPrice || invItem.sellingPrice || 0;
                    item.price = sp / s2b;
                }
            }
            return item;
        }));
        return orderObj;
    }));
};

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
            
        const resolvedOrders = await resolveMissingPrices(orders, req);
        res.json({ success: true, orders: resolvedOrders });
    } catch (error) {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// GET orders for the currently logged-in patient (User role)
router.get('/my-orders', verifyToken, async (req, res) => {
    try {
        const orders = await PharmacyOrder.find({ userId: req.user.userId })
            .populate('doctorId', 'name')
            .sort({ createdAt: -1 });
            
        const resolvedOrders = await resolveMissingPrices(orders, req);
        res.json({ success: true, orders: resolvedOrders });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error fetching your orders' });
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

                const flexNamePattern = actualName.replace(/\s+/g, '\\s*');
                const invQuery = { name: { $regex: new RegExp(`^${flexNamePattern}$`, 'i') } };
                if (req.user.hospitalId) invQuery.hospitalId = req.user.hospitalId;
                let invItem = await Inventory.findOne(invQuery);

                // Fallback: partial match if exact fails
                if (!invItem) {
                    const fallbackQuery = { name: { $regex: new RegExp(flexNamePattern, 'i') } };
                    if (req.user.hospitalId) fallbackQuery.hospitalId = req.user.hospitalId;
                    invItem = await Inventory.findOne(fallbackQuery);
                }

                if (!invItem) {
                    console.warn(`[Inventory] No match for medicine: "${item.medicineName}" (normalized: "${actualName}")`);
                }

                if (invItem) {
                    const freqStr = (item.frequency || '').toLowerCase();
                    let dailyMultiplier = 1;
                    if (freqStr.includes('bd') || freqStr.includes('twice')) dailyMultiplier = 2;
                    else if (freqStr.includes('tds') || freqStr.includes('three')) dailyMultiplier = 3;
                    else if (freqStr.includes('qid') || freqStr.includes('four')) dailyMultiplier = 4;
                    
                    const days = parseInt(item.duration) || parseInt(item.days) || 1;
                    const qty = dailyMultiplier * days;

                    const s2b = invItem.unitConfig?.saleToBaseMultiplier || 1;
                    const sp = invItem.pricingConfig?.sellingPrice || invItem.sellingPrice || 0;
                    const baseUnitPrice = sp / s2b;
                    // Note: Here we are keeping the previous logic of setting item.price to the itemTotal 
                    // for dispensed items. However, since we updated the frontend to expect Base Unit Price
                    // we MUST change this to item.price = baseUnitPrice, and totalAmount += baseUnitPrice * qty
                    const itemTotal = baseUnitPrice * qty;

                    item.price = baseUnitPrice; // Provide base price to frontend for clean item parsing
                    totalAmount += itemTotal;
                    
                    // Decrement stock
                    if (invItem.stock > 0) {
                        invItem.stock = Math.max(0, invItem.stock - qty);
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
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

module.exports = router;