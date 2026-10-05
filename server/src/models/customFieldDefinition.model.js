const mongoose = require('mongoose');

const customFieldDefinitionSchema = new mongoose.Schema({
    hospitalId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Hospital', 
        required: true, 
        index: true 
    },
    entity: { 
        type: String, 
        required: true, 
        enum: [
            'Patient', 'Doctor', 'Appointment', 'Admission', 
            'Department', 'Service', 'Medicine', 'Inventory', 
            'Payment', 'Invoice', 'Lab', 'Prescription'
        ],
        index: true 
    },
    fieldLabel: { 
        type: String, 
        required: [true, 'Field label is required'], 
        trim: true 
    },
    fieldKey: { 
        type: String, 
        required: [true, 'Field key is required'], 
        trim: true,
        lowercase: true,
        match: /^[a-z0-9_]+$/
    },
    dataType: { 
        type: String, 
        enum: ['Text', 'Number', 'Date', 'Boolean', 'Select'], 
        default: 'Text' 
    },
    options: [{ type: String }], // if dataType is Select
    description: { type: String, default: '' },
    sourceMigrationId: { type: String, default: '' },
    createdBy: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true 
    },
    isActive: { type: Boolean, default: true }
}, {
    timestamps: true
});

customFieldDefinitionSchema.index({ hospitalId: 1, entity: 1, fieldKey: 1 }, { unique: true });
customFieldDefinitionSchema.index({ hospitalId: 1, isActive: 1 });

module.exports = mongoose.model('CustomFieldDefinition', customFieldDefinitionSchema);
module.exports.customFieldDefinitionSchema = customFieldDefinitionSchema;
