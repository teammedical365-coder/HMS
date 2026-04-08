import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { clinicAPI } from '../../utils/api';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import './ClinicDashboard.css';

// ─── PDF HELPERS ──────────────────────────────────────────────────────────────
const getClinicInfo = () => {
    try {
        const h = JSON.parse(localStorage.getItem('hospitalContext') || 'null');
        const u = JSON.parse(localStorage.getItem('user') || '{}');
        return { hName: h?.name || u?.hospitalName || 'Clinic', hAddr: [h?.address, h?.city, h?.state].filter(Boolean).join(', '), hPhone: h?.phone || '', issuedBy: u?.name || 'Staff' };
    } catch { return { hName: 'Clinic', hAddr: '', hPhone: '', issuedBy: 'Staff' }; }
};

const pdfHeader = (doc, title, color = [41, 128, 185]) => {
    const { hName, hAddr, hPhone } = getClinicInfo();
    let y = 18;
    doc.setFontSize(18); doc.setFont('helvetica', 'bold'); doc.setTextColor(0);
    doc.text(hName, 105, y, { align: 'center' }); y += 7;
    if (hAddr) { doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(100); doc.text(hAddr, 105, y, { align: 'center' }); y += 5; }
    if (hPhone) { doc.text(`Ph: ${hPhone}`, 105, y, { align: 'center' }); y += 5; }
    doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.setTextColor(...color);
    doc.text(title, 105, y, { align: 'center' }); y += 5;
    doc.setDrawColor(...color); doc.setLineWidth(0.5); doc.line(14, y, 196, y); y += 8;
    doc.setTextColor(0); doc.setFont('helvetica', 'normal');
    return y;
};

const generateRegistrationSlipPDF = (patient) => {
    const doc = new jsPDF();
    let y = pdfHeader(doc, 'Patient Registration Slip', [16, 163, 74]);
    autoTable(doc, {
        startY: y,
        body: [
            ['Patient Name', patient.name || '-'],
            ['Patient ID', patient.patientUid || patient._id || 'N/A'],
            ['Phone', patient.phone || '-'],
            ['Gender', patient.gender || '-'],
            ['Date of Birth', patient.dob ? new Date(patient.dob).toLocaleDateString('en-IN') : '-'],
            ['Blood Group', patient.bloodGroup || '-'],
            ['Address', patient.address || '-'],
            ['Registered On', new Date().toLocaleString('en-IN')],
        ],
        theme: 'grid',
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 52 } },
        bodyStyles: { fontSize: 10 },
        alternateRowStyles: { fillColor: [245, 249, 255] },
    });
    y = doc.lastAutoTable.finalY + 8;
    const { issuedBy, hName } = getClinicInfo();
    doc.setFontSize(8); doc.setTextColor(120);
    doc.text(`Issued by: ${issuedBy}  |  Generated: ${new Date().toLocaleString('en-IN')}`, 105, y, { align: 'center' }); y += 5;
    doc.text(`Welcome to ${hName}`, 105, y, { align: 'center' });
    doc.save(`Registration_${patient.patientUid || patient._id}.pdf`);
};

const generateTokenReceiptPDF = (patient, appointment) => {
    const doc = new jsPDF();
    let y = pdfHeader(doc, 'Consultation Token Receipt', [41, 128, 185]);
    autoTable(doc, {
        startY: y,
        body: [
            ['Patient Name', patient.name || '-'],
            ['Patient ID', patient.patientUid || '-'],
            ['Phone', patient.phone || '-'],
            ['Token #', String(appointment.tokenNumber || '-')],
            ['Service', appointment.serviceName || 'General Consultation'],
            ['Date', new Date(appointment.appointmentDate || Date.now()).toLocaleDateString('en-IN')],
            ['Consultation Fee', `Rs. ${Number(appointment.amount || 0).toLocaleString('en-IN')}`],
            ['Payment Status', 'PAID \u2713'],
        ],
        theme: 'grid',
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 52 } },
        bodyStyles: { fontSize: 10 },
        alternateRowStyles: { fillColor: [245, 249, 255] },
    });
    y = doc.lastAutoTable.finalY + 8;
    const { issuedBy, hName } = getClinicInfo();
    doc.setFontSize(8); doc.setTextColor(120);
    doc.text(`Issued by: ${issuedBy}  |  ${new Date().toLocaleString('en-IN')}`, 105, y, { align: 'center' }); y += 5;
    doc.text(`Thank you for choosing ${hName}`, 105, y, { align: 'center' });
    doc.save(`Receipt_Token${appointment.tokenNumber}_${patient.patientUid || patient._id}.pdf`);
};

const generatePrescriptionSlipPDF = (consulting, rx) => {
    const pt = consulting.clinicPatientId || {};
    const doc = new jsPDF();
    let y = pdfHeader(doc, 'Prescription Slip', [76, 175, 80]);
    autoTable(doc, {
        startY: y,
        body: [
            ['Patient', pt.name || '-', 'ID', pt.patientUid || '-'],
            ['Gender', pt.gender || '-', 'Blood Grp', pt.bloodGroup || '-'],
            ['Token #', String(consulting.tokenNumber || '-'), 'Date', new Date().toLocaleDateString('en-IN')],
            ['Diagnosis', rx.diagnosis || '-', '', ''],
        ],
        theme: 'grid',
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 30 }, 2: { fontStyle: 'bold', cellWidth: 24 } },
        bodyStyles: { fontSize: 10 },
    });
    y = doc.lastAutoTable.finalY + 10;

    // Medicines
    doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(33, 37, 41);
    doc.text('Medicines Prescribed', 14, y); y += 6;
    if (rx.medicines.length > 0) {
        autoTable(doc, {
            startY: y,
            head: [['#', 'Medicine Name', 'Salt / Generic', 'Dose / Frequency', 'Days']],
            body: rx.medicines.map((m, i) => [i + 1, m.name || m.medicineName || '-', m.saltName || '-', m.dose || m.dosage || m.frequency || '-', m.days || m.duration || '-']),
            theme: 'striped',
            headStyles: { fillColor: [76, 175, 80], textColor: 255 },
            bodyStyles: { fontSize: 10 },
            columnStyles: { 0: { cellWidth: 10 }, 1: { cellWidth: 55 }, 2: { cellWidth: 50 }, 3: { cellWidth: 40 }, 4: { cellWidth: 20 } },
        });
        y = doc.lastAutoTable.finalY + 10;
    } else {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(100);
        doc.text('No medicines prescribed.', 16, y); y += 8;
    }

    // Lab Tests
    const labArr = typeof rx.labTests === 'string' ? rx.labTests.split(',').map(t => t.trim()).filter(Boolean) : (rx.labTests || []);
    doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(33, 37, 41);
    doc.text('Lab Tests Ordered', 14, y); y += 6;
    if (labArr.length > 0) {
        autoTable(doc, {
            startY: y,
            head: [['#', 'Test Name']],
            body: labArr.map((t, i) => [i + 1, t]),
            theme: 'striped',
            headStyles: { fillColor: [33, 150, 243], textColor: 255 },
            bodyStyles: { fontSize: 10 },
        });
        y = doc.lastAutoTable.finalY + 10;
    } else {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(100);
        doc.text('No lab tests ordered.', 16, y); y += 8;
    }

    // Notes
    if (rx.notes) {
        if (y > 250) { doc.addPage(); y = 20; }
        doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(33, 37, 41);
        doc.text('Doctor Notes', 14, y); y += 6;
        doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(60);
        const wrapped = doc.splitTextToSize(rx.notes, 170);
        doc.text(wrapped, 16, y); y += wrapped.length * 5 + 6;
    }

    if (y > 260) { doc.addPage(); y = 20; }
    doc.setDrawColor(200); doc.line(14, y, 196, y); y += 6;
    doc.setFontSize(9); doc.setTextColor(120);
    doc.text(`Generated: ${new Date().toLocaleString('en-IN')}`, 196, y, { align: 'right' });
    y += 5; doc.setFontSize(8);
    doc.text('This prescription is valid for 30 days from the date of issue.', 105, y, { align: 'center' });
    doc.save(`Prescription_${pt.patientUid || pt._id}_Token${consulting.tokenNumber}.pdf`);
};

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
    { id: 'plans',     icon: '📅', label: 'Treatment Plans', color: '#0891b2', bg: '#ecfeff' },
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
                {mode === 'plans'     && <TreatmentPlanMode />}
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
                try { generateRegistrationSlipPDF(r.patient); } catch (pdfErr) { console.error('PDF generation error:', pdfErr); }
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
// ── Inline token booking form ──────────────────────────────────────────────
const BookTokenForm = ({ patient, onBook, onCancel, flash }) => {
    const [form, setForm] = useState({ amount: '', serviceName: 'General Consultation', notes: '' });
    const [booking, setBooking] = useState(false);

    const submit = async (e) => {
        e.preventDefault();
        setBooking(true);
        try {
            const r = await clinicAPI.bookAppointment({
                patientId: patient._id,
                amount: Number(form.amount) || 0,
                serviceName: form.serviceName,
                notes: form.notes,
            });
            if (r.success) {
                flash('success', `✅ Token #${r.appointment.tokenNumber} assigned to ${patient.name}`);
                onBook();
                try { generateTokenReceiptPDF(patient, r.appointment); } catch (pdfErr) { console.error('PDF generation error:', pdfErr); }
            } else flash('error', r.message);
        } catch (e) { flash('error', e.response?.data?.message || e.message); }
        finally { setBooking(false); }
    };

    return (
        <form onSubmit={submit} style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '14px 16px', marginTop: '8px' }}>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div style={{ flex: '2', minWidth: '150px' }}>
                    <label style={{ fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '3px' }}>Service</label>
                    <input className="clinic-input" placeholder="General Consultation" value={form.serviceName}
                        onChange={e => setForm(f => ({ ...f, serviceName: e.target.value }))} />
                </div>
                <div style={{ flex: '1', minWidth: '100px' }}>
                    <label style={{ fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '3px' }}>Fee (₹)</label>
                    <input className="clinic-input" type="number" placeholder="0" value={form.amount}
                        onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
                </div>
                <div style={{ flex: '2', minWidth: '150px' }}>
                    <label style={{ fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '3px' }}>Complaint (optional)</label>
                    <input className="clinic-input" placeholder="Reason for visit..." value={form.notes}
                        onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                    <button type="submit" className="clinic-btn-primary" disabled={booking} style={{ whiteSpace: 'nowrap', padding: '8px 16px' }}>
                        {booking ? '...' : '🎟️ Assign Token & Receipt'}
                    </button>
                    <button type="button" className="clinic-btn-secondary" onClick={onCancel} style={{ padding: '8px 12px' }}>✕</button>
                </div>
            </div>
        </form>
    );
};

const ReceptionMode = ({ preselectedPatient, clearPreselected }) => {
    const [appointments, setAppointments] = useState([]);
    const [patients, setPatients] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [searching, setSearching] = useState(false);
    const [assigningFor, setAssigningFor] = useState(preselectedPatient?._id || null);
    const [msg, setMsg] = useState({ type: '', text: '' });
    // Quick register state
    const [showQuickReg, setShowQuickReg] = useState(false);
    const [qrForm, setQrForm] = useState({ name: '', phone: '', gender: 'Male' });
    const [qrSaving, setQrSaving] = useState(false);

    const flash = (type, text) => { setMsg({ type, text }); setTimeout(() => setMsg({ type: '', text: '' }), 4000); };
    const today = todayStr();

    const loadAll = useCallback(() => {
        setLoading(true);
        Promise.all([
            clinicAPI.getPatients(search),
            clinicAPI.getAppointments(today),
        ]).then(([pr, ar]) => {
            if (pr.success) setPatients(pr.patients);
            if (ar.success) setAppointments(ar.appointments);
        }).catch(console.error).finally(() => setLoading(false));
    }, [today]); // eslint-disable-line

    useEffect(() => { loadAll(); }, [loadAll]);

    useEffect(() => {
        if (preselectedPatient) setAssigningFor(preselectedPatient._id);
    }, [preselectedPatient]);

    const handleSearch = () => {
        setSearching(true);
        clinicAPI.getPatients(search)
            .then(r => { if (r.success) setPatients(r.patients); })
            .finally(() => setSearching(false));
    };

    const handleQuickRegister = async (e) => {
        e.preventDefault();
        setQrSaving(true);
        try {
            const r = await clinicAPI.registerPatient(qrForm);
            if (r.success) {
                setPatients(prev => r.existing ? prev : [r.patient, ...prev]);
                setAssigningFor(r.patient._id);
                setShowQuickReg(false);
                setQrForm({ name: '', phone: '', gender: 'Male' });
                if (clearPreselected) clearPreselected();
                flash('success', `${r.existing ? 'Found' : 'Registered'}: ${r.patient.patientUid} — assign a token below.`);
            } else flash('error', r.message);
        } catch (e) { flash('error', e.response?.data?.message || e.message); }
        finally { setQrSaving(false); }
    };

    const cancelAppt = async (id) => {
        if (!window.confirm('Cancel this token?')) return;
        try {
            await clinicAPI.cancelAppointment(id);
            setAppointments(prev => prev.map(a => a._id === id ? { ...a, status: 'cancelled' } : a));
        } catch (e) { flash('error', e.message); }
    };

    // Map clinicPatientId._id → today's appointment (any status)
    const todayApptMap = {};
    appointments.forEach(a => {
        const pid = a.clinicPatientId?._id || a.clinicPatientId;
        if (pid) todayApptMap[pid.toString()] = a;
    });

    const activeTokens  = appointments.filter(a => a.status === 'confirmed' || a.status === 'pending');
    const doneToday     = appointments.filter(a => a.status === 'completed');

    // Merge: patients with today's token shown first
    const withToken    = patients.filter(p => todayApptMap[p._id] && ['confirmed','pending'].includes(todayApptMap[p._id]?.status));
    const withoutToken = patients.filter(p => !todayApptMap[p._id] || todayApptMap[p._id]?.status === 'cancelled');
    const displayList  = [...withToken, ...withoutToken];

    return (
        <div>
            {msg.text && <div className={`clinic-msg clinic-msg-${msg.type}`}>{msg.text}</div>}

            {/* ── Header + search ── */}
            <div className="clinic-card" style={{ marginBottom: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <div>
                        <h3 style={{ margin: 0 }}>📋 Reception — {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })}</h3>
                        <p style={{ color: '#64748b', fontSize: '12px', margin: '3px 0 0' }}>
                            {activeTokens.length} in queue · {doneToday.length} done today · {patients.length} total patients
                        </p>
                    </div>
                    <button className="clinic-btn-secondary" style={{ fontSize: '12px' }} onClick={loadAll}>↻ Refresh</button>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <input className="clinic-input" style={{ flex: 1 }} placeholder="Search patient by name, phone or ID..."
                        value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSearch()} />
                    <button className="clinic-btn-secondary" onClick={handleSearch} disabled={searching}>{searching ? '...' : '🔍'}</button>
                    <button className="clinic-btn-primary" onClick={() => { setShowQuickReg(!showQuickReg); }}
                        style={{ whiteSpace: 'nowrap', padding: '8px 14px', fontSize: '13px' }}>
                        + New Patient
                    </button>
                </div>

                {/* Quick register inline */}
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
                                <label style={{ fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '3px' }}>Phone (10 digits) *</label>
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
                                    {qrSaving ? '...' : '✅ Register & Assign Token'}
                                </button>
                                <button type="button" className="clinic-btn-secondary" onClick={() => setShowQuickReg(false)}>Cancel</button>
                            </div>
                        </form>
                    </div>
                )}
            </div>

            {/* ── Patient list with inline token assignment ── */}
            {loading ? <Spinner /> : displayList.length === 0 ? (
                <Empty text="No patients found. Register your first patient." />
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {displayList.map(p => {
                        const appt = todayApptMap[p._id];
                        const hasToken = appt && (appt.status === 'confirmed' || appt.status === 'pending');
                        const isDone   = appt && appt.status === 'completed';
                        const isExpanding = assigningFor === p._id;

                        return (
                            <div key={p._id} style={{
                                border: hasToken ? '1px solid #bbf7d0' : '1px solid #e2e8f0',
                                borderRadius: '10px',
                                padding: '12px 16px',
                                background: hasToken ? '#f0fdf4' : isDone ? '#f8fafc' : '#fff',
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <div className="clinic-avatar-sm" style={{ flexShrink: 0 }}>{p.name?.charAt(0)?.toUpperCase()}</div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontWeight: 700, fontSize: '14px' }}>{p.name}</div>
                                        <div style={{ fontSize: '12px', color: '#64748b' }}>
                                            <span style={{ background: '#eef2ff', color: '#6366f1', padding: '1px 6px', borderRadius: '4px', fontWeight: 700, fontSize: '11px', marginRight: '6px' }}>{p.patientUid}</span>
                                            {p.phone}
                                            {p.gender && ` · ${p.gender}`}
                                            {p.bloodGroup && <span style={{ marginLeft: '6px', background: '#fee2e2', color: '#dc2626', padding: '1px 5px', borderRadius: '3px', fontSize: '11px', fontWeight: 600 }}>🩸 {p.bloodGroup}</span>}
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
                                        {hasToken && (
                                            <>
                                                <span style={{ background: '#6366f1', color: '#fff', fontWeight: 800, padding: '4px 12px', borderRadius: '6px', fontSize: '14px' }}>
                                                    #{appt.tokenNumber}
                                                </span>
                                                <StatusBadge status={appt.status} />
                                                <button className="clinic-btn-remove" onClick={() => cancelAppt(appt._id)}>✕</button>
                                            </>
                                        )}
                                        {isDone && <span style={{ background: '#dcfce7', color: '#16a34a', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 600 }}>✅ Done</span>}
                                        {!hasToken && !isDone && (
                                            <button className="clinic-btn-primary" style={{ fontSize: '12px', padding: '6px 14px', whiteSpace: 'nowrap' }}
                                                onClick={() => setAssigningFor(isExpanding ? null : p._id)}>
                                                {isExpanding ? '✕ Cancel' : '🎟️ Assign Token'}
                                            </button>
                                        )}
                                    </div>
                                </div>
                                {isExpanding && !hasToken && (
                                    <BookTokenForm
                                        patient={p}
                                        flash={flash}
                                        onBook={() => { setAssigningFor(null); if (clearPreselected) clearPreselected(); loadAll(); }}
                                        onCancel={() => { setAssigningFor(null); if (clearPreselected) clearPreselected(); }}
                                    />
                                )}
                            </div>
                        );
                    })}
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
    const [consulting, setConsulting] = useState(null);
    const [rx, setRx] = useState({ diagnosis: '', notes: '', labTests: '', medicines: [] });
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState({ type: '', text: '' });
    const [inventory, setInventory] = useState([]);
    const [analytics, setAnalytics] = useState(null);
    const [patientHistory, setPatientHistory] = useState([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [showHistory, setShowHistory] = useState(false);

    const flash = (type, text) => { setMsg({ type, text }); setTimeout(() => setMsg({ type: '', text: '' }), 4000); };

    const loadToday = () => {
        setLoading(true);
        clinicAPI.getAppointments(todayStr())
            .then(r => { if (r.success) setAppointments(r.appointments); })
            .catch(console.error)
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        loadToday();
        clinicAPI.getInventory().then(r => { if (r.success) setInventory(r.inventory || []); }).catch(() => {});
        clinicAPI.getStats().then(r => { if (r.success) setAnalytics(r.stats); }).catch(() => {});
    }, []);

    const openConsult = (appt) => {
        setConsulting(appt);
        setShowHistory(false);
        setPatientHistory([]);
        setRx({
            diagnosis: appt.diagnosis || '',
            notes: appt.doctorNotes || '',
            labTests: (appt.labTests || []).join(', '),
            medicines: appt.pharmacy || [],
        });
        if (appt.clinicPatientId?._id) {
            setHistoryLoading(true);
            clinicAPI.getPatientHistory(appt.clinicPatientId._id)
                .then(r => { if (r.success) setPatientHistory(r.appointments || []); })
                .catch(() => {})
                .finally(() => setHistoryLoading(false));
        }
    };


    const saveConsult = async () => {
        setSaving(true);
        try {
            const labArr = rx.labTests.split(',').map(t => t.trim()).filter(Boolean);
            const r = await clinicAPI.completeAppointment(consulting._id, {
                diagnosis: rx.diagnosis,
                notes: rx.notes,
                medicines: rx.medicines.filter(m => (m.name || m.medicineName)?.trim()).map(m => ({
                    name: (m.name || m.medicineName || '').trim(),
                    saltName: (m.saltName || '').trim(),
                    dose: (m.dose || m.dosage || '').trim(),
                    days: (m.days || m.duration || '').trim(),
                    medicineName: (m.name || m.medicineName || '').trim(),
                    frequency: (m.dose || m.dosage || '').trim(),
                    duration: (m.days || m.duration || '').trim(),
                })),
                labTests: labArr,
            });
            if (r.success) {
                flash('success', 'Consultation saved. Prescription generated.');
                setConsulting(null);
                loadToday();
                try { generatePrescriptionSlipPDF(consulting, rx); } catch (pdfErr) { console.error('PDF generation error:', pdfErr); }
            } else flash('error', r.message);
        } catch (e) { flash('error', e.response?.data?.message || e.message); }
        finally { setSaving(false); }
    };

    const pending = appointments.filter(a => a.status === 'confirmed' || a.status === 'pending');
    const done = appointments.filter(a => a.status === 'completed');
    const pastVisits = patientHistory.filter(h => h._id !== consulting?._id && h.status === 'completed');

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

                {/* Past Visits */}
                {historyLoading ? (
                    <div style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '16px' }}>Loading visit history...</div>
                ) : pastVisits.length > 0 && (
                    <div style={{ marginBottom: '20px', border: '1px solid #e0e7ff', borderRadius: '10px', overflow: 'hidden' }}>
                        <button
                            onClick={() => setShowHistory(h => !h)}
                            style={{ width: '100%', background: '#eef2ff', border: 'none', padding: '10px 16px', textAlign: 'left', cursor: 'pointer', fontWeight: 600, fontSize: '13px', color: '#4338ca', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span>📋 Past Visits ({pastVisits.length})</span>
                            <span>{showHistory ? '▲' : '▼'}</span>
                        </button>
                        {showHistory && (
                            <div style={{ background: '#f8faff', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {pastVisits.map(v => (
                                    <div key={v._id} style={{ borderLeft: '3px solid #a5b4fc', paddingLeft: '12px' }}>
                                        <div style={{ fontSize: '12px', fontWeight: 700, color: '#6366f1' }}>{fmtDate(v.appointmentDate || v.createdAt)}</div>
                                        {v.diagnosis && <div style={{ fontSize: '13px', color: '#1e293b', marginTop: '2px' }}><strong>Dx:</strong> {v.diagnosis}</div>}
                                        {v.doctorNotes && <div style={{ fontSize: '12px', color: '#475569' }}><strong>Notes:</strong> {v.doctorNotes}</div>}
                                        {(v.pharmacy || []).length > 0 && (
                                            <div style={{ fontSize: '12px', color: '#475569', marginTop: '4px' }}>
                                                <strong>Rx:</strong> {v.pharmacy.map(m => m.medicineName || m.name).join(', ')}
                                            </div>
                                        )}
                                        {(v.labTests || []).length > 0 && (
                                            <div style={{ fontSize: '12px', color: '#475569' }}><strong>Labs:</strong> {v.labTests.join(', ')}</div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

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
                </div>

                {/* Prescription — inline Excel-like table */}
                <div style={{ marginTop: '20px' }}>
                    <h4 style={{ marginBottom: '10px', color: '#1e293b' }}>💊 Prescription</h4>

                    {/* Quick-add from inventory */}
                    {inventory.length > 0 && (
                        <div style={{ marginBottom: '10px' }}>
                            <div style={{ fontSize: '12px', fontWeight: '700', color: '#64748b', marginBottom: '5px' }}>Quick-add from inventory:</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                {inventory.map(inv => {
                                    const isAdded = rx.medicines.some(m => (m.name || m.medicineName) === inv.name);
                                    return (
                                        <button
                                            key={inv._id}
                                            type="button"
                                            onClick={() => {
                                                if (isAdded) {
                                                    setRx(r => ({ ...r, medicines: r.medicines.filter(m => (m.name || m.medicineName) !== inv.name) }));
                                                } else {
                                                    setRx(r => ({ ...r, medicines: [...r.medicines, { name: inv.name, saltName: inv.genericName || '', dose: '1 OD', days: '5' }] }));
                                                }
                                            }}
                                            style={{ padding: '4px 10px', fontSize: '12px', border: `1px solid ${isAdded ? '#3b82f6' : '#e2e8f0'}`, borderRadius: '20px', background: isAdded ? '#eff6ff' : '#f8fafc', color: isAdded ? '#1d4ed8' : '#475569', cursor: 'pointer', fontWeight: isAdded ? '700' : '400' }}
                                        >
                                            {isAdded ? '✓ ' : '+ '}{inv.name}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Inline table */}
                    <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                            <thead>
                                <tr style={{ background: '#f1f5f9' }}>
                                    <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: '700', color: '#374151', borderBottom: '1px solid #e2e8f0', width: '30%' }}>Medicine Name</th>
                                    <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: '700', color: '#374151', borderBottom: '1px solid #e2e8f0', width: '25%' }}>Salt / Generic Name</th>
                                    <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: '700', color: '#374151', borderBottom: '1px solid #e2e8f0', width: '25%' }}>Dose / Frequency</th>
                                    <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: '700', color: '#374151', borderBottom: '1px solid #e2e8f0', width: '12%' }}>Days</th>
                                    <th style={{ padding: '8px 10px', textAlign: 'center', fontWeight: '700', color: '#374151', borderBottom: '1px solid #e2e8f0', width: '8%' }}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {rx.medicines.map((m, idx) => (
                                    <tr key={idx} style={{ background: idx % 2 === 0 ? '#fff' : '#f8fafc' }}>
                                        <td style={{ padding: '6px 8px', borderBottom: '1px solid #f1f5f9' }}>
                                            <input
                                                list="inv-meds-list"
                                                value={m.name || m.medicineName || ''}
                                                onChange={e => setRx(r => { const ms = [...r.medicines]; ms[idx] = { ...ms[idx], name: e.target.value }; return { ...r, medicines: ms }; })}
                                                placeholder="e.g. Tab. Paracetamol 500mg"
                                                style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: '5px', padding: '5px 7px', fontSize: '12px', boxSizing: 'border-box' }}
                                            />
                                        </td>
                                        <td style={{ padding: '6px 8px', borderBottom: '1px solid #f1f5f9' }}>
                                            <input
                                                value={m.saltName || ''}
                                                onChange={e => setRx(r => { const ms = [...r.medicines]; ms[idx] = { ...ms[idx], saltName: e.target.value }; return { ...r, medicines: ms }; })}
                                                placeholder="e.g. Paracetamol"
                                                style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: '5px', padding: '5px 7px', fontSize: '12px', boxSizing: 'border-box' }}
                                            />
                                        </td>
                                        <td style={{ padding: '6px 8px', borderBottom: '1px solid #f1f5f9' }}>
                                            <input
                                                value={m.dose || m.dosage || ''}
                                                onChange={e => setRx(r => { const ms = [...r.medicines]; ms[idx] = { ...ms[idx], dose: e.target.value }; return { ...r, medicines: ms }; })}
                                                placeholder="e.g. 1 OD / 1 BD"
                                                style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: '5px', padding: '5px 7px', fontSize: '12px', boxSizing: 'border-box' }}
                                            />
                                        </td>
                                        <td style={{ padding: '6px 8px', borderBottom: '1px solid #f1f5f9' }}>
                                            <input
                                                value={m.days || m.duration || ''}
                                                onChange={e => setRx(r => { const ms = [...r.medicines]; ms[idx] = { ...ms[idx], days: e.target.value }; return { ...r, medicines: ms }; })}
                                                placeholder="e.g. 5"
                                                style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: '5px', padding: '5px 7px', fontSize: '12px', boxSizing: 'border-box' }}
                                            />
                                        </td>
                                        <td style={{ padding: '6px 8px', textAlign: 'center', borderBottom: '1px solid #f1f5f9' }}>
                                            <button
                                                type="button"
                                                onClick={() => setRx(r => ({ ...r, medicines: r.medicines.filter((_, i) => i !== idx) }))}
                                                style={{ background: '#fee2e2', border: 'none', borderRadius: '4px', color: '#dc2626', width: '24px', height: '24px', cursor: 'pointer', fontSize: '14px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                                            >×</button>
                                        </td>
                                    </tr>
                                ))}
                                {rx.medicines.length === 0 && (
                                    <tr>
                                        <td colSpan={5} style={{ padding: '16px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
                                            No medicines added. Use quick-add above or click "+ Add Row".
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    <datalist id="inv-meds-list">
                        {inventory.map(i => <option key={i._id} value={i.name} />)}
                    </datalist>
                    <button
                        type="button"
                        onClick={() => setRx(r => ({ ...r, medicines: [...r.medicines, { name: '', saltName: '', dose: '', days: '' }] }))}
                        style={{ marginTop: '8px', padding: '6px 14px', fontSize: '12px', background: '#f0fdf4', border: '1px dashed #86efac', borderRadius: '6px', color: '#16a34a', cursor: 'pointer', fontWeight: '600' }}
                    >
                        + Add Row
                    </button>
                </div>

                <button className="clinic-btn-primary" style={{ marginTop: '24px', width: '100%', padding: '12px' }} disabled={saving} onClick={saveConsult}>
                    {saving ? 'Saving...' : '✅ Save & Generate Prescription'}
                </button>
            </div>
        </div>
    );

    return (
        <div>
            {msg.text && <div className={`clinic-msg clinic-msg-${msg.type}`}>{msg.text}</div>}

            {/* Monthly Analytics */}
            {analytics && (
                <div className="clinic-card" style={{ marginBottom: '16px' }}>
                    <h3 style={{ margin: '0 0 14px', fontSize: '15px' }}>📊 Clinic Performance — {new Date().toLocaleString('en-IN', { month: 'long', year: 'numeric' })}</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px' }}>
                        {[
                            { label: 'Seen Today', value: analytics.todayAppointments ?? '—', color: '#6366f1' },
                            { label: 'This Month Revenue', value: `₹${(analytics.monthRevenue || 0).toLocaleString('en-IN')}`, color: '#16a34a' },
                            { label: 'Total Patients', value: analytics.totalPatients ?? '—', color: '#0891b2' },
                            { label: 'Completed All Time', value: analytics.completedAppointments ?? '—', color: '#7c3aed' },
                        ].map(s => (
                            <div key={s.label} style={{ background: '#f8fafc', borderRadius: '10px', padding: '14px', textAlign: 'center', border: '1px solid #e2e8f0' }}>
                                <div style={{ fontSize: '22px', fontWeight: 800, color: s.color }}>{s.value}</div>
                                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>{s.label}</div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

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
                                        {a.clinicPatientId?.patientUid || a.patientId} · {a.serviceName || 'General'}
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
                        <thead><tr><th>Token</th><th>Patient</th><th>Diagnosis</th><th>Medicines</th></tr></thead>
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
// TREATMENT PLAN MODE
// ═══════════════════════════════════════════════════
const TreatmentPlanMode = () => {
    const [view, setView] = useState('list');          // 'list' | 'create' | 'detail'
    const [plans, setPlans] = useState([]);
    const [todayDue, setTodayDue] = useState([]);
    const [selectedPlan, setSelectedPlan] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState({ type: '', text: '' });

    // Create form state
    const [patients, setPatients] = useState([]);
    const [patSearch, setPatSearch] = useState('');
    const [form, setForm] = useState({
        clinicPatientId: '', title: '', description: '',
        totalDurationDays: '', startDate: '', intervalDays: '', numberOfVisits: '',
    });
    const [visits, setVisits] = useState([]);

    // Payment modal
    const [payModal, setPayModal] = useState(null); // { visit, planId }
    const [payInput, setPayInput] = useState({ amountPaid: '', paymentMethod: 'Cash', notes: '' });

    const flash = (type, text) => { setMsg({ type, text }); setTimeout(() => setMsg({ type: '', text: '' }), 4000); };

    const loadAll = () => {
        setLoading(true);
        Promise.all([clinicAPI.getTreatmentPlans(), clinicAPI.getTodayDuePlans()])
            .then(([plansR, dueR]) => {
                if (plansR.success) setPlans(plansR.plans);
                if (dueR.success) setTodayDue(dueR.plans);
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    };

    useEffect(() => { loadAll(); }, []);

    // Auto-generate visits when interval/count/start changes
    useEffect(() => {
        const n = parseInt(form.numberOfVisits);
        const interval = parseInt(form.intervalDays);
        const start = form.startDate;
        if (!n || !start) return;
        const base = new Date(start);
        setVisits(Array.from({ length: n }, (_, i) => {
            const d = new Date(base);
            d.setDate(d.getDate() + (interval || 0) * i);
            return {
                visitNumber: i + 1,
                scheduledDate: d.toISOString().split('T')[0],
                scheduledTime: '',
                procedure: '',
                amountDue: '',
            };
        }));
    }, [form.numberOfVisits, form.intervalDays, form.startDate]);

    const loadPatients = async (search) => {
        try {
            const r = await clinicAPI.getPatients(search);
            if (r.success) setPatients(r.patients || []);
        } catch { /* */ }
    };

    const handleCreateSubmit = async () => {
        if (!form.clinicPatientId || !form.title || visits.length === 0) {
            return flash('error', 'Patient, title and at least one visit are required.');
        }
        if (visits.some(v => !v.scheduledDate)) return flash('error', 'All visits must have a scheduled date.');
        setSaving(true);
        try {
            const r = await clinicAPI.createTreatmentPlan({
                ...form,
                visits: visits.map(v => ({ ...v, amountDue: Number(v.amountDue) || 0 })),
            });
            if (r.success) {
                flash('success', 'Treatment plan created successfully.');
                setPlans(prev => [r.plan, ...prev]);
                setView('list');
                setForm({ clinicPatientId: '', title: '', description: '', totalDurationDays: '', startDate: '', intervalDays: '', numberOfVisits: '' });
                setVisits([]);
            } else flash('error', r.message);
        } catch (e) { flash('error', e.response?.data?.message || e.message); }
        finally { setSaving(false); }
    };

    const openDetail = async (plan) => {
        try {
            const r = await clinicAPI.getTreatmentPlan(plan._id);
            if (r.success) { setSelectedPlan(r.plan); setView('detail'); }
        } catch { setSelectedPlan(plan); setView('detail'); }
    };

    const handlePay = async () => {
        if (!payModal) return;
        setSaving(true);
        try {
            const r = await clinicAPI.payVisit(payModal.planId, payModal.visit._id, {
                amountPaid: Number(payInput.amountPaid) || 0,
                paymentMethod: payInput.paymentMethod,
                notes: payInput.notes,
            });
            if (r.success) {
                setSelectedPlan(r.plan);
                setPlans(prev => prev.map(p => p._id === r.plan._id ? r.plan : p));
                setPayModal(null);
                flash('success', 'Payment recorded.');
            } else flash('error', r.message);
        } catch (e) { flash('error', e.response?.data?.message || e.message); }
        finally { setSaving(false); }
    };

    const handleComplete = async (planId, visitId) => {
        if (!window.confirm('Mark this visit as completed?')) return;
        try {
            const r = await clinicAPI.completeVisit(planId, visitId, {});
            if (r.success) {
                setSelectedPlan(r.plan);
                setPlans(prev => prev.map(p => p._id === r.plan._id ? r.plan : p));
                flash('success', 'Visit marked completed.');
            }
        } catch (e) { flash('error', e.message); }
    };

    const handleMiss = async (planId, visitId) => {
        if (!window.confirm('Mark this visit as missed? The due amount will carry forward.')) return;
        try {
            const r = await clinicAPI.missVisit(planId, visitId);
            if (r.success) {
                setSelectedPlan(r.plan);
                setPlans(prev => prev.map(p => p._id === r.plan._id ? r.plan : p));
                flash('success', 'Visit marked as missed. Balance carried forward.');
            }
        } catch (e) { flash('error', e.message); }
    };

    const handleCancel = async (planId) => {
        if (!window.confirm('Cancel this treatment plan?')) return;
        try {
            const r = await clinicAPI.cancelTreatmentPlan(planId);
            if (r.success) {
                setPlans(prev => prev.map(p => p._id === planId ? { ...p, status: 'cancelled' } : p));
                if (selectedPlan?._id === planId) setSelectedPlan(prev => ({ ...prev, status: 'cancelled' }));
                flash('success', 'Plan cancelled.');
            }
        } catch (e) { flash('error', e.message); }
    };

    const planStatusColor = { active: '#0891b2', completed: '#16a34a', cancelled: '#dc2626' };
    const visitStatusColor = { scheduled: '#6366f1', completed: '#16a34a', missed: '#dc2626' };

    // ── LIST VIEW ──
    if (view === 'list') return (
        <div>
            {/* Today's Due Alert Banner */}
            {todayDue.length > 0 && (
                <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '10px', padding: '14px 18px', marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ fontWeight: '800', color: '#92400e', fontSize: '14px' }}>🔔 Today's Procedures Due ({todayDue.reduce((s, p) => s + p.visits.filter(v => { const d = new Date(v.scheduledDate); const t = new Date(); return d.toDateString() === t.toDateString() && v.status === 'scheduled'; }).length, 0)})</div>
                    {todayDue.map(plan => plan.visits.filter(v => {
                        const d = new Date(v.scheduledDate); const t = new Date();
                        return d.toDateString() === t.toDateString() && v.status === 'scheduled';
                    }).map(v => (
                        <div key={v._id} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', color: '#78350f' }}>
                            <span style={{ fontWeight: '700' }}>📋 {plan.clinicPatientId?.name}</span>
                            <span>— Visit {v.visitNumber} of "{plan.title}"</span>
                            {v.scheduledTime && <span style={{ background: '#fef3c7', padding: '1px 8px', borderRadius: '4px', fontWeight: '700' }}>🕐 {v.scheduledTime}</span>}
                            <span style={{ color: '#dc2626', fontWeight: '700' }}>₹{v.totalDue.toLocaleString('en-IN')} due</span>
                            <button onClick={() => openDetail(plan)} style={{ marginLeft: 'auto', fontSize: '11px', padding: '3px 10px', background: '#f59e0b', color: '#fff', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: '700' }}>View Plan</button>
                        </div>
                    )))}
                </div>
            )}

            {msg.text && <div className={`clinic-msg clinic-msg-${msg.type}`}>{msg.text}</div>}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ margin: 0, color: '#0f172a' }}>📅 Treatment Plans</h3>
                <button className="clinic-btn-primary" onClick={() => { setView('create'); loadPatients(''); }}>+ New Plan</button>
            </div>

            {loading ? <Spinner /> : plans.length === 0 ? <Empty text="No treatment plans yet. Create one for a patient." /> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {plans.map(plan => {
                        const nextVisit = plan.visits.find(v => v.status === 'scheduled');
                        return (
                            <div key={plan._id} className="clinic-card" style={{ padding: '16px', cursor: 'pointer', borderLeft: `4px solid ${planStatusColor[plan.status] || '#94a3b8'}` }} onClick={() => openDetail(plan)}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
                                    <div>
                                        <div style={{ fontWeight: '800', fontSize: '15px', color: '#0f172a' }}>{plan.title}</div>
                                        <div style={{ fontSize: '13px', color: '#475569', marginTop: '2px' }}>
                                            👤 {plan.clinicPatientId?.name || '—'} · {plan.clinicPatientId?.patientUid || ''}
                                        </div>
                                        {plan.description && <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>{plan.description}</div>}
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                                        <span style={{ fontSize: '11px', fontWeight: '700', padding: '3px 10px', borderRadius: '20px', background: planStatusColor[plan.status] + '20', color: planStatusColor[plan.status], textTransform: 'uppercase' }}>{plan.status}</span>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '20px', marginTop: '12px', flexWrap: 'wrap' }}>
                                    <div style={{ fontSize: '12px', color: '#475569' }}>📋 <b>{plan.visits.length}</b> visits · <b style={{ color: '#16a34a' }}>{plan.visits.filter(v => v.status === 'completed').length}</b> done · <b style={{ color: '#6366f1' }}>{plan.visits.filter(v => v.status === 'scheduled').length}</b> upcoming</div>
                                    <div style={{ fontSize: '12px', color: '#475569' }}>💰 Total: <b>₹{plan.totalAmount.toLocaleString('en-IN')}</b> · Paid: <b style={{ color: '#16a34a' }}>₹{plan.totalPaid.toLocaleString('en-IN')}</b> · Pending: <b style={{ color: '#dc2626' }}>₹{plan.pendingBalance.toLocaleString('en-IN')}</b></div>
                                    {nextVisit && <div style={{ fontSize: '12px', color: '#0891b2' }}>📅 Next: <b>{new Date(nextVisit.scheduledDate).toLocaleDateString('en-IN')}</b>{nextVisit.scheduledTime ? ' ' + nextVisit.scheduledTime : ''}</div>}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );

    // ── CREATE VIEW ──
    if (view === 'create') return (
        <div>
            <button className="clinic-back-btn" onClick={() => setView('list')}>← Back to Plans</button>
            {msg.text && <div className={`clinic-msg clinic-msg-${msg.type}`} style={{ marginTop: '10px' }}>{msg.text}</div>}
            <div className="clinic-card" style={{ marginTop: '12px' }}>
                <h3 style={{ margin: '0 0 20px', color: '#0f172a' }}>📅 New Treatment Plan</h3>

                {/* Patient Search */}
                <div className="clinic-form-group" style={{ marginBottom: '14px' }}>
                    <label>Patient *</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <input className="clinic-input" style={{ flex: 1 }} placeholder="Search patient by name or ID..."
                            value={patSearch}
                            onChange={e => { setPatSearch(e.target.value); loadPatients(e.target.value); }} />
                    </div>
                    {patients.length > 0 && !form.clinicPatientId && (
                        <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', maxHeight: '160px', overflowY: 'auto', marginTop: '4px' }}>
                            {patients.map(p => (
                                <div key={p._id} onClick={() => { setForm(f => ({ ...f, clinicPatientId: p._id })); setPatSearch(p.name + (p.patientUid ? ' (' + p.patientUid + ')' : '')); setPatients([]); }}
                                    style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', fontSize: '13px' }}
                                    onMouseEnter={e => e.currentTarget.style.background = '#f0f9ff'}
                                    onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                                    <b>{p.name}</b> · {p.patientUid || ''} · {p.phone || ''}
                                </div>
                            ))}
                        </div>
                    )}
                    {form.clinicPatientId && <div style={{ fontSize: '12px', color: '#16a34a', marginTop: '4px' }}>✓ Patient selected. <span style={{ cursor: 'pointer', color: '#dc2626' }} onClick={() => { setForm(f => ({ ...f, clinicPatientId: '' })); setPatSearch(''); }}>Clear</span></div>}
                </div>

                {/* Plan Details */}
                <div className="clinic-form-grid">
                    <div className="clinic-form-group" style={{ gridColumn: '1/-1' }}>
                        <label>Plan Title *</label>
                        <input className="clinic-input" placeholder="e.g. Root Canal Treatment, Orthodontic Course..." value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
                    </div>
                    <div className="clinic-form-group" style={{ gridColumn: '1/-1' }}>
                        <label>Description / Procedure Notes</label>
                        <textarea className="clinic-input" rows={2} placeholder="Brief description of the treatment plan..." value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
                    </div>
                    <div className="clinic-form-group">
                        <label>Total Duration (days)</label>
                        <input className="clinic-input" type="number" placeholder="e.g. 15" value={form.totalDurationDays} onChange={e => setForm(f => ({ ...f, totalDurationDays: e.target.value }))} />
                    </div>
                    <div className="clinic-form-group">
                        <label>Start Date *</label>
                        <input className="clinic-input" type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} />
                    </div>
                    <div className="clinic-form-group">
                        <label>Number of Visits *</label>
                        <input className="clinic-input" type="number" min="1" placeholder="e.g. 5" value={form.numberOfVisits} onChange={e => setForm(f => ({ ...f, numberOfVisits: e.target.value }))} />
                    </div>
                    <div className="clinic-form-group">
                        <label>Interval Between Visits (days)</label>
                        <input className="clinic-input" type="number" min="0" placeholder="e.g. 3" value={form.intervalDays} onChange={e => setForm(f => ({ ...f, intervalDays: e.target.value }))} />
                    </div>
                </div>

                {/* Visits Table */}
                {visits.length > 0 && (
                    <div style={{ marginTop: '20px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                            <h4 style={{ margin: 0, color: '#0f172a' }}>Visit Schedule</h4>
                            <span style={{ fontSize: '12px', color: '#64748b' }}>Total: ₹{visits.reduce((s, v) => s + (Number(v.amountDue) || 0), 0).toLocaleString('en-IN')}</span>
                        </div>
                        <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                <thead>
                                    <tr style={{ background: '#f1f5f9' }}>
                                        <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: '700', color: '#374151', borderBottom: '1px solid #e2e8f0', width: '8%' }}>#</th>
                                        <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: '700', color: '#374151', borderBottom: '1px solid #e2e8f0', width: '20%' }}>Date</th>
                                        <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: '700', color: '#374151', borderBottom: '1px solid #e2e8f0', width: '15%' }}>Time</th>
                                        <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: '700', color: '#374151', borderBottom: '1px solid #e2e8f0', width: '35%' }}>Procedure / Notes</th>
                                        <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: '700', color: '#374151', borderBottom: '1px solid #e2e8f0', width: '22%' }}>Amount Due (₹)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {visits.map((v, idx) => (
                                        <tr key={idx} style={{ background: idx % 2 === 0 ? '#fff' : '#f8fafc' }}>
                                            <td style={{ padding: '6px 10px', borderBottom: '1px solid #f1f5f9', fontWeight: '700', color: '#6366f1' }}>{v.visitNumber}</td>
                                            <td style={{ padding: '6px 8px', borderBottom: '1px solid #f1f5f9' }}>
                                                <input type="date" value={v.scheduledDate}
                                                    onChange={e => setVisits(prev => { const a = [...prev]; a[idx] = { ...a[idx], scheduledDate: e.target.value }; return a; })}
                                                    style={{ border: '1px solid #e2e8f0', borderRadius: '5px', padding: '4px 6px', fontSize: '12px', width: '100%', boxSizing: 'border-box' }} />
                                            </td>
                                            <td style={{ padding: '6px 8px', borderBottom: '1px solid #f1f5f9' }}>
                                                <input type="time" value={v.scheduledTime}
                                                    onChange={e => setVisits(prev => { const a = [...prev]; a[idx] = { ...a[idx], scheduledTime: e.target.value }; return a; })}
                                                    style={{ border: '1px solid #e2e8f0', borderRadius: '5px', padding: '4px 6px', fontSize: '12px', width: '100%', boxSizing: 'border-box' }} />
                                            </td>
                                            <td style={{ padding: '6px 8px', borderBottom: '1px solid #f1f5f9' }}>
                                                <input value={v.procedure}
                                                    onChange={e => setVisits(prev => { const a = [...prev]; a[idx] = { ...a[idx], procedure: e.target.value }; return a; })}
                                                    placeholder="e.g. Canal cleaning, Filing..."
                                                    style={{ border: '1px solid #e2e8f0', borderRadius: '5px', padding: '4px 6px', fontSize: '12px', width: '100%', boxSizing: 'border-box' }} />
                                            </td>
                                            <td style={{ padding: '6px 8px', borderBottom: '1px solid #f1f5f9' }}>
                                                <input type="number" value={v.amountDue}
                                                    onChange={e => setVisits(prev => { const a = [...prev]; a[idx] = { ...a[idx], amountDue: e.target.value }; return a; })}
                                                    placeholder="0"
                                                    style={{ border: '1px solid #e2e8f0', borderRadius: '5px', padding: '4px 6px', fontSize: '12px', width: '100%', boxSizing: 'border-box' }} />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                    <button className="clinic-btn-secondary" onClick={() => setView('list')}>Cancel</button>
                    <button className="clinic-btn-primary" style={{ flex: 1 }} disabled={saving} onClick={handleCreateSubmit}>
                        {saving ? 'Creating...' : '✅ Create Treatment Plan'}
                    </button>
                </div>
            </div>
        </div>
    );

    // ── DETAIL VIEW ──
    if (view === 'detail' && selectedPlan) return (
        <div>
            <button className="clinic-back-btn" onClick={() => setView('list')}>← Back to Plans</button>
            {msg.text && <div className={`clinic-msg clinic-msg-${msg.type}`} style={{ marginTop: '10px' }}>{msg.text}</div>}

            <div className="clinic-card" style={{ marginTop: '12px' }}>
                {/* Plan Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px', marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px solid #f1f5f9' }}>
                    <div>
                        <h3 style={{ margin: '0 0 4px', color: '#0f172a' }}>{selectedPlan.title}</h3>
                        <div style={{ fontSize: '13px', color: '#64748b' }}>👤 {selectedPlan.clinicPatientId?.name} · {selectedPlan.clinicPatientId?.patientUid || ''} · {selectedPlan.clinicPatientId?.phone || ''}</div>
                        {selectedPlan.description && <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>{selectedPlan.description}</div>}
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '11px', fontWeight: '700', padding: '4px 12px', borderRadius: '20px', background: (planStatusColor[selectedPlan.status] || '#94a3b8') + '20', color: planStatusColor[selectedPlan.status] || '#94a3b8', textTransform: 'uppercase' }}>{selectedPlan.status}</span>
                        {selectedPlan.status === 'active' && (
                            <button onClick={() => handleCancel(selectedPlan._id)} style={{ fontSize: '11px', padding: '4px 12px', background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '700' }}>Cancel Plan</button>
                        )}
                    </div>
                </div>

                {/* Financial Summary */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px', marginBottom: '20px' }}>
                    {[
                        { label: 'Total Amount', value: '₹' + selectedPlan.totalAmount.toLocaleString('en-IN'), color: '#6366f1' },
                        { label: 'Total Paid', value: '₹' + selectedPlan.totalPaid.toLocaleString('en-IN'), color: '#16a34a' },
                        { label: 'Pending Balance', value: '₹' + selectedPlan.pendingBalance.toLocaleString('en-IN'), color: '#dc2626' },
                        { label: 'Visits Done', value: `${selectedPlan.visits.filter(v => v.status === 'completed').length} / ${selectedPlan.visits.length}`, color: '#0891b2' },
                    ].map((s, i) => (
                        <div key={i} style={{ background: '#f8fafc', borderRadius: '8px', padding: '12px', borderTop: `3px solid ${s.color}` }}>
                            <div style={{ fontSize: '18px', fontWeight: '800', color: s.color }}>{s.value}</div>
                            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>{s.label}</div>
                        </div>
                    ))}
                </div>

                {/* Visits Table */}
                <h4 style={{ margin: '0 0 12px', color: '#0f172a' }}>Visit Schedule</h4>
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                        <thead>
                            <tr style={{ background: '#f1f5f9' }}>
                                {['#', 'Date & Time', 'Procedure', 'Base Due', 'Carry Fwd', 'Total Due', 'Paid', 'Balance', 'Status', 'Actions'].map(h => (
                                    <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: '700', color: '#374151', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap', fontSize: '12px' }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {selectedPlan.visits.map((v, idx) => (
                                <tr key={v._id} style={{ background: v.status === 'completed' ? '#f0fdf4' : v.status === 'missed' ? '#fff1f2' : idx % 2 === 0 ? '#fff' : '#f8fafc' }}>
                                    <td style={{ padding: '8px 10px', borderBottom: '1px solid #f1f5f9', fontWeight: '700', color: '#6366f1' }}>{v.visitNumber}</td>
                                    <td style={{ padding: '8px 10px', borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap', fontSize: '12px' }}>
                                        <div style={{ fontWeight: '600' }}>{new Date(v.scheduledDate).toLocaleDateString('en-IN')}</div>
                                        {v.scheduledTime && <div style={{ color: '#64748b', fontSize: '11px' }}>🕐 {v.scheduledTime}</div>}
                                    </td>
                                    <td style={{ padding: '8px 10px', borderBottom: '1px solid #f1f5f9', fontSize: '12px', maxWidth: '120px' }}>
                                        <div>{v.procedure || '—'}</div>
                                        {v.notes && <div style={{ color: '#94a3b8', fontSize: '11px', marginTop: '2px' }}>{v.notes}</div>}
                                    </td>
                                    <td style={{ padding: '8px 10px', borderBottom: '1px solid #f1f5f9' }}>₹{v.amountDue.toLocaleString('en-IN')}</td>
                                    <td style={{ padding: '8px 10px', borderBottom: '1px solid #f1f5f9', color: v.carryForward > 0 ? '#f97316' : '#94a3b8' }}>
                                        {v.carryForward > 0 ? <span style={{ fontWeight: '700' }}>+₹{v.carryForward.toLocaleString('en-IN')}</span> : '—'}
                                    </td>
                                    <td style={{ padding: '8px 10px', borderBottom: '1px solid #f1f5f9', fontWeight: '700', color: '#0f172a' }}>₹{v.totalDue.toLocaleString('en-IN')}</td>
                                    <td style={{ padding: '8px 10px', borderBottom: '1px solid #f1f5f9', color: '#16a34a', fontWeight: '600' }}>₹{v.amountPaid.toLocaleString('en-IN')}</td>
                                    <td style={{ padding: '8px 10px', borderBottom: '1px solid #f1f5f9', color: v.balance > 0 ? '#dc2626' : '#16a34a', fontWeight: '700' }}>
                                        {v.balance > 0 ? '₹' + v.balance.toLocaleString('en-IN') : '✓ Cleared'}
                                    </td>
                                    <td style={{ padding: '8px 10px', borderBottom: '1px solid #f1f5f9' }}>
                                        <span style={{ fontSize: '11px', fontWeight: '700', padding: '3px 8px', borderRadius: '4px', background: (visitStatusColor[v.status] || '#94a3b8') + '20', color: visitStatusColor[v.status] || '#94a3b8', textTransform: 'uppercase' }}>{v.status}</span>
                                    </td>
                                    <td style={{ padding: '8px 10px', borderBottom: '1px solid #f1f5f9' }}>
                                        {v.status === 'scheduled' && selectedPlan.status === 'active' && (
                                            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                                <button onClick={() => { setPayModal({ visit: v, planId: selectedPlan._id }); setPayInput({ amountPaid: v.totalDue, paymentMethod: 'Cash', notes: '' }); }}
                                                    style={{ fontSize: '11px', padding: '3px 8px', background: '#dcfce7', color: '#16a34a', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: '700' }}>💵 Pay</button>
                                                <button onClick={() => handleComplete(selectedPlan._id, v._id)}
                                                    style={{ fontSize: '11px', padding: '3px 8px', background: '#dbeafe', color: '#1d4ed8', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: '700' }}>✓ Done</button>
                                                <button onClick={() => handleMiss(selectedPlan._id, v._id)}
                                                    style={{ fontSize: '11px', padding: '3px 8px', background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: '700' }}>✗ Missed</button>
                                            </div>
                                        )}
                                        {v.status === 'completed' && <span style={{ fontSize: '11px', color: '#94a3b8' }}>{v.completedAt ? new Date(v.completedAt).toLocaleDateString('en-IN') : '—'}</span>}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Payment Modal */}
            {payModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ background: '#fff', borderRadius: '14px', padding: '28px', width: '400px', maxWidth: '95vw', boxShadow: '0 20px 40px rgba(0,0,0,0.15)' }}>
                        <h3 style={{ margin: '0 0 16px', color: '#0f172a' }}>💵 Record Payment — Visit {payModal.visit.visitNumber}</h3>
                        <div style={{ fontSize: '13px', color: '#475569', marginBottom: '16px', background: '#f8fafc', padding: '12px', borderRadius: '8px' }}>
                            <div>Base Due: <b>₹{payModal.visit.amountDue.toLocaleString('en-IN')}</b></div>
                            {payModal.visit.carryForward > 0 && <div style={{ color: '#f97316' }}>Carry Forward: <b>+₹{payModal.visit.carryForward.toLocaleString('en-IN')}</b></div>}
                            <div style={{ fontWeight: '800', color: '#dc2626', fontSize: '14px', marginTop: '4px' }}>Total Due: ₹{payModal.visit.totalDue.toLocaleString('en-IN')}</div>
                        </div>
                        <div className="clinic-form-group" style={{ marginBottom: '12px' }}>
                            <label>Amount Paid (₹) *</label>
                            <input className="clinic-input" type="number" value={payInput.amountPaid}
                                onChange={e => setPayInput(p => ({ ...p, amountPaid: e.target.value }))} />
                            {payInput.amountPaid && Number(payInput.amountPaid) < payModal.visit.totalDue && (
                                <div style={{ fontSize: '12px', color: '#f97316', marginTop: '4px' }}>
                                    ⚠ Remaining ₹{(payModal.visit.totalDue - Number(payInput.amountPaid)).toLocaleString('en-IN')} will carry forward to next visit.
                                </div>
                            )}
                        </div>
                        <div className="clinic-form-group" style={{ marginBottom: '12px' }}>
                            <label>Payment Method</label>
                            <select className="clinic-input" value={payInput.paymentMethod} onChange={e => setPayInput(p => ({ ...p, paymentMethod: e.target.value }))}>
                                <option>Cash</option><option>UPI</option><option>Card</option><option>NEFT</option>
                            </select>
                        </div>
                        <div className="clinic-form-group" style={{ marginBottom: '16px' }}>
                            <label>Notes (optional)</label>
                            <input className="clinic-input" placeholder="e.g. Partial payment, balance next visit..." value={payInput.notes} onChange={e => setPayInput(p => ({ ...p, notes: e.target.value }))} />
                        </div>
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <button className="clinic-btn-secondary" style={{ flex: 1 }} onClick={() => setPayModal(null)}>Cancel</button>
                            <button className="clinic-btn-primary" style={{ flex: 1 }} disabled={saving} onClick={handlePay}>
                                {saving ? 'Saving...' : '✅ Confirm Payment'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );

    return null;
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
