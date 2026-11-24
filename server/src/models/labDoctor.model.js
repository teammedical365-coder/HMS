const mongoose = require('mongoose');

// Referring Doctor Master for Diagnostic Laboratories
const labDoctorSchema = new mongoose.Schema({
    hospitalId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Hospital',
        required: true,
        index: true
    },
    doctorName: {
        type: String,
        required: [true, 'Referring Doctor name is required'],
        trim: true,
        index: true
    },
    registrationNumber: {
        type: String,
        trim: true,
        default: '',
        index: true
    },
    qualification: {
        type: String,
        trim: true,
        default: 'MBBS'
    },
    specialization: {
        type: String,
        trim: true,
        default: 'General Medicine',
        index: true
    },
    clinicHospitalName: {
        type: String,
        trim: true,
        default: ''
    },
    contactNumber: {
        type: String,
        trim: true,
        default: ''
    },
    email: {
        type: String,
        trim: true,
        lowercase: true,
        default: ''
    },
    address: {
        type: String,
        default: ''
    },
    commissionRule: {
        type: {
            type: String,
            enum: ['PERCENTAGE', 'FIXED', 'NONE'],
            default: 'NONE'
        },
        value: {
            type: Number,
            default: 0,
            min: 0
        },
        notes: {
            type: String,
            default: ''
        }
    },
    isActive: {
        type: Boolean,
        default: true,
        index: true
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    }
}, {
    timestamps: true
});

labDoctorSchema.index({ hospitalId: 1, doctorName: 1 });
labDoctorSchema.index({ hospitalId: 1, registrationNumber: 1 });

const LabDoctor = mongoose.model('LabDoctor', labDoctorSchema);

module.exports = LabDoctor;
