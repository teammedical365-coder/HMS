const mongoose = require('mongoose');

const otRoomSchema = new mongoose.Schema({
    hospitalId: { type: mongoose.Schema.Types.ObjectId, required: true },
    name: { type: String, required: true, trim: true },
    status: { type: String, enum: ['Available', 'Occupied', 'Maintenance'], default: 'Available' },
    notes: { type: String, default: '' }
}, { timestamps: true });

// Ensure unique OT room names per hospital
otRoomSchema.index({ hospitalId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('OTRoom', otRoomSchema);
