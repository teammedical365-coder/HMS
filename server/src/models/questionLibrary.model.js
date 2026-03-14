const mongoose = require('mongoose');

const questionLibrarySchema = new mongoose.Schema({
    data: {
        type: mongoose.Schema.Types.Mixed,
        required: true
    },
    version: {
        type: Number,
        default: 1
    }
}, {
    timestamps: true
});

const QuestionLibrary = mongoose.model('QuestionLibrary', questionLibrarySchema);

module.exports = QuestionLibrary;
