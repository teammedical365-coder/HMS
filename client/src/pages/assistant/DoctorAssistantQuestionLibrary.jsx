import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { assistantAPI } from '../../utils/api';
import toast from 'react-hot-toast';
import './DoctorAssistantQuestionLibrary.css';
import './DoctorAssistantDashboard.css';
import {
    FiBookOpen, FiSearch, FiLayers, FiCheckCircle, FiChevronDown,
    FiChevronRight, FiArrowLeft, FiRefreshCw, FiHelpCircle,
    FiUser, FiActivity, FiTag, FiList, FiMinimize2, FiMaximize2,
    FiCheck, FiX, FiEdit3
} from 'react-icons/fi';

const DEPT_ICONS = {
    'Cardiology': '🫀',
    'ENT': '👂',
    'Orthopedics': '🦴',
    'Pediatrics': '👶',
    'Gynecology & Obstetrics': '🤰',
    'Dermatology': '🧴',
    'Ophthalmology': '👁️',
    'Neurology': '🧠',
    'Gastroenterology': '🩺',
    'Pulmonology': '🫁',
    'Dentistry': '🦷',
    'IVF & Fertility': '🔬',
    'General Surgery': '🔪',
    'Urology': '🚽',
    'Nephrology': '🩺',
    'Oncology': '🎗️',
    'Psychiatry': '🧠',
    'General Medicine': '🏥',
    'General': '🏥'
};

const DoctorAssistantQuestionLibrary = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const searchParams = new URLSearchParams(location.search);
    const initialDept = searchParams.get('dept') || '';
    const initialDocId = searchParams.get('doctorId') || '';

    const [loading, setLoading] = useState(true);
    const [doctors, setDoctors] = useState([]);
    const [authorizedDepartments, setAuthorizedDepartments] = useState([]);
    const [allDepartments, setAllDepartments] = useState([]);
    const [selectedDoctorId, setSelectedDoctorId] = useState(initialDocId);
    const [selectedDepartment, setSelectedDepartment] = useState(initialDept);
    const [libraryData, setLibraryData] = useState({});
    const [searchQuery, setSearchQuery] = useState('');
    const [expandedCategories, setExpandedCategories] = useState({});
    const [allExpanded, setAllExpanded] = useState(true);

    // Interactive Preview Answers State (allows assistant/doctor to test and click options)
    const [previewAnswers, setPreviewAnswers] = useState({});

    const fetchLibrary = useCallback(async (dept = selectedDepartment, docId = selectedDoctorId) => {
        setLoading(true);
        try {
            const res = await assistantAPI.getQuestionLibrary({
                department: dept || undefined,
                doctorId: docId || undefined
            });
            if (res.success) {
                setDoctors(res.doctors || []);
                setAuthorizedDepartments(res.authorizedDepartments || []);
                setAllDepartments(res.allDepartments || []);
                setLibraryData(res.data || {});

                // Default expand all categories
                if (res.data) {
                    const expanded = {};
                    Object.entries(res.data).forEach(([deptKey, categories]) => {
                        Object.keys(categories || {}).forEach(catKey => {
                            expanded[`${deptKey}_${catKey}`] = true;
                        });
                    });
                    setExpandedCategories(expanded);
                    setAllExpanded(true);
                }
            } else {
                toast.error(res.message || 'Failed to load question library');
            }
        } catch (error) {
            console.error('Question library load error:', error);
            toast.error('Access denied or failed to load question library');
        } finally {
            setLoading(false);
        }
    }, [selectedDepartment, selectedDoctorId]);

    useEffect(() => {
        fetchLibrary(selectedDepartment, selectedDoctorId);
    }, [fetchLibrary, selectedDepartment, selectedDoctorId]);

    // Handle Doctor selection
    const handleDoctorChange = (docId) => {
        setSelectedDoctorId(docId);
        if (docId) {
            const doc = doctors.find(d => String(d._id) === String(docId));
            if (doc) {
                const docDept = doc.departments?.[0] || doc.specialty || '';
                if (docDept) {
                    setSelectedDepartment(docDept.trim());
                }
            }
        }
    };

    // Toggle single category
    const toggleCategory = (categoryKey) => {
        setExpandedCategories(prev => ({
            ...prev,
            [categoryKey]: !prev[categoryKey]
        }));
    };

    // Toggle All categories
    const toggleAllCategories = () => {
        const nextState = !allExpanded;
        const updated = {};
        Object.entries(libraryData).forEach(([deptKey, categories]) => {
            Object.keys(categories || {}).forEach(catKey => {
                updated[`${deptKey}_${catKey}`] = nextState;
            });
        });
        setExpandedCategories(updated);
        setAllExpanded(nextState);
    };

    // Filter department list for dropdown
    const departmentOptions = useMemo(() => {
        const set = new Set([...allDepartments, ...authorizedDepartments]);
        return Array.from(set).map(s => s && s.trim()).filter(Boolean).sort();
    }, [allDepartments, authorizedDepartments]);

    // Calculate total questions in current view
    const totalQuestionsCount = useMemo(() => {
        let count = 0;
        Object.values(libraryData).forEach(categories => {
            Object.values(categories || {}).forEach(questions => {
                if (Array.isArray(questions)) count += questions.length;
            });
        });
        return count;
    }, [libraryData]);

    const selectedDocObj = useMemo(() => {
        if (!selectedDoctorId) return null;
        return doctors.find(d => String(d._id) === String(selectedDoctorId));
    }, [doctors, selectedDoctorId]);

    // Interactive Option Selection
    const handleOptionSelect = (qKey, optionVal, isMulti = false) => {
        setPreviewAnswers(prev => {
            if (isMulti) {
                const current = Array.isArray(prev[qKey]) ? prev[qKey] : [];
                const updated = current.includes(optionVal)
                    ? current.filter(item => item !== optionVal)
                    : [...current, optionVal];
                return { ...prev, [qKey]: updated };
            }
            return {
                ...prev,
                [qKey]: prev[qKey] === optionVal ? '' : optionVal
            };
        });
    };

    return (
        <div className="daql-container">
            {/* Header */}
            <div className="daql-header">
                <div>
                    <h1 className="daql-title">
                        <FiBookOpen style={{ color: '#0ea5e9' }} />
                        Clinical Intake & Question Library
                        <span className="daql-count-pill">{totalQuestionsCount} Questions</span>
                    </h1>
                    <p className="daql-subtitle">
                        Department & Doctor-specific clinical questionnaires with structured answer options for patient consultation
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <button
                        className="da-btn da-btn-secondary"
                        onClick={() => navigate('/assistant/dashboard')}
                    >
                        <FiArrowLeft /> Dashboard
                    </button>
                    <button
                        className="da-btn da-btn-secondary"
                        onClick={toggleAllCategories}
                        title={allExpanded ? "Collapse all question sections" : "Expand all question sections"}
                    >
                        {allExpanded ? <><FiMinimize2 /> Collapse All</> : <><FiMaximize2 /> Expand All</>}
                    </button>
                    <button
                        className="da-btn da-btn-secondary"
                        onClick={() => fetchLibrary(selectedDepartment, selectedDoctorId)}
                        disabled={loading}
                    >
                        <FiRefreshCw className={loading ? 'spin' : ''} /> Refresh
                    </button>
                </div>
            </div>

            {/* Filter & Search Bar */}
            <div className="daql-filter-bar">
                {/* Doctor Filter */}
                <div className="daql-filter-group">
                    <label className="daql-filter-label">
                        <FiUser style={{ color: '#0ea5e9' }} /> Filter by Doctor:
                    </label>
                    <select
                        className="daql-select"
                        value={selectedDoctorId}
                        onChange={(e) => handleDoctorChange(e.target.value)}
                    >
                        <option value="">All Hospital Doctors ({doctors.length})</option>
                        {doctors.map(doc => (
                            <option key={doc._id} value={doc._id}>
                                👨‍⚕️ {doc.name} {doc.specialty ? `(${doc.specialty})` : ''}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Department Filter */}
                <div className="daql-filter-group">
                    <label className="daql-filter-label">
                        <FiLayers style={{ color: '#0ea5e9' }} /> Department / Specialty:
                    </label>
                    <select
                        className="daql-select"
                        value={selectedDepartment}
                        onChange={(e) => setSelectedDepartment(e.target.value)}
                    >
                        <option value="">All Specialties ({departmentOptions.length})</option>
                        {departmentOptions.map(dept => (
                            <option key={dept} value={dept}>
                                {DEPT_ICONS[dept] || '🏥'} {dept}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Search */}
                <div className="daql-search-box">
                    <FiSearch className="daql-search-icon" />
                    <input
                        type="text"
                        placeholder="Search symptoms, protocols, or questions..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="daql-search-input"
                    />
                    {searchQuery && (
                        <button
                            className="daql-search-clear"
                            onClick={() => setSearchQuery('')}
                        >
                            ✕
                        </button>
                    )}
                </div>
            </div>

            {/* Selected Doctor Info Card (if selected) */}
            {selectedDocObj && (
                <div className="daql-doc-banner">
                    <div className="daql-doc-avatar">
                        {selectedDocObj.image || '👨‍⚕️'}
                    </div>
                    <div className="daql-doc-details">
                        <div className="daql-doc-name">
                            {selectedDocObj.name}
                            <span className="daql-doc-tag">Doctor's Active Protocol</span>
                        </div>
                        <div className="daql-doc-meta">
                            <span><strong>Specialty:</strong> {selectedDocObj.specialty || 'General'}</span>
                            <span><strong>Departments:</strong> {(selectedDocObj.departments || [selectedDepartment || 'General']).join(', ')}</span>
                        </div>
                    </div>
                    <button
                        className="daql-clear-doc-btn"
                        onClick={() => {
                            setSelectedDoctorId('');
                            setSelectedDepartment('');
                        }}
                    >
                        Clear Doctor Filter
                    </button>
                </div>
            )}

            {/* Library Content */}
            {loading ? (
                <div className="da-empty-state">
                    <FiRefreshCw className="spin" style={{ fontSize: '1.8rem', color: '#0ea5e9', marginBottom: '12px' }} />
                    <p style={{ fontWeight: 600 }}>Loading Real Question Library & Answer Options...</p>
                </div>
            ) : Object.keys(libraryData).length === 0 ? (
                <div className="da-empty-state">
                    <FiBookOpen style={{ fontSize: '2rem', color: '#94a3b8', marginBottom: '12px' }} />
                    <p style={{ fontWeight: 600, fontSize: '1.05rem', color: '#334155' }}>No protocols found</p>
                    <p style={{ color: '#64748b', fontSize: '0.9rem' }}>Try clearing the search query or selecting a different department.</p>
                </div>
            ) : (
                Object.entries(libraryData).map(([deptName, categories]) => {
                    const categoryEntries = Object.entries(categories || {});
                    if (categoryEntries.length === 0) return null;

                    const icon = DEPT_ICONS[deptName] || '🏥';

                    return (
                        <div key={deptName} className="daql-dept-section">
                            <div className="daql-dept-header">
                                <h2 className="daql-dept-title">
                                    <span style={{ fontSize: '1.3rem' }}>{icon}</span>
                                    {deptName}
                                </h2>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span className="daql-dept-badge">
                                        {categoryEntries.length} {categoryEntries.length === 1 ? 'Clinical Protocol' : 'Clinical Protocols'}
                                    </span>
                                </div>
                            </div>

                            <div className="daql-categories-grid">
                                {categoryEntries.map(([catName, questions]) => {
                                    const qList = Array.isArray(questions) ? questions : [];
                                    const filteredQuestions = searchQuery.trim()
                                        ? qList.filter(q =>
                                            (q.q || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                                            (catName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                                            (deptName || '').toLowerCase().includes(searchQuery.toLowerCase())
                                        )
                                        : qList;

                                    if (searchQuery.trim() && filteredQuestions.length === 0) {
                                        return null;
                                    }

                                    const catKey = `${deptName}_${catName}`;
                                    const isExpanded = expandedCategories[catKey] ?? true;

                                    return (
                                        <div
                                            key={catName}
                                            className={`daql-category-card ${isExpanded ? 'selected' : ''}`}
                                        >
                                            <div
                                                className="daql-cat-header"
                                                onClick={() => toggleCategory(catKey)}
                                                style={{ cursor: 'pointer' }}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <span className="daql-accordion-icon">
                                                        {isExpanded ? <FiChevronDown /> : <FiChevronRight />}
                                                    </span>
                                                    <h3 className="daql-cat-title">{catName}</h3>
                                                </div>
                                                <span className="daql-cat-count">
                                                    {qList.length} Questions
                                                </span>
                                            </div>

                                            <p className="daql-cat-preview">
                                                {qList[0]?.q ? `“${qList[0].q.substring(0, 90)}...”` : 'Standard clinical intake protocol'}
                                            </p>

                                            {isExpanded && (
                                                <div className="daql-questions-drawer">
                                                    {filteredQuestions.map((qItem, qIdx) => {
                                                        const qType = qItem.type || 'text';
                                                        const qUniqueKey = `${deptName}_${catName}_${qIdx}`;
                                                        const currentAnswer = previewAnswers[qUniqueKey];

                                                        // Determine options to show for every question type
                                                        let optionsList = qItem.options || [];
                                                        if (qType === 'yes-no' && (!optionsList || optionsList.length === 0)) {
                                                            optionsList = ['Yes', 'No'];
                                                        }

                                                        const isMulti = qType === 'checkbox-group';

                                                        return (
                                                            <div key={qIdx} className="daql-q-item">
                                                                <div className="daql-q-top">
                                                                    <p className="daql-q-text">
                                                                        <span className="daql-q-num">{qIdx + 1}.</span> {qItem.q}
                                                                    </p>
                                                                    <span className={`daql-q-type type-${qType}`}>
                                                                        {qType === 'yes-no' ? 'Yes / No' :
                                                                         qType === 'checkbox-group' ? 'Multiple Choice' :
                                                                         qType === 'select' ? 'Single Choice' :
                                                                         qType === 'textarea' ? 'Detailed Notes' : 'Text Input'}
                                                                    </span>
                                                                </div>

                                                                {/* Answer Options & Interactive Response Section */}
                                                                <div className="daql-options-container">
                                                                    {qType === 'yes-no' ? (
                                                                        <div className="daql-yesno-options">
                                                                            <span className="daql-options-label">Answer Options:</span>
                                                                            <button
                                                                                type="button"
                                                                                className={`daql-option-btn yes ${currentAnswer === 'Yes' ? 'active' : ''}`}
                                                                                onClick={() => handleOptionSelect(qUniqueKey, 'Yes')}
                                                                            >
                                                                                <FiCheck /> Yes
                                                                            </button>
                                                                            <button
                                                                                type="button"
                                                                                className={`daql-option-btn no ${currentAnswer === 'No' ? 'active' : ''}`}
                                                                                onClick={() => handleOptionSelect(qUniqueKey, 'No')}
                                                                            >
                                                                                <FiX /> No
                                                                            </button>
                                                                        </div>
                                                                    ) : optionsList && optionsList.length > 0 ? (
                                                                        <div className="daql-preset-options">
                                                                            <span className="daql-options-label">
                                                                                {isMulti ? 'Multiple Choice Options:' : 'Available Answer Options:'}
                                                                            </span>
                                                                            <div className="daql-options-pills-list">
                                                                                {optionsList.map((opt, oIdx) => {
                                                                                    const isSelected = isMulti
                                                                                        ? Array.isArray(currentAnswer) && currentAnswer.includes(opt)
                                                                                        : currentAnswer === opt;
                                                                                    return (
                                                                                        <button
                                                                                            key={oIdx}
                                                                                            type="button"
                                                                                            className={`daql-option-pill-btn ${isSelected ? 'selected' : ''}`}
                                                                                            onClick={() => handleOptionSelect(qUniqueKey, opt, isMulti)}
                                                                                        >
                                                                                            {isMulti ? (
                                                                                                <span className={`daql-box-check ${isSelected ? 'checked' : ''}`}>
                                                                                                    {isSelected ? '✓' : ''}
                                                                                                </span>
                                                                                            ) : (
                                                                                                <span className={`daql-radio-dot ${isSelected ? 'checked' : ''}`} />
                                                                                            )}
                                                                                            <span>{opt}</span>
                                                                                        </button>
                                                                                    );
                                                                                })}
                                                                            </div>
                                                                        </div>
                                                                    ) : (
                                                                        <div className="daql-text-preview">
                                                                            <span className="daql-options-label">Answer Format:</span>
                                                                            <div className="daql-text-input-placeholder">
                                                                                <FiEdit3 style={{ color: '#0ea5e9' }} />
                                                                                <span>Text intake response entered by Assistant during preparation</span>
                                                                            </div>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })
            )}
        </div>
    );
};

export default DoctorAssistantQuestionLibrary;
