const mongoose = require('mongoose');

const patientNurseNoteEditHistorySchema = new mongoose.Schema({
    previousMessage: { type: String, required: true },
    editedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    editedByName: { type: String, default: 'Staff' },
    editedByRole: { type: String, default: '' },
    editedAt: { type: Date, default: Date.now }
}, { _id: false });

const patientNurseNoteSchema = new mongoose.Schema({
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', required: true, index: true },
    admissionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admission', required: true, index: true },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    // Original author & role (never overwritten on edit)
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    senderName: { type: String, required: true, trim: true },
    senderRole: {
        type: String,
        enum: ['Patient', 'Nurse', 'Doctor', 'Authorized Staff'],
        default: 'Nurse'
    },

    message: { type: String, required: true, trim: true },

    // Latest edit metadata + immutable full edit history
    editedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    editedByName: { type: String, default: '' },
    editedByRole: { type: String, default: '' },
    editedAt: { type: Date, default: null },
    editHistory: { type: [patientNurseNoteEditHistorySchema], default: [] }
}, { timestamps: true });

patientNurseNoteSchema.index({ hospitalId: 1, admissionId: 1, createdAt: 1 });

module.exports = mongoose.model('PatientNurseNote', patientNurseNoteSchema);
module.exports.patientNurseNoteSchema = patientNurseNoteSchema;

