import React, { useState, useEffect } from 'react';
import { questionLibraryAPI } from '../../utils/api';
import confirmToast, { promptToast, toast } from '../../utils/confirmToast';
import '../admin/AdminQuestionLibrary.css';

const HospitalAdminQuestionLibrary = () => {
    const [libraryData, setLibraryData] = useState({
        "General": {},
        "Orthopedics": {},
        "ENT": {}
    });

    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [allowedDepartments, setAllowedDepartments] = useState(null);

    const [departmentTab, setDepartmentTab] = useState('General');
    const [activeCategory, setActiveCategory] = useState('');

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
            alert('Failed to fetch library.');
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const res = await questionLibraryAPI.updateLibrary(libraryData);
            if (res.success) {
                alert('Question Library updated & synced with all doctor workflows successfully!');
            }
        } catch (err) {
            alert('Error saving library.');
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
        'General': '🏥',
        'Orthopedics': '🦴',
        'ENT': '👂',
        'Cardiology': '❤️',
        'Neurology': '🧠',
        'IVF': '🧬',
        'Genetics': '🧪',
        'Pediatrics': '👶',
        'Dermatology': '🩺'
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
