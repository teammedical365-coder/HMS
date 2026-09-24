/**
 * Master Clinical Question Library for Medical365 Hospital Management System
 * Standardized Department Questionnaires with Structured Formats and Multi-Choice Options
 */

const MASTER_DEFAULT_QUESTION_LIBRARY = {
    "General Medicine": {
        "Baseline Clinical History": [
            { q: "What is your main health concern or problem, and when did it start?", type: "textarea", options: ["Fever & Chills (<3 days)", "Persistent Cough & Throat Irritation", "Severe Body Aches & Weakness", "Headache & Dizziness", "Abdominal Pain & Acidity", "Routine Health Checkup"] },
            { q: "Have you been hospitalized or had surgery in the past 2-3 years?", type: "yes-no", options: ["Yes", "No"] },
            { q: "List all ongoing daily medications, dosages, and health supplements", type: "textarea", options: ["No Daily Medications", "Diabetes Tablets (Metformin, etc.)", "Blood Pressure Tablets (Telmisartan, etc.)", "Thyroid Medicine (Thyronorm, etc.)", "Multivitamins / Calcium"] },
            { q: "Family history of chronic conditions (Diabetes, High BP, Kidney Disease, Thyroid)?", type: "yes-no", options: ["Yes", "No"] },
            { q: "Constitutional symptoms present currently", type: "checkbox-group", options: ["Fever / Chills", "Unexplained Weight Loss", "Extreme Fatigue / Weakness", "Loss of Appetite", "Disturbed Sleep / Insomnia", "Generalized Body Aches"] },
            { q: "Any known drug allergies (e.g. Penicillin, Sulfa, Paracetamol, Aspirin)?", type: "select", options: ["No Known Drug Allergies (NKDA)", "Penicillin / Amoxicillin", "Sulfa Drugs", "Aspirin / NSAIDs", "Paracetamol", "Other Drug Allergy"] }
        ],
        "General Health & Lifestyle": [
            { q: "Appetite and dietary habits status", type: "select", options: ["Normal Appetite", "Significantly Reduced", "Increased Hunger (Polyphagia)", "Nausea on Eating"] },
            { q: "Bowel and bladder regularities", type: "select", options: ["Normal Regular", "Constipation", "Frequent Loose Stools", "Burning on Urination", "Frequent Night Urination (Nocturia)"] }
        ]
    },
    "General": {
        "Baseline Clinical History": [
            { q: "What is your main health concern or problem, and when did it start?", type: "textarea", options: ["Fever & Chills (<3 days)", "Persistent Cough & Throat Irritation", "Severe Body Aches & Weakness", "Headache & Dizziness", "Abdominal Pain & Acidity", "Routine Health Checkup"] },
            { q: "Have you been hospitalized or had surgery in the past 2-3 years?", type: "yes-no", options: ["Yes", "No"] },
            { q: "List all ongoing daily medications, dosages, and health supplements", type: "textarea", options: ["No Daily Medications", "Diabetes Tablets (Metformin, etc.)", "Blood Pressure Tablets (Telmisartan, etc.)", "Thyroid Medicine (Thyronorm, etc.)", "Multivitamins / Calcium"] },
            { q: "Family history of chronic conditions (Diabetes, High BP, Kidney Disease, Thyroid)?", type: "yes-no", options: ["Yes", "No"] },
            { q: "Constitutional symptoms present currently", type: "checkbox-group", options: ["Fever / Chills", "Unexplained Weight Loss", "Extreme Fatigue / Weakness", "Loss of Appetite", "Disturbed Sleep / Insomnia", "Generalized Body Aches"] },
            { q: "Any known drug allergies (e.g. Penicillin, Sulfa, Paracetamol, Aspirin)?", type: "select", options: ["No Known Drug Allergies (NKDA)", "Penicillin / Amoxicillin", "Sulfa Drugs", "Aspirin / NSAIDs", "Paracetamol", "Other Drug Allergy"] }
        ]
    },
    "Cardiology": {
        "Cardiac Symptoms & Risk Profile": [
            { q: "When did you first notice the chest discomfort, heaviness, or palpitations?", type: "select", options: ["Today (Sudden Onset)", "Past 2-3 Days", "Past 1-2 Weeks", "More than 1 Month", "Intermittent / Occasional"] },
            { q: "Have you ever had an ECG, 2D Echo, Angiography, or TMT test done before?", type: "yes-no", options: ["Yes", "No"] },
            { q: "Are you currently taking any blood pressure, blood thinner (Aspirin), or cholesterol medicines?", type: "checkbox-group", options: ["Blood Pressure Tablets (Antihypertensive)", "Blood Thinners (Aspirin / Clopidogrel)", "Cholesterol Lowering (Statins)", "Diabetes Medications", "None"] },
            { q: "Is there a family history of heart attack, hypertension, or sudden cardiac issues (Parents/Siblings)?", type: "yes-no", options: ["Yes", "No"] },
            { q: "Nature and sensation of chest discomfort", type: "select", options: ["Heavy Pressure / Squeezing", "Sharp / Stabbing", "Burning / Acidity-like", "Shortness of Breath on Exertion", "No Chest Pain (Only Palpitations)"] },
            { q: "Does the discomfort radiate to left arm, neck, shoulder, jaw, or back?", type: "yes-no", options: ["Yes", "No"] }
        ],
        "Exertion & Functional Capacity": [
            { q: "Do you experience breathlessness climbing 1-2 flights of stairs or walking fast?", type: "yes-no", options: ["Yes", "No"] },
            { q: "Have you noticed any swelling in both feet or ankles in the evening?", type: "yes-no", options: ["Yes", "No"] },
            { q: "Have you ever felt dizzy, lightheaded, or fainted recently?", type: "yes-no", options: ["Yes", "No"] }
        ]
    },
    "ENT": {
        "Ear, Nose & Throat Assessment": [
            { q: "When did the ear/throat/nose pain or irritation first start?", type: "select", options: ["Today (<24 hours)", "2 to 3 Days ago", "1 to 2 Weeks ago", "Chronic / Recurring (>1 month)"] },
            { q: "Have you consulted a doctor or taken any treatment for this previously?", type: "yes-no", options: ["Yes", "No"] },
            { q: "Are you currently taking any medicines (antibiotics, pain killers, nasal sprays)?", type: "checkbox-group", options: ["Antibiotics (e.g. Augmentin, Azithromycin)", "Painkillers / Anti-inflammatory", "Antiallergic (Cetirizine / Montelukast)", "Nasal Spray / Ear Drops", "None"] },
            { q: "Does anyone in your family (parents/siblings) have a history of allergies or sinus/hearing issues?", type: "yes-no", options: ["Yes", "No"] },
            { q: "Which primary symptoms are you currently experiencing?", type: "checkbox-group", options: ["Ear Pain / Discharge", "Throat Soreness / Pain Swallowing", "Nasal Congestion / Blockage", "Hearing Loss / Ringing (Tinnitus)", "Dizziness / Vertigo", "Frequent Sneezing / Cold"] },
            { q: "Pain Severity Level (Scale 1 to 10)", type: "select", options: ["1 - Very Mild", "3 - Mild", "5 - Moderate", "7 - Severe", "9 - Very Severe", "10 - Unbearable"] }
        ]
    },
    "Orthopedics": {
        "Joint & Bone Assessment": [
            { q: "When did the bone/joint/back pain begin, and was it caused by an injury or fall?", type: "select", options: ["Recent Injury / Fall / Trauma", "Gradual Onset (<1 Month)", "Chronic Pain (3+ Months)", "Post-Workout / Heavy Lifting Strain"] },
            { q: "Have you had prior X-rays, MRI scans, or physiotherapy for this condition?", type: "yes-no", options: ["Yes", "No"] },
            { q: "What pain relief tablets, ointments, or calcium/vitamin D supplements are you taking?", type: "checkbox-group", options: ["Pain Relief Gel / Spray", "NSAID Painkillers (Diclofenac, etc.)", "Calcium & Vitamin D3 Supplements", "Muscle Relaxants", "None"] },
            { q: "Does any family member suffer from Arthritis, Gout, Spondylitis, or Osteoporosis?", type: "yes-no", options: ["Yes", "No"] },
            { q: "Are you able to put weight on the affected limb and walk without support?", type: "yes-no", options: ["Yes", "No"] },
            { q: "Associated symptoms observed", type: "checkbox-group", options: ["Joint Swelling / Warmth", "Morning Stiffness (>30 mins)", "Joint Clicking / Locking", "Numbness / Tingling in Limbs", "Restricted Joint Movement"] }
        ]
    },
    "Pediatrics": {
        "Child Health & Development": [
            { q: "When did the child's fever, cough, vomiting, or symptoms first appear?", type: "select", options: ["Today (<24 hours)", "1-2 Days ago", "3-5 Days ago", "More than 1 Week"] },
            { q: "Has the child visited a clinic or received emergency pediatric care for this episode?", type: "yes-no", options: ["Yes", "No"] },
            { q: "What syrups, drops, or fever medicines (with dose & time) were given?", type: "checkbox-group", options: ["Paracetamol Syrup (Crocin / Calpol)", "Ibuprofen / Mefenamic Acid Syrup", "Cough / Cold Drops", "Antibiotic Syrup", "None"] },
            { q: "Is the child's vaccination / immunization schedule completely up-to-date?", type: "yes-no", options: ["Yes", "No"] },
            { q: "Feeding, fluid intake, and active urine output status", type: "select", options: ["Normal Feeding & Playful", "Mildly Reduced Oral Intake", "Lethargic / Decreased Urine Output", "Refusing All Feeds / Vomiting Everything"] },
            { q: "Family history of childhood asthma, eczema, or food allergies", type: "yes-no", options: ["Yes", "No"] }
        ]
    },
    "Gynecology & Obstetrics": {
        "Women's Health & Obstetric Profile": [
            { q: "What is your menstrual cycle regularity and date of Last Menstrual Period (LMP)?", type: "select", options: ["Regular Cycle (28-30 Days)", "Irregular / Delayed Periods", "Missed Period (Possible Pregnancy)", "Post-Menopausal"] },
            { q: "Obstetric history (Number of Pregnancies, Deliveries, Miscarriages)", type: "select", options: ["Nulliparous (Never Pregnant)", "G1P0 (First Pregnancy)", "G2P1 (1 Living Child)", "Multi-gravida (2+ Deliveries)", "History of Miscarriage / Abortion"] },
            { q: "Are you currently taking hormonal tablets, birth control pills, or thyroid medicines?", type: "checkbox-group", options: ["Thyroid Tablets (Thyronorm, etc.)", "Birth Control / Contraceptive Pills", "Progesterone / Hormone Therapy", "Folic Acid / Prenatal Vitamins", "None"] },
            { q: "Family history of PCOS, endometriosis, ovarian cysts, or breast cancer?", type: "yes-no", options: ["Yes", "No"] },
            { q: "Primary gynecological concerns present", type: "checkbox-group", options: ["Severe Menstrual Cramps (Dysmenorrhea)", "Heavy Menstrual Bleeding (Menorrhagia)", "Abnormal White / Foul Discharge", "Lower Abdominal / Pelvic Pain", "Difficulty Conceiving (Infertility)", "Hot Flashes / Mood Changes"] }
        ]
    },
    "Dermatology": {
        "Skin, Hair & Nail Evaluation": [
            { q: "When did the skin rash, itching, pigmentation, or hair fall start?", type: "select", options: ["Acute (<1 Week)", "1 to 4 Weeks ago", "Chronic (>3 Months)", "Seasonal / Recurring"] },
            { q: "Have you used steroid creams, laser treatments, or medicated lotions?", type: "yes-no", options: ["Yes", "No"] },
            { q: "Current skincare products, sunscreens, or oral medications in use", type: "checkbox-group", options: ["Topical Steroid Creams (Betnovate, etc.)", "Antifungal Cream / Tablets", "Antihistamine / Antiallergy Tablets", "Minoxidil / Hair Serums", "None"] },
            { q: "Family history of Psoriasis, Eczema, Vitiligo, or severe Acne?", type: "yes-no", options: ["Yes", "No"] },
            { q: "Location and character of skin lesions", type: "checkbox-group", options: ["Face / Forehead Acne", "Scalp Dandruff / Patchy Hair Loss", "Body Itchy Red Rashes", "Fungal Rings (Groin / Armpits)", "Dark Pigmentation / Melasma", "Nail Discoloration / Brittleness"] }
        ]
    },
    "Ophthalmology": {
        "Eye Health & Vision Examination": [
            { q: "When did you first notice changes in vision, eye pain, or redness?", type: "select", options: ["Today (Sudden Vision Change)", "Past Few Days", "Gradual Blurring Over Months", "Eye Strain After Screen Work"] },
            { q: "Do you wear prescription eyeglasses or contact lenses?", type: "yes-no", options: ["Yes (Eyeglasses)", "Yes (Contact Lenses)", "No"] },
            { q: "Are you using eye drops (lubricant, glaucoma, or antibiotic drops)?", type: "checkbox-group", options: ["Lubricant / Tear Drops", "Glaucoma Pressure Drops", "Antibiotic / Antiallergy Drops", "None"] },
            { q: "Family history of Glaucoma, early Cataract, or Macular Degeneration?", type: "yes-no", options: ["Yes", "No"] },
            { q: "Specific visual symptoms experienced", type: "checkbox-group", options: ["Blurred Distance Vision", "Difficulty Reading Fine Print", "Eye Pain / Grittiness / Dryness", "Redness / Watery Discharge", "Halos Around Lights at Night", "Floaters / Flash of Light"] }
        ]
    },
    "Neurology": {
        "Neurological Assessment": [
            { q: "When did the headache, dizziness, numbness, or weakness begin?", type: "select", options: ["Sudden Severe Onset (<24h)", "Past Few Days / Weeks", "Chronic Migraine (Months/Years)", "Episodic / Triggered by Stress"] },
            { q: "Have you had a brain MRI/CT scan or EEG done previously?", type: "yes-no", options: ["Yes", "No"] },
            { q: "Current neurological, antiepileptic, or migraine medications", type: "checkbox-group", options: ["Migraine SOS Tablets", "Antiepileptic / Seizure Medicines", "Nerve Pain Tablets (Pregabalin/Gabapentin)", "Sleeping / Antianxiety Pills", "None"] },
            { q: "Family history of Epilepsy, Stroke, Parkinson's, or Migraines?", type: "yes-no", options: ["Yes", "No"] },
            { q: "Key neurological symptoms present", type: "checkbox-group", options: ["Throbbing One-sided Headache", "Numbness / Weakness in Arms/Legs", "Difficulty in Speech / Facial Droop", "Loss of Balance / Unsteady Gait", "Tremors / Involuntary Shaking", "Memory Loss / Confusion"] }
        ]
    },
    "Gastroenterology": {
        "Digestive Health Profile": [
            { q: "When did the abdominal pain, acidity, bloating, or digestive issues start?", type: "select", options: ["Today / Acute Episode", "Past 2-3 Weeks", "Chronic / Intermittent (>3 Months)", "Triggered by Spicy / Fatty Foods"] },
            { q: "Have you undergone an Upper GI Endoscopy or Colonoscopy previously?", type: "yes-no", options: ["Yes", "No"] },
            { q: "What antacids, PPIs (Pantoprazole), or laxatives are you taking?", type: "checkbox-group", options: ["Antacid Gel / Chewables", "PPI Tablets (Pantoprazole, Rabeprazole)", "Laxatives / Fiber Supplements", "Probiotics", "None"] },
            { q: "Family history of Gallstones, Peptic Ulcer, Liver Disease, or Colon Cancer?", type: "yes-no", options: ["Yes", "No"] },
            { q: "Gastrointestinal symptoms noted", type: "checkbox-group", options: ["Upper Abdominal Burning (Acidity/GERD)", "Severe Lower Abdominal Cramps", "Bloating & Excessive Gas", "Constipation (<3 bowel movements/week)", "Diarrhea / Loose Watery Stools", "Nausea / Vomiting"] }
        ]
    },
    "Pulmonology": {
        "Respiratory & Chest Assessment": [
            { q: "When did the cough, wheezing, or breathing difficulty begin?", type: "select", options: ["Acute (<3 Days)", "Past 1-2 Weeks", "Chronic Cough (>4 Weeks)", "Nighttime / Cold Weather Asthma"] },
            { q: "Have you had a Chest X-ray, Spirometry (PFT), or CT Chest done?", type: "yes-no", options: ["Yes", "No"] },
            { q: "Are you using inhalers (Rotacaps, Metered Dose Inhalers), nebulizers, or cough syrups?", type: "checkbox-group", options: ["Inhaler (Asthalin / Budecort / Foracort)", "Nebulizer Treatments", "Cough Syrups / Mucolytics", "Antibiotics", "None"] },
            { q: "Smoking history and daily exposure", type: "select", options: ["Non-smoker", "Former Smoker (Quit)", "Active Cigarette / Bidi Smoker", "High Dust / Pollution / Biomass Fuel Exposure"] },
            { q: "Primary respiratory complaints", type: "checkbox-group", options: ["Dry Persistent Cough", "Productive Cough with Phlegm/Sputum", "Wheezing / Whistling Chest Sound", "Shortness of Breath on Slight Exertion", "Chest Tightness / Suffocation Feeling"] }
        ]
    },
    "Dentistry": {
        "Oral Health & Dental Assessment": [
            { q: "When did the toothache, sensitivity, swelling, or gum bleeding start?", type: "select", options: ["Sudden Severe Tooth Pain (<24h)", "Past Few Days", "Long-standing Sensitivity (>1 Month)", "Routine Dental Cleaning Checkup"] },
            { q: "When was your last dental check-up, cleaning (scaling), or tooth filling done?", type: "select", options: ["Within Last 6 Months", "1 to 2 Years ago", "More than 3 Years ago", "Never had dental treatment"] },
            { q: "Are you taking pain relievers, antibiotics, or blood-thinning medications?", type: "checkbox-group", options: ["Pain Relief Tablets (Ibuprofen/Ketorol)", "Dental Antibiotics", "Blood Thinners (Aspirin)", "None"] },
            { q: "Is there a family history of early tooth loss, gum problems, or jaw disorders?", type: "yes-no", options: ["Yes", "No"] },
            { q: "Primary dental and oral complaints", type: "checkbox-group", options: ["Sharp Pain on Biting / Chewing", "Hot & Cold Sensitivity", "Bleeding / Swollen / Receding Gums", "Bad Breath (Halitosis)", "Mobile / Loose Tooth", "Jaw Joint (TMJ) Pain / Clicking"] }
        ]
    },
    "IVF & Fertility": {
        "Fertility & Reproductive Health Evaluation": [
            { q: "Duration of trying to conceive naturally (in years/months)", type: "select", options: ["Less than 1 Year", "1 to 2 Years", "2 to 5 Years", "More than 5 Years"] },
            { q: "Have you undergone previous fertility treatments (IUI, IVF, Laparoscopy, HSG)?", type: "select", options: ["None (First Fertility Consultation)", "Previous Ovulation Induction", "Previous IUI (1-3 Cycles)", "Previous IVF / ICSI Cycles", "Diagnostic Laparoscopy / Hysteroscopy Done"] },
            { q: "Current fertility medications or supplements being taken", type: "checkbox-group", options: ["Folic Acid / Prenatal Vitamins", "CoQ10 / Antioxidants", "Metformin (for PCOS)", "Thyroid / Prolactin Medicines", "None"] },
            { q: "Male partner semen analysis status", type: "select", options: ["Normal Parameters", "Low Sperm Count (Oligospermia)", "Low Motility (Asthenospermia)", "Abnormal Morphology (Teratospermia)", "Not Tested Yet"] },
            { q: "Previous diagnostic findings", type: "checkbox-group", options: ["PCOS / PCOD", "Endometriosis", "Blocked Fallopian Tube(s)", "Diminished Ovarian Reserve (Low AMH)", "Unexplained Infertility", "Recurrent Implantation Failure / Miscarriages"] }
        ]
    },
    "General Surgery": {
        "Surgical Evaluation & History": [
            { q: "Location and duration of the surgical lump, swelling, hernia, or pain", type: "select", options: ["Groin / Inguinal Swelling", "Abdominal Wall / Umbilical Lump", "Anal Pain / Bleeding / Piles", "Breast Lump / Tenderness", "Skin Cyst / Lipoma", "Acute Abdominal Pain (Suspected Appendix/Gallbladder)"] },
            { q: "Have you undergone any previous major or minor surgeries?", type: "yes-no", options: ["Yes", "No"] },
            { q: "Are you taking blood-thinners (Aspirin, Clopidogrel, Warfarin) or steroids?", type: "checkbox-group", options: ["Blood Thinners (Aspirin / Clopidogrel)", "Steroids / Immunosuppressants", "Diabetes Medicines / Insulin", "None"] },
            { q: "Any personal or family history of adverse reactions to general anesthesia?", type: "yes-no", options: ["Yes", "No"] },
            { q: "Associated symptoms observed", type: "checkbox-group", options: ["Pain Increases on Coughing / Standing", "Nausea / Vomiting Episodes", "Fever with Chills", "Bleeding with Bowel Movement", "Lump is Hard / Fixed"] }
        ]
    },
    "Urology": {
        "Urinary & Renal Tract Evaluation": [
            { q: "When did the urinary burning, frequency, flank pain, or stream difficulty start?", type: "select", options: ["Acute Flank / Kidney Pain (<24h)", "Past Few Days", "Chronic / Slow Stream (>3 Months)", "Recurring Urinary Tract Infections"] },
            { q: "Do you have a personal or family history of Kidney / Bladder Stones?", type: "yes-no", options: ["Yes", "No"] },
            { q: "Are you taking prostate medications (Tamsulosin, Finasteride) or antibiotics?", type: "checkbox-group", options: ["Prostate Tablets (Tamsulosin / Silodosin)", "Alkalizing Urine Syrups", "UTI Antibiotics", "None"] },
            { q: "Urinary symptoms and flow characteristics", type: "checkbox-group", options: ["Burning Sensation on Urination (Dysuria)", "Frequent Urination (Day and Night)", "Weak / Hesitant / Interrupted Urine Stream", "Sensation of Incomplete Bladder Emptying", "Blood in Urine (Hematuria)", "Sudden Urgent Need to Urinate"] }
        ]
    },
    "Nephrology": {
        "Kidney Health Assessment": [
            { q: "Have you been diagnosed with Chronic Kidney Disease (CKD) or high Serum Creatinine?", type: "yes-no", options: ["Yes", "No"] },
            { q: "Do you experience swelling (edema) in feet, legs, or puffy eyelids in the morning?", type: "yes-no", options: ["Yes", "No"] },
            { q: "Daily urine output volume and appearance", type: "select", options: ["Normal Output (~1.5-2L/day)", "Reduced Urine Output (Oliguria)", "Foamy / Frothy Urine (Proteinuria)", "Dark / Cola-colored Urine"] },
            { q: "History of Longstanding Diabetes (>5 yrs) or High Blood Pressure?", type: "yes-no", options: ["Yes", "No"] }
        ]
    },
    "Oncology": {
        "Oncology History & Symptoms": [
            { q: "Primary reason for oncology evaluation", type: "select", options: ["Suspicious Lump / Growth", "Unexplained Significant Weight Loss & Loss of Appetite", "Persistent Unexplained Fever / Night Sweats", "Abnormal Biopsy / Histopathology Report", "Routine Cancer Screening / Follow-up"] },
            { q: "Have you had prior biopsy, FNAC, PET-CT scan, or cancer treatment?", type: "yes-no", options: ["Yes", "No"] },
            { q: "Family history of cancer (Breast, Colon, Lung, Prostate, Ovarian)?", type: "yes-no", options: ["Yes", "No"] }
        ]
    },
    "Psychiatry": {
        "Mental Health & Behavioral Screening": [
            { q: "Primary psychological concerns experienced", type: "checkbox-group", options: ["Persistent Low Mood / Sadness", "Severe Anxiety / Panic Attacks", "Sleep Disturbances / Insomnia", "Excessive Worry / Overthinking", "Loss of Interest in Daily Activities", "Obsessive Thoughts / Compulsions"] },
            { q: "Duration of emotional or sleep difficulties", type: "select", options: ["Past 2-4 Weeks", "1 to 6 Months", "More than 1 Year", "Lifelong / Recurring"] },
            { q: "Are you taking any psychiatric, antidepressant, or sleeping medications?", type: "checkbox-group", options: ["Antidepressants (SSRI/SNRI)", "Anxiolytics / Calming Tablets", "Sleep Medications", "None"] },
            { q: "Family history of depression, anxiety, bipolar disorder, or addiction?", type: "yes-no", options: ["Yes", "No"] }
        ]
    }
};

/**
 * Fuzzy Department Questions Resolver
 */
function resolveDepartmentQuestions(libraryData, deptName) {
    if (!deptName) return MASTER_DEFAULT_QUESTION_LIBRARY["General Medicine"] || {};

    const lib = libraryData && Object.keys(libraryData).length > 0
        ? { ...MASTER_DEFAULT_QUESTION_LIBRARY, ...libraryData }
        : MASTER_DEFAULT_QUESTION_LIBRARY;

    // Direct key match
    if (lib[deptName] && Object.keys(lib[deptName]).length > 0) return lib[deptName];

    // Case-insensitive exact match
    const clean = deptName.toLowerCase().trim();
    for (const [key, questions] of Object.entries(lib)) {
        const kClean = key.toLowerCase().trim();
        if (kClean === clean && Object.keys(questions || {}).length > 0) return questions;
    }

    // Substring match
    for (const [key, questions] of Object.entries(lib)) {
        const kClean = key.toLowerCase().trim();
        if ((kClean.includes(clean) || clean.includes(kClean)) && Object.keys(questions || {}).length > 0) return questions;
    }

    // Specialized keyword mappings
    if (clean.includes('cardio') || clean.includes('heart')) return lib['Cardiology'] || {};
    if (clean.includes('ent') || clean.includes('ear') || clean.includes('nose') || clean.includes('throat')) return lib['ENT'] || {};
    if (clean.includes('ortho') || clean.includes('bone') || clean.includes('joint') || clean.includes('spine')) return lib['Orthopedics'] || {};
    if (clean.includes('ped') || clean.includes('child') || clean.includes('baby') || clean.includes('infant')) return lib['Pediatrics'] || {};
    if (clean.includes('gyn') || clean.includes('obs') || clean.includes('women') || clean.includes('matern') || clean.includes('pregnan')) return lib['Gynecology & Obstetrics'] || {};
    if (clean.includes('derm') || clean.includes('skin') || clean.includes('hair') || clean.includes('nail')) return lib['Dermatology'] || {};
    if (clean.includes('opht') || clean.includes('eye') || clean.includes('vision')) return lib['Ophthalmology'] || {};
    if (clean.includes('neuro') || clean.includes('brain') || clean.includes('nerve')) return lib['Neurology'] || {};
    if (clean.includes('gastro') || clean.includes('stomach') || clean.includes('liver') || clean.includes('digest')) return lib['Gastroenterology'] || {};
    if (clean.includes('pulm') || clean.includes('chest') || clean.includes('lung') || clean.includes('respir')) return lib['Pulmonology'] || {};
    if (clean.includes('dent') || clean.includes('tooth') || clean.includes('oral')) return lib['Dentistry'] || {};
    if (clean.includes('ivf') || clean.includes('fertil') || clean.includes('infertilit')) return lib['IVF & Fertility'] || {};
    if (clean.includes('surg') || clean.includes('operat')) return lib['General Surgery'] || {};
    if (clean.includes('uro') || clean.includes('bladder')) return lib['Urology'] || {};
    if (clean.includes('kidney') || clean.includes('nephro') || clean.includes('renal')) return lib['Nephrology'] || lib['Urology'] || {};
    if (clean.includes('cancer') || clean.includes('onco') || clean.includes('tumor')) return lib['Oncology'] || {};
    if (clean.includes('psych') || clean.includes('mental') || clean.includes('mind')) return lib['Psychiatry'] || {};
    if (clean.includes('general') || clean.includes('physician') || clean.includes('opd') || clean.includes('internal') || clean.includes('medicine')) return lib['General Medicine'] || lib['General'] || {};

    return lib['General Medicine'] || lib['General'] || Object.values(lib)[0] || {};
}

module.exports = {
    MASTER_DEFAULT_QUESTION_LIBRARY,
    resolveDepartmentQuestions
};
