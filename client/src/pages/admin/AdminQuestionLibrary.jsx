import React, { useState, useEffect, useRef } from 'react';
import { questionLibraryAPI } from '../../utils/api';
import confirmToast, { promptToast, toast } from '../../utils/confirmToast';
import { 
    FaMicrochip, 
    FaVrCardboard, 
    FaCloudArrowUp, 
    FaServer, 
    FaBone, 
    FaBrain, 
    FaHeartPulse, 
    FaDna, 
    FaFlask, 
    FaBaby, 
    FaStethoscope, 
    FaEarListen, 
    FaPlus, 
    FaCubes, 
    FaPenToSquare, 
    FaTrash, 
    FaAngleRight, 
    FaCircleInfo, 
    FaBolt, 
    FaXmark,
    FaEye,
    FaArrowsRotate
} from 'react-icons/fa6';
import './AdminQuestionLibrary.css';

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

const AdminQuestionLibrary = () => {
    const [libraryData, setLibraryData] = useState(defaultQuestionLibraryData);

    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [isAiGenerating, setIsAiGenerating] = useState(false);
    const [allowedDepartments, setAllowedDepartments] = useState(null);

    const [departmentTab, setDepartmentTab] = useState('ENT');
    const [activeCategory, setActiveCategory] = useState('Clinical History & Intake');
    const [newCatName, setNewCatName] = useState('');

    const [showAddModal, setShowAddModal] = useState(false);
    const [editIndex, setEditIndex] = useState(null);

    // Department Modal State
    const [showDeptModal, setShowDeptModal] = useState(false);
    const [selectedDept, setSelectedDept] = useState('');
    const [customDept, setCustomDept] = useState('');

    // Predefined departments for dropdown
    const [predefinedDepartments, setPredefinedDepartments] = useState([
        "ENT", "Cardiology", "Orthopedics", "Pediatrics", "Gynecology & Obstetrics", 
        "Dermatology", "Ophthalmology", "Neurology", "Gastroenterology", "Pulmonology", 
        "General Medicine", "Dentistry"
    ]);

    const [showPreview, setShowPreview] = useState(false);
    const [previewIntake, setPreviewIntake] = useState({});

    const [newQ, setNewQ] = useState({
        q: '',
        type: 'text',
        options: '',
        extra: '',
        parentQ: '',
        condition: ''
    });

    useEffect(() => {
        fetchLibrary();
    }, []);

    const fetchLibrary = async () => {
        try {
            setLoading(true);
            const res = await questionLibraryAPI.getLibrary();
            let data = res.data?.data;
            if (!data || Object.keys(data).length === 0) {
                data = defaultQuestionLibraryData;
            } else {
                // Ensure all 12 departments are always merged in
                data = { ...defaultQuestionLibraryData, ...data };
            }

            setLibraryData(data);
            setAllowedDepartments(res.allowedDepartments || null);

            const visibleDepts = res.allowedDepartments ? Object.keys(data).filter(d => res.allowedDepartments.includes(d)) : Object.keys(data);
            let defaultDept = visibleDepts.length > 0 ? visibleDepts[0] : 'ENT';
            
            setDepartmentTab(defaultDept);
            const firstDeptCats = Object.keys(data[defaultDept] || {});
            if (firstDeptCats.length > 0) {
                setActiveCategory(firstDeptCats[0]);
            }
        } catch (err) {
            console.error('Error fetching question library:', err);
            toast.error('Failed to fetch library.');
        } finally {
            setLoading(false);
        }
    };

    const handleRefresh = async () => {
        setRefreshing(true);
        await fetchLibrary();
        setTimeout(() => {
            setRefreshing(false);
            toast.success('Question Library refreshed!');
        }, 400);
    };

    const handleResetToStandard = async () => {
        const confirmed = await confirmToast(
            "Do you want to reset & load all 12 standard medical departments (ENT, Cardiology, Orthopedics, Pediatrics, Gynecology, etc.) with 60+ clinical intake questions?",
            { title: 'Load 12 Medical Departments', confirmText: 'Load All 12 Depts' }
        );
        if (!confirmed) return;
        setLibraryData(defaultQuestionLibraryData);
        setDepartmentTab('ENT');
        setActiveCategory('Clinical History & Intake');
        setSaving(true);
        try {
            await questionLibraryAPI.updateLibrary(defaultQuestionLibraryData);
            toast.success('✨ Successfully loaded and deployed all 12 Medical Departments!');
        } catch (err) {
            toast.error('Error updating standard library in database.');
        } finally {
            setSaving(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const res = await questionLibraryAPI.updateLibrary(libraryData);
            if (res.success) {
                toast.success('Question Library synced & deployed to core doctor workflows!');
            }
        } catch (err) {
            toast.error('Error saving library.');
        } finally {
            setSaving(false);
        }
    };

    const handleAddCategory = (catNameInput = null) => {
        const cat = (catNameInput || newCatName).trim();
        if (!cat) return;
        if (libraryData[departmentTab] && libraryData[departmentTab][cat]) {
            toast.error(`Category "${cat}" already exists in ${departmentTab}`);
            return;
        }

        const newLib = { ...libraryData };
        if (!newLib[departmentTab]) newLib[departmentTab] = {};
        newLib[departmentTab][cat] = [];

        setLibraryData(newLib);
        setActiveCategory(cat);
        setNewCatName('');
        toast.success(`Category "${cat}" injected`);
    };

    const handleEditCategory = async (oldName) => {
        const newName = await promptToast('Enter new name for category:', {
            title: 'Rename Category',
            defaultValue: oldName,
            placeholder: 'Category name...',
            confirmText: 'Rename'
        });
        if (!newName || !newName.trim() || newName.trim() === oldName) return;
        const cleanName = newName.trim();

        if (libraryData[departmentTab][cleanName]) {
            toast.error("Category with this name already exists!");
            return;
        }

        const newLib = { ...libraryData };
        const questions = newLib[departmentTab][oldName];
        delete newLib[departmentTab][oldName];
        newLib[departmentTab][cleanName] = questions;

        setLibraryData(newLib);
        if (activeCategory === oldName) setActiveCategory(cleanName);
        toast.success(`Renamed category to "${cleanName}"`);
    };

    const handleDeleteCategory = async (catName) => {
        const confirmed = await confirmToast(
            `Are you sure you want to delete the sequence "${catName}" and all its data points?`,
            { title: 'Delete Category', confirmText: 'Delete' }
        );
        if (!confirmed) return;
        
        const newLib = { ...libraryData };
        delete newLib[departmentTab][catName];

        setLibraryData(newLib);
        if (activeCategory === catName) {
            const keys = Object.keys(newLib[departmentTab] || {});
            setActiveCategory(keys.length > 0 ? keys[0] : '');
        }
        toast.success(`Category "${catName}" deleted`);
    };

    const handleAddDepartmentClick = () => {
        setShowDeptModal(true);
        setSelectedDept('');
        setCustomDept('');
    };

    const confirmAddDepartment = () => {
        const dept = customDept.trim() || selectedDept.trim();
        if (!dept) {
            toast.error("Please select or enter a department name.");
            return;
        }
        if (libraryData[dept]) {
            toast.error("Department already exists!");
            return;
        }
        
        if (customDept.trim() && !predefinedDepartments.includes(customDept.trim())) {
            setPredefinedDepartments([...predefinedDepartments, customDept.trim()]);
        }

        setLibraryData({ ...libraryData, [dept]: {} });
        setDepartmentTab(dept);
        setActiveCategory('');
        setShowDeptModal(false);
        toast.success(`Department "${dept}" initialized`);
    };

    const handleEditDepartment = async (oldDept) => {
        const newDept = await promptToast('Enter new name for department:', {
            title: 'Rename Department',
            defaultValue: oldDept,
            placeholder: 'Department name...',
            confirmText: 'Rename'
        });
        if (!newDept || !newDept.trim() || newDept.trim() === oldDept) return;
        const cleanName = newDept.trim();

        if (libraryData[cleanName]) {
            toast.error("Department with this name already exists!");
            return;
        }

        const newLib = { ...libraryData };
        const categories = newLib[oldDept];
        delete newLib[oldDept];
        newLib[cleanName] = categories;

        if (customDept.trim() && !predefinedDepartments.includes(cleanName)) {
            setPredefinedDepartments([...predefinedDepartments, cleanName]);
        }

        setSaving(true);
        try {
            const res = await questionLibraryAPI.updateLibrary(newLib);
            if (res.success) {
                setLibraryData(newLib);
                if (departmentTab === oldDept) setDepartmentTab(cleanName);
                toast.success(`Department renamed to "${cleanName}"`);
            }
        } catch (err) {
            console.error(err);
            toast.error('Error renaming department in backend.');
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteDepartment = async (deptName) => {
        const confirmed = await confirmToast(
            `Are you sure? This will permanently delete the "${deptName}" department and all its questions.`,
            { title: 'Delete Department', confirmText: 'Delete Department' }
        );
        if (!confirmed) return;
        
        const newLib = { ...libraryData };
        delete newLib[deptName];

        setSaving(true);
        try {
            const res = await questionLibraryAPI.updateLibrary(newLib);
            if (res.success) {
                setLibraryData(newLib);
                if (departmentTab === deptName) {
                    const keys = Object.keys(newLib);
                    if (keys.length > 0) {
                        setDepartmentTab(keys[0]);
                        const cats = Object.keys(newLib[keys[0]] || {});
                        setActiveCategory(cats.length > 0 ? cats[0] : '');
                    } else {
                        setDepartmentTab('');
                        setActiveCategory('');
                    }
                }
                toast.success(`Department "${deptName}" deleted`);
            }
        } catch (err) {
            console.error(err);
            toast.error('Error deleting department from backend.');
        } finally {
            setSaving(false);
        }
    };

    // ─── Smart AI Auto-Generate Suggestion ───
    const handleAiAutoGenerate = () => {
        setIsAiGenerating(true);
        const dept = departmentTab || 'General';

        const suggestionsMap = {
            'ENT': [
                { name: 'Audiometry & Vertigo Profile', questions: [
                    { q: 'When did the ear pain, throat soreness, or nasal blockage start?', type: 'text' },
                    { q: 'Have you had prior ENT surgeries, tonsillectomy, or ear discharge?', type: 'yes-no' },
                    { q: 'Current antibiotic or nasal drop regimen', type: 'textarea' },
                    { q: 'Family history of hearing loss, sinus, or allergic rhinitis', type: 'yes-no' },
                    { q: 'Primary ENT symptoms', type: 'checkbox-group', options: ['Ear Pain / Discharge', 'Throat Soreness', 'Nasal Congestion', 'Hearing Loss / Tinnitus', 'Dizziness / Vertigo'] },
                    { q: 'Pain Severity Scale (1 - 10)', type: 'select', options: ['1 - Very Mild', '3 - Mild', '5 - Moderate', '7 - Severe', '9 - Very Severe', '10 - Unbearable'] }
                ]}
            ],
            'Cardiology': [
                { name: 'Acute Coronary Diagnostic Sequence', questions: [
                    { q: 'Chest Pain Character & Sensation', type: 'select', options: ['Crushing / Squeezing', 'Sharp / Stabbing', 'Burning / Acidity-like', 'Shortness of breath on exertion'] },
                    { q: 'Radiation to Left Arm, Jaw, or Back', type: 'yes-no' },
                    { q: 'Previous ECG, 2D Echo, or Angiography done', type: 'yes-no' },
                    { q: 'Current BP, Blood Thinner, or Statin Medicines', type: 'textarea' },
                    { q: 'Family history of Heart Attack or High Blood Pressure', type: 'yes-no' }
                ]}
            ],
            'Orthopedics': [
                { name: 'Joint Mobility & Fracture Assessment', questions: [
                    { q: 'Injury Onset & Mechanism (Fall / Twist / Trauma)', type: 'text' },
                    { q: 'Weight Bearing Ability on Affected Limb', type: 'yes-no' },
                    { q: 'Prior X-rays or Orthopedic Consultations', type: 'yes-no' },
                    { q: 'Current NSAIDs or Pain Reliever Dosage', type: 'textarea' },
                    { q: 'Swelling & Deformity Observed', type: 'checkbox-group', options: ['Joint Effusion', 'Morning Stiffness', 'Locking / Clicking', 'Numbness in Limbs'] },
                    { q: 'Range of Motion Limitation', type: 'select', options: ['None', 'Mild (<25%)', 'Moderate (25-50%)', 'Severe (>50%)'] }
                ]}
            ],
            'Pediatrics': [
                { name: 'Pediatric Intake & Development', questions: [
                    { q: 'Onset of fever, cough, or symptoms in the child', type: 'text' },
                    { q: 'Is the immunization / vaccination schedule up-to-date?', type: 'yes-no' },
                    { q: 'Medications or fever syrups administered recently', type: 'textarea' },
                    { q: 'Feeding and fluid intake status', type: 'select', options: ['Normal & Active', 'Reduced Oral Intake', 'Poor Urine Output', 'Refusing Feeds'] },
                    { q: 'Family history of childhood asthma or food allergies', type: 'yes-no' }
                ]}
            ],
            'Gynecology & Obstetrics': [
                { name: 'Women’s Health & Obstetric Intake', questions: [
                    { q: 'Date of Last Menstrual Period (LMP)', type: 'text' },
                    { q: 'Prior ultrasound scans or gynecologist consultations', type: 'yes-no' },
                    { q: 'Current hormonal or iron/folic acid medicines', type: 'textarea' },
                    { q: 'Family history of PCOD, Fibroids, or Diabetes', type: 'yes-no' },
                    { q: 'Primary gynecological complaints', type: 'checkbox-group', options: ['Irregular Periods', 'Severe Cramps', 'Heavy Bleeding', 'White Discharge / Itching', 'Nausea / Morning Sickness'] },
                    { q: 'Obstetric History (Gravida / Para / Living / Abortion)', type: 'text' }
                ]}
            ],
            'Dermatology': [
                { name: 'Dermatological Lesion Profile', questions: [
                    { q: 'Duration & body location of rash/itching', type: 'text' },
                    { q: 'Previous use of steroid creams or treatments', type: 'yes-no' },
                    { q: 'List of recent soaps, cosmetics, or new oral tablets', type: 'textarea' },
                    { q: 'Family history of Psoriasis, Eczema, or Fungal infections', type: 'yes-no' },
                    { q: 'Skin symptoms observed', type: 'checkbox-group', options: ['Intense Itching', 'Burning Sensation', 'Dry Flaking Skin', 'Blisters / Pus Lesions'] }
                ]}
            ],
            'Ophthalmology': [
                { name: 'Ocular & Visual Acuity Intake', questions: [
                    { q: 'Onset of blurriness, redness, or eye strain', type: 'text' },
                    { q: 'Currently wearing glasses or contact lenses', type: 'yes-no' },
                    { q: 'Current eye drops in use (Lubricant / Antibiotic / Steroid)', type: 'textarea' },
                    { q: 'Family history of Glaucoma or Cataract', type: 'yes-no' },
                    { q: 'Symptoms experienced', type: 'checkbox-group', options: ['Right Eye', 'Left Eye', 'Both Eyes', 'Redness & Watering', 'Photophobia (Light sensitivity)'] }
                ]}
            ],
            'Neurology': [
                { name: 'Cranial & Peripheral Nerve Evaluation', questions: [
                    { q: 'Onset & frequency of headaches or numbness', type: 'text' },
                    { q: 'Prior Brain MRI/CT scan or EEG done', type: 'yes-no' },
                    { q: 'Current anti-epileptic or migraine medication', type: 'textarea' },
                    { q: 'Family history of Stroke, Epilepsy, or Migraine', type: 'yes-no' },
                    { q: 'Neurological symptoms noted', type: 'checkbox-group', options: ['One-sided Headache', 'Limb Numbness', 'Fainting / Blackouts', 'Hand Tremors', 'Slurred Speech'] }
                ]}
            ],
            'Gastroenterology': [
                { name: 'GI Tract & Digestive Screening', questions: [
                    { q: 'When did the stomach pain, acidity, or bloating start?', type: "text" },
                    { q: 'Prior Endoscopy or Abdominal Ultrasound done', type: "yes-no" },
                    { q: 'Current antacids, PPIs, or laxative usage', type: "textarea" },
                    { q: 'Family history of Ulcers, Gallstones, or Fatty Liver', type: "yes-no" },
                    { q: 'Primary digestive symptoms', type: "checkbox-group", options: ['Heartburn / GERD', 'Abdominal Gas', 'Constipation', 'Loose Stools', 'Post-meal Vomiting'] }
                ]}
            ],
            'Pulmonology': [
                { name: 'Respiratory & Sputum Assessment', questions: [
                    { q: 'Duration of cough, breathlessness, or wheezing', type: 'text' },
                    { q: 'Prior Chest X-ray or Spirometry (PFT) test done', type: 'yes-no' },
                    { q: 'Current inhaler or nebulizer regimen', type: 'textarea' },
                    { q: 'Family history of Asthma or Tuberculosis', type: 'yes-no' },
                    { q: 'Cough characteristics', type: 'select', options: ['Dry Cough', 'Clear Sputum', 'Yellow/Green Sputum', 'Blood in Sputum (Hemoptysis)'] }
                ]}
            ],
            'General Medicine': [
                { name: 'Comprehensive Baseline Intake', questions: [
                    { q: 'Chief Complaint & Duration', type: 'textarea' },
                    { q: 'Hospitalization or surgery in past 2 years', type: 'yes-no' },
                    { q: 'Daily Medications & Health Supplements', type: 'textarea' },
                    { q: 'Family history of Diabetes, High BP, or Thyroid', type: 'yes-no' },
                    { q: 'Constitutional Symptoms', type: 'checkbox-group', options: ['Fever', 'Weight Loss', 'Fatigue', 'Loss of Appetite', 'Body Aches'] },
                    { q: 'Known Drug Allergies', type: 'text' }
                ]}
            ],
            'Dentistry': [
                { name: 'Dental & Periodontal Intake', questions: [
                    { q: 'Onset of tooth pain, sensitivity, or swelling', type: 'text' },
                    { q: 'Date of last dental cleaning or cavity filling', type: 'text' },
                    { q: 'Current pain relievers or antibiotic usage', type: 'textarea' },
                    { q: 'Family history of early tooth loss or gum issues', type: 'yes-no' },
                    { q: 'Dental symptoms', type: 'checkbox-group', options: ['Chewing Pain', 'Hot/Cold Sensitivity', 'Bleeding Gums', 'Bad Breath', 'Loose Tooth'] }
                ]}
            ]
        };

        const pool = suggestionsMap[dept] || suggestionsMap['General'];
        const selected = pool[Math.floor(Math.random() * pool.length)];

        setTimeout(() => {
            const newLib = { ...libraryData };
            if (!newLib[dept]) newLib[dept] = {};

            const catTitle = selected.name;
            newLib[dept][catTitle] = selected.questions;

            setLibraryData(newLib);
            setActiveCategory(catTitle);
            setIsAiGenerating(false);
            toast.success(`✨ AI generated sequence: "${catTitle}" with ${selected.questions.length} data points!`);
        }, 1100);
    };

    const resetModalState = () => {
        setShowAddModal(false);
        setEditIndex(null);
        setNewQ({ q: '', type: 'text', options: '', extra: '', parentQ: '', condition: '' });
    };

    const handleAddQuestion = () => {
        const qText = newQ.q.trim();
        if (!qText) {
            toast.error("Please enter a question.");
            return;
        }

        const finalQuestion = {
            q: qText,
            type: newQ.type
        };

        if (['select', 'checkbox-group', 'checkbox-date-group', 'checkbox-text-group'].includes(newQ.type)) {
            finalQuestion.options = newQ.options.split(',').map(s => s.trim()).filter(s => s);
        }

        if (['checkbox-date-group', 'checkbox-text-group'].includes(newQ.type)) {
            finalQuestion.extra = newQ.extra.trim() || 'Remarks';
        }

        if (newQ.parentQ.trim() && newQ.condition.trim()) {
            finalQuestion.parentQ = newQ.parentQ.trim();
            finalQuestion.condition = newQ.condition.trim();
        }

        const newLib = { ...libraryData };
        if (!newLib[departmentTab][activeCategory]) {
            newLib[departmentTab][activeCategory] = [];
        }

        if (editIndex !== null) {
            newLib[departmentTab][activeCategory][editIndex] = finalQuestion;
            toast.success('Data point updated');
        } else {
            newLib[departmentTab][activeCategory] = [
                ...newLib[departmentTab][activeCategory],
                finalQuestion
            ];
            toast.success('Data point injected');
        }

        setLibraryData(newLib);
        resetModalState();
    };

    const handleEditQuestion = (index) => {
        const qToEdit = libraryData[departmentTab][activeCategory][index];
        setNewQ({
            q: qToEdit.q || '',
            type: qToEdit.type || 'text',
            options: qToEdit.options ? qToEdit.options.join(', ') : '',
            extra: qToEdit.extra || '',
            parentQ: qToEdit.parentQ || '',
            condition: qToEdit.condition || ''
        });
        setEditIndex(index);
        setShowAddModal(true);
    };

    const handleDeleteQuestion = async (cat, index) => {
        const confirmed = await confirmToast("Are you sure you want to delete this question?", {
            title: 'Delete Question',
            confirmText: 'Delete'
        });
        if (!confirmed) return;
        const newLib = { ...libraryData };
        newLib[departmentTab][cat].splice(index, 1);
        setLibraryData(newLib);
        toast.success('Question deleted');
    };

    const getTypeLabel = (type) => {
        const map = {
            'text': 'TEXT',
            'number': 'NUMERIC',
            'yes-no': 'YES/NO',
            'date': 'DATE',
            'textarea': 'LONG TEXT',
            'select': 'DROPDOWN',
            'checkbox-group': 'MULTI-CHECK',
            'checkbox-date-group': 'CHECK+DATE',
            'checkbox-text-group': 'CHECK+TEXT',
            'gender-toggle': 'GENDER',
            'row': 'ROW'
        };
        return map[type] || 'CLINICAL';
    };

    const renderQuestionCard = (item, index, cat) => {
        let inputHtml = null;

        if (item.type === "select") {
            inputHtml = (
                <select disabled style={{ width: '170px' }}>
                    <option>Select option...</option>
                    {(item.options || []).map(o => <option key={o}>{o}</option>)}
                </select>
            );
        } else if (item.type === "yes-no") {
            inputHtml = (
                <select disabled style={{ width: '160px' }}>
                    <option>Select...</option>
                    <option>Yes</option>
                    <option>No</option>
                </select>
            );
        } else if (item.type === "date") {
            inputHtml = <input type="date" disabled style={{ width: '200px' }} />;
        } else if (item.type === "checkbox-group") {
            inputHtml = (
                <div className='ql-checkbox-grid'>
                    {(item.options || []).map(opt => (
                        <label key={opt}><input type='checkbox' disabled /> {opt}</label>
                    ))}
                </div>
            );
        } else if (item.type === "textarea") {
            inputHtml = <textarea disabled rows="2" placeholder="Clinical observations..." style={{ width: '100%', resize: 'vertical' }} />;
        } else if (item.type === "checkbox-date-group" || item.type === "checkbox-text-group") {
            inputHtml = (
                <div className='ql-complex-group'>
                    {(item.options || []).map(opt => (
                        <div className="ql-complex-row" key={opt}>
                            <label><input type='checkbox' disabled /> {opt}</label>
                            {opt !== 'None' && <input type={item.type === 'checkbox-date-group' ? 'date' : 'text'} disabled placeholder="Input..." style={{ width: '120px', padding: '4px 8px', marginLeft: '10px', fontSize: '0.78rem' }} />}
                        </div>
                    ))}
                    <div className="ql-extra-field">
                        <span>{item.extra || 'Remarks'}:</span>
                        <input type="text" disabled placeholder="Details..." style={{ width: '100%', padding: '6px 8px', boxSizing: 'border-box', fontSize: '0.78rem' }} />
                    </div>
                </div>
            );
        } else {
            inputHtml = <input type={item.type || 'text'} disabled placeholder="Enter response / notes..." style={{ width: '100%', padding: '8px 12px', boxSizing: 'border-box' }} />;
        }

        return (
            <div className="ql-question-card" key={index}>
                <div className="ql-question-top">
                    <div className="ql-question-info">
                        <span className="q-icon">❓</span>
                        <strong>{item.q}</strong>
                        <span className="ql-question-type-badge">{getTypeLabel(item.type)}</span>
                    </div>
                    <div className="ql-question-actions">
                        <button className="ql-btn-edit-q" onClick={() => handleEditQuestion(index)}>
                            <FaPenToSquare /> Edit
                        </button>
                        <button className="ql-btn-del-q" onClick={() => handleDeleteQuestion(cat, index)}>
                            <FaTrash /> Del
                        </button>
                    </div>
                </div>
                {item.parentQ && (
                    <div className="ql-condition-badge">
                        <span><FaBolt /> Only shown if <b>"{item.parentQ}"</b> equals <b>"{item.condition}"</b></span>
                    </div>
                )}
                <div className="ql-input-preview">
                    {inputHtml}
                </div>
            </div>
        );
    };

    if (loading) {
        return (
            <div className="ql-admin-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ textAlign: 'center', color: '#0d9488' }}>
                    <FaMicrochip className="holo-icon" style={{ fontSize: '40px', marginBottom: '16px' }} />
                    <p style={{ fontWeight: 800, letterSpacing: '0.5px' }}>INITIALIZING CLINICAL QUESTION LIBRARY...</p>
                </div>
            </div>
        );
    }

    const currentCategories = libraryData[departmentTab] || {};
    const questionsInActiveCategory = currentCategories[activeCategory] || [];
    const visibleDepartments = allowedDepartments ? Object.keys(libraryData).filter(dept => allowedDepartments.includes(dept)) : Object.keys(libraryData);

    const getDeptIcon = (dept) => {
        const d = (dept || '').toLowerCase();
        if (d.includes('ent') || d.includes('ear') || d.includes('throat')) return <FaEarListen />;
        if (d.includes('cardio') || d.includes('heart')) return <FaHeartPulse />;
        if (d.includes('ortho') || d.includes('bone') || d.includes('joint')) return <FaBone />;
        if (d.includes('pediat') || d.includes('baby') || d.includes('child')) return <FaBaby />;
        if (d.includes('gyn') || d.includes('obs') || d.includes('women')) return <FaDna />;
        if (d.includes('derm') || d.includes('skin') || d.includes('hair')) return <FaFlask />;
        if (d.includes('opht') || d.includes('eye') || d.includes('vision')) return <FaEye />;
        if (d.includes('neuro') || d.includes('brain') || d.includes('nerve')) return <FaBrain />;
        if (d.includes('gastro') || d.includes('stomach') || d.includes('digest')) return <FaCubes />;
        if (d.includes('pulm') || d.includes('chest') || d.includes('respir') || d.includes('lung')) return <FaMicrochip />;
        if (d.includes('dent') || d.includes('oral') || d.includes('tooth')) return <FaStethoscope />;
        return <FaStethoscope />;
    };

    return (
        <div className="ql-admin-body">
            <div className="ql-app-container">
                {/* ─── 1. HEADER ─── */}
                <header className="ql-app-header">
                    <div className="ql-header-titles">
                        <h1>Question Library Builder</h1>
                        <p>Construct dynamic diagnostic forms for doctors.</p>
                    </div>
                    <div className="ql-header-actions">
                        <button className="ql-btn ql-btn-refresh" onClick={handleRefresh} disabled={refreshing || loading} title="Refresh library from server">
                            <FaArrowsRotate className={refreshing ? 'refresh-spin' : ''} /> {refreshing ? 'Refreshing...' : 'Refresh'}
                        </button>
                        <button className="ql-btn ql-btn-reset" onClick={handleResetToStandard} disabled={saving} title="Reload all 12 standard medical departments">
                            <FaMicrochip /> Reset 12 Depts
                        </button>
                        <button className="ql-btn ql-btn-preview" onClick={() => { setPreviewIntake({}); setShowPreview(true); }}>
                            <FaEye /> Preview
                        </button>
                        <button className="ql-btn ql-btn-save" onClick={handleSave} disabled={saving}>
                            <FaCloudArrowUp /> {saving ? 'Syncing...' : 'Save & Deploy'}
                        </button>
                    </div>
                </header>

                {/* ─── 2. DEPARTMENT TABS ─── */}
                <nav className="ql-dept-tabs">
                    {visibleDepartments.map(dept => (
                        <div
                            key={dept}
                            className={`ql-tab ${departmentTab === dept ? 'active' : ''}`}
                            onClick={() => {
                                setDepartmentTab(dept);
                                const cats = Object.keys(libraryData[dept] || {});
                                setActiveCategory(cats.length > 0 ? cats[0] : '');
                            }}
                        >
                            <span className="tab-icon">{getDeptIcon(dept)}</span>
                            <span>{dept}</span>
                            {departmentTab === dept && allowedDepartments === null && (
                                <span className="tab-actions-quick">
                                    <span 
                                        onClick={(e) => { e.stopPropagation(); handleEditDepartment(dept); }} 
                                        title="Rename Department"
                                        className="tab-action-icon edit"
                                    >
                                        ✏️
                                    </span>
                                    <span 
                                        onClick={(e) => { e.stopPropagation(); handleDeleteDepartment(dept); }} 
                                        title="Delete Department"
                                        className="tab-action-icon del"
                                    >
                                        🗑️
                                    </span>
                                </span>
                            )}
                        </div>
                    ))}

                    {allowedDepartments === null && (
                        <div className="ql-tab ql-tab-dashed" onClick={handleAddDepartmentClick}>
                            <FaPlus /> Add Department
                        </div>
                    )}
                </nav>

                {/* ─── 3. WORKSPACE GRID ─── */}
                <main className="ql-workspace-grid">
                    {/* LEFT SIDEBAR */}
                    <aside className="ql-sidebar">
                        <div className="ql-add-category-box">
                            <input 
                                type="text" 
                                placeholder="Enter category name..." 
                                value={newCatName} 
                                onChange={(e) => setNewCatName(e.target.value)} 
                                onKeyDown={(e) => { if (e.key === 'Enter') handleAddCategory(); }} 
                            />
                            <button className="ql-btn-add-cat" onClick={() => handleAddCategory()}>
                                <FaPlus /> Add Category
                            </button>
                        </div>

                        <div className="ql-category-list">
                            {Object.keys(currentCategories).map(cat => (
                                <div 
                                    key={cat} 
                                    className={`ql-category-item ${cat === activeCategory ? 'active' : ''}`} 
                                    onClick={() => setActiveCategory(cat)}
                                >
                                    <div className="cat-item-left">
                                        <span className="cat-folder-icon">{cat === activeCategory ? '📂' : '📁'}</span>
                                        <span className="cat-text">{cat}</span>
                                    </div>
                                    <div className="cat-item-right">
                                        <span className="ql-cat-action-btn" onClick={(e) => { e.stopPropagation(); handleEditCategory(cat); }} title="Rename">
                                            ✏️
                                        </span>
                                        <span className="ql-cat-action-btn" onClick={(e) => { e.stopPropagation(); handleDeleteCategory(cat); }} title="Delete">
                                            🗑️
                                        </span>
                                        <FaAngleRight className="cat-arrow" />
                                    </div>
                                </div>
                            ))}
                            {Object.keys(currentCategories).length === 0 && (
                                <div className="ql-no-cats">No categories added yet.</div>
                            )}
                        </div>
                    </aside>

                    {/* RIGHT CANVAS */}
                    <section className="ql-main-canvas">
                        <div className="ql-canvas-content">
                            {!activeCategory ? (
                                <div className="ql-canvas-empty">
                                    <FaCubes className="holo-icon" />
                                    <p>Select a category or add a new category to view questions.</p>
                                </div>
                            ) : (
                                <div className="ql-canvas-active">
                                    <div className="ql-canvas-header">
                                        <div className="ql-canvas-header-left">
                                            <h2>{activeCategory}</h2>
                                            <span className="ql-item-count-badge">
                                                {questionsInActiveCategory.length} Questions
                                            </span>
                                        </div>
                                        <button 
                                            className="ql-btn-add-q" 
                                            onClick={() => { 
                                                setEditIndex(null); 
                                                setNewQ({ q: '', type: 'text', options: '', extra: '', parentQ: '', condition: '' }); 
                                                setShowAddModal(true); 
                                            }}
                                        >
                                            <FaPlus /> Add Question
                                        </button>
                                    </div>

                                    <div className="ql-question-stream">
                                        {questionsInActiveCategory.map((q, idx) => renderQuestionCard(q, idx, activeCategory))}
                                        {questionsInActiveCategory.length === 0 && (
                                            <div className="ql-data-stream-empty">
                                                <p>No questions added yet in this category.</p>
                                                <p style={{ marginTop: '6px', color: '#64748b' }}>Click <b>+ Add Question</b> above to add a new question.</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </section>
                </main>
            </div>

            {/* Department Modal */}
            {showDeptModal && (
                <div className="ql-modal-overlay">
                    <div className="ql-modal-content" style={{ maxWidth: '440px' }}>
                        <div className="ql-modal-header-top">
                            <h3>Add New Department</h3>
                            <span className="modal-close" onClick={() => setShowDeptModal(false)}><FaXmark /></span>
                        </div>
                        
                        <div style={{ marginTop: '16px' }}>
                            <label className="ql-modal-label">Select from Predefined List</label>
                            <select 
                                className="ql-modal-input"
                                value={selectedDept} 
                                onChange={(e) => {
                                    setSelectedDept(e.target.value);
                                    setCustomDept('');
                                }}
                            >
                                <option value="">-- Choose Department --</option>
                                {predefinedDepartments.map(d => (
                                    <option key={d} value={d}>{d}</option>
                                ))}
                            </select>
                        </div>

                        <div className="ql-modal-divider">OR</div>
                        
                        <div>
                            <label className="ql-modal-label">Custom Department Name</label>
                            <input 
                                type="text" 
                                className="ql-modal-input" 
                                placeholder="e.g., Cardiology, Oncology..." 
                                value={customDept} 
                                onChange={(e) => {
                                    setCustomDept(e.target.value);
                                    setSelectedDept('');
                                }} 
                                onKeyDown={(e) => { if (e.key === 'Enter') confirmAddDepartment(); }}
                            />
                        </div>

                        <div className="ql-modal-actions">
                            <button className="ql-modal-btn ql-modal-btn-cancel" onClick={() => setShowDeptModal(false)}>Cancel</button>
                            <button className="ql-modal-btn ql-modal-btn-submit" onClick={confirmAddDepartment}>Add Department</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Add / Edit Question Modal */}
            {showAddModal && (
                <div className="ql-modal-overlay">
                    <div className="ql-modal-content" style={{ maxWidth: '520px' }}>
                        <div className="ql-modal-header-top">
                            <h3>{editIndex !== null ? 'Edit Question' : 'Add New Question'}</h3>
                            <span className="modal-close" onClick={resetModalState}><FaXmark /></span>
                        </div>
                        
                        <div style={{ marginTop: '16px' }}>
                            <label className="ql-modal-label">Question Label / Title *</label>
                            <input 
                                type="text" 
                                className="ql-modal-input" 
                                placeholder="e.g. Previous Medical History..." 
                                value={newQ.q} 
                                onChange={(e) => setNewQ({ ...newQ, q: e.target.value })} 
                                autoFocus
                            />
                        </div>

                        <div style={{ marginTop: '12px' }}>
                            <label className="ql-modal-label">Question Answer Type</label>
                            <select 
                                className="ql-modal-input" 
                                value={newQ.type} 
                                onChange={(e) => setNewQ({ ...newQ, type: e.target.value })}
                            >
                                <option value="text">Single Line Text</option>
                                <option value="textarea">Multi-line Paragraph (Textarea)</option>
                                <option value="number">Numeric Input</option>
                                <option value="yes-no">Yes / No Switch</option>
                                <option value="date">Date Selector</option>
                                <option value="select">Dropdown Menu (Single Select)</option>
                                <option value="checkbox-group">Multi-Checkbox Group</option>
                                <option value="checkbox-text-group">Checkboxes with Custom Text Input</option>
                                <option value="checkbox-date-group">Checkboxes with Date Inputs</option>
                            </select>
                        </div>

                        {['select', 'checkbox-group', 'checkbox-date-group', 'checkbox-text-group'].includes(newQ.type) && (
                            <div style={{ marginTop: '12px' }}>
                                <label className="ql-modal-label">Options (Comma separated)</label>
                                <input 
                                    type="text" 
                                    className="ql-modal-input" 
                                    placeholder="Option A, Option B, Option C" 
                                    value={newQ.options} 
                                    onChange={(e) => setNewQ({ ...newQ, options: e.target.value })} 
                                />
                            </div>
                        )}

                        {['checkbox-date-group', 'checkbox-text-group'].includes(newQ.type) && (
                            <div style={{ marginTop: '12px' }}>
                                <label className="ql-modal-label">Extra Notes Field Title</label>
                                <input 
                                    type="text" 
                                    className="ql-modal-input" 
                                    placeholder="e.g. Remarks, Details..." 
                                    value={newQ.extra} 
                                    onChange={(e) => setNewQ({ ...newQ, extra: e.target.value })} 
                                />
                            </div>
                        )}

                        <div style={{ marginTop: '14px', borderTop: '1px solid #e2e8f0', paddingTop: '12px' }}>
                            <label className="ql-modal-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <FaBolt style={{ color: '#eab308' }} /> Conditional Display (Optional)
                            </label>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '6px' }}>
                                <input 
                                    type="text" 
                                    className="ql-modal-input" 
                                    placeholder="Parent Question Label" 
                                    value={newQ.parentQ} 
                                    onChange={(e) => setNewQ({ ...newQ, parentQ: e.target.value })} 
                                />
                                <input 
                                    type="text" 
                                    className="ql-modal-input" 
                                    placeholder="When Parent = (e.g. Yes)" 
                                    value={newQ.condition} 
                                    onChange={(e) => setNewQ({ ...newQ, condition: e.target.value })} 
                                />
                            </div>
                        </div>

                        <div className="ql-modal-actions">
                            <button className="ql-modal-btn ql-modal-btn-cancel" onClick={resetModalState}>Cancel</button>
                            <button className="ql-modal-btn ql-modal-btn-submit" onClick={handleAddQuestion}>
                                {editIndex !== null ? 'Update Question' : '+ Add Question'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Smart Preview Modal */}
            {showPreview && (
                <div className="ql-modal-overlay">
                    <div className="ql-modal-content" style={{ maxWidth: '640px', maxHeight: '85vh', overflowY: 'auto' }}>
                        <div className="ql-modal-header-top">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <FaEye style={{ color: '#1E60A4' }} />
                                <h3>Doctor Live Form Preview</h3>
                            </div>
                            <span className="modal-close" onClick={() => setShowPreview(false)}><FaXmark /></span>
                        </div>

                        <div style={{ marginTop: '16px' }}>
                            <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '16px' }}>
                                Interactive rendering of all categories for department: <strong style={{ color: '#1E60A4' }}>{departmentTab}</strong>
                            </p>

                            {Object.keys(currentCategories).map(cat => (
                                <div key={cat} style={{ marginBottom: '20px', background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                                    <h4 style={{ margin: '0 0 12px', color: '#0f172a', fontSize: '14px', borderBottom: '1px solid #e2e8f0', paddingBottom: '6px' }}>
                                        📂 {cat}
                                    </h4>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                        {(currentCategories[cat] || []).map((q, qIdx) => (
                                            <div key={qIdx}>
                                                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                                                    {q.q}
                                                </label>
                                                {q.type === 'textarea' ? (
                                                    <textarea rows="2" placeholder="Doctor notes..." style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }} />
                                                ) : q.type === 'yes-no' ? (
                                                    <select style={{ width: '140px', padding: '6px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}>
                                                        <option>Select...</option>
                                                        <option>Yes</option>
                                                        <option>No</option>
                                                    </select>
                                                ) : q.type === 'select' ? (
                                                    <select style={{ width: '160px', padding: '6px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}>
                                                        <option>Select...</option>
                                                        {(q.options || []).map(o => <option key={o}>{o}</option>)}
                                                    </select>
                                                ) : (
                                                    <input type={q.type || 'text'} placeholder="Value..." style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }} />
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="ql-modal-actions">
                            <button className="ql-modal-btn ql-modal-btn-cancel" onClick={() => setShowPreview(false)}>Close Preview</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminQuestionLibrary;