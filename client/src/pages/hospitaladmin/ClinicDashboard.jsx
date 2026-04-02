import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { clinicAPI } from '../../utils/api';
import './ClinicDashboard.css';

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
const fmt = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN') : '—';
const fmtTime = (d) => d ? new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—';
const todayStr = () => new Date().toISOString().split('T')[0];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ─────────────────────────────────────────────
// Role Modes
// ─────────────────────────────────────────────
const MODES = [
    { id: 'overview',  icon: '📊', label: 'Overview',   color: '#6366f1', bg: '#eef2ff' },
    { id: 'patients',  icon: '👤', label: 'Patients',   color: '#0ea5e9', bg: '#f0f9ff' },
    { id: 'doctor',    icon: '🩺', label: 'Doctor',     color: '#8b5cf6', bg: '#f5f3ff' },
    { id: 'reception', icon: '📋', label: 'Reception',  color: '#10b981', bg: '#f0fdf4' },
    { id: 'pharmacy',  icon: '💊', label: 'Pharmacy',   color: '#f97316', bg: '#fff7ed' },
    { id: 'billing',   icon: '💰', label: 'Billing',    color: '#f59e0b', bg: '#fffbeb' },
];

// ─────────────────────────────────────────────
// Root Component
// ─────────────────────────────────────────────
const ClinicDashboard = () => {
    const navigate = useNavigate();
    const [mode, setMode] = useState('overview');
    const [preselectedPatient, setPreselectedPatient] = useState(null);
    const currentUser = JSON.parse(localStorage.getItem('user') || '{}');

    useEffect(() => {
        if (currentUser?.role !== 'hospitaladmin') navigate('/login');
    }, []);

    const goToReception = (patient) => {
        setPreselectedPatient(patient);
        setMode('reception');
    };

    return (
        <div className="clinic-dashboard">
            {/* Role Switcher */}
            <div className="clinic-role-switcher">
                <div className="switcher-label">Mode:</div>
                {MODES.map(m => (
                    <button key={m.id}
                        className={`switcher-btn ${mode === m.id ? 'active' : ''}`}
                        style={mode === m.id ? { background: m.color, color: '#fff', borderColor: m.color } : {}}
                        onClick={() => setMode(m.id)}>
                        <span>{m.icon}</span> {m.label}
                    </button>
                ))}
                <div className="switcher-user">
                    <div className="switcher-avatar">{currentUser?.name?.charAt(0)?.toUpperCase()}</div>
                    <span>{currentUser?.name}</span>
                </div>
            </div>

            <div className="clinic-mode-content">
                {mode === 'overview'  && <OverviewMode />}
                {mode === 'patients'  && <PatientsMode onBookToken={goToReception} />}
                {mode === 'doctor'    && <DoctorMode />}
                {mode === 'reception' && <ReceptionMode preselectedPatient={preselectedPatient} clearPreselected={() => setPreselectedPatient(null)} />}
                {mode === 'pharmacy'  && <PharmacyMode />}
                {mode === 'billing'   && <BillingMode />}
            </div>
        </div>
    );
};

// ═══════════════════════════════════════════════════
// OVERVIEW MODE
// ═══════════════════════════════════════════════════
const OverviewMode = () => {
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        clinicAPI.getStats()
            .then(r => { if (r.success) setStats(r.stats); })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    if (loading) return <Spinner text="Loading overview..." />;

    const kpis = [
        { label: 'Total Patients', value: stats?.totalPatients ?? 0, sub: `+${stats?.todayPatients ?? 0} today`, icon: '👤', color: '#0ea5e9' },
        { label: "Today's Tokens", value: stats?.todayAppointments ?? 0, sub: `${stats?.pendingAppointments ?? 0} pending`, icon: '🎟️', color: '#8b5cf6' },
        { label: 'Completed Today', value: stats?.completedAppointments ?? 0, icon: '✅', color: '#10b981' },
        { label: "Today's Revenue", value: fmt(stats?.todayRevenue), sub: fmt(stats?.totalRevenue) + ' total', icon: '💰', color: '#f59e0b' },
        { label: 'This Month', value: fmt(stats?.monthRevenue), icon: '📅', color: '#6366f1' },
    ];

    return (
        <div>
            {/* KPI Row */}
            <div className="clinic-kpi-grid">
                {kpis.map((k, i) => (
                    <div key={i} className="clinic-kpi-card" style={{ borderTop: `4px solid ${k.color}` }}>
                        <div style={{ fontSize: '28px' }}>{k.icon}</div>
                        <div style={{ fontSize: '22px', fontWeight: 800, color: k.color }}>{k.value}</div>
                        <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>{k.label}</div>
                        {k.sub && <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>{k.sub}</div>}
                    </div>
                ))}
            </div>

            {/* Monthly Revenue Chart */}
            {stats?.monthlyTrend?.length > 0 && (
                <div className="clinic-card" style={{ marginBottom: '16px' }}>
                    <h3 style={{ marginBottom: '16px' }}>📈 Monthly Revenue</h3>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', height: '100px' }}>
                        {stats.monthlyTrend.map((m, i) => {
                            const max = Math.max(...stats.monthlyTrend.map(x => x.revenue));
                            const pct = max > 0 ? (m.revenue / max) * 100 : 0;
                            return (
                                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                                    <div style={{ fontSize: '10px', color: '#64748b' }}>{fmt(m.revenue)}</div>
                                    <div style={{ width: '100%', height: `${pct}%`, minHeight: '4px', background: '#6366f1', borderRadius: '4px 4px 0 0', transition: 'height 0.3s' }} />
                                    <div style={{ fontSize: '10px', color: '#94a3b8' }}>{MONTHS[(m._id.month - 1)]}</div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Recent Appointments */}
            {stats?.recentAppointments?.length > 0 && (
                <div className="clinic-card" style={{ marginBottom: '16px' }}>
                    <h3 style={{ marginBottom: '12px' }}>📋 Recent Appointments</h3>
                    <table className="clinic-table">
                        <thead><tr><th>Token</th><th>Patient</th><th>Date</th><th>Status</th><th>Fee</th><th>Payment</th></tr></thead>
                        <tbody>
                            {stats.recentAppointments.map(a => (
                                <tr key={a._id}>
                                    <td><strong style={{ color: '#6366f1' }}>#{a.tokenNumber || '—'}</strong></td>
                                    <td>
                                        <div style={{ fontWeight: 600 }}>{a.clinicPatientId?.name || '—'}</div>
                                        <div style={{ fontSize: '11px', color: '#94a3b8' }}>{a.clinicPatientId?.patientUid || a.patientId}</div>
                                    </td>
                                    <td style={{ fontSize: '12px' }}>{fmtDate(a.appointmentDate)}</td>
                                    <td><StatusBadge status={a.status} /></td>
                                    <td>{fmt(a.amount)}</td>
                                    <td><PayBadge status={a.paymentStatus} /></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Low Stock Alert */}
            {stats?.lowStockItems?.length > 0 && (
                <div className="clinic-card" style={{ border: '1px solid #fecaca' }}>
                    <h3 style={{ color: '#dc2626', marginBottom: '12px' }}>⚠️ Low Stock Alert</h3>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {stats.lowStockItems.map(item => (
                            <div key={item._id} style={{ background: '#fee2e2', borderRadius: '6px', padding: '6px 12px', fontSize: '13px' }}>
                                <strong>{item.name}</strong> — only <strong style={{ color: '#dc2626' }}>{item.stock}</strong> {item.unit} left
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

// ═══════════════════════════════════════════════════
// PATIENTS MODE
// ═══════════════════════════════════════════════════
const PatientsMode = ({ onBookToken }) => {
    const [tab, setTab] = useState('list');
    const [patients, setPatients] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [searching, setSearching] = useState(false);
    const [selectedPatient, setSelectedPatient] = useState(null);
    const [patientHistory, setPatientHistory] = useState(null);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [form, setForm] = useState({ name: '', phone: '', email: '', dob: '', gender: 'Male', address: '', bloodGroup: '', allergies: '', chronicConditions: '' });
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState({ type: '', text: '' });
    const [justRegistered, setJustRegistered] = useState(null);

    const flash = (type, text) => { setMsg({ type, text }); setTimeout(() => setMsg({ type: '', text: '' }), 6000); };

    useEffect(() => {
        clinicAPI.getPatients()
            .then(r => {
                if (r.success) setPatients(r.patients);
                else flash('error', r.message || 'Failed to load patients');
            })
            .catch(e => flash('error', e.response?.data?.message || e.message))
            .finally(() => setLoading(false));
    }, []);

    const handleSearch = async () => {
        if (!search.trim()) {
            setSearching(true);
            clinicAPI.getPatients().then(r => { if (r.success) setPatients(r.patients); }).finally(() => setSearching(false));
            return;
        }
        setSearching(true);
        clinicAPI.getPatients(search).then(r => { if (r.success) setPatients(r.patients); }).finally(() => setSearching(false));
    };

    const openHistory = async (p) => {
        setSelectedPatient(p);
        setLoadingHistory(true);
        setPatientHistory(null);
        clinicAPI.getPatientHistory(p._id)
            .then(r => { if (r.success) setPatientHistory(r); })
            .catch(console.error)
            .finally(() => setLoadingHistory(false));
    };

    const handleRegister = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            const r = await clinicAPI.registerPatient(form);
            if (r.success) {
                if (!r.existing) setPatients(prev => [r.patient, ...prev]);
                setJustRegistered(r.patient);
                setForm({ name: '', phone: '', email: '', dob: '', gender: 'Male', address: '', bloodGroup: '', allergies: '', chronicConditions: '' });
            } else flash('error', r.message);
        } catch (e) { flash('error', e.response?.data?.message || e.message); }
        finally { setSaving(false); }
    };

    // Patient detail view
    if (selectedPatient) {
        return (
            <div>
                <button className="clinic-back-btn" onClick={() => { setSelectedPatient(null); setPatientHistory(null); }}>← Back to Patients</button>
                <div className="clinic-card" style={{ marginTop: '12px', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <div className="clinic-avatar-lg">{selectedPatient.name?.charAt(0)?.toUpperCase()}</div>
                        <div>
                            <h2 style={{ margin: 0 }}>{selectedPatient.name}</h2>
                            <div style={{ color: '#64748b', fontSize: '14px', marginTop: '4px' }}>
                                <span style={{ background: '#eef2ff', color: '#6366f1', padding: '2px 8px', borderRadius: '4px', fontWeight: 700, fontSize: '12px', marginRight: '8px' }}>{selectedPatient.patientUid}</span>
                                {selectedPatient.phone && `📞 ${selectedPatient.phone}`}
                                {selectedPatient.gender && ` · ${selectedPatient.gender}`}
                                {selectedPatient.dob && ` · DOB: ${fmtDate(selectedPatient.dob)}`}
                            </div>
                            {selectedPatient.address && <div style={{ color: '#94a3b8', fontSize: '13px', marginTop: '4px' }}>📍 {selectedPatient.address}</div>}
                            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '6px', fontSize: '12px' }}>
                                {selectedPatient.bloodGroup && <span style={{ background: '#fee2e2', color: '#dc2626', padding: '2px 8px', borderRadius: '4px', fontWeight: 600 }}>🩸 {selectedPatient.bloodGroup}</span>}
                                {selectedPatient.allergies && <span style={{ background: '#fef3c7', color: '#92400e', padding: '2px 8px', borderRadius: '4px' }}>⚠️ Allergies: {selectedPatient.allergies}</span>}
                                {selectedPatient.chronicConditions && <span style={{ background: '#f0f9ff', color: '#0369a1', padding: '2px 8px', borderRadius: '4px' }}>🏥 {selectedPatient.chronicConditions}</span>}
                            </div>
                        </div>
                        <div style={{ marginLeft: 'auto', fontSize: '12px', color: '#94a3b8' }}>
                            Registered: {fmtDate(selectedPatient.createdAt)}
                        </div>
                    </div>
                </div>

                {loadingHistory ? <Spinner text="Loading history..." /> : patientHistory ? (
                    <div className="clinic-card">
                        <h3 style={{ marginBottom: '16px' }}>📋 Visit History ({patientHistory.appointments?.length || 0} visits)</h3>
                        {patientHistory.appointments?.length === 0 ? (
                            <p style={{ color: '#94a3b8', textAlign: 'center', padding: '20px 0' }}>No visits yet.</p>
                        ) : (
                            <table className="clinic-table">
                                <thead><tr><th>Date</th><th>Token</th><th>Diagnosis</th><th>Medicines</th><th>Status</th><th>Fee</th><th>Payment</th></tr></thead>
                                <tbody>
                                    {patientHistory.appointments.map(a => (
                                        <tr key={a._id}>
                                            <td style={{ fontSize: '12px' }}>{fmtDate(a.appointmentDate)}<br /><span style={{ color: '#94a3b8' }}>{fmtTime(a.appointmentDate)}</span></td>
                                            <td><strong style={{ color: '#6366f1' }}>#{a.tokenNumber || '—'}</strong></td>
                                            <td style={{ maxWidth: '160px', fontSize: '12px' }}>{a.diagnosis || '—'}</td>
                                            <td style={{ fontSize: '11px', color: '#64748b' }}>
                                                {(a.pharmacy || []).slice(0, 2).map((m, i) => <div key={i}>{m.medicineName || m.name}</div>)}
                                                {(a.pharmacy || []).length > 2 && <div>+{a.pharmacy.length - 2} more</div>}
                                            </td>
                                            <td><StatusBadge status={a.status} /></td>
                                            <td>{fmt(a.amount)}</td>
                                            <td><PayBadge status={a.paymentStatus} /></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                ) : null}
            </div>
        );
    }

    return (
        <div>
            <div className="clinic-sub-tabs">
                {[{ id: 'list', label: `👥 All Patients (${patients.length})` }, { id: 'register', label: '+ Register New' }].map(t => (
                    <button key={t.id} className={`clinic-sub-tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>{t.label}</button>
                ))}
            </div>

            {msg.text && <div className={`clinic-msg clinic-msg-${msg.type}`}>{msg.text}</div>}

            {tab === 'list' && (
                <div className="clinic-card">
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                        <input className="clinic-input" style={{ flex: 1 }} placeholder="Search by name, phone or patient ID..."
                            value={search} onChange={e => setSearch(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleSearch()} />
                        <button className="clinic-btn-secondary" onClick={handleSearch} disabled={searching}>
                            {searching ? '...' : '🔍 Search'}
                        </button>
                    </div>

                    {loading ? <Spinner /> : patients.length === 0 ? (
                        <Empty text="No patients yet. Register your first patient." />
                    ) : (
                        <table className="clinic-table">
                            <thead><tr><th>Patient ID</th><th>Name</th><th>Phone</th><th>Gender</th><th>Registered</th><th></th></tr></thead>
                            <tbody>
                                {patients.map(p => (
                                    <tr key={p._id} style={{ cursor: 'pointer' }} onClick={() => openHistory(p)}>
                                        <td><span style={{ background: '#eef2ff', color: '#6366f1', padding: '2px 8px', borderRadius: '4px', fontWeight: 700, fontSize: '12px' }}>{p.patientUid}</span></td>
                                        <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <div className="clinic-avatar-sm">{p.name?.charAt(0)?.toUpperCase()}</div>
                                                <strong>{p.name}</strong>
                                            </div>
                                        </td>
                                        <td>{p.phone}</td>
                                        <td>{p.gender || '—'}</td>
                                        <td style={{ fontSize: '12px', color: '#94a3b8' }}>{fmtDate(p.createdAt)}</td>
                                        <td><button className="clinic-btn-secondary" style={{ fontSize: '12px', padding: '4px 10px' }}>View →</button></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            )}

            {tab === 'register' && (
                <div className="clinic-card">
                    {justRegistered ? (
                        /* ── Success state ── */
                        <div style={{ textAlign: 'center', padding: '24px 0' }}>
                            <div style={{ fontSize: '48px', marginBottom: '8px' }}>✅</div>
                            <h3 style={{ margin: '0 0 4px' }}>Patient Registered!</h3>
                            <p style={{ color: '#64748b', margin: '0 0 20px' }}>
                                <strong>{justRegistered.name}</strong> · <span style={{ background: '#eef2ff', color: '#6366f1', padding: '2px 8px', borderRadius: '4px', fontWeight: 700, fontSize: '13px' }}>{justRegistered.patientUid}</span> · {justRegistered.phone}
                            </p>
                            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
                                <button className="clinic-btn-primary" style={{ fontSize: '15px', padding: '10px 24px' }}
                                    onClick={() => { onBookToken(justRegistered); }}>
                                    🎟️ Book Token Now
                                </button>
                                <button className="clinic-btn-secondary" onClick={() => { setJustRegistered(null); }}>
                                    + Register Another
                                </button>
                                <button className="clinic-btn-secondary" onClick={() => { setJustRegistered(null); setTab('list'); }}>
                                    View All Patients
                                </button>
                            </div>
                        </div>
                    ) : (
                        <>
                            <h3 style={{ marginBottom: '16px' }}>👤 Register New Patient</h3>
                            <form onSubmit={handleRegister} className="clinic-form-grid">
                                <div className="clinic-form-group">
                                    <label>Full Name *</label>
                                    <input className="clinic-input" placeholder="Patient's full name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
                                </div>
                                <div className="clinic-form-group">
                                    <label>Phone *</label>
                                    <input className="clinic-input" type="tel" placeholder="10-digit mobile number" maxLength={10}
                                        value={form.phone}
                                        onChange={e => setForm(f => ({ ...f, phone: e.target.value.replace(/\D/g, '').slice(0, 10) }))}
                                        pattern="[0-9]{10}" title="Enter a valid 10-digit mobile number" required />
                                </div>
                                <div className="clinic-form-group">
                                    <label>Email</label>
                                    <input className="clinic-input" type="email" placeholder="Optional" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
                                </div>
                                <div className="clinic-form-group">
                                    <label>Date of Birth</label>
                                    <input className="clinic-input" type="date" value={form.dob} onChange={e => setForm(f => ({ ...f, dob: e.target.value }))} />
                                </div>
                                <div className="clinic-form-group">
                                    <label>Gender</label>
                                    <select className="clinic-input" value={form.gender} onChange={e => setForm(f => ({ ...f, gender: e.target.value }))}>
                                        <option>Male</option><option>Female</option><option>Other</option>
                                    </select>
                                </div>
                                <div className="clinic-form-group">
                                    <label>Blood Group</label>
                                    <select className="clinic-input" value={form.bloodGroup} onChange={e => setForm(f => ({ ...f, bloodGroup: e.target.value }))}>
                                        <option value=''>Unknown</option>
                                        {['A+','A-','B+','B-','AB+','AB-','O+','O-'].map(g => <option key={g}>{g}</option>)}
                                    </select>
                                </div>
                                <div className="clinic-form-group" style={{ gridColumn: '1/-1' }}>
                                    <label>Address</label>
                                    <input className="clinic-input" placeholder="Optional" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
                                </div>
                                <div className="clinic-form-group" style={{ gridColumn: '1/-1' }}>
                                    <label>Known Allergies</label>
                                    <input className="clinic-input" placeholder="e.g. Penicillin, Dust (optional)" value={form.allergies} onChange={e => setForm(f => ({ ...f, allergies: e.target.value }))} />
                                </div>
                                <div className="clinic-form-group" style={{ gridColumn: '1/-1' }}>
                                    <label>Chronic Conditions</label>
                                    <input className="clinic-input" placeholder="e.g. Diabetes, Hypertension (optional)" value={form.chronicConditions} onChange={e => setForm(f => ({ ...f, chronicConditions: e.target.value }))} />
                                </div>
                                <div style={{ gridColumn: '1/-1' }}>
                                    <button type="submit" className="clinic-btn-primary" disabled={saving}>
                                        {saving ? 'Registering...' : '✅ Register Patient'}
                                    </button>
                                </div>
                            </form>
                        </>
                    )}
                </div>
            )}
        </div>
    );
};

// ═══════════════════════════════════════════════════
// RECEPTION MODE
// ═══════════════════════════════════════════════════
const ReceptionMode = ({ preselectedPatient, clearPreselected }) => {
    const [tab, setTab] = useState(preselectedPatient ? 'book' : 'queue');
    const [appointments, setAppointments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [msg, setMsg] = useState({ type: '', text: '' });

    // Patient search for booking
    const [patSearch, setPatSearch] = useState('');
    const [patResults, setPatResults] = useState([]);
    const [patSearching, setPatSearching] = useState(false);
    const [selectedPat, setSelectedPat] = useState(preselectedPatient || null);
    const [bookForm, setBookForm] = useState({ amount: '', serviceName: 'General Consultation', notes: '' });
    const [booking, setBooking] = useState(false);

    // Inline quick-register state
    const [showQuickReg, setShowQuickReg] = useState(false);
    const [qrForm, setQrForm] = useState({ name: '', phone: '', gender: 'Male' });
    const [qrSaving, setQrSaving] = useState(false);

    const flash = (type, text) => { setMsg({ type, text }); setTimeout(() => setMsg({ type: '', text: '' }), 4000); };

    // If preselected patient changes from parent, update local state
    useEffect(() => {
        if (preselectedPatient) {
            setSelectedPat(preselectedPatient);
            setTab('book');
        }
    }, [preselectedPatient]);

    const today = todayStr();

    const loadQueue = useCallback(() => {
        setLoading(true);
        clinicAPI.getAppointments(today)
            .then(r => { if (r.success) setAppointments(r.appointments); })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [today]);

    useEffect(() => { loadQueue(); }, [loadQueue]);

    const searchPatients = async () => {
        if (!patSearch.trim()) return;
        setPatSearching(true);
        clinicAPI.getPatients(patSearch)
            .then(r => { if (r.success) setPatResults(r.patients); })
            .finally(() => setPatSearching(false));
    };

    const handleBook = async (e) => {
        e.preventDefault();
        if (!selectedPat) { flash('error', 'Select a patient first'); return; }
        setBooking(true);
        try {
            const r = await clinicAPI.bookAppointment({
                patientId: selectedPat._id,   // ClinicPatient._id
                amount: Number(bookForm.amount) || 0,
                serviceName: bookForm.serviceName,
                notes: bookForm.notes,
            });
            if (r.success) {
                flash('success', `✅ Token #${r.appointment.tokenNumber} assigned to ${selectedPat.name}`);
                setSelectedPat(null); setPatSearch(''); setPatResults([]);
                setBookForm({ amount: '', serviceName: 'General Consultation', notes: '' });
                if (clearPreselected) clearPreselected();
                loadQueue();
                setTab('queue');
            } else flash('error', r.message);
        } catch (e) { flash('error', e.response?.data?.message || e.message); }
        finally { setBooking(false); }
    };

    const handleQuickRegister = async (e) => {
        e.preventDefault();
        setQrSaving(true);
        try {
            const r = await clinicAPI.registerPatient(qrForm);
            if (r.success) {
                setSelectedPat(r.patient);
                setShowQuickReg(false);
                setPatResults([]);
                setPatSearch('');
                setQrForm({ name: '', phone: '', gender: 'Male' });
                flash('success', `Patient ${r.existing ? 'found' : 'registered'}: ${r.patient.patientUid} — fill in the details and book.`);
            } else flash('error', r.message);
        } catch (e) { flash('error', e.response?.data?.message || e.message); }
        finally { setQrSaving(false); }
    };

    const cancelAppt = async (id) => {
        if (!window.confirm('Cancel this appointment?')) return;
        try {
            await clinicAPI.cancelAppointment(id);
            setAppointments(prev => prev.map(a => a._id === id ? { ...a, status: 'cancelled' } : a));
        } catch (e) { flash('error', e.message); }
    };

    const pending = appointments.filter(a => a.status === 'confirmed' || a.status === 'pending');
    const completed = appointments.filter(a => a.status === 'completed');
    const cancelled = appointments.filter(a => a.status === 'cancelled');

    return (
        <div>
            <div className="clinic-sub-tabs">
                {[
                    { id: 'queue', label: `📋 Today's Queue (${pending.length})` },
                    { id: 'book', label: '🎟️ Book Token' },
                    { id: 'history', label: `✅ Done (${completed.length})` },
                ].map(t => (
                    <button key={t.id} className={`clinic-sub-tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>{t.label}</button>
                ))}
            </div>

            {msg.text && <div className={`clinic-msg clinic-msg-${msg.type}`}>{msg.text}</div>}

            {/* TODAY'S QUEUE */}
            {tab === 'queue' && (
                <div className="clinic-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <h3 style={{ margin: 0 }}>📋 Today's Queue — {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })}</h3>
                        <button className="clinic-btn-secondary" style={{ fontSize: '12px' }} onClick={loadQueue}>↻ Refresh</button>
                    </div>
                    {loading ? <Spinner /> : pending.length === 0 ? (
                        <Empty text="No appointments in queue today. Book a token to get started." />
                    ) : (
                        <div className="clinic-token-queue">
                            {pending.map(a => (
                                <div key={a._id} className="clinic-token-card">
                                    <div className="token-number">#{a.tokenNumber || '—'}</div>
                                    <div className="token-info">
                                        <div style={{ fontWeight: 700, fontSize: '15px' }}>{a.clinicPatientId?.name || '—'}</div>
                                        <div style={{ fontSize: '12px', color: '#64748b' }}>
                                            {a.clinicPatientId?.patientUid || a.patientId} · {a.serviceName || 'General'} · {fmt(a.amount)}
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginLeft: 'auto' }}>
                                        <StatusBadge status={a.status} />
                                        <button className="clinic-btn-remove" onClick={() => cancelAppt(a._id)}>✕</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* BOOK TOKEN */}
            {tab === 'book' && (
                <div className="clinic-card">
                    <h3 style={{ marginBottom: '4px' }}>🎟️ Book Token Appointment</h3>
                    <p style={{ color: '#64748b', fontSize: '13px', margin: '0 0 20px' }}>Token number is auto-assigned for today's queue.</p>

                    {/* Step 1: Search patient */}
                    {!selectedPat ? (
                        <div>
                            <label className="clinic-form-group" style={{ marginBottom: '10px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                <span style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Search Patient *</span>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <input className="clinic-input" style={{ flex: 1 }} placeholder="Name, phone or patient ID..."
                                        value={patSearch} onChange={e => setPatSearch(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && searchPatients()} />
                                    <button className="clinic-btn-secondary" onClick={searchPatients} disabled={patSearching}>
                                        {patSearching ? '...' : '🔍 Find'}
                                    </button>
                                </div>
                            </label>
                            {patResults.length > 0 && (
                                <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                                    {patResults.map(p => (
                                        <div key={p._id} className="clinic-patient-select-row" onClick={() => setSelectedPat(p)}>
                                            <div className="clinic-avatar-sm">{p.name?.charAt(0)?.toUpperCase()}</div>
                                            <div style={{ flex: 1 }}>
                                                <strong>{p.name}</strong>
                                                <div style={{ fontSize: '12px', color: '#64748b' }}>{p.patientUid} · {p.phone}</div>
                                            </div>
                                            <div style={{ color: '#6366f1', fontSize: '13px', fontWeight: 600 }}>Select →</div>
                                        </div>
                                    ))}
                                </div>
                            )}
                            {patResults.length === 0 && patSearch && !patSearching && !showQuickReg && (
                                <div style={{ marginTop: '10px', padding: '12px 14px', background: '#fef9c3', border: '1px solid #fde047', borderRadius: '8px', fontSize: '13px' }}>
                                    No patient found for "<strong>{patSearch}</strong>".{' '}
                                    <button type="button" style={{ background: 'none', border: 'none', color: '#6366f1', fontWeight: 700, cursor: 'pointer', padding: 0, fontSize: '13px' }}
                                        onClick={() => { setShowQuickReg(true); setQrForm(f => ({ ...f, name: /^\d/.test(patSearch) ? '' : patSearch, phone: /^\d+$/.test(patSearch) ? patSearch : '' })); }}>
                                        + Register as new patient
                                    </button>
                                </div>
                            )}
                            {showQuickReg && (
                                <div style={{ marginTop: '12px', border: '1px solid #c7d2fe', borderRadius: '10px', padding: '14px 16px', background: '#fafbff' }}>
                                    <div style={{ fontWeight: 700, fontSize: '13px', marginBottom: '10px', color: '#6366f1' }}>Quick Register New Patient</div>
                                    <form onSubmit={handleQuickRegister} style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                                        <div style={{ flex: '2', minWidth: '140px' }}>
                                            <label style={{ fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '3px' }}>Full Name *</label>
                                            <input className="clinic-input" placeholder="Patient name" value={qrForm.name}
                                                onChange={e => setQrForm(f => ({ ...f, name: e.target.value }))} required />
                                        </div>
                                        <div style={{ flex: '1', minWidth: '130px' }}>
                                            <label style={{ fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '3px' }}>Phone * (10 digits)</label>
                                            <input className="clinic-input" type="tel" placeholder="10-digit number" maxLength={10}
                                                value={qrForm.phone}
                                                onChange={e => setQrForm(f => ({ ...f, phone: e.target.value.replace(/\D/g, '').slice(0, 10) }))}
                                                pattern="[0-9]{10}" required />
                                        </div>
                                        <div style={{ flex: '1', minWidth: '100px' }}>
                                            <label style={{ fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '3px' }}>Gender</label>
                                            <select className="clinic-input" value={qrForm.gender} onChange={e => setQrForm(f => ({ ...f, gender: e.target.value }))}>
                                                <option>Male</option><option>Female</option><option>Other</option>
                                            </select>
                                        </div>
                                        <div style={{ display: 'flex', gap: '6px' }}>
                                            <button type="submit" className="clinic-btn-primary" disabled={qrSaving} style={{ whiteSpace: 'nowrap' }}>
                                                {qrSaving ? '...' : '✅ Register & Select'}
                                            </button>
                                            <button type="button" className="clinic-btn-secondary" onClick={() => setShowQuickReg(false)}>Cancel</button>
                                        </div>
                                    </form>
                                </div>
                            )}
                        </div>
                    ) : (
                        <form onSubmit={handleBook}>
                            {/* Selected patient */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '12px 16px', marginBottom: '16px' }}>
                                <div className="clinic-avatar-sm" style={{ background: '#dcfce7', color: '#16a34a' }}>{selectedPat.name?.charAt(0)?.toUpperCase()}</div>
                                <div style={{ flex: 1 }}>
                                    <strong>{selectedPat.name}</strong>
                                    <div style={{ fontSize: '12px', color: '#64748b' }}>{selectedPat.patientUid} · {selectedPat.phone}</div>
                                </div>
                                <button type="button" className="clinic-btn-remove" onClick={() => { setSelectedPat(null); setPatResults([]); setPatSearch(''); if (clearPreselected) clearPreselected(); }}>✕ Change</button>
                            </div>
                            <div className="clinic-form-grid">
                                <div className="clinic-form-group">
                                    <label>Service</label>
                                    <input className="clinic-input" placeholder="e.g. General Consultation" value={bookForm.serviceName}
                                        onChange={e => setBookForm(f => ({ ...f, serviceName: e.target.value }))} />
                                </div>
                                <div className="clinic-form-group">
                                    <label>Consultation Fee (₹)</label>
                                    <input className="clinic-input" type="number" placeholder="0" value={bookForm.amount}
                                        onChange={e => setBookForm(f => ({ ...f, amount: e.target.value }))} />
                                </div>
                                <div className="clinic-form-group" style={{ gridColumn: '1/-1' }}>
                                    <label>Notes (optional)</label>
                                    <input className="clinic-input" placeholder="Complaint, reason for visit..." value={bookForm.notes}
                                        onChange={e => setBookForm(f => ({ ...f, notes: e.target.value }))} />
                                </div>
                                <div style={{ gridColumn: '1/-1' }}>
                                    <button type="submit" className="clinic-btn-primary" disabled={booking}>
                                        {booking ? 'Booking...' : '🎟️ Assign Token & Book'}
                                    </button>
                                </div>
                            </div>
                        </form>
                    )}
                </div>
            )}

            {/* DONE TODAY */}
            {tab === 'history' && (
                <div className="clinic-card">
                    <h3 style={{ marginBottom: '12px' }}>✅ Completed Today ({completed.length})</h3>
                    {completed.length === 0 ? <Empty text="No completed appointments yet today." /> : (
                        <table className="clinic-table">
                            <thead><tr><th>Token</th><th>Patient</th><th>Diagnosis</th><th>Fee</th><th>Payment</th></tr></thead>
                            <tbody>
                                {completed.map(a => (
                                    <tr key={a._id}>
                                        <td><strong style={{ color: '#6366f1' }}>#{a.tokenNumber}</strong></td>
                                        <td>
                                            <div style={{ fontWeight: 600 }}>{a.clinicPatientId?.name || '—'}</div>
                                            <div style={{ fontSize: '11px', color: '#94a3b8' }}>{a.clinicPatientId?.patientUid || a.patientId}</div>
                                        </td>
                                        <td style={{ fontSize: '12px', color: '#64748b' }}>{a.diagnosis || '—'}</td>
                                        <td>{fmt(a.amount)}</td>
                                        <td><PayBadge status={a.paymentStatus} /></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            )}
        </div>
    );
};

// ═══════════════════════════════════════════════════
// DOCTOR MODE
// ═══════════════════════════════════════════════════
const DoctorMode = () => {
    const [appointments, setAppointments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [consulting, setConsulting] = useState(null); // active appointment
    const [rx, setRx] = useState({ diagnosis: '', notes: '', labTests: '', medicines: [], amount: '', paymentStatus: 'pending' });
    const [medInput, setMedInput] = useState({ name: '', dosage: '', duration: '', instruction: '' });
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState({ type: '', text: '' });

    const flash = (type, text) => { setMsg({ type, text }); setTimeout(() => setMsg({ type: '', text: '' }), 4000); };

    const loadToday = () => {
        setLoading(true);
        clinicAPI.getAppointments(todayStr())
            .then(r => { if (r.success) setAppointments(r.appointments); })
            .catch(console.error)
            .finally(() => setLoading(false));
    };

    useEffect(() => { loadToday(); }, []);

    const openConsult = (appt) => {
        setConsulting(appt);
        setRx({
            diagnosis: appt.diagnosis || '',
            notes: appt.doctorNotes || '',
            labTests: (appt.labTests || []).join(', '),
            medicines: appt.pharmacy || [],
            amount: appt.amount || '',
            paymentStatus: appt.paymentStatus || 'pending',
        });
    };

    const addMed = () => {
        if (!medInput.name) return;
        setRx(r => ({ ...r, medicines: [...r.medicines, { ...medInput }] }));
        setMedInput({ name: '', dosage: '', duration: '', instruction: '' });
    };

    const saveConsult = async () => {
        setSaving(true);
        try {
            const labArr = rx.labTests.split(',').map(t => t.trim()).filter(Boolean);
            const r = await clinicAPI.completeAppointment(consulting._id, {
                diagnosis: rx.diagnosis,
                notes: rx.notes,
                medicines: rx.medicines,
                labTests: labArr,
                paymentStatus: rx.paymentStatus,
                amount: Number(rx.amount) || consulting.amount || 0,
            });
            if (r.success) {
                flash('success', 'Consultation saved. Prescription created.');
                setConsulting(null);
                loadToday();
            } else flash('error', r.message);
        } catch (e) { flash('error', e.response?.data?.message || e.message); }
        finally { setSaving(false); }
    };

    const pending = appointments.filter(a => a.status === 'confirmed' || a.status === 'pending');
    const done = appointments.filter(a => a.status === 'completed');

    if (consulting) return (
        <div>
            <button className="clinic-back-btn" onClick={() => setConsulting(null)}>← Back to Queue</button>
            {msg.text && <div className={`clinic-msg clinic-msg-${msg.type}`} style={{ marginTop: '10px' }}>{msg.text}</div>}
            <div className="clinic-card" style={{ marginTop: '12px' }}>
                {/* Patient header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid #f1f5f9' }}>
                    <div className="clinic-avatar-lg">{(consulting.clinicPatientId?.name || '?').charAt(0)}</div>
                    <div>
                        <h3 style={{ margin: 0 }}>{consulting.clinicPatientId?.name || 'Patient'}</h3>
                        <div style={{ fontSize: '13px', color: '#64748b' }}>
                            {consulting.clinicPatientId?.patientUid || consulting.patientId} · Token #{consulting.tokenNumber} · {consulting.serviceName || 'General'}
                            {consulting.clinicPatientId?.gender && ` · ${consulting.clinicPatientId.gender}`}
                        </div>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '4px', fontSize: '12px' }}>
                            {consulting.clinicPatientId?.bloodGroup && <span style={{ background: '#fee2e2', color: '#dc2626', padding: '1px 7px', borderRadius: '4px', fontWeight: 600 }}>🩸 {consulting.clinicPatientId.bloodGroup}</span>}
                            {consulting.clinicPatientId?.allergies && <span style={{ background: '#fef3c7', color: '#92400e', padding: '1px 7px', borderRadius: '4px' }}>⚠️ {consulting.clinicPatientId.allergies}</span>}
                        </div>
                        {consulting.notes && <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>Chief complaint: {consulting.notes}</div>}
                    </div>
                </div>

                <div className="clinic-form-grid">
                    <div className="clinic-form-group" style={{ gridColumn: '1/-1' }}>
                        <label>Diagnosis / Chief Complaint</label>
                        <textarea className="clinic-input" rows={2} value={rx.diagnosis}
                            onChange={e => setRx(r => ({ ...r, diagnosis: e.target.value }))}
                            placeholder="e.g. Viral fever, URTI..." />
                    </div>
                    <div className="clinic-form-group" style={{ gridColumn: '1/-1' }}>
                        <label>Doctor Notes / Advice</label>
                        <textarea className="clinic-input" rows={2} value={rx.notes}
                            onChange={e => setRx(r => ({ ...r, notes: e.target.value }))}
                            placeholder="Clinical observations, advice..." />
                    </div>
                    <div className="clinic-form-group" style={{ gridColumn: '1/-1' }}>
                        <label>Lab Tests (comma separated)</label>
                        <input className="clinic-input" value={rx.labTests}
                            onChange={e => setRx(r => ({ ...r, labTests: e.target.value }))}
                            placeholder="CBC, Blood Sugar, Urine Routine" />
                    </div>
                    <div className="clinic-form-group">
                        <label>Fee Charged (₹)</label>
                        <input className="clinic-input" type="number" value={rx.amount}
                            onChange={e => setRx(r => ({ ...r, amount: e.target.value }))} />
                    </div>
                    <div className="clinic-form-group">
                        <label>Payment</label>
                        <select className="clinic-input" value={rx.paymentStatus}
                            onChange={e => setRx(r => ({ ...r, paymentStatus: e.target.value }))}>
                            <option value="pending">Pending</option>
                            <option value="paid">Paid (Cash)</option>
                        </select>
                    </div>
                </div>

                {/* Medicines */}
                <div style={{ marginTop: '20px' }}>
                    <h4 style={{ marginBottom: '10px', color: '#1e293b' }}>💊 Prescription</h4>
                    <div className="clinic-form-grid" style={{ marginBottom: '8px' }}>
                        <input className="clinic-input" placeholder="Medicine name *" value={medInput.name} onChange={e => setMedInput(m => ({ ...m, name: e.target.value }))} />
                        <input className="clinic-input" placeholder="Dosage (e.g. 500mg)" value={medInput.dosage} onChange={e => setMedInput(m => ({ ...m, dosage: e.target.value }))} />
                        <input className="clinic-input" placeholder="Duration (e.g. 5 days)" value={medInput.duration} onChange={e => setMedInput(m => ({ ...m, duration: e.target.value }))} />
                        <input className="clinic-input" placeholder="When to take (e.g. After food)" value={medInput.instruction} onChange={e => setMedInput(m => ({ ...m, instruction: e.target.value }))} />
                    </div>
                    <button className="clinic-btn-secondary" onClick={addMed} style={{ marginBottom: '12px' }}>+ Add Medicine</button>

                    {rx.medicines.length > 0 && (
                        <table className="clinic-table">
                            <thead><tr><th>Medicine</th><th>Dosage</th><th>Duration</th><th>Instruction</th><th></th></tr></thead>
                            <tbody>
                                {rx.medicines.map((m, i) => (
                                    <tr key={i}>
                                        <td><strong>{m.name || m.medicineName}</strong></td>
                                        <td>{m.dosage || m.frequency}</td>
                                        <td>{m.duration}</td>
                                        <td style={{ color: '#64748b', fontSize: '12px' }}>{m.instruction}</td>
                                        <td><button className="clinic-btn-remove" onClick={() => setRx(r => ({ ...r, medicines: r.medicines.filter((_, idx) => idx !== i) }))}>✕</button></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                <button className="clinic-btn-primary" style={{ marginTop: '24px', width: '100%', padding: '12px' }} disabled={saving} onClick={saveConsult}>
                    {saving ? 'Saving...' : '✅ Complete Consultation & Save Prescription'}
                </button>
            </div>
        </div>
    );

    return (
        <div>
            {msg.text && <div className={`clinic-msg clinic-msg-${msg.type}`}>{msg.text}</div>}
            <div className="clinic-card" style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <div>
                        <h3 style={{ margin: 0 }}>🩺 Today's Patients — {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</h3>
                        <p style={{ color: '#64748b', fontSize: '13px', margin: '4px 0 0' }}>
                            {pending.length} waiting · {done.length} seen today
                        </p>
                    </div>
                    <button className="clinic-btn-secondary" style={{ fontSize: '12px' }} onClick={loadToday}>↻ Refresh</button>
                </div>

                {loading ? <Spinner /> : pending.length === 0 ? (
                    <Empty text="No patients in queue. Book tokens from Reception mode." />
                ) : (
                    <div className="clinic-token-queue">
                        {pending.map(a => (
                            <div key={a._id} className="clinic-token-card">
                                <div className="token-number">#{a.tokenNumber}</div>
                                <div className="token-info">
                                    <div style={{ fontWeight: 700, fontSize: '15px' }}>{a.clinicPatientId?.name || '—'}</div>
                                    <div style={{ fontSize: '12px', color: '#64748b' }}>
                                        {a.clinicPatientId?.patientUid || a.patientId} · {a.serviceName || 'General'} · {fmt(a.amount)}
                                        {a.notes && ` · "${a.notes}"`}
                                    </div>
                                </div>
                                <button className="clinic-btn-primary" style={{ marginLeft: 'auto', padding: '8px 18px' }} onClick={() => openConsult(a)}>
                                    Start →
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {done.length > 0 && (
                <div className="clinic-card">
                    <h3 style={{ marginBottom: '12px' }}>✅ Seen Today ({done.length})</h3>
                    <table className="clinic-table">
                        <thead><tr><th>Token</th><th>Patient</th><th>Diagnosis</th><th>Medicines</th><th>Fee</th></tr></thead>
                        <tbody>
                            {done.map(a => (
                                <tr key={a._id}>
                                    <td><strong style={{ color: '#6366f1' }}>#{a.tokenNumber}</strong></td>
                                    <td>
                                        <div style={{ fontWeight: 600 }}>{a.clinicPatientId?.name || '—'}</div>
                                        <div style={{ fontSize: '11px', color: '#94a3b8' }}>{a.clinicPatientId?.patientUid || a.patientId}</div>
                                    </td>
                                    <td style={{ fontSize: '12px', maxWidth: '140px' }}>{a.diagnosis || '—'}</td>
                                    <td style={{ fontSize: '11px', color: '#64748b' }}>
                                        {(a.pharmacy || []).map((m, i) => <div key={i}>{m.medicineName || m.name}</div>)}
                                    </td>
                                    <td>{fmt(a.amount)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

// ═══════════════════════════════════════════════════
// PHARMACY MODE
// ═══════════════════════════════════════════════════
const PharmacyMode = () => {
    const [tab, setTab] = useState('orders');
    const [orders, setOrders] = useState([]);
    const [inventory, setInventory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [addForm, setAddForm] = useState({ name: '', category: 'General', stock: '', unit: 'Tablets', sellingPrice: '', buyingPrice: '', expiryDate: '' });
    const [adding, setAdding] = useState(false);
    const [msg, setMsg] = useState({ type: '', text: '' });

    const flash = (type, text) => { setMsg({ type, text }); setTimeout(() => setMsg({ type: '', text: '' }), 3000); };

    const loadAll = () => {
        setLoading(true);
        Promise.all([clinicAPI.getPharmacyOrders(), clinicAPI.getInventory()])
            .then(([oR, iR]) => {
                if (oR.success) setOrders(oR.orders);
                if (iR.success) setInventory(iR.inventory);
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    };

    useEffect(() => { loadAll(); }, []);

    const dispense = async (id) => {
        try {
            await clinicAPI.dispenseOrder(id);
            setOrders(prev => prev.map(o => o._id === id ? { ...o, status: 'completed' } : o));
            flash('success', 'Order marked as dispensed.');
        } catch (e) { flash('error', e.message); }
    };

    const handleAdd = async (e) => {
        e.preventDefault(); setAdding(true);
        try {
            const r = await clinicAPI.addInventory(addForm);
            if (r.success) {
                setInventory(prev => [...prev, r.item]);
                setAddForm({ name: '', category: 'General', stock: '', unit: 'Tablets', sellingPrice: '', buyingPrice: '', expiryDate: '' });
                flash('success', 'Medicine added to inventory.');
            }
        } catch (e) { flash('error', e.response?.data?.message || e.message); }
        finally { setAdding(false); }
    };

    const pending = orders.filter(o => o.orderStatus !== 'Completed');

    return (
        <div>
            <div className="clinic-sub-tabs">
                {[
                    { id: 'orders', label: `📦 Pending Orders (${pending.length})` },
                    { id: 'inventory', label: `💊 Inventory (${inventory.length})` },
                    { id: 'add', label: '+ Add Medicine' },
                ].map(t => (
                    <button key={t.id} className={`clinic-sub-tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>{t.label}</button>
                ))}
            </div>
            {msg.text && <div className={`clinic-msg clinic-msg-${msg.type}`}>{msg.text}</div>}
            {loading ? <Spinner /> : (
                <>
                    {tab === 'orders' && (
                        <div className="clinic-card">
                            <h3 style={{ marginBottom: '16px' }}>📦 Prescription Orders to Dispense</h3>
                            {pending.length === 0 ? <Empty text="No pending pharmacy orders." /> : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    {pending.map(o => (
                                        <div key={o._id} style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px 18px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                                                <div>
                                                    <strong>{o.userId?.name || '—'}</strong>
                                                    <span style={{ marginLeft: '8px', fontSize: '12px', color: '#94a3b8' }}>{o.patientId}</span>
                                                </div>
                                                <span style={{ fontSize: '12px', color: '#94a3b8' }}>{fmtDate(o.createdAt)}</span>
                                            </div>
                                            <div style={{ marginBottom: '10px' }}>
                                                {(o.items || []).map((m, i) => (
                                                    <div key={i} style={{ fontSize: '13px', color: '#475569', padding: '2px 0' }}>
                                                        • <strong>{m.medicineName || m.name}</strong>{m.frequency ? ` — ${m.frequency}` : ''}{m.duration ? ` for ${m.duration}` : ''}
                                                    </div>
                                                ))}
                                            </div>
                                            <button className="clinic-btn-primary" style={{ fontSize: '13px', padding: '7px 16px' }} onClick={() => dispense(o._id)}>
                                                ✅ Mark Dispensed
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {tab === 'inventory' && (
                        <div className="clinic-card">
                            <h3 style={{ marginBottom: '16px' }}>💊 Medicine Inventory</h3>
                            {inventory.length === 0 ? <Empty text="No medicines added yet." /> : (
                                <table className="clinic-table">
                                    <thead><tr><th>Name</th><th>Category</th><th>Stock</th><th>Unit</th><th>Sell ₹</th><th>Buy ₹</th><th>Expiry</th></tr></thead>
                                    <tbody>
                                        {inventory.map(m => (
                                            <tr key={m._id}>
                                                <td><strong>{m.name}</strong></td>
                                                <td style={{ fontSize: '12px', color: '#64748b' }}>{m.category}</td>
                                                <td><span style={{ color: m.stock < 10 ? '#dc2626' : '#16a34a', fontWeight: 700 }}>{m.stock}</span></td>
                                                <td style={{ fontSize: '12px', color: '#64748b' }}>{m.unit}</td>
                                                <td>{fmt(m.sellingPrice)}</td>
                                                <td style={{ color: '#94a3b8' }}>{fmt(m.buyingPrice)}</td>
                                                <td style={{ fontSize: '12px', color: m.expiryDate && new Date(m.expiryDate) < new Date() ? '#dc2626' : '#64748b' }}>
                                                    {m.expiryDate ? new Date(m.expiryDate).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : '—'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    )}

                    {tab === 'add' && (
                        <div className="clinic-card">
                            <h3 style={{ marginBottom: '16px' }}>+ Add Medicine to Inventory</h3>
                            <form onSubmit={handleAdd} className="clinic-form-grid">
                                <div className="clinic-form-group">
                                    <label>Medicine Name *</label>
                                    <input className="clinic-input" placeholder="e.g. Paracetamol 500mg" value={addForm.name} onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))} required />
                                </div>
                                <div className="clinic-form-group">
                                    <label>Category</label>
                                    <select className="clinic-input" value={addForm.category} onChange={e => setAddForm(f => ({ ...f, category: e.target.value }))}>
                                        {['General','Antibiotic','Analgesic','Antacid','Vitamin','Antifungal','Antihistamine','Other'].map(c => <option key={c}>{c}</option>)}
                                    </select>
                                </div>
                                <div className="clinic-form-group">
                                    <label>Stock Quantity *</label>
                                    <input className="clinic-input" type="number" placeholder="e.g. 100" value={addForm.stock} onChange={e => setAddForm(f => ({ ...f, stock: e.target.value }))} required />
                                </div>
                                <div className="clinic-form-group">
                                    <label>Unit</label>
                                    <select className="clinic-input" value={addForm.unit} onChange={e => setAddForm(f => ({ ...f, unit: e.target.value }))}>
                                        {['Tablets','Capsules','Syrup (ml)','Injection','Cream/Ointment','Drops','Other'].map(u => <option key={u}>{u}</option>)}
                                    </select>
                                </div>
                                <div className="clinic-form-group">
                                    <label>Buying Price (₹)</label>
                                    <input className="clinic-input" type="number" placeholder="Cost price" value={addForm.buyingPrice} onChange={e => setAddForm(f => ({ ...f, buyingPrice: e.target.value }))} />
                                </div>
                                <div className="clinic-form-group">
                                    <label>Selling Price (₹)</label>
                                    <input className="clinic-input" type="number" placeholder="MRP" value={addForm.sellingPrice} onChange={e => setAddForm(f => ({ ...f, sellingPrice: e.target.value }))} />
                                </div>
                                <div className="clinic-form-group">
                                    <label>Expiry Date *</label>
                                    <input className="clinic-input" type="date" value={addForm.expiryDate} onChange={e => setAddForm(f => ({ ...f, expiryDate: e.target.value }))} required />
                                </div>
                                <div style={{ gridColumn: '1/-1' }}>
                                    <button type="submit" className="clinic-btn-primary" disabled={adding}>{adding ? 'Adding...' : '+ Add to Inventory'}</button>
                                </div>
                            </form>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

// ═══════════════════════════════════════════════════
// BILLING MODE
// ═══════════════════════════════════════════════════
const BillingMode = () => {
    const [appointments, setAppointments] = useState([]);
    const [allAppointments, setAllAppointments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState(null);
    const [paying, setPaying] = useState(null);
    const [patSearch, setPatSearch] = useState('');
    const [msg, setMsg] = useState({ type: '', text: '' });

    const flash = (type, text) => { setMsg({ type, text }); setTimeout(() => setMsg({ type: '', text: '' }), 3000); };

    useEffect(() => {
        Promise.all([
            clinicAPI.getAppointments(),
            clinicAPI.getStats(),
        ]).then(([apptR, statsR]) => {
            if (apptR.success) { setAllAppointments(apptR.appointments); setAppointments(apptR.appointments); }
            if (statsR.success) setStats(statsR.stats);
        }).catch(console.error).finally(() => setLoading(false));
    }, []);

    const filterByPatient = () => {
        if (!patSearch.trim()) { setAppointments(allAppointments); return; }
        const q = patSearch.trim().toLowerCase();
        setAppointments(allAppointments.filter(a =>
            (a.clinicPatientId?.name || '').toLowerCase().includes(q) ||
            (a.clinicPatientId?.patientUid || a.patientId || '').toLowerCase().includes(q)
        ));
    };

    const pay = async (id) => {
        setPaying(id);
        try {
            const r = await clinicAPI.payAppointment(id, 'Cash');
            if (r.success) {
                const update = a => a._id === id ? { ...a, paymentStatus: 'paid' } : a;
                setAppointments(prev => prev.map(update));
                setAllAppointments(prev => prev.map(update));
                flash('success', 'Payment recorded.');
            }
        } catch (e) { flash('error', e.message); }
        finally { setPaying(null); }
    };

    const pendingPayment = appointments.filter(a => a.paymentStatus !== 'paid' && a.status === 'completed');
    const paidToday = allAppointments.filter(a => a.paymentStatus === 'paid' && new Date(a.appointmentDate).toDateString() === new Date().toDateString());

    return (
        <div>
            {/* Revenue Strip */}
            {stats && (
                <div className="clinic-kpi-grid" style={{ marginBottom: '20px' }}>
                    {[
                        { label: 'Total Revenue', value: fmt(stats.totalRevenue), icon: '💰', color: '#f59e0b' },
                        { label: "Today's Revenue", value: fmt(stats.todayRevenue), icon: '📅', color: '#10b981' },
                        { label: 'This Month', value: fmt(stats.monthRevenue), icon: '📊', color: '#6366f1' },
                        { label: 'Pending Payments', value: pendingPayment.length, icon: '⏳', color: '#f97316' },
                    ].map((k, i) => (
                        <div key={i} className="clinic-kpi-card" style={{ borderTop: `4px solid ${k.color}` }}>
                            <div style={{ fontSize: '24px' }}>{k.icon}</div>
                            <div style={{ fontSize: '20px', fontWeight: 800, color: k.color }}>{k.value}</div>
                            <div style={{ fontSize: '12px', color: '#64748b' }}>{k.label}</div>
                        </div>
                    ))}
                </div>
            )}

            {msg.text && <div className={`clinic-msg clinic-msg-${msg.type}`}>{msg.text}</div>}

            <div className="clinic-card">
                <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                    <input className="clinic-input" style={{ flex: 1 }} placeholder="Filter by patient name or ID..."
                        value={patSearch} onChange={e => setPatSearch(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && filterByPatient()} />
                    <button className="clinic-btn-secondary" onClick={filterByPatient}>Filter</button>
                    {patSearch && <button className="clinic-btn-secondary" onClick={() => { setPatSearch(''); setAppointments(allAppointments); }}>Clear</button>}
                </div>

                {loading ? <Spinner /> : appointments.length === 0 ? (
                    <Empty text="No appointments found." />
                ) : (
                    <table className="clinic-table">
                        <thead><tr><th>Date</th><th>Token</th><th>Patient</th><th>Service</th><th>Fee</th><th>Status</th><th>Payment</th><th></th></tr></thead>
                        <tbody>
                            {appointments.map(a => (
                                <tr key={a._id}>
                                    <td style={{ fontSize: '12px' }}>{fmtDate(a.appointmentDate)}</td>
                                    <td><strong style={{ color: '#6366f1' }}>#{a.tokenNumber || '—'}</strong></td>
                                    <td>
                                        <div style={{ fontWeight: 600 }}>{a.clinicPatientId?.name || '—'}</div>
                                        <div style={{ fontSize: '11px', color: '#94a3b8' }}>{a.clinicPatientId?.patientUid || a.patientId}</div>
                                    </td>
                                    <td style={{ fontSize: '12px', color: '#64748b' }}>{a.serviceName || 'General'}</td>
                                    <td><strong>{fmt(a.amount)}</strong></td>
                                    <td><StatusBadge status={a.status} /></td>
                                    <td><PayBadge status={a.paymentStatus} /></td>
                                    <td>
                                        {a.paymentStatus !== 'paid' && a.status === 'completed' && (
                                            <button className="clinic-btn-primary" style={{ fontSize: '12px', padding: '5px 12px' }}
                                                disabled={paying === a._id} onClick={() => pay(a._id)}>
                                                {paying === a._id ? '...' : '💵 Collect'}
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────
// Small shared components
// ─────────────────────────────────────────────
const Spinner = ({ text = 'Loading...' }) => (
    <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8', fontSize: '14px' }}>{text}</div>
);

const Empty = ({ text }) => (
    <div style={{ textAlign: 'center', padding: '32px', color: '#94a3b8', fontSize: '14px' }}>{text}</div>
);

const StatusBadge = ({ status }) => {
    const map = {
        pending:   { bg: '#fef9c3', color: '#854d0e' },
        confirmed: { bg: '#dbeafe', color: '#1d4ed8' },
        completed: { bg: '#dcfce7', color: '#16a34a' },
        cancelled: { bg: '#fee2e2', color: '#dc2626' },
    };
    const s = map[status] || { bg: '#f1f5f9', color: '#64748b' };
    return <span style={{ ...s, padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>{status}</span>;
};

const PayBadge = ({ status }) => {
    const color = status === 'paid' ? '#16a34a' : status === 'refunded' ? '#0ea5e9' : '#dc2626';
    return <span style={{ color, fontWeight: 700, fontSize: '12px' }}>{status}</span>;
};

export default ClinicDashboard;
