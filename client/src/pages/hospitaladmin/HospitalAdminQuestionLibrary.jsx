import React, { useState, useEffect } from 'react';
import { questionLibraryAPI } from '../../utils/api';
import '../admin/AdminQuestionLibrary.css'; // Custom built styles based on user's theme

const HospitalAdminQuestionLibrary = () => {
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
                    <h1 style={{ margin: 0, color: '#1e293b', fontSize: '0.95rem' }}>🏥 Hospital Diagnostics Library</h1>
                    <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.7rem' }}>Customize the global template specifically for your hospital.</p>
                </div>
                <button className="btn-save" onClick={handleSave} disabled={saving}>
                    {saving ? '⏳ Syncing...' : '💾 Save & Deploy'}
                </button>
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
                
                <button 
                    onClick={() => alert("Contact the central admin team to assign your hospital a new department.")}
                    style={{ background: '#e2e8f0', color: '#64748b', border: 'none', borderRadius: '5px', padding: '0 10px', cursor: 'pointer', fontWeight: '600', whiteSpace: 'nowrap', fontSize: '0.7rem' }}
                >
                    🔒 Locked
                </button>
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
        </div>
    );
};

export default HospitalAdminQuestionLibrary;
