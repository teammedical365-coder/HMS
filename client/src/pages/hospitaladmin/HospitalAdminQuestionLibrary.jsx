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
import LanguageSelector from '../../components/common/LanguageSelector';
import { 
    getUIText, 
    getTranslatedDepartment, 
    getTranslatedCategory, 
    getTranslatedClinicalText 
} from '../../utils/questionLibraryI18n';
import '../admin/AdminQuestionLibrary.css';

const defaultQuestionLibraryData = {
    "General": {
        "General Intake": []
    }
};

// Module-level in-memory cache for instant zero-lag tab transitions
let cachedQuestionLibraryData = null;
let cachedAllowedDepartments = null;

const HospitalAdminQuestionLibrary = () => {
    const [libraryData, setLibraryData] = useState(() => cachedQuestionLibraryData || {});

    const [currentLang, setCurrentLang] = useState(() => {
        return localStorage.getItem('hms_question_lib_lang') || 'en';
    });

    const handleLanguageChange = (newLang) => {
        setCurrentLang(newLang);
        localStorage.setItem('hms_question_lib_lang', newLang);
    };

    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [isAiGenerating, setIsAiGenerating] = useState(false);
    const [allowedDepartments, setAllowedDepartments] = useState(() => cachedAllowedDepartments);

    const [departmentTab, setDepartmentTab] = useState('');
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
        "General", "ENT", "Cardiology", "Orthopedics", "Pediatrics", "Gynecology & Obstetrics", 
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

    const fetchLibrary = async (isManualRefresh = false) => {
        try {
            if (!cachedQuestionLibraryData && isManualRefresh) {
                setLoading(true);
            }
            const res = await questionLibraryAPI.getLibrary();
            let data = res.data?.data || res.data;
            if (!data || typeof data !== 'object' || Object.keys(data).length === 0) {
                data = { "General": {} };
            }

            const allowed = res.allowedDepartments || null;

            cachedQuestionLibraryData = data;
            cachedAllowedDepartments = allowed;

            setLibraryData(data);
            setAllowedDepartments(allowed);

            const allDeptKeys = Object.keys(data);
            let visibleDepts = allowed && allowed.length > 0
                ? allDeptKeys.filter(d => allowed.includes(d))
                : allDeptKeys;

            if (visibleDepts.length === 0) {
                visibleDepts = allDeptKeys.length > 0 ? allDeptKeys : (allowed && allowed.length > 0 ? allowed : ['General']);
            }

            const activeDept = (departmentTab && visibleDepts.includes(departmentTab))
                ? departmentTab
                : visibleDepts[0];

            setDepartmentTab(activeDept);
            const firstDeptCats = Object.keys(data[activeDept] || {});
            if (firstDeptCats.length > 0) {
                setActiveCategory(firstDeptCats[0]);
            } else {
                setActiveCategory('');
            }
        } catch (err) {
            console.error('Error fetching question library:', err);
            if (isManualRefresh) toast.error('Failed to fetch library.');
        } finally {
            setLoading(false);
        }
    };

    const handleRefresh = async () => {
        setRefreshing(true);
        await fetchLibrary(true);
        setTimeout(() => {
            setRefreshing(false);
            toast.success('Question Library refreshed!');
        }, 400);
    };

    const handleResetToStandard = async () => {
        const confirmed = await confirmToast(
            "Do you want to reset and reload the library from the server?",
            { title: 'Reload Library', confirmText: 'Reload' }
        );
        if (!confirmed) return;
        await fetchLibrary(true);
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const res = await questionLibraryAPI.updateLibrary(libraryData);
            if (res.success || res._offline) {
                cachedQuestionLibraryData = libraryData;
                toast.success('Question Library updated & synced with all doctor workflows successfully!');
            }
        } catch (err) {
            console.error('Error saving library:', err);
            toast.error(err?.response?.data?.message || err?.message || 'Error saving library.');
        } finally {
            setSaving(false);
        }
    };

    // Derived properties for fail-safe active department & category selection
    const allDeptKeys = Object.keys(libraryData);
    let finalVisibleDepts = allowedDepartments && allowedDepartments.length > 0
        ? allDeptKeys.filter(d => allowedDepartments.includes(d))
        : allDeptKeys;

    if (finalVisibleDepts.length === 0) {
        finalVisibleDepts = allDeptKeys.length > 0 ? allDeptKeys : (allowedDepartments && allowedDepartments.length > 0 ? allowedDepartments : ['General']);
    }

    const currentDept = (departmentTab && finalVisibleDepts.includes(departmentTab))
        ? departmentTab
        : (finalVisibleDepts[0] || 'General');

    const currentCategories = libraryData[currentDept] || {};
    const categoryKeys = Object.keys(currentCategories);
    const activeCat = (activeCategory && categoryKeys.includes(activeCategory))
        ? activeCategory
        : (categoryKeys[0] || '');

    const questionsInActiveCategory = currentCategories[activeCat] || [];

    const handleAddCategory = () => {
        const cat = newCatName.trim();
        if (!cat) return;

        const dept = currentDept;
        if (libraryData[dept]?.[cat]) {
            toast.error('Category already exists in this department.');
            return;
        }

        const newLib = { ...libraryData };
        if (!newLib[dept]) {
            newLib[dept] = {};
        }
        newLib[dept][cat] = [];
        setLibraryData(newLib);
        setActiveCategory(cat);
        setNewCatName('');
        toast.success(`Category "${cat}" added.`);
    };

    const handleEditCategory = async (oldCatName) => {
        const dept = currentDept;
        const newCatName = await promptToast("Enter new category name:", oldCatName, {
            title: 'Rename Category',
            confirmText: 'Rename'
        });
        if (!newCatName || !newCatName.trim() || newCatName.trim() === oldCatName) return;

        const trimmed = newCatName.trim();
        if (libraryData[dept]?.[trimmed]) {
            toast.error("A category with this name already exists.");
            return;
        }

        const newLib = { ...libraryData };
        if (!newLib[dept]) newLib[dept] = {};
        const questions = newLib[dept][oldCatName] || [];
        delete newLib[dept][oldCatName];
        newLib[dept][trimmed] = questions;

        setLibraryData(newLib);
        if (activeCat === oldCatName) {
            setActiveCategory(trimmed);
        }
        toast.success(`Category renamed to "${trimmed}".`);
    };

    const handleDeleteCategory = async (catName) => {
        const dept = currentDept;
        const confirmed = await confirmToast(`Are you sure you want to delete category "${catName}" and all its questions?`, {
            title: 'Delete Category',
            confirmText: 'Delete'
        });
        if (!confirmed) return;

        const newLib = { ...libraryData };
        if (newLib[dept]) {
            delete newLib[dept][catName];
        }
        setLibraryData(newLib);

        const remainingCats = Object.keys(newLib[dept] || {});
        setActiveCategory(remainingCats.length > 0 ? remainingCats[0] : '');
        toast.success(`Category "${catName}" deleted.`);
    };

    const handleAddDepartmentClick = () => {
        setSelectedDept('');
        setCustomDept('');
        setShowDeptModal(true);
    };

    const confirmAddDepartment = () => {
        const dept = (selectedDept || customDept).trim();
        if (!dept) {
            toast.error("Please select or enter a department name.");
            return;
        }

        if (libraryData[dept]) {
            toast.error("Department already exists.");
            return;
        }

        const newLib = { ...libraryData };
        newLib[dept] = {
            "General Intake": []
        };

        setLibraryData(newLib);
        setDepartmentTab(dept);
        setActiveCategory("General Intake");
        setShowDeptModal(false);
        toast.success(`Department "${dept}" created with General Intake category!`);
    };

    const handleEditDepartment = async (oldDeptName) => {
        const newDeptName = await promptToast("Enter new department name:", oldDeptName, {
            title: 'Rename Department',
            confirmText: 'Rename'
        });
        if (!newDeptName || !newDeptName.trim() || newDeptName.trim() === oldDeptName) return;

        const trimmed = newDeptName.trim();
        if (libraryData[trimmed]) {
            toast.error("A department with this name already exists.");
            return;
        }

        const newLib = { ...libraryData };
        const categories = newLib[oldDeptName];
        delete newLib[oldDeptName];
        newLib[trimmed] = categories;

        setLibraryData(newLib);
        if (departmentTab === oldDeptName) {
            setDepartmentTab(trimmed);
        }

        setSaving(true);
        try {
            const res = await questionLibraryAPI.updateLibrary(newLib);
            if (res.success || res._offline) {
                cachedQuestionLibraryData = newLib;
                toast.success(`Department renamed to "${trimmed}" & saved successfully!`);
            }
        } catch (err) {
            toast.error('Error saving updated department name.');
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteDepartment = async (deptName) => {
        const confirmed = await confirmToast(`Are you sure you want to permanently delete the department "${deptName}" and all its categories/questions?`, {
            title: 'Delete Department',
            confirmText: 'Delete Department'
        });
        if (!confirmed) return;

        const newLib = { ...libraryData };
        delete newLib[deptName];

        const remainingDepts = Object.keys(newLib);
        const nextDept = remainingDepts.length > 0 ? remainingDepts[0] : '';
        
        setLibraryData(newLib);
        setDepartmentTab(nextDept);
        if (nextDept && newLib[nextDept]) {
            const nextCats = Object.keys(newLib[nextDept]);
            setActiveCategory(nextCats.length > 0 ? nextCats[0] : '');
        } else {
            setActiveCategory('');
        }

        setSaving(true);
        try {
            const res = await questionLibraryAPI.updateLibrary(newLib);
            if (res.success || res._offline) {
                cachedQuestionLibraryData = newLib;
                toast.success(`Department "${deptName}" deleted successfully!`);
            }
        } catch (err) {
            toast.error('Error deleting department from server.');
        } finally {
            setSaving(false);
        }
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

        const dept = currentDept;
        const cat = activeCat;
        if (!dept || !cat) {
            toast.error("Please select a department and category first.");
            return;
        }

        const newLib = { ...libraryData };
        if (!newLib[dept]) {
            newLib[dept] = {};
        }
        if (!newLib[dept][cat]) {
            newLib[dept][cat] = [];
        }

        if (editIndex !== null) {
            newLib[dept][cat][editIndex] = finalQuestion;
            toast.success('Question updated');
        } else {
            newLib[dept][cat] = [
                ...newLib[dept][cat],
                finalQuestion
            ];
            toast.success('Question added');
        }

        setLibraryData(newLib);
        resetModalState();
    };

    const handleEditQuestion = (index) => {
        const dept = currentDept;
        const cat = activeCat;
        const qToEdit = libraryData[dept]?.[cat]?.[index] || currentCategories[cat]?.[index];
        if (!qToEdit) return;
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
        const dept = currentDept;
        const newLib = { ...libraryData };
        if (newLib[dept]?.[cat]) {
            newLib[dept][cat].splice(index, 1);
            setLibraryData(newLib);
            toast.success('Question deleted');
        }
    };

    const getTypeLabel = (type) => {
        const badgeKey = 'badge_' + (type || '').replace(/-/g, '_');
        const localizedBadge = getUIText(badgeKey, currentLang);
        if (localizedBadge && localizedBadge !== badgeKey) return localizedBadge;
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
                    <option>{getUIText('selectOption', currentLang)}</option>
                    {(item.options || []).map(o => <option key={o}>{getTranslatedClinicalText(o, currentLang)}</option>)}
                </select>
            );
        } else if (item.type === "yes-no") {
            inputHtml = (
                <select disabled style={{ width: '160px' }}>
                    <option>{getUIText('selectShort', currentLang)}</option>
                    <option>{getUIText('yes', currentLang)}</option>
                    <option>{getUIText('no', currentLang)}</option>
                </select>
            );
        } else if (item.type === "date") {
            inputHtml = <input type="date" disabled style={{ width: '200px' }} />;
        } else if (item.type === "checkbox-group") {
            inputHtml = (
                <div className='ql-checkbox-grid'>
                    {(item.options || []).map(opt => (
                        <label key={opt}><input type='checkbox' disabled /> {getTranslatedClinicalText(opt, currentLang)}</label>
                    ))}
                </div>
            );
        } else if (item.type === "textarea") {
            inputHtml = <textarea disabled rows="2" placeholder={getUIText('doctorNotes', currentLang)} style={{ width: '100%', resize: 'vertical' }} />;
        } else if (item.type === "checkbox-date-group" || item.type === "checkbox-text-group") {
            inputHtml = (
                <div className='ql-complex-group'>
                    {(item.options || []).map(opt => (
                        <div className="ql-complex-row" key={opt}>
                            <label><input type='checkbox' disabled /> {getTranslatedClinicalText(opt, currentLang)}</label>
                            {opt !== 'None' && <input type={item.type === 'checkbox-date-group' ? 'date' : 'text'} disabled placeholder={getUIText('inputPlaceholder', currentLang)} style={{ width: '120px', padding: '4px 8px', marginLeft: '10px', fontSize: '0.78rem' }} />}
                        </div>
                    ))}
                    <div className="ql-extra-field">
                        <span>{getTranslatedClinicalText(item.extra, currentLang) || getUIText('detailsPlaceholder', currentLang)}:</span>
                        <input type="text" disabled placeholder={getUIText('detailsPlaceholder', currentLang)} style={{ width: '100%', padding: '6px 8px', boxSizing: 'border-box', fontSize: '0.78rem' }} />
                    </div>
                </div>
            );
        } else {
            inputHtml = <input type={item.type || 'text'} disabled placeholder={getUIText('enterResponse', currentLang)} style={{ width: '100%', padding: '8px 12px', boxSizing: 'border-box' }} />;
        }

        return (
            <div className="ql-question-card" key={index}>
                <div className="ql-question-top">
                    <div className="ql-question-info">
                        <span className="q-icon">❓</span>
                        <strong>{getTranslatedClinicalText(item.q, currentLang)}</strong>
                        <span className="ql-question-type-badge">{getTypeLabel(item.type)}</span>
                    </div>
                    <div className="ql-question-actions">
                        <button className="ql-btn-edit-q" onClick={() => handleEditQuestion(index)}>
                            <FaPenToSquare /> {getUIText('edit', currentLang)}
                        </button>
                        <button className="ql-btn-del-q" onClick={() => handleDeleteQuestion(cat, index)}>
                            <FaTrash /> {getUIText('delete', currentLang)}
                        </button>
                    </div>
                </div>
                {item.parentQ && (
                    <div className="ql-condition-badge">
                        <span><FaBolt /> {getUIText('onlyShownIf', currentLang).replace('{parentQ}', getTranslatedClinicalText(item.parentQ, currentLang)).replace('{condition}', item.condition)}</span>
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
                    <p style={{ fontWeight: 800, letterSpacing: '0.5px' }}>{getUIText('initializing', currentLang)}</p>
                </div>
            </div>
        );
    }

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
                        <h1>{getUIText('pageTitle', currentLang)}</h1>
                        <p>{getUIText('pageSubtitle', currentLang)}</p>
                    </div>
                    <div className="ql-header-actions">
                        <button className="ql-btn ql-btn-refresh" onClick={handleRefresh} disabled={refreshing || loading} title="Refresh library from server">
                            <FaArrowsRotate className={refreshing ? 'refresh-spin' : ''} /> {refreshing ? getUIText('refreshing', currentLang) : getUIText('refresh', currentLang)}
                        </button>
                        <LanguageSelector currentLang={currentLang} onLanguageChange={handleLanguageChange} />
                        <button className="ql-btn ql-btn-preview" onClick={() => { setPreviewIntake({}); setShowPreview(true); }}>
                            <FaEye /> {getUIText('preview', currentLang)}
                        </button>
                        <button className="ql-btn ql-btn-save" onClick={handleSave} disabled={saving}>
                            <FaCloudArrowUp /> {saving ? getUIText('syncing', currentLang) : getUIText('saveDeploy', currentLang)}
                        </button>
                    </div>
                </header>

                {/* ─── 2. DEPARTMENT TABS ─── */}
                <nav className="ql-dept-tabs">
                    {finalVisibleDepts.map(dept => (
                        <div
                            key={dept}
                            className={`ql-tab ${currentDept === dept ? 'active' : ''}`}
                            onClick={() => {
                                setDepartmentTab(dept);
                                const cats = Object.keys(libraryData[dept] || (dept === 'General' ? libraryData['General Medicine'] : null) || {});
                                setActiveCategory(cats.length > 0 ? cats[0] : '');
                            }}
                        >
                            <span className="tab-icon">{getDeptIcon(dept)}</span>
                            <span>{getTranslatedDepartment(dept, currentLang)}</span>
                            {currentDept === dept && allowedDepartments === null && (
                                <span className="tab-actions-quick">
                                    <span 
                                        onClick={(e) => { e.stopPropagation(); handleEditDepartment(dept); }} 
                                        title={getUIText('rename', currentLang)}
                                        className="tab-action-icon edit"
                                    >
                                        ✏️
                                    </span>
                                    <span 
                                        onClick={(e) => { e.stopPropagation(); handleDeleteDepartment(dept); }} 
                                        title={getUIText('delete', currentLang)}
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
                            <FaPlus /> {getUIText('addDept', currentLang)}
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
                                placeholder={getUIText('enterCatPlaceholder', currentLang)} 
                                value={newCatName} 
                                onChange={(e) => setNewCatName(e.target.value)} 
                                onKeyDown={(e) => { if (e.key === 'Enter') handleAddCategory(); }} 
                            />
                            <button className="ql-btn-add-cat" onClick={() => handleAddCategory()}>
                                <FaPlus /> {getUIText('addCategory', currentLang)}
                            </button>
                        </div>

                        <div className="ql-category-list">
                            {categoryKeys.map(cat => (
                                <div 
                                    key={cat} 
                                    className={`ql-category-item ${cat === activeCat ? 'active' : ''}`} 
                                    onClick={() => setActiveCategory(cat)}
                                >
                                    <div className="cat-item-left">
                                        <span className="cat-folder-icon">{cat === activeCat ? '📂' : '📁'}</span>
                                        <span className="cat-text">{getTranslatedCategory(cat, currentLang)}</span>
                                    </div>
                                    <div className="cat-item-right">
                                        <span className="ql-cat-action-btn" onClick={(e) => { e.stopPropagation(); handleEditCategory(cat); }} title={getUIText('rename', currentLang)}>
                                            ✏️
                                        </span>
                                        <span className="ql-cat-action-btn" onClick={(e) => { e.stopPropagation(); handleDeleteCategory(cat); }} title={getUIText('delete', currentLang)}>
                                            🗑️
                                        </span>
                                        <FaAngleRight className="cat-arrow" />
                                    </div>
                                </div>
                            ))}
                            {categoryKeys.length === 0 && (
                                <div className="ql-no-cats">{getUIText('noCats', currentLang)}</div>
                            )}
                        </div>
                    </aside>

                    {/* RIGHT CANVAS */}
                    <section className="ql-main-canvas">
                        <div className="ql-canvas-content">
                            {!activeCat ? (
                                <div className="ql-canvas-empty">
                                    <FaCubes className="holo-icon" />
                                    <p>{getUIText('selectCatPrompt', currentLang)}</p>
                                </div>
                            ) : (
                                <div className="ql-canvas-active">
                                    <div className="ql-canvas-header">
                                        <div className="ql-canvas-header-left">
                                            <h2>{getTranslatedCategory(activeCat, currentLang)}</h2>
                                            <span className="ql-item-count-badge">
                                                {questionsInActiveCategory.length} {getUIText('questionsCount', currentLang)}
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
                                            <FaPlus /> {getUIText('addQuestion', currentLang)}
                                        </button>
                                    </div>

                                    <div className="ql-question-stream">
                                        {questionsInActiveCategory.map((q, idx) => renderQuestionCard(q, idx, activeCat))}
                                        {questionsInActiveCategory.length === 0 && (
                                            <div className="ql-data-stream-empty">
                                                <p>{getUIText('noQuestions', currentLang)}</p>
                                                <p style={{ marginTop: '6px', color: '#64748b' }}>{getUIText('clickAddQuestion', currentLang)}</p>
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
                            <h3>{getUIText('addDept', currentLang)}</h3>
                            <span className="modal-close" onClick={() => setShowDeptModal(false)}><FaXmark /></span>
                        </div>
                        
                        <div style={{ marginTop: '16px' }}>
                            <label className="ql-modal-label">{getUIText('selectPredefined', currentLang)}</label>
                            <select 
                                className="ql-modal-input"
                                value={selectedDept} 
                                onChange={(e) => {
                                    setSelectedDept(e.target.value);
                                    setCustomDept('');
                                }}
                            >
                                <option value="">{getUIText('selectDept', currentLang)}</option>
                                {predefinedDepartments.map(d => (
                                    <option key={d} value={d}>{getTranslatedDepartment(d, currentLang)} ({d})</option>
                                ))}
                            </select>
                        </div>

                        <div className="ql-modal-divider">{getUIText('or', currentLang)}</div>
                        
                        <div>
                            <label className="ql-modal-label">{getUIText('customDeptName', currentLang)}</label>
                            <input 
                                type="text" 
                                className="ql-modal-input" 
                                placeholder={getUIText('customDeptPlaceholder', currentLang)} 
                                value={customDept} 
                                onChange={(e) => {
                                    setCustomDept(e.target.value);
                                    setSelectedDept('');
                                }} 
                                onKeyDown={(e) => { if (e.key === 'Enter') confirmAddDepartment(); }}
                            />
                        </div>

                        <div className="ql-modal-actions">
                            <button className="ql-modal-btn ql-modal-btn-cancel" onClick={() => setShowDeptModal(false)}>{getUIText('cancel', currentLang)}</button>
                            <button className="ql-modal-btn ql-modal-btn-submit" onClick={confirmAddDepartment}>{getUIText('addDept', currentLang)}</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Add / Edit Question Modal */}
            {showAddModal && (
                <div className="ql-modal-overlay">
                    <div className="ql-modal-content" style={{ maxWidth: '520px' }}>
                        <div className="ql-modal-header-top">
                            <h3>{editIndex !== null ? getUIText('editQuestion', currentLang) : getUIText('addQuestion', currentLang)}</h3>
                            <span className="modal-close" onClick={resetModalState}><FaXmark /></span>
                        </div>
                        
                        <div style={{ marginTop: '16px' }}>
                            <label className="ql-modal-label">{getUIText('questionLabel', currentLang)}</label>
                            <input 
                                type="text" 
                                className="ql-modal-input" 
                                placeholder={getUIText('questionLabelPlaceholder', currentLang)} 
                                value={newQ.q} 
                                onChange={(e) => setNewQ({ ...newQ, q: e.target.value })} 
                                autoFocus
                            />
                        </div>

                        <div style={{ marginTop: '12px' }}>
                            <label className="ql-modal-label">{getUIText('questionType', currentLang)}</label>
                            <select 
                                className="ql-modal-input" 
                                value={newQ.type} 
                                onChange={(e) => setNewQ({ ...newQ, type: e.target.value })}
                            >
                                <option value="text">{getUIText('type_text', currentLang)}</option>
                                <option value="textarea">{getUIText('type_textarea', currentLang)}</option>
                                <option value="number">{getUIText('type_number', currentLang)}</option>
                                <option value="yes-no">{getUIText('type_yes_no', currentLang)}</option>
                                <option value="date">{getUIText('type_date', currentLang)}</option>
                                <option value="select">{getUIText('type_select', currentLang)}</option>
                                <option value="checkbox-group">{getUIText('type_checkbox_group', currentLang)}</option>
                                <option value="checkbox-text-group">{getUIText('type_checkbox_text_group', currentLang)}</option>
                                <option value="checkbox-date-group">{getUIText('type_checkbox_date_group', currentLang)}</option>
                            </select>
                        </div>

                        {['select', 'checkbox-group', 'checkbox-date-group', 'checkbox-text-group'].includes(newQ.type) && (
                            <div style={{ marginTop: '12px' }}>
                                <label className="ql-modal-label">{getUIText('optionsLabel', currentLang)}</label>
                                <input 
                                    type="text" 
                                    className="ql-modal-input" 
                                    placeholder={getUIText('optionsPlaceholder', currentLang)} 
                                    value={newQ.options} 
                                    onChange={(e) => setNewQ({ ...newQ, options: e.target.value })} 
                                />
                            </div>
                        )}

                        {['checkbox-date-group', 'checkbox-text-group'].includes(newQ.type) && (
                            <div style={{ marginTop: '12px' }}>
                                <label className="ql-modal-label">{getUIText('extraFieldTitle', currentLang)}</label>
                                <input 
                                    type="text" 
                                    className="ql-modal-input" 
                                    placeholder={getUIText('extraFieldPlaceholder', currentLang)} 
                                    value={newQ.extra} 
                                    onChange={(e) => setNewQ({ ...newQ, extra: e.target.value })} 
                                />
                            </div>
                        )}

                        <div style={{ marginTop: '14px', borderTop: '1px solid #e2e8f0', paddingTop: '12px' }}>
                            <label className="ql-modal-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <FaBolt style={{ color: '#eab308' }} /> {getUIText('conditionalDisplay', currentLang)}
                            </label>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '6px' }}>
                                <input 
                                    type="text" 
                                    className="ql-modal-input" 
                                    placeholder={getUIText('parentQuestionLabel', currentLang)} 
                                    value={newQ.parentQ} 
                                    onChange={(e) => setNewQ({ ...newQ, parentQ: e.target.value })} 
                                />
                                <input 
                                    type="text" 
                                    className="ql-modal-input" 
                                    placeholder={getUIText('whenParentEquals', currentLang)} 
                                    value={newQ.condition} 
                                    onChange={(e) => setNewQ({ ...newQ, condition: e.target.value })} 
                                />
                            </div>
                        </div>

                        <div className="ql-modal-actions">
                            <button className="ql-modal-btn ql-modal-btn-cancel" onClick={resetModalState}>{getUIText('cancel', currentLang)}</button>
                            <button className="ql-modal-btn ql-modal-btn-submit" onClick={handleAddQuestion}>
                                {editIndex !== null ? getUIText('updateQuestion', currentLang) : getUIText('addQuestion', currentLang)}
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
                                <h3>{getUIText('doctorPreviewTitle', currentLang)}</h3>
                            </div>
                            <span className="modal-close" onClick={() => setShowPreview(false)}><FaXmark /></span>
                        </div>

                        <div style={{ marginTop: '16px' }}>
                            <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '16px' }}>
                                {getUIText('previewSubtitle', currentLang)} <strong style={{ color: '#1E60A4' }}>{getTranslatedDepartment(departmentTab, currentLang)}</strong>
                            </p>

                            {Object.keys(currentCategories).map(cat => (
                                <div key={cat} style={{ marginBottom: '20px', background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                                    <h4 style={{ margin: '0 0 12px', color: '#0f172a', fontSize: '14px', borderBottom: '1px solid #e2e8f0', paddingBottom: '6px' }}>
                                        📂 {getTranslatedCategory(cat, currentLang)}
                                    </h4>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                        {(currentCategories[cat] || []).map((q, qIdx) => (
                                            <div key={qIdx}>
                                                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                                                    {getTranslatedClinicalText(q.q, currentLang)}
                                                </label>
                                                {q.type === 'textarea' ? (
                                                    <textarea rows="2" placeholder={getUIText('doctorNotes', currentLang)} style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }} />
                                                ) : q.type === 'yes-no' ? (
                                                    <select style={{ width: '140px', padding: '6px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}>
                                                        <option>{getUIText('selectShort', currentLang)}</option>
                                                        <option>{getUIText('yes', currentLang)}</option>
                                                        <option>{getUIText('no', currentLang)}</option>
                                                    </select>
                                                ) : q.type === 'select' ? (
                                                    <select style={{ width: '160px', padding: '6px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}>
                                                        <option>{getUIText('selectOption', currentLang)}</option>
                                                        {(q.options || []).map(o => <option key={o}>{getTranslatedClinicalText(o, currentLang)}</option>)}
                                                    </select>
                                                ) : q.type === 'checkbox-group' ? (
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '4px' }}>
                                                        {(q.options || []).map(opt => (
                                                            <label key={opt} style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                                <input type="checkbox" /> {getTranslatedClinicalText(opt, currentLang)}
                                                            </label>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <input type={q.type || 'text'} placeholder={getUIText('valuePlaceholder', currentLang)} style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }} />
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="ql-modal-actions">
                            <button className="ql-modal-btn ql-modal-btn-cancel" onClick={() => setShowPreview(false)}>{getUIText('closePreview', currentLang)}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default HospitalAdminQuestionLibrary;
