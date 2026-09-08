const mongoose = require('mongoose');

const ipdWoundCareSchema = new mongoose.Schema({
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', required: true, index: true },
    admissionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admission', required: true, index: true },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    woundSite: {
        type: String,
        required: true,
        trim: true
        // e.g. Abdominal Midline, Sacral Ulcer, Right Leg Laceration, Sternotomy
    },
    woundType: {
        type: String,
        enum: ['Surgical', 'Pressure Ulcer', 'Trauma', 'Burn', 'Diabetic', 'Venous', 'Arterial', 'Other'],
        default: 'Surgical'
    },
    condition: {
        type: String,
        enum: ['Clean', 'Exudate', 'Granulating', 'Slough', 'Infected', 'Epithelializing', 'Healing', 'Other'],
        default: 'Clean'
    },
    dressingType: {
        type: String,
        enum: ['Gauze', 'Hydrocolloid', 'Foam', 'Transparent Film', 'Silver', 'Negative Pressure', 'Alginate', 'Hydrogel', 'Other'],
        default: 'Gauze'
    },
    drainageAmount: {
        type: String,
        enum: ['None', 'Minimal', 'Moderate', 'Heavy', ''],
        default: ''
    },
    drainageType: {
        type: String,
        enum: ['Serous', 'Sanguineous', 'Serosanguineous', 'Purulent', ''],
        default: ''
    },
    dressingChangedAt: {
        type: Date,
        default: Date.now,
        index: true
    },
    dressingChangedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    notes: {
        type: String,
        default: '',
        trim: true
    }
}, {
    timestamps: true
});

// Compound index for append-only wound care history
ipdWoundCareSchema.index({ hospitalId: 1, admissionId: 1, dressingChangedAt: -1 });

module.exports = mongoose.model('IPDWoundCare', ipdWoundCareSchema);
module.exports.ipdWoundCareSchema = ipdWoundCareSchema;
