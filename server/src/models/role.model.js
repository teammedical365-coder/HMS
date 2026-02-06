const mongoose = require('mongoose');

const roleSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true }, // e.g., "Junior Doctor"
    description: { type: String },
    permissions: [{
        type: String,
        // We define a standard list of permission keys here for documentation
        enum: [
            'patient_search', 'patient_create',
            'visit_intake', // Permission to take vitals/history (Jr Dr/Nurse)
            'visit_diagnose', // Permission to prescribe/diagnose (Sr Dr)
            'admin_manage_roles'
        ]
    }],
    isSystemRole: { type: Boolean, default: false } // Protects 'Super Admin' from deletion
}, { timestamps: true });

module.exports = mongoose.model('Role', roleSchema);