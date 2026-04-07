const mongoose = require('mongoose');

/**
 * AuditLog — every sensitive action on patient data is recorded here.
 * Works on both cloud and local deployments.
 * Never purge — retain for compliance (DPDP Act India).
 */
const auditLogSchema = new mongoose.Schema({
    clinicId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', required: true, index: true },
    userId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    userName:   { type: String, default: 'System' },
    role:       { type: String, default: '' },

    // What happened
    action: {
        type: String,
        required: true,
        enum: [
            'VIEW_PATIENT', 'CREATE_PATIENT', 'UPDATE_PATIENT', 'DELETE_PATIENT',
            'VIEW_PRESCRIPTION', 'CREATE_PRESCRIPTION', 'UPDATE_PRESCRIPTION',
            'VIEW_APPOINTMENT', 'CREATE_APPOINTMENT', 'CANCEL_APPOINTMENT', 'COMPLETE_APPOINTMENT',
            'VIEW_BILL', 'CREATE_BILL', 'CONFIRM_PAYMENT',
            'STAFF_LOGIN', 'STAFF_LOGOUT', 'PATIENT_LOGIN',
            'EXPORT_DATA', 'SYNC_PUSH', 'BACKUP_CREATED',
            'DATA_ERASURE_REQUEST', 'DATA_ERASED',
        ],
    },

    // What it targeted
    targetModel: { type: String, default: '' },  // 'ClinicPatient', 'Appointment', etc.
    targetId:    { type: mongoose.Schema.Types.ObjectId, default: null },
    targetLabel: { type: String, default: '' },  // e.g. patient name (for readability in audit UI)

    // Request context
    ip:        { type: String, default: '' },
    userAgent: { type: String, default: '' },
    success:   { type: Boolean, default: true },
    reason:    { type: String, default: '' },    // if success=false, why
}, { timestamps: true });

// Query by clinic + date range for audit reports
auditLogSchema.index({ clinicId: 1, createdAt: -1 });
auditLogSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
