const express = require('express');
const router = express.Router();
const multer = require('multer');

const { verifyToken } = require('../middleware/auth.middleware');
const { resolveTenant } = require('../middleware/tenantMiddleware');
const migrationController = require('../controllers/migration.controller');

/**
 * Middleware: Strictly enforce Hospital Admin (or Central/Super Admin)
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
            message: 'Access denied. Only Hospital Admin is authorized to manage hospital data migration.'
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Internal authorization error' });
    }
};

// Configure Multer for in-memory processing of CSV, XLS, XLSX, and JSON
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 25 * 1024 * 1024 // 25MB max file size
    },
    fileFilter: (req, file, cb) => {
        const name = file.originalname.toLowerCase();
        if (name.endsWith('.csv') || name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.json')) {
            cb(null, true);
        } else {
            cb(new Error('Unsupported file format. Only CSV, XLS, XLSX, and JSON are allowed.'), false);
        }
    }
});

// All migration routes require authentication, tenant resolution, and Hospital Admin authorization
router.use(verifyToken);
router.use(resolveTenant);
router.use(verifyHospitalAdmin);

// Canonical schema definition endpoint (for UI dropdowns)
router.get('/canonical-schema', migrationController.getSchemaRegistry);

// Templates listing
router.get('/templates', migrationController.listTemplates);

// Session management
router.get('/', migrationController.listSessions);
router.post('/', migrationController.createSession);
router.get('/:migrationId', migrationController.getSession);

// Upload and analysis
router.post('/:migrationId/files', upload.array('files', 10), migrationController.uploadFiles);
router.post('/:migrationId/analyze', migrationController.analyzeSession);

// AI & manual mapping
router.post('/:migrationId/ai-mapping', migrationController.generateAiMapping);
router.put('/:migrationId/mapping', migrationController.updateMapping);
router.post('/:migrationId/accept-high-confidence', migrationController.acceptHighConfidence);
router.post('/:migrationId/custom-field', migrationController.createCustomField);

// Approval & template save
router.post('/:migrationId/approve', migrationController.approveMapping);
router.post('/:migrationId/save-template', migrationController.saveTemplate);

// Phase 2: Transformation, Validation, Duplicate Review & Preview
router.post('/:migrationId/prepare', migrationController.prepareAndValidate);
router.get('/:migrationId/preview', migrationController.getPreview);
router.get('/:migrationId/records', migrationController.getStagedRecords);
router.get('/:migrationId/records/:recordId', migrationController.getRecordDetail);
router.put('/:migrationId/records/:recordId/duplicate-decision', migrationController.updateDuplicateDecision);
router.post('/:migrationId/mark-ready', migrationController.markReadyForImport);
router.get('/:migrationId/export-report', migrationController.exportValidationReport);

// Phase 3: Safe Production Import, Verification & Failed Reports
router.post('/:migrationId/import', migrationController.executeImport);
router.get('/:migrationId/import-progress', migrationController.getImportProgress);
router.get('/:migrationId/failed-records', migrationController.getFailedRecords);
router.get('/:migrationId/export-failed-report', migrationController.exportFailedReport);

module.exports = router;

