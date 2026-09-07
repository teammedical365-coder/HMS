const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth.middleware');
const { resolveTenant } = require('../middleware/tenantMiddleware');
const vialController = require('../controllers/vial.controller');

/**
 * Middleware: Strictly enforce Hospital Admin role (and Central/Super Admin)
 * Denies access to Receptionist, Doctor, Nurse, Patient, and any other role for mutating vial operations.
 */
const verifyHospitalAdmin = (req, res, next) => {
    try {
        if (!req.user) {
            return res.status(401).json({ success: false, message: 'Authentication required' });
        }
        const roleName = (req.user._roleData?.name || String(req.user.role || '')).toLowerCase().replace(/[\s_-]+/g, '');
        const allowedRoles = ['hospitaladmin', 'centraladmin', 'superadmin'];
        if (allowedRoles.includes(roleName)) {
            return next();
        }
        return res.status(403).json({
            success: false,
            message: 'Access denied. Only Hospital Admin is authorized to manage vials.'
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Internal authorization error' });
    }
};

/**
 * Middleware: Allow Hospital Staff (Hospital Admin, Receptionist, Doctors) to view patient vials
 * Allows Receptionists to look up patient vial locations to guide patients.
 */
const verifyCanViewPatientVials = (req, res, next) => {
    try {
        if (!req.user) {
            return res.status(401).json({ success: false, message: 'Authentication required' });
        }
        const roleName = (req.user._roleData?.name || String(req.user.role || '')).toLowerCase().replace(/[\s_-]+/g, '');
        const allowedRoles = [
            'hospitaladmin',
            'centraladmin',
            'superadmin',
            'reception',
            'receptionist',
            'doctor',
            'clinicdoctor',
            'nurse'
        ];
        if (allowedRoles.includes(roleName)) {
            return next();
        }
        return res.status(403).json({
            success: false,
            message: 'Access denied. You do not have permission to view vial records.'
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Internal authorization error' });
    }
};

// Base authentication and tenant isolation applied to all endpoints
router.use(verifyToken, resolveTenant);

// 1. Specific Static & Collection Routes (Hospital Admin only)
router.get('/stats', verifyHospitalAdmin, vialController.getVialStats);
router.get('/', verifyHospitalAdmin, vialController.getVials);
router.post('/', verifyHospitalAdmin, vialController.createVial);

// 2. Specific Patient Route (Accessible to Hospital Admin, Receptionist, Doctors)
router.get('/patient/:patientId', verifyCanViewPatientVials, vialController.getPatientVials);

// 3. Parameterized (:id) Routes
router.get('/:id', verifyCanViewPatientVials, vialController.getVialById);
router.put('/:id', verifyHospitalAdmin, vialController.updateVial);

// Status Transition Endpoints (Hospital Admin only)
router.post('/:id/store', verifyHospitalAdmin, vialController.storeVial);
router.post('/:id/move', verifyHospitalAdmin, vialController.moveVial);
router.post('/:id/retrieve', verifyHospitalAdmin, vialController.retrieveVial);
router.post('/:id/return', verifyHospitalAdmin, vialController.returnVial);
router.post('/:id/discard', verifyHospitalAdmin, vialController.discardVial);

module.exports = router;
