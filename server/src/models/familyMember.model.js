const mongoose = require('mongoose');

/**
 * FamilyMember — stores family health tree members for a patient.
 * Each member belongs to a patient (patientId) and is scoped per hospital (hospitalId).
 * Supports medical conditions tracking, lifestyle data, and generational hierarchy.
 */
const medicalConditionSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    status: { type: String, enum: ['Active', 'Controlled', 'Resolved', 'Unknown'], default: 'Active' },
    diagnosedAge: { type: Number, default: null },
    duration: { type: String, default: '' },
    treatment: { type: String, default: '' },
    notes: { type: String, default: '' }
}, { _id: true });

const familyMemberSchema = new mongoose.Schema({
    // Ownership & Tenant Isolation
    patientId: {
        type: mongoose.Schema.Types.Mixed,
        required: true,
        index: true
    },
    hospitalId: {
        type: mongoose.Schema.Types.Mixed,
        default: null,
        index: true
    },
    // Optional link to an existing patient record in the system
    linkedPatientId: {
        type: mongoose.Schema.Types.Mixed,
        default: null
    },

    // Identity
    name: { type: String, required: true, trim: true, minlength: 2 },
    relationship: {
        type: String,
        required: true,
        enum: [
            'Father', 'Mother',
            'Brother', 'Sister',
            'Son', 'Daughter',
            'Grandfather (P)', 'Grandmother (P)',
            'Grandfather (M)', 'Grandmother (M)',
            'Uncle', 'Aunt',
            'Cousin', 'Nephew', 'Niece',
            'Spouse', 'Partner',
            'Grandson', 'Granddaughter',
            'Other'
        ]
    },
    generation: {
        type: Number,
        required: true,
        default: 0,
        // -2 = grandparents, -1 = parents/uncle/aunt, 0 = siblings/patient, 1 = children, 2 = grandchildren
    },
    gender: { type: String, enum: ['Male', 'Female', 'Other'], default: 'Male' },
    dob: { type: Date, default: null },
    age: { type: Number, default: null },
    bloodGroup: { type: String, default: '' },

    // Status
    isAlive: { type: Boolean, default: true },
    isAffected: { type: Boolean, default: false }, // Has any medical condition

    // Medical Profile
    medicalConditions: [medicalConditionSchema],

    // Lifestyle
    lifestyle: {
        smoking: { type: String, enum: ['Never', 'Former', 'Current', 'Unknown', ''], default: '' },
        alcohol: { type: String, enum: ['Never', 'Occasional', 'Regular', 'Heavy', 'Unknown', ''], default: '' },
        exercise: { type: String, enum: ['None', 'Light', 'Moderate', 'Active', 'Unknown', ''], default: '' },
        diet: { type: String, enum: ['Vegetarian', 'Non-Vegetarian', 'Vegan', 'Mixed', 'Unknown', ''], default: '' }
    },

    // Contact & Personal
    phone: { type: String, default: '' },
    address: { type: String, default: '' },
    occupation: { type: String, default: '' },

    // Notes
    notes: { type: String, default: '' },
}, { timestamps: true });

// Compound index for fast queries scoped to a patient within a hospital
familyMemberSchema.index({ patientId: 1, hospitalId: 1 });
familyMemberSchema.index({ patientId: 1, generation: 1 });

module.exports = mongoose.model('FamilyMember', familyMemberSchema);
