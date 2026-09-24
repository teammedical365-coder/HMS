const fs = require('fs');
const path = require('path');

const assistantFile = path.join(__dirname, '../src/routes/assistant.routes.js');
let code = fs.readFileSync(assistantFile, 'utf8');

// 1. In PUT /preparation/:appointmentId/questionnaire
const oldQBlock = `        prep.questionnaireAnswers = questionnaireAnswers || {};
        prep.markModified('questionnaireAnswers');

        if (prep.status === 'waiting_for_assistant') {
            prep.status = 'preparation_in_progress';
        }

        const { checklist, progressPercentage } = calculateChecklistAndProgress(prep);
        prep.checklist = checklist;
        prep.progressPercentage = progressPercentage;
        await prep.save();`;

const newQBlock = `        prep.questionnaireAnswers = questionnaireAnswers || {};
        prep.markModified('questionnaireAnswers');

        if (prep.status === 'waiting_for_assistant') {
            prep.status = 'preparation_in_progress';
        }

        const { checklist, progressPercentage } = calculateChecklistAndProgress(prep);
        prep.checklist = checklist;
        prep.progressPercentage = progressPercentage;
        await prep.save();

        // Also sync to Appointment & Patient
        await Appointment.findByIdAndUpdate(appointmentId, {
            $set: {
                questionnaireAnswers: prep.questionnaireAnswers,
                assistantPreparation: prep._id,
                preparationStatus: prep.status
            }
        }).catch(() => {});

        if (prep.patientId) {
            await User.findByIdAndUpdate(prep.patientId, {
                $set: {
                    'fertilityProfile.intakeData': prep.questionnaireAnswers
                }
            }).catch(() => {});
        }`;

if (code.includes(oldQBlock)) {
    code = code.replace(oldQBlock, newQBlock);
    console.log('Successfully updated questionnaire sync in assistant.routes.js');
} else {
    console.log('oldQBlock not matched');
}

// 2. In POST /preparation/:appointmentId/mark-ready
const oldReadyBlock = `        const { checklist, progressPercentage } = calculateChecklistAndProgress(prep);
        prep.checklist = checklist;
        prep.progressPercentage = Math.max(progressPercentage, 80); // Min 80% if marked ready
        await prep.save();

        const appointment = await Appointment.findById(appointmentId).populate('userId', 'name uhid patientId').lean();`;

const newReadyBlock = `        const { checklist, progressPercentage } = calculateChecklistAndProgress(prep);
        prep.checklist = checklist;
        prep.progressPercentage = Math.max(progressPercentage, 80); // Min 80% if marked ready
        await prep.save();

        // Sync to Appointment
        await Appointment.findByIdAndUpdate(appointmentId, {
            $set: {
                preparationStatus: 'ready_for_doctor',
                assistantPreparation: prep._id,
                vitals: {
                    weight: prep.vitals?.weight || '',
                    height: prep.vitals?.height || '',
                    bmi: prep.vitals?.bmi || '',
                    bp: prep.vitals?.bp || '',
                    pulse: prep.vitals?.pulse || '',
                    temperature: prep.vitals?.temperature || '',
                    spo2: prep.vitals?.spo2 || '',
                    rr: prep.vitals?.rr || ''
                },
                questionnaireAnswers: prep.questionnaireAnswers || {}
            }
        }).catch(() => {});

        const appointment = await Appointment.findById(appointmentId).populate('userId', 'name uhid patientId').lean();`;

if (code.includes(oldReadyBlock)) {
    code = code.replace(oldReadyBlock, newReadyBlock);
    console.log('Successfully updated mark-ready sync in assistant.routes.js');
} else {
    console.log('oldReadyBlock not matched');
}

fs.writeFileSync(assistantFile, code, 'utf8');
console.log('assistant.routes.js updated');
