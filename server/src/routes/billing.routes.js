const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth.middleware');
const { resolveTenant } = require('../middleware/tenantMiddleware');
const { getTenantModels } = require('../db/tenantModels');
const auditLog = require('../middleware/audit.middleware');

// Master fallbacks
const MasterUser = require('../models/user.model');
const MasterAppointment = require('../models/appointment.model');
const MasterLabReport = require('../models/labReport.model');
const MasterPharmacyOrder = require('../models/pharmacyOrder.model');
const MasterFacilityCharge = require('../models/facilityCharge.model');
const MasterAdmission = require('../models/admission.model');
const MasterPaymentTransaction = require('../models/paymentTransaction.model');

// Billing access middleware — receptionist also gets billing view
const verifyBillingAccess = async (req, res, next) => {
    try {
        await verifyToken(req, res, async () => {
            const roleIdStr = String(req.user.role || '').toLowerCase();
            const roleData = req.user._roleData;
            const roleName = (roleData?.name || '').toLowerCase();
            const perms = roleData?.permissions || [];

            if (['cashier', 'accountant', 'reception', 'receptionist', 'centraladmin', 'superadmin', 'hospitaladmin'].includes(roleIdStr) ||
                ['cashier', 'accountant', 'reception', 'receptionist', 'centraladmin', 'superadmin', 'hospitaladmin'].includes(roleName) ||
                perms.includes('billing_view') || perms.includes('billing_manage') ||
                perms.includes('appointment_manage') || perms.includes('*')) {
                await resolveTenant(req, res, next);
            } else {
                return res.status(403).json({ success: false, message: 'Billing access required' });
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
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
        Admission: MasterAdmission,
        PaymentTransaction: MasterPaymentTransaction,
    };
};

// 1. Search Patient & Fetch All Bills (pending + paid summary) — tenant-scoped
router.get('/patient/:identifier', verifyBillingAccess, async (req, res) => {
    try {
        const identifier = (req.params.identifier || '').trim();
        const { User, Appointment, LabReport, PharmacyOrder, FacilityCharge, Admission, PaymentTransaction } = getModels(req);

        // Scope patient lookup flexibly to requesting user's hospital or legacy records without hospitalId
        const hospitalFilter = req.user.hospitalId ? {
            $or: [
                { hospitalId: req.user.hospitalId },
                { hospitalId: { $exists: false } },
                { hospitalId: null }
            ]
        } : {};

        // Find patient by MRN, patientId, phone, or name (case-insensitive regex)
        const isObjectId = identifier.length === 24 && /^[0-9a-fA-F]{24}$/.test(identifier);
        const safeRegex = new RegExp(identifier.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&'), 'i');
        const searchQuery = isObjectId ? { _id: identifier } : {
            $and: [
                hospitalFilter,
                {
                    $or: [
                        { mrn: safeRegex },
                        { patientId: safeRegex },
                        { phone: safeRegex },
                        { name: safeRegex }
                    ]
                }
            ]
        };

        let patient = await User.findOne(searchQuery);
        if (!patient && User !== MasterUser) {
            patient = await MasterUser.findOne(searchQuery);
        }
        if (!patient) return res.status(404).json({ success: false, message: 'Patient not found' });

        const hFilter = req.user.hospitalId ? {
            $or: [
                { hospitalId: req.user.hospitalId },
                { hospitalId: { $exists: false } },
                { hospitalId: null }
            ]
        } : {};

        const fetchWithMasterFallback = async (Model, MasterModel, query, selectFields, sortFields = null, populateArgs = null) => {
            let q1 = sortFields ? Model.find(query).sort(sortFields) : Model.find(query).select(selectFields);
            if (populateArgs) q1 = q1.populate(populateArgs);
            let results = await q1.lean();
            if (Model !== MasterModel) {
                let q2 = sortFields ? MasterModel.find(query).sort(sortFields) : MasterModel.find(query).select(selectFields);
                if (populateArgs) q2 = q2.populate(populateArgs);
                const masterResults = await q2.lean();
                const seen = new Set(results.map(r => r._id.toString()));
                for (const mr of masterResults) {
                    if (!seen.has(mr._id.toString())) results.push(mr);
                }
            }
            return results;
        };

        const [appointments, labReports, pharmacyOrders, facilityCharges, admissions, paymentTransactions] = await Promise.all([
            fetchWithMasterFallback(Appointment, MasterAppointment, { userId: patient._id, ...hFilter }, 'appointmentDate appointmentTime amount paymentStatus serviceName doctorName status createdAt'),
            fetchWithMasterFallback(LabReport, MasterLabReport, { userId: patient._id, ...hFilter }, 'testNames amount paymentStatus testStatus createdAt'),
            fetchWithMasterFallback(PharmacyOrder, MasterPharmacyOrder, { userId: patient._id, ...hFilter }, 'items totalAmount paymentStatus orderStatus createdAt'),
            fetchWithMasterFallback(FacilityCharge, MasterFacilityCharge, { patientId: patient._id, ...hFilter }, 'facilityName pricePerDay days totalAmount paymentStatus createdAt addedBy collectedBy', null, [{path: 'collectedBy', select: 'name'}, {path: 'addedBy', select: 'name'}]),
            fetchWithMasterFallback(Admission, MasterAdmission, { patientId: patient._id, ...hFilter }, null, { admissionDate: -1 }),
            fetchWithMasterFallback(PaymentTransaction, MasterPaymentTransaction, { patientId: patient._id, ...hFilter }, null, { paymentDate: -1 })
        ]);

        // Calculate ICU charges dynamically for active/past admissions
        const Hospital = require('../models/hospital.model');
        const hospital = patient.hospitalId ? await Hospital.findById(patient.hospitalId).lean() : null;
        const icuFacility = hospital?.facilities?.find(f => f.name.toUpperCase().startsWith('ICU'));
        const icuRate = icuFacility ? (Number(icuFacility.pricePerDay) || 0) : 0;

        for (const adm of admissions) {
            if (adm.ward && adm.ward.toUpperCase().startsWith('ICU')) {
                const hasIcuCharge = adm.selectedFacilities?.some(f => f.facilityName.toUpperCase().startsWith('ICU'));
                if (!hasIcuCharge && icuRate > 0) {
                    const startDate = new Date(adm.admissionDate);
                    const endDate = adm.dischargeDate ? new Date(adm.dischargeDate) : new Date();
                    const diffTime = Math.max(0, endDate - startDate);
                    const diffDays = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
                    const icuTotal = icuRate * diffDays;
                    
                    adm.selectedFacilities = adm.selectedFacilities || [];
                    adm.selectedFacilities.push({
                        facilityName: icuFacility.name,
                        pricePerDay: icuRate,
                        days: diffDays,
                        totalAmount: icuTotal
                    });
                    adm.totalAmount = (adm.totalAmount || 0) + icuTotal;
                }
            }
        }

        res.json({
            success: true,
            patient: {
                _id: patient._id,
                name: patient.name,
                mrn: patient.mrn,
                patientId: patient.patientId,
                phone: patient.phone,
                gender: patient.gender,
                dob: patient.dob,
            },
            billing: { appointments, labReports, pharmacyOrders, facilityCharges, admissions, paymentTransactions }
        });

    } catch (error) {
        console.error('[patient-billing-error]', error);
        res.status(500).json({ success: false, message: 'An internal error occurred' });
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
            days: Number(days),
            totalAmount: Number(pricePerDay) * Number(days),
            addedBy: req.user._id || req.user.userId,
            collectedBy: req.user._id || req.user.userId
        });

        await charge.save();
        res.status(201).json({ success: true, message: 'Facility charge added', charge });

    } catch (error) {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// 3. Mark items as paid — updates tenant DB
router.put('/pay', verifyBillingAccess, auditLog('CONFIRM_PAYMENT'), async (req, res) => {
    try {
        const {
            appointmentIds = [],
            labReportIds = [],
            pharmacyOrderIds = [],
            facilityChargeIds = [],
            admissionIds = [],
            paymentMode = 'Cash',
            patientId,
            amount,
            splitPayments = [],
            transactionId,
            upiId,
            cardDetails,
            bankReference,
            proofUrl,
            proofFileId
        } = req.body;

        const actualPaymentMode = splitPayments.length > 0 ? splitPayments[0].method : paymentMode;
        const totalAmount = splitPayments.length > 0 ? splitPayments.reduce((acc, p) => acc + Number(p.amount), 0) : amount;

        const { Appointment, LabReport, PharmacyOrder, FacilityCharge, Admission, PaymentTransaction } = getModels(req);

        // Calculate and persist ICU charges for any admissions before marking Paid
        if (admissionIds.length > 0) {
            const admissionsToPay = await Admission.find({ _id: { $in: admissionIds } });
            for (const adm of admissionsToPay) {
                if (adm.ward && adm.ward.toUpperCase().startsWith('ICU')) {
                    const hasIcuCharge = adm.selectedFacilities?.some(f => f.facilityName.toUpperCase().startsWith('ICU'));
                    if (!hasIcuCharge) {
                        const Hospital = require('../models/hospital.model');
                        const hospital = adm.hospitalId ? await Hospital.findById(adm.hospitalId).lean() : null;
                        const icuFacility = hospital?.facilities?.find(f => f.name.toUpperCase().startsWith('ICU'));
                        const icuRate = icuFacility ? (Number(icuFacility.pricePerDay) || 0) : 0;
                        if (icuRate > 0) {
                            const startDate = new Date(adm.admissionDate);
                            const endDate = adm.dischargeDate ? new Date(adm.dischargeDate) : new Date();
                            const diffTime = Math.max(0, endDate - startDate);
                            const diffDays = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
                            const icuTotal = icuRate * diffDays;
                            
                            adm.selectedFacilities = adm.selectedFacilities || [];
                            adm.selectedFacilities.push({
                                facilityName: icuFacility.name,
                                pricePerDay: icuRate,
                                days: diffDays,
                                totalAmount: icuTotal
                            });
                            adm.totalAmount = (adm.totalAmount || 0) + icuTotal;
                        }
                    }
                }
                adm.paymentStatus = 'Paid';
                await adm.save();
            }
        }

        await Promise.all([
            appointmentIds.length > 0 && Appointment.updateMany(
                { _id: { $in: appointmentIds } }, { $set: { paymentStatus: 'Paid', paymentMethod: actualPaymentMode, splitPayments } }),
                { _id: { $in: appointmentIds } }, { $set: { paymentStatus: 'Paid', paymentMode, status: 'completed' } }),
            labReportIds.length > 0 && LabReport.updateMany(
                { _id: { $in: labReportIds } }, { $set: { paymentStatus: 'Paid', paymentMethod: actualPaymentMode, splitPayments } }),
            pharmacyOrderIds.length > 0 && PharmacyOrder.updateMany(
                { _id: { $in: pharmacyOrderIds } }, { $set: { paymentStatus: 'Paid', splitPayments } }),
                { _id: { $in: pharmacyOrderIds } }, { $set: { paymentStatus: 'Paid', orderStatus: 'Completed' } }),
            facilityChargeIds.length > 0 && FacilityCharge.updateMany(
                { _id: { $in: facilityChargeIds } }, { $set: { paymentStatus: 'Paid', splitPayments } }),
        ].filter(Boolean));

        if (patientId) {
            // Build dynamic description
            let descParts = [];
            if (appointmentIds.length > 0) descParts.push(`${appointmentIds.length} Appointments`);
            if (labReportIds.length > 0) descParts.push(`${labReportIds.length} Lab Tests`);
            if (pharmacyOrderIds.length > 0) descParts.push(`${pharmacyOrderIds.length} Pharmacy Orders`);
            if (facilityChargeIds.length > 0) descParts.push(`${facilityChargeIds.length} Facility Charges`);
            if (admissionIds.length > 0) descParts.push(`${admissionIds.length} ICU/Admissions`);

            const description = descParts.length > 0 ? `Payment for: ${descParts.join(', ')}` : 'General Payment';

            const pt = new PaymentTransaction({
                hospitalId: req.hospitalId || req.user.hospitalId,
                patientId,
                paymentMode: actualPaymentMode,
                splitPayments,
                paymentStatus: 'Paid',
                amount: Number(totalAmount) || 0,
                transactionId,
                upiId,
                cardDetails,
                bankReference,
                proofUrl,
                proofFileId,
                description,
                billedItems: {
                    appointments: appointmentIds,
                    labReports: labReportIds,
                    pharmacyOrders: pharmacyOrderIds,
                    facilityCharges: facilityChargeIds,
                    admissions: admissionIds
                },
                addedBy: req.user._id || req.user.userId
            });
            await pt.save();
        }

        res.json({ success: true, message: 'Billing settled successfully' });
    } catch (error) {
        console.error('[confirm-payment-error]', error);
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// 4. Fetch All Patients with their Billing Metrics (pending + paid dues) — tenant-scoped
router.get('/patients', verifyBillingAccess, async (req, res) => {
    try {
        const { User, Appointment, LabReport, PharmacyOrder, FacilityCharge, Admission } = getModels(req);
        
        // Scope patient lookup to the requesting user's hospital
        const hospitalFilter = req.user.hospitalId ? { hospitalId: req.user.hospitalId } : {};

        // Find all patients registered under this hospital
        const patients = await User.find({
            ...hospitalFilter,
            role: 'patient'
        }).sort({ createdAt: -1 }).lean();

        const resolvedPatients = [];

        // For each patient, compute billing statistics
        for (const patient of patients) {
            const hFilter = req.user.hospitalId ? { hospitalId: req.user.hospitalId } : {};
            
            const [appointments, labReports, pharmacyOrders, facilityCharges, admissions] = await Promise.all([
                Appointment.find({ userId: patient._id, ...hFilter }).lean(),
                LabReport.find({ userId: patient._id, ...hFilter }).lean(),
                PharmacyOrder.find({ userId: patient._id, ...hFilter }).lean(),
                FacilityCharge.find({ patientId: patient._id, ...hFilter }).lean(),
                Admission.find({ patientId: patient._id, ...hFilter }).lean(),
            ]);

            // Calculate ICU charges dynamically for active/past admissions
            const Hospital = require('../models/hospital.model');
            const hospital = req.user.hospitalId ? await Hospital.findById(req.user.hospitalId).lean() : null;
            const icuFacility = hospital?.facilities?.find(f => f.name.toUpperCase().startsWith('ICU'));
            const icuRate = icuFacility ? (Number(icuFacility.pricePerDay) || 0) : 0;

            for (const adm of admissions) {
                if (adm.ward && adm.ward.toUpperCase().startsWith('ICU')) {
                    const hasIcuCharge = adm.selectedFacilities?.some(f => f.facilityName.toUpperCase().startsWith('ICU'));
                    if (!hasIcuCharge && icuRate > 0) {
                        const startDate = new Date(adm.admissionDate);
                        const endDate = adm.dischargeDate ? new Date(adm.dischargeDate) : new Date();
                        const diffTime = Math.max(0, endDate - startDate);
                        const diffDays = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
                        const icuTotal = icuRate * diffDays;
                        
                        adm.selectedFacilities = adm.selectedFacilities || [];
                        adm.selectedFacilities.push({
                            facilityName: icuFacility.name,
                            pricePerDay: icuRate,
                            days: diffDays,
                            totalAmount: icuTotal
                        });
                        adm.totalAmount = (adm.totalAmount || 0) + icuTotal;
                    }
                }
            }

            // Dues calculations
            let totalPaid = 0;
            let pendingDues = 0;

            appointments.forEach(a => {
                if (['Paid', 'paid'].includes(a.paymentStatus)) totalPaid += (a.amount || 0);
                else totalPaid += 0; // wait, if not paid, it could be pending
                if (!['Paid', 'paid'].includes(a.paymentStatus)) pendingDues += (a.amount || 0);
            });

            labReports.forEach(l => {
                if (['PAID', 'Paid', 'paid'].includes(l.paymentStatus)) totalPaid += (l.amount || 0);
                if (!['PAID', 'Paid', 'paid'].includes(l.paymentStatus)) pendingDues += (l.amount || 0);
            });

            pharmacyOrders.forEach(p => {
                if (['Paid', 'paid'].includes(p.paymentStatus)) totalPaid += (p.totalAmount || 0);
                if (!['Paid', 'paid'].includes(p.paymentStatus)) pendingDues += (p.totalAmount || 0);
            });

            facilityCharges.forEach(f => {
                if (['Paid', 'paid'].includes(f.paymentStatus)) totalPaid += (f.totalAmount || 0);
                if (!['Paid', 'paid'].includes(f.paymentStatus)) pendingDues += (f.totalAmount || 0);
            });

            admissions.forEach(adm => {
                if (['Paid', 'paid'].includes(adm.paymentStatus)) totalPaid += (adm.totalAmount || 0);
                if (!['Paid', 'paid'].includes(adm.paymentStatus)) pendingDues += (adm.totalAmount || 0);
            });

            resolvedPatients.push({
                _id: patient._id,
                name: patient.name,
                mrn: patient.mrn,
                patientId: patient.patientId,
                phone: patient.phone,
                email: patient.email,
                gender: patient.gender,
                dob: patient.dob,
                pendingDues,
                totalPaid,
                billingStatus: pendingDues > 0 ? 'Pending' : 'Settled'
            });
        }

        res.json({ success: true, patients: resolvedPatients });
    } catch (error) {
        console.error('[billing-patients-error]', error);
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

module.exports = router;
