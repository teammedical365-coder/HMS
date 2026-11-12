const mongoose = require('mongoose');

const entryEditHistorySchema = new mongoose.Schema({
    action: { type: String, default: 'UPDATED', trim: true },
    editReason: { type: String, default: '', trim: true },
    previousSnapshot: { type: mongoose.Schema.Types.Mixed, default: {} },
    editedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    editedByName: { type: String, default: 'Clinical Staff', trim: true },
    editedByRole: { type: String, default: '', trim: true },
    editedAt: { type: Date, default: Date.now }
}, { _id: true });

const statDoseEntrySchema = new mongoose.Schema({
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'InpatientOrder', default: null },
    date: { type: String, required: true, trim: true },
    time: { type: String, default: '', trim: true },
    drugName: { type: String, required: true, trim: true },
    dose: { type: String, default: '', trim: true },
    route: { type: String, default: 'IV', trim: true },
    doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    doctorName: { type: String, default: '', trim: true },

    // Nursing administration & checking verification (strictly never auto-filled on prescribe)
    status: {
        type: String,
        enum: ['PENDING', 'ADMINISTERED', 'HELD', 'REFUSED', 'NOT_GIVEN'],
        default: 'PENDING'
    },
    givenById: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    givenByName: { type: String, default: '', trim: true },
    givenAt: { type: Date, default: null },
    checkedById: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    checkedByName: { type: String, default: '', trim: true },
    checkedAt: { type: Date, default: null },
    remarks: { type: String, default: '', trim: true },

    // Original author & audit history
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    authorName: { type: String, required: true, trim: true },
    authorRole: { type: String, default: '', trim: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedByName: { type: String, default: '', trim: true },
    updatedByRole: { type: String, default: '', trim: true },
    editHistory: { type: [entryEditHistorySchema], default: [] }
}, { _id: true, timestamps: true });

const ivFluidEntrySchema = new mongoose.Schema({
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'InpatientOrder', default: null },
    date: { type: String, required: true, trim: true },
    fluidName: { type: String, required: true, trim: true },
    volume: { type: String, default: '', trim: true },
    timeStart: { type: String, default: '', trim: true },
    infusionTimeHrs: { type: String, default: '', trim: true },
    doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    doctorName: { type: String, default: '', trim: true },

    // Nursing administration confirmation (kept separate from order)
    status: {
        type: String,
        enum: ['PENDING', 'RUNNING', 'COMPLETED', 'HELD', 'NOT_GIVEN'],
        default: 'PENDING'
    },
    adminById: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    adminByName: { type: String, default: '', trim: true },
    administeredAt: { type: Date, default: null },
    remarks: { type: String, default: '', trim: true },

    // Original author & audit history
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    authorName: { type: String, required: true, trim: true },
    authorRole: { type: String, default: '', trim: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedByName: { type: String, default: '', trim: true },
    updatedByRole: { type: String, default: '', trim: true },
    editHistory: { type: [entryEditHistorySchema], default: [] }
}, { _id: true, timestamps: true });

const drugAllergyHistorySchema = new mongoose.Schema({
    slot1: { type: String, default: '' },
    slot2: { type: String, default: '' },
    sheetNo: { type: String, default: '' },
    editedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    editedByName: { type: String, default: 'Clinical Staff' },
    editedByRole: { type: String, default: '' },
    editedAt: { type: Date, default: Date.now }
}, { _id: false });

const inpatientDrugChartSchema = new mongoose.Schema({
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', required: true, index: true },
    admissionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admission', required: true, index: true },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    drugAllergies: {
        slot1: { type: String, default: '', trim: true },
        slot2: { type: String, default: '', trim: true },
        sheetNo: { type: String, default: '1', trim: true },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        updatedByName: { type: String, default: '', trim: true },
        updatedByRole: { type: String, default: '', trim: true },
        updatedAt: { type: Date, default: null },
        history: { type: [drugAllergyHistorySchema], default: [] }
    },

    statDoses: { type: [statDoseEntrySchema], default: [] },
    ivFluids: { type: [ivFluidEntrySchema], default: [] },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

inpatientDrugChartSchema.index({ hospitalId: 1, admissionId: 1 }, { unique: true });

module.exports = mongoose.model('InpatientDrugChart', inpatientDrugChartSchema);
module.exports.inpatientDrugChartSchema = inpatientDrugChartSchema;

