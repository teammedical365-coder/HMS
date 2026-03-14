const mongoose = require('mongoose');

const medicineSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    genericName: {
        type: String,
        trim: true,
        default: ''
    },
    category: {
        type: String,
        default: 'General'
    },
    description: {
        type: String,
        default: ''
    }
}, {
    timestamps: true
});

const Medicine = mongoose.model('Medicine', medicineSchema);

module.exports = Medicine;
