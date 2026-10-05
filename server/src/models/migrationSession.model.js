const mongoose = require('mongoose');

const fileMetaSchema = new mongoose.Schema({
    fileId: { type: String, required: true },
    originalName: { type: String, required: true },
    fileName: { type: String, required: true },
    fileType: { type: String, enum: ['CSV', 'XLS', 'XLSX', 'JSON'], required: true },
    fileSize: { type: Number, required: true },
    rowCount: { type: Number, default: 0 },
    columnCount: { type: Number, default: 0 },
    sheetNames: [{ type: String }],
    headers: [{ type: String }],
    sampleRows: [mongoose.Schema.Types.Mixed],
    columnTypes: { type: Map, of: String, default: {} },
    detectedEntity: { type: String, default: 'Unknown' },
    entityConfidence: { type: Number, default: 0 },
    analysisStatus: { 
        type: String, 
        enum: ['PENDING', 'ANALYZING', 'COMPLETED', 'FAILED'], 
        default: 'PENDING' 
    },
    errorMessage: { type: String, default: '' },
    filePath: { type: String, default: '' },
    uploadedAt: { type: Date, default: Date.now }
}, { _id: false });

const mappingItemSchema = new mongoose.Schema({
    fileId: { type: String, required: true },
    entity: { type: String, required: true },
    sourceField: { type: String, required: true },
    targetField: { type: String, default: null },
    targetFieldLabel: { type: String, default: '' },
    mappingType: { 
        type: String, 
        enum: ['DIRECT', 'COMBINED', 'TRANSFORM', 'CUSTOM_FIELD', 'IGNORE', 'UNMAPPED'], 
        default: 'UNMAPPED' 
    },
    confidence: { type: Number, default: 0 }, // 0.0 - 1.0
    confidenceLevel: { 
        type: String, 
        enum: ['HIGH', 'MEDIUM', 'LOW'], 
        default: 'LOW' 
    },
    sampleValue: { type: String, default: '' },
    reason: { type: String, default: '' },
    isCustomField: { type: Boolean, default: false },
    customFieldConfig: {
        label: { type: String, default: '' },
        key: { type: String, default: '' },
        dataType: { type: String, default: 'Text' }
    },
    isManuallyEdited: { type: Boolean, default: false },
    status: { 
        type: String, 
        enum: ['PENDING', 'ACCEPTED', 'IGNORED', 'NEEDS_REVIEW'], 
        default: 'PENDING' 
    }
}, { _id: false });

const customFieldSchema = new mongoose.Schema({
    fieldId: { type: String, required: true },
    entity: { type: String, required: true },
    fieldLabel: { type: String, required: true },
    fieldKey: { type: String, required: true },
    dataType: { 
        type: String, 
        enum: ['Text', 'Number', 'Date', 'Boolean', 'Select'], 
        default: 'Text' 
    },
    sourceField: { type: String, default: '' },
    sourceFile: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now }
}, { _id: false });

const migrationSessionSchema = new mongoose.Schema({
    migrationId: { 
        type: String, 
        required: true, 
        trim: true,
        index: true 
    },
    hospitalId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Hospital', 
        required: true, 
        index: true 
    },
    createdBy: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true 
    },
    createdByName: { type: String, default: 'Hospital Admin' },
    status: { 
        type: String, 
        enum: [
            'UPLOADED', 'ANALYZING', 'MAPPING_REVIEW', 'APPROVED',
            'PREPARING', 'TRANSFORMING', 'VALIDATING',
            'PREVIEW_READY', 'REVIEW_REQUIRED', 'READY_FOR_IMPORT',
            'IMPORTING', 'VERIFYING', 'COMPLETED', 'COMPLETED_WITH_WARNINGS', 'FAILED'
        ], 
        default: 'UPLOADED',
        index: true 
    },
    files: [fileMetaSchema],
    detectedEntities: [{ type: String }],
    mappings: [mappingItemSchema],
    customFields: [customFieldSchema],
    summary: {
        totalFiles: { type: Number, default: 0 },
        totalEntities: { type: Number, default: 0 },
        totalFields: { type: Number, default: 0 },
        mappedFields: { type: Number, default: 0 },
        needsReviewFields: { type: Number, default: 0 },
        customFields: { type: Number, default: 0 },
        ignoredFields: { type: Number, default: 0 },
        warningsCount: { type: Number, default: 0 },
        errorsCount: { type: Number, default: 0 }
    },
    previewSummary: {
        totalRecords: { type: Number, default: 0 },
        validRecords: { type: Number, default: 0 },
        warningRecords: { type: Number, default: 0 },
        errorRecords: { type: Number, default: 0 },
        duplicateRecords: { type: Number, default: 0 },
        skippedRecords: { type: Number, default: 0 },
        entitiesBreakdown: [{
            entity: { type: String },
            totalRecords: { type: Number, default: 0 },
            valid: { type: Number, default: 0 },
            warnings: { type: Number, default: 0 },
            errors: { type: Number, default: 0 },
            duplicates: { type: Number, default: 0 },
            skipped: { type: Number, default: 0 }
        }],
        relationshipsSummary: {
            totalReferences: { type: Number, default: 0 },
            resolvedReferences: { type: Number, default: 0 },
            brokenReferences: { type: Number, default: 0 }
        },
        processedAt: { type: Date, default: null }
    },
    importProgress: {
        currentStage: { type: String, default: '' },
        processedRecords: { type: Number, default: 0 },
        totalRecords: { type: Number, default: 0 },
        percent: { type: Number, default: 0 }
    },
    importSummary: {
        totalSourceRecords: { type: Number, default: 0 },
        successfullyImported: { type: Number, default: 0 },
        failed: { type: Number, default: 0 },
        skipped: { type: Number, default: 0 },
        warnings: { type: Number, default: 0 },
        entitiesBreakdown: [{
            entity: { type: String },
            sourceCount: { type: Number, default: 0 },
            imported: { type: Number, default: 0 },
            failed: { type: Number, default: 0 },
            skipped: { type: Number, default: 0 },
            warnings: { type: Number, default: 0 }
        }],
        verification: {
            status: { type: String, enum: ['PENDING', 'PASSED', 'WARNING', 'FAILED'], default: 'PENDING' },
            checks: [{
                name: { type: String },
                passed: { type: Boolean },
                message: { type: String }
            }],
            verifiedAt: { type: Date, default: null }
        },
        startedAt: { type: Date, default: null },
        completedAt: { type: Date, default: null }
    },
    approvedAt: { type: Date, default: null },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    approvedByName: { type: String, default: '' },
    templateSaved: { type: Boolean, default: false },
    templateName: { type: String, default: '' },
    templateId: { type: String, default: '' },
    notes: { type: String, default: '' }
}, {
    timestamps: true
});

migrationSessionSchema.index({ hospitalId: 1, migrationId: 1 }, { unique: true });
migrationSessionSchema.index({ hospitalId: 1, createdAt: -1 });
migrationSessionSchema.index({ hospitalId: 1, status: 1 });

module.exports = mongoose.model('MigrationSession', migrationSessionSchema);
module.exports.migrationSessionSchema = migrationSessionSchema;
