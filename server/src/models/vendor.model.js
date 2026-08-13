const mongoose = require('mongoose');

const vendorSchema = new mongoose.Schema({
    hospitalId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Hospital',
        index: true,
        required: true
    },
    vendorName: { type: String, required: true, trim: true },
    contactPerson: { type: String, default: '', trim: true },
    phone: { 
        type: String, 
        default: '', 
        trim: true,
        validate: {
            validator: function(v) {
                return v === '' || /^\d{10}$/.test(v);
            },
            message: props => `${props.value} is not a valid 10-digit phone number!`
        }
    },
    gstin: { 
        type: String, 
        default: '', 
        trim: true,
        uppercase: true,
        maxlength: 15,
        validate: {
            validator: function(v) {
                return v === '' || /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(v);
            },
            message: props => `${props.value} is not a valid GSTIN format!`
        }
    },
    dlNumber: {
        type: String,
        default: '',
        trim: true
    },
    status: {
        type: String,
        enum: ['Active', 'Inactive'],
        default: 'Active'
    }
}, { timestamps: true });

module.exports = mongoose.model('Vendor', vendorSchema);
