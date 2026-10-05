const mongoose = require('mongoose');

const issueSchema = new mongoose.Schema({
    category: { 
        type: String, 
        enum: [
            'STRUCTURE', 'TRANSFORMATION', 'REQUIRED_FIELD', 'FORMAT', 
            'ENUM', 'RELATIONSHIP', 'DUPLICATE', 'BUSINESS_RULE', 'CUSTOM_FIELD'
        ],
        required: true 
    },
    severity: { 
        type: String, 
        enum: ['ERROR', 'WARNING', 'INFO'], 
        required: true 
    },
    field: { type: String, default: '' },
    message: { type: String, required: true },
    currentValue: { type: String, default: '' },
    suggestedAction: { type: String, default: '' }
}, { _id: false });

const relationshipItemSchema = new mongoose.Schema({
    field: { type: String, required: true },
    targetEntity: { type: String, required: true },
    legacyId: { type: String, required: true },
    resolvedStagingId: { type: String, default: null },
    status: { 
        type: String, 
        enum: ['RESOLVED', 'UNRESOLVED', 'OPTIONAL_MISSING'], 
        default: 'UNRESOLVED' 
    },
    error: { type: String, default: '' }
}, { _id: false });

const duplicateInfoSchema = new mongoose.Schema({
    matchType: { 
        type: String, 
        enum: ['EXACT_DUPLICATE', 'POSSIBLE_DUPLICATE', 'NO_MATCH'], 
        default: 'NO_MATCH' 
    },
    matchedRecordId: { type: String, default: null },
    matchedRecordSummary: { type: String, default: '' },
    matchedFields: [{ type: String }],
    resolution: { 
        type: String, 
        enum: ['PENDING', 'USE_EXISTING', 'CREATE_NEW', 'SKIP'], 
        default: 'PENDING' 
    },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    resolvedAt: { type: Date, default: null }
}, { _id: false });

const migrationRecordSchema = new mongoose.Schema({
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
    sourceFileId: { type: String, required: true },
    entity: { 
        type: String, 
        required: true, 
        index: true 
    },
    rowNumber: { type: Number, required: true },
    stagingId: { 
        type: String, 
        required: true, 
        index: true 
    },
    legacyId: { 
        type: String, 
        default: '', 
        trim: true, 
        index: true 
    },
    sourceData: { type: mongoose.Schema.Types.Mixed, default: {} },
    transformedData: { type: mongoose.Schema.Types.Mixed, default: {} },
    status: { 
        type: String, 
        enum: ['VALID', 'WARNING', 'ERROR', 'DUPLICATE', 'SKIPPED'], 
        default: 'VALID', 
        index: true 
    },
    issues: [issueSchema],
    relationships: [relationshipItemSchema],
    duplicateInfo: { type: duplicateInfoSchema, default: () => ({ matchType: 'NO_MATCH', resolution: 'PENDING' }) },
    
    // Phase 3: Actual Import & Target Mapping
    importedRecordId: { type: mongoose.Schema.Types.ObjectId, default: null },
    importedEntity: { type: String, default: null },
    importStatus: { 
        type: String, 
        enum: ['PENDING', 'IMPORTED', 'SKIPPED', 'FAILED'], 
        default: 'PENDING',
        index: true 
    },
    importError: { type: String, default: '' },
    importedAt: { type: Date, default: null }
}, {
    timestamps: true
});

migrationRecordSchema.index({ hospitalId: 1, migrationId: 1, entity: 1 });
migrationRecordSchema.index({ hospitalId: 1, migrationId: 1, status: 1 });
migrationRecordSchema.index({ hospitalId: 1, migrationId: 1, legacyId: 1 });
migrationRecordSchema.index({ hospitalId: 1, migrationId: 1, importStatus: 1 });
migrationRecordSchema.index({ hospitalId: 1, stagingId: 1 }, { unique: true });

module.exports = mongoose.model('MigrationRecord', migrationRecordSchema);
module.exports.migrationRecordSchema = migrationRecordSchema;
