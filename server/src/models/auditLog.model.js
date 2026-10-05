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
            'DOCTOR_ORDER_CREATED', 'DOCTOR_ORDER_ACKNOWLEDGED', 'CLARIFICATION_REQUESTED', 'CLARIFICATION_RESPONDED',
            'MEDICATION_ADMINISTERED', 'VITALS_RECORDED', 'NURSING_NOTE_ADDED', 'HANDOVER_COMPLETED',
            'DOCTOR_DISCHARGE_ORDERED', 'NURSING_CLEARANCE_SIGNED', 'DISCHARGE_SUMMARY_SAVED', 'DISCHARGE_SUMMARY_FINALIZED',
            'BED_RECONCILED', 'IPD_PATIENT_ADMITTED', 'IPD_PATIENT_DISCHARGED', 'IPD_BED_TRANSFERRED',
            'VOICE_SCRIBE_STARTED', 'VOICE_SCRIBE_APPROVED', 'VOICE_SCRIBE_DISCARDED',
            'PREPARATION_STARTED', 'VITALS_UPDATED', 'QUESTIONNAIRE_UPDATED', 'REPORT_UPLOADED',
            'REFUND_REQUESTED', 'REFUND_APPROVED', 'REFUND_REJECTED', 'REFUND_PROCESSING', 'REFUND_COMPLETED', 'REFUND_CANCELLED',
            'MIGRATION_SESSION_CREATED', 'MIGRATION_FILE_UPLOADED', 'MIGRATION_SCHEMA_ANALYZED',
            'MIGRATION_ENTITY_DETECTED', 'MIGRATION_AI_MAPPING_GENERATED', 'MIGRATION_MAPPING_UPDATED',
            'MIGRATION_CUSTOM_FIELD_CREATED', 'MIGRATION_MAPPING_APPROVED', 'MIGRATION_TEMPLATE_SAVED',
            'MIGRATION_TRANSFORMATION_STARTED', 'MIGRATION_VALIDATION_STARTED', 'MIGRATION_VALIDATION_COMPLETED',
            'MIGRATION_DUPLICATE_DETECTION_COMPLETED', 'MIGRATION_PREVIEW_GENERATED', 'MIGRATION_DUPLICATE_DECISION_UPDATED',
            'MIGRATION_READY_FOR_IMPORT',
            'MIGRATION_IMPORT_STARTED', 'MIGRATION_IMPORT_COMPLETED', 'MIGRATION_IMPORT_FAILED', 'MIGRATION_VERIFICATION_COMPLETED',
            'SYNC_CONFLICT_RESOLVED', 'SYNC_CONFLICT_DISMISSED',
            'LOCAL_DB_REBUILD', 'LOCAL_DB_RESTORE', 'SYNC_INTEGRITY_CHECK',
            'INSTALLATION_REGISTERED', 'SYNC_STARTED', 'SYNC_COMPLETED', 'SYNC_FAILED', 'AUTH_FAILURE'
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
