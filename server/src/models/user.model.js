const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    phone: { type: String },
    role: { type: String, enum: ['user', 'admin', 'administrator', 'doctor', 'lab', 'pharmacy', 'reception'], default: 'user' },
    patientId: { type: String, unique: true, sparse: true },

    address: { type: String, default: '' },
    city: { type: String, default: '' },
    state: { type: String, default: '' },
    zipCode: { type: String, default: '' },

    fertilityProfile: {
        referredBy: { type: String, default: '' },
        title: { type: String, default: '' },
        firstName: { type: String, default: '' },
        middleName: { type: String, default: '' },
        lastName: { type: String, default: '' },
        dob: { type: String, default: '' },
        age: { type: String, default: '' },
        gender: { type: String, default: '' },
        maritalStatus: { type: String, default: '' },
        occupation: { type: String, default: '' },
        aadhaar: { type: String, default: '' },
        altPhone: { type: String, default: '' },
        patientCategory: { type: String, default: '' },
        nationality: { type: String, default: '' },
        isInternational: { type: Boolean, default: false },
        language: { type: String, default: '' },
        languagesKnown: { type: String, default: '' },
        height: { type: String, default: '' },
        weight: { type: String, default: '' },
        bmi: { type: String, default: '' },
        bloodGroup: { type: String, default: '' },

        partnerTitle: { type: String, default: '' },
        partnerFirstName: { type: String, default: '' },
        partnerLastName: { type: String, default: '' },
        partnerDob: { type: String, default: '' },
        partnerAge: { type: String, default: '' },
        partnerAadhaar: { type: String, default: '' },
        partnerMobile: { type: String, default: '' },
        partnerAltPhone: { type: String, default: '' },
        partnerEmail: { type: String, default: '' },
        partnerAddressSame: { type: Boolean, default: false },
        partnerAddress: { type: String, default: '' },
        partnerArea: { type: String, default: '' },
        partnerCity: { type: String, default: '' },
        partnerState: { type: String, default: '' },
        partnerCountry: { type: String, default: '' },
        partnerPinCode: { type: String, default: '' },
        partnerNationality: { type: String, default: '' },
        partnerHeight: { type: String, default: '' },
        partnerWeight: { type: String, default: '' },
        partnerBmi: { type: String, default: '' },
        partnerBloodGroup: { type: String, default: '' },

        infertilityType: { type: String, default: '' },
        chiefComplaint: { type: String, default: '' },
        infertilityDuration: { type: String, default: '' },
        marriageDuration: { type: String, default: '' },
        historyBp: { type: String, default: '' },
        historyPulse: { type: String, default: '' },
        generalComments: { type: String, default: '' },

        lmpDate: { type: String, default: '' },
        menstrualRegularity: { type: String, default: '' },
        menstrualFlow: { type: String, default: '' },
        menstrualPain: { type: String, default: '' },
        cycleDetails: { type: String, default: '' },

        familyHistory: { type: String, default: '' },
        medicalHistoryDiabetes: { type: Boolean, default: false },
        medicalHistoryHypertension: { type: Boolean, default: false },
        medicalHistoryThyroid: { type: Boolean, default: false },
        medicalHistoryHeart: { type: Boolean, default: false },
        medicalHistoryAsthma: { type: Boolean, default: false },
        medicalHistoryTb: { type: Boolean, default: false },
        medicalHistoryOther: { type: String, default: '' },
        medicalHistoryPcos: { type: Boolean, default: false },

        para: { type: String, default: '' },
        abortion: { type: String, default: '' },
        ectopic: { type: String, default: '' },
        liveBirth: { type: String, default: '' },
        recurrentLoss: { type: Boolean, default: false },
        obstetricComments: { type: String, default: '' },

        pastInvestigations: { type: String, default: '' },
        partnerBp: { type: String, default: '' },
        partnerMedicalComments: { type: String, default: '' },

        labResults: { type: String, default: '' },
        hormonalValues: { type: String, default: '' },
        usgRemarks: { type: String, default: '' },
        psychiatricHistory: { type: String, default: '' },
        sexualHistory: { type: String, default: '' },
        identificationMarks: { type: String, default: '' },
        addictionHistory: { type: String, default: '' },

        treatmentHistory: { type: String, default: '' },

        examGeneral: { type: String, default: '' },
        examSystemic: { type: String, default: '' },
        examBreast: { type: String, default: '' },
        examAbdomen: { type: String, default: '' },
        examSpeculum: { type: String, default: '' },
        examVaginal: { type: String, default: '' },
        hirsutism: { type: String, default: '' },
        galactorrhoea: { type: String, default: '' },
        papSmear: { type: String, default: '' },

        usgType: { type: String, default: '' },
        afcRight: { type: String, default: '' },
        afcLeft: { type: String, default: '' },
        amh: { type: String, default: '' },
        uterusSize: { type: String, default: '' },
        uterusPosition: { type: String, default: '' },
        ovaryRightSize: { type: String, default: '' },
        ovaryLeftSize: { type: String, default: '' },
        endometriumThickness: { type: String, default: '' },

        diagnosisInfertilityType: { type: String, default: '' },
        maleFactor: { type: String, default: '' },
        femaleFactor: { type: String, default: '' },
        diagnosisYears: { type: String, default: '' },
        diagnosisOthers: { type: String, default: '' },

        doctorNotes: { type: String, default: '' },
        prescriptionComments: { type: String, default: '' },
        procedureAdvice: { type: String, default: '' },
        followUpDate: { type: String, default: '' }
    },

    services: { type: [String], default: [] }
}, { timestamps: true });

userSchema.pre('save', async function () {
    if (!this.isModified('password')) return;
    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
    } catch (error) { throw error; }
});
userSchema.methods.comparePassword = async function (candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

const User = mongoose.model('User', userSchema);
module.exports = User;