const mongoose = require('mongoose');

// 1. Specimen Type Schema
const labSpecimenTypeSchema = new mongoose.Schema({
    hospitalId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Hospital',
        default: null,
        index: true
    },
    specimenCode: {
        type: String,
        uppercase: true,
        trim: true
    },
    code: {
        type: String,
        uppercase: true,
        trim: true
    },
    specimenName: {
        type: String,
        trim: true
    },
    name: {
        type: String,
        trim: true
    },
    description: {
        type: String,
        default: ''
    },
    defaultVolume: {
        type: String,
        default: ''
    },
    collectionMethod: {
        type: String,
        default: ''
    },
    storageTemperature: {
        type: String,
        default: ''
    },
    stabilityHours: {
        type: Number,
        default: 24
    },
    isActive: {
        type: Boolean,
        default: true
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    }
}, {
    timestamps: true
});

labSpecimenTypeSchema.pre('validate', function(next) {
    if (this.name && !this.specimenName) this.specimenName = this.name;
    if (this.specimenName && !this.name) this.name = this.specimenName;
    if (this.code && !this.specimenCode) this.specimenCode = this.code;
    if (this.specimenCode && !this.code) this.code = this.specimenCode;
    next();
});

labSpecimenTypeSchema.index({ hospitalId: 1, specimenCode: 1 });

// 2. Container Type Schema
const labContainerTypeSchema = new mongoose.Schema({
    hospitalId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Hospital',
        default: null,
        index: true
    },
    containerCode: {
        type: String,
        uppercase: true,
        trim: true
    },
    code: {
        type: String,
        uppercase: true,
        trim: true
    },
    containerName: {
        type: String,
        trim: true
    },
    name: {
        type: String,
        trim: true
    },
    tubeColor: {
        type: String,
        default: 'Lavender',
        trim: true
    },
    capColor: {
        type: String,
        default: '',
        trim: true
    },
    colorCode: {
        type: String,
        default: '',
        trim: true
    },
    additive: {
        type: String,
        default: '',
        trim: true
    },
    defaultVolume: {
        type: String,
        default: ''
    },
    minimumVolume: {
        type: String,
        default: '1 ml'
    },
    maximumVolume: {
        type: String,
        default: '5 ml'
    },
    instructions: {
        type: String,
        default: ''
    },
    specimenCompatibility: [{
        type: String,
        trim: true
    }],
    labelColor: {
        type: String,
        default: '#8b5cf6'
    },
    isActive: {
        type: Boolean,
        default: true
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    }
}, {
    timestamps: true
});

labContainerTypeSchema.pre('validate', function(next) {
    if (this.name && !this.containerName) this.containerName = this.name;
    if (this.containerName && !this.name) this.name = this.containerName;
    if (this.code && !this.containerCode) this.containerCode = this.code;
    if (this.containerCode && !this.code) this.code = this.containerCode;
    if (this.capColor && !this.tubeColor) this.tubeColor = this.capColor;
    if (this.tubeColor && !this.capColor) this.capColor = this.tubeColor;
    next();
});

labContainerTypeSchema.index({ hospitalId: 1, containerCode: 1 });

const LabSpecimenType = mongoose.model('LabSpecimenType', labSpecimenTypeSchema);
const LabContainerType = mongoose.model('LabContainerType', labContainerTypeSchema);

module.exports = {
    LabSpecimenType,
    LabContainerType
};
