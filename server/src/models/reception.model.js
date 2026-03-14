const mongoose = require('mongoose');

const receptionSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true
    },
    hospitalId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Hospital',
        default: null,
        index: true
    },
    // Specific fields for receptionist staff (not patients)
    employeeId: { type: String, trim: true },
    joiningDate: { type: Date },
    shift: { type: String, enum: ['Morning', 'Evening', 'Night', 'General'], default: 'General' },
    isActive: { type: Boolean, default: true }
}, {
    timestamps: true
});

// CRITICAL: This must be 'Reception', NOT 'User'
const Reception = mongoose.model('Reception', receptionSchema);

module.exports = Reception;