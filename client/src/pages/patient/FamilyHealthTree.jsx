import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    FiPlus, FiX, FiEdit3, FiTrash2, FiUsers, FiActivity,
    FiHeart, FiAlertCircle, FiCheck, FiMaximize2,
    FiChevronRight, FiUser, FiDroplet, FiPhone, FiMapPin
} from 'react-icons/fi';
import {
    FaHeartbeat, FaSmoking, FaWineGlass, FaRunning, FaLeaf,
    FaUtensils, FaDna, FaStethoscope
} from 'react-icons/fa';
import toast from 'react-hot-toast';
import { confirmToast } from '../../utils/confirmToast';
import { patientAPI } from '../../utils/api';
import './FamilyHealthTree.css';

// ── Relationship Config ──────────────────────────────────────────────────────
const RELATIONSHIP_OPTIONS = [
    { value: 'Father', generation: -1 },
    { value: 'Mother', generation: -1 },
    { value: 'Brother', generation: 0 },
    { value: 'Sister', generation: 0 },
    { value: 'Son', generation: 1 },
    { value: 'Daughter', generation: 1 },
    { value: 'Grandfather (P)', generation: -2 },
    { value: 'Grandmother (P)', generation: -2 },
    { value: 'Grandfather (M)', generation: -2 },
    { value: 'Grandmother (M)', generation: -2 },
    { value: 'Uncle', generation: -1 },
    { value: 'Aunt', generation: -1 },
    { value: 'Spouse', generation: 0 },
    { value: 'Cousin', generation: 0 },
    { value: 'Nephew', generation: 1 },
    { value: 'Niece', generation: 1 },
    { value: 'Grandson', generation: 2 },
    { value: 'Granddaughter', generation: 2 },
    { value: 'Other', generation: 0 },
];

const COMMON_CONDITIONS = ['Diabetes', 'Hypertension', 'Heart Disease', 'Cancer', 'Stroke', 'Asthma', 'Arthritis', 'Thyroid'];

const GENERATION_LABELS = {
    '-2': 'Grandparents',
    '-1': 'Parents & Elders',
    '0': 'Siblings & Patient',
    '1': 'Children',
    '2': 'Grandchildren',
};

// ── Helper: Get initials ─────────────────────────────────────────────────────
const getInitials = (name) => {
    if (!name) return '?';
    return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
};

// ── Leaf SVG Component ───────────────────────────────────────────────────────
const LeafIcon = ({ color }) => (
    <svg viewBox="0 0 24 24" fill={color} xmlns="http://www.w3.org/2000/svg">
        <path d="M17 8C8 10 5.9 16.17 3.82 21.34L5.71 22L6.66 19.7C7.14 19.87 7.64 20 8 20C19 20 22 3 22 3C21 5 14 5.25 9 6.25C4 7.25 2 11.5 2 13.5C2 15.5 3.75 17.25 3.75 17.25C7 8 17 8 17 8Z" />
    </svg>
);

// ── Floating Leaves Background ───────────────────────────────────────────────
const FloatingLeaves = () => {
    const leafColors = ['#16a34a', '#22c55e', '#4ade80', '#86efac', '#15803d', '#059669', '#34d399', '#a7f3d0'];
    return (
        <>
            {leafColors.map((color, i) => (
                <div key={i} className="fht-leaf">
                    <LeafIcon color={color} />
                </div>
            ))}
        </>
    );
};

// ══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════════════
const FamilyHealthTree = ({ patientId, patientData }) => {
    // ── State ────────────────────────────────────────────────────────────────
    const [members, setMembers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedMember, setSelectedMember] = useState(null);
    const [detailTab, setDetailTab] = useState('overview');
    const [showModal, setShowModal] = useState(false);
    const [editingMember, setEditingMember] = useState(null);
    const [saving, setSaving] = useState(false);
    const [zoomLevel, setZoomLevel] = useState('normal'); // 'normal', 'in', 'out'

    // ── Form State ───────────────────────────────────────────────────────────
    const emptyForm = {
        name: '', relationship: '', gender: 'Male', dob: '', age: '',
        bloodGroup: '', isAlive: true, phone: '', address: '', occupation: '',
        notes: '', medicalConditions: [], lifestyle: {
            smoking: '', alcohol: '', exercise: '', diet: ''
        }
    };
    const [form, setForm] = useState(emptyForm);

    // ── Fetch Family Members ─────────────────────────────────────────────────
    const fetchMembers = useCallback(async () => {
        if (!patientId) return;
        setLoading(true);
        try {
            const res = await patientAPI.getFamilyMembers(patientId);
            if (res.success) {
                setMembers(res.data || []);
            }
        } catch (err) {
            console.error('Failed to fetch family members:', err);
        } finally {
            setLoading(false);
        }
    }, [patientId]);

    useEffect(() => {
        fetchMembers();
    }, [fetchMembers]);

    // ── Computed Stats ───────────────────────────────────────────────────────
    const stats = useMemo(() => {
        const totalMembers = members.length;
        const allConditions = new Set();
        let affectedCount = 0;

        members.forEach(m => {
            if (m.isAffected || (m.medicalConditions && m.medicalConditions.length > 0)) {
                affectedCount++;
                (m.medicalConditions || []).forEach(c => allConditions.add(c.name));
            }
        });

        const generations = new Set(members.map(m => m.generation));
        return {
            totalMembers,
            conditionsCount: allConditions.size,
            generationsCount: generations.size,
            affectedCount,
            healthyCount: totalMembers - affectedCount,
        };
    }, [members]);

    // ── Medical Pattern Insights (dynamically computed) ──────────────────────
    const patternInsights = useMemo(() => {
        const conditionMap = {};

        members.forEach(m => {
            (m.medicalConditions || []).forEach(c => {
                if (!conditionMap[c.name]) {
                    conditionMap[c.name] = { name: c.name, members: [], generations: new Set() };
                }
                conditionMap[c.name].members.push(m.name);
                conditionMap[c.name].generations.add(m.generation);
            });
        });

        return Object.values(conditionMap)
            .map(item => ({
                ...item,
                count: item.members.length,
                genCount: item.generations.size,
                risk: item.generations.size >= 3 ? 'high' : item.generations.size >= 2 ? 'moderate' : 'low'
            }))
            .sort((a, b) => b.genCount - a.genCount || b.count - a.count)
            .slice(0, 5);
    }, [members]);

    // ── Family History Timeline ──────────────────────────────────────────────
    const timeline = useMemo(() => {
        const events = [];
        members.forEach(m => {
            (m.medicalConditions || []).forEach(c => {
                if (c.diagnosedAge && m.dob) {
                    const birthYear = new Date(m.dob).getFullYear();
                    const year = birthYear + c.diagnosedAge;
                    events.push({ year, person: m.name, event: `Diagnosed with ${c.name}`, age: c.diagnosedAge });
                } else if (c.diagnosedAge && m.age) {
                    const currentYear = new Date().getFullYear();
                    const year = currentYear - (m.age - c.diagnosedAge);
                    events.push({ year, person: m.name, event: `Diagnosed with ${c.name}`, age: c.diagnosedAge });
                }
            });
        });
        return events.sort((a, b) => a.year - b.year).slice(0, 6);
    }, [members]);

    // ── Group Members by Generation ──────────────────────────────────────────
    const generationGroups = useMemo(() => {
        const groups = {};
        members.forEach(m => {
            const gen = String(m.generation);
            if (!groups[gen]) groups[gen] = [];
            groups[gen].push(m);
        });
        return groups;
    }, [members]);

    // ── Handlers ─────────────────────────────────────────────────────────────
    const openAddModal = () => {
        setEditingMember(null);
        setForm(emptyForm);
        setShowModal(true);
    };

    const openEditModal = (member) => {
        setEditingMember(member);
        setForm({
            name: member.name || '',
            relationship: member.relationship || '',
            gender: member.gender || 'Male',
            dob: member.dob ? new Date(member.dob).toISOString().split('T')[0] : '',
            age: member.age || '',
            bloodGroup: member.bloodGroup || '',
            isAlive: member.isAlive !== false,
            phone: member.phone || '',
            address: member.address || '',
            occupation: member.occupation || '',
            notes: member.notes || '',
            medicalConditions: member.medicalConditions || [],
            lifestyle: member.lifestyle || { smoking: '', alcohol: '', exercise: '', diet: '' }
        });
        setShowModal(true);
    };

    const handleSave = async () => {
        if (!form.name || !form.relationship) {
            toast.error('Name and Relationship are required.');
            return;
        }
        setSaving(true);
        try {
            const relConfig = RELATIONSHIP_OPTIONS.find(r => r.value === form.relationship);
            const payload = {
                ...form,
                generation: relConfig ? relConfig.generation : 0,
                age: form.age ? parseInt(form.age) : null,
                dob: form.dob || null,
            };

            if (editingMember) {
                const res = await patientAPI.updateFamilyMember(patientId, editingMember._id, payload);
                if (res.success) {
                    setMembers(prev => prev.map(m => m._id === editingMember._id ? res.data : m));
                    if (selectedMember && selectedMember._id === editingMember._id) {
                        setSelectedMember(res.data);
                    }
                    toast.success('Family member updated successfully!');
                }
            } else {
                const res = await patientAPI.addFamilyMember(patientId, payload);
                if (res.success) {
                    setMembers(prev => [...prev, res.data]);
                    toast.success('Family member added successfully!');
                }
            }
            setShowModal(false);
            setForm(emptyForm);
            setEditingMember(null);
        } catch (err) {
            console.error('Save family member error:', err);
            toast.error(err?.response?.data?.message || 'Failed to save family member.');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (memberId) => {
        const confirmed = await confirmToast('Are you sure you want to remove this family member?', {
            title: 'Remove Family Member',
            confirmText: 'Remove',
            danger: true
        });
        if (!confirmed) return;

        try {
            const res = await patientAPI.deleteFamilyMember(patientId, memberId);
            if (res.success) {
                setMembers(prev => prev.filter(m => m._id !== memberId));
                if (selectedMember && selectedMember._id === memberId) {
                    setSelectedMember(null);
                }
                toast.success('Family member removed successfully!');
            }
        } catch (err) {
            console.error('Delete family member error:', err);
            toast.error('Failed to delete family member.');
        }
    };

    // ── Add/Remove Condition in Form ─────────────────────────────────────────
    const addCondition = () => {
        setForm(prev => ({
            ...prev,
            medicalConditions: [...prev.medicalConditions, { name: '', status: 'Active', diagnosedAge: '', treatment: '', notes: '' }]
        }));
    };

    const removeCondition = (index) => {
        setForm(prev => ({
            ...prev,
            medicalConditions: prev.medicalConditions.filter((_, i) => i !== index)
        }));
    };

    const updateCondition = (index, field, value) => {
        setForm(prev => ({
            ...prev,
            medicalConditions: prev.medicalConditions.map((c, i) => i === index ? { ...c, [field]: value } : c)
        }));
    };

    // ── Family History Checklist (computed from all members) ──────────────────
    const familyChecklist = useMemo(() => {
        const allCondNames = new Set();
        members.forEach(m => (m.medicalConditions || []).forEach(c => allCondNames.add(c.name)));
        return COMMON_CONDITIONS.map(name => ({
            name,
            present: allCondNames.has(name)
        }));
    }, [members]);

    // ══════════════════════════════════════════════════════════════════════════
    // RENDER
    // ══════════════════════════════════════════════════════════════════════════

    if (loading) {
        return (
            <div className="fht-container">
                <div className="fht-loading">
                    <div className="fht-loading-spinner" />
                    <span className="fht-loading-text">Loading Family Health Tree...</span>
                </div>
            </div>
        );
    }

    // ── Render Member Card ───────────────────────────────────────────────────
    const renderMemberCard = (member, isSelf = false) => (
        <div
            key={member._id || 'self'}
            className={`fht-member-card ${isSelf ? 'fht-patient-self-card' : ''} ${selectedMember?._id === member._id ? 'selected' : ''}`}
            onClick={() => { if (!isSelf) { setSelectedMember(member); setDetailTab('overview'); } }}
        >
            <div className={`fht-member-avatar ${isSelf ? 'patient-self' : (member.gender || 'male').toLowerCase()}`}>
                {getInitials(member.name)}
                {!isSelf && (
                    <span className={`fht-member-status-dot ${member.isAlive !== false ? 'alive' : 'deceased'}`}>
                        <FiHeart />
                    </span>
                )}
            </div>
            <span className="fht-member-name">{member.name}</span>
            {isSelf ? (
                <span className="fht-patient-self-label">Patient (You)</span>
            ) : (
                <span className="fht-member-relation">{member.relationship}</span>
            )}
            {member.medicalConditions && member.medicalConditions.length > 0 && (
                <span className="fht-member-conditions">
                    {member.medicalConditions.map(c => c.name).join(', ')}
                </span>
            )}
            <div className="fht-member-meta">
                {member.isAlive === false ? (
                    <><FiHeart className="fht-heart-icon deceased" /> <span>Deceased</span></>
                ) : (
                    <><FiHeart className="fht-heart-icon alive" /> <span>Alive</span></>
                )}
                {member.age && <span>• {member.age} Yrs</span>}
            </div>
        </div>
    );

    // ── Render the Patient (Self) Card ───────────────────────────────────────
    const patientSelf = {
        _id: 'self',
        name: patientData?.name || 'Patient',
        gender: patientData?.gender || 'Male',
        age: patientData?.age,
        bloodGroup: patientData?.bloodGroup,
    };

    // ── Render Tree ──────────────────────────────────────────────────────────
    const renderTree = () => {
        if (members.length === 0) {
            return (
                <div className="fht-empty-tree">
                    <div className="fht-empty-tree-icon">
                        <FaDna />
                    </div>
                    <h3>No Family Members Added</h3>
                    <p>Start building this patient's family health tree to track hereditary conditions and medical patterns across generations.</p>
                    <button className="fht-empty-tree-btn" onClick={openAddModal}>
                        <FiPlus /> Add First Family Member
                    </button>
                </div>
            );
        }

        const genOrder = ['-2', '-1', '0', '1', '2'];
        const activeGens = genOrder.filter(g => generationGroups[g]?.length > 0 || g === '0');

        return (
            <div className="fht-tree-wrapper">
                {activeGens.map((gen, idx) => (
                    <React.Fragment key={gen}>
                        {idx > 0 && (
                            <>
                                <div className="fht-trunk" />
                                {(generationGroups[gen]?.length > 1 || gen === '0') && (
                                    <div className="fht-branch-connector">
                                        <div
                                            className="fht-branch-connector-line"
                                            style={{
                                                width: `${Math.min(80, (generationGroups[gen]?.length || 1) * 25)}%`,
                                            }}
                                        />
                                    </div>
                                )}
                            </>
                        )}
                        <div className="fht-generation-row">
                            {gen === '0' && renderMemberCard(patientSelf, true)}
                            {(generationGroups[gen] || []).map(member => renderMemberCard(member))}
                        </div>
                    </React.Fragment>
                ))}
            </div>
        );
    };

    // ── Render Detail Panel ──────────────────────────────────────────────────
    const renderDetailPanel = () => {
        if (!selectedMember) {
            return (
                <div className="fht-detail-panel">
                    <div className="fht-detail-empty">
                        <div className="fht-detail-empty-icon">
                            <FiUser />
                        </div>
                        <h3>Select a Member</h3>
                        <p>Click on a family member in the tree to view their health details</p>
                    </div>
                </div>
            );
        }

        const m = selectedMember;

        return (
            <div className="fht-detail-panel">
                {/* Header */}
                <div className="fht-detail-header">
                    <div className={`fht-detail-avatar ${(m.gender || 'male').toLowerCase()}`}>
                        {getInitials(m.name)}
                    </div>
                    <div className="fht-detail-identity">
                        <h2>{m.name}</h2>
                        <span className="fht-detail-relation">{m.relationship}</span>
                        <div className="fht-detail-meta-row">
                            {m.age && <span className="fht-detail-meta-chip">{m.age} Yrs</span>}
                            {m.gender && <span className="fht-detail-meta-chip">{m.gender}</span>}
                            {m.bloodGroup && <span className="fht-detail-meta-chip">{m.bloodGroup}</span>}
                            <span className={`fht-detail-alive-badge ${m.isAlive !== false ? 'alive' : 'deceased'}`}>
                                <FiHeart style={{ width: 10, height: 10 }} />
                                {m.isAlive !== false ? 'Alive' : 'Deceased'}
                            </span>
                        </div>
                    </div>
                    <button className="fht-detail-close" onClick={() => setSelectedMember(null)}>
                        <FiX />
                    </button>
                </div>

                {/* Sub-Tabs */}
                <div className="fht-detail-tabs">
                    {['overview', 'conditions', 'lifestyle', 'notes'].map(tab => (
                        <button
                            key={tab}
                            className={`fht-detail-tab ${detailTab === tab ? 'active' : ''}`}
                            onClick={() => setDetailTab(tab)}
                        >
                            {tab === 'overview' ? 'Overview' : tab === 'conditions' ? 'Medical Conditions' : tab === 'lifestyle' ? 'Lifestyle' : 'Notes'}
                        </button>
                    ))}
                </div>

                {/* Tab Content */}
                <div className="fht-detail-content">
                    {/* ── Overview Tab ─────────────────────────────────────── */}
                    {detailTab === 'overview' && (
                        <>
                            <h4 className="fht-detail-section-title">Personal Information</h4>
                            <div className="fht-detail-info-grid">
                                <div className="fht-detail-info-item">
                                    <span className="fht-info-label">Date of Birth</span>
                                    <span className="fht-info-value">{m.dob ? new Date(m.dob).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A'}</span>
                                </div>
                                <div className="fht-detail-info-item">
                                    <span className="fht-info-label">Occupation</span>
                                    <span className="fht-info-value">{m.occupation || 'N/A'}</span>
                                </div>
                                <div className="fht-detail-info-item">
                                    <span className="fht-info-label">Contact</span>
                                    <span className="fht-info-value">{m.phone || 'N/A'}</span>
                                </div>
                                <div className="fht-detail-info-item">
                                    <span className="fht-info-label">Address</span>
                                    <span className="fht-info-value">{m.address || 'N/A'}</span>
                                </div>
                            </div>

                            {/* Quick Conditions Preview */}
                            {m.medicalConditions && m.medicalConditions.length > 0 && (
                                <>
                                    <h4 className="fht-detail-section-title">Medical Conditions</h4>
                                    {m.medicalConditions.slice(0, 2).map((c, i) => (
                                        <div key={i} className="fht-condition-card">
                                            <div className="fht-condition-header">
                                                <span className="fht-condition-name">{c.name}</span>
                                                <span className={`fht-condition-status ${(c.status || 'unknown').toLowerCase()}`}>
                                                    {c.status || 'Unknown'}
                                                </span>
                                            </div>
                                            <div className="fht-condition-details">
                                                {c.diagnosedAge && (
                                                    <div className="fht-condition-detail-item">
                                                        <span className="fht-cd-label">Diagnosed At:</span>
                                                        <span className="fht-cd-value">{c.diagnosedAge} Yrs</span>
                                                    </div>
                                                )}
                                                {c.treatment && (
                                                    <div className="fht-condition-detail-item">
                                                        <span className="fht-cd-label">Treatment:</span>
                                                        <span className="fht-cd-value">{c.treatment}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                    {m.medicalConditions.length > 2 && (
                                        <button className="fht-view-timeline-btn" onClick={() => setDetailTab('conditions')}>
                                            View All {m.medicalConditions.length} Conditions <FiChevronRight />
                                        </button>
                                    )}
                                </>
                            )}

                            {/* Family History Checklist */}
                            <h4 className="fht-detail-section-title">Family History</h4>
                            <div className="fht-family-checklist">
                                {familyChecklist.map((item, i) => (
                                    <div key={i} className="fht-checklist-item">
                                        <div className="fht-checklist-left">
                                            <span className={`fht-checklist-dot ${item.present ? 'yes' : 'no'}`}>
                                                {item.present ? <FiCheck /> : <FiX />}
                                            </span>
                                            <span className="fht-checklist-name">{item.name}</span>
                                        </div>
                                        <span className={`fht-checklist-value ${item.present ? 'yes' : 'no'}`}>
                                            {item.present ? 'Yes' : 'No'}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}

                    {/* ── Medical Conditions Tab ──────────────────────────── */}
                    {detailTab === 'conditions' && (
                        <>
                            <h4 className="fht-detail-section-title">
                                All Medical Conditions ({(m.medicalConditions || []).length})
                            </h4>
                            {(!m.medicalConditions || m.medicalConditions.length === 0) ? (
                                <div className="fht-notes-content fht-notes-empty">
                                    No medical conditions recorded for this member.
                                </div>
                            ) : (
                                m.medicalConditions.map((c, i) => (
                                    <div key={i} className="fht-condition-card">
                                        <div className="fht-condition-header">
                                            <span className="fht-condition-name">{c.name}</span>
                                            <span className={`fht-condition-status ${(c.status || 'unknown').toLowerCase()}`}>
                                                {c.status || 'Unknown'}
                                            </span>
                                        </div>
                                        <div className="fht-condition-details">
                                            {c.diagnosedAge && (
                                                <div className="fht-condition-detail-item">
                                                    <span className="fht-cd-label">Diagnosed At:</span>
                                                    <span className="fht-cd-value">{c.diagnosedAge} Yrs</span>
                                                </div>
                                            )}
                                            {c.duration && (
                                                <div className="fht-condition-detail-item">
                                                    <span className="fht-cd-label">Duration:</span>
                                                    <span className="fht-cd-value">{c.duration}</span>
                                                </div>
                                            )}
                                            {c.treatment && (
                                                <div className="fht-condition-detail-item">
                                                    <span className="fht-cd-label">Treatment:</span>
                                                    <span className="fht-cd-value">{c.treatment}</span>
                                                </div>
                                            )}
                                            {c.notes && (
                                                <div className="fht-condition-detail-item" style={{ gridColumn: '1 / -1' }}>
                                                    <span className="fht-cd-label">Notes:</span>
                                                    <span className="fht-cd-value">{c.notes}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))
                            )}
                        </>
                    )}

                    {/* ── Lifestyle Tab ────────────────────────────────────── */}
                    {detailTab === 'lifestyle' && (
                        <>
                            <h4 className="fht-detail-section-title">Lifestyle & Habits</h4>
                            <div className="fht-lifestyle-grid">
                                <div className="fht-lifestyle-item">
                                    <div className="fht-lifestyle-icon smoking"><FaSmoking /></div>
                                    <div className="fht-lifestyle-info">
                                        <span className="fht-lifestyle-label">Smoking</span>
                                        <span className="fht-lifestyle-value">{m.lifestyle?.smoking || 'Unknown'}</span>
                                    </div>
                                </div>
                                <div className="fht-lifestyle-item">
                                    <div className="fht-lifestyle-icon alcohol"><FaWineGlass /></div>
                                    <div className="fht-lifestyle-info">
                                        <span className="fht-lifestyle-label">Alcohol</span>
                                        <span className="fht-lifestyle-value">{m.lifestyle?.alcohol || 'Unknown'}</span>
                                    </div>
                                </div>
                                <div className="fht-lifestyle-item">
                                    <div className="fht-lifestyle-icon exercise"><FaRunning /></div>
                                    <div className="fht-lifestyle-info">
                                        <span className="fht-lifestyle-label">Exercise</span>
                                        <span className="fht-lifestyle-value">{m.lifestyle?.exercise || 'Unknown'}</span>
                                    </div>
                                </div>
                                <div className="fht-lifestyle-item">
                                    <div className="fht-lifestyle-icon diet"><FaUtensils /></div>
                                    <div className="fht-lifestyle-info">
                                        <span className="fht-lifestyle-label">Diet</span>
                                        <span className="fht-lifestyle-value">{m.lifestyle?.diet || 'Unknown'}</span>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}

                    {/* ── Notes Tab ────────────────────────────────────────── */}
                    {detailTab === 'notes' && (
                        <>
                            <h4 className="fht-detail-section-title">Notes</h4>
                            <div className={`fht-notes-content ${!m.notes ? 'fht-notes-empty' : ''}`}>
                                {m.notes || 'No notes added for this family member.'}
                            </div>
                        </>
                    )}
                </div>

                {/* Action Buttons */}
                <div style={{ padding: '0 20px 20px' }}>
                    <button className="fht-edit-member-btn" onClick={() => openEditModal(m)}>
                        <FiEdit3 /> Edit Member
                    </button>
                    <button className="fht-delete-member-btn" onClick={() => handleDelete(m._id)}>
                        <FiTrash2 /> Remove Member
                    </button>
                </div>
            </div>
        );
    };

    // ── Render Add/Edit Modal ────────────────────────────────────────────────
    const renderModal = () => {
        if (!showModal) return null;

        return (
            <div className="fht-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}>
                <div className="fht-modal">
                    <div className="fht-modal-header">
                        <h2>
                            <FaDna /> {editingMember ? 'Edit Family Member' : 'Add Family Member'}
                        </h2>
                        <button className="fht-modal-close" onClick={() => setShowModal(false)}>
                            <FiX />
                        </button>
                    </div>

                    <div className="fht-modal-body">
                        {/* Identity Section */}
                        <div className="fht-form-section-title">
                            <FiUser /> Personal Information
                        </div>
                        <div className="fht-form-grid">
                            <div className="fht-form-group">
                                <label>Full Name <span className="required">*</span></label>
                                <input type="text" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Enter full name" />
                            </div>
                            <div className="fht-form-group">
                                <label>Relationship <span className="required">*</span></label>
                                <select value={form.relationship} onChange={e => setForm(p => ({ ...p, relationship: e.target.value }))}>
                                    <option value="">Select Relationship</option>
                                    {RELATIONSHIP_OPTIONS.map(r => (
                                        <option key={r.value} value={r.value}>{r.value}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="fht-form-group">
                                <label>Gender</label>
                                <select value={form.gender} onChange={e => setForm(p => ({ ...p, gender: e.target.value }))}>
                                    <option value="Male">Male</option>
                                    <option value="Female">Female</option>
                                    <option value="Other">Other</option>
                                </select>
                            </div>
                            <div className="fht-form-group">
                                <label>Date of Birth</label>
                                <input type="date" value={form.dob} onChange={e => setForm(p => ({ ...p, dob: e.target.value }))} />
                            </div>
                            <div className="fht-form-group">
                                <label>Age</label>
                                <input type="number" value={form.age} onChange={e => setForm(p => ({ ...p, age: e.target.value }))} placeholder="Age" min="1" max="150" />
                            </div>
                            <div className="fht-form-group">
                                <label>Blood Group</label>
                                <select value={form.bloodGroup} onChange={e => setForm(p => ({ ...p, bloodGroup: e.target.value }))}>
                                    <option value="">Select</option>
                                    {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(bg => (
                                        <option key={bg} value={bg}>{bg}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="fht-form-group">
                                <label>Phone</label>
                                <input type="tel" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} placeholder="10-digit mobile" />
                            </div>
                            <div className="fht-form-group">
                                <label>Occupation</label>
                                <input type="text" value={form.occupation} onChange={e => setForm(p => ({ ...p, occupation: e.target.value }))} placeholder="e.g. Businessman" />
                            </div>
                            <div className="fht-form-group full-width">
                                <label>Address</label>
                                <input type="text" value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} placeholder="City, State" />
                            </div>
                        </div>

                        <div className="fht-form-checkbox">
                            <input type="checkbox" id="isAliveCheck" checked={form.isAlive} onChange={e => setForm(p => ({ ...p, isAlive: e.target.checked }))} />
                            <label htmlFor="isAliveCheck">This member is alive</label>
                        </div>

                        {/* Medical Conditions Section */}
                        <div className="fht-form-section-title">
                            <FaStethoscope /> Medical Conditions
                        </div>
                        <div className="fht-conditions-list">
                            {form.medicalConditions.map((cond, i) => (
                                <div key={i} className="fht-condition-form-card">
                                    <button className="fht-condition-remove-btn" onClick={() => removeCondition(i)}>
                                        <FiX style={{ width: 14, height: 14 }} />
                                    </button>
                                    <div className="fht-form-grid">
                                        <div className="fht-form-group">
                                            <label>Condition Name <span className="required">*</span></label>
                                            <input
                                                type="text"
                                                value={cond.name}
                                                onChange={e => updateCondition(i, 'name', e.target.value)}
                                                placeholder="e.g. Diabetes"
                                                list={`condition-suggestions-${i}`}
                                            />
                                            <datalist id={`condition-suggestions-${i}`}>
                                                {COMMON_CONDITIONS.map(c => <option key={c} value={c} />)}
                                            </datalist>
                                        </div>
                                        <div className="fht-form-group">
                                            <label>Status</label>
                                            <select value={cond.status} onChange={e => updateCondition(i, 'status', e.target.value)}>
                                                <option value="Active">Active</option>
                                                <option value="Controlled">Controlled</option>
                                                <option value="Resolved">Resolved</option>
                                                <option value="Unknown">Unknown</option>
                                            </select>
                                        </div>
                                        <div className="fht-form-group">
                                            <label>Diagnosed At (Age)</label>
                                            <input type="number" value={cond.diagnosedAge} onChange={e => updateCondition(i, 'diagnosedAge', e.target.value)} placeholder="Age" min="0" />
                                        </div>
                                        <div className="fht-form-group">
                                            <label>Treatment</label>
                                            <input type="text" value={cond.treatment} onChange={e => updateCondition(i, 'treatment', e.target.value)} placeholder="e.g. Medication" />
                                        </div>
                                    </div>
                                </div>
                            ))}
                            <button className="fht-add-condition-btn" onClick={addCondition}>
                                <FiPlus /> Add Medical Condition
                            </button>
                        </div>

                        {/* Lifestyle Section */}
                        <div className="fht-form-section-title">
                            <FaLeaf /> Lifestyle
                        </div>
                        <div className="fht-form-grid">
                            <div className="fht-form-group">
                                <label>Smoking</label>
                                <select value={form.lifestyle.smoking} onChange={e => setForm(p => ({ ...p, lifestyle: { ...p.lifestyle, smoking: e.target.value } }))}>
                                    <option value="">Select</option>
                                    <option value="Never">Never</option>
                                    <option value="Former">Former</option>
                                    <option value="Current">Current</option>
                                    <option value="Unknown">Unknown</option>
                                </select>
                            </div>
                            <div className="fht-form-group">
                                <label>Alcohol</label>
                                <select value={form.lifestyle.alcohol} onChange={e => setForm(p => ({ ...p, lifestyle: { ...p.lifestyle, alcohol: e.target.value } }))}>
                                    <option value="">Select</option>
                                    <option value="Never">Never</option>
                                    <option value="Occasional">Occasional</option>
                                    <option value="Regular">Regular</option>
                                    <option value="Heavy">Heavy</option>
                                    <option value="Unknown">Unknown</option>
                                </select>
                            </div>
                            <div className="fht-form-group">
                                <label>Exercise</label>
                                <select value={form.lifestyle.exercise} onChange={e => setForm(p => ({ ...p, lifestyle: { ...p.lifestyle, exercise: e.target.value } }))}>
                                    <option value="">Select</option>
                                    <option value="None">None</option>
                                    <option value="Light">Light</option>
                                    <option value="Moderate">Moderate</option>
                                    <option value="Active">Active</option>
                                    <option value="Unknown">Unknown</option>
                                </select>
                            </div>
                            <div className="fht-form-group">
                                <label>Diet</label>
                                <select value={form.lifestyle.diet} onChange={e => setForm(p => ({ ...p, lifestyle: { ...p.lifestyle, diet: e.target.value } }))}>
                                    <option value="">Select</option>
                                    <option value="Vegetarian">Vegetarian</option>
                                    <option value="Non-Vegetarian">Non-Vegetarian</option>
                                    <option value="Vegan">Vegan</option>
                                    <option value="Mixed">Mixed</option>
                                    <option value="Unknown">Unknown</option>
                                </select>
                            </div>
                        </div>

                        {/* Notes */}
                        <div className="fht-form-section-title">
                            <FiEdit3 /> Notes
                        </div>
                        <div className="fht-form-group full-width">
                            <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Any additional notes about this family member..." rows={3} />
                        </div>
                    </div>

                    <div className="fht-modal-footer">
                        <button className="fht-modal-btn cancel" onClick={() => setShowModal(false)}>Cancel</button>
                        <button className="fht-modal-btn save" onClick={handleSave} disabled={saving}>
                            {saving ? 'Saving...' : (editingMember ? 'Update Member' : 'Add Member')}
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    // ── Donut Chart ──────────────────────────────────────────────────────────
    const renderDonut = () => {
        const total = stats.totalMembers || 1;
        const affectedPct = (stats.affectedCount / total) * 100;
        const healthyPct = (stats.healthyCount / total) * 100;

        return (
            <div
                className="fht-donut"
                style={{
                    background: `conic-gradient(
                        var(--fht-primary) 0% ${healthyPct}%,
                        #f59e0b ${healthyPct}% ${healthyPct + affectedPct}%,
                        #e5e7eb ${healthyPct + affectedPct}% 100%
                    )`
                }}
            >
                <div className="fht-donut-inner" />
            </div>
        );
    };

    // ══════════════════════════════════════════════════════════════════════════
    // MAIN RENDER
    // ══════════════════════════════════════════════════════════════════════════
    return (
        <div className="fht-container">
            {/* ── Stats Bar ───────────────────────────────────────────────── */}
            <div className="fht-stats-bar">
                <div className="fht-stat-item">
                    <span className="fht-stat-value">{stats.totalMembers}</span>
                    <span className="fht-stat-label">Family Members</span>
                </div>
                <div className="fht-stat-item">
                    <span className="fht-stat-value">{stats.conditionsCount}</span>
                    <span className="fht-stat-label">Medical Conditions</span>
                </div>
                <div className="fht-stat-item">
                    <span className="fht-stat-value">{stats.generationsCount}</span>
                    <span className="fht-stat-label">Generations</span>
                </div>
                <div className="fht-stats-spacer" />
                <button className="fht-add-member-btn" onClick={openAddModal}>
                    <FiPlus /> Add Family Member
                </button>
            </div>

            {/* ── Main Layout: Tree + Detail Panel ────────────────────────── */}
            <div className="fht-main-layout">
                {/* Tree Area */}
                <div className="fht-tree-area">
                    <FloatingLeaves />
                    <div className={`fht-tree-viewport ${zoomLevel === 'in' ? 'zoomed-in' : zoomLevel === 'out' ? 'zoomed-out' : ''}`}>
                        {renderTree()}
                    </div>

                    {/* Fit View Button */}
                    {members.length > 0 && (
                        <button className="fht-fit-view-btn" onClick={() => setZoomLevel('normal')}>
                            <FiMaximize2 /> Fit View
                        </button>
                    )}
                </div>

                {/* Detail Panel */}
                {renderDetailPanel()}
            </div>

            {/* ── Bottom Insight Cards ────────────────────────────────────── */}
            {members.length > 0 && (
                <div className="fht-insights-grid">
                    {/* Medical Pattern Insights */}
                    <div className="fht-insight-card">
                        <h3 className="fht-insight-title">Medical Pattern Insights</h3>
                        {patternInsights.length === 0 ? (
                            <div className="fht-notes-content fht-notes-empty">
                                No medical patterns detected yet. Add medical conditions to family members to see insights.
                            </div>
                        ) : (
                            patternInsights.map((item, i) => (
                                <div key={i} className="fht-pattern-item">
                                    <span className="fht-pattern-rank">{i + 1}</span>
                                    <div className="fht-pattern-info">
                                        <div className="fht-pattern-name">{item.name}</div>
                                        <div className="fht-pattern-desc">
                                            {item.genCount >= 2
                                                ? `Reported in ${item.genCount} generations`
                                                : `Found in ${item.count} family member${item.count > 1 ? 's' : ''}`
                                            }
                                        </div>
                                    </div>
                                    <span className={`fht-pattern-badge ${item.risk}`}>
                                        {item.risk === 'high' ? 'High Risk' : item.risk === 'moderate' ? 'Moderate Risk' : 'Low Risk'}
                                    </span>
                                </div>
                            ))
                        )}
                    </div>

                    {/* Family Health Summary */}
                    <div className="fht-insight-card">
                        <h3 className="fht-insight-title">Family Health Summary</h3>
                        <div className="fht-donut-wrapper">
                            {renderDonut()}
                            <div className="fht-donut-legend">
                                <div className="fht-legend-item">
                                    <span className="fht-legend-dot total" />
                                    <span className="fht-legend-label">Total Members</span>
                                    <span className="fht-legend-value">{stats.totalMembers}</span>
                                </div>
                                <div className="fht-legend-item">
                                    <span className="fht-legend-dot affected" />
                                    <span className="fht-legend-label">Affected</span>
                                    <span className="fht-legend-value">{stats.affectedCount}</span>
                                </div>
                                <div className="fht-legend-item">
                                    <span className="fht-legend-dot healthy" />
                                    <span className="fht-legend-label">Healthy</span>
                                    <span className="fht-legend-value">{stats.healthyCount}</span>
                                </div>
                            </div>
                        </div>
                        <div className="fht-generations-note">
                            {stats.generationsCount} Generation{stats.generationsCount !== 1 ? 's' : ''} Documented
                        </div>
                    </div>

                    {/* Family History Timeline */}
                    <div className="fht-insight-card">
                        <h3 className="fht-insight-title">Family History Timeline</h3>
                        {timeline.length === 0 ? (
                            <div className="fht-notes-content fht-notes-empty">
                                No timeline events yet. Add diagnosed ages to family members' conditions to build the timeline.
                            </div>
                        ) : (
                            <>
                                <div className="fht-timeline-list">
                                    {timeline.map((evt, i) => (
                                        <div key={i} className="fht-timeline-item">
                                            <span className="fht-timeline-dot" />
                                            <span className="fht-timeline-year">{evt.year}</span>
                                            <div className="fht-timeline-info">
                                                <div className="fht-timeline-person">{evt.person}</div>
                                                <div className="fht-timeline-event">{evt.event}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                {timeline.length > 3 && (
                                    <button className="fht-view-timeline-btn">
                                        View Full Timeline <FiChevronRight />
                                    </button>
                                )}
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* ── Add/Edit Modal ──────────────────────────────────────────── */}
            {renderModal()}
        </div>
    );
};

export default FamilyHealthTree;
