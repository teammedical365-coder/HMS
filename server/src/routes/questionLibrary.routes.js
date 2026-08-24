const express = require('express');
const router = express.Router();
const QuestionLibrary = require('../models/questionLibrary.model');
const Hospital = require('../models/hospital.model');
const { verifyAdminOrSuperAdmin, verifyToken } = require('../middleware/auth.middleware');

const defaultQuestionLibraryData = {
    "ENT": {
        "Clinical History & Intake": [
            { q: "When did the ear/throat/nose pain or irritation first start?", type: "text" },
            { q: "Have you consulted a doctor or taken any treatment for this previously?", type: "yes-no" },
            { q: "Are you currently taking any medicines (antibiotics, pain killers, nasal sprays)?", type: "textarea" },
            { q: "Does anyone in your family (parents/siblings) have a history of allergies or sinus/hearing issues?", type: "yes-no" },
            { q: "Which primary symptoms are you currently experiencing?", type: "checkbox-group", options: ["Ear Pain / Discharge", "Throat Soreness / Pain Swallowing", "Nasal Congestion / Blockage", "Hearing Loss / Ringing (Tinnitus)", "Dizziness / Vertigo", "Frequent Sneezing / Cold"] },
            { q: "Pain Severity Level (Scale 1 to 10)", type: "select", options: ["1 - Very Mild", "3 - Mild", "5 - Moderate", "7 - Severe", "9 - Very Severe", "10 - Unbearable"] }
        ]
    },
    "Cardiology": {
        "Cardiac Symptoms & Risk Profile": [
            { q: "When did you first notice the chest discomfort, heaviness, or palpitations?", type: "text" },
            { q: "Have you ever had an ECG, 2D Echo, Angiography, or TMT test done before?", type: "yes-no" },
            { q: "Are you currently taking any blood pressure, blood thinner (Aspirin), or cholesterol medicines?", type: "textarea" },
            { q: "Is there a family history of heart attack, hypertension, or sudden cardiac issues (Parents/Siblings)?", type: "yes-no" },
            { q: "Nature and sensation of chest discomfort", type: "select", options: ["Heavy Pressure / Squeezing", "Sharp / Stabbing", "Burning / Acidity-like", "Shortness of Breath on Exertion", "No Chest Pain (Only Palpitations)"] },
            { q: "Does the discomfort radiate to left arm, neck, shoulder, jaw, or back?", type: "yes-no" }
        ]
    },
    "Orthopedics": {
        "Joint & Bone Assessment": [
            { q: "When did the bone/joint/back pain begin, and was it caused by an injury or fall?", type: "text" },
            { q: "Have you had prior X-rays, MRI scans, or physiotherapy for this condition?", type: "yes-no" },
            { q: "What pain relief tablets, ointments, or calcium/vitamin D supplements are you taking?", type: "textarea" },
            { q: "Does any family member suffer from Arthritis, Gout, Spondylitis, or Osteoporosis?", type: "yes-no" },
            { q: "Are you able to put weight on the affected limb and walk without support?", type: "yes-no" },
            { q: "Associated symptoms observed", type: "checkbox-group", options: ["Joint Swelling / Warmth", "Morning Stiffness (>30 mins)", "Joint Clicking / Locking", "Numbness / Tingling in Limbs", "Restricted Joint Movement"] }
        ]
    },
    "Pediatrics": {
        "Child Health & Development": [
            { q: "When did the child's fever, cough, vomiting, or symptoms first appear?", type: "text" },
            { q: "Has the child visited a clinic or received emergency pediatric care for this episode?", type: "yes-no" },
            { q: "What syrups, drops, or fever medicines (with dose & time) were given?", type: "textarea" },
            { q: "Is the child's vaccination / immunization schedule completely up-to-date?", type: "yes-no" },
            { q: "Feeding, fluid intake, and active urine output status", type: "select", options: ["Normal Feeding & Playful", "Mildly Reduced Oral Intake", "Lethargic / Decreased Urine Output", "Refusing All Feeds / Vomiting Everything"] },
            { q: "Family history of childhood asthma, eczema, or food allergies", type: "yes-no" }
        ]
    },
    "Gynecology & Obstetrics": {
        "Women's Health & Obstetric Profile": [
            { q: "What was the date of your Last Menstrual Period (LMP)?", type: "text" },
            { q: "Have you consulted a gynecologist or had prior pelvic ultrasound scans?", type: "yes-no" },
            { q: "Are you currently taking any hormonal pills, thyroid medication, iron, or folic acid?", type: "textarea" },
            { q: "Is there a family history of PCOD/PCOS, Fibroids, Diabetes, or Gynae issues?", type: "yes-no" },
            { q: "Primary complaints and symptoms experienced", type: "checkbox-group", options: ["Irregular / Delayed Periods", "Severe Cramps / Pelvic Pain", "Heavy Bleeding with Clots", "Abnormal Vaginal Discharge / Itching", "Morning Sickness / Nausea", "Difficulty in Conceiving"] },
            { q: "Obstetric history: Total prior pregnancies (Gravida / Para / Living / Abortion)", type: "text" }
        ]
    },
    "Dermatology": {
        "Skin & Hair Assessment": [
            { q: "When did the skin rash, itching, boil, or hair loss first appear?", type: "text" },
            { q: "Have you applied any steroid creams, home remedies, or taken skin treatments before?", type: "yes-no" },
            { q: "List all oral medicines, supplements, soaps, oils, or cosmetics started recently", type: "textarea" },
            { q: "Does anyone in your family have Psoriasis, Eczema, Fungal infections, or Vitiligo?", type: "yes-no" },
            { q: "Characteristics and triggers of the skin condition", type: "checkbox-group", options: ["Intense Itching (Worse at night)", "Burning / Painful Sensation", "Spreading to Other Body Parts", "Flaking / Peeling Skin", "Pus-filled Lesions / Blisters", "Triggered by Sun / Sweat"] },
            { q: "Any known food, drug, or chemical allergies?", type: "text" }
        ]
    },
    "Ophthalmology": {
        "Eye Health & Vision Intake": [
            { q: "When did you first notice blurriness, redness, irritation, or vision changes?", type: "text" },
            { q: "Do you currently wear eyeglasses or contact lenses?", type: "yes-no" },
            { q: "Are you using any eye drops (lubricant, antibiotic, anti-glaucoma, steroid)?", type: "textarea" },
            { q: "Is there a family history of Glaucoma, Cataract, or Diabetic Retinopathy?", type: "yes-no" },
            { q: "Which eye is affected and what are the primary symptoms?", type: "checkbox-group", options: ["Right Eye Only", "Left Eye Only", "Both Eyes", "Redness & Excessive Watering", "Foreign Body Sensation / Grittiness", "Night Blindness / Glare Sensitivity", "Floaters / Flashes of Light"] },
            { q: "Do you have a history of Diabetes or High Blood Pressure?", type: "yes-no" }
        ]
    },
    "Neurology": {
        "Neurological Screening Protocol": [
            { q: "When did the headaches, dizziness, tremors, or weakness first begin?", type: "text" },
            { q: "Have you ever had an MRI/CT Brain scan, EEG, or consultation with a neurologist?", type: "yes-no" },
            { q: "Are you currently taking any anti-seizure, nerve pain, or migraine medicines?", type: "textarea" },
            { q: "Is there a family history of Stroke, Epilepsy, Parkinson's, or chronic migraines?", type: "yes-no" },
            { q: "Symptoms experienced during or between episodes", type: "checkbox-group", options: ["One-sided Throbbing Headache", "Numbness / Tingling in Arms/Legs", "Fainting / Loss of Consciousness", "Hand Tremors / Muscle Jerks", "Slurred Speech / Difficulty Speaking", "Balance / Walking Difficulty"] },
            { q: "Severity and impact on daily activities", type: "select", options: ["Mild - Does not affect daily work", "Moderate - Disables temporarily during episodes", "Severe - Unable to perform normal work / bedridden"] }
        ]
    },
    "Gastroenterology": {
        "Digestive & GI Tract Evaluation": [
            { q: "When did the stomach pain, indigestion, acidity, or bowel irregularity begin?", type: "text" },
            { q: "Have you undergone an Endoscopy, Colonoscopy, or Abdominal Ultrasound previously?", type: "yes-no" },
            { q: "What antacids (Pan-D, Omez), laxatives, or digestive syrups do you consume regularly?", type: "textarea" },
            { q: "Is there a family history of Gastric Ulcers, Gallstones, Fatty Liver, or Colon Polyps?", type: "yes-no" },
            { q: "Primary digestive complaints noted", type: "checkbox-group", options: ["Heartburn / Chest Acid Burning (GERD)", "Stomach Bloating / Excessive Gas", "Chronic Constipation", "Frequent Loose Stools / Diarrhea", "Post-Meal Nausea / Vomiting", "Black Stool / Blood in Stool"] },
            { q: "Pain relation to food consumption", type: "select", options: ["Increases after eating spicy/oily food", "Relieved after eating food/milk", "Severe on empty stomach", "No fixed relation to meals"] }
        ]
    },
    "Pulmonology": {
        "Respiratory & Chest Health": [
            { q: "Since how many days/months have you had the cough, breathlessness, or wheezing?", type: "text" },
            { q: "Have you had a Chest X-ray, HRCT Chest, or Pulmonary Function Test (PFT/Spirometry)?", type: "yes-no" },
            { q: "Do you use an inhaler (Rotahaler/Metered dose), nebulizer, or steroid syrups?", type: "textarea" },
            { q: "Is there a family history of Asthma, Chronic Bronchitis, TB, or Dust Allergy?", type: "yes-no" },
            { q: "Nature of cough and sputum production", type: "select", options: ["Dry Persistent Cough", "Wet Cough with Clear White Sputum", "Thick Yellow/Green Sputum", "Cough with Blood Streaks (Hemoptysis)", "Night-time Wheezing / Breathlessness"] },
            { q: "Tobacco / Smoking history and environmental exposure", type: "select", options: ["Non-Smoker (No exposure)", "Active Smoker (>5 cigarettes/day)", "Former Smoker (Quit)", "Heavy Dust / Chemical Factory Exposure"] }
        ]
    },
    "General Medicine": {
        "Baseline Clinical History": [
            { q: "What is your main health concern or problem, and when did it start?", type: "textarea" },
            { q: "Have you been hospitalized or had surgery in the past 2-3 years?", type: "yes-no" },
            { q: "List all ongoing daily medications, dosages, and health supplements", type: "textarea" },
            { q: "Family history of chronic conditions (Diabetes, High BP, Kidney Disease, Thyroid)?", type: "yes-no" },
            { q: "Constitutional symptoms present currently", type: "checkbox-group", options: ["Fever / Chills", "Unexplained Weight Loss", "Extreme Fatigue / Weakness", "Loss of Appetite", "Disturbed Sleep / Insomnia", "Generalized Body Aches"] },
            { q: "Any known drug allergies (e.g. Penicillin, Sulfa, Paracetamol, Aspirin)?", type: "text" }
        ]
    },
    "Dentistry": {
        "Dental & Oral Health History": [
            { q: "When did the toothache, sensitivity, swelling, or gum bleeding start?", type: "text" },
            { q: "When was your last dental check-up, cleaning (scaling), or tooth filling done?", type: "text" },
            { q: "Are you taking pain relievers, antibiotics, or blood-thinning medications?", type: "textarea" },
            { q: "Is there a family history of early tooth loss, gum problems, or jaw disorders?", type: "yes-no" },
            { q: "Primary dental and oral complaints", type: "checkbox-group", options: ["Sharp Pain on Biting / Chewing", "Hot & Cold Sensitivity", "Bleeding / Swollen / Receding Gums", "Bad Breath (Halitosis)", "Mobile / Loose Tooth", "Jaw Joint (TMJ) Pain / Clicking"] },
            { q: "Oral hygiene and habits", type: "select", options: ["Brushing Once Daily", "Brushing Twice Daily", "Night Teeth Grinding (Bruxism)", "Tobacco / Gutkha / Pan Masala Habit", "None"] }
        ]
    }
};

// Get the latest question library configuration
router.get('/', verifyToken, async (req, res) => {
    try {
        const hospitalId = req.user.hospitalId || null;
        let library = null;

        if (hospitalId) {
            library = await QuestionLibrary.findOne({ hospitalId }).sort({ version: -1 });
        }

        if (!library || !library.data || Object.keys(library.data).length === 0) {
            // Fallback to global template
            library = await QuestionLibrary.findOne({ hospitalId: null }).sort({ version: -1 });
        }

        if (!library || !library.data || Object.keys(library.data).length === 0) {
            // Seed global template with comprehensive 12 departments
            const newGlobal = new QuestionLibrary({
                data: defaultQuestionLibraryData,
                version: 1,
                hospitalId: null
            });
            await newGlobal.save();
            library = newGlobal;
        } else {
            // Ensure all 12 departments exist in library data (merge default data if missing)
            let isModified = false;
            const mergedData = { ...defaultQuestionLibraryData, ...library.data };
            for (const dept of Object.keys(defaultQuestionLibraryData)) {
                if (!library.data[dept] || Object.keys(library.data[dept]).length === 0) {
                    mergedData[dept] = defaultQuestionLibraryData[dept];
                    isModified = true;
                }
            }
            if (isModified && !hospitalId) {
                library.data = mergedData;
                library.markModified('data');
                await library.save();
            } else if (isModified) {
                library.data = mergedData;
            }
        }

        let allowedDepartments = null; // null means all allowed (super/central admin)
        if (hospitalId) {
            const hospital = await Hospital.findById(hospitalId);
            if (hospital && hospital.departments && hospital.departments.length > 0) {
                allowedDepartments = hospital.departments;
            } else if (hospital && hospital.clinicType === 'clinic') {
                allowedDepartments = ['General Medicine', 'General'];
            } else {
                allowedDepartments = Object.keys(library.data || defaultQuestionLibraryData);
            }
        }

        res.json({ success: true, data: library, allowedDepartments });
    } catch (error) {
        console.error('Error fetching question library:', error);
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// Update or create question library
router.post('/', verifyAdminOrSuperAdmin, async (req, res) => {
    try {
        const { data } = req.body;
        const hospitalId = req.user.hospitalId || null;

        if (!data) return res.status(400).json({ success: false, message: 'Library data is required' });

        const latestLibrary = await QuestionLibrary.findOne({ hospitalId }).sort({ version: -1 });
        let newVersion = 1;
        if (latestLibrary) {
            newVersion = latestLibrary.version + 1;
        }

        const library = new QuestionLibrary({ data, version: newVersion, hospitalId });
        await library.save();

        res.status(201).json({ success: true, message: 'Question Library updated successfully', data: library });
    } catch (error) {
        console.error('Error updating question library:', error);
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

module.exports = router;
