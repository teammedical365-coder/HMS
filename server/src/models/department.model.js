const mongoose = require('mongoose');

const departmentSchema = new mongoose.Schema({
    hospitalId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Hospital',
        index: true
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        trim: true
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, { timestamps: true });

// Cloud -> Local Sync Plugin
const syncModelPlugin = require('../services/localAgent/syncModelPlugin');
departmentSchema.plugin(syncModelPlugin, { entityType: 'Department' });

module.exports = mongoose.model('Department', departmentSchema);
