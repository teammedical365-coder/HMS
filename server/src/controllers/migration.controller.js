/**
 * migration.controller.js — Controller for AI-Assisted Hospital Data Migration (Phase 1).
 *
 * Implements strict tenant isolation, canonical schema enforcement,
 * AI mapping suggestions, manual mapping updates, custom fields, and templates.
 *
 * CRITICAL RULE: PHASE 1 DOES NOT IMPORT ACTUAL HOSPITAL RECORDS.
 */

const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

const { getTenantModels } = require('../db/tenantModels');
const MigrationSessionMaster = require('../models/migrationSession.model');
const MigrationTemplateMaster = require('../models/migrationTemplate.model');
const CustomFieldDefinitionMaster = require('../models/customFieldDefinition.model');
const MigrationRecordMaster = require('../models/migrationRecord.model');
const UserMaster = require('../models/user.model');
const DoctorMaster = require('../models/doctor.model');
const DepartmentMaster = require('../models/department.model');
const AppointmentMaster = require('../models/appointment.model');
const AdmissionMaster = require('../models/admission.model');
const PaymentTransactionMaster = require('../models/paymentTransaction.model');
const ServiceMaster = require('../models/service.model');
const MedicineMaster = require('../models/medicine.model');
const InventoryMaster = require('../models/inventory.model');
const LabReportMaster = require('../models/labReport.model');
const AuditLog = require('../models/auditLog.model');

const { analyzeFile } = require('../services/migration/fileAnalyzer');
const { detectEntity } = require('../services/migration/entityDetector');
const { generateAIMappings } = require('../services/migration/aiMapper');
const { validateMappingItem, getConfidenceLevel } = require('../services/migration/mappingValidator');
const { getCanonicalFields, getSupportedEntities, isValidCanonicalField } = require('../services/migration/canonicalSchema');
const { runMigrationPipeline } = require('../services/migration/migrationPipeline');
const { executeMigrationImport } = require('../services/migration/importEngine');

/**
 * Helper: Resolve models based on tenant DB or Master DB.
 */
function resolveModels(req) {
    if (req.tenantDb) {
        const tenantModels = getTenantModels(req.tenantDb);
        return {
            MigrationSession: tenantModels.MigrationSession || MigrationSessionMaster,
            MigrationTemplate: tenantModels.MigrationTemplate || MigrationTemplateMaster,
            CustomFieldDefinition: tenantModels.CustomFieldDefinition || CustomFieldDefinitionMaster,
            MigrationRecord: tenantModels.MigrationRecord || MigrationRecordMaster,
            User: tenantModels.User || UserMaster,
            Doctor: tenantModels.Doctor || DoctorMaster,
            Department: tenantModels.Department || DepartmentMaster,
            Appointment: tenantModels.Appointment || AppointmentMaster,
            Admission: tenantModels.Admission || AdmissionMaster,
            PaymentTransaction: tenantModels.PaymentTransaction || PaymentTransactionMaster,
            Service: tenantModels.FacilityCharge || ServiceMaster,
            FacilityCharge: tenantModels.FacilityCharge,
            Medicine: MedicineMaster,
            Inventory: tenantModels.Inventory || InventoryMaster,
            LabReport: tenantModels.LabReport || LabReportMaster
        };
    }
    return {
        MigrationSession: MigrationSessionMaster,
        MigrationTemplate: MigrationTemplateMaster,
        CustomFieldDefinition: CustomFieldDefinitionMaster,
        MigrationRecord: MigrationRecordMaster,
        User: UserMaster,
        Doctor: DoctorMaster,
        Department: DepartmentMaster,
        Appointment: AppointmentMaster,
        Admission: AdmissionMaster,
        PaymentTransaction: PaymentTransactionMaster,
        Service: ServiceMaster,
        FacilityCharge: null,
        Medicine: MedicineMaster,
        Inventory: InventoryMaster,
        LabReport: LabReportMaster
    };
}

/**
 * Helper: Resolve active hospitalId from authenticated user.
 */
function getActiveHospitalId(req) {
    return req.hospitalId || req.user?.hospitalId || req.body?.hospitalId;
}

/**
 * Helper: Log audit trail entry safely.
 */
async function recordAudit(req, action, targetLabel = '', targetId = null, reason = '') {
    try {
        const hospitalId = getActiveHospitalId(req);
        if (!hospitalId) return;

        await AuditLog.create({
            clinicId: hospitalId,
            userId: req.user?._id || null,
            userName: req.user?.name || 'Hospital Admin',
            role: req.user?.role || 'hospitaladmin',
            action,
            targetModel: 'MigrationSession',
            targetId,
            targetLabel,
            reason,
            ip: req.ip || '',
            userAgent: req.get('user-agent') || '',
            success: true
        });
    } catch (err) {
        console.warn(`[Migration Audit Warning] Failed to log action '${action}':`, err.message);
    }
}

/**
 * Recompute mapping summary counts.
 */
function recalculateSummary(session) {
    const totalFiles = (session.files || []).length;
    const detectedEntities = session.detectedEntities || [];
    const mappings = session.mappings || [];

    const totalFields = mappings.length;
    let mappedFields = 0;
    let needsReviewFields = 0;
    let customFields = 0;
    let ignoredFields = 0;
    let warningsCount = 0;

    mappings.forEach(m => {
        if (m.mappingType === 'IGNORE') {
            ignoredFields++;
        } else if (m.mappingType === 'CUSTOM_FIELD' || m.isCustomField) {
            customFields++;
            if (m.status === 'NEEDS_REVIEW') needsReviewFields++;
        } else if (m.targetField) {
            mappedFields++;
            if (m.status === 'NEEDS_REVIEW' || m.confidenceLevel === 'LOW') {
                needsReviewFields++;
                warningsCount++;
            }
        } else {
            needsReviewFields++;
        }
    });

    session.summary = {
        totalFiles,
        totalEntities: detectedEntities.length,
        totalFields,
        mappedFields,
        needsReviewFields,
        customFields,
        ignoredFields,
        warningsCount,
        errorsCount: 0
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTROLLERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/migrations
 * Create a new migration session.
 */
exports.createSession = async (req, res) => {
    try {
        const hospitalId = getActiveHospitalId(req);
        if (!hospitalId) {
            return res.status(400).json({ success: false, message: 'Hospital context is required.' });
        }

        const { MigrationSession } = resolveModels(req);

        // Generate human-friendly sequential ID: MIG-XXXXX
        const count = await MigrationSession.countDocuments({ hospitalId });
        const migrationId = `MIG-${String(count + 1).padStart(5, '0')}`;

        const newSession = await MigrationSession.create({
            migrationId,
            hospitalId,
            createdBy: req.user._id,
            createdByName: req.user.name || 'Hospital Admin',
            status: 'UPLOADED',
            files: [],
            detectedEntities: [],
            mappings: [],
            customFields: [],
            summary: {
                totalFiles: 0,
                totalEntities: 0,
                totalFields: 0,
                mappedFields: 0,
                needsReviewFields: 0,
                customFields: 0,
                ignoredFields: 0,
                warningsCount: 0,
                errorsCount: 0
            }
        });

        await recordAudit(req, 'MIGRATION_SESSION_CREATED', migrationId, newSession._id);

        return res.status(201).json({
            success: true,
            message: 'Migration session initialized.',
            session: newSession
        });
    } catch (err) {
        console.error('[createSession error]:', err);
        return res.status(500).json({ success: false, message: err.message });
    }
};

/**
 * POST /api/migrations/:migrationId/files
 * Upload files (CSV, XLS, XLSX, JSON) and extract initial metadata.
 */
exports.uploadFiles = async (req, res) => {
    try {
        const hospitalId = getActiveHospitalId(req);
        const { migrationId } = req.params;
        const files = req.files;

        if (!files || files.length === 0) {
            return res.status(400).json({ success: false, message: 'No files uploaded.' });
        }

        const { MigrationSession } = resolveModels(req);
        const session = await MigrationSession.findOne({ migrationId, hospitalId });

        if (!session) {
            return res.status(404).json({ success: false, message: `Migration session '${migrationId}' not found.` });
        }

        const newFileMetas = [];
        const entitiesSet = new Set(session.detectedEntities || []);

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const originalName = file.originalname;
            const ext = originalName.split('.').pop().toLowerCase();

            let fileType = 'CSV';
            if (ext === 'xlsx') fileType = 'XLSX';
            else if (ext === 'xls') fileType = 'XLS';
            else if (ext === 'json') fileType = 'JSON';
            else if (ext === 'csv') fileType = 'CSV';
            else {
                return res.status(400).json({
                    success: false,
                    message: `File '${originalName}' has unsupported format .${ext}. Only CSV, XLS, XLSX, and JSON are supported.`
                });
            }

            // Analyze file in memory
            const analysis = await analyzeFile(file.buffer, originalName, fileType);

            // Detect entity
            const entityResult = detectEntity(originalName, analysis.headers);
            entitiesSet.add(entityResult.entity);

            const fileId = `file_${Date.now()}_${i}`;

            // Save file buffer to disk for chunked Phase 2 processing
            const uploadDir = path.join(__dirname, '../../uploads/migrations');
            if (!fs.existsSync(uploadDir)) {
                fs.mkdirSync(uploadDir, { recursive: true });
            }
            const savedPath = path.join(uploadDir, `${migrationId}_${fileId}.${ext}`);
            fs.writeFileSync(savedPath, file.buffer);

            const fileMeta = {
                fileId,
                originalName,
                fileName: originalName,
                fileType,
                fileSize: file.size,
                rowCount: analysis.rowCount,
                columnCount: analysis.columnCount,
                sheetNames: analysis.sheetNames,
                headers: analysis.headers,
                sampleRows: analysis.sampleRows,
                columnTypes: analysis.columnTypes,
                detectedEntity: entityResult.entity,
                entityConfidence: entityResult.confidence,
                analysisStatus: 'COMPLETED',
                errorMessage: '',
                filePath: savedPath
            };

            newFileMetas.push(fileMeta);
        }

        session.files.push(...newFileMetas);
        session.detectedEntities = Array.from(entitiesSet);
        session.status = 'ANALYZING';
        recalculateSummary(session);

        await session.save();
        await recordAudit(req, 'MIGRATION_FILE_UPLOADED', `${newFileMetas.length} files to ${migrationId}`, session._id);

        return res.json({
            success: true,
            message: `Successfully analyzed ${newFileMetas.length} file(s).`,
            session
        });
    } catch (err) {
        console.error('[uploadFiles error]:', err);
        return res.status(500).json({ success: false, message: err.message });
    }
};

/**
 * POST /api/migrations/:migrationId/analyze
 * Re-run or complete analysis & entity detection on uploaded files.
 */
exports.analyzeSession = async (req, res) => {
    try {
        const hospitalId = getActiveHospitalId(req);
        const { migrationId } = req.params;
        const { MigrationSession } = resolveModels(req);

        const session = await MigrationSession.findOne({ migrationId, hospitalId });
        if (!session) {
            return res.status(404).json({ success: false, message: 'Session not found.' });
        }

        if (!session.files || session.files.length === 0) {
            return res.status(400).json({ success: false, message: 'Please upload files before analysis.' });
        }

        const entitiesSet = new Set();
        session.files.forEach(file => {
            const detection = detectEntity(file.originalName, file.headers);
            file.detectedEntity = detection.entity;
            file.entityConfidence = detection.confidence;
            file.analysisStatus = 'COMPLETED';
            entitiesSet.add(detection.entity);
        });

        session.detectedEntities = Array.from(entitiesSet);
        session.status = 'MAPPING_REVIEW';
        recalculateSummary(session);

        await session.save();
        await recordAudit(req, 'MIGRATION_SCHEMA_ANALYZED', migrationId, session._id);

        return res.json({
            success: true,
            message: 'Analysis completed successfully.',
            session
        });
    } catch (err) {
        console.error('[analyzeSession error]:', err);
        return res.status(500).json({ success: false, message: err.message });
    }
};

/**
 * POST /api/migrations/:migrationId/ai-mapping
 * Run AI mapping engine for all files/entities in the session.
 */
exports.generateAiMapping = async (req, res) => {
    try {
        const hospitalId = getActiveHospitalId(req);
        const { migrationId } = req.params;
        const { MigrationSession, MigrationTemplate } = resolveModels(req);

        const session = await MigrationSession.findOne({ migrationId, hospitalId });
        if (!session) {
            return res.status(404).json({ success: false, message: 'Session not found.' });
        }

        if (!session.files || session.files.length === 0) {
            return res.status(400).json({ success: false, message: 'Session has no uploaded files.' });
        }

        const allMappings = [];
        const userContext = {
            hospitalId,
            userId: req.user._id,
            userRole: req.user.role || 'hospitaladmin',
            userName: req.user.name || 'Hospital Admin'
        };

        for (const file of session.files) {
            const entity = file.detectedEntity || 'Patient';

            // Check if matching template exists for this entity
            const existingTemplate = await MigrationTemplate.findOne({ hospitalId, entity })
                .sort({ version: -1 });

            const fileMappings = await generateAIMappings({
                entity,
                fileName: file.originalName,
                headers: file.headers,
                sampleRows: file.sampleRows,
                existingTemplate,
                userContext
            });

            // Tag mappings with fileId
            fileMappings.forEach(m => {
                m.fileId = file.fileId;
                allMappings.push(m);
            });
        }

        session.mappings = allMappings;
        session.status = 'MAPPING_REVIEW';
        recalculateSummary(session);

        await session.save();
        await recordAudit(req, 'MIGRATION_AI_MAPPING_GENERATED', `${allMappings.length} fields mapped for ${migrationId}`, session._id);

        return res.json({
            success: true,
            message: `Successfully mapped ${allMappings.length} field(s).`,
            session
        });
    } catch (err) {
        console.error('[generateAiMapping error]:', err);
        return res.status(500).json({ success: false, message: err.message });
    }
};

/**
 * PUT /api/migrations/:migrationId/mapping
 * Update a specific field mapping manually.
 */
exports.updateMapping = async (req, res) => {
    try {
        const hospitalId = getActiveHospitalId(req);
        const { migrationId } = req.params;
        const { sourceField, targetField, mappingType, customFieldConfig, status } = req.body;

        if (!sourceField) {
            return res.status(400).json({ success: false, message: 'sourceField is required.' });
        }

        const { MigrationSession } = resolveModels(req);
        const session = await MigrationSession.findOne({ migrationId, hospitalId });
        if (!session) {
            return res.status(404).json({ success: false, message: 'Session not found.' });
        }

        const mappingIndex = session.mappings.findIndex(m => m.sourceField === sourceField);
        if (mappingIndex === -1) {
            return res.status(404).json({ success: false, message: `Field mapping for '${sourceField}' not found.` });
        }

        const currentMapping = session.mappings[mappingIndex];
        const entity = currentMapping.entity;

        const updatedRaw = {
            ...currentMapping.toObject(),
            targetField: targetField !== undefined ? targetField : currentMapping.targetField,
            mappingType: mappingType !== undefined ? mappingType : currentMapping.mappingType,
            customFieldConfig: customFieldConfig !== undefined ? customFieldConfig : currentMapping.customFieldConfig,
            status: status !== undefined ? status : 'ACCEPTED',
            isManuallyEdited: true
        };

        const validated = validateMappingItem(updatedRaw, entity);
        session.mappings[mappingIndex] = validated;
        recalculateSummary(session);

        await session.save();
        await recordAudit(req, 'MIGRATION_MAPPING_UPDATED', `${sourceField} -> ${validated.targetField || validated.mappingType}`, session._id);

        return res.json({
            success: true,
            message: `Mapping for '${sourceField}' updated.`,
            mapping: validated,
            summary: session.summary
        });
    } catch (err) {
        console.error('[updateMapping error]:', err);
        return res.status(500).json({ success: false, message: err.message });
    }
};

/**
 * POST /api/migrations/:migrationId/accept-high-confidence
 * Accept all mappings with confidence >= 90%.
 */
exports.acceptHighConfidence = async (req, res) => {
    try {
        const hospitalId = getActiveHospitalId(req);
        const { migrationId } = req.params;
        const { MigrationSession } = resolveModels(req);

        const session = await MigrationSession.findOne({ migrationId, hospitalId });
        if (!session) {
            return res.status(404).json({ success: false, message: 'Session not found.' });
        }

        let acceptedCount = 0;
        session.mappings.forEach(m => {
            if (m.confidence >= 0.90 && m.targetField && m.mappingType !== 'IGNORE') {
                m.status = 'ACCEPTED';
                acceptedCount++;
            }
        });

        recalculateSummary(session);
        await session.save();

        return res.json({
            success: true,
            message: `Accepted ${acceptedCount} high-confidence mapping(s). Medium and low confidence remain for review.`,
            session
        });
    } catch (err) {
        console.error('[acceptHighConfidence error]:', err);
        return res.status(500).json({ success: false, message: err.message });
    }
};

/**
 * POST /api/migrations/:migrationId/custom-field
 * Register a custom field for unmatched source data.
 */
exports.createCustomField = async (req, res) => {
    try {
        const hospitalId = getActiveHospitalId(req);
        const { migrationId } = req.params;
        const { entity, fieldLabel, fieldKey, dataType, sourceField, sourceFile } = req.body;

        if (!entity || !fieldLabel) {
            return res.status(400).json({ success: false, message: 'entity and fieldLabel are required.' });
        }

        const cleanKey = String(fieldKey || fieldLabel)
            .toLowerCase()
            .replace(/[^a-z0-9_]/g, '_')
            .replace(/^_+|_+$/g, '');

        const { MigrationSession, CustomFieldDefinition } = resolveModels(req);
        const session = await MigrationSession.findOne({ migrationId, hospitalId });
        if (!session) {
            return res.status(404).json({ success: false, message: 'Session not found.' });
        }

        // Create or update CustomFieldDefinition in tenant DB
        const customDef = await CustomFieldDefinition.findOneAndUpdate(
            { hospitalId, entity, fieldKey: cleanKey },
            {
                hospitalId,
                entity,
                fieldLabel: fieldLabel.trim(),
                fieldKey: cleanKey,
                dataType: dataType || 'Text',
                sourceMigrationId: migrationId,
                createdBy: req.user._id,
                isActive: true
            },
            { upsert: true, new: true }
        );

        // Add to session customFields list if not present
        const exists = (session.customFields || []).some(cf => cf.fieldKey === cleanKey && cf.entity === entity);
        if (!exists) {
            session.customFields.push({
                fieldId: `cf_${Date.now()}`,
                entity,
                fieldLabel: fieldLabel.trim(),
                fieldKey: cleanKey,
                dataType: dataType || 'Text',
                sourceField: sourceField || '',
                sourceFile: sourceFile || '',
                createdAt: new Date()
            });
        }

        // Update corresponding mapping item if sourceField is given
        if (sourceField) {
            const m = session.mappings.find(item => item.sourceField === sourceField);
            if (m) {
                m.mappingType = 'CUSTOM_FIELD';
                m.isCustomField = true;
                m.customFieldConfig = {
                    label: fieldLabel.trim(),
                    key: cleanKey,
                    dataType: dataType || 'Text'
                };
                m.status = 'ACCEPTED';
            }
        }

        recalculateSummary(session);
        await session.save();
        await recordAudit(req, 'MIGRATION_CUSTOM_FIELD_CREATED', `${cleanKey} (${entity})`, customDef._id);

        return res.status(201).json({
            success: true,
            message: `Custom field '${fieldLabel}' created successfully.`,
            customField: customDef,
            session
        });
    } catch (err) {
        console.error('[createCustomField error]:', err);
        return res.status(500).json({ success: false, message: err.message });
    }
};

/**
 * POST /api/migrations/:migrationId/approve
 * Final Phase 1 step: Approve mapping session.
 *
 * CRITICAL CONFIRMATION: DOES NOT IMPORT ACTUAL HOSPITAL RECORDS.
 */
exports.approveMapping = async (req, res) => {
    try {
        const hospitalId = getActiveHospitalId(req);
        const { migrationId } = req.params;
        const { MigrationSession } = resolveModels(req);

        const session = await MigrationSession.findOne({ migrationId, hospitalId });
        if (!session) {
            return res.status(404).json({ success: false, message: 'Session not found.' });
        }

        session.status = 'APPROVED';
        session.approvedAt = new Date();
        session.approvedBy = req.user._id;
        session.approvedByName = req.user.name || 'Hospital Admin';

        recalculateSummary(session);
        await session.save();

        await recordAudit(req, 'MIGRATION_MAPPING_APPROVED', `Mapping approved for ${migrationId}`, session._id);

        return res.json({
            success: true,
            message: 'Mapping approved. No hospital records have been imported yet.',
            phaseNote: 'PHASE 1 DOES NOT IMPORT ACTUAL HOSPITAL RECORDS.',
            session
        });
    } catch (err) {
        console.error('[approveMapping error]:', err);
        return res.status(500).json({ success: false, message: err.message });
    }
};

/**
 * POST /api/migrations/:migrationId/save-template
 * Save approved mapping as a reusable template.
 */
exports.saveTemplate = async (req, res) => {
    try {
        const hospitalId = getActiveHospitalId(req);
        const { migrationId } = req.params;
        const { templateName, notes } = req.body;

        const { MigrationSession, MigrationTemplate } = resolveModels(req);
        const session = await MigrationSession.findOne({ migrationId, hospitalId });
        if (!session) {
            return res.status(404).json({ success: false, message: 'Session not found.' });
        }

        const name = (templateName || `${session.detectedEntities.join(', ')} Mapping Template`).trim();
        const primaryEntity = session.detectedEntities[0] || 'Patient';
        const templateId = `TMPL-${Date.now()}`;

        const template = await MigrationTemplate.create({
            templateId,
            name,
            hospitalId,
            entity: primaryEntity,
            sourceFormat: session.files[0]?.fileType || 'Excel/CSV',
            sourceHeaders: session.files[0]?.headers || [],
            mappings: (session.mappings || []).map(m => ({
                sourceField: m.sourceField,
                targetField: m.targetField,
                targetFieldLabel: m.targetFieldLabel,
                mappingType: m.mappingType,
                confidence: m.confidence,
                reason: m.reason,
                isCustomField: m.isCustomField,
                customFieldConfig: m.customFieldConfig
            })),
            customFields: (session.customFields || []).map(cf => ({
                fieldLabel: cf.fieldLabel,
                fieldKey: cf.fieldKey,
                dataType: cf.dataType,
                sourceField: cf.sourceField
            })),
            createdBy: req.user._id,
            createdByName: req.user.name || 'Hospital Admin',
            sourceMigrationId: migrationId,
            notes: notes || ''
        });

        session.templateSaved = true;
        session.templateName = name;
        session.templateId = templateId;
        await session.save();

        await recordAudit(req, 'MIGRATION_TEMPLATE_SAVED', name, template._id);

        return res.status(201).json({
            success: true,
            message: `Mapping template '${name}' saved successfully.`,
            template,
            session
        });
    } catch (err) {
        console.error('[saveTemplate error]:', err);
        return res.status(500).json({ success: false, message: err.message });
    }
};

/**
 * GET /api/migrations
 * List migration session history for this hospital.
 */
exports.listSessions = async (req, res) => {
    try {
        const hospitalId = getActiveHospitalId(req);
        if (!hospitalId) {
            return res.status(400).json({ success: false, message: 'Hospital context is required.' });
        }

        const { MigrationSession } = resolveModels(req);
        const sessions = await MigrationSession.find({ hospitalId })
            .sort({ createdAt: -1 })
            .select('migrationId status files detectedEntities summary approvedAt createdByName createdAt updatedAt templateSaved templateName');

        // Calculate aggregate statistics for cards
        const totalMigrations = sessions.length;
        const inProgress = sessions.filter(s => ['UPLOADED', 'ANALYZING'].includes(s.status)).length;
        const awaitingMapping = sessions.filter(s => s.status === 'MAPPING_REVIEW').length;
        const approved = sessions.filter(s => s.status === 'APPROVED').length;

        return res.json({
            success: true,
            stats: {
                totalMigrations,
                inProgress,
                awaitingMapping,
                approved
            },
            sessions
        });
    } catch (err) {
        console.error('[listSessions error]:', err);
        return res.status(500).json({ success: false, message: err.message });
    }
};

/**
 * GET /api/migrations/:migrationId
 * Get full migration session details.
 */
exports.getSession = async (req, res) => {
    try {
        const hospitalId = getActiveHospitalId(req);
        const { migrationId } = req.params;
        const { MigrationSession } = resolveModels(req);

        const session = await MigrationSession.findOne({ migrationId, hospitalId });
        if (!session) {
            return res.status(404).json({ success: false, message: `Migration session '${migrationId}' not found.` });
        }

        return res.json({
            success: true,
            session
        });
    } catch (err) {
        console.error('[getSession error]:', err);
        return res.status(500).json({ success: false, message: err.message });
    }
};

/**
 * GET /api/migrations/templates
 * List saved mapping templates for this hospital.
 */
exports.listTemplates = async (req, res) => {
    try {
        const hospitalId = getActiveHospitalId(req);
        if (!hospitalId) {
            return res.status(400).json({ success: false, message: 'Hospital context is required.' });
        }

        const { MigrationTemplate } = resolveModels(req);
        const templates = await MigrationTemplate.find({ hospitalId })
            .sort({ createdAt: -1 });

        return res.json({
            success: true,
            templates
        });
    } catch (err) {
        console.error('[listTemplates error]:', err);
        return res.status(500).json({ success: false, message: err.message });
    }
};

/**
 * GET /api/migrations/canonical-schema
 * Return canonical fields for frontend dropdowns & verification.
 */
exports.getSchemaRegistry = async (req, res) => {
    try {
        const { entity } = req.query;
        if (entity) {
            const fields = getCanonicalFields(entity);
            return res.json({ success: true, entity, fields });
        }

        const entities = getSupportedEntities();
        const schemas = {};
        entities.forEach(ent => {
            schemas[ent] = getCanonicalFields(ent);
        });

        return res.json({
            success: true,
            entities,
            schemas
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 2 CONTROLLERS: TRANSFORMATION, VALIDATION & PREVIEW
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/migrations/:migrationId/prepare
 * Run data transformation, relationship resolution, duplicate detection, and validation.
 */
exports.prepareAndValidate = async (req, res) => {
    try {
        const hospitalId = getActiveHospitalId(req);
        const { migrationId } = req.params;
        const models = resolveModels(req);

        await recordAudit(req, 'MIGRATION_TRANSFORMATION_STARTED', migrationId);
        await recordAudit(req, 'MIGRATION_VALIDATION_STARTED', migrationId);

        const result = await runMigrationPipeline({
            hospitalId,
            migrationId,
            models,
            user: req.user
        });

        await recordAudit(req, 'MIGRATION_VALIDATION_COMPLETED', migrationId);
        await recordAudit(req, 'MIGRATION_PREVIEW_GENERATED', migrationId);

        return res.json({
            success: true,
            message: 'Data preparation, relationship resolution, duplicate detection, and validation completed.',
            status: result.status,
            previewSummary: result.previewSummary
        });
    } catch (err) {
        console.error('[prepareAndValidate error]:', err);
        return res.status(500).json({ success: false, message: err.message });
    }
};

/**
 * GET /api/migrations/:migrationId/preview
 * Returns preview summary, entity breakdowns, and session status.
 */
exports.getPreview = async (req, res) => {
    try {
        const hospitalId = getActiveHospitalId(req);
        const { migrationId } = req.params;
        const { MigrationSession } = resolveModels(req);

        const session = await MigrationSession.findOne({ hospitalId, migrationId }).lean();
        if (!session) {
            return res.status(404).json({ success: false, message: `Migration session '${migrationId}' not found.` });
        }

        return res.json({
            success: true,
            session: {
                migrationId: session.migrationId,
                status: session.status,
                previewSummary: session.previewSummary,
                detectedEntities: session.detectedEntities,
                files: (session.files || []).map(f => ({
                    fileId: f.fileId,
                    originalName: f.originalName,
                    fileType: f.fileType,
                    fileSize: f.fileSize,
                    rowCount: f.rowCount,
                    detectedEntity: f.detectedEntity
                })),
                customFields: session.customFields,
                createdAt: session.createdAt,
                approvedAt: session.approvedAt
            }
        });
    } catch (err) {
        console.error('[getPreview error]:', err);
        return res.status(500).json({ success: false, message: err.message });
    }
};

/**
 * GET /api/migrations/:migrationId/records
 * Paginated list of staged records with filters (entity, status, severity, search).
 */
exports.getStagedRecords = async (req, res) => {
    try {
        const hospitalId = getActiveHospitalId(req);
        const { migrationId } = req.params;
        const { entity, status, severity, search, page = 1, limit = 50 } = req.query;
        const { MigrationRecord } = resolveModels(req);

        const query = { hospitalId, migrationId };
        if (entity) query.entity = entity;
        if (status) query.status = status;
        if (severity) {
            query['issues.severity'] = severity;
        }
        if (search) {
            const sRegex = new RegExp(search.trim(), 'i');
            query.$or = [
                { stagingId: sRegex },
                { legacyId: sRegex },
                { 'transformedData.name': sRegex },
                { 'transformedData.phone': sRegex },
                { 'transformedData.uhid': sRegex }
            ];
        }

        const skip = (Math.max(1, parseInt(page, 10)) - 1) * parseInt(limit, 10);
        const totalRecords = await MigrationRecord.countDocuments(query);
        const records = await MigrationRecord.find(query)
            .sort({ rowNumber: 1 })
            .skip(skip)
            .limit(parseInt(limit, 10))
            .lean();

        return res.json({
            success: true,
            totalRecords,
            page: parseInt(page, 10),
            limit: parseInt(limit, 10),
            totalPages: Math.ceil(totalRecords / parseInt(limit, 10)) || 1,
            records
        });
    } catch (err) {
        console.error('[getStagedRecords error]:', err);
        return res.status(500).json({ success: false, message: err.message });
    }
};

/**
 * GET /api/migrations/:migrationId/records/:recordId
 * Single record detail (Source vs Transformed vs Validation issues vs Relationships).
 */
exports.getRecordDetail = async (req, res) => {
    try {
        const hospitalId = getActiveHospitalId(req);
        const { migrationId, recordId } = req.params;
        const { MigrationRecord } = resolveModels(req);

        const query = {
            hospitalId,
            migrationId,
            $or: [
                { stagingId: recordId },
                ...(mongoose.Types.ObjectId.isValid(recordId) ? [{ _id: recordId }] : [])
            ]
        };

        const record = await MigrationRecord.findOne(query).lean();
        if (!record) {
            return res.status(404).json({ success: false, message: `Staged record '${recordId}' not found.` });
        }

        return res.json({ success: true, record });
    } catch (err) {
        console.error('[getRecordDetail error]:', err);
        return res.status(500).json({ success: false, message: err.message });
    }
};

/**
 * PUT /api/migrations/:migrationId/records/:recordId/duplicate-decision
 * Sets duplicate resolution (USE_EXISTING, CREATE_NEW, SKIP).
 */
exports.updateDuplicateDecision = async (req, res) => {
    try {
        const hospitalId = getActiveHospitalId(req);
        const { migrationId, recordId } = req.params;
        const { resolution } = req.body;
        const { MigrationRecord, MigrationSession } = resolveModels(req);

        if (!['USE_EXISTING', 'CREATE_NEW', 'SKIP'].includes(resolution)) {
            return res.status(400).json({
                success: false,
                message: "Invalid duplicate resolution. Expected 'USE_EXISTING', 'CREATE_NEW', or 'SKIP'."
            });
        }

        const record = await MigrationRecord.findOne({
            hospitalId,
            migrationId,
            $or: [
                { stagingId: recordId },
                ...(mongoose.Types.ObjectId.isValid(recordId) ? [{ _id: recordId }] : [])
            ]
        });

        if (!record) {
            return res.status(404).json({ success: false, message: 'Record not found.' });
        }

        record.duplicateInfo.resolution = resolution;
        record.duplicateInfo.resolvedBy = req.user._id;
        record.duplicateInfo.resolvedAt = new Date();

        if (resolution === 'SKIP') {
            record.status = 'SKIPPED';
        } else if (resolution === 'USE_EXISTING') {
            const hasErrors = (record.issues || []).some(i => i.severity === 'ERROR');
            record.status = hasErrors ? 'ERROR' : 'VALID';
        } else if (resolution === 'CREATE_NEW') {
            const hasErrors = (record.issues || []).some(i => i.severity === 'ERROR');
            record.status = hasErrors ? 'ERROR' : 'WARNING';
        }

        await record.save();
        await recordAudit(req, 'MIGRATION_DUPLICATE_DECISION_CHANGED', `${record.stagingId} set to ${resolution}`, record._id);

        return res.json({
            success: true,
            message: `Duplicate resolution updated to '${resolution}'.`,
            record
        });
    } catch (err) {
        console.error('[updateDuplicateDecision error]:', err);
        return res.status(500).json({ success: false, message: err.message });
    }
};

/**
 * POST /api/migrations/:migrationId/mark-ready
 * Validates preview and transitions session status to READY_FOR_IMPORT.
 * CRITICAL: DOES NOT IMPORT ANY RECORDS INTO PRODUCTION.
 */
exports.markReadyForImport = async (req, res) => {
    try {
        const hospitalId = getActiveHospitalId(req);
        const { migrationId } = req.params;
        const { MigrationSession } = resolveModels(req);

        const session = await MigrationSession.findOne({ hospitalId, migrationId });
        if (!session) {
            return res.status(404).json({ success: false, message: 'Session not found.' });
        }

        if (!['PREVIEW_READY', 'REVIEW_REQUIRED'].includes(session.status)) {
            return res.status(400).json({
                success: false,
                message: `Cannot mark session as ready for import from status '${session.status}'. Must be in PREVIEW_READY or REVIEW_REQUIRED.`
            });
        }

        session.status = 'READY_FOR_IMPORT';
        await session.save();

        await recordAudit(req, 'MIGRATION_MARKED_READY_FOR_IMPORT', migrationId, session._id);

        return res.json({
            success: true,
            message: 'Migration session successfully marked as READY_FOR_IMPORT. No hospital records were imported into production.',
            status: session.status
        });
    } catch (err) {
        console.error('[markReadyForImport error]:', err);
        return res.status(500).json({ success: false, message: err.message });
    }
};

/**
 * GET /api/migrations/:migrationId/export-report
 * Download a CSV validation report of all staged records and identified issues.
 */
exports.exportValidationReport = async (req, res) => {
    try {
        const hospitalId = getActiveHospitalId(req);
        const { migrationId } = req.params;
        const { MigrationRecord, MigrationSession } = resolveModels(req);

        const session = await MigrationSession.findOne({ hospitalId, migrationId }).lean();
        if (!session) {
            return res.status(404).json({ success: false, message: 'Session not found.' });
        }

        const records = await MigrationRecord.find({ hospitalId, migrationId })
            .sort({ entity: 1, rowNumber: 1 })
            .lean();

        const csvHeaders = ['Entity', 'Row Number', 'Staging ID', 'Legacy ID', 'Status', 'Issue Category', 'Severity', 'Field', 'Message', 'Current Value'];
        const lines = [csvHeaders.join(',')];

        for (const rec of records) {
            if (rec.issues && rec.issues.length > 0) {
                for (const issue of rec.issues) {
                    const row = [
                        `"${rec.entity || ''}"`,
                        rec.rowNumber || '',
                        `"${rec.stagingId || ''}"`,
                        `"${rec.legacyId || ''}"`,
                        `"${rec.status || ''}"`,
                        `"${issue.category || ''}"`,
                        `"${issue.severity || ''}"`,
                        `"${issue.field || ''}"`,
                        `"${(issue.message || '').replace(/"/g, '""')}"`,
                        `"${(issue.currentValue || '').replace(/"/g, '""')}"`
                    ];
                    lines.push(row.join(','));
                }
            } else {
                const row = [
                    `"${rec.entity || ''}"`,
                    rec.rowNumber || '',
                    `"${rec.stagingId || ''}"`,
                    `"${rec.legacyId || ''}"`,
                    `"${rec.status || ''}"`,
                    '""',
                    '""',
                    '""',
                    '"Valid Record"',
                    '""'
                ];
                lines.push(row.join(','));
            }
        }

        const csvString = lines.join('\n');
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="migration_preview_report_${migrationId}.csv"`);
        return res.send(csvString);
    } catch (err) {
        console.error('[exportValidationReport error]:', err);
        return res.status(500).json({ success: false, message: err.message });
    }
};

/**
 * POST /api/migrations/:migrationId/import
 * Phase 3: Execute safe production import.
 *
 * Verifies authentication, tenant isolation, READY_FOR_IMPORT status,
 * maps foreign relationships using identityMap, and applies idempotency.
 */
exports.executeImport = async (req, res) => {
    try {
        const hospitalId = getActiveHospitalId(req);
        const { migrationId } = req.params;
        const models = resolveModels(req);

        // Pre-flight check
        const session = await models.MigrationSession.findOne({ hospitalId, migrationId });
        if (!session) {
            return res.status(404).json({ success: false, message: 'Migration session not found.' });
        }

        const allowedStatuses = ['READY_FOR_IMPORT', 'COMPLETED_WITH_WARNINGS', 'PREVIEW_READY', 'COMPLETED'];
        if (!allowedStatuses.includes(session.status)) {
            return res.status(400).json({
                success: false,
                message: `Cannot start import from status '${session.status}'. Session must be certified 'READY_FOR_IMPORT'.`
            });
        }

        await recordAudit(req, 'MIGRATION_IMPORT_STARTED', `Production import started for ${migrationId}`, session._id);

        // Run safe production import engine
        const result = await executeMigrationImport({
            hospitalId,
            migrationId,
            models,
            user: req.user
        });

        const auditAction = result.status === 'COMPLETED' ? 'MIGRATION_IMPORT_COMPLETED' : 'MIGRATION_IMPORT_COMPLETED';
        await recordAudit(req, auditAction, `Import completed with status ${result.status} for ${migrationId}`, session._id);
        await recordAudit(req, 'MIGRATION_VERIFICATION_COMPLETED', `Verification ${result.importSummary?.verification?.status} for ${migrationId}`, session._id);

        return res.json({
            success: true,
            message: `Migration import finished with status: ${result.status}`,
            status: result.status,
            importSummary: result.importSummary
        });
    } catch (err) {
        console.error('[executeImport error]:', err);
        try {
            await recordAudit(req, 'MIGRATION_IMPORT_FAILED', `Import failed for ${req.params.migrationId}: ${err.message}`);
        } catch (_) {}
        return res.status(500).json({ success: false, message: err.message });
    }
};

/**
 * GET /api/migrations/:migrationId/import-progress
 * Returns real-time import progress and stage for frontend polling.
 */
exports.getImportProgress = async (req, res) => {
    try {
        const hospitalId = getActiveHospitalId(req);
        const { migrationId } = req.params;
        const { MigrationSession } = resolveModels(req);

        const session = await MigrationSession.findOne({ hospitalId, migrationId })
            .select('migrationId status importProgress importSummary')
            .lean();

        if (!session) {
            return res.status(404).json({ success: false, message: 'Session not found.' });
        }

        return res.json({
            success: true,
            status: session.status,
            importProgress: session.importProgress || {
                currentStage: '',
                processedRecords: 0,
                totalRecords: 0,
                percent: 0
            },
            importSummary: session.importSummary || null
        });
    } catch (err) {
        console.error('[getImportProgress error]:', err);
        return res.status(500).json({ success: false, message: err.message });
    }
};

/**
 * GET /api/migrations/:migrationId/failed-records
 * Returns list of failed staged records with error reason and pagination.
 */
exports.getFailedRecords = async (req, res) => {
    try {
        const hospitalId = getActiveHospitalId(req);
        const { migrationId } = req.params;
        const { MigrationRecord } = resolveModels(req);

        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
        const skip = (page - 1) * limit;

        const query = {
            hospitalId,
            migrationId,
            importStatus: 'FAILED'
        };

        if (req.query.entity && req.query.entity !== 'ALL') {
            query.entity = req.query.entity;
        }

        const [records, totalFailed] = await Promise.all([
            MigrationRecord.find(query)
                .sort({ rowNumber: 1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            MigrationRecord.countDocuments(query)
        ]);

        return res.json({
            success: true,
            records,
            totalFailed,
            page,
            totalPages: Math.ceil(totalFailed / limit)
        });
    } catch (err) {
        console.error('[getFailedRecords error]:', err);
        return res.status(500).json({ success: false, message: err.message });
    }
};

/**
 * GET /api/migrations/:migrationId/export-failed-report
 * Download CSV report of records that failed during import or validation.
 */
exports.exportFailedReport = async (req, res) => {
    try {
        const hospitalId = getActiveHospitalId(req);
        const { migrationId } = req.params;
        const { MigrationRecord, MigrationSession } = resolveModels(req);

        const session = await MigrationSession.findOne({ hospitalId, migrationId }).lean();
        if (!session) {
            return res.status(404).json({ success: false, message: 'Session not found.' });
        }

        const failedRecords = await MigrationRecord.find({
            hospitalId,
            migrationId,
            importStatus: 'FAILED'
        }).sort({ entity: 1, rowNumber: 1 }).lean();

        const csvHeaders = ['Entity', 'Row Number', 'Staging ID', 'Legacy ID', 'Failure Reason', 'Phase 2 Issues', 'Source Data Summary'];
        const lines = [csvHeaders.join(',')];

        for (const rec of failedRecords) {
            const issuesSummary = (rec.issues || []).map(i => `[${i.category}] ${i.message}`).join('; ');
            const sourceSummary = Object.entries(rec.sourceData || {})
                .slice(0, 5)
                .map(([k, v]) => `${k}:${v}`)
                .join(' | ');

            const row = [
                `"${rec.entity || ''}"`,
                rec.rowNumber || '',
                `"${rec.stagingId || ''}"`,
                `"${rec.legacyId || ''}"`,
                `"${(rec.importError || 'Import failed').replace(/"/g, '""')}"`,
                `"${issuesSummary.replace(/"/g, '""')}"`,
                `"${sourceSummary.replace(/"/g, '""')}"`
            ];
            lines.push(row.join(','));
        }

        const csvString = lines.join('\n');
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="migration_failed_records_${migrationId}.csv"`);
        return res.send(csvString);
    } catch (err) {
        console.error('[exportFailedReport error]:', err);
        return res.status(500).json({ success: false, message: err.message });
    }
};


