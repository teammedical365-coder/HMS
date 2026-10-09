'use strict';
const mongoose = require('mongoose');

// PLATFORM-LEVEL singleton: ABDM keeps exactly ONE bridge URL per client ID,
// so this is NOT per hospital. (Old per-hospital documents must be dropped:
// db.abdmbridges.drop() before first deploy.)
const schema = new mongoose.Schema({
    clientId: { type: String, required: true, unique: true, trim: true },
    bridgeUrl: { type: String, required: true, trim: true },
    lastRegisteredAt: { type: Date, default: null },
    lastStatus: { type: String, default: null },   // 'ACCEPTED' | 'FAILED'
    lastMessage: { type: String, default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

module.exports = mongoose.models.AbdmBridge || mongoose.model('AbdmBridge', schema);
