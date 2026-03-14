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

    // active states
    const [departmentTab, setDepartmentTab] = useState('General');
    const [activeCategory, setActiveCategory] = useState('');

    // Input states for sidebar
    const [newCatName, setNewCatName] = useState('');

    // Add Modal state
    const [showAddModal, setShowAddModal] = useState(false);

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

            // Set initial active category if exists
            const generalCats = Object.keys(data['General'] || {});
            if (generalCats.length > 0) {
                setActiveCategory(generalCats[0]);
            }
            setDepartmentTab('General');
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

        // Add question
        newLib[departmentTab][activeCategory] = [
            ...newLib[departmentTab][activeCategory],
            finalQuestion
        ];

        setLibraryData(newLib);
        setShowAddModal(false);
        setNewQ({ q: '', type: 'text', options: '', extra: '', parentQ: '', condition: '' });
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
                <select disabled className="modal-input" style={{ width: '200px' }}>
                    <option>Female</option>
                    <option>Male</option>
                </select>
            );
        } else if (item.type === "select") {
            inputHtml = (
                <select disabled className="modal-input" style={{ width: '200px' }}>
                    <option>Select...</option>
                    {(item.options || []).map(o => <option key={o}>{o}</option>)}
                </select>
            );
        } else if (item.type === "yes-no") {
            inputHtml = (
                <select disabled className="modal-input" style={{ width: '200px' }}>
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
            inputHtml = <textarea disabled rows="5" placeholder="Doctors will enter long text here..." style={{ width: '100%' }} />;
        } else if (item.type === "checkbox-date-group" || item.type === "checkbox-text-group") {
            inputHtml = (
                <div className='complex-group'>
                    {(item.options || []).map(opt => (
                        <div className="complex-row" key={opt}>
                            <label><input type='checkbox' disabled /> {opt}</label>
                            {opt !== 'None' && <input type={item.type === 'checkbox-date-group' ? 'date' : 'text'} disabled placeholder="Input..." className="row-date-picker" style={{ width: '160px', padding: '8px', marginLeft: '15px' }} />}
                        </div>
                    ))}
                    <div className="extra-field">
                        <span>{item.extra || 'Remarks'}:</span>
                        <input type="text" disabled placeholder="Details..." style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }} />
                    </div>
                </div>
            );
        } else if (item.type === "row") {
            inputHtml = (
                <div style={{ display: 'flex', gap: '20px', width: '100%' }}>
                    {(item.fields || []).map(field => (
                        <div style={{ flex: 1 }} key={field.q}>
                            <label style={{ fontSize: '13px', color: '#666', marginBottom: '5px', display: 'block' }}>{field.q}</label>
                            <input type={field.type || 'text'} disabled style={{ width: '100%', padding: '10px', boxSizing: 'border-box' }} />
                        </div>
                    ))}
                </div>
            );
        } else {
            // text or number
            inputHtml = <input type={item.type || 'text'} disabled placeholder="Input area..." style={{ width: '100%', padding: '10px', boxSizing: 'border-box' }} />;
        }

        return (
            <div className="question-row" key={index}>
                <button className="btn-delete-q" onClick={() => handleDeleteQuestion(cat, index)}>🗑 Delete Question</button>
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

    return (
        <div className="ql-admin-body">
            <div style={{ padding: '20px 30px', background: 'white', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h1 style={{ margin: 0, color: '#1e293b' }}>Question Library Builder</h1>
                    <p style={{ margin: 0, color: '#64748b' }}>Construct dynamic diagnostic forms for doctors.</p>
                </div>
                <button className="btn-save" onClick={handleSave} disabled={saving} style={{ padding: '12px 30px', fontSize: '15px' }}>
                    {saving ? '⏳ Syncing Data...' : '💾 Save & Deploy Configuration'}
                </button>
            </div>

            {/* Department Navbar */}
            <div className="gender-navbar" style={{ display: 'flex', overflowX: 'auto', gap: '10px', padding: '10px 30px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                {Object.keys(libraryData).map(dept => (
                    <div
                        key={dept}
                        className={`gender-tab ${departmentTab === dept ? 'active' : ''}`}
                        onClick={() => {
                            setDepartmentTab(dept);
                            const cats = Object.keys(libraryData[dept] || {});
                            setActiveCategory(cats.length > 0 ? cats[0] : '');
                        }}
                        style={{ whiteSpace: 'nowrap' }}
                    >
                        {dept} Workflows
                    </div>
                ))}
                <button 
                    onClick={handleAddDepartment}
                    style={{ background: '#3b82f6', color: 'white', border: 'none', borderRadius: '20px', padding: '0 15px', cursor: 'pointer', fontWeight: 'bold', whiteSpace: 'nowrap' }}
                >
                    + Add Department
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

                                <button className="btn-action bg-dark" onClick={() => setShowAddModal(true)} style={{ padding: '10px 20px', fontSize: '14px', background: '#334155' }}>
                                    + Add New Question
                                </button>
                            </div>

                            <div id="question-wrapper">
                                {questionsInActiveCategory.map((q, idx) => renderQuestionBuilder(q, idx, activeCategory))}
                                {questionsInActiveCategory.length === 0 && (
                                    <div style={{ padding: '40px', textAlign: 'center', border: '2px dashed #e2e8f0', borderRadius: '10px', color: '#94a3b8' }}>
                                        No questions in this category. Click "+ Add New Question" to begin constructing.
                                    </div>
                                )}
                            </div>
                        </>
                    ) : (
                        <div style={{ padding: '40px', textAlign: 'center', background: '#f8fafc', borderRadius: '10px', color: '#64748b' }}>
                            Please select or create a category in the sidebar to view questions.
                        </div>
                    )}
                </main>
            </div>

            {/* Modal for adding questions */}
            {showAddModal && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <h3 style={{ margin: '0 0 10px 0', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px', color: '#0f172a' }}>Add Detailed Question</h3>

                        <div>
                            <label className="modal-label">Question Text</label>
                            <input className="modal-input" placeholder="e.g. Do you smoke?" value={newQ.q} onChange={(e) => setNewQ({ ...newQ, q: e.target.value })} />
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
                            <button className="modal-btn modal-btn-cancel" onClick={() => setShowAddModal(false)}>Discard</button>
                            <button className="modal-btn modal-btn-submit" onClick={handleAddQuestion}>Save Question to Logic Tree</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminQuestionLibrary;
