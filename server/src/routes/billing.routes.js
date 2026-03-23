const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth.middleware');
const { resolveTenant } = require('../middleware/tenantMiddleware');
const { getTenantModels } = require('../db/tenantModels');

// Master fallbacks
const MasterUser = require('../models/user.model');
const MasterAppointment = require('../models/appointment.model');
const MasterLabReport = require('../models/labReport.model');
const MasterPharmacyOrder = require('../models/pharmacyOrder.model');
const MasterFacilityCharge = require('../models/facilityCharge.model');

// Billing access middleware
const verifyBillingAccess = async (req, res, next) => {
    try {
        await verifyToken(req, res, async () => {
            const roleIdStr = String(req.user.role || '').toLowerCase();
            const roleData = req.user._roleData;
            const roleName = (roleData?.name || '').toLowerCase();
            const perms = roleData?.permissions || [];

            if (['cashier', 'accountant', 'centraladmin', 'superadmin', 'hospitaladmin'].includes(roleIdStr) ||
                ['cashier', 'accountant', 'centraladmin', 'superadmin', 'hospitaladmin'].includes(roleName) ||
                perms.includes('billing_view') || perms.includes('billing_manage') || perms.includes('*')) {
                // Resolve tenant DB after auth
                await resolveTenant(req, res, next);
            } else {
                return res.status(403).json({ success: false, message: 'Billing access required' });
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// Helper: get models scoped to tenant or master
const getModels = (req) => {
    if (req.tenantDb) return getTenantModels(req.tenantDb);
    return {
        User: MasterUser,
        Appointment: MasterAppointment,
        LabReport: MasterLabReport,
        PharmacyOrder: MasterPharmacyOrder,
        FacilityCharge: MasterFacilityCharge,
    };
};

// 1. Search Patient & Fetch Pending Bills — tenant-scoped
router.get('/patient/:identifier', verifyBillingAccess, async (req, res) => {
    try {
        const { identifier } = req.params;
        const { User, Appointment, LabReport, PharmacyOrder, FacilityCharge } = getModels(req);

        // Find patient by MRN, patientId, or phone — within this hospital's tenant DB
        const patient = await User.findOne({
            $or: [{ mrn: identifier }, { patientId: identifier }, { phone: identifier }]
        });

        if (!patient) return res.status(404).json({ success: false, message: 'Patient not found' });

        const pendingStatuses = ['pending', 'Pending', 'PENDING', 'Unpaid'];

        const [appointments, labReports, pharmacyOrders, facilityCharges] = await Promise.all([
            Appointment.find({ patientId: patient._id, paymentStatus: { $in: pendingStatuses } })
                .select('appointmentDate amount paymentStatus serviceName doctorName').lean(),
            LabReport.find({ patientId: patient._id, paymentStatus: { $in: pendingStatuses } })
                .select('tests amount paymentStatus status createdAt').lean(),
            PharmacyOrder.find({ patientId: patient._id, paymentStatus: { $in: pendingStatuses } })
                .select('items totalAmount paymentStatus createdAt').lean(),
            FacilityCharge.find({ patientId: patient._id, paymentStatus: { $in: pendingStatuses } })
                .select('facilityName pricePerDay daysUsed totalAmount paymentStatus createdAt').lean(),
        ]);

        res.json({
            success: true,
            patient: { _id: patient._id, name: patient.name, mrn: patient.mrn, patientId: patient.patientId, phone: patient.phone },
            billing: { appointments, labReports, pharmacyOrders, facilityCharges }
        });

    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// 2. Add Facility Charge — saves to tenant DB
router.post('/facility-charge', verifyBillingAccess, async (req, res) => {
    try {
        const { patientId, facilityName, pricePerDay, days } = req.body;
        if (!patientId || !facilityName || !pricePerDay || !days) {
            return res.status(400).json({ success: false, message: 'All fields are required' });
        }

        const { FacilityCharge } = getModels(req);
        const charge = new FacilityCharge({
            hospitalId: req.hospitalId || req.user.hospitalId,
            patientId,
            facilityName,
            pricePerDay: Number(pricePerDay),
            daysUsed: Number(days),
            totalAmount: Number(pricePerDay) * Number(days),
            addedBy: req.user._id || req.user.userId
        });

        await charge.save();
        res.status(201).json({ success: true, message: 'Facility charge added', charge });

    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// 3. Mark items as paid — updates tenant DB
router.put('/pay', verifyBillingAccess, async (req, res) => {
    try {
        const { appointmentIds = [], labReportIds = [], pharmacyOrderIds = [], facilityChargeIds = [], paymentMode = 'Cash' } = req.body;
        const { Appointment, LabReport, PharmacyOrder, FacilityCharge } = getModels(req);

        await Promise.all([
            appointmentIds.length > 0 && Appointment.updateMany(
                { _id: { $in: appointmentIds } }, { $set: { paymentStatus: 'Paid', paymentMode } }),
            labReportIds.length > 0 && LabReport.updateMany(
                { _id: { $in: labReportIds } }, { $set: { paymentStatus: 'Paid', paymentMode } }),
            pharmacyOrderIds.length > 0 && PharmacyOrder.updateMany(
                { _id: { $in: pharmacyOrderIds } }, { $set: { paymentStatus: 'Paid', paymentMode } }),
            facilityChargeIds.length > 0 && FacilityCharge.updateMany(
                { _id: { $in: facilityChargeIds } }, { $set: { paymentStatus: 'Paid' } }),
        ].filter(Boolean));

        res.json({ success: true, message: 'Billing settled successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
