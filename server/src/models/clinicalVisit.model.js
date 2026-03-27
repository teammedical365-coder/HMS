const mongoose = require('mongoose');

const clinicalVisitSchema = new mongoose.Schema({
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    appointmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment' },
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', index: true },
    visitDate: { type: Date, default: Date.now },
    visitType: { type: String, enum: ['primary', 'partner', 'joint'], default: 'primary' },

    // STAGE 1: INTAKE (The "Junior Dr" or Staff Section)
    // This is where they record the "Brief about health" and "Vitals"
    intake: {
        filledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        timestamp: Date,
        vitals: {
            bp: String,
            pulse: String,
            temp: String,
            weight: String,
            bmi: String
        },
        // "Give brief about their health in past one month"
        intervalHistory: { type: String },
        chiefComplaint: { type: String }, // Why are they here TODAY?
        completed: { type: Boolean, default: false }
    },

    // STAGE 2: CONSULTATION (The "Senior Dr" Section)
    doctorConsultation: {
        doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        timestamp: Date,
        clinicalNotes: { type: String }, // Doctor's private observations
        diagnosis: [{ type: String }],
        procedureAdvice: { type: String },
        prescription: [{
            medicine: String,
            dosage: String,
            duration: String,
            instruction: String
        }],
        labTests: [{ type: String }]
    },

    status: {
        type: String,
        enum: ['check_in', 'with_nurse', 'ready_for_doctor', 'completed'],
        default: 'check_in'
    }
}, { timestamps: true });

module.exports = mongoose.model('ClinicalVisit', clinicalVisitSchema);