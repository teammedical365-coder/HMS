import React, { useState, useEffect } from 'react';
import { questionLibraryAPI } from '../../utils/api';
import './AdminQuestionLibrary.css'; // Custom built styles based on user's theme

const AdminQuestionLibrary = () => {
    // State for the overarching JSON structure
    const [libraryData, setLibraryData] = useState({
        "General": {},
        "Orthopedics": {},
        "ENT": {}
    });

    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [allowedDepartments, setAllowedDepartments] = useState(null);

    // active states
    const [departmentTab, setDepartmentTab] = useState('General');
    const [activeCategory, setActiveCategory] = useState('');

    // Input states for sidebar
    const [newCatName, setNewCatName] = useState('');

    // Add Modal state
    const [showAddModal, setShowAddModal] = useState(false);
    const [editIndex, setEditIndex] = useState(null);

    // Preview state
    const [showPreview, setShowPreview] = useState(false);
    const [previewIntake, setPreviewIntake] = useState({});

    // Form fields for new Question
    const [newQ, setNewQ] = useState({
        q: '',
        type: 'text',
        options: '', // comma-separated
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
                // Initial Empty Structure fallback
                data = { "General": {}, "Orthopedics": {}, "ENT": {} };
            }

            setLibraryData(data);
            setAllowedDepartments(res.allowedDepartments || null);

            // Determine visible departments based on restrictions
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
                setDepartmentTab('General'); // Fallback if no valid departments exist
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
            // Add question
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

    const renderQuestionBuilder = (item, index, cat) => {
        let inputHtml = null;

        if (item.type === "gender-toggle") {
            inputHtml = (
                <select disabled className="modal-input" style={{ width: '160px' }}>
                    <option>Female</option>
                    <option>Male</option>
                </select>
            );
        } else if (item.type === "select") {
            inputHtml = (
                <select disabled className="modal-input" style={{ width: '160px' }}>
                    <option>Select...</option>
                    {(item.options || []).map(o => <option key={o}>{o}</option>)}
                </select>
            );
        } else if (item.type === "yes-no") {
            inputHtml = (
                <select disabled className="modal-input" style={{ width: '160px' }}>
                    <option>Select...</option>
                    <option>Yes</option>
                    <option>No</option>
                </select>
            );
        } else if (item.type === "date") {
            inputHtml = <input type="date" disabled className="modal-input" style={{ width: '200px' }} />;
        } else if (item.type === "checkbox-group") {
            inputHtml = (
                <div className='checkbox-box'>
                    {(item.options || []).map(opt => (
                        <label key={opt}><input type='checkbox' disabled /> {opt}</label>
                    ))}
                </div>
            );
        } else if (item.type === "textarea") {
            inputHtml = <textarea disabled rows="3" placeholder="Long text area..." className="modal-input" style={{ width: '100%', resize: 'vertical' }} />;
        } else if (item.type === "checkbox-date-group" || item.type === "checkbox-text-group") {
            inputHtml = (
                <div className='complex-group'>
                    {(item.options || []).map(opt => (
                        <div className="complex-row" key={opt}>
                            <label><input type='checkbox' disabled /> {opt}</label>
                            {opt !== 'None' && <input type={item.type === 'checkbox-date-group' ? 'date' : 'text'} disabled placeholder="Input..." className="row-date-picker" style={{ width: '120px', padding: '4px 6px', marginLeft: '10px', fontSize: '0.75rem' }} />}
                        </div>
                    ))}
                    <div className="extra-field">
                        <span>{item.extra || 'Remarks'}:</span>
                        <input type="text" disabled placeholder="Details..." style={{ width: '100%', padding: '4px 6px', boxSizing: 'border-box', fontSize: '0.75rem' }} />
                    </div>
                </div>
            );
        } else if (item.type === "row") {
            inputHtml = (
                <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
                    {(item.fields || []).map(field => (
                        <div style={{ flex: 1 }} key={field.q}>
                            <label style={{ fontSize: '0.7rem', color: '#64748b', marginBottom: '3px', display: 'block' }}>{field.q}</label>
                            <input type={field.type || 'text'} disabled style={{ width: '100%', padding: '6px', boxSizing: 'border-box', fontSize: '0.75rem' }} />
                        </div>
                    ))}
                </div>
            );
        } else {
            // text or number
            inputHtml = <input type={item.type || 'text'} disabled placeholder="Input" style={{ width: '100%', padding: '6px', boxSizing: 'border-box', fontSize: '0.75rem' }} />;
        }

        return (
            <div className="question-row" key={index}>
                <div style={{ position: 'absolute', top: '8px', right: '8px', display: 'flex', gap: '4px', zIndex: 10 }}>
                    <button className="btn-edit-q" onClick={() => handleEditQuestion(index)}>✏️ Edit</button>
                    <button className="btn-delete-q" style={{ position: 'relative', top: '0', right: '0' }} onClick={() => handleDeleteQuestion(cat, index)}>🗑 Del</button>
                </div>
                <strong>{item.q}</strong>
                {item.parentQ && (
                    <div style={{ fontSize: '11px', color: '#ea580c', background: '#ffedd5', padding: '4px 8px', borderRadius: '4px', marginBottom: '10px', display: 'inline-block' }}>
                        Only shown if <b>"{item.parentQ}"</b> equals <b>"{item.condition}"</b>
                    </div>
                )}
                <div className="input-group">
                    {inputHtml}
                </div>
            </div>
        );
    };

    if (loading) return <div>Loading UI Builder...</div>;

    const currentCategories = libraryData[departmentTab] || {};
    const questionsInActiveCategory = currentCategories[activeCategory] || [];
    
    const visibleDepartments = allowedDepartments ? Object.keys(libraryData).filter(dept => allowedDepartments.includes(dept)) : Object.keys(libraryData);

    return (
        <div className="ql-admin-body">
            <div style={{ padding: '10px 16px', background: 'white', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h1 style={{ margin: 0, color: '#1e293b', fontSize: '0.95rem' }}>Question Library Builder</h1>
                    <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.7rem' }}>Construct dynamic diagnostic forms for doctors.</p>
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                    <button 
                        className="btn-action" 
                        onClick={() => { setPreviewIntake({}); setShowPreview(true); }}
                        style={{ background: '#f8fafc', color: '#475569', border: '1.5px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '4px' }}
                    >
                        👁️ Preview
                    </button>
                    <button className="btn-save" onClick={handleSave} disabled={saving}>
                        {saving ? '⏳ Syncing...' : '💾 Save & Deploy'}
                    </button>
                </div>
            </div>

            {/* Department Navbar */}
            <div className="gender-navbar" style={{ display: 'flex', overflowX: 'auto', gap: '4px', padding: '6px 16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                {visibleDepartments.map(dept => (
                    <div
                        key={dept}
                        className={`gender-tab ${departmentTab === dept ? 'active' : ''}`}
                        onClick={() => {
                            setDepartmentTab(dept);
                            const cats = Object.keys(libraryData[dept] || {});
                            setActiveCategory(cats.length > 0 ? cats[0] : '');
                        }}
                    >
                        {dept}
                    </div>
                ))}
                
                {allowedDepartments === null && (
                    <button 
                        onClick={handleAddDepartment}
                        style={{ background: '#3b82f6', color: 'white', border: 'none', borderRadius: '5px', padding: '0 10px', cursor: 'pointer', fontWeight: '600', whiteSpace: 'nowrap', fontSize: '0.7rem' }}
                    >
                        + Add Dept
                    </button>
                )}
            </div>

            <div className="ql-admin-container">
                <aside className="ql-admin-sidebar">
                    <div className="input-card add-category-box" style={{ marginBottom: '10px' }}>
                        <input type="text" id="new-cat-input" placeholder="New category name..." value={newCatName} onChange={(e) => setNewCatName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleAddCategory() }} />
                        <button className="btn-action bg-teal" onClick={handleAddCategory}>+ Add New Category</button>
                    </div>

                    <div id="category-list">
                        {Object.keys(currentCategories).map(cat => (
                            <div key={cat} className={`sidebar-item ${cat === activeCategory ? 'active' : ''}`} onClick={() => setActiveCategory(cat)}>
                                <span>{cat}</span>
                                <div className="cat-actions" style={{ display: 'flex', gap: '8px' }}>
                                    <button onClick={(e) => { e.stopPropagation(); handleEditCategory(cat); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', padding: '2px' }} title="Rename">✏️</button>
                                    <button onClick={(e) => { e.stopPropagation(); handleDeleteCategory(cat); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', padding: '2px' }} title="Delete">🗑️</button>
                                </div>
                            </div>
                        ))}
                        {Object.keys(currentCategories).length === 0 && <p style={{ color: '#94a3b8', fontSize: '13px', textAlign: 'center' }}>No categories added yet.</p>}
                    </div>
                </aside>

                <main className="ql-admin-main">
                    {activeCategory ? (
                        <>
                            <div className="content-header">
                                <h2 id="display-title">{activeCategory.toUpperCase()}</h2>

                                <button className="btn-action bg-dark" onClick={() => { setEditIndex(null); setNewQ({ q: '', type: 'text', options: '', extra: '', parentQ: '', condition: '' }); setShowAddModal(true); }}>
                                    + Add Question
                                </button>
                            </div>

                            <div id="question-wrapper">
                                {questionsInActiveCategory.map((q, idx) => renderQuestionBuilder(q, idx, activeCategory))}
                                {questionsInActiveCategory.length === 0 && (
                                    <div style={{ padding: '30px', textAlign: 'center', border: '1px dashed #e2e8f0', borderRadius: '8px', color: '#94a3b8', fontSize: '0.78rem' }}>
                                        No questions yet. Click "+ Add Question" above.
                                    </div>
                                )}
                            </div>
                        </>
                    ) : (
                        <div style={{ padding: '30px', textAlign: 'center', background: '#f8fafc', borderRadius: '8px', color: '#64748b', fontSize: '0.78rem' }}>
                            Select or create a category to view questions.
                        </div>
                    )}
                </main>
            </div>

            {/* Modal for adding questions */}
            {showAddModal && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <h3 style={{ margin: '0 0 10px 0', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px', color: '#0f172a' }}>{editIndex !== null ? 'Edit Question Details' : 'Add Detailed Question'}</h3>

                        <div>
                            <label className="modal-label">Question Text</label>
                            <textarea className="modal-input" rows="3" placeholder="e.g. Do you smoke? (Enter full details)" value={newQ.q} onChange={(e) => setNewQ({ ...newQ, q: e.target.value })} style={{ resize: 'vertical' }} />
                        </div>

                        <div>
                            <label className="modal-label">Input Type</label>
                            <select className="modal-input" value={newQ.type} onChange={(e) => setNewQ({ ...newQ, type: e.target.value })}>
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
                                <label className="modal-label">Options (Comma separated)</label>
                                <input className="modal-input" placeholder="Option A, Option B, Option C, None" value={newQ.options} onChange={(e) => setNewQ({ ...newQ, options: e.target.value })} />
                            </div>
                        )}

                        {['checkbox-date-group', 'checkbox-text-group'].includes(newQ.type) && (
                            <div>
                                <label className="modal-label">Extra Field Label (Optional Note at the bottom)</label>
                                <input className="modal-input" placeholder="e.g. Physician Notes" value={newQ.extra} onChange={(e) => setNewQ({ ...newQ, extra: e.target.value })} />
                            </div>
                        )}

                        <div style={{ background: '#f8fafc', padding: '15px', borderRadius: '8px', border: '1px solid #e2e8f0', marginTop: '10px' }}>
                            <label className="modal-label" style={{ color: '#475569', marginBottom: '8px' }}>Conditional Logic (Optional)</label>
                            <p style={{ margin: '0 0 10px 0', fontSize: '11px', color: '#64748b' }}>Only display this question if a previous question has a specific answer.</p>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <input className="modal-input" placeholder="Parent Question Title (Exact)" title="Must match the exact text of the parent question" value={newQ.parentQ} onChange={(e) => setNewQ({ ...newQ, parentQ: e.target.value })} />
                                <input className="modal-input" placeholder="Required Answer Value" title="If parent question answer is this, me shows up" value={newQ.condition} onChange={(e) => setNewQ({ ...newQ, condition: e.target.value })} />
                            </div>
                        </div>

                        <div className="modal-actions" style={{ marginTop: '25px', paddingTop: '15px', borderTop: '1px solid #e2e8f0' }}>
                            <button className="modal-btn modal-btn-cancel" onClick={resetModalState}>Discard</button>
                            <button className="modal-btn modal-btn-submit" onClick={handleAddQuestion}>{editIndex !== null ? 'Update Question' : 'Save Question to Logic Tree'}</button>
                        </div>
                    </div>
                </div>
            )}
            {/* Preview Modal */}
            {showPreview && (
                <div className="modal-overlay" style={{ zIndex: 10000 }}>
                    <div className="modal-content" style={{ maxWidth: '1000px', width: '95vw', background: '#f1f5f9', padding: '0', overflow: 'hidden', height: '90vh', display: 'flex', flexDirection: 'column' }}>
                        {/* Fake Header */}
                        <div style={{ background: '#1e293b', padding: '15px 25px', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <div style={{ fontSize: '10px', textTransform: 'uppercase', opacity: 0.7, fontWeight: 800, letterSpacing: '0.05em' }}>Doctor Desktop View Preview</div>
                                <h3 style={{ margin: 0, fontSize: '1.2rem' }}>Consultation Page: <span style={{ color: '#38bdf8' }}>{departmentTab} Department</span></h3>
                            </div>
                            <button onClick={() => setShowPreview(false)} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', width: '32px', height: '32px', borderRadius: '50%', cursor: 'pointer' }}>✕</button>
                        </div>

                        {/* Preview Body */}
                        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                            {/* Fake Doctor Sidebar */}
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

                            {/* Main Preview Content */}
                            <div style={{ flex: 1, background: '#fff', overflowY: 'auto' }}>
                                <div style={{ padding: '30px' }}>
                                    {activeCategory ? (
                                        <div style={{ maxWidth: '700px', margin: '0 auto' }}>
                                            <div style={{ marginBottom: '25px', paddingBottom: '15px', borderBottom: '2px solid #3b82f633' }}>
                                                <h2 style={{ margin: 0, color: '#1e293b' }}>{activeCategory}</h2>
                                                <p style={{ margin: '5px 0 0', color: '#64748b', fontSize: '14px' }}>Please complete all diagnostic questions below.</p>
                                            </div>
                                            
                                            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '25px' }}>
                                                {/* Reuse the real Dynamic Form Component */}
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

                                                        // Manual render logic since we can't easily import DynamicQuestionForm without issues sometimes in nested structures OR we just want direct control
                                                        return (
                                                            <div key={idx} style={{ marginBottom: '20px' }}>
                                                                <label style={{ fontWeight: '700', fontSize: '14px', display: 'block', marginBottom: '8px', color: '#334155' }}>{item.q}</label>
                                                                
                                                                {item.type === 'text' && <input type="text" placeholder="Free text input" value={previewIntake[item.q] || ''} onChange={e => handleAnswer(item.q, e.target.value)} style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '8px' }} />}
                                                                {item.type === 'number' && <input type="number" placeholder="Enter value" value={previewIntake[item.q] || ''} onChange={e => handleAnswer(item.q, e.target.value)} style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '8px' }} />}
                                                                {item.type === 'date' && <input type="date" value={previewIntake[item.q] || ''} onChange={e => handleAnswer(item.q, e.target.value)} style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '8px' }} />}
                                                                
                                                                {item.type === 'select' && (
                                                                    <select value={previewIntake[item.q] || ''} onChange={e => handleAnswer(item.q, e.target.value)} style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '8px' }}>
                                                                        <option value="">Select option...</option>
                                                                        {(item.options || []).map(o => <option key={o} value={o}>{o}</option>)}
                                                                    </select>
                                                                )}

                                                                {item.type === 'yes-no' && (
                                                                    <div style={{ display: 'flex', gap: '10px' }}>
                                                                        <button onClick={() => handleAnswer(item.q, 'Yes')} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', background: previewIntake[item.q] === 'Yes' ? '#3b82f6' : '#fff', color: previewIntake[item.q] === 'Yes' ? '#fff' : '#475569', fontWeight: 600 }}>Yes</button>
                                                                        <button onClick={() => handleAnswer(item.q, 'No')} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', background: previewIntake[item.q] === 'No' ? '#ef4444' : '#fff', color: previewIntake[item.q] === 'No' ? '#fff' : '#475569', fontWeight: 600 }}>No</button>
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

                                                                {item.type === 'textarea' && <textarea rows={4} style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '8px' }} placeholder="Clinical notes here..." />}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>

                                            <button 
                                                style={{ width: '100%', padding: '15px', background: 'linear-gradient(135deg, #3b82f6, #6366f1)', color: 'white', border: 'none', borderRadius: '12px', marginTop: '30px', fontWeight: 'bold', fontSize: '16px', boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)' }}
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
