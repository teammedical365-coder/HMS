const mongoose = require('mongoose');

const templateMappingSchema = new mongoose.Schema({
    sourceField: { type: String, required: true },
    targetField: { type: String, default: null },
    targetFieldLabel: { type: String, default: '' },
    mappingType: { 
        type: String, 
        enum: ['DIRECT', 'COMBINED', 'TRANSFORM', 'CUSTOM_FIELD', 'IGNORE', 'UNMAPPED'], 
        default: 'DIRECT' 
    },
    confidence: { type: Number, default: 1.0 },
    reason: { type: String, default: '' },
    isCustomField: { type: Boolean, default: false },
    customFieldConfig: {
        label: { type: String, default: '' },
        key: { type: String, default: '' },
        dataType: { type: String, default: 'Text' }
    }
}, { _id: false });

const templateCustomFieldSchema = new mongoose.Schema({
    fieldLabel: { type: String, required: true },
    fieldKey: { type: String, required: true },
    dataType: { 
        type: String, 
        enum: ['Text', 'Number', 'Date', 'Boolean', 'Select'], 
        default: 'Text' 
    },
    sourceField: { type: String, default: '' }
}, { _id: false });

const migrationTemplateSchema = new mongoose.Schema({
    templateId: { 
        type: String, 
        required: true, 
        trim: true,
        index: true 
    },
    name: { 
        type: String, 
        required: [true, 'Template name is required'], 
        trim: true 
    },
    hospitalId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Hospital', 
        required: true, 
        index: true 
    },
    entity: { 
        type: String, 
        required: true, 
        trim: true,
        index: true 
    },
    sourceFormat: { type: String, default: 'Excel/CSV' },
    sourceHeaders: [{ type: String }],
    mappings: [templateMappingSchema],
    customFields: [templateCustomFieldSchema],
    version: { type: Number, default: 1 },
    createdBy: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true 
    },
    createdByName: { type: String, default: 'Hospital Admin' },
    sourceMigrationId: { type: String, default: '' },
    notes: { type: String, default: '' }
}, {
    timestamps: true
});

migrationTemplateSchema.index({ hospitalId: 1, templateId: 1 }, { unique: true });
migrationTemplateSchema.index({ hospitalId: 1, entity: 1 });
migrationTemplateSchema.index({ hospitalId: 1, createdAt: -1 });

module.exports = mongoose.model('MigrationTemplate', migrationTemplateSchema);
module.exports.migrationTemplateSchema = migrationTemplateSchema;
