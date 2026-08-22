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
    FaEye
} from 'react-icons/fa6';
import './AdminQuestionLibrary.css';

const AdminQuestionLibrary = () => {
    const [libraryData, setLibraryData] = useState({
        "General": {},
        "Orthopedics": {},
        "ENT": {}
    });

    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [isAiGenerating, setIsAiGenerating] = useState(false);
    const [allowedDepartments, setAllowedDepartments] = useState(null);

    const [departmentTab, setDepartmentTab] = useState('General');
    const [activeCategory, setActiveCategory] = useState('');
    const [newCatName, setNewCatName] = useState('');

    const [showAddModal, setShowAddModal] = useState(false);
    const [editIndex, setEditIndex] = useState(null);

    // Department Modal State
    const [showDeptModal, setShowDeptModal] = useState(false);
    const [selectedDept, setSelectedDept] = useState('');
    const [customDept, setCustomDept] = useState('');

    // Predefined departments for dropdown
    const [predefinedDepartments, setPredefinedDepartments] = useState([
        "General", "Orthopedics", "ENT", "Cardiology", "Neurology", "Pediatrics", "Gynecology", "Dermatology", "Oncology", "IVF"
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

    // Canvas Ref for Light Neural Particles
    const canvasRef = useRef(null);

    // ─── Neural Particle Canvas Effect ───
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        let animationFrameId;
        let particles = [];

        const brandBlue = 'rgba(30, 96, 164,';  
        const brandTeal = 'rgba(56, 178, 155,'; 

        const resize = () => {
            if (!canvas) return;
            canvas.width = canvas.parentElement ? canvas.parentElement.offsetWidth : window.innerWidth;
            canvas.height = canvas.parentElement ? canvas.parentElement.offsetHeight : window.innerHeight;
        };

        window.addEventListener('resize', resize);
        resize();

        let mouse = { x: null, y: null, radius: 140 };
        const handleMouseMove = (e) => {
            const rect = canvas.getBoundingClientRect();
            mouse.x = e.clientX - rect.left;
            mouse.y = e.clientY - rect.top;
        };
        const handleMouseLeave = () => {
            mouse.x = null;
            mouse.y = null;
        };

        window.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseleave', handleMouseLeave);

        class Particle {
            constructor() {
                this.x = Math.random() * (canvas.width || window.innerWidth);
                this.y = Math.random() * (canvas.height || window.innerHeight);
                this.size = Math.random() * 2 + 0.6;
                this.speedX = (Math.random() - 0.5) * 0.55;
                this.speedY = (Math.random() - 0.5) * 0.55;
                this.isTeal = Math.random() > 0.5; 
            }
            update() {
                this.x += this.speedX;
                this.y += this.speedY;

                if (this.x < 0 || this.x > canvas.width) this.speedX *= -1;
                if (this.y < 0 || this.y > canvas.height) this.speedY *= -1;

                if (mouse.x != null) {
                    let dx = mouse.x - this.x;
                    let dy = mouse.y - this.y;
                    let distance = Math.sqrt(dx * dx + dy * dy);
                    if (distance < mouse.radius) {
                        let force = (mouse.radius - distance) / mouse.radius;
                        this.x -= (dx / distance) * force * 2;
                        this.y -= (dy / distance) * force * 2;
                    }
                }
            }
            draw() {
                ctx.fillStyle = this.isTeal ? `${brandTeal} 0.55)` : `${brandBlue} 0.55)`;
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        const particleCount = Math.min(65, Math.floor(((canvas.width || 1200) * (canvas.height || 800)) / 16000));
        for (let i = 0; i < particleCount; i++) {
            particles.push(new Particle());
        }

        const animate = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            for (let i = 0; i < particles.length; i++) {
                particles[i].update();
                particles[i].draw();
                
                for (let j = i + 1; j < particles.length; j++) {
                    let dx = particles[i].x - particles[j].x;
                    let dy = particles[i].y - particles[j].y;
                    let distance = Math.sqrt(dx * dx + dy * dy);
                    
                    if (distance < 110) {
                        ctx.strokeStyle = particles[i].isTeal 
                            ? `${brandTeal} ${0.45 - distance / 240})` 
                            : `${brandBlue} ${0.45 - distance / 240})`;
                        ctx.lineWidth = 0.5;
                        ctx.beginPath();
                        ctx.moveTo(particles[i].x, particles[i].y);
                        ctx.lineTo(particles[j].x, particles[j].y);
                        ctx.stroke();
                    }
                }
            }
            animationFrameId = requestAnimationFrame(animate);
        };
        animate();

        return () => {
            window.removeEventListener('resize', resize);
            window.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseleave', handleMouseLeave);
            cancelAnimationFrame(animationFrameId);
        };
    }, []);

    useEffect(() => {
        fetchLibrary();
    }, []);

    const fetchLibrary = async () => {
        try {
            setLoading(true);
            const res = await questionLibraryAPI.getLibrary();
            let data = res.data?.data;
            if (!data || Object.keys(data).length === 0) {
                data = { "General": {}, "Orthopedics": {}, "ENT": {} };
            }

            setLibraryData(data);
            setAllowedDepartments(res.allowedDepartments || null);

            const visibleDepts = res.allowedDepartments ? Object.keys(data).filter(d => res.allowedDepartments.includes(d)) : Object.keys(data);
            let defaultDept = 'General';
            
            if (visibleDepts.length > 0) {
                defaultDept = visibleDepts[0];
                setDepartmentTab(defaultDept);
                const firstDeptCats = Object.keys(data[defaultDept] || {});
                if (firstDeptCats.length > 0) {
                    setActiveCategory(firstDeptCats[0]);
                }
            } else {
                setDepartmentTab('General');
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
            'Orthopedics': [
                { name: 'Fracture Assessment Matrix', questions: [
                    { q: 'Injury Onset & Mechanism', type: 'text' },
                    { q: 'Weight Bearing Ability', type: 'yes-no' },
                    { q: 'Swelling & Deformity Observed', type: 'checkbox-group', options: ['Ecchymosis', 'Joint Effusion', 'Visible Displacement', 'None'] },
                    { q: 'Range of Motion Limitation', type: 'select', options: ['None', 'Mild (<25%)', 'Moderate (25-50%)', 'Severe (>50%)'] }
                ]},
                { name: 'Pre-Op Joint Mobility Protocol', questions: [
                    { q: 'Baseline Knee/Hip Flexion Degree', type: 'number' },
                    { q: 'Previous Arthroscopy History', type: 'yes-no' },
                    { q: 'Current NSAID Regimen', type: 'textarea' }
                ]}
            ],
            'Neurology': [
                { name: 'Cranial Nerve Evaluation Protocol', questions: [
                    { q: 'Visual Field Acuity', type: 'select', options: ['Normal', 'Hemianopia', 'Blurred', 'Diplopia'] },
                    { q: 'Facial Symmetry Test', type: 'yes-no' },
                    { q: 'Motor Tone & Reflex Scale (0-4+)', type: 'select', options: ['0 (Areflexia)', '1+ (Hypoactive)', '2+ (Normal)', '3+ (Hyperactive)', '4+ (Clonus)'] }
                ]}
            ],
            'Cardiology': [
                { name: 'Acute Coronary Diagnostic Sequence', questions: [
                    { q: 'Chest Pain Character', type: 'select', options: ['Crushing/Pressure', 'Sharp/Pleuritic', 'Burning', 'Atypical'] },
                    { q: 'Radiation to Left Arm or Jaw', type: 'yes-no' },
                    { q: 'ECG ST-Segment Elevation Detected', type: 'yes-no' }
                ]}
            ],
            'ENT': [
                { name: 'Audiometry & Vertigo Profile', questions: [
                    { q: 'Tinnitus Presence & Laterality', type: 'select', options: ['None', 'Bilateral', 'Left Ear Only', 'Right Ear Only'] },
                    { q: 'Dix-Hallpike Test Result', type: 'yes-no' },
                    { q: 'Duration of Dizziness Episodes', type: 'text' }
                ]}
            ],
            'General': [
                { name: 'Comprehensive Baseline Intake', questions: [
                    { q: 'Chief Complaint & Duration', type: 'textarea' },
                    { q: 'Current Temperature (°F)', type: 'number' },
                    { q: 'Known Drug Allergies', type: 'checkbox-text-group', options: ['Penicillin', 'Sulfa', 'NSAIDs', 'None'], extra: 'Allergy Notes' }
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
            inputHtml = <input type={item.type || 'text'} disabled placeholder="Input sequence value..." style={{ width: '100%', padding: '8px 12px', boxSizing: 'border-box' }} />;
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
                <div style={{ textAlign: 'center', color: '#1E60A4', fontFamily: 'Space Grotesk, sans-serif' }}>
                    <FaMicrochip className="holo-icon" style={{ fontSize: '40px', marginBottom: '16px' }} />
                    <p style={{ fontWeight: 700, letterSpacing: '1px' }}>INITIALIZING NEURAL AI BUILDER...</p>
                </div>
            </div>
        );
    }

    const currentCategories = libraryData[departmentTab] || {};
    const questionsInActiveCategory = currentCategories[activeCategory] || [];
    const visibleDepartments = allowedDepartments ? Object.keys(libraryData).filter(dept => allowedDepartments.includes(dept)) : Object.keys(libraryData);

    const getDeptIcon = (dept) => {
        const d = (dept || '').toLowerCase();
        if (d.includes('ortho') || d.includes('bone')) return <FaBone />;
        if (d.includes('neuro') || d.includes('brain')) return <FaBrain />;
        if (d.includes('cardio') || d.includes('heart')) return <FaHeartPulse />;
        if (d.includes('ent') || d.includes('ear')) return <FaEarListen />;
        if (d.includes('ivf') || d.includes('genet')) return <FaDna />;
        if (d.includes('pediat') || d.includes('baby')) return <FaBaby />;
        if (d.includes('lab') || d.includes('test')) return <FaFlask />;
        if (d.includes('derm')) return <FaStethoscope />;
        return <FaServer />;
    };

    return (
        <div className="ql-admin-body">
            {/* Ambient Lighting Orbs */}
            <div className="ambient-orb orb-1"></div>
            <div className="ambient-orb orb-2"></div>

            {/* Neural Canvas */}
            <canvas ref={canvasRef} id="neural-canvas"></canvas>

            <div className="ql-app-container">
                {/* ─── 1. HEADER ─── */}
                <header className="ql-app-header">
                    <div className="ql-header-titles">
                        <h1>Question Library Builder</h1>
                        <p>Construct dynamic diagnostic forms for doctors.</p>
                    </div>
                    <div className="ql-header-actions">
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
                            <FaPlus /> Initialize Dept
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
                                placeholder="Input sequence name..." 
                                value={newCatName} 
                                onChange={(e) => setNewCatName(e.target.value)} 
                                onKeyDown={(e) => { if (e.key === 'Enter') handleAddCategory(); }} 
                            />
                            <button className="ql-btn-add-cat" onClick={() => handleAddCategory()}>
                                <FaPlus /> Inject Category
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
                                <div className="ql-no-cats">No categories injected yet.</div>
                            )}
                        </div>
                    </aside>

                    {/* RIGHT CANVAS */}
                    <section className="ql-main-canvas">
                        <div className="ql-canvas-content">
                            {!activeCategory ? (
                                <div className="ql-canvas-empty">
                                    <FaCubes className="holo-icon" />
                                    <p>WAITING FOR CATEGORY SELECTION...</p>
                                </div>
                            ) : (
                                <div className="ql-canvas-active">
                                    <div className="ql-canvas-header">
                                        <div className="ql-canvas-header-left">
                                            <h2>{activeCategory.toUpperCase()}</h2>
                                            <span className="ql-item-count-badge">
                                                {questionsInActiveCategory.length} data points
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
                                            <FaPlus /> Inject Data Point
                                        </button>
                                    </div>

                                    <div className="ql-question-stream">
                                        {questionsInActiveCategory.map((q, idx) => renderQuestionCard(q, idx, activeCategory))}
                                        {questionsInActiveCategory.length === 0 && (
                                            <div className="ql-data-stream-empty">
                                                <p className="stream-comment">// SYNCING WITH MAINFRAME...</p>
                                                <p>&gt; No data parameters detected in this sequence.</p>
                                                <p>&gt; Awaiting manual input or AI generation.</p>
                                                <p className="stream-blink">_</p>
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
                            <h3>Initialize Department</h3>
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
                            <button className="ql-modal-btn ql-modal-btn-submit" onClick={confirmAddDepartment}>Initialize</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Add / Edit Question Modal */}
            {showAddModal && (
                <div className="ql-modal-overlay">
                    <div className="ql-modal-content" style={{ maxWidth: '520px' }}>
                        <div className="ql-modal-header-top">
                            <h3>{editIndex !== null ? 'Edit Data Point' : 'Inject New Data Point'}</h3>
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
                            <label className="ql-modal-label">Input Parameter Type</label>
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
                                {editIndex !== null ? 'Update Parameter' : 'Inject Parameter'}
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