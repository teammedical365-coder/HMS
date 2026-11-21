const mongoose = require('mongoose');

const progressNoteEditHistorySchema = new mongoose.Schema({
    previousNote: { type: String, required: true },
    previousRecordedAt: { type: Date },
    editReason: { type: String, default: '', trim: true },
    editedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    editedByName: { type: String, default: 'Clinical Staff', trim: true },
    editedByRole: { type: String, default: '', trim: true },
    editedAt: { type: Date, default: Date.now }
}, { _id: true });

const inpatientProgressNoteSchema = new mongoose.Schema({
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', required: true, index: true },
    admissionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admission', required: true, index: true },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    recordedAt: { type: Date, required: true, default: Date.now, index: true },
    note: { type: String, required: true, trim: true },
    sheetNo: { type: String, default: '1', trim: true },
    rowIndex: { type: Number, default: null },

    // Immutable original authorship (never overwritten on edit)
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    authorName: { type: String, required: true, trim: true },
    authorRole: { type: String, default: '', trim: true },

    // Latest editor metadata + full chronological edit history
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedByName: { type: String, default: '', trim: true },
    updatedByRole: { type: String, default: '', trim: true },
    editHistory: { type: [progressNoteEditHistorySchema], default: [] }
}, { timestamps: true });

inpatientProgressNoteSchema.index({ hospitalId: 1, admissionId: 1, recordedAt: 1, createdAt: 1 });
inpatientProgressNoteSchema.index({ hospitalId: 1, patientId: 1, createdAt: -1 });

module.exports = mongoose.model('InpatientProgressNote', inpatientProgressNoteSchema);
module.exports.inpatientProgressNoteSchema = inpatientProgressNoteSchema;

