// server/src/routes/pharmacyOrders.routes.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const PharmacyOrder = require('../models/pharmacyOrder.model');
const PharmacyReturn = require('../models/pharmacyReturn.model');
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
            .populate('userId', 'name phone email mrn')
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

// Search Bills
router.get('/search-bill', verifyToken, async (req, res) => {
    try {
        const { query } = req.query;
        if (!query) return res.status(400).json({ success: false, message: "Search query required" });

        let hospitalFilter = {};
        if (req.user.hospitalId) hospitalFilter.hospitalId = req.user.hospitalId;

        // Try to find users matching mrn, name, or phone
        const users = await User.find({
            $or: [
                { mrn: { $regex: query, $options: 'i' } },
                { name: { $regex: query, $options: 'i' } },
                { phone: { $regex: query, $options: 'i' } },
                { patientId: { $regex: query, $options: 'i' } }
            ]
        }).select('_id patientId');

        const userIds = users.map(u => u._id);
        const patientIds = users.map(u => u.patientId).filter(Boolean);

        // Find orders matching invoice ID or the found userIds/patientIds
        let orderQuery = {
            ...hospitalFilter,
            $or: [
                { userId: { $in: userIds } },
                { patientId: { $in: patientIds } }
            ]
        };

        // If query might be an object ID, add it to $or
        if (mongoose.Types.ObjectId.isValid(query)) {
            orderQuery.$or.push({ _id: query });
        }

        const orders = await PharmacyOrder.find(orderQuery)
            .populate('userId', 'name phone mrn')
            .populate('doctorId', 'name')
            .sort({ createdAt: -1 })
            .limit(20);

        res.json({ success: true, orders });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Process Return/Exchange
router.post('/process-return', verifyToken, async (req, res) => {
    try {
        const { originalOrderId, returnType, returnedItems, exchangedItems, netAmount, returnReason, refundAmount } = req.body;

        let hospitalFilter = {};
        if (req.user.hospitalId) hospitalFilter.hospitalId = req.user.hospitalId;

        const order = await PharmacyOrder.findOne({ _id: originalOrderId, ...hospitalFilter });
        if (!order) return res.status(404).json({ success: false, message: "Order not found" });

        // Process returned items (add back to inventory)
        for (const item of returnedItems) {
            if (item.quantity > 0) {
                // Find inventory item — use safe char-by-char regex escape (matches /complete route)
                const actualName = (item.medicineName || '').split(' - ')[0].trim().toLowerCase();
                let escapedName = "";
                for (let i = 0; i < actualName.length; i++) {
                    const char = actualName[i];
                    if (['.', '*', '+', '?', '^', '$', '{', '}', '(', ')', '|', '[', ']', '\\'].includes(char)) {
                        escapedName += '\\' + char;
                    } else {
                        escapedName += char;
                    }
                }
                let invQuery = { name: { $regex: new RegExp(`^${escapedName}$`, 'i') }, ...hospitalFilter };
                let invItem = await Inventory.findOne(invQuery);

                if (!invItem) {
                    invItem = await Inventory.findOne({ name: { $regex: escapedName, $options: 'i' }, ...hospitalFilter });
                }

                if (invItem) {
                    invItem.stock += Number(item.quantity);
                    await invItem.save();
                }
            }
        }

        // Process exchanged items (deduct from inventory)
        if (returnType === 'Exchange' && exchangedItems && exchangedItems.length > 0) {
            for (const item of exchangedItems) {
                if (item.quantity > 0 && item.medicineId) {
                    let invItem = await Inventory.findOne({ _id: item.medicineId, ...hospitalFilter });
                    if (invItem) {
                        invItem.stock = Math.max(0, invItem.stock - Number(item.quantity));
                        await invItem.save();
                    }
                }
            }
        }

        // Create Pharmacy Return Record
        const pharmacyReturn = new PharmacyReturn({
            originalOrderId,
            patientId: order.patientId,
            userId: order.userId,
            hospitalId: order.hospitalId,
            pharmacyId: req.user.id,
            returnType,
            returnedItems,
            exchangedItems: returnType === 'Exchange' ? exchangedItems : [],
            netAmount,
            returnReason: returnReason || '',
            refundAmount: refundAmount || 0
        });

        await pharmacyReturn.save();

        // Update original order's returnStatus
        const totalOrderItems = order.items.filter(i => i.purchased).length;
        const totalReturnedItems = returnedItems.length;
        order.returnStatus = totalReturnedItems >= totalOrderItems ? 'FULLY_RETURNED' : 'PARTIALLY_RETURNED';
        await order.save();

        res.json({ success: true, message: `Successfully processed ${returnType}`, data: pharmacyReturn });
    } catch (error) {
        console.error('[Process Return Error]', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET dashboard summary
router.get('/dashboard-summary', verifyToken, async (req, res) => {
    try {
        let hospitalFilter = {};
        if (req.user.hospitalId) {
            try {
                hospitalFilter.hospitalId = new mongoose.Types.ObjectId(req.user.hospitalId);
            } catch (e) {
                hospitalFilter.hospitalId = req.user.hospitalId;
            }
        }

        // Fetch all orders for the dashboard
        const orders = await PharmacyOrder.find(hospitalFilter);

        let todayCollection = 0;
        let todayCash = 0;
        let todayOnline = 0;
        let overallCollection = 0;
        let overallCash = 0;
        let overallOnline = 0;
        let pendingCollection = 0;
        let doctorGuaranteedAmount = 0;

        const getISTDateString = (d) => new Date(d || Date.now()).toLocaleDateString("en-US", { timeZone: "Asia/Kolkata" });
        const todayIST = getISTDateString();

        orders.forEach(order => {
            let amount = parseFloat(order.totalAmount) || 0;

            // Fallback for orders where totalAmount is 0 (legacy orders)
            if (amount === 0 && order.items && order.items.length > 0) {
                let calcSubtotal = 0;
                let calcTax = 0;

                order.items.forEach(item => {
                    let qty = Number(item.quantity || item.qty || item.totalReqd || 0);
                    if (qty === 0) {
                        const itemDose = Number(item.dosePerAdmin || item.doseAdmin || item.dose || item.qtyPerDose || 1);
                        const itemDays = Number(item.days || item.duration || item.numberOfDays || 1);
                        const fStr = String(item.frequency || item.schedule || item.timing || item.sched || '').toUpperCase();

                        let freq = 1;
                        if (fStr.includes('TDS') || fStr.includes('3')) freq = 3;
                        else if (fStr.includes('BD') || fStr.includes('BID') || fStr.includes('2')) freq = 2;
                        else if (fStr.includes('QID') || fStr.includes('4')) freq = 4;

                        if (itemDose > 0 && itemDays > 0) {
                            qty = itemDose * freq * itemDays;
                        } else {
                            const rawName = String(item.medicineName || item.name || '').toLowerCase();
                            const isLiq = rawName.includes('injection') || rawName.includes('inj') || rawName.includes('syrup') || rawName.includes('ceftriaxone');
                            qty = isLiq ? 36 : 9;
                        }
                    }

                    let price = Number(item.sellingPrice || item.price || item.unitRate || 0);
                    const rawName = String(item.medicineName || item.name || '').toLowerCase();
                    const isLiquidOrInj = rawName.includes('injection') || rawName.includes('inj') || rawName.includes('syrup') || rawName.includes('ceftriaxone');

                    if (price === 0) {
                        price = isLiquidOrInj ? 120 : 15;
                    }
                    if (!isLiquidOrInj && price >= 120) {
                        price = 15;
                    }

                    let volumePerUnit = Number(item.volumePerUnit || item.packSize || item.capacity || 0);
                    let effectiveRate = price;
                    if (isLiquidOrInj) {
                        if (volumePerUnit === 0) volumePerUnit = 10;
                        effectiveRate = price / volumePerUnit;
                    }

                    const itemBase = qty * effectiveRate;
                    const gstPercent = Number(item.gst || item.gstPercent || 12);
                    const itemTax = itemBase * (gstPercent / 100);

                    calcSubtotal += itemBase;
                    calcTax += itemTax;
                });

                amount = calcSubtotal + calcTax;
            }

            const oStatus = (order.orderStatus || '').toLowerCase();
            const pStatus = (order.paymentStatus || '').toLowerCase();

            if (oStatus === 'completed') {
                if (pStatus === 'paid') {
                    overallCollection += amount;
                    const mode = (order.paymentMode || 'cash').toLowerCase();
                    if (mode === 'cash') overallCash += amount;
                    else overallOnline += amount;

                    // Fix: Use updatedAt instead of createdAt for accurate collection date and compare using local IST string to bypass UTC midnight drift on cloud servers
                    if (getISTDateString(order.updatedAt || order.createdAt) === todayIST) {
                        todayCollection += amount;
                        if (mode === 'cash') todayCash += amount;
                        else todayOnline += amount;
                    }
                } else if (pStatus === 'paid_by_doctor') {
                    pendingCollection += amount;
                    doctorGuaranteedAmount += amount;
                } else {
                    pendingCollection += amount;
                }
            } else if (oStatus === 'pending' || oStatus === 'upcoming') {
                // optionally include in pending if desired
            }
        });

        res.json({
            success: true,
            data: {
                todayCollection,
                todayCash,
                todayOnline,
                overallCollection,
                overallCash,
                overallOnline,
                pendingCollection,
                doctorGuaranteedAmount
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ─────────────────────────────────────────────
// COMPLETE AN ORDER — POST /api/pharmacy/orders/:id/complete
// ─────────────────────────────────────────────
router.patch('/:id/complete', verifyToken, async (req, res) => {
    try {
        console.log("\n🚀 [BACKEND CHECKOUT] Received req.body:", JSON.stringify(req.body, null, 2));
        const {
            purchasedIndices = [],
            updatedItems = [],
            paymentMode = 'CASH',
            paymentStatus = 'Paid',
            authorizedByDoctor = false,
            authorizedDoctorName = '',
            authorizationNote = '',
            discountPercent: reqDiscountPercent = 0,
            discountAmount: reqDiscountAmount = 0,
            frontendTotals = {}
        } = req.body || {};
        // HARD ISOLATION: Only allow completing orders from your hospital
        const findQuery = { _id: req.params.id };
        if (req.user.hospitalId) findQuery.hospitalId = req.user.hospitalId;
        const order = await PharmacyOrder.findOne(findQuery);
        if (!order) return res.status(404).json({ success: false, message: "Order not found or unauthorized" });

        // Validate order items array
        if (!order.items || !Array.isArray(order.items)) {
            return res.status(400).json({ success: false, message: "Order items are missing or invalid." });
        }

        // Apply updated quantities if provided
        if (updatedItems && Array.isArray(updatedItems)) {
            for (let i = 0; i < order.items.length; i++) {
                if (updatedItems[i]) {
                    const newQty = updatedItems[i].qty ?? updatedItems[i].quantity;
                    if (newQty !== undefined) {
                        order.items[i].quantity = Number(newQty);
                        order.items[i].qty = Number(newQty);
                        order.items[i].totalReqd = Number(newQty);
                    }
                }
            }
        }

        // Determine which items are purchased
        const purchasedSet = new Set(
            purchasedIndices && Array.isArray(purchasedIndices)
                ? purchasedIndices
                : order.items.map((_, i) => i) // default: all
        );

        const parseFrequency = (item) => {
            if (item.frequencyCount) return Number(item.frequencyCount);
            const freq = item.frequency;
            if (!freq) return 1;
            const str = freq.toString().toLowerCase();
            if (str.includes('4 times') || str.includes('qid') || str === '1-1-1-1' || str === '4') return 4;
            if (str.includes('3 times') || str.includes('tid') || str.includes('tds') || str === '1-1-1' || str === '3') return 3;
            if (str.includes('2 times') || str.includes('bid') || str.includes('bd') || str === '1-0-1' || str === '1-1-0' || str === '0-1-1' || str === '2') return 2;
            if (str.includes('1 time') || str.includes('od') || str === '1-0-0' || str === '0-1-0' || str === '0-0-1' || str === '1') return 1;
            return 1;
        };
        const parseDuration = (dur) => {
            if (!dur) return 1;
            const str = dur.toString().toLowerCase();
            const num = parseInt(str.match(/\d+/)?.[0] || '1');
            if (str.includes('week')) return num * 7;
            if (str.includes('month')) return num * 30;
            return num;
        };

        // Look up prices from inventory and decrement stock for purchased items
        let totalAmount = 0;
        let taxableAmount = 0;
        let cgstAmount = 0;
        let sgstAmount = 0;

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
                actualName = actualName.toLowerCase().trim();

                // FIX: manually escape regex chars without using replace() variables to avoid node string escaping bugs
                let escapedName = "";
                for (let i = 0; i < actualName.length; i++) {
                    const char = actualName[i];
                    if (['.', '*', '+', '?', '^', '$', '{', '}', '(', ')', '|', '[', ']', '\\'].includes(char)) {
                        escapedName += '\\' + char;
                    } else {
                        escapedName += char;
                    }
                }

                const invQuery = { name: { $regex: new RegExp(`^${escapedName}$`, 'i') } };
                if (req.user.hospitalId) invQuery.hospitalId = req.user.hospitalId;
                let invItem = await Inventory.findOne(invQuery);

                if (!invItem) {
                    const fallbackQuery = { name: { $regex: escapedName, $options: 'i' } };
                    if (req.user.hospitalId) fallbackQuery.hospitalId = req.user.hospitalId;
                    invItem = await Inventory.findOne(fallbackQuery);
                }

                if (!invItem) {
                    console.warn(`[Inventory] No match for medicine: "${item.medicineName}" (normalized: "${actualName}")`);
                }

                if (invItem) {
                    // Price Calculations - FIX LIQUID EXPLOSION
                    // We must calculate vials/packs correctly instead of just ML * Bottle Price.
                    let billedQty = 1;
                    let isProportional = false;
                    let unitPrice = invItem.sellingPrice || 0;

                    const parsedQty = parseFrequency(item) * parseDuration(item.duration || item.days || item.durationDays);

                    let doseAmount = Number(item.doseAmount || item.dose || 1);
                    if (item.volumeMl) {
                        const parsed = parseFloat(item.volumeMl);
                        if (!isNaN(parsed) && parsed > 0) doseAmount = parsed;
                    }

                    // Total ML or units required
                    const totalVolumeDeducted = doseAmount * parsedQty;

                    if (invItem.isMultiDose) {
                        if (invItem.billingType === 'PROPORTIONAL') {
                            unitPrice = (invItem.sellingPrice || 0) / (invItem.packVolume || 1);
                            billedQty = totalVolumeDeducted;
                            isProportional = true;
                        } else {
                            // If pack volume is missing, default to a realistic vial size (e.g., 10ml)
                            const packVol = invItem.packVolume || invItem.totalVialSize || 10;
                            billedQty = Math.ceil(totalVolumeDeducted / packVol);
                        }
                    } else {
                        // Standard units (tablets) or undefined multi-dose status
                        // Even if it's a liquid but NOT marked multiDose, we should use totalVolumeDeducted? 
                        // Wait, if it's NOT multi-dose, it usually means 1 unit = 1 tablet.
                        // However, if the doctor sent quantity explicitly, use it. Otherwise use parsedQty.
                        billedQty = (item.quantity && item.quantity > 0) ? item.quantity : parsedQty;

                        // IF the frontend sent inflated quantity for a liquid because the doctor's prescription 
                        // logic multiplied doseAmount * parsedQty into 'quantity', it explodes. 
                        // Let's cap/recalculate if it looks like a liquid explosion:
                        if (item.volumeMl && billedQty > 5 && doseAmount > 1 && !invItem.isMultiDose) {
                            // E.g. Ceftriaxone, volumeMl=2, billedQty=16, but packVolume is undefined.
                            // We assume a standard pack volume of 10 if it's a liquid that exploded.
                            const packVol = invItem.packVolume || invItem.totalVialSize || 10;
                            billedQty = Math.ceil(totalVolumeDeducted / packVol);
                        }
                    }

                    // Price Calculations
                    const itemTaxable = billedQty * unitPrice;
                    const totalGstPercent = (invItem.cgstPercent || 0) + (invItem.sgstPercent || 0);
                    const cgstPercent = totalGstPercent / 2;
                    const sgstPercent = totalGstPercent / 2;

                    const itemCgst = (itemTaxable * cgstPercent) / 100;
                    const itemSgst = (itemTaxable * sgstPercent) / 100;
                    const itemTotal = itemTaxable + itemCgst + itemSgst;

                    if (!frontendTotals) {
                        item.price = itemTaxable; // keeping price as taxable for legacy compatibility
                    }

                    taxableAmount += itemTaxable;
                    cgstAmount += itemCgst;
                    sgstAmount += itemSgst;
                    totalAmount += itemTotal;

                    // STOCK DEDUCTION MATH
                    if (invItem.isMultiDose) {
                        // Initialize openUnitVolume properly if it's currently 0 or corrupt but stock exists
                        if ((!invItem.openUnitVolume || invItem.openUnitVolume <= 0) && invItem.stock > 0) {
                            invItem.stock -= 1;
                            invItem.openUnitVolume = (invItem.packVolume || 1);
                        }

                        if (invItem.openUnitVolume > 0 || invItem.stock > 0) {
                            let remainingToDeduct = totalVolumeDeducted;
                            while (remainingToDeduct > 0) {
                                if (invItem.openUnitVolume >= remainingToDeduct) {
                                    invItem.openUnitVolume -= remainingToDeduct;
                                    remainingToDeduct = 0;
                                } else {
                                    remainingToDeduct -= invItem.openUnitVolume;
                                    invItem.openUnitVolume = 0;
                                    // Open a new bottle if available
                                    if (invItem.stock > 0) {
                                        invItem.stock -= 1;
                                        invItem.openUnitVolume = (invItem.packVolume || 1);
                                    } else {
                                        // No more stock left to open
                                        break;
                                    }
                                }
                            }
                        }
                        await invItem.save();
                    } else {
                        // Standard deduction
                        if (invItem.stock > 0) {
                            let qtyToDeduct = billedQty;
                            if (['Strip', 'Capsules', 'Tablets'].includes(invItem.unit)) {
                                qtyToDeduct = qtyToDeduct * (Number(invItem.unitsPerStrip) || 1);
                            }
                            invItem.stock = Math.max(0, invItem.stock - qtyToDeduct);
                            await invItem.save();
                        }
                    }
                }
            }
        }
        order.markModified('items');

        // Finalize pricing: Preserve frontend calculations to prevent liquid bill inflation
        order.discountAmount = Number(reqDiscountAmount) || 0;
        order.discountPercent = Number(reqDiscountPercent) || 0;
        
        const finalDiscount = order.discountAmount;

        if (frontendTotals && typeof frontendTotals === 'object') {
            order.taxableAmount = parseFloat(frontendTotals.taxableAmount) || taxableAmount;
            order.cgstAmount = parseFloat(frontendTotals.cgstAmount) || cgstAmount;
            order.sgstAmount = parseFloat(frontendTotals.sgstAmount) || sgstAmount;
            order.totalAmount = parseFloat(frontendTotals.totalAmount) || Math.max(0, totalAmount - finalDiscount);
        } else {
            order.taxableAmount = taxableAmount;
            order.cgstAmount = cgstAmount;
            order.sgstAmount = sgstAmount;
            order.totalAmount = Math.max(0, totalAmount - finalDiscount);
        }

        // Apply provided payment details or fallback
        if (paymentStatus) order.paymentStatus = paymentStatus;
        else order.paymentStatus = totalAmount > 0 ? 'Paid' : 'Pending';

        if (paymentMode) order.paymentMode = paymentMode;

        // Safely handle authorizedByDoctor to prevent CastError
        if (authorizedByDoctor && authorizedByDoctor !== 'undefined' && authorizedByDoctor !== 'null' && authorizedByDoctor.length === 24) {
            order.authorizedByDoctor = authorizedByDoctor;
        } else {
            order.authorizedByDoctor = undefined;
        }

        if (authorizedDoctorName) order.authorizedDoctorName = authorizedDoctorName;
        if (authorizationNote) order.authorizationNote = authorizationNote;

        order.orderStatus = 'Completed';

        console.log("🚀 [BACKEND CHECKOUT] Order Object right before save():", JSON.stringify(order, null, 2));
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
        console.error("🔥 [Pharmacy Order Complete Error]:", error);
        res.status(500).json({ success: false, message: error.message || 'An internal error occurred during checkout' });
    }
});

// Create Walk-in / Outside Patient Bill
router.post('/outside-patient-bill', verifyToken, async (req, res) => {
    try {
        const { patientName, patientPhone, doctorName, items, totalAmount, taxableAmount, cgstAmount, sgstAmount, discountAmount, paymentMode } = req.body;
        
        let hospitalId = req.user.hospitalId || req.body.hospitalId;

        // Validation
        if (!patientName || !items || items.length === 0) {
            return res.status(400).json({ success: false, message: 'Patient name and items are required' });
        }

        // Deduct inventory
        for (const item of items) {
            const invItem = await Inventory.findById(item.inventoryId);
            if (invItem) {
                // simple deduction for walk-in
                let qtyToDeduct = Number(item.quantity) || 1;
                if (['Strip', 'Capsules', 'Tablets'].includes(invItem.unit)) {
                    qtyToDeduct = qtyToDeduct * (Number(invItem.unitsPerStrip) || 1);
                }
                invItem.stock = Math.max(0, (invItem.stock || 0) - qtyToDeduct);
                await invItem.save();
            }
        }

        // Create the order
        const newOrder = new PharmacyOrder({
            isOutsidePatient: true,
            patientName,
            patientPhone: patientPhone || '',
            doctorName: doctorName || '',
            items,
            totalAmount,
            taxableAmount,
            cgstAmount,
            sgstAmount,
            discountAmount: discountAmount || 0,
            paymentStatus: 'Paid', // Assuming Walk-in bills are paid immediately over the counter
            paymentMode: paymentMode || 'CASH',
            orderStatus: 'Completed',
            hospitalId
        });

        await newOrder.save();

        res.status(201).json({ success: true, message: 'Walk-in bill generated successfully', order: newOrder });

    } catch (error) {
        console.error('[Walk-in Bill Error]', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
