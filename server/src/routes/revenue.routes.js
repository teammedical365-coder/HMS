const express = require('express');
const router = express.Router();
const Hospital = require('../models/hospital.model');
const ClinicSubscription = require('../models/clinicSubscription.model');
const { verifyToken } = require('../middleware/auth.middleware');

const verifyCentralAdmin = async (req, res, next) => {
    try {
        await verifyToken(req, res, () => {
            const role = req.user.role;
            if (role === 'centraladmin' || role === 'superadmin') return next();
            return res.status(403).json({ success: false, message: 'Central Admin access required' });
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// ─────────────────────────────────────────────────────────
// GET /api/revenue/system
// System-wide revenue analytics for central admin
// ─────────────────────────────────────────────────────────
router.get('/system', verifyCentralAdmin, async (req, res) => {
    try {
        const now = new Date();
        const currentMonth = now.getMonth() + 1;
        const currentYear = now.getFullYear();

        // All hospitals/clinics
        const hospitals = await Hospital.find({ isActive: true })
            .select('name clinicType revenueModel revenueConfig subscription createdAt')
            .lean();

        // Group by revenue model
        const byModel = { per_patient: [], fixed_monthly: [], per_login: [] };
        for (const h of hospitals) {
            const m = h.revenueModel || 'per_patient';
            if (!byModel[m]) byModel[m] = [];
            byModel[m].push(h);
        }

        // ── Current month revenue per model ──────────────────────────────────

        // Model B — per_patient: sum ClinicSubscription totalAmount
        const perPatientIds = byModel.per_patient.map(h => h._id);
        const currentSubs = await ClinicSubscription.find({
            clinicId: { $in: perPatientIds },
            month: currentMonth,
            year: currentYear,
        }).lean();
        const perPatientRevenue = currentSubs.reduce((s, x) => s + (x.totalAmount || 0), 0);

        // Model A — fixed_monthly: sum of monthlyFee for all active entities
        const fixedMonthlyRevenue = byModel.fixed_monthly.reduce(
            (s, h) => s + (h.revenueConfig?.monthlyFee || 0), 0
        );

        // Model C — per_login: future (always 0 for now)
        const perLoginRevenue = 0;

        const totalCurrentMonth = perPatientRevenue + fixedMonthlyRevenue + perLoginRevenue;

        // ── Last 12 months breakdown ─────────────────────────────────────────
        const monthlyBreakdown = [];
        for (let i = 11; i >= 0; i--) {
            const d = new Date(currentYear, currentMonth - 1 - i, 1);
            const m = d.getMonth() + 1;
            const y = d.getFullYear();

            const subs = await ClinicSubscription.find({ month: m, year: y }).lean();
            const ppAmt = subs.reduce((s, x) => s + (x.totalAmount || 0), 0);
            const fmAmt = fixedMonthlyRevenue; // same monthly fee each month

            monthlyBreakdown.push({
                month: m,
                year: y,
                label: d.toLocaleString('default', { month: 'short' }) + ' ' + String(y).slice(2),
                perPatient: ppAmt,
                fixedMonthly: fmAmt,
                perLogin: 0,
                total: ppAmt + fmAmt,
            });
        }

        // ── Quarterly summary (last 4 quarters) ──────────────────────────────
        const quarterlyBreakdown = [];
        for (let q = 3; q >= 0; q--) {
            // Each quarter = 3 consecutive months ending at (currentMonth - q*3)
            const endMonthOffset = -q * 3;
            const endDate = new Date(currentYear, currentMonth - 1 + endMonthOffset, 1);
            const quarterLabel = `Q${Math.ceil((endDate.getMonth() + 1) / 3)} ${endDate.getFullYear()}`;

            let qTotal = 0;
            for (let mOff = 2; mOff >= 0; mOff--) {
                const md = new Date(endDate.getFullYear(), endDate.getMonth() - mOff, 1);
                const mm = md.getMonth() + 1;
                const yy = md.getFullYear();
                const subs = await ClinicSubscription.find({ month: mm, year: yy }).lean();
                qTotal += subs.reduce((s, x) => s + (x.totalAmount || 0), 0);
                qTotal += fixedMonthlyRevenue;
            }
            quarterlyBreakdown.push({ label: quarterLabel, total: qTotal });
        }

        // ── Hospital list with computed charges ───────────────────────────────
        const hospitalDetails = hospitals.map(h => {
            const model = h.revenueModel || 'per_patient';
            let currentCharge = 0;
            let rateLabel = '';

            if (model === 'per_patient') {
                const sub = currentSubs.find(s => String(s.clinicId) === String(h._id));
                currentCharge = sub?.totalAmount || 0;
                rateLabel = `₹${h.subscription?.ratePerPatient || 0}/patient`;
            } else if (model === 'fixed_monthly') {
                currentCharge = h.revenueConfig?.monthlyFee || 0;
                rateLabel = `₹${h.revenueConfig?.monthlyFee || 0}/month`;
            } else if (model === 'per_login') {
                currentCharge = 0;
                rateLabel = `₹${h.revenueConfig?.ratePerLogin || 0}/login`;
            }

            return {
                _id: h._id,
                name: h.name,
                clinicType: h.clinicType,
                revenueModel: model,
                rateLabel,
                currentCharge,
                ratePerPatient: h.subscription?.ratePerPatient || 0,
                monthlyFee: h.revenueConfig?.monthlyFee || 0,
                ratePerLogin: h.revenueConfig?.ratePerLogin || 0,
                billingCycle: h.revenueConfig?.billingCycle || 'monthly',
                createdAt: h.createdAt,
            };
        });

        res.json({
            success: true,
            summary: {
                totalEntities: hospitals.length,
                totalCurrentMonthRevenue: totalCurrentMonth,
                perPatient: {
                    count: byModel.per_patient.length,
                    currentMonthRevenue: perPatientRevenue,
                    label: 'Model B — Per Patient',
                },
                fixedMonthly: {
                    count: byModel.fixed_monthly.length,
                    currentMonthRevenue: fixedMonthlyRevenue,
                    label: 'Model A — Fixed Monthly',
                },
                perLogin: {
                    count: byModel.per_login.length,
                    currentMonthRevenue: perLoginRevenue,
                    label: 'Model C — Per Login',
                },
            },
            monthlyBreakdown,
            quarterlyBreakdown,
            hospitals: hospitalDetails,
        });
    } catch (err) {
        console.error('Revenue system analytics error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─────────────────────────────────────────────────────────
// PUT /api/revenue/hospital/:id
// Set revenue model + config for a hospital/clinic
// ─────────────────────────────────────────────────────────
router.put('/hospital/:id', verifyCentralAdmin, async (req, res) => {
    try {
        const { revenueModel, ratePerPatient, monthlyFee, ratePerLogin, billingCycle } = req.body;

        const update = {};
        if (revenueModel) update.revenueModel = revenueModel;
        if (monthlyFee !== undefined) update['revenueConfig.monthlyFee'] = Number(monthlyFee) || 0;
        if (ratePerLogin !== undefined) update['revenueConfig.ratePerLogin'] = Number(ratePerLogin) || 0;
        if (billingCycle) update['revenueConfig.billingCycle'] = billingCycle;

        // Per-patient rate lives in subscription (existing field)
        if (ratePerPatient !== undefined) {
            update['subscription.ratePerPatient'] = Number(ratePerPatient) || 0;
        }
        // Enable billing whenever a model is set
        if (revenueModel) {
            update['subscription.billingEnabled'] = true;
        }

        const hospital = await Hospital.findByIdAndUpdate(
            req.params.id,
            { $set: update },
            { new: true }
        );
        if (!hospital) return res.status(404).json({ success: false, message: 'Hospital not found' });

        res.json({ success: true, hospital });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─────────────────────────────────────────────────────────
// GET /api/revenue/hospitals
// All hospitals/clinics with their revenue config (lightweight)
// ─────────────────────────────────────────────────────────
router.get('/hospitals', verifyCentralAdmin, async (req, res) => {
    try {
        const hospitals = await Hospital.find({ isActive: true })
            .select('name clinicType revenueModel revenueConfig subscription')
            .lean();
        res.json({ success: true, hospitals });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
