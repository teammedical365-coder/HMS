import React, { useState, useEffect } from 'react';
import { questionLibraryAPI } from '../../utils/api';
import './AdminQuestionLibrary.css';

const AdminQuestionLibrary = () => {
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

    const handleEditCategory = (oldName) => {
        const newName = window.prompt("Enter new name for category:", oldName);
        if (!newName || !newName.trim() || newName === oldName) return;
        const cleanName = newName.trim();

        if (libraryData[departmentTab][cleanName]) {
            alert("Category with this name already exists!");
            return;
        }

        const newLib = { ...libraryData };
        const questions = newLib[departmentTab][oldName];
        delete newLib[departmentTab][oldName];
        newLib[departmentTab][cleanName] = questions;

        setLibraryData(newLib);
        if (activeCategory === oldName) setActiveCategory(cleanName);
    };

    const handleDeleteCategory = (catName) => {
        if (!window.confirm(`Are you sure you want to delete the entire category "${catName}" and all its questions?`)) return;
        
        const newLib = { ...libraryData };
        delete newLib[departmentTab][catName];

        setLibraryData(newLib);
        if (activeCategory === catName) {
            const keys = Object.keys(newLib[departmentTab] || {});
            setActiveCategory(keys.length > 0 ? keys[0] : '');
        }
    };

    const handleAddDepartment = () => {
        const dept = window.prompt("Enter new department name (e.g., Neurology, IVF):");
        if (!dept || !dept.trim()) return;
        const cleanDept = dept.trim();
        if (libraryData[cleanDept]) {
            alert("Department already exists!");
            return;
        }
        setLibraryData({ ...libraryData, [cleanDept]: {} });
        setDepartmentTab(cleanDept);
        setActiveCategory('');
    };

    const resetModalState = () => {
        setShowAddModal(false);
        setEditIndex(null);
        setNewQ({ q: '', type: 'text', options: '', extra: '', parentQ: '', condition: '' });
    };

    const handleAddQuestion = () => {
        const qText = newQ.q.trim();
        if (!qText) {
            alert("Please enter a question.");
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
        } else {
            newLib[departmentTab][activeCategory] = [
                ...newLib[departmentTab][activeCategory],
                finalQuestion
            ];
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

    const handleDeleteQuestion = (cat, index) => {
        if (window.confirm("Are you sure you want to delete this question?")) {
            const newLib = { ...libraryData };
            newLib[departmentTab][cat].splice(index, 1);
            setLibraryData(newLib);
        }
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
                <select disabled className="ql-preview-select" style={{ width: '160px' }}>
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
                    <h1>Question Library Builder</h1>
                    <p>Construct dynamic diagnostic forms for doctors.</p>
                </div>
                <div className="ql-header-actions">
                    <button className="ql-btn-ai-suggest">
                        ✨ AI Suggest
                    </button>
                    <button 
                        className="ql-btn-preview" 
                        onClick={() => { setPreviewIntake({}); setShowPreview(true); }}
                    >
                        👁️ Preview
                    </button>
                    <button className="ql-btn-save-deploy" onClick={handleSave} disabled={saving}>
                        {saving ? '⏳ Syncing...' : '💾 Save & Deploy'}
                    </button>
                </div>
            </div>

            {/* Department Tabs */}
            <div className="ql-dept-tabs">
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
                
                {allowedDepartments === null && (
                    <button className="ql-btn-add-dept" onClick={handleAddDepartment}>
                        + Add Dept
                    </button>
                )}
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
                            <div className="ql-cat-actions">
                                <button onClick={(e) => { e.stopPropagation(); handleEditCategory(cat); }} title="Rename">✏️</button>
                                <button onClick={(e) => { e.stopPropagation(); handleDeleteCategory(cat); }} title="Delete">🗑️</button>
                            </div>
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
                    <div className="ql-modal-content">
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

            {/* Preview Modal */}
            {showPreview && (
                <div className="ql-modal-overlay ql-preview-modal">
                    <div className="ql-modal-content" style={{ maxWidth: '1000px', width: '95vw', background: '#f1f5f9', padding: '0', overflow: 'hidden', height: '90vh', display: 'flex', flexDirection: 'column' }}>
                        <div className="ql-preview-header">
                            <div>
                                <div className="preview-label">Doctor Desktop View Preview</div>
                                <h3 style={{ margin: 0, fontSize: '1.2rem' }}>Consultation Page: <span style={{ color: '#38bdf8' }}>{departmentTab} Department</span></h3>
                            </div>
                            <button className="ql-preview-close" onClick={() => setShowPreview(false)}>✕</button>
                        </div>

                        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                            <div style={{ width: '280px', background: 'white', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column' }}>
                                <div style={{ padding: '25px 20px', borderBottom: '1px solid #f1f5f9' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '15px' }}>
                                        <div style={{ width: '40px', height: '40px', background: '#3b82f6', borderRadius: '50%', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>P</div>
                                        <div>
                                            <div style={{ fontWeight: 'bold', fontSize: '14px' }}>Demo Patient</div>
                                            <div style={{ fontSize: '11px', color: '#64748b' }}>MRN-102938 / Male, 34</div>
                                        </div>
                                    </div>
                                    <div style={{ fontSize: '11px', background: '#f8fafc', padding: '8px', borderRadius: '6px', border: '1px solid #e2e8f0', color: '#475569' }}>
                                        📍 Viewing Live Preview of <b>{departmentTab}</b> workflows.
                                    </div>
                                </div>
                                
                                <div style={{ flex: 1, overflowY: 'auto' }}>
                                    <div style={{ padding: '15px 20px', fontSize: '10px', color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Forms & Categories</div>
                                    {Object.keys(currentCategories).map(cat => (
                                        <div 
                                            key={cat} 
                                            onClick={() => setActiveCategory(cat)}
                                            style={{ 
                                                padding: '12px 20px', 
                                                fontSize: '13px', 
                                                cursor: 'pointer',
                                                background: cat === activeCategory ? '#eff6ff' : 'transparent',
                                                color: cat === activeCategory ? '#2563eb' : '#475569',
                                                borderRight: cat === activeCategory ? '3px solid #3b82f6' : 'none',
                                                fontWeight: cat === activeCategory ? 700 : 500
                                            }}
                                        >
                                            📋 {cat}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div style={{ flex: 1, background: '#fff', overflowY: 'auto' }}>
                                <div style={{ padding: '30px' }}>
                                    {activeCategory ? (
                                        <div style={{ maxWidth: '700px', margin: '0 auto' }}>
                                            <div style={{ marginBottom: '25px', paddingBottom: '15px', borderBottom: '2px solid #3b82f633' }}>
                                                <h2 style={{ margin: 0, color: '#1e293b' }}>{activeCategory}</h2>
                                                <p style={{ margin: '5px 0 0', color: '#64748b', fontSize: '14px' }}>Please complete all diagnostic questions below.</p>
                                            </div>
                                            
                                            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '25px' }}>
                                                <div className="dynamic-question-form-preview">
                                                    {questionsInActiveCategory.map((item, idx) => {
                                                        if (item.condition && previewIntake[item.parentQ] !== item.condition) return null;
                                                        
                                                        const handleAnswer = (q, val) => setPreviewIntake(prev => ({ ...prev, [q]: val }));
                                                        const handleCheckbox = (q, opt, isChecked) => {
                                                            setPreviewIntake(prev => {
                                                                let current = prev[q] || [];
                                                                if (!Array.isArray(current)) current = [];
                                                                return { ...prev, [q]: isChecked ? [...current, opt] : current.filter(i => i !== opt) };
                                                            });
                                                        };

                                                        return (
                                                            <div key={idx} style={{ marginBottom: '20px' }}>
                                                                <label style={{ fontWeight: '700', fontSize: '14px', display: 'block', marginBottom: '8px', color: '#334155' }}>{item.q}</label>
                                                                
                                                                {item.type === 'text' && <input type="text" placeholder="Free text input" value={previewIntake[item.q] || ''} onChange={e => handleAnswer(item.q, e.target.value)} style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '8px', boxSizing: 'border-box' }} />}
                                                                {item.type === 'number' && <input type="number" placeholder="Enter value" value={previewIntake[item.q] || ''} onChange={e => handleAnswer(item.q, e.target.value)} style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '8px', boxSizing: 'border-box' }} />}
                                                                {item.type === 'date' && <input type="date" value={previewIntake[item.q] || ''} onChange={e => handleAnswer(item.q, e.target.value)} style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '8px', boxSizing: 'border-box' }} />}
                                                                
                                                                {item.type === 'select' && (
                                                                    <select value={previewIntake[item.q] || ''} onChange={e => handleAnswer(item.q, e.target.value)} style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '8px' }}>
                                                                        <option value="">Select option...</option>
                                                                        {(item.options || []).map(o => <option key={o} value={o}>{o}</option>)}
                                                                    </select>
                                                                )}

                                                                {item.type === 'yes-no' && (
                                                                    <div style={{ display: 'flex', gap: '10px' }}>
                                                                        <button onClick={() => handleAnswer(item.q, 'Yes')} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', background: previewIntake[item.q] === 'Yes' ? '#3b82f6' : '#fff', color: previewIntake[item.q] === 'Yes' ? '#fff' : '#475569', fontWeight: 600, cursor: 'pointer' }}>Yes</button>
                                                                        <button onClick={() => handleAnswer(item.q, 'No')} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', background: previewIntake[item.q] === 'No' ? '#ef4444' : '#fff', color: previewIntake[item.q] === 'No' ? '#fff' : '#475569', fontWeight: 600, cursor: 'pointer' }}>No</button>
                                                                    </div>
                                                                )}

                                                                {item.type === 'checkbox-group' && (
                                                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                                                        {(item.options || []).map(opt => (
                                                                            <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', cursor: 'pointer' }}>
                                                                                <input type="checkbox" checked={(previewIntake[item.q] || []).includes(opt)} onChange={e => handleCheckbox(item.q, opt, e.target.checked)} /> {opt}
                                                                            </label>
                                                                        ))}
                                                                    </div>
                                                                )}

                                                                {(item.type === 'checkbox-date-group' || item.type === 'checkbox-text-group') && (
                                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                                        {(item.options || []).map(opt => {
                                                                            const checked = (previewIntake[item.q] || []).includes(opt);
                                                                            return (
                                                                                <div key={opt} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                                                     <label style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', flex: 1 }}>
                                                                                        <input type="checkbox" checked={checked} onChange={e => handleCheckbox(item.q, opt, e.target.checked)} /> {opt}
                                                                                    </label>
                                                                                    {checked && opt !== 'None' && (
                                                                                        <input 
                                                                                            type={item.type === 'checkbox-date-group' ? 'date' : 'text'} 
                                                                                            placeholder={item.type === 'checkbox-text-group' ? 'Enter details' : ''}
                                                                                            style={{ padding: '10px', border: '1px solid #cbd5e1', borderRadius: '8px', width: '200px' }}
                                                                                        />
                                                                                    )}
                                                                                </div>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                )}

                                                                {item.type === 'textarea' && <textarea rows={4} style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '8px', boxSizing: 'border-box' }} placeholder="Clinical notes here..." />}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>

                                            <button 
                                                style={{ width: '100%', padding: '15px', background: 'linear-gradient(135deg, #3b82f6, #6366f1)', color: 'white', border: 'none', borderRadius: '12px', marginTop: '30px', fontWeight: 'bold', fontSize: '16px', boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)', cursor: 'pointer' }}
                                            >
                                                💾 Save & Continue to Next Step (Demo)
                                            </button>
                                        </div>
                                    ) : (
                                        <div style={{ textAlign: 'center', padding: '100px 0', color: '#94a3b8' }}>
                                            <div style={{ fontSize: '40px', marginBottom: '15px' }}>📋</div>
                                            <p>Select a category to see its clinical form preview.</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminQuestionLibrary;
