const mongoose = require('mongoose');

const objectiveElementSchema = new mongoose.Schema({
    elementCode: { type: String, required: true, trim: true }, // e.g. AAC.1.a
    description: { type: String, required: true, trim: true },
    category: {
        type: String,
        enum: ['CORE', 'COMMITMENT', 'ACHIEVEMENT', 'EXCELLENCE'],
        default: 'COMMITMENT'
    },
    verificationCriteria: { type: String, default: '', trim: true },
    requiredDocuments: [{ type: String, trim: true }]
}, { _id: true });

const nabhStandardSchema = new mongoose.Schema({
    edition: { type: String, default: '6th Edition', trim: true },
    chapterCode: {
        type: String,
        required: true,
        enum: ['AAC', 'COP', 'MOM', 'PRE', 'HIC', 'PSQ', 'ROM', 'FMS', 'HRM', 'IMS'],
        index: true
    },
    chapterName: { type: String, required: true, trim: true },
    standardCode: { type: String, required: true, trim: true, index: true }, // e.g. AAC.1, COP.2
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    objectiveElements: { type: [objectiveElementSchema], default: [] },
    sortOrder: { type: Number, default: 0 }
}, { timestamps: true });

nabhStandardSchema.index({ edition: 1, chapterCode: 1, standardCode: 1 }, { unique: true });

module.exports = mongoose.model('NabhStandard', nabhStandardSchema);
module.exports.nabhStandardSchema = nabhStandardSchema;

