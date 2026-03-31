import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    hospitalAPI, doctorAPI, receptionAPI,
    pharmacyAPI, pharmacyOrderAPI, financeAPI,
    billingAPI, patientAPI, adminAPI
} from '../../utils/api';
import './ClinicDashboard.css';

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
const fmt = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN') : '—';

// ─────────────────────────────────────────────
// ROLE MODES CONFIG
// ─────────────────────────────────────────────
const MODES = [
    { id: 'admin',     icon: '⚙️',  label: 'Admin',      color: '#6366f1', bg: '#eef2ff' },
    { id: 'doctor',    icon: '🩺',  label: 'Doctor',     color: '#0ea5e9', bg: '#f0f9ff' },
    { id: 'reception', icon: '📋',  label: 'Reception',  color: '#10b981', bg: '#f0fdf4' },
    { id: 'pharmacy',  icon: '💊',  label: 'Pharmacy',   color: '#f97316', bg: '#fff7ed' },
    { id: 'billing',   icon: '💰',  label: 'Billing',    color: '#f59e0b', bg: '#fffbeb' },
];

// ─────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────
const ClinicDashboard = () => {
    const navigate = useNavigate();
    const [mode, setMode] = useState('admin');
    const currentUser = JSON.parse(localStorage.getItem('user') || '{}');

    useEffect(() => {
        if (currentUser?.role !== 'hospitaladmin') navigate('/login');
    }, []);

    return (
        <div className="clinic-dashboard">
            {/* ── Role Switcher Bar ── */}
            <div className="clinic-role-switcher">
                <div className="switcher-label">Switch Mode:</div>
                {MODES.map(m => (
                    <button
                        key={m.id}
                        className={`switcher-btn ${mode === m.id ? 'active' : ''}`}
                        style={mode === m.id ? { background: m.color, color: '#fff', borderColor: m.color } : {}}
                        onClick={() => setMode(m.id)}
                    >
                        <span>{m.icon}</span> {m.label}
                    </button>
                ))}
                <div className="switcher-user">
                    <div className="switcher-avatar">{currentUser?.name?.charAt(0)?.toUpperCase()}</div>
                    <span>{currentUser?.name}</span>
                </div>
            </div>

            {/* ── Mode Content ── */}
            <div className="clinic-mode-content">
                {mode === 'admin'     && <AdminMode user={currentUser} />}
                {mode === 'doctor'    && <DoctorMode user={currentUser} />}
                {mode === 'reception' && <ReceptionMode user={currentUser} />}
                {mode === 'pharmacy'  && <PharmacyMode />}
                {mode === 'billing'   && <BillingMode />}
            </div>
        </div>
    );
};

// ═══════════════════════════════════════════════
// ADMIN MODE
// ═══════════════════════════════════════════════
const AdminMode = ({ user }) => {
    const [stats, setStats] = useState(null);
    const [staff, setStaff] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const load = async () => {
            try {
                const [hospitalRes, staffRes] = await Promise.all([
                    hospitalAPI.getMyHospital(),
                    adminAPI.getUsers(),
                ]);
                if (hospitalRes.success) {
                    const id = hospitalRes.hospital._id;
                    const statsRes = await hospitalAPI.getHospitalStats(id, '', '');
                    if (statsRes.success) setStats({ hospital: hospitalRes.hospital, ...statsRes });
                }
                if (staffRes.success) setStaff(staffRes.users || []);
            } catch (e) { console.error(e); }
            finally { setLoading(false); }
        };
        load();
    }, []);

    if (loading) return <div className="clinic-loading">Loading overview...</div>;

    const h = stats?.hospital;
    const s = stats?.stats;

    return (
        <div>
            {/* Clinic Info Banner */}
            {h && (
                <div className="clinic-banner">
                    <div className="clinic-banner-icon">🏪</div>
                    <div>
                        <h2 style={{ margin: 0 }}>{h.name}</h2>
                        <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '14px' }}>
                            {h.city}{h.state ? `, ${h.state}` : ''}{h.phone ? ` · 📞 ${h.phone}` : ''}
                            {h.email ? ` · ✉️ ${h.email}` : ''}
                        </p>
                    </div>
                    <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                        <div style={{ fontSize: '12px', color: '#94a3b8' }}>Login URL</div>
                        <div style={{ fontFamily: 'monospace', fontSize: '13px', color: '#6366f1' }}>
                            {h.slug ? `${window.location.host}/${h.slug}/login` : window.location.host + '/login'}
                        </div>
                    </div>
                </div>
            )}

            {/* KPI Cards */}
            {s && (
                <div className="clinic-kpi-grid">
                    {[
                        { label: 'Total Patients', value: s.totalPatients ?? '—', icon: '👤', color: '#0ea5e9' },
                        { label: 'Appointments', value: s.totalAppointments ?? '—', icon: '📅', color: '#8b5cf6' },
                        { label: 'Completed', value: s.completedAppointments ?? '—', icon: '✅', color: '#10b981' },
                        { label: 'Revenue', value: fmt(s.totalRevenue), icon: '💰', color: '#f59e0b' },
                    ].map((k, i) => (
                        <div key={i} className="clinic-kpi-card" style={{ borderTop: `4px solid ${k.color}` }}>
                            <div style={{ fontSize: '28px' }}>{k.icon}</div>
                            <div style={{ fontSize: '24px', fontWeight: 800, color: k.color }}>{k.value}</div>
                            <div style={{ fontSize: '12px', color: '#64748b' }}>{k.label}</div>
                        </div>
                    ))}
                </div>
            )}

            {/* Staff List */}
            <div className="clinic-card">
                <h3>👥 Staff ({staff.length}/4)</h3>
                {staff.length === 0 ? (
                    <p style={{ color: '#94a3b8', textAlign: 'center', padding: '20px 0' }}>No additional staff. You are the sole operator of this clinic.</p>
                ) : (
                    <table className="clinic-table">
                        <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Role</th><th>Since</th></tr></thead>
                        <tbody>
                            {staff.map(s => (
                                <tr key={s._id}>
                                    <td><strong>{s.name}</strong></td>
                                    <td>{s.email}</td>
                                    <td>{s.phone || '—'}</td>
                                    <td><span className="clinic-badge">{String(s.role).toUpperCase()}</span></td>
                                    <td style={{ color: '#94a3b8', fontSize: '12px' }}>{fmtDate(s.createdAt)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};

// ═══════════════════════════════════════════════
// DOCTOR MODE
// ═══════════════════════════════════════════════
const DoctorMode = ({ user }) => {
    const navigate = useNavigate();
    const [appointments, setAppointments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState(null);
    const [prescription, setPrescription] = useState({ diagnosis: '', notes: '', medicines: [], labTests: '' });
    const [saving, setSaving] = useState(false);
    const [medInput, setMedInput] = useState({ name: '', dosage: '', duration: '', instruction: '' });

    useEffect(() => {
        doctorAPI.getAllAppointments()
            .then(res => { if (res.success) setAppointments(res.appointments || []); })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    const openConsult = async (appt) => {
        setSelected(appt);
        setPrescription({ diagnosis: appt.diagnosis || '', notes: appt.doctorNotes || '', medicines: appt.pharmacy || [], labTests: (appt.labTests || []).join(', ') });
    };

    const addMedicine = () => {
        if (!medInput.name) return;
        setPrescription(p => ({ ...p, medicines: [...p.medicines, { ...medInput }] }));
        setMedInput({ name: '', dosage: '', duration: '', instruction: '' });
    };

    const removeMedicine = (i) => setPrescription(p => ({ ...p, medicines: p.medicines.filter((_, idx) => idx !== i) }));

    const saveConsult = async () => {
        if (!selected) return;
        setSaving(true);
        try {
            await doctorAPI.updateSession(selected._id, {
                diagnosis: prescription.diagnosis,
                doctorNotes: prescription.notes,
                pharmacy: JSON.stringify(prescription.medicines),
                labTests: JSON.stringify(prescription.labTests.split(',').map(t => t.trim()).filter(Boolean)),
                status: 'completed',
            });
            setAppointments(prev => prev.map(a => a._id === selected._id ? { ...a, status: 'completed' } : a));
            setSelected(null);
        } catch (e) { console.error(e); }
        finally { setSaving(false); }
    };

    const todayAppts = appointments.filter(a => {
        if (!a.appointmentDate) return false;
        const d = new Date(a.appointmentDate);
        const now = new Date();
        return d.toDateString() === now.toDateString();
    });
    const pendingAppts = todayAppts.filter(a => a.status !== 'completed' && a.status !== 'cancelled');
    const doneAppts = todayAppts.filter(a => a.status === 'completed');

    if (loading) return <div className="clinic-loading">Loading appointments...</div>;

    if (selected) return (
        <div className="clinic-card">
            <button className="clinic-back-btn" onClick={() => setSelected(null)}>← Back to Queue</button>
            <h2 style={{ margin: '12px 0 4px' }}>🩺 Consultation — Token #{selected.tokenNumber || '—'}</h2>
            <p style={{ color: '#64748b', marginBottom: '20px' }}>Patient: <strong>{selected.patientId}</strong> · {fmtDate(selected.appointmentDate)}</p>

            <div className="clinic-form-grid">
                <div className="clinic-form-group" style={{ gridColumn: '1/-1' }}>
                    <label>Diagnosis / Chief Complaint</label>
                    <textarea className="clinic-input" rows={2} value={prescription.diagnosis}
                        onChange={e => setPrescription(p => ({ ...p, diagnosis: e.target.value }))}
                        placeholder="e.g. Viral fever, Upper respiratory tract infection" />
                </div>
                <div className="clinic-form-group" style={{ gridColumn: '1/-1' }}>
                    <label>Doctor Notes</label>
                    <textarea className="clinic-input" rows={2} value={prescription.notes}
                        onChange={e => setPrescription(p => ({ ...p, notes: e.target.value }))}
                        placeholder="Clinical observations, advice given..." />
                </div>
                <div className="clinic-form-group" style={{ gridColumn: '1/-1' }}>
                    <label>Lab Tests (comma separated)</label>
                    <input className="clinic-input" value={prescription.labTests}
                        onChange={e => setPrescription(p => ({ ...p, labTests: e.target.value }))}
                        placeholder="CBC, Blood Sugar, Urine Routine" />
                </div>
            </div>

            {/* Medicines */}
            <div style={{ marginTop: '16px' }}>
                <h4 style={{ marginBottom: '10px' }}>💊 Medicines</h4>
                <div className="clinic-form-grid" style={{ marginBottom: '8px' }}>
                    <input className="clinic-input" placeholder="Medicine name" value={medInput.name} onChange={e => setMedInput(m => ({ ...m, name: e.target.value }))} />
                    <input className="clinic-input" placeholder="Dosage (e.g. 500mg)" value={medInput.dosage} onChange={e => setMedInput(m => ({ ...m, dosage: e.target.value }))} />
                    <input className="clinic-input" placeholder="Duration (e.g. 5 days)" value={medInput.duration} onChange={e => setMedInput(m => ({ ...m, duration: e.target.value }))} />
                    <input className="clinic-input" placeholder="Instruction (e.g. After food)" value={medInput.instruction} onChange={e => setMedInput(m => ({ ...m, instruction: e.target.value }))} />
                </div>
                <button className="clinic-btn-secondary" onClick={addMedicine}>+ Add Medicine</button>
                {prescription.medicines.length > 0 && (
                    <table className="clinic-table" style={{ marginTop: '10px' }}>
                        <thead><tr><th>Medicine</th><th>Dosage</th><th>Duration</th><th>Instruction</th><th></th></tr></thead>
                        <tbody>
                            {prescription.medicines.map((m, i) => (
                                <tr key={i}>
                                    <td><strong>{m.name || m.medicineName}</strong></td>
                                    <td>{m.dosage || m.frequency}</td>
                                    <td>{m.duration}</td>
                                    <td>{m.instruction}</td>
                                    <td><button className="clinic-btn-remove" onClick={() => removeMedicine(i)}>✕</button></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            <button className="clinic-btn-primary" style={{ marginTop: '20px' }} disabled={saving} onClick={saveConsult}>
                {saving ? 'Saving...' : '✅ Complete Consultation'}
            </button>
        </div>
    );

    return (
        <div>
            {/* Today's Queue */}
            <div className="clinic-card" style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <div>
                        <h3 style={{ margin: 0 }}>📋 Today's Token Queue</h3>
                        <p style={{ color: '#64748b', fontSize: '13px', margin: '4px 0 0' }}>
                            {pendingAppts.length} waiting · {doneAppts.length} completed
                        </p>
                    </div>
                </div>

                {pendingAppts.length === 0 ? (
                    <div className="clinic-empty">No pending appointments for today.</div>
                ) : (
                    <div className="clinic-token-queue">
                        {pendingAppts.map(a => (
                            <div key={a._id} className="clinic-token-card" onClick={() => openConsult(a)}>
                                <div className="token-number">#{a.tokenNumber || '—'}</div>
                                <div className="token-info">
                                    <div style={{ fontWeight: 700 }}>{a.patientId}</div>
                                    <div style={{ fontSize: '12px', color: '#64748b' }}>{a.serviceName || 'General'}</div>
                                </div>
                                <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
                                    <span className={`clinic-status clinic-status-${a.status}`}>{a.status}</span>
                                    <button className="clinic-btn-primary" style={{ padding: '6px 14px', fontSize: '13px' }}>
                                        Start
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Completed today */}
            {doneAppts.length > 0 && (
                <div className="clinic-card">
                    <h3 style={{ marginBottom: '12px' }}>✅ Completed Today ({doneAppts.length})</h3>
                    <table className="clinic-table">
                        <thead><tr><th>Token</th><th>Patient</th><th>Service</th><th>Amount</th><th>Payment</th></tr></thead>
                        <tbody>
                            {doneAppts.map(a => (
                                <tr key={a._id}>
                                    <td><strong>#{a.tokenNumber || '—'}</strong></td>
                                    <td>{a.patientId}</td>
                                    <td>{a.serviceName || 'General'}</td>
                                    <td>{fmt(a.amount)}</td>
                                    <td><span style={{ color: a.paymentStatus === 'paid' ? '#16a34a' : '#dc2626', fontWeight: 600, fontSize: '12px' }}>{a.paymentStatus}</span></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

// ═══════════════════════════════════════════════
// RECEPTION MODE
// ═══════════════════════════════════════════════
const ReceptionMode = ({ user }) => {
    const [tab, setTab] = useState('register'); // register | book | queue
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [searching, setSearching] = useState(false);
    const [registerForm, setRegisterForm] = useState({ name: '', phone: '', email: '', dob: '', gender: 'Male', address: '' });
    const [registering, setRegistering] = useState(false);
    const [regSuccess, setRegSuccess] = useState(null);
    const [bookForm, setBookForm] = useState({ patientId: '', serviceId: '', amount: '', notes: '' });
    const [booking, setBooking] = useState(false);
    const [bookSuccess, setBookSuccess] = useState(null);
    const [todayQueue, setTodayQueue] = useState([]);
    const [loadingQueue, setLoadingQueue] = useState(false);
    const [msg, setMsg] = useState({ type: '', text: '' });

    useEffect(() => {
        if (tab === 'queue') fetchQueue();
    }, [tab]);

    const fetchQueue = async () => {
        setLoadingQueue(true);
        try {
            const res = await receptionAPI.getAllAppointments();
            if (res.success) {
                const today = new Date().toDateString();
                setTodayQueue((res.appointments || []).filter(a => new Date(a.appointmentDate).toDateString() === today));
            }
        } catch (e) { console.error(e); }
        finally { setLoadingQueue(false); }
    };

    const handleSearch = async () => {
        if (!searchQuery.trim()) return;
        setSearching(true);
        try {
            const res = await patientAPI.search(searchQuery);
            if (res.success) setSearchResults(res.patients || []);
        } catch (e) { console.error(e); }
        finally { setSearching(false); }
    };

    const handleRegister = async (e) => {
        e.preventDefault();
        setRegistering(true);
        setMsg({ type: '', text: '' });
        try {
            const res = await receptionAPI.registerPatient(registerForm);
            if (res.success) {
                setRegSuccess(res.patient || res.user);
                setRegisterForm({ name: '', phone: '', email: '', dob: '', gender: 'Male', address: '' });
                setMsg({ type: 'success', text: `Patient registered! ID: ${res.patient?.patientId || res.user?.patientId}` });
            } else setMsg({ type: 'error', text: res.message });
        } catch (e) { setMsg({ type: 'error', text: e.response?.data?.message || e.message }); }
        finally { setRegistering(false); }
    };

    const handleBook = async (e) => {
        e.preventDefault();
        setBooking(true);
        setMsg({ type: '', text: '' });
        try {
            const hospitalUser = JSON.parse(localStorage.getItem('user') || '{}');
            const payload = {
                ...bookForm,
                hospitalId: hospitalUser.hospitalId,
                appointmentDate: new Date().toISOString(),
            };
            const res = await receptionAPI.bookAppointment(payload);
            if (res.success) {
                setBookSuccess(res.appointment);
                setMsg({ type: 'success', text: `Appointment booked! Token: #${res.appointment?.tokenNumber || '—'}` });
                setBookForm({ patientId: '', serviceId: '', amount: '', notes: '' });
            } else setMsg({ type: 'error', text: res.message });
        } catch (e) { setMsg({ type: 'error', text: e.response?.data?.message || e.message }); }
        finally { setBooking(false); }
    };

    return (
        <div>
            <div className="clinic-sub-tabs">
                {[{ id: 'register', label: '+ Register Patient' }, { id: 'book', label: '📅 Book Appointment' }, { id: 'queue', label: '📋 Today\'s Queue' }].map(t => (
                    <button key={t.id} className={`clinic-sub-tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>{t.label}</button>
                ))}
            </div>

            {msg.text && <div className={`clinic-msg clinic-msg-${msg.type}`}>{msg.text}</div>}

            {/* REGISTER PATIENT */}
            {tab === 'register' && (
                <div className="clinic-card">
                    <h3 style={{ marginBottom: '16px' }}>👤 Register New Patient</h3>
                    {/* Patient Search */}
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
                        <input className="clinic-input" style={{ flex: 1 }} placeholder="Search existing patients by name / phone / patientId..."
                            value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleSearch()} />
                        <button className="clinic-btn-secondary" onClick={handleSearch} disabled={searching}>
                            {searching ? 'Searching...' : '🔍 Search'}
                        </button>
                    </div>
                    {searchResults.length > 0 && (
                        <div style={{ marginBottom: '20px', background: '#f8fafc', borderRadius: '8px', padding: '12px' }}>
                            <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 8px' }}>Existing patients found:</p>
                            {searchResults.map(p => (
                                <div key={p._id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px', background: '#fff', borderRadius: '6px', marginBottom: '6px', border: '1px solid #e2e8f0' }}>
                                    <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#e0e7ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#6366f1' }}>{p.name?.charAt(0)}</div>
                                    <div>
                                        <div style={{ fontWeight: 600 }}>{p.name}</div>
                                        <div style={{ fontSize: '12px', color: '#64748b' }}>{p.patientId} · {p.phone}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    <form onSubmit={handleRegister} className="clinic-form-grid">
                        <div className="clinic-form-group">
                            <label>Full Name *</label>
                            <input className="clinic-input" placeholder="Patient's full name" value={registerForm.name} onChange={e => setRegisterForm(f => ({ ...f, name: e.target.value }))} required />
                        </div>
                        <div className="clinic-form-group">
                            <label>Phone *</label>
                            <input className="clinic-input" placeholder="Mobile number" value={registerForm.phone} onChange={e => setRegisterForm(f => ({ ...f, phone: e.target.value }))} required />
                        </div>
                        <div className="clinic-form-group">
                            <label>Email</label>
                            <input className="clinic-input" type="email" placeholder="Optional" value={registerForm.email} onChange={e => setRegisterForm(f => ({ ...f, email: e.target.value }))} />
                        </div>
                        <div className="clinic-form-group">
                            <label>Date of Birth</label>
                            <input className="clinic-input" type="date" value={registerForm.dob} onChange={e => setRegisterForm(f => ({ ...f, dob: e.target.value }))} />
                        </div>
                        <div className="clinic-form-group">
                            <label>Gender</label>
                            <select className="clinic-input" value={registerForm.gender} onChange={e => setRegisterForm(f => ({ ...f, gender: e.target.value }))}>
                                <option>Male</option><option>Female</option><option>Other</option>
                            </select>
                        </div>
                        <div className="clinic-form-group" style={{ gridColumn: '1/-1' }}>
                            <label>Address</label>
                            <input className="clinic-input" placeholder="Optional" value={registerForm.address} onChange={e => setRegisterForm(f => ({ ...f, address: e.target.value }))} />
                        </div>
                        <div style={{ gridColumn: '1/-1' }}>
                            <button type="submit" className="clinic-btn-primary" disabled={registering}>
                                {registering ? 'Registering...' : '✅ Register Patient'}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* BOOK APPOINTMENT (Token Mode) */}
            {tab === 'book' && (
                <div className="clinic-card">
                    <h3 style={{ marginBottom: '4px' }}>📅 Book Appointment (Token)</h3>
                    <p style={{ color: '#64748b', fontSize: '13px', margin: '0 0 20px' }}>Token number is auto-assigned. No time slot needed.</p>
                    <form onSubmit={handleBook} className="clinic-form-grid">
                        <div className="clinic-form-group" style={{ gridColumn: '1/-1' }}>
                            <label>Patient ID *</label>
                            <input className="clinic-input" placeholder="e.g. P-101 (register patient first)" value={bookForm.patientId}
                                onChange={e => setBookForm(f => ({ ...f, patientId: e.target.value }))} required />
                        </div>
                        <div className="clinic-form-group">
                            <label>Consultation Fee (₹)</label>
                            <input className="clinic-input" type="number" placeholder="Amount" value={bookForm.amount}
                                onChange={e => setBookForm(f => ({ ...f, amount: e.target.value }))} />
                        </div>
                        <div className="clinic-form-group">
                            <label>Notes</label>
                            <input className="clinic-input" placeholder="Optional notes" value={bookForm.notes}
                                onChange={e => setBookForm(f => ({ ...f, notes: e.target.value }))} />
                        </div>
                        <div style={{ gridColumn: '1/-1' }}>
                            <button type="submit" className="clinic-btn-primary" disabled={booking}>
                                {booking ? 'Booking...' : '🎟️ Book & Assign Token'}
                            </button>
                        </div>
                    </form>
                    {bookSuccess && (
                        <div className="clinic-success-banner">
                            ✅ Token <strong>#{bookSuccess.tokenNumber}</strong> assigned to patient <strong>{bookSuccess.patientId}</strong>
                        </div>
                    )}
                </div>
            )}

            {/* TODAY'S QUEUE */}
            {tab === 'queue' && (
                <div className="clinic-card">
                    <h3 style={{ marginBottom: '16px' }}>📋 Today's Queue ({todayQueue.length})</h3>
                    {loadingQueue ? <div className="clinic-loading">Loading...</div> : todayQueue.length === 0 ? (
                        <div className="clinic-empty">No appointments today yet.</div>
                    ) : (
                        <table className="clinic-table">
                            <thead><tr><th>Token</th><th>Patient</th><th>Status</th><th>Fee</th><th>Payment</th></tr></thead>
                            <tbody>
                                {todayQueue.sort((a, b) => (a.tokenNumber || 0) - (b.tokenNumber || 0)).map(a => (
                                    <tr key={a._id}>
                                        <td><strong style={{ color: '#6366f1' }}>#{a.tokenNumber || '—'}</strong></td>
                                        <td>{a.patientId}</td>
                                        <td><span className={`clinic-status clinic-status-${a.status}`}>{a.status}</span></td>
                                        <td>{fmt(a.amount)}</td>
                                        <td style={{ color: a.paymentStatus === 'paid' ? '#16a34a' : '#dc2626', fontWeight: 600, fontSize: '12px' }}>{a.paymentStatus}</td>
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

// ═══════════════════════════════════════════════
// PHARMACY MODE
// ═══════════════════════════════════════════════
const PharmacyMode = () => {
    const [tab, setTab] = useState('orders');
    const [orders, setOrders] = useState([]);
    const [inventory, setInventory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [addForm, setAddForm] = useState({ name: '', category: 'General', stock: '', unit: 'Tablets', sellingPrice: '', buyingPrice: '' });
    const [adding, setAdding] = useState(false);
    const [msg, setMsg] = useState('');

    useEffect(() => {
        Promise.all([pharmacyOrderAPI.getOrders(), pharmacyAPI.getInventory()])
            .then(([ordRes, invRes]) => {
                if (ordRes.success) setOrders(ordRes.orders || []);
                if (invRes.success) setInventory(invRes.medicines || invRes.inventory || []);
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    const completeOrder = async (id) => {
        try {
            await pharmacyOrderAPI.completeOrder(id);
            setOrders(prev => prev.map(o => o._id === id ? { ...o, status: 'completed' } : o));
        } catch (e) { console.error(e); }
    };

    const handleAddMedicine = async (e) => {
        e.preventDefault();
        setAdding(true);
        try {
            const res = await pharmacyAPI.addMedicine(addForm);
            if (res.success) {
                setInventory(prev => [...prev, res.medicine || res.item]);
                setAddForm({ name: '', category: 'General', stock: '', unit: 'Tablets', sellingPrice: '', buyingPrice: '' });
                setMsg('Medicine added to inventory.');
                setTimeout(() => setMsg(''), 3000);
            }
        } catch (e) { console.error(e); }
        finally { setAdding(false); }
    };

    const pendingOrders = orders.filter(o => o.status !== 'completed');

    if (loading) return <div className="clinic-loading">Loading pharmacy...</div>;

    return (
        <div>
            <div className="clinic-sub-tabs">
                {[{ id: 'orders', label: `📦 Pending Orders (${pendingOrders.length})` }, { id: 'inventory', label: '💊 Inventory' }, { id: 'add', label: '+ Add Medicine' }].map(t => (
                    <button key={t.id} className={`clinic-sub-tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>{t.label}</button>
                ))}
            </div>
            {msg && <div className="clinic-msg clinic-msg-success">{msg}</div>}

            {tab === 'orders' && (
                <div className="clinic-card">
                    <h3 style={{ marginBottom: '16px' }}>📦 Pharmacy Orders</h3>
                    {pendingOrders.length === 0 ? <div className="clinic-empty">No pending pharmacy orders.</div> : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {pendingOrders.map(o => (
                                <div key={o._id} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '14px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                        <span style={{ fontWeight: 700 }}>Patient: {o.patientId || '—'}</span>
                                        <span style={{ color: '#64748b', fontSize: '13px' }}>{fmtDate(o.createdAt)}</span>
                                    </div>
                                    <div style={{ marginBottom: '10px' }}>
                                        {(o.medicines || o.items || []).map((m, i) => (
                                            <div key={i} style={{ fontSize: '13px', color: '#475569' }}>• {m.medicineName || m.name} — {m.frequency || m.dosage} for {m.duration}</div>
                                        ))}
                                    </div>
                                    <button className="clinic-btn-primary" style={{ fontSize: '13px', padding: '6px 14px' }} onClick={() => completeOrder(o._id)}>
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
                    <h3 style={{ marginBottom: '16px' }}>💊 Medicine Inventory ({inventory.length})</h3>
                    {inventory.length === 0 ? <div className="clinic-empty">No medicines in inventory yet. Use "Add Medicine" tab.</div> : (
                        <table className="clinic-table">
                            <thead><tr><th>Name</th><th>Category</th><th>Stock</th><th>Unit</th><th>Sell Price</th></tr></thead>
                            <tbody>
                                {inventory.map(m => (
                                    <tr key={m._id}>
                                        <td><strong>{m.name}</strong>{m.salt ? <div style={{ fontSize: '11px', color: '#94a3b8' }}>{m.salt}</div> : null}</td>
                                        <td>{m.category}</td>
                                        <td style={{ color: m.stock < 10 ? '#dc2626' : '#16a34a', fontWeight: 600 }}>{m.stock}</td>
                                        <td>{m.unit}</td>
                                        <td>{fmt(m.sellingPrice)}</td>
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
                    <form onSubmit={handleAddMedicine} className="clinic-form-grid">
                        <div className="clinic-form-group">
                            <label>Medicine Name *</label>
                            <input className="clinic-input" placeholder="e.g. Paracetamol 500mg" value={addForm.name} onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))} required />
                        </div>
                        <div className="clinic-form-group">
                            <label>Category</label>
                            <select className="clinic-input" value={addForm.category} onChange={e => setAddForm(f => ({ ...f, category: e.target.value }))}>
                                {['General', 'Antibiotic', 'Analgesic', 'Antacid', 'Vitamin', 'Antifungal', 'Antihistamine', 'Other'].map(c => <option key={c}>{c}</option>)}
                            </select>
                        </div>
                        <div className="clinic-form-group">
                            <label>Stock Quantity *</label>
                            <input className="clinic-input" type="number" placeholder="e.g. 100" value={addForm.stock} onChange={e => setAddForm(f => ({ ...f, stock: e.target.value }))} required />
                        </div>
                        <div className="clinic-form-group">
                            <label>Unit</label>
                            <select className="clinic-input" value={addForm.unit} onChange={e => setAddForm(f => ({ ...f, unit: e.target.value }))}>
                                {['Tablets', 'Capsules', 'Syrup (ml)', 'Injection', 'Cream/Ointment', 'Drops', 'Other'].map(u => <option key={u}>{u}</option>)}
                            </select>
                        </div>
                        <div className="clinic-form-group">
                            <label>Buying Price (₹)</label>
                            <input className="clinic-input" type="number" placeholder="Cost price" value={addForm.buyingPrice} onChange={e => setAddForm(f => ({ ...f, buyingPrice: e.target.value }))} />
                        </div>
                        <div className="clinic-form-group">
                            <label>Selling Price (₹)</label>
                            <input className="clinic-input" type="number" placeholder="MRP / selling price" value={addForm.sellingPrice} onChange={e => setAddForm(f => ({ ...f, sellingPrice: e.target.value }))} />
                        </div>
                        <div style={{ gridColumn: '1/-1' }}>
                            <button type="submit" className="clinic-btn-primary" disabled={adding}>{adding ? 'Adding...' : '+ Add to Inventory'}</button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
};

// ═══════════════════════════════════════════════
// BILLING MODE
// ═══════════════════════════════════════════════
const BillingMode = () => {
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [searchId, setSearchId] = useState('');
    const [bills, setBills] = useState(null);
    const [searching, setSearching] = useState(false);
    const [payingId, setPayingId] = useState(null);

    useEffect(() => {
        financeAPI.getDashboardStats('', '')
            .then(res => { if (res.success) setStats(res); })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    const searchBills = async () => {
        if (!searchId.trim()) return;
        setSearching(true);
        try {
            const res = await billingAPI.getPatientBills(searchId);
            if (res.success) setBills(res);
            else setBills(null);
        } catch (e) { console.error(e); setBills(null); }
        finally { setSearching(false); }
    };

    const processPayment = async (appointmentId) => {
        setPayingId(appointmentId);
        try {
            await billingAPI.processPayment({ appointmentId, paymentMethod: 'Cash' });
            setBills(prev => prev ? { ...prev, appointments: prev.appointments?.map(a => a._id === appointmentId ? { ...a, paymentStatus: 'paid' } : a) } : prev);
        } catch (e) { console.error(e); }
        finally { setPayingId(null); }
    };

    if (loading) return <div className="clinic-loading">Loading billing...</div>;

    return (
        <div>
            {/* Revenue Summary */}
            {stats && (
                <div className="clinic-kpi-grid" style={{ marginBottom: '20px' }}>
                    {[
                        { label: 'Total Revenue', value: fmt(stats.stats?.totalRevenue), icon: '💰', color: '#f59e0b' },
                        { label: 'Today Revenue', value: fmt(stats.stats?.todayRevenue), icon: '📅', color: '#10b981' },
                        { label: 'Pending Payments', value: stats.stats?.pendingPayments ?? '—', icon: '⏳', color: '#f97316' },
                        { label: 'This Month', value: fmt(stats.stats?.monthRevenue), icon: '📊', color: '#8b5cf6' },
                    ].map((k, i) => (
                        <div key={i} className="clinic-kpi-card" style={{ borderTop: `4px solid ${k.color}` }}>
                            <div style={{ fontSize: '28px' }}>{k.icon}</div>
                            <div style={{ fontSize: '22px', fontWeight: 800, color: k.color }}>{k.value}</div>
                            <div style={{ fontSize: '12px', color: '#64748b' }}>{k.label}</div>
                        </div>
                    ))}
                </div>
            )}

            {/* Patient Bill Search */}
            <div className="clinic-card">
                <h3 style={{ marginBottom: '12px' }}>🔍 Search Patient Bills</h3>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                    <input className="clinic-input" style={{ flex: 1 }} placeholder="Enter Patient ID (e.g. P-101) or phone number"
                        value={searchId} onChange={e => setSearchId(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && searchBills()} />
                    <button className="clinic-btn-secondary" onClick={searchBills} disabled={searching}>
                        {searching ? 'Searching...' : '🔍 Search'}
                    </button>
                </div>

                {bills && (
                    <div>
                        {bills.patient && (
                            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', background: '#f8fafc', padding: '12px', borderRadius: '8px', marginBottom: '14px' }}>
                                <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#e0e7ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#6366f1' }}>{bills.patient.name?.charAt(0)}</div>
                                <div>
                                    <div style={{ fontWeight: 700 }}>{bills.patient.name}</div>
                                    <div style={{ fontSize: '13px', color: '#64748b' }}>{bills.patient.patientId} · {bills.patient.phone}</div>
                                </div>
                            </div>
                        )}
                        {(bills.appointments || []).length === 0 ? (
                            <p style={{ color: '#94a3b8', textAlign: 'center' }}>No bills found.</p>
                        ) : (
                            <table className="clinic-table">
                                <thead><tr><th>Date</th><th>Token</th><th>Service</th><th>Amount</th><th>Status</th><th>Action</th></tr></thead>
                                <tbody>
                                    {(bills.appointments || []).map(a => (
                                        <tr key={a._id}>
                                            <td>{fmtDate(a.appointmentDate)}</td>
                                            <td>#{a.tokenNumber || '—'}</td>
                                            <td>{a.serviceName || 'General'}</td>
                                            <td><strong>{fmt(a.amount)}</strong></td>
                                            <td><span style={{ color: a.paymentStatus === 'paid' ? '#16a34a' : '#dc2626', fontWeight: 600, fontSize: '12px' }}>{a.paymentStatus}</span></td>
                                            <td>
                                                {a.paymentStatus !== 'paid' && (
                                                    <button className="clinic-btn-primary" style={{ fontSize: '12px', padding: '4px 10px' }}
                                                        disabled={payingId === a._id} onClick={() => processPayment(a._id)}>
                                                        {payingId === a._id ? '...' : '💵 Pay'}
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default ClinicDashboard;
