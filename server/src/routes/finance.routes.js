const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { verifyToken } = require('../middleware/auth.middleware');

const Appointment = require('../models/appointment.model');
const LabReport = require('../models/labReport.model');
const PharmacyOrder = require('../models/pharmacyOrder.model');
const Inventory = require('../models/inventory.model');

// Middleware to check if user has access to finance data
const verifyFinanceAccess = async (req, res, next) => {
    try {
        await verifyToken(req, res, () => {
            const role = req.user.role ? req.user.role.toLowerCase() : '';
            if (['accountant', 'centraladmin', 'superadmin', 'hospitaladmin'].includes(role)) {
                return next();
            }
            return res.status(403).json({ success: false, message: 'Finance access required' });
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// GET Financial Dashboard Analytics
router.get('/dashboard', verifyFinanceAccess, async (req, res) => {
    try {
        const { startDate, endDate, hospitalId } = req.query;

        // Determine target hospital ID
        let targetHospitalId = hospitalId;
        const role = req.user.role ? req.user.role.toLowerCase() : '';

        // If user is not superadmin/centraladmin, scope strictly to their hospital
        if (role !== 'superadmin' && role !== 'centraladmin') {
            if (req.user.hospitalId) {
                targetHospitalId = req.user.hospitalId.toString();
            } else {
                // If they are not an admin and have NO hospitalId, they should see ZERO data
                // They should NOT fall back to seeing global data.
                return res.json({
                    success: true,
                    data: {
                        totalRevenue: 0, totalProfit: 0,
                        consultations: { count: 0, revenue: 0 },
                        labTests: { count: 0, revenue: 0 },
                        medicines: { count: 0, revenue: 0, cost: 0, profit: 0 }
                    }
                });
            }
        }

        // Date filters
        let dateFilter = {};
        if (startDate || endDate) {
            dateFilter.createdAt = {};
            if (startDate) dateFilter.createdAt.$gte = new Date(startDate);
            if (endDate) dateFilter.createdAt.$lte = new Date(endDate);
        }

        let appointmentDateFilter = {};
        if (startDate || endDate) {
            appointmentDateFilter.appointmentDate = {};
            if (startDate) appointmentDateFilter.appointmentDate.$gte = new Date(startDate);
            if (endDate) appointmentDateFilter.appointmentDate.$lte = new Date(endDate);
        }

        // HARD ISOLATION: Direct hospitalId filter — no doctor lookup needed
        let hospitalFilter = {};
        if (targetHospitalId) {
            hospitalFilter = { hospitalId: targetHospitalId };
        }

        // 1. Consultations Revenue
        const consultations = await Appointment.find({
            paymentStatus: { $in: ['paid', 'Paid', 'PAID'] },
            ...appointmentDateFilter,
            ...hospitalFilter
        });
        const totalConsultationRevenue = consultations.reduce((acc, curr) => acc + (curr.amount || 0), 0);

        // 2. Lab Tests Revenue
        const labReports = await LabReport.find({
            paymentStatus: { $in: ['PAID', 'paid', 'Paid'] },
            ...dateFilter,
            ...hospitalFilter
        });
        const totalLabRevenue = labReports.reduce((acc, curr) => acc + (curr.amount || 0), 0);

        // 3. Medicines Revenue & Cost
        const pharmacyOrders = await PharmacyOrder.find({
            paymentStatus: { $in: ['Paid', 'paid', 'PAID'] },
            ...dateFilter,
            ...hospitalFilter
        });

        let totalMedicineRevenue = 0;
        let totalMedicineCost = 0;

        // Aggregate totals stored in order if any, or fall back to calculating via inventory mapping
        for (const order of pharmacyOrders) {
            if (order.totalAmount > 0 || order.totalCost > 0) {
                totalMedicineRevenue += order.totalAmount || 0;
                totalMedicineCost += order.totalCost || 0;
            } else {
                // If the order has items but no saved amount/cost, estimate it now using Inventory
                for (const item of order.items) {
                    const invItem = await Inventory.findOne({ name: new RegExp('^' + item.medicineName + '$', 'i') });
                    if (invItem) {
                        const qty = 1; // Simplistic approximation if quantity isn't cleanly stored
                        totalMedicineRevenue += (invItem.sellingPrice || 0) * qty;
                        totalMedicineCost += (invItem.buyingPrice || 0) * qty;
                    }
                }
            }
        }

        const totalMedicineProfit = totalMedicineRevenue - totalMedicineCost;

        // 4. Overall Totals
        const totalRevenue = totalConsultationRevenue + totalLabRevenue + totalMedicineRevenue;
        const totalProfit = totalConsultationRevenue + totalLabRevenue + totalMedicineProfit;

        res.json({
            success: true,
            data: {
                totalRevenue,
                totalProfit,
                consultations: {
                    count: consultations.length,
                    revenue: totalConsultationRevenue
                },
                labTests: {
                    count: labReports.length,
                    revenue: totalLabRevenue
                },
                medicines: {
                    count: pharmacyOrders.length,
                    revenue: totalMedicineRevenue,
                    cost: totalMedicineCost,
                    profit: totalMedicineProfit
                }
            }
        });

    } catch (error) {
        console.error('Finance Analytics Error:', error);
        res.status(500).json({ success: false, message: 'Server Error fetching finance data' });
    }
});

module.exports = router;
