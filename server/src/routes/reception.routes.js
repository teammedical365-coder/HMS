const express = require('express');
const router = express.Router();
const Appointment = require('../models/appointment.model');
const User = require('../models/user.model');
const { verifyToken } = require('../middleware/auth.middleware');

const verifyReception = (req, res, next) => {
    if (req.user && (req.user.role === 'reception' || req.user.role === 'admin' || req.user.role === 'administrator')) {
        next();
    } else {
        return res.status(403).json({ success: false, message: 'Access denied: Reception access only' });
    }
};

// 1. REGISTER
router.post('/register', verifyToken, verifyReception, async (req, res) => {
    try {
        const { name, email, phone } = req.body;
        if (!name || !email || !phone) return res.status(400).json({ success: false, message: 'Required fields missing' });

        let user = await User.findOne({ $or: [{ email }, { phone }] });

        if (user) {
            if (name) user.name = name;
            await user.save();
            return res.status(200).json({ success: true, message: 'Patient found!', user });
        }

        const patientId = 'MRN-' + Date.now().toString().slice(-6);
        const newUser = new User({
            name, email, phone,
            password: phone.length >= 6 ? phone : phone + '123456',
            role: 'user', patientId,
            fertilityProfile: {}
        });
        await newUser.save();
        res.status(201).json({ success: true, message: 'Registered!', user: newUser });
    } catch (error) {
        console.error("Register Error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// 2. SEARCH
router.get('/search-patients', verifyToken, verifyReception, async (req, res) => {
    try {
        const { query } = req.query;
        if (!query || query.length < 2) return res.json({ success: true, patients: [] });
        const patients = await User.find({
            role: 'user',
            $or: [{ name: { $regex: query, $options: 'i' } }, { phone: { $regex: query, $options: 'i' } }, { patientId: { $regex: query, $options: 'i' } }]
        }).select('name phone email patientId fertilityProfile');
        res.json({ success: true, patients });
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

// 3. UPDATE INTAKE
router.put('/intake/:userId', verifyToken, verifyReception, async (req, res) => {
    try {
        const { userId } = req.params;
        const updates = req.body;
        const updateQuery = {};

        // Map Root fields
        if (updates.firstName || updates.lastName) updateQuery.name = `${updates.firstName || ''} ${updates.lastName || ''}`.trim();
        if (updates.email) updateQuery.email = updates.email;
        if (updates.phone || updates.mobile) updateQuery.phone = updates.phone || updates.mobile;
        if (updates.address) updateQuery.address = updates.address;
        if (updates.city) updateQuery.city = updates.city;
        if (updates.state) updateQuery.state = updates.state;
        if (updates.zipCode) updateQuery.zipCode = updates.zipCode;

        // Map Fertility Profile fields
        const profileFields = [
            'title', 'firstName', 'middleName', 'lastName', 'dob', 'age', 'gender', 'maritalStatus', 'occupation',
            'aadhaar', 'altPhone', 'patientCategory', 'nationality', 'isInternational', 'language', 'languagesKnown',
            'height', 'weight', 'bmi', 'bloodGroup',
            'partnerTitle', 'partnerFirstName', 'partnerLastName', 'partnerDob', 'partnerAge', 'partnerAadhaar',
            'partnerMobile', 'partnerAltPhone', 'partnerEmail', 'partnerAddressSame', 'partnerAddress',
            'partnerArea', 'partnerCity', 'partnerState', 'partnerCountry', 'partnerPinCode', 'partnerNationality',
            'partnerHeight', 'partnerWeight', 'partnerBmi', 'partnerBloodGroup',
            'reasonForVisit', 'speciality', 'doctor', 'referralType', 'visitDate', 'visitTime',
            'infertilityType', 'chiefComplaint', 'historyPulse', 'historyBp', 'infertilityDuration', 'marriageDuration', 'generalComments',
            'lmpDate', 'menstrualRegularity', 'menstrualFlow', 'menstrualPain', 'cycleDetails',
            'familyHistory', 'medicalHistoryDiabetes', 'medicalHistoryHypertension', 'medicalHistoryThyroid',
            'medicalHistoryHeart', 'medicalHistoryAsthma', 'medicalHistoryTb', 'medicalHistoryOther', 'medicalHistoryPcos',
            'para', 'abortion', 'ectopic', 'liveBirth', 'recurrentLoss', 'obstetricComments',
            'pastInvestigations', 'partnerBp', 'partnerMedicalComments',
            'labResults', 'hormonalValues', 'usgRemarks', 'psychiatricHistory', 'sexualHistory', 'identificationMarks', 'addictionHistory',
            'treatmentHistory',
            'examGeneral', 'examSystemic', 'examBreast', 'examAbdomen', 'examSpeculum', 'examVaginal',
            'hirsutism', 'galactorrhoea', 'papSmear',
            'usgType', 'afcRight', 'afcLeft', 'amh', 'uterusSize', 'uterusPosition',
            'ovaryRightSize', 'ovaryLeftSize', 'endometriumThickness',
            'diagnosisInfertilityType', 'maleFactor', 'femaleFactor', 'diagnosisYears', 'diagnosisOthers',
            'doctorNotes', 'prescriptionComments', 'procedureAdvice', 'followUpDate'
        ];

        profileFields.forEach(field => {
            if (updates[field] !== undefined) {
                updateQuery[`fertilityProfile.${field}`] = updates[field];
            }
        });

        const updatedUser = await User.findByIdAndUpdate(userId, { $set: updateQuery }, { new: true, runValidators: false });
        if (!updatedUser) return res.status(404).json({ success: false, message: 'Patient not found' });
        res.json({ success: true, message: 'Updated', user: updatedUser });
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

// 4. APPOINTMENTS
router.get('/appointments', verifyToken, verifyReception, async (req, res) => {
    try {
        const appointments = await Appointment.find({}).populate('userId', 'name email phone patientId').populate('doctorId', 'name').sort({ appointmentDate: -1 }).lean();
        res.json({ success: true, appointments });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

// 5. RESCHEDULE & CANCEL
router.patch('/appointments/:id/reschedule', verifyToken, verifyReception, async (req, res) => {
    const { id } = req.params; const { date, time } = req.body;
    await Appointment.findByIdAndUpdate(id, { appointmentDate: date, appointmentTime: time, status: 'confirmed' });
    res.json({ success: true });
});
router.patch('/appointments/:id/cancel', verifyToken, verifyReception, async (req, res) => {
    await Appointment.findByIdAndUpdate(req.params.id, { status: 'cancelled' });
    res.json({ success: true });
});

module.exports = router;