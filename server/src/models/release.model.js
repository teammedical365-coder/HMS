const mongoose = require('mongoose');

const releaseSchema = new mongoose.Schema(
    {
        releaseId: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            index: true,
        },
        type: {
            type: String,
            required: true,
            enum: ['APK_BUILD', 'OTA_UPDATE'],
            default: 'OTA_UPDATE',
            index: true,
        },
        channel: {
            type: String,
            required: true,
            trim: true,
            default: 'production',
            index: true,
        },
        versionCode: {
            type: Number,
            default: null,
            index: true,
        },
        versionName: {
            type: String,
            trim: true,
            default: '1.0.0',
        },
        runtimeVersion: {
            type: String,
            trim: true,
            default: '1.0.0',
            index: true,
        },
        targetCommitSha: {
            type: String,
            trim: true,
            default: '',
        },
        easUpdateId: {
            type: String,
            trim: true,
            default: '',
            index: true,
        },
        checksumSha256: {
            type: String,
            trim: true,
            default: '',
        },
        status: {
            type: String,
            required: true,
            enum: ['DRAFT', 'DISPATCHED', 'BUILDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'ROLLED_BACK'],
            default: 'DRAFT',
            index: true,
        },
        releaseNotes: {
            type: String,
            trim: true,
            default: '',
        },
        dispatchedBy: {
            type: String,
            trim: true,
            default: 'superadmin',
        },
        hospitalId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Hospital',
            default: null,
            index: true,
        },
        applicationId: {
            type: String,
            trim: true,
            default: '',
        },
        downloadCount: {
            type: Number,
            default: 0,
            min: 0,
        },
        updateCheckCount: {
            type: Number,
            default: 0,
            min: 0,
        },
        error: {
            type: String,
            default: '',
        },
        metadata: {
            type: mongoose.Schema.Types.Mixed,
            default: {},
        },
    },
    {
        timestamps: true,
        bufferCommands: false,
    }
);

releaseSchema.index({ channel: 1, runtimeVersion: 1, createdAt: -1 });

module.exports = mongoose.model('Release', releaseSchema);
