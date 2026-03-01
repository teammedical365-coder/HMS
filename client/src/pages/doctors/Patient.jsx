import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { doctorAPI } from '../../utils/api';

const Patient = () => {
    const navigate = useNavigate();
    const [appointments, setAppointments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState('today');
    const [vitalsPatient, setVitalsPatient] = useState(null);
    const [vitals, setVitals] = useState({
        weight: '', height: '', bmi: '', bloodPressure: '',
        pulse: '', temperature: '', spo2: '', respiratoryRate: '',
        chiefComplaint: '', notes: ''
    });
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        fetchAllAppointments();
    }, []);

    const fetchAllAppointments = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await doctorAPI.getAllAppointments();
            if (res.success) {
                setAppointments(res.appointments || []);
            } else {
                setError(res.message || 'Failed to load appointments');
            }
        } catch (err) {
            console.error('Fetch error:', err);
            setError(err.response?.data?.message || err.message || 'Network error');
        } finally {
            setLoading(false);
        }
    };

    // Calculate BMI when weight/height change
    useEffect(() => {
        const w = parseFloat(vitals.weight);
        const h = parseFloat(vitals.height) / 100; // cm to m
        if (w > 0 && h > 0) {
            setVitals(v => ({ ...v, bmi: (w / (h * h)).toFixed(1) }));
        }
    }, [vitals.weight, vitals.height]);

    const handleSaveVitals = async () => {
        if (!vitalsPatient) return;
        setSaving(true);
        try {
            const patientId = vitalsPatient.userId?._id || vitalsPatient.userId;
            const profileData = {
                vitals: {
                    weight: vitals.weight,
                    height: vitals.height,
                    bmi: vitals.bmi,
                    bloodPressure: vitals.bloodPressure,
                    pulse: vitals.pulse,
                    temperature: vitals.temperature,
                    spo2: vitals.spo2,
                    respiratoryRate: vitals.respiratoryRate,
                    lastRecorded: new Date().toISOString()
                }
            };
            await doctorAPI.updatePatientProfile(patientId, profileData);

            // Also save chief complaint in appointment notes if provided
            if (vitals.chiefComplaint || vitals.notes) {
                try {
                    await doctorAPI.updateSession(vitalsPatient._id, {
                        notes: `Chief Complaint: ${vitals.chiefComplaint}\nNurse Notes: ${vitals.notes}`
                    });
                } catch (e) { /* optional, don't block */ }
            }

            alert('Vitals saved successfully!');
            setVitalsPatient(null);
            setVitals({ weight: '', height: '', bmi: '', bloodPressure: '', pulse: '', temperature: '', spo2: '', respiratoryRate: '', chiefComplaint: '', notes: '' });
            fetchAllAppointments();
        } catch (err) {
            alert('Error saving vitals: ' + (err.response?.data?.message || err.message));
        } finally {
            setSaving(false);
        }
    };

    const openVitalsForm = (apt) => {
        const existing = apt.userId?.fertilityProfile?.vitals || {};
        setVitals({
            weight: existing.weight || '',
            height: existing.height || '',
            bmi: existing.bmi || '',
            bloodPressure: existing.bloodPressure || '',
            pulse: existing.pulse || '',
            temperature: existing.temperature || '',
            spo2: existing.spo2 || '',
            respiratoryRate: existing.respiratoryRate || '',
            chiefComplaint: '',
            notes: ''
        });
        setVitalsPatient(apt);
    };

    // Filtering
    const q = searchQuery.toLowerCase();
    const filtered = appointments.filter(a => {
        if (!q) return true;
        return (
            (a.userId?.name || '').toLowerCase().includes(q) ||
            (a.userId?.phone || '').toLowerCase().includes(q) ||
            (a.userId?.patientId || '').toLowerCase().includes(q) ||
            (a.doctorName || '').toLowerCase().includes(q)
        );
    });

    const todayStr = new Date().toDateString();
    const todayAppts = filtered.filter(a =>
        new Date(a.appointmentDate).toDateString() === todayStr
    );
    const allActive = filtered.filter(a => a.status !== 'cancelled');

    const displayList = activeTab === 'today' ? todayAppts : allActive;

    // Stat counts
    const todayTotal = appointments.filter(a => new Date(a.appointmentDate).toDateString() === todayStr).length;
    const pendingCount = appointments.filter(a => (a.status === 'pending' || a.status === 'confirmed') && new Date(a.appointmentDate).toDateString() === todayStr).length;
    const completedCount = appointments.filter(a => a.status === 'completed' && new Date(a.appointmentDate).toDateString() === todayStr).length;

    const getStatusStyle = (status) => {
        const map = {
            confirmed: { bg: '#dcfce7', color: '#166534' },
            completed: { bg: '#dbeafe', color: '#1e40af' },
            cancelled: { bg: '#fee2e2', color: '#991b1b' },
            pending: { bg: '#fef3c7', color: '#92400e' },
        };
        return map[status] || { bg: '#f1f5f9', color: '#475569' };
    };

    // ─── STYLES ─────────────────────────────────────────────────────
    const S = {
        page: { minHeight: '100vh', background: 'linear-gradient(145deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)', fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif" },
        topbar: { background: 'rgba(15,23,42,0.9)', backdropFilter: 'blur(24px)', borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '16px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, zIndex: 100 },
        topLeft: { display: 'flex', alignItems: 'center', gap: '14px' },
        logo: { width: '44px', height: '44px', borderRadius: '14px', background: 'linear-gradient(135deg, #06b6d4, #3b82f6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem' },
        title: { margin: 0, color: '#f8fafc', fontSize: '1.25rem', fontWeight: '800', letterSpacing: '-0.02em' },
        subtitle: { margin: 0, color: '#64748b', fontSize: '0.8rem', fontWeight: '500' },
        dateBadge: { background: 'rgba(255,255,255,0.05)', padding: '8px 16px', borderRadius: '10px', color: '#94a3b8', fontSize: '0.82rem', border: '1px solid rgba(255,255,255,0.06)' },
        statsRow: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px', padding: '20px 28px 0' },
        statCard: (gradient) => ({ background: 'rgba(255,255,255,0.04)', borderRadius: '16px', padding: '18px 20px', border: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: '14px', transition: 'transform 0.2s' }),
        statIcon: (gradient) => ({ width: '46px', height: '46px', borderRadius: '13px', background: gradient, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', flexShrink: 0 }),
        statNum: { color: '#f8fafc', fontSize: '1.6rem', fontWeight: '800', lineHeight: 1.1 },
        statLabel: { color: '#64748b', fontSize: '0.75rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '2px' },
        controls: { padding: '18px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '14px', flexWrap: 'wrap' },
        searchWrap: { position: 'relative', flex: 1, maxWidth: '420px' },
        searchInput: { width: '100%', padding: '11px 16px 11px 42px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#f8fafc', fontSize: '0.88rem', outline: 'none', transition: 'border 0.2s' },
        searchIcon: { position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#475569', fontSize: '1rem' },
        tabsWrap: { display: 'flex', gap: '4px', background: 'rgba(255,255,255,0.04)', padding: '4px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)' },
        tab: (active) => ({ padding: '8px 20px', borderRadius: '9px', border: 'none', cursor: 'pointer', fontWeight: '700', fontSize: '0.82rem', transition: 'all 0.25s', background: active ? 'linear-gradient(135deg, #3b82f6, #6366f1)' : 'transparent', color: active ? '#fff' : '#94a3b8', boxShadow: active ? '0 2px 12px rgba(59,130,246,0.3)' : 'none' }),
        content: { padding: '0 28px 40px' },
        sectionHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' },
        sectionTitle: { color: '#f8fafc', fontSize: '1rem', fontWeight: '700', margin: 0 },
        sectionCount: { color: '#64748b', fontSize: '0.82rem', fontWeight: '600' },
        table: { width: '100%', borderCollapse: 'collapse' },
        th: { padding: '13px 16px', textAlign: 'left', color: '#64748b', fontSize: '0.72rem', textTransform: 'uppercase', fontWeight: '700', letterSpacing: '0.06em', borderBottom: '1px solid rgba(255,255,255,0.06)' },
        td: { padding: '13px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)' },
        tableWrap: { background: 'rgba(255,255,255,0.03)', borderRadius: '16px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.06)' },
        avatar: (color) => ({ width: '36px', height: '36px', borderRadius: '10px', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: '800', fontSize: '0.85rem', flexShrink: 0 }),
        btn: (bg) => ({ padding: '7px 18px', borderRadius: '9px', border: 'none', background: bg, color: '#fff', fontWeight: '700', fontSize: '0.8rem', cursor: 'pointer', transition: 'all 0.2s', whiteSpace: 'nowrap' }),
        empty: { textAlign: 'center', padding: '60px 20px', background: 'rgba(255,255,255,0.02)', borderRadius: '16px', border: '1px dashed rgba(255,255,255,0.08)' },
        // Modal styles
        overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' },
        modal: { background: 'linear-gradient(145deg, #1e293b, #0f172a)', borderRadius: '20px', width: '560px', maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' },
        modalHeader: { padding: '22px 28px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
        modalBody: { padding: '24px 28px' },
        formGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' },
        formGroup: { display: 'flex', flexDirection: 'column', gap: '6px' },
        formLabel: { color: '#94a3b8', fontSize: '0.75rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' },
        formInput: { padding: '10px 14px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', color: '#f8fafc', fontSize: '0.88rem', outline: 'none' },
        formTextarea: { padding: '10px 14px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', color: '#f8fafc', fontSize: '0.88rem', outline: 'none', minHeight: '70px', resize: 'vertical', fontFamily: 'inherit' },
        modalFooter: { padding: '18px 28px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'flex-end', gap: '10px' },
        loadingWrap: { textAlign: 'center', padding: '60px 0', color: '#94a3b8' },
        errorBanner: { background: 'rgba(239,68,68,0.15)', color: '#fca5a5', padding: '14px 28px', fontSize: '0.88rem', fontWeight: '600', borderBottom: '1px solid rgba(239,68,68,0.2)' },
    };

    return (
        <div style={S.page}>
            {/* ─── TOP BAR ─── */}
            <div style={S.topbar}>
                <div style={S.topLeft}>
                    <div style={S.logo}>🩺</div>
                    <div>
                        <h1 style={S.title}>Clinical Dashboard</h1>
                        <p style={S.subtitle}>Patient Intake, Vitals & Consultation Queue</p>
                    </div>
                </div>
                <div style={S.dateBadge}>
                    📅 {new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                </div>
            </div>

            {/* Error */}
            {error && <div style={S.errorBanner}>⚠️ {error}</div>}

            {/* ─── STATS ─── */}
            <div style={S.statsRow}>
                {[
                    { label: "Today's Patients", value: todayTotal, icon: '👥', g: 'linear-gradient(135deg, #3b82f6, #6366f1)' },
                    { label: 'Pending / In-Queue', value: pendingCount, icon: '⏳', g: 'linear-gradient(135deg, #f59e0b, #ef4444)' },
                    { label: 'Completed Today', value: completedCount, icon: '✅', g: 'linear-gradient(135deg, #10b981, #059669)' },
                ].map((s, i) => (
                    <div key={i} style={S.statCard(s.g)}>
                        <div style={S.statIcon(s.g)}>{s.icon}</div>
                        <div>
                            <div style={S.statNum}>{s.value}</div>
                            <div style={S.statLabel}>{s.label}</div>
                        </div>
                    </div>
                ))}
            </div>

            {/* ─── SEARCH + TABS ─── */}
            <div style={S.controls}>
                <div style={S.searchWrap}>
                    <span style={S.searchIcon}>🔍</span>
                    <input
                        type="text"
                        placeholder="Search patient name, phone, MRN, or doctor..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        style={S.searchInput}
                    />
                    {searchQuery && (
                        <button onClick={() => setSearchQuery('')} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '1rem' }}>✕</button>
                    )}
                </div>
                <div style={S.tabsWrap}>
                    <button style={S.tab(activeTab === 'today')} onClick={() => setActiveTab('today')}>
                        Today's Queue {todayAppts.length > 0 && <span style={{ marginLeft: '6px', background: 'rgba(255,255,255,0.2)', padding: '2px 8px', borderRadius: '10px', fontSize: '0.72rem' }}>{todayAppts.length}</span>}
                    </button>
                    <button style={S.tab(activeTab === 'all')} onClick={() => setActiveTab('all')}>
                        All Active
                    </button>
                </div>
            </div>

            {/* ─── CONTENT ─── */}
            <div style={S.content}>
                {loading ? (
                    <div style={S.loadingWrap}>
                        <div style={{ width: '38px', height: '38px', border: '3px solid rgba(255,255,255,0.08)', borderTop: '3px solid #3b82f6', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 14px' }} />
                        <p style={{ fontSize: '0.9rem' }}>Loading patients...</p>
                        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
                    </div>
                ) : displayList.length === 0 ? (
                    <div style={S.empty}>
                        <div style={{ fontSize: '3rem', marginBottom: '10px' }}>{activeTab === 'today' ? '📭' : '📋'}</div>
                        <h4 style={{ color: '#e2e8f0', margin: '0 0 6px', fontWeight: '700' }}>
                            {activeTab === 'today' ? 'No Patients in Today\'s Queue' : 'No Active Appointments'}
                        </h4>
                        <p style={{ color: '#64748b', margin: 0, fontSize: '0.88rem' }}>
                            {searchQuery ? 'No results match your search. Try a different term.' : 'Patients will appear here when appointments are booked.'}
                        </p>
                    </div>
                ) : (
                    <>
                        <div style={S.sectionHeader}>
                            <h3 style={S.sectionTitle}>
                                {activeTab === 'today' ? '🏥 Today\'s Patient Queue' : '📁 All Active Appointments'}
                            </h3>
                            <span style={S.sectionCount}>{displayList.length} patients</span>
                        </div>

                        <div style={S.tableWrap}>
                            <table style={S.table}>
                                <thead>
                                    <tr>
                                        <th style={S.th}>#</th>
                                        <th style={S.th}>Patient</th>
                                        <th style={S.th}>Contact</th>
                                        <th style={S.th}>Doctor (Referred To)</th>
                                        <th style={S.th}>Time</th>
                                        <th style={S.th}>Date</th>
                                        <th style={S.th}>Status</th>
                                        <th style={S.th}>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {displayList.map((apt, idx) => {
                                        const statusS = getStatusStyle(apt.status);
                                        const hasVitals = apt.userId?.fertilityProfile?.vitals?.weight;
                                        return (
                                            <tr key={apt._id} style={{ transition: 'background 0.15s' }}
                                                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                            >
                                                <td style={{ ...S.td, color: '#475569', fontWeight: '600', fontSize: '0.82rem' }}>{idx + 1}</td>
                                                <td style={S.td}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                        <div style={S.avatar('linear-gradient(135deg, #6366f1, #8b5cf6)')}>
                                                            {(apt.userId?.name || 'W')[0].toUpperCase()}
                                                        </div>
                                                        <div>
                                                            <div style={{ color: '#f8fafc', fontWeight: '700', fontSize: '0.88rem' }}>{apt.userId?.name || 'Walk-in'}</div>
                                                            <div style={{ color: '#64748b', fontSize: '0.75rem' }}>MRN: {apt.userId?.patientId || apt.patientId || 'N/A'}</div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td style={{ ...S.td, color: '#94a3b8', fontSize: '0.85rem' }}>{apt.userId?.phone || '-'}</td>
                                                <td style={S.td}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <div style={S.avatar('linear-gradient(135deg, #10b981, #059669)')}>
                                                            {(apt.doctorName || 'D')[0].toUpperCase()}
                                                        </div>
                                                        <span style={{ color: '#e2e8f0', fontWeight: '600', fontSize: '0.85rem' }}>
                                                            {apt.doctorName || 'Not Assigned'}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td style={{ ...S.td, color: '#f8fafc', fontWeight: '600', fontSize: '0.85rem' }}>{apt.appointmentTime || '-'}</td>
                                                <td style={{ ...S.td, color: '#94a3b8', fontSize: '0.82rem' }}>
                                                    {new Date(apt.appointmentDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                                                </td>
                                                <td style={S.td}>
                                                    <span style={{
                                                        background: statusS.bg, color: statusS.color,
                                                        padding: '4px 12px', borderRadius: '20px',
                                                        fontSize: '0.75rem', fontWeight: '700', textTransform: 'capitalize'
                                                    }}>
                                                        {apt.status}
                                                    </span>
                                                </td>
                                                <td style={S.td}>
                                                    <div style={{ display: 'flex', gap: '8px' }}>
                                                        <button
                                                            onClick={() => navigate(`/patient/${apt.userId?._id || apt.patientId}`)}
                                                            style={{
                                                                ...S.btn('rgba(59,130,246,0.1)'),
                                                                color: '#3b82f6', border: '1px solid #3b82f6',
                                                                display: 'flex', alignItems: 'center', gap: '5px'
                                                            }}
                                                        >
                                                            👁 Profile
                                                        </button>
                                                        <button
                                                            onClick={() => openVitalsForm(apt)}
                                                            style={{
                                                                ...S.btn(hasVitals ? 'linear-gradient(135deg, #10b981, #059669)' : 'linear-gradient(135deg, #3b82f6, #6366f1)'),
                                                                display: 'flex', alignItems: 'center', gap: '5px'
                                                            }}
                                                        >
                                                            {hasVitals ? '✏️ Vitals' : '💉 Vitals'}
                                                        </button>
                                                        <button
                                                            onClick={() => navigate(`/doctor/patient/${apt._id}`)}
                                                            style={{
                                                                ...S.btn('linear-gradient(135deg, #8b5cf6, #d946ef)'),
                                                                display: 'flex', alignItems: 'center', gap: '5px'
                                                            }}
                                                        >
                                                            📝 Consult Session
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
            </div>

            {/* ─── VITALS MODAL ─── */}
            {
                vitalsPatient && (
                    <div style={S.overlay} onClick={() => setVitalsPatient(null)}>
                        <div style={S.modal} onClick={e => e.stopPropagation()}>
                            {/* Header */}
                            <div style={S.modalHeader}>
                                <div>
                                    <h2 style={{ margin: 0, color: '#f8fafc', fontSize: '1.15rem', fontWeight: '800' }}>
                                        💉 Enter Vitals
                                    </h2>
                                    <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '0.82rem' }}>
                                        Patient: <strong style={{ color: '#e2e8f0' }}>{vitalsPatient.userId?.name || 'Unknown'}</strong> •
                                        MRN: {vitalsPatient.userId?.patientId || 'N/A'} •
                                        Dr. {vitalsPatient.doctorName}
                                    </p>
                                </div>
                                <button onClick={() => setVitalsPatient(null)} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '1.3rem', cursor: 'pointer' }}>✕</button>
                            </div>

                            {/* Body */}
                            <div style={S.modalBody}>
                                <div style={S.formGrid}>
                                    {[
                                        { key: 'weight', label: 'Weight (kg)', icon: '⚖️', type: 'number' },
                                        { key: 'height', label: 'Height (cm)', icon: '📏', type: 'number' },
                                        { key: 'bmi', label: 'BMI (auto)', icon: '📊', type: 'text', readOnly: true },
                                        { key: 'bloodPressure', label: 'Blood Pressure', icon: '🩸', type: 'text', placeholder: '120/80' },
                                        { key: 'pulse', label: 'Pulse (bpm)', icon: '💓', type: 'number' },
                                        { key: 'temperature', label: 'Temp (°F)', icon: '🌡️', type: 'number' },
                                        { key: 'spo2', label: 'SpO₂ (%)', icon: '🫁', type: 'number' },
                                        { key: 'respiratoryRate', label: 'Resp Rate (/min)', icon: '💨', type: 'number' },
                                    ].map(field => (
                                        <div key={field.key} style={S.formGroup}>
                                            <label style={S.formLabel}>{field.icon} {field.label}</label>
                                            <input
                                                type={field.type}
                                                value={vitals[field.key]}
                                                readOnly={field.readOnly}
                                                placeholder={field.placeholder || ''}
                                                onChange={e => setVitals({ ...vitals, [field.key]: e.target.value })}
                                                style={{
                                                    ...S.formInput,
                                                    ...(field.readOnly ? { background: 'rgba(255,255,255,0.02)', color: '#64748b' } : {})
                                                }}
                                            />
                                        </div>
                                    ))}
                                </div>

                                {/* Chief Complaint */}
                                <div style={{ ...S.formGroup, marginTop: '16px' }}>
                                    <label style={S.formLabel}>📋 Chief Complaint</label>
                                    <textarea
                                        value={vitals.chiefComplaint}
                                        onChange={e => setVitals({ ...vitals, chiefComplaint: e.target.value })}
                                        placeholder="Patient's chief complaint..."
                                        style={S.formTextarea}
                                    />
                                </div>

                                {/* Nurse Notes */}
                                <div style={{ ...S.formGroup, marginTop: '12px' }}>
                                    <label style={S.formLabel}>📝 Nurse Notes</label>
                                    <textarea
                                        value={vitals.notes}
                                        onChange={e => setVitals({ ...vitals, notes: e.target.value })}
                                        placeholder="Any observations or notes..."
                                        style={S.formTextarea}
                                    />
                                </div>
                            </div>

                            {/* Footer */}
                            <div style={S.modalFooter}>
                                <button onClick={() => setVitalsPatient(null)} style={{ ...S.btn('rgba(255,255,255,0.08)'), color: '#94a3b8' }}>Cancel</button>
                                <button
                                    onClick={handleSaveVitals}
                                    disabled={saving}
                                    style={{ ...S.btn('linear-gradient(135deg, #10b981, #059669)'), opacity: saving ? 0.6 : 1, minWidth: '140px' }}
                                >
                                    {saving ? '⏳ Saving...' : '✅ Save Vitals'}
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
};

export default Patient;