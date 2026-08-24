import React, { useState, useEffect } from 'react';
import { questionLibraryAPI } from '../../utils/api';
import confirmToast, { promptToast, toast } from '../../utils/confirmToast';
import '../admin/AdminQuestionLibrary.css';

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

const HospitalAdminQuestionLibrary = () => {
    const [libraryData, setLibraryData] = useState(defaultQuestionLibraryData);

    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [allowedDepartments, setAllowedDepartments] = useState(null);

    const [departmentTab, setDepartmentTab] = useState('ENT');
    const [activeCategory, setActiveCategory] = useState('Clinical History & Intake');

    const [newCatName, setNewCatName] = useState('');

    const [showAddModal, setShowAddModal] = useState(false);
    const [editIndex, setEditIndex] = useState(null);

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

    const handleSave = async () => {
        setSaving(true);
        try {
            const res = await questionLibraryAPI.updateLibrary(libraryData);
            if (res.success) {
                toast.success('Question Library updated & synced with all doctor workflows successfully!');
            }
        } catch (err) {
            toast.error('Error saving library.');
        } finally {
            setSaving(false);
        }
    };

    const handleAddCategory = () => {
        const cat = newCatName.trim();
        if (!cat) return;
        if (libraryData[departmentTab] && libraryData[departmentTab][cat]) {
            alert("Category already exists for " + departmentTab);
            return;
        }

        const newLib = { ...libraryData };
        if (!newLib[departmentTab]) newLib[departmentTab] = {};
        newLib[departmentTab][cat] = [];

        setLibraryData(newLib);
        setActiveCategory(cat);
        setNewCatName('');
    };

    const handleAddDepartment = async () => {
        const dept = await promptToast("Enter new department name (e.g., Neurology, IVF):", {
            title: 'Add New Department',
            placeholder: 'Department name...',
            confirmText: 'Add'
        });
        if (!dept || !dept.trim()) return;
        const cleanDept = dept.trim();
        if (libraryData[cleanDept]) {
            toast.error("Department already exists!");
            return;
        }
        setLibraryData({ ...libraryData, [cleanDept]: {} });
        setDepartmentTab(cleanDept);
        setActiveCategory('');
        toast.success(`Department "${cleanDept}" created`);
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
            toast.success('Question updated');
        } else {
            newLib[departmentTab][activeCategory] = [
                ...newLib[departmentTab][activeCategory],
                finalQuestion
            ];
            toast.success('Question added');
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

        if (item.type === "gender-toggle") {
            inputHtml = (
                <select disabled style={{ width: '160px' }}>
                    <option>Female</option>
                    <option>Male</option>
                </select>
            );
        } else if (item.type === "select") {
            inputHtml = (
                <select disabled style={{ width: '160px' }}>
                    <option>Select...</option>
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
            inputHtml = <textarea disabled rows="2" placeholder="Long text area..." style={{ width: '100%', resize: 'vertical' }} />;
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
        } else if (item.type === "row") {
            inputHtml = (
                <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
                    {(item.fields || []).map(field => (
                        <div style={{ flex: 1 }} key={field.q}>
                            <label style={{ fontSize: '0.72rem', color: '#64748b', marginBottom: '3px', display: 'block' }}>{field.q}</label>
                            <input type={field.type || 'text'} disabled style={{ width: '100%', padding: '6px 8px', boxSizing: 'border-box', fontSize: '0.78rem' }} />
                        </div>
                    ))}
                </div>
            );
        } else {
            inputHtml = <input type={item.type || 'text'} disabled placeholder="Input" style={{ width: '100%', padding: '8px 12px', boxSizing: 'border-box' }} />;
        }

        return (
            <div className="ql-question-card" key={index}>
                <div className="ql-question-top">
                    <div className="ql-question-info">
                        <div className="q-icon">❓</div>
                        <strong>{item.q}</strong>
                        <span className="ql-question-type-badge">{getTypeLabel(item.type)}</span>
                    </div>
                    <div className="ql-question-actions">
                        <button className="ql-btn-edit-q" onClick={() => handleEditQuestion(index)}>✏️ Edit</button>
                        <button className="ql-btn-del-q" onClick={() => handleDeleteQuestion(cat, index)}>🗑 Del</button>
                    </div>
                </div>
                {item.parentQ && (
                    <div className="ql-condition-badge">
                        ⚡ Only shown if <b>"{item.parentQ}"</b> equals <b>"{item.condition}"</b>
                    </div>
                )}
                <div className="ql-input-preview">
                    {inputHtml}
                </div>
            </div>
        );
    };

    if (loading) return <div style={{ padding: '60px', textAlign: 'center', color: '#64748b' }}>Loading UI Builder...</div>;

    const currentCategories = libraryData[departmentTab] || {};
    const questionsInActiveCategory = currentCategories[activeCategory] || [];
    
    const visibleDepartments = allowedDepartments ? Object.keys(libraryData).filter(dept => allowedDepartments.includes(dept)) : Object.keys(libraryData);

    const deptIcons = {
        'ENT': '👂',
        'Cardiology': '❤️',
        'Orthopedics': '🦴',
        'Pediatrics': '👶',
        'Gynecology & Obstetrics': '🌸',
        'Gynecology': '🌸',
        'Dermatology': '🧴',
        'Ophthalmology': '👁️',
        'Neurology': '🧠',
        'Gastroenterology': '🧪',
        'Pulmonology': '🫁',
        'General Medicine': '🩺',
        'General': '🩺',
        'Dentistry': '🦷'
    };

    return (
        <div className="ql-admin-body">
            {/* Page Header */}
            <div className="ql-page-header">
                <div className="ql-page-header-left">
                    <h1>🏥 Hospital Diagnostics Library</h1>
                    <p>Customize the global template specifically for your hospital.</p>
                </div>
                <div className="ql-header-actions">
                    <button className="ql-btn-save-deploy" onClick={handleSave} disabled={saving}>
                        {saving ? '⏳ Syncing...' : '💾 Save & Deploy'}
                    </button>
                </div>
            </div>

            {/* Department Tabs */}
            <div className="ql-dept-tabs" data-lenis-prevent="true">
                {visibleDepartments.map(dept => (
                    <button
                        key={dept}
                        className={`ql-dept-tab ${departmentTab === dept ? 'active' : ''}`}
                        onClick={() => {
                            setDepartmentTab(dept);
                            const cats = Object.keys(libraryData[dept] || {});
                            setActiveCategory(cats.length > 0 ? cats[0] : '');
                        }}
                    >
                        <span className="dept-icon">{deptIcons[dept] || '🏥'}</span>
                        {dept}
                    </button>
                ))}
            </div>

            {/* Main Layout */}
            <div className="ql-main-layout">
                {/* Sidebar */}
                <aside className="ql-sidebar">
                    <div className="ql-add-category-card">
                        <input 
                            type="text" 
                            placeholder="New category name..." 
                            value={newCatName} 
                            onChange={(e) => setNewCatName(e.target.value)} 
                            onKeyDown={(e) => { if (e.key === 'Enter') handleAddCategory() }} 
                        />
                        <button className="ql-btn-add-category" onClick={handleAddCategory}>
                            + Add New Category
                        </button>
                    </div>

                    {Object.keys(currentCategories).map(cat => (
                        <div 
                            key={cat} 
                            className={`ql-category-item ${cat === activeCategory ? 'active' : ''}`} 
                            onClick={() => setActiveCategory(cat)}
                        >
                            <div className="ql-cat-name">
                                <span className="cat-folder-icon">📁</span>
                                <span>{cat}</span>
                            </div>
                            <span className="ql-cat-status">Active</span>
                        </div>
                    ))}
                    {Object.keys(currentCategories).length === 0 && <p className="ql-no-cats">No categories added yet.</p>}
                </aside>

                {/* Content Panel */}
                <main className="ql-content-panel">
                    {activeCategory ? (
                        <>
                            <div className="ql-content-header">
                                <div className="ql-content-title">
                                    <span className="title-icon">🧬</span>
                                    <h2>{activeCategory}</h2>
                                </div>
                                <button className="ql-btn-add-question" onClick={() => { setEditIndex(null); setNewQ({ q: '', type: 'text', options: '', extra: '', parentQ: '', condition: '' }); setShowAddModal(true); }}>
                                    + Add Question
                                </button>
                            </div>

                            <div className="ql-question-list">
                                {questionsInActiveCategory.map((q, idx) => renderQuestionCard(q, idx, activeCategory))}
                                {questionsInActiveCategory.length === 0 && (
                                    <div className="ql-empty-questions">
                                        No questions yet. Click "+ Add Question" above.
                                    </div>
                                )}
                            </div>
                        </>
                    ) : (
                        <div className="ql-empty-content">
                            Select or create a category to view questions.
                        </div>
                    )}
                </main>
            </div>

            {/* Add/Edit Question Modal */}
            {showAddModal && (
                <div className="ql-modal-overlay">
                    <div className="ql-modal-content" data-lenis-prevent="true">
                        <h3>{editIndex !== null ? 'Edit Question Details' : 'Add Detailed Question'}</h3>

                        <div>
                            <label className="ql-modal-label">Question Text</label>
                            <textarea className="ql-modal-input" rows="3" placeholder="e.g. Do you smoke? (Enter full details)" value={newQ.q} onChange={(e) => setNewQ({ ...newQ, q: e.target.value })} style={{ resize: 'vertical' }} />
                        </div>

                        <div>
                            <label className="ql-modal-label">Input Type</label>
                            <select className="ql-modal-input" value={newQ.type} onChange={(e) => setNewQ({ ...newQ, type: e.target.value })}>
                                <option value="text">Short Text</option>
                                <option value="number">Numeric Range / Value</option>
                                <option value="yes-no">Yes / No Question</option>
                                <option value="date">Calendar Date Selection</option>
                                <option value="textarea">Long Text / Clinical Note</option>
                                <option value="select">Dropdown Select</option>
                                <option value="checkbox-group">Multiple Choice (Checkboxes)</option>
                                <option value="checkbox-date-group">Checkboxes + Calendar Date Pickers</option>
                                <option value="checkbox-text-group">Checkboxes + Free Form Text Inputs</option>
                            </select>
                        </div>

                        {['select', 'checkbox-group', 'checkbox-date-group', 'checkbox-text-group'].includes(newQ.type) && (
                            <div>
                                <label className="ql-modal-label">Options (Comma separated)</label>
                                <input className="ql-modal-input" placeholder="Option A, Option B, Option C, None" value={newQ.options} onChange={(e) => setNewQ({ ...newQ, options: e.target.value })} />
                            </div>
                        )}

                        {['checkbox-date-group', 'checkbox-text-group'].includes(newQ.type) && (
                            <div>
                                <label className="ql-modal-label">Extra Field Label (Optional Note at the bottom)</label>
                                <input className="ql-modal-input" placeholder="e.g. Physician Notes" value={newQ.extra} onChange={(e) => setNewQ({ ...newQ, extra: e.target.value })} />
                            </div>
                        )}

                        <div className="ql-modal-logic-box">
                            <label className="ql-modal-label">Conditional Logic (Optional)</label>
                            <p>Only display this question if a previous question has a specific answer.</p>
                            <div className="ql-modal-logic-row">
                                <input className="ql-modal-input" placeholder="Parent Question Title (Exact)" value={newQ.parentQ} onChange={(e) => setNewQ({ ...newQ, parentQ: e.target.value })} />
                                <input className="ql-modal-input" placeholder="Required Answer Value" value={newQ.condition} onChange={(e) => setNewQ({ ...newQ, condition: e.target.value })} />
                            </div>
                        </div>

                        <div className="ql-modal-actions">
                            <button className="ql-modal-btn ql-modal-btn-cancel" onClick={resetModalState}>Discard</button>
                            <button className="ql-modal-btn ql-modal-btn-submit" onClick={handleAddQuestion}>{editIndex !== null ? 'Update Question' : 'Save Question to Logic Tree'}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default HospitalAdminQuestionLibrary;
