const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { verifyToken } = require('../middleware/auth.middleware');
const { resolveTenant } = require('../middleware/tenantMiddleware');
const { getTenantModels } = require('../db/tenantModels');
const auditLog = require('../middleware/audit.middleware');

// Master fallbacks
const MasterHospitalPackage = require('../models/hospitalPackage.model');
const MasterPatientPackageAssignment = require('../models/patientPackageAssignment.model');
const MasterUser = require('../models/user.model');

// ════════════════════════════════════════════════════════════════════════════════
// SECTION 1: PACKAGE CRUD (Hospital Admin only)
// ════════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/packages/
 * List all packages for a hospital. Supports ?active=true filter.
 */
router.get('/', verifyToken, resolveTenant, async (req, res) => {
    try {
        const hospitalId = req.user.hospitalId;
        if (!hospitalId) return res.status(400).json({ success: false, message: 'Hospital context required' });

        const filter = { hospitalId };
        if (req.query.active === 'true') filter.isActive = true;
        if (req.query.active === 'false') filter.isActive = false;
        if (req.query.category) filter.category = req.query.category;

        let HospitalPackage;
        try {
            const models = getTenantModels(req.tenantDb);
            HospitalPackage = models.HospitalPackage;
        } catch {
            HospitalPackage = MasterHospitalPackage;
        }

        const packages = await HospitalPackage.find(filter)
            .sort({ isActive: -1, createdAt: -1 })
            .lean();

        return res.json({ success: true, packages });
    } catch (err) {
        console.error('[Package] List error:', err.message);
        return res.status(500).json({ success: false, message: 'Failed to load packages' });
    }
});

/**
 * GET /api/packages/:id
 * Get a single package with its assignment count.
 */
router.get('/:id', verifyToken, resolveTenant, async (req, res) => {
    try {
        const hospitalId = req.user.hospitalId;
        if (!hospitalId) return res.status(400).json({ success: false, message: 'Hospital context required' });

        let HospitalPackage, PatientPackageAssignment;
        try {
            const models = getTenantModels(req.tenantDb);
            HospitalPackage = models.HospitalPackage;
            PatientPackageAssignment = models.PatientPackageAssignment;
        } catch {
            HospitalPackage = MasterHospitalPackage;
            PatientPackageAssignment = MasterPatientPackageAssignment;
        }

        const pkg = await HospitalPackage.findOne({ _id: req.params.id, hospitalId }).lean();
        if (!pkg) return res.status(404).json({ success: false, message: 'Package not found' });

        const assignmentCount = await PatientPackageAssignment.countDocuments({ packageId: pkg._id, hospitalId });
        pkg.totalAssignments = assignmentCount;

        return res.json({ success: true, package: pkg });
    } catch (err) {
        console.error('[Package] Get error:', err.message);
        return res.status(500).json({ success: false, message: 'Failed to load package' });
    }
});

/**
 * POST /api/packages/
 * Create a new package. Hospital Admin only.
 */
router.post('/', verifyToken, resolveTenant, async (req, res) => {
    try {
        const hospitalId = req.user.hospitalId;
        if (!hospitalId) return res.status(400).json({ success: false, message: 'Hospital context required' });

        const { name, code, description, category, services, totalPrice, discountedPrice, validityDays } = req.body;

        if (!name || !name.trim()) return res.status(400).json({ success: false, message: 'Package name is required' });
        if (totalPrice === undefined || totalPrice < 0) return res.status(400).json({ success: false, message: 'Valid total price is required' });
        if (!services || !services.length) return res.status(400).json({ success: false, message: 'At least one service is required' });

        let HospitalPackage;
        try {
            const models = getTenantModels(req.tenantDb);
            HospitalPackage = models.HospitalPackage;
        } catch {
            HospitalPackage = MasterHospitalPackage;
        }

        // Check duplicate name
        const existing = await HospitalPackage.findOne({ hospitalId, name: name.trim() }).lean();
        if (existing) return res.status(409).json({ success: false, message: 'A package with this name already exists' });

        // Check duplicate code
        if (code && code.trim()) {
            const existingCode = await HospitalPackage.findOne({ hospitalId, code: code.trim().toUpperCase() }).lean();
            if (existingCode) return res.status(409).json({ success: false, message: 'A package with this code already exists' });
        }

        const pkg = await HospitalPackage.create({
            hospitalId,
            name: name.trim(),
            code: code ? code.trim().toUpperCase() : '',
            description: description || '',
            category: category || 'General',
            services: services.map(s => ({
                serviceName: s.serviceName,
                serviceCategory: s.serviceCategory || 'Other',
                includedQuantity: s.includedQuantity ?? 1,
                extraChargePerUnit: s.extraChargePerUnit ?? 0,
                unitPrice: s.unitPrice ?? 0,
                notes: s.notes || ''
            })),
            totalPrice: Number(totalPrice),
            discountedPrice: discountedPrice != null ? Number(discountedPrice) : null,
            validityDays: validityDays || 365,
            isActive: true,
            createdBy: req.user._id,
            updatedBy: req.user._id,
        });

        return res.status(201).json({ success: true, package: pkg.toObject(), message: 'Package created successfully' });
    } catch (err) {
        console.error('[Package] Create error:', err.message);
        if (err.code === 11000) return res.status(409).json({ success: false, message: 'Duplicate package name or code' });
        return res.status(500).json({ success: false, message: 'Failed to create package' });
    }
});

/**
 * PUT /api/packages/:id
 * Update a package. Cannot modify if there are active assignments (services snapshot stays frozen).
 */
router.put('/:id', verifyToken, resolveTenant, async (req, res) => {
    try {
        const hospitalId = req.user.hospitalId;
        if (!hospitalId) return res.status(400).json({ success: false, message: 'Hospital context required' });

        let HospitalPackage, PatientPackageAssignment;
        try {
            const models = getTenantModels(req.tenantDb);
            HospitalPackage = models.HospitalPackage;
            PatientPackageAssignment = models.PatientPackageAssignment;
        } catch {
            HospitalPackage = MasterHospitalPackage;
            PatientPackageAssignment = MasterPatientPackageAssignment;
        }

        const pkg = await HospitalPackage.findOne({ _id: req.params.id, hospitalId });
        if (!pkg) return res.status(404).json({ success: false, message: 'Package not found' });

        const { name, code, description, category, services, totalPrice, discountedPrice, validityDays } = req.body;

        // Check if name changed + duplicate
        if (name && name.trim() !== pkg.name) {
            const existing = await HospitalPackage.findOne({ hospitalId, name: name.trim(), _id: { $ne: pkg._id } }).lean();
            if (existing) return res.status(409).json({ success: false, message: 'A package with this name already exists' });
            pkg.name = name.trim();
        }

        if (code !== undefined) {
            const newCode = code ? code.trim().toUpperCase() : '';
            if (newCode && newCode !== pkg.code) {
                const existingCode = await HospitalPackage.findOne({ hospitalId, code: newCode, _id: { $ne: pkg._id } }).lean();
                if (existingCode) return res.status(409).json({ success: false, message: 'A package with this code already exists' });
            }
            pkg.code = newCode;
        }

        if (description !== undefined) pkg.description = description;
        if (category) pkg.category = category;
        if (validityDays) pkg.validityDays = validityDays;
        if (totalPrice !== undefined) pkg.totalPrice = Number(totalPrice);
        if (discountedPrice !== undefined) pkg.discountedPrice = discountedPrice != null ? Number(discountedPrice) : null;

        if (services && services.length) {
            pkg.services = services.map(s => ({
                serviceName: s.serviceName,
                serviceCategory: s.serviceCategory || 'Other',
                includedQuantity: s.includedQuantity ?? 1,
                extraChargePerUnit: s.extraChargePerUnit ?? 0,
                unitPrice: s.unitPrice ?? 0,
                notes: s.notes || ''
            }));
        }

        pkg.updatedBy = req.user._id;
        await pkg.save();

        return res.json({ success: true, package: pkg.toObject(), message: 'Package updated successfully' });
    } catch (err) {
        console.error('[Package] Update error:', err.message);
        if (err.code === 11000) return res.status(409).json({ success: false, message: 'Duplicate package name or code' });
        return res.status(500).json({ success: false, message: 'Failed to update package' });
    }
});

/**
 * PATCH /api/packages/:id/toggle
 * Toggle active/inactive. Packages with active assignments cannot be deleted,
 * but they CAN be deactivated (so no new assignments happen).
 */
router.patch('/:id/toggle', verifyToken, resolveTenant, async (req, res) => {
    try {
        const hospitalId = req.user.hospitalId;
        if (!hospitalId) return res.status(400).json({ success: false, message: 'Hospital context required' });

        let HospitalPackage;
        try {
            const models = getTenantModels(req.tenantDb);
            HospitalPackage = models.HospitalPackage;
        } catch {
            HospitalPackage = MasterHospitalPackage;
        }

        const pkg = await HospitalPackage.findOne({ _id: req.params.id, hospitalId });
        if (!pkg) return res.status(404).json({ success: false, message: 'Package not found' });

        pkg.isActive = !pkg.isActive;
        pkg.updatedBy = req.user._id;
        await pkg.save();

        return res.json({
            success: true,
            isActive: pkg.isActive,
            message: `Package ${pkg.isActive ? 'activated' : 'deactivated'} successfully`
        });
    } catch (err) {
        console.error('[Package] Toggle error:', err.message);
        return res.status(500).json({ success: false, message: 'Failed to toggle package status' });
    }
});

/**
 * DELETE /api/packages/:id
 * Hard-delete ONLY if the package has zero assignments.
 */
router.delete('/:id', verifyToken, resolveTenant, async (req, res) => {
    try {
        const hospitalId = req.user.hospitalId;
        if (!hospitalId) return res.status(400).json({ success: false, message: 'Hospital context required' });

        let HospitalPackage, PatientPackageAssignment;
        try {
            const models = getTenantModels(req.tenantDb);
            HospitalPackage = models.HospitalPackage;
            PatientPackageAssignment = models.PatientPackageAssignment;
        } catch {
            HospitalPackage = MasterHospitalPackage;
            PatientPackageAssignment = MasterPatientPackageAssignment;
        }

        const pkg = await HospitalPackage.findOne({ _id: req.params.id, hospitalId });
        if (!pkg) return res.status(404).json({ success: false, message: 'Package not found' });

        const assignmentCount = await PatientPackageAssignment.countDocuments({ packageId: pkg._id });
        if (assignmentCount > 0) {
            return res.status(409).json({
                success: false,
                message: `Cannot delete — ${assignmentCount} patient(s) have been assigned this package. Deactivate it instead.`
            });
        }

        await HospitalPackage.deleteOne({ _id: pkg._id });
        return res.json({ success: true, message: 'Package deleted successfully' });
    } catch (err) {
        console.error('[Package] Delete error:', err.message);
        return res.status(500).json({ success: false, message: 'Failed to delete package' });
    }
});


// ════════════════════════════════════════════════════════════════════════════════
// SECTION 2: PATIENT PACKAGE ASSIGNMENT
// ════════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/packages/assign
 * Assign a package to a patient. Creates a snapshot of current package state.
 */
router.post('/assign', verifyToken, resolveTenant, async (req, res) => {
    try {
        const hospitalId = req.user.hospitalId;
        if (!hospitalId) return res.status(400).json({ success: false, message: 'Hospital context required' });

        const { packageId, patientId, notes } = req.body;
        if (!packageId || !patientId) return res.status(400).json({ success: false, message: 'Package ID and Patient ID are required' });

        let HospitalPackage, PatientPackageAssignment, User;
        try {
            const models = getTenantModels(req.tenantDb);
            HospitalPackage = models.HospitalPackage;
            PatientPackageAssignment = models.PatientPackageAssignment;
            User = models.User;
        } catch {
            HospitalPackage = MasterHospitalPackage;
            PatientPackageAssignment = MasterPatientPackageAssignment;
            User = MasterUser;
        }

        // Validate package
        const pkg = await HospitalPackage.findOne({ _id: packageId, hospitalId, isActive: true }).lean();
        if (!pkg) return res.status(404).json({ success: false, message: 'Package not found or is inactive' });

        // Validate patient
        const patient = await User.findById(patientId).select('name mrn patientId').lean();
        if (!patient) return res.status(404).json({ success: false, message: 'Patient not found' });

        // Check for existing active assignment of the same package
        const existingAssignment = await PatientPackageAssignment.findOne({
            hospitalId, patientId, packageId, status: 'ACTIVE'
        }).lean();
        if (existingAssignment) {
            return res.status(409).json({
                success: false,
                message: 'This patient already has an active assignment for this package'
            });
        }

        // Calculate effective price and expiry
        const effectivePrice = pkg.discountedPrice != null ? pkg.discountedPrice : pkg.totalPrice;
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + (pkg.validityDays || 365));

        // Create assignment with snapshot
        const assignment = await PatientPackageAssignment.create({
            hospitalId,
            patientId,
            patientName: patient.name || '',
            patientMRN: patient.mrn || patient.patientId || '',
            packageId: pkg._id,
            packageName: pkg.name,
            packageCode: pkg.code || '',
            packageCategory: pkg.category || 'General',
            snapshotServices: pkg.services.map(s => ({
                serviceName: s.serviceName,
                serviceCategory: s.serviceCategory || 'Other',
                includedQuantity: s.includedQuantity,
                usedQuantity: 0,
                extraChargePerUnit: s.extraChargePerUnit || 0,
                unitPrice: s.unitPrice || 0,
                notes: s.notes || ''
            })),
            snapshotTotalPrice: pkg.totalPrice,
            snapshotDiscountedPrice: pkg.discountedPrice,
            effectivePrice,
            validityDays: pkg.validityDays || 365,
            expiryDate,
            assignedBy: req.user._id,
            assignedByName: req.user.name || '',
            notes: notes || '',
        });

        // Increment package assignment counter
        await HospitalPackage.updateOne({ _id: pkg._id }, { $inc: { totalAssignments: 1 } });

        return res.status(201).json({
            success: true,
            assignment: assignment.toObject(),
            message: `Package "${pkg.name}" assigned to ${patient.name} successfully`
        });
    } catch (err) {
        console.error('[Package] Assign error:', err.message);
        return res.status(500).json({ success: false, message: 'Failed to assign package' });
    }
});

/**
 * GET /api/packages/assignments/all
 * List all assignments for the hospital. Supports filters.
 */
router.get('/assignments/all', verifyToken, resolveTenant, async (req, res) => {
    try {
        const hospitalId = req.user.hospitalId;
        if (!hospitalId) return res.status(400).json({ success: false, message: 'Hospital context required' });

        let PatientPackageAssignment;
        try {
            const models = getTenantModels(req.tenantDb);
            PatientPackageAssignment = models.PatientPackageAssignment;
        } catch {
            PatientPackageAssignment = MasterPatientPackageAssignment;
        }

        const filter = { hospitalId };
        if (req.query.status) filter.status = req.query.status;
        if (req.query.packageId) filter.packageId = req.query.packageId;
        if (req.query.patientId) filter.patientId = req.query.patientId;

        const page = parseInt(req.query.page) || 1;
        const limit = Math.min(parseInt(req.query.limit) || 50, 100);
        const skip = (page - 1) * limit;

        const [assignments, total] = await Promise.all([
            PatientPackageAssignment.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            PatientPackageAssignment.countDocuments(filter)
        ]);

        return res.json({ success: true, assignments, total, page, limit });
    } catch (err) {
        console.error('[Package] List assignments error:', err.message);
        return res.status(500).json({ success: false, message: 'Failed to load assignments' });
    }
});

/**
 * GET /api/packages/assignments/patient/:patientId
 * Get all package assignments for a specific patient.
 */
router.get('/assignments/patient/:patientId', verifyToken, resolveTenant, async (req, res) => {
    try {
        const hospitalId = req.user.hospitalId;
        if (!hospitalId) return res.status(400).json({ success: false, message: 'Hospital context required' });

        let PatientPackageAssignment;
        try {
            const models = getTenantModels(req.tenantDb);
            PatientPackageAssignment = models.PatientPackageAssignment;
        } catch {
            PatientPackageAssignment = MasterPatientPackageAssignment;
        }

        const assignments = await PatientPackageAssignment.find({
            hospitalId,
            patientId: req.params.patientId
        }).sort({ createdAt: -1 }).lean();

        return res.json({ success: true, assignments });
    } catch (err) {
        console.error('[Package] Patient assignments error:', err.message);
        return res.status(500).json({ success: false, message: 'Failed to load patient assignments' });
    }
});

/**
 * GET /api/packages/assignments/:assignmentId
 * Get a single assignment with full details.
 */
router.get('/assignments/:assignmentId', verifyToken, resolveTenant, async (req, res) => {
    try {
        const hospitalId = req.user.hospitalId;
        if (!hospitalId) return res.status(400).json({ success: false, message: 'Hospital context required' });

        let PatientPackageAssignment;
        try {
            const models = getTenantModels(req.tenantDb);
            PatientPackageAssignment = models.PatientPackageAssignment;
        } catch {
            PatientPackageAssignment = MasterPatientPackageAssignment;
        }

        const assignment = await PatientPackageAssignment.findOne({
            _id: req.params.assignmentId,
            hospitalId
        }).lean();

        if (!assignment) return res.status(404).json({ success: false, message: 'Assignment not found' });
        return res.json({ success: true, assignment });
    } catch (err) {
        console.error('[Package] Get assignment error:', err.message);
        return res.status(500).json({ success: false, message: 'Failed to load assignment' });
    }
});

/**
 * POST /api/packages/assignments/:assignmentId/usage
 * Log service usage against a patient's package assignment.
 * Server calculates whether it's included or extra and updates totals.
 */
router.post('/assignments/:assignmentId/usage', verifyToken, resolveTenant, async (req, res) => {
    try {
        const hospitalId = req.user.hospitalId;
        if (!hospitalId) return res.status(400).json({ success: false, message: 'Hospital context required' });

        const { serviceIndex, quantity, notes, appointmentId, labReportId, pharmacyOrderId } = req.body;
        if (serviceIndex === undefined || serviceIndex < 0) {
            return res.status(400).json({ success: false, message: 'Valid service index is required' });
        }

        let PatientPackageAssignment;
        try {
            const models = getTenantModels(req.tenantDb);
            PatientPackageAssignment = models.PatientPackageAssignment;
        } catch {
            PatientPackageAssignment = MasterPatientPackageAssignment;
        }

        const assignment = await PatientPackageAssignment.findOne({
            _id: req.params.assignmentId,
            hospitalId,
            status: 'ACTIVE'
        });

        if (!assignment) return res.status(404).json({ success: false, message: 'Active assignment not found' });

        // Check expiry
        if (new Date() > assignment.expiryDate) {
            assignment.status = 'EXPIRED';
            await assignment.save();
            return res.status(409).json({ success: false, message: 'Package has expired' });
        }

        const service = assignment.snapshotServices[serviceIndex];
        if (!service) return res.status(400).json({ success: false, message: 'Invalid service index' });

        const qty = Math.max(1, parseInt(quantity) || 1);
        const newUsedQty = service.usedQuantity + qty;

        // Determine if this usage is within included limits or extra
        let isExtra = false;
        let extraAmount = 0;

        if (service.includedQuantity !== -1) { // -1 = unlimited
            if (service.usedQuantity >= service.includedQuantity) {
                // All usage is extra
                isExtra = true;
                extraAmount = qty * service.extraChargePerUnit;
            } else if (newUsedQty > service.includedQuantity) {
                // Partially included, partially extra
                const extraQty = newUsedQty - service.includedQuantity;
                isExtra = true;
                extraAmount = extraQty * service.extraChargePerUnit;
            }
        }

        // Update snapshot service usage
        assignment.snapshotServices[serviceIndex].usedQuantity = newUsedQty;

        // Add usage log entry
        assignment.usageLog.push({
            serviceIndex,
            serviceName: service.serviceName,
            quantity: qty,
            isExtra,
            extraAmount,
            notes: notes || '',
            loggedBy: req.user._id,
            loggedByName: req.user.name || '',
            appointmentId: appointmentId || null,
            labReportId: labReportId || null,
            pharmacyOrderId: pharmacyOrderId || null,
        });

        // Update total extra charges
        assignment.totalExtraCharges = (assignment.totalExtraCharges || 0) + extraAmount;

        // Check if all services are fully consumed
        const allConsumed = assignment.snapshotServices.every(s => {
            if (s.includedQuantity === -1) return false; // Unlimited never "completes"
            return s.usedQuantity >= s.includedQuantity;
        });
        if (allConsumed) {
            assignment.status = 'COMPLETED';
            assignment.completedAt = new Date();
        }

        await assignment.save();

        return res.json({
            success: true,
            isExtra,
            extraAmount,
            usageEntry: assignment.usageLog[assignment.usageLog.length - 1],
            assignment: assignment.toObject(),
            message: isExtra
                ? `Extra charge of ₹${extraAmount} applied for ${service.serviceName}`
                : `${service.serviceName} usage logged (included in package)`
        });
    } catch (err) {
        console.error('[Package] Usage log error:', err.message);
        if (err.name === 'VersionError') {
            return res.status(409).json({ success: false, message: 'Concurrent update detected. Please retry.' });
        }
        return res.status(500).json({ success: false, message: 'Failed to log usage' });
    }
});

/**
 * PATCH /api/packages/assignments/:assignmentId/cancel
 * Cancel an active assignment.
 */
router.patch('/assignments/:assignmentId/cancel', verifyToken, resolveTenant, async (req, res) => {
    try {
        const hospitalId = req.user.hospitalId;
        if (!hospitalId) return res.status(400).json({ success: false, message: 'Hospital context required' });

        let PatientPackageAssignment;
        try {
            const models = getTenantModels(req.tenantDb);
            PatientPackageAssignment = models.PatientPackageAssignment;
        } catch {
            PatientPackageAssignment = MasterPatientPackageAssignment;
        }

        const assignment = await PatientPackageAssignment.findOne({
            _id: req.params.assignmentId,
            hospitalId,
            status: 'ACTIVE'
        });

        if (!assignment) return res.status(404).json({ success: false, message: 'Active assignment not found' });

        assignment.status = 'CANCELLED';
        assignment.cancelledAt = new Date();
        assignment.cancelledBy = req.user._id;
        assignment.cancellationReason = req.body.reason || '';
        await assignment.save();

        return res.json({ success: true, message: 'Package assignment cancelled successfully' });
    } catch (err) {
        console.error('[Package] Cancel assignment error:', err.message);
        return res.status(500).json({ success: false, message: 'Failed to cancel assignment' });
    }
});

/**
 * GET /api/packages/stats/dashboard
 * Dashboard stats for package management.
 */
router.get('/stats/dashboard', verifyToken, resolveTenant, async (req, res) => {
    try {
        const hospitalId = req.user.hospitalId;
        if (!hospitalId) return res.status(400).json({ success: false, message: 'Hospital context required' });

        let HospitalPackage, PatientPackageAssignment;
        try {
            const models = getTenantModels(req.tenantDb);
            HospitalPackage = models.HospitalPackage;
            PatientPackageAssignment = models.PatientPackageAssignment;
        } catch {
            HospitalPackage = MasterHospitalPackage;
            PatientPackageAssignment = MasterPatientPackageAssignment;
        }

        const hId = mongoose.Types.ObjectId.isValid(hospitalId) ? new mongoose.Types.ObjectId(hospitalId.toString()) : hospitalId;
        const [totalPackages, activePackages, totalAssignments, activeAssignments, totalRevenue] = await Promise.all([
            HospitalPackage.countDocuments({ hospitalId }),
            HospitalPackage.countDocuments({ hospitalId, isActive: true }),
            PatientPackageAssignment.countDocuments({ hospitalId }),
            PatientPackageAssignment.countDocuments({ hospitalId, status: 'ACTIVE' }),
            PatientPackageAssignment.aggregate([
                { $match: { hospitalId: hId } },
                { $group: { _id: null, total: { $sum: '$effectivePrice' }, extras: { $sum: '$totalExtraCharges' } } }
            ])
        ]);

        const revenue = totalRevenue[0] || { total: 0, extras: 0 };

        return res.json({
            success: true,
            stats: {
                totalPackages,
                activePackages,
                inactivePackages: totalPackages - activePackages,
                totalAssignments,
                activeAssignments,
                completedAssignments: totalAssignments - activeAssignments,
                totalRevenue: revenue.total,
                totalExtraCharges: revenue.extras
            }
        });
    } catch (err) {
        console.error('[Package] Stats error:', err.message);
        return res.status(500).json({ success: false, message: 'Failed to load stats' });
    }
});

module.exports = router;
