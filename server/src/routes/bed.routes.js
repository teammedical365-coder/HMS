const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth.middleware');
const BedMaster = require('../models/bed.model');
const { getTenantModels } = require('../db/tenantModels');
const { resolveTenant } = require('../middleware/tenantMiddleware');

const getBedModel = (req) => {
    if (req.tenantDb) return getTenantModels(req.tenantDb).Bed || BedMaster; // Fallback to master if needed, but in tenant architectures, it might not exist yet. Assuming Bed is in Master for now if not in tenant.
    return BedMaster;
};

// Middleware for Admin access
const verifyAdminAccess = async (req, res, next) => {
    try {
        await verifyToken(req, res, () => {
            const roleName = (req.user._roleData?.name || String(req.user.role || '')).toLowerCase().replace(/\s+/g, '');
            const allowed = ['hospitaladmin', 'centraladmin', 'superadmin', 'admin', 'otmanager', 'otstaff', 'receptionist'];
            if (allowed.includes(roleName)) {
                next();
            } else {
                res.status(403).json({ success: false, message: 'Admin access required' });
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal error' });
    }
};

// GET /api/beds - List beds
router.get('/', verifyToken, resolveTenant, async (req, res) => {
    try {
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const query = { hospitalId };
        
        if (req.query.ward) query.ward = req.query.ward;
        if (req.query.status) query.status = req.query.status;
        
        const Bed = getBedModel(req);
        const beds = await Bed.find(query)
            .populate('currentPatient', 'name patientId mrn')
            .populate('currentAdmission', 'admissionDate')
            .sort({ ward: 1, bedNumber: 1 })
            .lean();
        
        console.log(`GET /api/beds query:`, query, `found: ${beds.length} beds using model ${Bed.modelName}`);
            
        res.json({ success: true, beds });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Error fetching beds' });
    }
});

// POST /api/beds - Create a bed (Admin only)
router.post('/', verifyAdminAccess, resolveTenant, async (req, res) => {
    try {
        const { bedNumber, ward, bedType } = req.body;
        const hospitalId = req.hospitalId || req.user.hospitalId;
        
        const Bed = getBedModel(req);
        const existing = await Bed.findOne({ hospitalId, bedNumber, ward });
        if (existing) {
            return res.status(400).json({ success: false, message: 'Bed already exists in this ward' });
        }
        
        const bed = new Bed({
            hospitalId,
            bedNumber,
            ward,
            bedType: bedType || 'General'
        });
        
        await bed.save();
        res.status(201).json({ success: true, message: 'Bed created', bed });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Error creating bed' });
    }
});

// PUT /api/beds/:id - Update bed (Admin only)
router.put('/:id', verifyAdminAccess, resolveTenant, async (req, res) => {
    try {
        const { bedNumber, ward, bedType, status } = req.body;
        const Bed = getBedModel(req);
        
        const bed = await Bed.findById(req.params.id);
        if (!bed) return res.status(404).json({ success: false, message: 'Bed not found' });
        
        if (bedNumber || ward) {
            const check = await Bed.findOne({ 
                hospitalId: bed.hospitalId, 
                bedNumber: bedNumber || bed.bedNumber, 
                ward: ward || bed.ward,
                _id: { $ne: bed._id }
            });
            if (check) return res.status(400).json({ success: false, message: 'Another bed with this number and ward exists' });
        }
        
        if (bedNumber) bed.bedNumber = bedNumber;
        if (ward) bed.ward = ward;
        if (bedType) bed.bedType = bedType;
        if (status && bed.status !== status) {
            // Cannot manually change status if occupied via admission flow
            if (bed.status === 'OCCUPIED' && status === 'AVAILABLE') {
                return res.status(400).json({ success: false, message: 'Cannot mark occupied bed as available directly. Please discharge patient.' });
            }
            if (bed.status === 'AVAILABLE' && status === 'OCCUPIED') {
                 return res.status(400).json({ success: false, message: 'Cannot mark available bed as occupied directly. Please admit patient.' });
            }
            bed.status = status; // e.g. for MAINTENANCE
        }
        
        await bed.save();
        res.json({ success: true, message: 'Bed updated', bed });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Error updating bed' });
    }
});

// DELETE /api/beds/:id - Delete bed (Admin only)
router.delete('/:id', verifyAdminAccess, resolveTenant, async (req, res) => {
    try {
        const Bed = getBedModel(req);
        const bed = await Bed.findById(req.params.id);
        if (!bed) return res.status(404).json({ success: false, message: 'Bed not found' });
        
        if (bed.status === 'OCCUPIED') {
            return res.status(400).json({ success: false, message: 'Cannot delete an occupied bed' });
        }
        
        await Bed.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'Bed deleted' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Error deleting bed' });
    }
});

module.exports = router;
