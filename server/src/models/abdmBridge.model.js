const mongoose = require('mongoose');

const abdmBridgeSchema = new mongoose.Schema({
    hospitalId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Hospital',
        sparse: true,
        index: true
    },
    clientId: {
        type: String,
        required: true,
        trim: true,
        index: true
    },
    bridgeUrl: {
        type: String,
        required: true,
        trim: true
    },
    services: [
        {
            id: { type: String, required: true, trim: true },
            name: { type: String, required: true, trim: true },
            type: { type: String, default: 'HIP', trim: true },
            active: { type: Boolean, default: true },
            alias: [{ type: String, trim: true }],
            registeredAt: { type: Date, default: Date.now }
        }
    ],
    lastVerifiedAt: {
        type: Date,
        default: null
    },
    gatewayStatus: {
        statusCode: { type: Number, default: null },
        code: { type: String, default: null },
        message: { type: String, default: null },
        isSubscriptionActive: { type: Boolean, default: false },
        checkedAt: { type: Date, default: null }
    },
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('AbdmBridge', abdmBridgeSchema);
