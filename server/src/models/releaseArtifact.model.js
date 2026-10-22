const mongoose = require('mongoose');

const releaseArtifactSchema = new mongoose.Schema(
    {
        storageKey: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            index: true,
        },
        artifactType: {
            type: String,
            required: true,
            enum: ['APK', 'AAB'],
            index: true,
        },
        fileName: {
            type: String,
            required: true,
            trim: true,
        },
        fileSize: {
            type: Number,
            required: true,
            min: 1,
        },
        checksumSha256: {
            type: String,
            required: true,
            trim: true,
            match: /^[a-fA-F0-9]{64}$/,
            index: true,
        },
        versionCode: {
            type: Number,
            required: true,
            min: 1,
            index: true,
        },
        versionName: {
            type: String,
            required: true,
            trim: true,
        },
        applicationId: {
            type: String,
            required: true,
            trim: true,
            index: true,
        },
        tenantId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Hospital',
            default: null,
            index: true,
        },
        rnBuildId: {
            type: String,
            trim: true,
            default: '',
            index: true,
        },
        releaseId: {
            type: String,
            trim: true,
            default: '',
            index: true,
        },
        provider: {
            type: String,
            required: true,
            enum: ['s3', 'imagekit', 'local', 'mock'],
            default: 'local',
        },
        publicUrl: {
            type: String,
            trim: true,
            default: '',
        },
        downloadCount: {
            type: Number,
            default: 0,
            min: 0,
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

// Compound index for fast retrieval of latest version artifacts per application
releaseArtifactSchema.index({ applicationId: 1, artifactType: 1, versionCode: -1 });

module.exports = mongoose.model('ReleaseArtifact', releaseArtifactSchema);
