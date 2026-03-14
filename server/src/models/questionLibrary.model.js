const mongoose = require('mongoose');

const questionLibrarySchema = new mongoose.Schema({
    data: {
        type: mongoose.Schema.Types.Mixed,
        required: true
    },
    version: {
        type: Number,
        default: 1
    },
    hospitalId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Hospital',
        default: null
    }
}, {
    timestamps: true
});

const QuestionLibrary = mongoose.model('QuestionLibrary', questionLibrarySchema);

module.exports = QuestionLibrary;
