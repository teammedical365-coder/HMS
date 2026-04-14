import React, { useState, useEffect, useCallback, useRef } from 'react';
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

const generatePrescriptionSlipPDF = (consulting, rx, vitalsData) => {
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
    y = doc.lastAutoTable.finalY + 8;

    // Vitals (only if any field is filled)
    const v = vitalsData || {};
    const hasVitals = Object.values(v).some(val => val);
    if (hasVitals) {
        doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(33, 37, 41);
        doc.text('Vitals', 14, y); y += 5;
        const vitalsRow = [
            v.weight ? `Wt: ${v.weight} kg` : '',
            v.height ? `Ht: ${v.height} cm` : '',
            v.bmi    ? `BMI: ${v.bmi}` : '',
            v.bp     ? `BP: ${v.bp} mmHg` : '',
            v.temperature ? `Temp: ${v.temperature}°F` : '',
            v.pulse  ? `Pulse: ${v.pulse} bpm` : '',
            v.spo2   ? `SpO₂: ${v.spo2}%` : '',
            v.rr     ? `RR: ${v.rr}/min` : '',
        ].filter(Boolean);
        autoTable(doc, {
            startY: y,
            body: [vitalsRow],
            theme: 'grid',
            bodyStyles: { fontSize: 9, cellPadding: 3 },
            headStyles: { fillColor: [14, 165, 233], textColor: 255 },
        });
        y = doc.lastAutoTable.finalY + 8;
    }

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
        { label: "Today's Visits", value: stats?.todayAppointments ?? 0, sub: `${stats?.completedAppointments ?? 0} completed`, icon: '🎟️', color: '#8b5cf6' },
        { label: "Today's Collection", value: fmt(stats?.todayRevenue), sub: 'all paid upfront', icon: '💰', color: '#10b981' },
        { label: 'Total Collection', value: fmt(stats?.totalRevenue), sub: fmt(stats?.monthRevenue) + ' this month', icon: '💵', color: '#f59e0b' },
        { label: 'This Month', value: fmt(stats?.monthRevenue), icon: '📅', color: '#6366f1' },
        { label: 'Treatment Plans', value: fmt(stats?.treatmentPlanRevenue), sub: stats?.treatmentPlanPending ? fmt(stats.treatmentPlanPending) + ' outstanding' : 'No outstanding', icon: '📋', color: '#0891b2' },
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
                        <thead><tr><th>Token</th><th>Patient</th><th>Date</th><th>Status</th><th>Fee</th><th>Method</th></tr></thead>
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
                                    <td><strong style={{ color: '#16a34a' }}>{fmt(a.amount)}</strong></td>
                                    <td><span style={{ fontSize: '11px', color: '#64748b' }}>{a.paymentMethod || 'Cash'}</span></td>
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
// REPORT VIEWER — inline PDF/image panel
// ═══════════════════════════════════════════════════
const baseURL = import.meta.env.VITE_API_URL || 'https://hms-h939.onrender.com';
const reportURL = (filename) => `${baseURL}/uploads/patient-reports/${encodeURIComponent(filename)}`;

const ReportViewerModal = ({ report, onClose }) => {
    const url = reportURL(report.filename);
    const isPDF = report.mimetype === 'application/pdf';
    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9000, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#1e293b', padding: '10px 20px', color: '#fff' }}>
                <span style={{ fontWeight: 700, fontSize: '14px' }}>📄 {report.name}</span>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <a href={url} target="_blank" rel="noopener noreferrer"
                        style={{ fontSize: '12px', color: '#7dd3fc', textDecoration: 'none' }}>Open in new tab ↗</a>
                    <button onClick={onClose}
                        style={{ background: '#ef4444', border: 'none', color: '#fff', borderRadius: '6px', padding: '4px 12px', cursor: 'pointer', fontWeight: 700 }}>✕ Close</button>
                </div>
            </div>
            <div style={{ flex: 1, overflow: 'hidden' }}>
                {isPDF ? (
                    <iframe src={url} title={report.name} style={{ width: '100%', height: '100%', border: 'none' }} />
                ) : (
                    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000', overflow: 'auto' }}>
                        <img src={url} alt={report.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                    </div>
                )}
            </div>
        </div>
    );
};

// ─── Compact report panel used inside DoctorMode ─────────────────────────────
const PatientReportPanel = ({ patientId, patientName }) => {
    const [reports, setReports] = useState([]);
    const [viewReport, setViewReport] = useState(null);
    const [open, setOpen] = useState(false);

    useEffect(() => {
        if (!patientId) return;
        clinicAPI.getPatientHistory(patientId)
            .then(r => { if (r.success) setReports(r.patient?.reports || []); })
            .catch(() => {});
    }, [patientId]);

    if (!patientId) return null;

    return (
        <>
            {viewReport && <ReportViewerModal report={viewReport} onClose={() => setViewReport(null)} />}
            <div style={{ marginBottom: '20px', border: '1px solid #e0e7ff', borderRadius: '10px', overflow: 'hidden' }}>
                <button
                    onClick={() => setOpen(o => !o)}
                    style={{ width: '100%', background: '#eef2ff', border: 'none', padding: '10px 16px', textAlign: 'left', cursor: 'pointer', fontWeight: 600, fontSize: '13px', color: '#4338ca', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>📄 Previous Reports ({reports.length})</span>
                    <span>{open ? '▲' : '▼'}</span>
                </button>
                {open && (
                    <div style={{ background: '#f8faff', padding: '12px 16px' }}>
                        {reports.length === 0 ? (
                            <p style={{ color: '#94a3b8', fontSize: '13px', margin: 0 }}>No reports uploaded for {patientName || 'this patient'}.</p>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {reports.map(r => (
                                    <div key={r._id} style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#fff', border: '1px solid #e0e7ff', borderRadius: '8px', padding: '8px 12px' }}>
                                        <span style={{ fontSize: '20px' }}>{r.mimetype === 'application/pdf' ? '📄' : '🖼️'}</span>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontWeight: 600, fontSize: '13px', color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</div>
                                            <div style={{ fontSize: '11px', color: '#94a3b8' }}>{r.uploadedAt ? new Date(r.uploadedAt).toLocaleDateString('en-IN') : ''}</div>
                                        </div>
                                        <button
                                            onClick={() => setViewReport(r)}
                                            style={{ background: '#6366f1', color: '#fff', border: 'none', borderRadius: '6px', padding: '4px 12px', fontSize: '12px', cursor: 'pointer', fontWeight: 600, flexShrink: 0 }}>
                                            View
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </>
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
    const [form, setForm] = useState({ name: '', phone: '', email: '', dob: '', gender: 'Male', address: '', bloodGroup: '', allergies: '', chronicConditions: '', relatives: [] });
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState({ type: '', text: '' });
    const [justRegistered, setJustRegistered] = useState(null);
    // Reports state
    const [patientReports, setPatientReports] = useState([]);
    const [viewReport, setViewReport] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [reportName, setReportName] = useState('');
    const fileInputRef = useRef(null);

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
        setPatientReports([]);
        clinicAPI.getPatientHistory(p._id)
            .then(r => {
                if (r.success) {
                    setPatientHistory(r);
                    setPatientReports(r.patient?.reports || []);
                }
            })
            .catch(console.error)
            .finally(() => setLoadingHistory(false));
    };

    const handleUploadReport = async (e) => {
        const file = e.target.files?.[0];
        if (!file || !selectedPatient) return;
        setUploading(true);
        try {
            const name = reportName.trim() || file.name;
            const r = await clinicAPI.uploadPatientReport(selectedPatient._id, file, name);
            if (r.success) {
                setPatientReports(prev => [...prev, r.report]);
                setReportName('');
                if (fileInputRef.current) fileInputRef.current.value = '';
                flash('success', 'Report uploaded successfully');
            } else flash('error', r.message);
        } catch (e) { flash('error', e.response?.data?.message || e.message); }
        finally { setUploading(false); }
    };

    const handleDeleteReport = async (reportId) => {
        if (!selectedPatient) return;
        if (!window.confirm('Delete this report?')) return;
        try {
            const r = await clinicAPI.deletePatientReport(selectedPatient._id, reportId);
            if (r.success) setPatientReports(prev => prev.filter(rp => rp._id !== reportId));
            else flash('error', r.message);
        } catch (e) { flash('error', e.response?.data?.message || e.message); }
    };

    const handleRegister = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            const r = await clinicAPI.registerPatient(form);
            if (r.success) {
                if (!r.existing) setPatients(prev => [r.patient, ...prev]);
                setJustRegistered(r.patient);
                setForm({ name: '', phone: '', email: '', dob: '', gender: 'Male', address: '', bloodGroup: '', allergies: '', chronicConditions: '', relatives: [] });
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

                    {/* Relatives */}
                    {selectedPatient.relatives?.length > 0 && (
                        <div style={{ marginTop: '16px', paddingTop: '14px', borderTop: '1px solid #f1f5f9' }}>
                            <div style={{ fontSize: '12px', fontWeight: '700', color: '#64748b', marginBottom: '8px' }}>👨‍👩‍👧 Emergency Contacts</div>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                {selectedPatient.relatives.map((rel, i) => (
                                    <div key={i} style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '8px', padding: '8px 14px', fontSize: '12px' }}>
                                        <div style={{ fontWeight: '700', color: '#0f172a' }}>{rel.name}</div>
                                        {rel.relation && <div style={{ color: '#0369a1', fontSize: '11px' }}>{rel.relation}</div>}
                                        {rel.phone && <div style={{ color: '#475569', marginTop: '2px' }}>📞 {rel.phone}</div>}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* ── Medical Reports ────────────────────────────────────────── */}
                {viewReport && <ReportViewerModal report={viewReport} onClose={() => setViewReport(null)} />}
                <div className="clinic-card" style={{ marginTop: '12px', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                        <h3 style={{ margin: 0 }}>📄 Medical Reports ({patientReports.length})</h3>
                    </div>
                    {/* Upload area */}
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px', background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: '8px', padding: '12px' }}>
                        <input
                            className="clinic-input"
                            style={{ flex: 1, minWidth: '140px' }}
                            placeholder="Report name (optional)"
                            value={reportName}
                            onChange={e => setReportName(e.target.value)}
                        />
                        <label style={{ cursor: 'pointer', background: uploading ? '#e2e8f0' : '#6366f1', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 16px', fontWeight: 600, fontSize: '13px', display: 'inline-flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}>
                            {uploading ? 'Uploading...' : '⬆ Upload PDF / Image'}
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".pdf,image/jpeg,image/png,image/webp"
                                style={{ display: 'none' }}
                                disabled={uploading}
                                onChange={handleUploadReport}
                            />
                        </label>
                        <div style={{ width: '100%', fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>Supports PDF, JPG, PNG · max 20 MB</div>
                    </div>
                    {/* Report list */}
                    {patientReports.length === 0 ? (
                        <p style={{ color: '#94a3b8', fontSize: '13px', textAlign: 'center', padding: '12px 0' }}>No reports uploaded yet.</p>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {patientReports.map(r => (
                                <div key={r._id} style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#fff', border: '1px solid #e0e7ff', borderRadius: '8px', padding: '10px 14px' }}>
                                    <span style={{ fontSize: '22px' }}>{r.mimetype === 'application/pdf' ? '📄' : '🖼️'}</span>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontWeight: 600, fontSize: '14px', color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</div>
                                        <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                                            {r.mimetype === 'application/pdf' ? 'PDF Document' : 'Image'} · {r.uploadedAt ? new Date(r.uploadedAt).toLocaleDateString('en-IN') : ''}
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <button
                                            onClick={() => setViewReport(r)}
                                            style={{ background: '#6366f1', color: '#fff', border: 'none', borderRadius: '6px', padding: '5px 14px', fontSize: '12px', cursor: 'pointer', fontWeight: 600 }}>
                                            View
                                        </button>
                                        <button
                                            onClick={() => handleDeleteReport(r._id)}
                                            style={{ background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: '6px', padding: '5px 10px', fontSize: '12px', cursor: 'pointer', fontWeight: 600 }}>
                                            ✕
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {loadingHistory ? <Spinner text="Loading history..." /> : patientHistory ? (
                    <div className="clinic-card">
                        <h3 style={{ marginBottom: '16px' }}>📋 Visit History ({patientHistory.appointments?.length || 0} visits)</h3>
                        {patientHistory.appointments?.length === 0 ? (
                            <p style={{ color: '#94a3b8', textAlign: 'center', padding: '20px 0' }}>No visits yet.</p>
                        ) : (
                            <table className="clinic-table">
                                <thead><tr><th>Date</th><th>Token</th><th>Diagnosis</th><th>Medicines</th><th>Status</th><th>Fee</th></tr></thead>
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
                                            <td><strong style={{ color: '#16a34a' }}>{fmt(a.amount)}</strong></td>
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

                                {/* Relatives / Emergency Contacts */}
                                <div style={{ gridColumn: '1/-1', marginTop: '4px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                        <label style={{ fontWeight: '700', fontSize: '13px', color: '#374151' }}>👨‍👩‍👧 Relatives / Emergency Contacts</label>
                                        <button type="button"
                                            onClick={() => setForm(f => ({ ...f, relatives: [...f.relatives, { name: '', relation: '', phone: '' }] }))}
                                            style={{ fontSize: '12px', padding: '4px 12px', background: '#f0fdf4', border: '1px dashed #86efac', borderRadius: '6px', color: '#16a34a', cursor: 'pointer', fontWeight: '600' }}>
                                            + Add Contact
                                        </button>
                                    </div>
                                    {form.relatives.length === 0 ? (
                                        <div style={{ fontSize: '12px', color: '#94a3b8', padding: '10px 14px', background: '#f8fafc', borderRadius: '8px', border: '1px dashed #e2e8f0' }}>
                                            No contacts added. Click "+ Add Contact" to add a relative or emergency contact.
                                        </div>
                                    ) : (
                                        <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                                <thead>
                                                    <tr style={{ background: '#f1f5f9' }}>
                                                        <th style={{ padding: '7px 10px', textAlign: 'left', fontWeight: '700', color: '#374151', borderBottom: '1px solid #e2e8f0' }}>Name</th>
                                                        <th style={{ padding: '7px 10px', textAlign: 'left', fontWeight: '700', color: '#374151', borderBottom: '1px solid #e2e8f0' }}>Relation</th>
                                                        <th style={{ padding: '7px 10px', textAlign: 'left', fontWeight: '700', color: '#374151', borderBottom: '1px solid #e2e8f0' }}>Phone</th>
                                                        <th style={{ padding: '7px 10px', textAlign: 'center', borderBottom: '1px solid #e2e8f0', width: '40px' }}></th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {form.relatives.map((rel, idx) => (
                                                        <tr key={idx} style={{ background: idx % 2 === 0 ? '#fff' : '#f8fafc' }}>
                                                            <td style={{ padding: '5px 8px', borderBottom: '1px solid #f1f5f9' }}>
                                                                <input value={rel.name} onChange={e => setForm(f => { const r = [...f.relatives]; r[idx] = { ...r[idx], name: e.target.value }; return { ...f, relatives: r }; })}
                                                                    placeholder="e.g. Ramesh Kumar"
                                                                    style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: '5px', padding: '5px 7px', fontSize: '12px', boxSizing: 'border-box' }} />
                                                            </td>
                                                            <td style={{ padding: '5px 8px', borderBottom: '1px solid #f1f5f9' }}>
                                                                <select value={rel.relation} onChange={e => setForm(f => { const r = [...f.relatives]; r[idx] = { ...r[idx], relation: e.target.value }; return { ...f, relatives: r }; })}
                                                                    style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: '5px', padding: '5px 7px', fontSize: '12px', boxSizing: 'border-box', background: '#fff' }}>
                                                                    <option value=''>Select...</option>
                                                                    {['Father','Mother','Spouse','Son','Daughter','Brother','Sister','Guardian','Friend','Other'].map(r => <option key={r}>{r}</option>)}
                                                                </select>
                                                            </td>
                                                            <td style={{ padding: '5px 8px', borderBottom: '1px solid #f1f5f9' }}>
                                                                <input value={rel.phone} onChange={e => setForm(f => { const r = [...f.relatives]; r[idx] = { ...r[idx], phone: e.target.value.replace(/\D/g, '').slice(0, 10) }; return { ...f, relatives: r }; })}
                                                                    placeholder="10-digit number" maxLength={10} type="tel"
                                                                    style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: '5px', padding: '5px 7px', fontSize: '12px', boxSizing: 'border-box' }} />
                                                            </td>
                                                            <td style={{ padding: '5px 8px', textAlign: 'center', borderBottom: '1px solid #f1f5f9' }}>
                                                                <button type="button" onClick={() => setForm(f => ({ ...f, relatives: f.relatives.filter((_, i) => i !== idx) }))}
                                                                    style={{ background: '#fee2e2', border: 'none', borderRadius: '4px', color: '#dc2626', width: '24px', height: '24px', cursor: 'pointer', fontSize: '14px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
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
// ── Inline booking form (supports token and slot modes) ────────────────────
const BookTokenForm = ({ patient, onBook, onCancel, flash, mode = 'token' }) => {
    const isSlotMode = mode === 'slot';
    const [form, setForm] = useState({ amount: '', serviceName: 'General Consultation', notes: '', appointmentTime: '', paymentMethod: 'Cash' });
    const [booking, setBooking] = useState(false);

    const fee = Number(form.amount) || 0;
    // Payment method is required when fee > 0
    const canSubmit = !booking && (fee === 0 || form.paymentMethod) && (!isSlotMode || form.appointmentTime);

    const submit = async (e) => {
        e.preventDefault();
        if (isSlotMode && !form.appointmentTime) { flash('error', 'Please select an appointment time'); return; }
        if (fee > 0 && !form.paymentMethod) { flash('error', 'Select a payment method to collect the fee'); return; }
        setBooking(true);
        try {
            const payload = {
                patientId:     patient._id,
                amount:        fee,
                serviceName:   form.serviceName,
                notes:         form.notes,
                paymentMethod: fee > 0 ? form.paymentMethod : 'Free',
            };
            if (isSlotMode) payload.appointmentTime = form.appointmentTime;

            const r = await clinicAPI.bookAppointment(payload);
            if (r.success) {
                if (isSlotMode) {
                    flash('success', `✅ Payment collected. Appointment at ${form.appointmentTime} confirmed for ${patient.name}`);
                } else {
                    flash('success', `✅ Payment collected. Token #${r.appointment.tokenNumber} assigned to ${patient.name}`);
                    try { generateTokenReceiptPDF(patient, r.appointment); } catch (pdfErr) { console.error('PDF generation error:', pdfErr); }
                }
                onBook();
            } else flash('error', r.message);
        } catch (e) { flash('error', e.response?.data?.message || e.message); }
        finally { setBooking(false); }
    };

    // Generate 30-minute time slots 07:00–20:00
    const timeSlots = [];
    for (let h = 7; h <= 20; h++) {
        timeSlots.push(`${String(h).padStart(2, '0')}:00`);
        if (h < 20) timeSlots.push(`${String(h).padStart(2, '0')}:30`);
    }

    const borderColor = isSlotMode ? '#bfdbfe' : '#bbf7d0';
    const bgColor     = isSlotMode ? '#eff6ff' : '#f0fdf4';

    return (
        <form onSubmit={submit} style={{ background: bgColor, border: `1px solid ${borderColor}`, borderRadius: '10px', padding: '14px 16px', marginTop: '8px' }}>
            {/* Payment notice */}
            <div style={{ fontSize: '12px', color: '#0369a1', background: '#e0f2fe', border: '1px solid #bae6fd', borderRadius: '6px', padding: '6px 10px', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>💰</span>
                <span><strong>Payment is collected upfront.</strong> Token / appointment is confirmed only after fee is paid.</span>
            </div>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div style={{ flex: '2', minWidth: '150px' }}>
                    <label style={{ fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '3px' }}>Service</label>
                    <input className="clinic-input" placeholder="General Consultation" value={form.serviceName}
                        onChange={e => setForm(f => ({ ...f, serviceName: e.target.value }))} />
                </div>

                {isSlotMode && (
                    <div style={{ flex: '1', minWidth: '120px' }}>
                        <label style={{ fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '3px' }}>Time Slot *</label>
                        <select className="clinic-input" value={form.appointmentTime} onChange={e => setForm(f => ({ ...f, appointmentTime: e.target.value }))} required>
                            <option value="">Select time…</option>
                            {timeSlots.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                    </div>
                )}

                <div style={{ flex: '1', minWidth: '90px' }}>
                    <label style={{ fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '3px' }}>Fee (₹) *</label>
                    <input className="clinic-input" type="number" min="0" placeholder="0" value={form.amount}
                        onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
                </div>

                <div style={{ flex: '1', minWidth: '100px' }}>
                    <label style={{ fontSize: '11px', color: fee > 0 ? '#dc2626' : '#64748b', display: 'block', marginBottom: '3px', fontWeight: fee > 0 ? 700 : 400 }}>
                        Payment Method {fee > 0 ? '*' : ''}
                    </label>
                    <select className="clinic-input" value={form.paymentMethod}
                        onChange={e => setForm(f => ({ ...f, paymentMethod: e.target.value }))}
                        style={{ borderColor: fee > 0 && !form.paymentMethod ? '#dc2626' : '' }}>
                        <option value="Cash">Cash</option>
                        <option value="UPI">UPI</option>
                        <option value="Card">Card</option>
                    </select>
                </div>

                <div style={{ flex: '2', minWidth: '140px' }}>
                    <label style={{ fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '3px' }}>Complaint (optional)</label>
                    <input className="clinic-input" placeholder="Reason for visit..." value={form.notes}
                        onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
                </div>

                <div style={{ display: 'flex', gap: '6px' }}>
                    <button type="submit" className="clinic-btn-primary" disabled={!canSubmit}
                        style={{ whiteSpace: 'nowrap', padding: '8px 16px', opacity: canSubmit ? 1 : 0.6 }}>
                        {booking ? '...' : isSlotMode
                            ? `💰 Pay${fee > 0 ? ` ₹${fee}` : ''} & Book Slot`
                            : `💰 Pay${fee > 0 ? ` ₹${fee}` : ''} & Assign Token`}
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
    // Clinic appointment mode (fetched from config)
    const [appointmentMode, setAppointmentMode] = useState('token');
    // Quick register state
    const [showQuickReg, setShowQuickReg] = useState(false);
    const [qrForm, setQrForm] = useState({ name: '', phone: '', gender: 'Male' });
    const [qrSaving, setQrSaving] = useState(false);

    const flash = (type, text) => { setMsg({ type, text }); setTimeout(() => setMsg({ type: '', text: '' }), 4000); };
    const today = todayStr();
    const isSlotMode = appointmentMode === 'slot';

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

    useEffect(() => {
        clinicAPI.getConfig().then(r => { if (r.success) setAppointmentMode(r.appointmentMode || 'token'); }).catch(() => {});
    }, []);

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
                flash('success', `${r.existing ? 'Found' : 'Registered'}: ${r.patient.patientUid} — ${isSlotMode ? 'book an appointment below.' : 'assign a token below.'}`);
            } else flash('error', r.message);
        } catch (e) { flash('error', e.response?.data?.message || e.message); }
        finally { setQrSaving(false); }
    };

    const cancelAppt = async (id) => {
        if (!window.confirm(isSlotMode ? 'Cancel this appointment?' : 'Cancel this token?')) return;
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
                            {activeTokens.length} {isSlotMode ? 'scheduled' : 'in queue'} · {doneToday.length} done today · {patients.length} total patients
                            <span style={{ marginLeft: '8px', background: isSlotMode ? '#dbeafe' : '#fef3c7', color: isSlotMode ? '#1d4ed8' : '#92400e', padding: '1px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 700 }}>
                                {isSlotMode ? '🕐 Time Slots' : '🎟️ Tokens'}
                            </span>
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
                                    {qrSaving ? '...' : isSlotMode ? '✅ Register & Book' : '✅ Register & Assign Token'}
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
                                                {isSlotMode ? (
                                                    <span style={{ background: '#3b82f6', color: '#fff', fontWeight: 800, padding: '4px 12px', borderRadius: '6px', fontSize: '13px' }}>
                                                        🕐 {appt.appointmentTime}
                                                    </span>
                                                ) : (
                                                    <span style={{ background: '#6366f1', color: '#fff', fontWeight: 800, padding: '4px 12px', borderRadius: '6px', fontSize: '14px' }}>
                                                        #{appt.tokenNumber}
                                                    </span>
                                                )}
                                                <StatusBadge status={appt.status} />
                                                <button className="clinic-btn-remove" onClick={() => cancelAppt(appt._id)}>✕</button>
                                            </>
                                        )}
                                        {isDone && <span style={{ background: '#dcfce7', color: '#16a34a', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 600 }}>✅ Done</span>}
                                        {!hasToken && !isDone && (
                                            <button className="clinic-btn-primary" style={{ fontSize: '12px', padding: '6px 14px', whiteSpace: 'nowrap' }}
                                                onClick={() => setAssigningFor(isExpanding ? null : p._id)}>
                                                {isExpanding ? '✕ Cancel' : isSlotMode ? '🕐 Book Slot' : '🎟️ Assign Token'}
                                            </button>
                                        )}
                                    </div>
                                </div>
                                {isExpanding && !hasToken && (
                                    <BookTokenForm
                                        patient={p}
                                        mode={appointmentMode}
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
// MEDICINE TABLE — prescription editor with per-row autocomplete
// ═══════════════════════════════════════════════════
const MedicineTable = ({ rx, setRx, inventory }) => {
    // Track which row has an open suggestion dropdown, and the live search per row
    const [activeRow, setActiveRow] = useState(null); // index of focused row
    const [rowSearch, setRowSearch] = useState({}); // { [idx]: searchString }

    const getSuggestions = (idx) => {
        const q = (rowSearch[idx] ?? (rx.medicines[idx]?.name || rx.medicines[idx]?.medicineName) ?? '').trim().toLowerCase();
        if (!q || q.length < 1) return [];
        return inventory.filter(inv => inv.name.toLowerCase().includes(q)).slice(0, 8);
    };

    const selectSuggestion = (idx, med) => {
        setRx(r => {
            const ms = [...r.medicines];
            ms[idx] = { ...ms[idx], name: med.name, medicineName: med.name };
            return { ...r, medicines: ms };
        });
        setRowSearch(prev => ({ ...prev, [idx]: med.name }));
        setActiveRow(null);
    };

    const handleNameChange = (idx, value) => {
        setRowSearch(prev => ({ ...prev, [idx]: value }));
        setRx(r => { const ms = [...r.medicines]; ms[idx] = { ...ms[idx], name: value }; return { ...r, medicines: ms }; });
        setActiveRow(idx);
    };

    const handleNameBlur = (idx) => {
        // Small delay so click on suggestion registers first
        setTimeout(() => setActiveRow(prev => prev === idx ? null : prev), 150);
    };

    const inputStyle = { width: '100%', border: '1px solid #e2e8f0', borderRadius: '5px', padding: '5px 7px', fontSize: '12px', boxSizing: 'border-box' };

    return (
        <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'visible' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                    <tr style={{ background: '#f1f5f9' }}>
                        <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 700, color: '#374151', borderBottom: '1px solid #e2e8f0', width: '32%' }}>Medicine Name</th>
                        <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 700, color: '#374151', borderBottom: '1px solid #e2e8f0', width: '23%' }}>Salt / Generic</th>
                        <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 700, color: '#374151', borderBottom: '1px solid #e2e8f0', width: '25%' }}>Dose / Frequency</th>
                        <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 700, color: '#374151', borderBottom: '1px solid #e2e8f0', width: '12%' }}>Days</th>
                        <th style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 700, color: '#374151', borderBottom: '1px solid #e2e8f0', width: '8%' }}></th>
                    </tr>
                </thead>
                <tbody>
                    {rx.medicines.map((m, idx) => {
                        const displayVal = rowSearch[idx] !== undefined ? rowSearch[idx] : (m.name || m.medicineName || '');
                        const suggestions = getSuggestions(idx);
                        const showDropdown = activeRow === idx && suggestions.length > 0;
                        return (
                            <tr key={idx} style={{ background: idx % 2 === 0 ? '#fff' : '#f8fafc' }}>
                                {/* Medicine Name with autocomplete dropdown */}
                                <td style={{ padding: '6px 8px', borderBottom: '1px solid #f1f5f9', position: 'relative', overflow: 'visible' }}>
                                    <input
                                        value={displayVal}
                                        onChange={e => handleNameChange(idx, e.target.value)}
                                        onFocus={() => { setActiveRow(idx); }}
                                        onBlur={() => handleNameBlur(idx)}
                                        placeholder="Type to search medicine…"
                                        style={{ ...inputStyle, borderColor: showDropdown ? '#6366f1' : '#e2e8f0' }}
                                        autoComplete="off"
                                    />
                                    {showDropdown && (
                                        <div style={{
                                            position: 'absolute', top: '100%', left: '8px', right: '8px', zIndex: 999,
                                            background: '#fff', border: '1px solid #6366f1', borderRadius: '6px',
                                            boxShadow: '0 4px 16px rgba(99,102,241,0.15)', overflow: 'hidden',
                                        }}>
                                            {suggestions.map((med, si) => (
                                                <div
                                                    key={med._id}
                                                    onMouseDown={() => selectSuggestion(idx, med)}
                                                    style={{
                                                        padding: '8px 12px', cursor: 'pointer', fontSize: '13px',
                                                        borderBottom: si < suggestions.length - 1 ? '1px solid #f1f5f9' : 'none',
                                                        background: 'transparent',
                                                        display: 'flex', alignItems: 'center', gap: '8px',
                                                    }}
                                                    onMouseEnter={e => e.currentTarget.style.background = '#eff6ff'}
                                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                                >
                                                    <span style={{ color: '#6366f1', fontSize: '14px' }}>💊</span>
                                                    <div>
                                                        <div style={{ fontWeight: 600, color: '#1e293b' }}>{med.name}</div>
                                                        {med.category && <div style={{ fontSize: '11px', color: '#94a3b8' }}>{med.category} · {med.unit || ''}</div>}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </td>
                                <td style={{ padding: '6px 8px', borderBottom: '1px solid #f1f5f9' }}>
                                    <input
                                        value={m.saltName || ''}
                                        onChange={e => setRx(r => { const ms = [...r.medicines]; ms[idx] = { ...ms[idx], saltName: e.target.value }; return { ...r, medicines: ms }; })}
                                        placeholder="e.g. Paracetamol"
                                        style={inputStyle}
                                    />
                                </td>
                                <td style={{ padding: '6px 8px', borderBottom: '1px solid #f1f5f9' }}>
                                    <input
                                        value={m.dose || m.dosage || ''}
                                        onChange={e => setRx(r => { const ms = [...r.medicines]; ms[idx] = { ...ms[idx], dose: e.target.value }; return { ...r, medicines: ms }; })}
                                        placeholder="e.g. 1 OD / 1 BD"
                                        style={inputStyle}
                                    />
                                </td>
                                <td style={{ padding: '6px 8px', borderBottom: '1px solid #f1f5f9' }}>
                                    <input
                                        value={m.days || m.duration || ''}
                                        onChange={e => setRx(r => { const ms = [...r.medicines]; ms[idx] = { ...ms[idx], days: e.target.value }; return { ...r, medicines: ms }; })}
                                        placeholder="e.g. 5"
                                        style={inputStyle}
                                    />
                                </td>
                                <td style={{ padding: '6px 8px', textAlign: 'center', borderBottom: '1px solid #f1f5f9' }}>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setRx(r => ({ ...r, medicines: r.medicines.filter((_, i) => i !== idx) }));
                                            setRowSearch(prev => {
                                                const next = { ...prev };
                                                delete next[idx];
                                                return next;
                                            });
                                        }}
                                        style={{ background: '#fee2e2', border: 'none', borderRadius: '4px', color: '#dc2626', width: '24px', height: '24px', cursor: 'pointer', fontSize: '14px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                                    >×</button>
                                </td>
                            </tr>
                        );
                    })}
                    {rx.medicines.length === 0 && (
                        <tr>
                            <td colSpan={5} style={{ padding: '16px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
                                No medicines added. Click "+ Add Row" to start prescribing.
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
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
    const [vitals, setVitals] = useState({ weight: '', height: '', bmi: '', bp: '', temperature: '', pulse: '', spo2: '', rr: '' });
    const [showVitals, setShowVitals] = useState(true);
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
        setShowVitals(true);
        setRx({
            diagnosis: appt.diagnosis || '',
            notes: appt.doctorNotes || '',
            labTests: (appt.labTests || []).join(', '),
            medicines: appt.pharmacy || [],
        });
        setVitals({
            weight: appt.vitals?.weight || '',
            height: appt.vitals?.height || '',
            bmi: appt.vitals?.bmi || '',
            bp: appt.vitals?.bp || '',
            temperature: appt.vitals?.temperature || '',
            pulse: appt.vitals?.pulse || '',
            spo2: appt.vitals?.spo2 || '',
            rr: appt.vitals?.rr || '',
        });
        if (appt.clinicPatientId?._id) {
            setHistoryLoading(true);
            clinicAPI.getPatientHistory(appt.clinicPatientId._id)
                .then(r => { if (r.success) setPatientHistory(r.appointments || []); })
                .catch(() => {})
                .finally(() => setHistoryLoading(false));
        }
    };


    const handleVitalChange = (field, value) => {
        setVitals(prev => {
            const updated = { ...prev, [field]: value };
            if ((field === 'weight' || field === 'height') && updated.weight && updated.height) {
                const hM = parseFloat(updated.height) / 100;
                if (hM > 0) updated.bmi = (parseFloat(updated.weight) / (hM * hM)).toFixed(1);
            }
            return updated;
        });
    };

    const saveConsult = async () => {
        setSaving(true);
        try {
            const labArr = rx.labTests.split(',').map(t => t.trim()).filter(Boolean);
            const r = await clinicAPI.completeAppointment(consulting._id, {
                diagnosis: rx.diagnosis,
                notes: rx.notes,
                vitals,
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
                try { generatePrescriptionSlipPDF(consulting, rx, vitals); } catch (pdfErr) { console.error('PDF generation error:', pdfErr); }
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
                        {consulting.clinicPatientId?.relatives?.length > 0 && (
                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '4px' }}>
                                {consulting.clinicPatientId.relatives.map((rel, i) => (
                                    <span key={i} style={{ fontSize: '11px', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '4px', padding: '1px 8px', color: '#0369a1' }}>
                                        👤 {rel.name}{rel.relation ? ` (${rel.relation})` : ''}{rel.phone ? ` · ${rel.phone}` : ''}
                                    </span>
                                ))}
                            </div>
                        )}
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
                                        {v.vitals && Object.values(v.vitals).some(x => x) && (
                                            <div style={{ fontSize: '11px', color: '#0369a1', marginTop: '2px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                                {v.vitals.weight && <span>Wt: <b>{v.vitals.weight}kg</b></span>}
                                                {v.vitals.bp && <span>BP: <b>{v.vitals.bp}</b></span>}
                                                {v.vitals.temperature && <span>Temp: <b>{v.vitals.temperature}°F</b></span>}
                                                {v.vitals.pulse && <span>Pulse: <b>{v.vitals.pulse}bpm</b></span>}
                                                {v.vitals.spo2 && <span>SpO₂: <b>{v.vitals.spo2}%</b></span>}
                                            </div>
                                        )}
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

                {/* Patient Reports — inline viewer for doctor */}
                <PatientReportPanel
                    patientId={consulting.clinicPatientId?._id}
                    patientName={consulting.clinicPatientId?.name}
                />

                {/* Vitals Panel */}
                <div style={{ marginBottom: '20px', border: '1px solid #e0f2fe', borderRadius: '10px', overflow: 'hidden' }}>
                    <button
                        type="button"
                        onClick={() => setShowVitals(v => !v)}
                        style={{ width: '100%', background: '#f0f9ff', border: 'none', padding: '10px 16px', textAlign: 'left', cursor: 'pointer', fontWeight: 700, fontSize: '13px', color: '#0369a1', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>🩺 Patient Vitals {Object.values(vitals).some(v => v) ? '✓' : ''}</span>
                        <span>{showVitals ? '▲' : '▼'}</span>
                    </button>
                    {showVitals && (
                        <div style={{ padding: '16px', background: '#fff' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '12px' }}>
                                {/* Weight */}
                                <div>
                                    <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', display: 'block', marginBottom: '4px' }}>⚖️ Weight (kg)</label>
                                    <input className="clinic-input" type="number" placeholder="e.g. 65" value={vitals.weight}
                                        onChange={e => handleVitalChange('weight', e.target.value)} style={{ padding: '7px 10px' }} />
                                </div>
                                {/* Height */}
                                <div>
                                    <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', display: 'block', marginBottom: '4px' }}>📏 Height (cm)</label>
                                    <input className="clinic-input" type="number" placeholder="e.g. 170" value={vitals.height}
                                        onChange={e => handleVitalChange('height', e.target.value)} style={{ padding: '7px 10px' }} />
                                </div>
                                {/* BMI — auto computed */}
                                <div>
                                    <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', display: 'block', marginBottom: '4px' }}>🔢 BMI (auto)</label>
                                    <input className="clinic-input" readOnly value={vitals.bmi}
                                        placeholder="Auto-calculated"
                                        style={{ padding: '7px 10px', background: vitals.bmi ? (parseFloat(vitals.bmi) < 18.5 ? '#fef9c3' : parseFloat(vitals.bmi) < 25 ? '#f0fdf4' : parseFloat(vitals.bmi) < 30 ? '#fff7ed' : '#fef2f2') : '#f8fafc', fontWeight: vitals.bmi ? '700' : '400', color: vitals.bmi ? '#0f172a' : '#94a3b8' }} />
                                    {vitals.bmi && (
                                        <div style={{ fontSize: '10px', marginTop: '2px', color: parseFloat(vitals.bmi) < 18.5 ? '#b45309' : parseFloat(vitals.bmi) < 25 ? '#16a34a' : parseFloat(vitals.bmi) < 30 ? '#ea580c' : '#dc2626', fontWeight: '600' }}>
                                            {parseFloat(vitals.bmi) < 18.5 ? 'Underweight' : parseFloat(vitals.bmi) < 25 ? 'Normal' : parseFloat(vitals.bmi) < 30 ? 'Overweight' : 'Obese'}
                                        </div>
                                    )}
                                </div>
                                {/* BP */}
                                <div>
                                    <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', display: 'block', marginBottom: '4px' }}>💓 BP (mmHg)</label>
                                    <input className="clinic-input" placeholder="e.g. 120/80" value={vitals.bp}
                                        onChange={e => handleVitalChange('bp', e.target.value)} style={{ padding: '7px 10px' }} />
                                </div>
                                {/* Temperature */}
                                <div>
                                    <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', display: 'block', marginBottom: '4px' }}>🌡️ Temp (°F)</label>
                                    <input className="clinic-input" type="number" step="0.1" placeholder="e.g. 98.6" value={vitals.temperature}
                                        onChange={e => handleVitalChange('temperature', e.target.value)} style={{ padding: '7px 10px' }} />
                                </div>
                                {/* Pulse */}
                                <div>
                                    <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', display: 'block', marginBottom: '4px' }}>🫀 Pulse (bpm)</label>
                                    <input className="clinic-input" type="number" placeholder="e.g. 72" value={vitals.pulse}
                                        onChange={e => handleVitalChange('pulse', e.target.value)} style={{ padding: '7px 10px' }} />
                                </div>
                                {/* SpO2 */}
                                <div>
                                    <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', display: 'block', marginBottom: '4px' }}>🫁 SpO₂ (%)</label>
                                    <input className="clinic-input" type="number" placeholder="e.g. 98" value={vitals.spo2}
                                        onChange={e => handleVitalChange('spo2', e.target.value)} style={{ padding: '7px 10px' }} />
                                </div>
                                {/* Respiratory Rate */}
                                <div>
                                    <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', display: 'block', marginBottom: '4px' }}>🌬️ Resp. Rate (/min)</label>
                                    <input className="clinic-input" type="number" placeholder="e.g. 16" value={vitals.rr}
                                        onChange={e => handleVitalChange('rr', e.target.value)} style={{ padding: '7px 10px' }} />
                                </div>
                            </div>
                        </div>
                    )}
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
                </div>

                {/* Prescription — inline Excel-like table with medicine autocomplete */}
                <div style={{ marginTop: '20px' }}>
                    <h4 style={{ marginBottom: '10px', color: '#1e293b' }}>💊 Prescription</h4>

                    {/* Inline table */}
                    <MedicineTable rx={rx} setRx={setRx} inventory={inventory} />

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
// Medicine Registry — simple name list for autocomplete in prescriptions.
// No ordering, billing, or stock management. Just a saved medicine list.
const PharmacyMode = () => {
    const [tab, setTab] = useState('list');
    const [inventory, setInventory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [addForm, setAddForm] = useState({ name: '', category: 'General', unit: 'Tablets' });
    const [adding, setAdding] = useState(false);
    const [search, setSearch] = useState('');
    const [msg, setMsg] = useState({ type: '', text: '' });

    const flash = (type, text) => { setMsg({ type, text }); setTimeout(() => setMsg({ type: '', text: '' }), 3000); };

    const loadInventory = () => {
        setLoading(true);
        clinicAPI.getInventory()
            .then(r => { if (r.success) setInventory(r.inventory || []); })
            .catch(console.error)
            .finally(() => setLoading(false));
    };

    useEffect(() => { loadInventory(); }, []);

    const handleAdd = async (e) => {
        e.preventDefault();
        setAdding(true);
        try {
            const r = await clinicAPI.addInventory({ name: addForm.name, category: addForm.category, unit: addForm.unit });
            if (r.success) {
                setInventory(prev => [...prev, r.item].sort((a, b) => a.name.localeCompare(b.name)));
                setAddForm({ name: '', category: 'General', unit: 'Tablets' });
                setTab('list');
                flash('success', `"${r.item.name}" added to medicine list.`);
            }
        } catch (e) { flash('error', e.response?.data?.message || e.message); }
        finally { setAdding(false); }
    };

    const filtered = search.trim()
        ? inventory.filter(m => m.name.toLowerCase().includes(search.trim().toLowerCase()) || (m.category || '').toLowerCase().includes(search.trim().toLowerCase()))
        : inventory;

    const CATEGORIES = ['General', 'Antibiotic', 'Analgesic', 'Antacid', 'Vitamin', 'Antifungal', 'Antihistamine', 'Other'];
    const UNITS = ['Tablets', 'Capsules', 'Syrup (ml)', 'Injection', 'Cream/Ointment', 'Drops', 'Other'];

    return (
        <div>
            {/* Info Banner */}
            <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '10px', padding: '12px 16px', marginBottom: '16px', fontSize: '13px', color: '#0369a1', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '18px' }}>💡</span>
                <span>This is your <strong>medicine list</strong> — add commonly used medicines here so doctors can quickly select them while prescribing. No stock tracking or billing.</span>
            </div>

            <div className="clinic-sub-tabs">
                {[
                    { id: 'list', label: `💊 Medicine List (${inventory.length})` },
                    { id: 'add',  label: '+ Add Medicine' },
                ].map(t => (
                    <button key={t.id} className={`clinic-sub-tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>{t.label}</button>
                ))}
            </div>

            {msg.text && <div className={`clinic-msg clinic-msg-${msg.type}`}>{msg.text}</div>}

            {loading ? <Spinner /> : (
                <>
                    {tab === 'list' && (
                        <div className="clinic-card">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                                <h3 style={{ margin: 0 }}>💊 Medicine List</h3>
                                <button className="clinic-btn-primary" style={{ fontSize: '12px', padding: '6px 14px' }} onClick={() => setTab('add')}>+ Add Medicine</button>
                            </div>
                            {inventory.length > 0 && (
                                <input
                                    className="clinic-input"
                                    placeholder="Search by name or category…"
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    style={{ marginBottom: '12px', maxWidth: '320px' }}
                                />
                            )}
                            {filtered.length === 0 ? (
                                <Empty text={inventory.length === 0 ? 'No medicines added yet. Click "+ Add Medicine" to get started.' : 'No matches found.'} />
                            ) : (
                                <table className="clinic-table">
                                    <thead>
                                        <tr><th>#</th><th>Medicine Name</th><th>Category</th><th>Unit / Form</th></tr>
                                    </thead>
                                    <tbody>
                                        {filtered.map((m, i) => (
                                            <tr key={m._id}>
                                                <td style={{ color: '#94a3b8', fontSize: '12px', width: '40px' }}>{i + 1}</td>
                                                <td><strong style={{ color: '#1e293b' }}>{m.name}</strong></td>
                                                <td>
                                                    <span style={{ background: '#f1f5f9', color: '#475569', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 600 }}>
                                                        {m.category || 'General'}
                                                    </span>
                                                </td>
                                                <td style={{ fontSize: '12px', color: '#64748b' }}>{m.unit || '—'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    )}

                    {tab === 'add' && (
                        <div className="clinic-card">
                            <h3 style={{ marginBottom: '4px' }}>+ Add Medicine to List</h3>
                            <p style={{ color: '#64748b', fontSize: '13px', margin: '0 0 18px' }}>
                                Add medicines your clinic commonly prescribes. Once added, doctors can search and select them instantly while writing prescriptions.
                            </p>
                            <form onSubmit={handleAdd} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', maxWidth: '640px' }}>
                                <div className="clinic-form-group" style={{ gridColumn: '1 / -1' }}>
                                    <label>Medicine Name *</label>
                                    <input
                                        className="clinic-input"
                                        placeholder="e.g. Paracetamol 500mg"
                                        value={addForm.name}
                                        onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))}
                                        required
                                        autoFocus
                                    />
                                    <small style={{ color: '#94a3b8', fontSize: '11px', marginTop: '3px', display: 'block' }}>
                                        Be specific — include strength if relevant (e.g. "Amoxicillin 250mg")
                                    </small>
                                </div>
                                <div className="clinic-form-group">
                                    <label>Category</label>
                                    <select className="clinic-input" value={addForm.category} onChange={e => setAddForm(f => ({ ...f, category: e.target.value }))}>
                                        {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                                    </select>
                                </div>
                                <div className="clinic-form-group">
                                    <label>Unit / Form</label>
                                    <select className="clinic-input" value={addForm.unit} onChange={e => setAddForm(f => ({ ...f, unit: e.target.value }))}>
                                        {UNITS.map(u => <option key={u}>{u}</option>)}
                                    </select>
                                </div>
                                <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '10px', alignItems: 'center' }}>
                                    <button type="submit" className="clinic-btn-primary" disabled={adding}>
                                        {adding ? 'Adding…' : '+ Add to List'}
                                    </button>
                                    <button type="button" className="clinic-btn-secondary" onClick={() => { setTab('list'); setAddForm({ name: '', category: 'General', unit: 'Tablets' }); }}>
                                        Cancel
                                    </button>
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
    const [view, setView] = useState('list');
    const [plans, setPlans] = useState([]);
    const [todayDue, setTodayDue] = useState([]);
    const [selectedPlan, setSelectedPlan] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState({ type: '', text: '' });

    const [patients, setPatients] = useState([]);
    const [patSearch, setPatSearch] = useState('');
    const [form, setForm] = useState({
        clinicPatientId: '', title: '', description: '',
        totalAmount: '', totalDurationDays: '', startDate: '', intervalDays: '', numberOfVisits: '',
    });
    const [visits, setVisits] = useState([]);

    const [payModal, setPayModal] = useState(null);
    const [payInput, setPayInput] = useState({ amountPaid: '', paymentMethod: 'Cash', notes: '' });

    const flash = (type, text) => { setMsg({ type, text }); setTimeout(() => setMsg({ type: '', text: '' }), 5000); };

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

    useEffect(() => {
        const n = parseInt(form.numberOfVisits);
        const interval = parseInt(form.intervalDays);
        const start = form.startDate;
        if (!n || !start) return;
        const base = new Date(start);
        setVisits(Array.from({ length: n }, (_, i) => {
            const d = new Date(base);
            d.setDate(d.getDate() + (interval || 0) * i);
            return { visitNumber: i + 1, scheduledDate: d.toISOString().split('T')[0], scheduledTime: '', procedure: '' };
        }));
    }, [form.numberOfVisits, form.intervalDays, form.startDate]);

    const loadPatients = async (search) => {
        try { const r = await clinicAPI.getPatients(search); if (r.success) setPatients(r.patients || []); } catch { }
    };

    const handleCreateSubmit = async () => {
        if (!form.clinicPatientId || !form.title || !form.totalAmount || visits.length === 0)
            return flash('error', 'Patient, title, total amount and at least one visit are required.');
        if (visits.some(v => !v.scheduledDate)) return flash('error', 'All visits must have a scheduled date.');
        setSaving(true);
        try {
            const r = await clinicAPI.createTreatmentPlan({ ...form, visits });
            if (r.success) {
                flash('success', 'Treatment plan created.');
                setPlans(prev => [r.plan, ...prev]);
                setView('list');
                setForm({ clinicPatientId: '', title: '', description: '', totalAmount: '', totalDurationDays: '', startDate: '', intervalDays: '', numberOfVisits: '' });
                setVisits([]);
                setPatSearch('');
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
        const paid = Number(payInput.amountPaid) || 0;
        if (paid <= 0) return flash('error', 'Enter a valid amount.');
        setSaving(true);
        try {
            const r = await clinicAPI.payVisit(payModal.planId, payModal.visit._id, {
                amountPaid: paid, paymentMethod: payInput.paymentMethod, notes: payInput.notes,
            });
            if (r.success) {
                setSelectedPlan(r.plan);
                setPlans(prev => prev.map(p => p._id === r.plan._id ? r.plan : p));
                setPayModal(null);
                flash('success', `₹${paid.toLocaleString('en-IN')} recorded. Remaining balance: ₹${r.plan.pendingBalance.toLocaleString('en-IN')}`);
            } else flash('error', r.message);
        } catch (e) { flash('error', e.response?.data?.message || e.message); }
        finally { setSaving(false); }
    };

    const handleComplete = async (planId, visitId) => {
        const plan = selectedPlan;
        const remainingScheduled = plan.visits.filter(v => v.status === 'scheduled' && v._id !== visitId);
        const isLast = remainingScheduled.length === 0;
        if (isLast && plan.pendingBalance > 0) {
            return flash('error', `❌ Cannot close treatment — ₹${plan.pendingBalance.toLocaleString('en-IN')} is still unpaid. Collect full payment before closing the last visit.`);
        }
        if (!window.confirm('Mark this visit as completed?')) return;
        try {
            const r = await clinicAPI.completeVisit(planId, visitId, {});
            if (r.success) {
                setSelectedPlan(r.plan);
                setPlans(prev => prev.map(p => p._id === r.plan._id ? r.plan : p));
                flash('success', r.plan.status === 'completed' ? '🎉 Treatment plan completed!' : 'Visit marked completed.');
            } else flash('error', r.message);
        } catch (e) { flash('error', e.response?.data?.message || e.message); }
    };

    const handleMiss = async (planId, visitId) => {
        if (!window.confirm('Mark this visit as missed?')) return;
        try {
            const r = await clinicAPI.missVisit(planId, visitId);
            if (r.success) {
                setSelectedPlan(r.plan);
                setPlans(prev => prev.map(p => p._id === r.plan._id ? r.plan : p));
                flash('success', 'Visit marked as missed.');
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
            {todayDue.length > 0 && (
                <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '10px', padding: '14px 18px', marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ fontWeight: '800', color: '#92400e', fontSize: '14px' }}>🔔 Today's Visits Due</div>
                    {todayDue.map(plan => plan.visits.filter(v => {
                        const d = new Date(v.scheduledDate);
                        return d.toDateString() === new Date().toDateString() && v.status === 'scheduled';
                    }).map(v => (
                        <div key={v._id} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', color: '#78350f' }}>
                            <span style={{ fontWeight: '700' }}>📋 {plan.clinicPatientId?.name}</span>
                            <span>— Visit {v.visitNumber} · "{plan.title}"</span>
                            {v.scheduledTime && <span style={{ background: '#fef3c7', padding: '1px 8px', borderRadius: '4px', fontWeight: '700' }}>🕐 {v.scheduledTime}</span>}
                            {plan.pendingBalance > 0 && <span style={{ color: '#dc2626', fontWeight: '700' }}>₹{plan.pendingBalance.toLocaleString('en-IN')} pending</span>}
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

            {loading ? <Spinner /> : plans.length === 0 ? <Empty text="No treatment plans yet." /> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {plans.map(plan => {
                        const nextVisit = plan.visits.find(v => v.status === 'scheduled');
                        const pct = plan.totalAmount > 0 ? Math.min(100, Math.round((plan.totalPaid / plan.totalAmount) * 100)) : 0;
                        return (
                            <div key={plan._id} className="clinic-card" style={{ padding: '16px', cursor: 'pointer', borderLeft: `4px solid ${planStatusColor[plan.status] || '#94a3b8'}` }} onClick={() => openDetail(plan)}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
                                    <div>
                                        <div style={{ fontWeight: '800', fontSize: '15px', color: '#0f172a' }}>{plan.title}</div>
                                        <div style={{ fontSize: '13px', color: '#475569', marginTop: '2px' }}>👤 {plan.clinicPatientId?.name || '—'} · {plan.clinicPatientId?.patientUid || ''}</div>
                                        {plan.description && <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>{plan.description}</div>}
                                    </div>
                                    <span style={{ fontSize: '11px', fontWeight: '700', padding: '3px 10px', borderRadius: '20px', background: planStatusColor[plan.status] + '20', color: planStatusColor[plan.status], textTransform: 'uppercase' }}>{plan.status}</span>
                                </div>
                                {/* Payment progress bar */}
                                <div style={{ marginTop: '10px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#64748b', marginBottom: '4px' }}>
                                        <span>Paid: <b style={{ color: '#16a34a' }}>₹{plan.totalPaid.toLocaleString('en-IN')}</b> of <b>₹{plan.totalAmount.toLocaleString('en-IN')}</b></span>
                                        <span style={{ color: plan.pendingBalance > 0 ? '#dc2626' : '#16a34a', fontWeight: '700' }}>
                                            {plan.pendingBalance > 0 ? `₹${plan.pendingBalance.toLocaleString('en-IN')} due` : '✓ Fully Paid'}
                                        </span>
                                    </div>
                                    <div style={{ background: '#e2e8f0', borderRadius: '4px', height: '6px', overflow: 'hidden' }}>
                                        <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? '#16a34a' : '#0891b2', borderRadius: '4px', transition: 'width 0.3s' }} />
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '16px', marginTop: '8px', flexWrap: 'wrap', fontSize: '12px', color: '#475569' }}>
                                    <span>📋 <b>{plan.visits.filter(v => v.status === 'completed').length}</b>/{plan.visits.length} visits done</span>
                                    {nextVisit && <span style={{ color: '#0891b2' }}>📅 Next: <b>{new Date(nextVisit.scheduledDate).toLocaleDateString('en-IN')}</b>{nextVisit.scheduledTime ? ' · ' + nextVisit.scheduledTime : ''}</span>}
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
                    <input className="clinic-input" placeholder="Search by name or ID..."
                        value={patSearch}
                        onChange={e => { setPatSearch(e.target.value); loadPatients(e.target.value); }} />
                    {patients.length > 0 && !form.clinicPatientId && (
                        <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', maxHeight: '160px', overflowY: 'auto', marginTop: '4px' }}>
                            {patients.map(p => (
                                <div key={p._id} onClick={() => { setForm(f => ({ ...f, clinicPatientId: p._id })); setPatSearch(`${p.name} (${p.patientUid || p.phone})`); setPatients([]); }}
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

                <div className="clinic-form-grid">
                    <div className="clinic-form-group" style={{ gridColumn: '1/-1' }}>
                        <label>Plan Title *</label>
                        <input className="clinic-input" placeholder="e.g. Root Canal, Orthodontic Course..." value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
                    </div>
                    <div className="clinic-form-group" style={{ gridColumn: '1/-1' }}>
                        <label>Description / Notes</label>
                        <textarea className="clinic-input" rows={2} placeholder="Brief description..." value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
                    </div>
                    {/* Total Amount — single field for the whole treatment */}
                    <div className="clinic-form-group">
                        <label>💰 Total Treatment Amount (₹) *</label>
                        <input className="clinic-input" type="number" min="1" placeholder="e.g. 5000" value={form.totalAmount} onChange={e => setForm(f => ({ ...f, totalAmount: e.target.value }))} />
                        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '3px' }}>Patient can pay any amount at any visit. Case closes only when fully paid.</div>
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

                {visits.length > 0 && (
                    <div style={{ marginTop: '20px' }}>
                        <h4 style={{ margin: '0 0 10px', color: '#0f172a' }}>Visit Schedule</h4>
                        <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                <thead>
                                    <tr style={{ background: '#f1f5f9' }}>
                                        {['#', 'Date', 'Time', 'Procedure / Notes'].map(h => (
                                            <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: '700', color: '#374151', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {visits.map((v, idx) => (
                                        <tr key={idx} style={{ background: idx % 2 === 0 ? '#fff' : '#f8fafc' }}>
                                            <td style={{ padding: '6px 10px', borderBottom: '1px solid #f1f5f9', fontWeight: '700', color: '#6366f1', width: '6%' }}>{v.visitNumber}</td>
                                            <td style={{ padding: '6px 8px', borderBottom: '1px solid #f1f5f9', width: '22%' }}>
                                                <input type="date" value={v.scheduledDate}
                                                    onChange={e => setVisits(p => { const a = [...p]; a[idx] = { ...a[idx], scheduledDate: e.target.value }; return a; })}
                                                    style={{ border: '1px solid #e2e8f0', borderRadius: '5px', padding: '4px 6px', fontSize: '12px', width: '100%', boxSizing: 'border-box' }} />
                                            </td>
                                            <td style={{ padding: '6px 8px', borderBottom: '1px solid #f1f5f9', width: '18%' }}>
                                                <input type="time" value={v.scheduledTime}
                                                    onChange={e => setVisits(p => { const a = [...p]; a[idx] = { ...a[idx], scheduledTime: e.target.value }; return a; })}
                                                    style={{ border: '1px solid #e2e8f0', borderRadius: '5px', padding: '4px 6px', fontSize: '12px', width: '100%', boxSizing: 'border-box' }} />
                                            </td>
                                            <td style={{ padding: '6px 8px', borderBottom: '1px solid #f1f5f9' }}>
                                                <input value={v.procedure}
                                                    onChange={e => setVisits(p => { const a = [...p]; a[idx] = { ...a[idx], procedure: e.target.value }; return a; })}
                                                    placeholder="e.g. Canal cleaning, X-ray..."
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
    if (view === 'detail' && selectedPlan) {
        const isLastScheduled = (visitId) => selectedPlan.visits.filter(v => v.status === 'scheduled' && v._id !== visitId).length === 0;
        return (
        <div>
            <button className="clinic-back-btn" onClick={() => setView('list')}>← Back to Plans</button>
            {msg.text && <div className={`clinic-msg clinic-msg-${msg.type}`} style={{ marginTop: '10px' }}>{msg.text}</div>}

            <div className="clinic-card" style={{ marginTop: '12px' }}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px', marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px solid #f1f5f9' }}>
                    <div>
                        <h3 style={{ margin: '0 0 4px', color: '#0f172a' }}>{selectedPlan.title}</h3>
                        <div style={{ fontSize: '13px', color: '#64748b' }}>👤 {selectedPlan.clinicPatientId?.name} · {selectedPlan.clinicPatientId?.patientUid || ''} · {selectedPlan.clinicPatientId?.phone || ''}</div>
                        {selectedPlan.description && <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>{selectedPlan.description}</div>}
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <span style={{ fontSize: '11px', fontWeight: '700', padding: '4px 12px', borderRadius: '20px', background: (planStatusColor[selectedPlan.status] || '#94a3b8') + '20', color: planStatusColor[selectedPlan.status] || '#94a3b8', textTransform: 'uppercase' }}>{selectedPlan.status}</span>
                        {selectedPlan.status === 'active' && <button onClick={() => handleCancel(selectedPlan._id)} style={{ fontSize: '11px', padding: '4px 12px', background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '700' }}>Cancel Plan</button>}
                    </div>
                </div>

                {/* Financial Summary */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px', marginBottom: '16px' }}>
                    {[
                        { label: 'Total Amount', value: '₹' + selectedPlan.totalAmount.toLocaleString('en-IN'), color: '#6366f1' },
                        { label: 'Total Paid', value: '₹' + selectedPlan.totalPaid.toLocaleString('en-IN'), color: '#16a34a' },
                        { label: 'Balance Due', value: selectedPlan.pendingBalance > 0 ? '₹' + selectedPlan.pendingBalance.toLocaleString('en-IN') : '✓ Cleared', color: selectedPlan.pendingBalance > 0 ? '#dc2626' : '#16a34a' },
                        { label: 'Visits Done', value: `${selectedPlan.visits.filter(v => v.status === 'completed').length} / ${selectedPlan.visits.length}`, color: '#0891b2' },
                    ].map((s, i) => (
                        <div key={i} style={{ background: '#f8fafc', borderRadius: '8px', padding: '12px', borderTop: `3px solid ${s.color}` }}>
                            <div style={{ fontSize: '18px', fontWeight: '800', color: s.color }}>{s.value}</div>
                            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>{s.label}</div>
                        </div>
                    ))}
                </div>

                {/* Progress bar */}
                {selectedPlan.totalAmount > 0 && (
                    <div style={{ marginBottom: '20px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#64748b', marginBottom: '4px' }}>
                            <span>Payment Progress</span>
                            <span>{Math.min(100, Math.round((selectedPlan.totalPaid / selectedPlan.totalAmount) * 100))}%</span>
                        </div>
                        <div style={{ background: '#e2e8f0', borderRadius: '6px', height: '8px', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${Math.min(100, Math.round((selectedPlan.totalPaid / selectedPlan.totalAmount) * 100))}%`, background: selectedPlan.pendingBalance === 0 ? '#16a34a' : '#0891b2', borderRadius: '6px', transition: 'width 0.3s' }} />
                        </div>
                    </div>
                )}

                {/* Warning if last visit and balance pending */}
                {selectedPlan.status === 'active' && selectedPlan.pendingBalance > 0 && selectedPlan.visits.filter(v => v.status === 'scheduled').length === 1 && (
                    <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', fontSize: '13px', color: '#dc2626' }}>
                        ⚠️ <b>Last visit remaining.</b> Patient must pay ₹{selectedPlan.pendingBalance.toLocaleString('en-IN')} before this visit can be closed.
                    </div>
                )}

                {/* Visits Table */}
                <h4 style={{ margin: '0 0 12px', color: '#0f172a' }}>Visit Schedule</h4>
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                        <thead>
                            <tr style={{ background: '#f1f5f9' }}>
                                {['#', 'Date & Time', 'Procedure', 'Paid This Visit', 'Status', 'Actions'].map(h => (
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
                                    <td style={{ padding: '8px 10px', borderBottom: '1px solid #f1f5f9', fontSize: '12px', maxWidth: '140px' }}>
                                        <div>{v.procedure || '—'}</div>
                                        {v.notes && <div style={{ color: '#94a3b8', fontSize: '11px' }}>{v.notes}</div>}
                                    </td>
                                    <td style={{ padding: '8px 10px', borderBottom: '1px solid #f1f5f9', fontWeight: '600' }}>
                                        {v.amountPaid > 0
                                            ? <span style={{ color: '#16a34a' }}>₹{v.amountPaid.toLocaleString('en-IN')}{v.paymentMethod ? ` · ${v.paymentMethod}` : ''}</span>
                                            : <span style={{ color: '#94a3b8', fontSize: '11px' }}>—</span>}
                                    </td>
                                    <td style={{ padding: '8px 10px', borderBottom: '1px solid #f1f5f9' }}>
                                        <span style={{ fontSize: '11px', fontWeight: '700', padding: '3px 8px', borderRadius: '4px', background: (visitStatusColor[v.status] || '#94a3b8') + '20', color: visitStatusColor[v.status] || '#94a3b8', textTransform: 'uppercase' }}>{v.status}</span>
                                    </td>
                                    <td style={{ padding: '8px 10px', borderBottom: '1px solid #f1f5f9' }}>
                                        {v.status === 'scheduled' && selectedPlan.status === 'active' && (
                                            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                                <button
                                                    onClick={() => { setPayModal({ visit: v, planId: selectedPlan._id }); setPayInput({ amountPaid: '', paymentMethod: 'Cash', notes: '' }); }}
                                                    style={{ fontSize: '11px', padding: '3px 8px', background: '#dcfce7', color: '#16a34a', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: '700' }}>
                                                    💵 Pay
                                                </button>
                                                <button
                                                    onClick={() => handleComplete(selectedPlan._id, v._id)}
                                                    disabled={isLastScheduled(v._id) && selectedPlan.pendingBalance > 0}
                                                    title={isLastScheduled(v._id) && selectedPlan.pendingBalance > 0 ? `Collect ₹${selectedPlan.pendingBalance.toLocaleString('en-IN')} first` : ''}
                                                    style={{ fontSize: '11px', padding: '3px 8px', background: isLastScheduled(v._id) && selectedPlan.pendingBalance > 0 ? '#f1f5f9' : '#dbeafe', color: isLastScheduled(v._id) && selectedPlan.pendingBalance > 0 ? '#94a3b8' : '#1d4ed8', border: 'none', borderRadius: '4px', cursor: isLastScheduled(v._id) && selectedPlan.pendingBalance > 0 ? 'not-allowed' : 'pointer', fontWeight: '700' }}>
                                                    ✓ Done
                                                </button>
                                                <button
                                                    onClick={() => handleMiss(selectedPlan._id, v._id)}
                                                    style={{ fontSize: '11px', padding: '3px 8px', background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: '700' }}>
                                                    ✗ Missed
                                                </button>
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
                    <div style={{ background: '#fff', borderRadius: '14px', padding: '28px', width: '420px', maxWidth: '95vw', boxShadow: '0 20px 40px rgba(0,0,0,0.15)' }}>
                        <h3 style={{ margin: '0 0 16px', color: '#0f172a' }}>💵 Record Payment — Visit {payModal.visit.visitNumber}</h3>
                        {/* Overall plan balance */}
                        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px', marginBottom: '16px', fontSize: '13px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span>Total Treatment</span><b>₹{selectedPlan.totalAmount.toLocaleString('en-IN')}</b>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
                                <span>Paid so far</span><b style={{ color: '#16a34a' }}>₹{selectedPlan.totalPaid.toLocaleString('en-IN')}</b>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', fontWeight: '800', color: '#dc2626', fontSize: '14px' }}>
                                <span>Outstanding Balance</span><span>₹{selectedPlan.pendingBalance.toLocaleString('en-IN')}</span>
                            </div>
                        </div>
                        <div className="clinic-form-group" style={{ marginBottom: '12px' }}>
                            <label>Amount Paying Now (₹) *</label>
                            <input className="clinic-input" type="number" min="1" placeholder={`Up to ₹${selectedPlan.pendingBalance.toLocaleString('en-IN')}`}
                                value={payInput.amountPaid}
                                onChange={e => setPayInput(p => ({ ...p, amountPaid: e.target.value }))} />
                            {payInput.amountPaid > 0 && (
                                <div style={{ fontSize: '12px', marginTop: '4px', color: Number(payInput.amountPaid) >= selectedPlan.pendingBalance ? '#16a34a' : '#f97316', fontWeight: '600' }}>
                                    {Number(payInput.amountPaid) >= selectedPlan.pendingBalance
                                        ? '✓ This will clear the full outstanding balance.'
                                        : `After payment: ₹${Math.max(0, selectedPlan.pendingBalance - Number(payInput.amountPaid)).toLocaleString('en-IN')} still pending.`}
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
                            <input className="clinic-input" placeholder="e.g. Advance, partial..." value={payInput.notes} onChange={e => setPayInput(p => ({ ...p, notes: e.target.value }))} />
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
    }

    return null;
};

// ═══════════════════════════════════════════════════
// BILLING MODE — Collection history only. All payments are upfront.
// ═══════════════════════════════════════════════════
const BillingMode = () => {
    const [appointments, setAppointments] = useState([]);
    const [allAppointments, setAllAppointments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState(null);
    const [patSearch, setPatSearch] = useState('');

    useEffect(() => {
        Promise.all([
            clinicAPI.getAppointments(),
            clinicAPI.getStats(),
        ]).then(([apptR, statsR]) => {
            if (apptR.success) {
                // Only show paid appointments (all should be paid, but filter defensively)
                const paid = apptR.appointments.filter(a => a.paymentStatus === 'paid');
                setAllAppointments(paid);
                setAppointments(paid);
            }
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

    const todayTotal = allAppointments
        .filter(a => new Date(a.appointmentDate).toDateString() === new Date().toDateString())
        .reduce((s, a) => s + (a.amount || 0), 0);

    return (
        <div>
            {/* Collection Summary Strip */}
            {stats && (
                <div className="clinic-kpi-grid" style={{ marginBottom: '20px' }}>
                    {[
                        { label: 'Total Collection', value: fmt(stats.totalRevenue),  icon: '💰', color: '#f59e0b' },
                        { label: "Today's Collection",  value: fmt(todayTotal),        icon: '📅', color: '#10b981' },
                        { label: 'This Month',           value: fmt(stats.monthRevenue), icon: '📊', color: '#6366f1' },
                        { label: 'Total Paid Visits',    value: allAppointments.length,  icon: '✅', color: '#0ea5e9' },
                    ].map((k, i) => (
                        <div key={i} className="clinic-kpi-card" style={{ borderTop: `4px solid ${k.color}` }}>
                            <div style={{ fontSize: '24px' }}>{k.icon}</div>
                            <div style={{ fontSize: '20px', fontWeight: 800, color: k.color }}>{k.value}</div>
                            <div style={{ fontSize: '12px', color: '#64748b' }}>{k.label}</div>
                        </div>
                    ))}
                </div>
            )}

            <div className="clinic-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                    <h3 style={{ margin: 0 }}>🧾 Collection Records</h3>
                    <span style={{ fontSize: '12px', background: '#dcfce7', color: '#16a34a', padding: '3px 10px', borderRadius: '10px', fontWeight: 700 }}>
                        All payments collected upfront
                    </span>
                </div>

                <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
                    <input className="clinic-input" style={{ flex: 1 }} placeholder="Search by patient name or ID…"
                        value={patSearch} onChange={e => setPatSearch(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && filterByPatient()} />
                    <button className="clinic-btn-secondary" onClick={filterByPatient}>Search</button>
                    {patSearch && <button className="clinic-btn-secondary" onClick={() => { setPatSearch(''); setAppointments(allAppointments); }}>✕ Clear</button>}
                </div>

                {loading ? <Spinner /> : appointments.length === 0 ? (
                    <Empty text="No collection records yet." />
                ) : (
                    <table className="clinic-table">
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Token / Slot</th>
                                <th>Patient</th>
                                <th>Service</th>
                                <th>Fee</th>
                                <th>Method</th>
                                <th>Visit Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {appointments.map(a => (
                                <tr key={a._id}>
                                    <td style={{ fontSize: '12px' }}>{fmtDate(a.appointmentDate)}</td>
                                    <td>
                                        {a.tokenNumber
                                            ? <strong style={{ color: '#6366f1' }}>#{a.tokenNumber}</strong>
                                            : <span style={{ color: '#3b82f6', fontWeight: 600 }}>🕐 {a.appointmentTime}</span>}
                                    </td>
                                    <td>
                                        <div style={{ fontWeight: 600 }}>{a.clinicPatientId?.name || '—'}</div>
                                        <div style={{ fontSize: '11px', color: '#94a3b8' }}>{a.clinicPatientId?.patientUid || a.patientId}</div>
                                    </td>
                                    <td style={{ fontSize: '12px', color: '#64748b' }}>{a.serviceName || 'General'}</td>
                                    <td><strong style={{ color: '#16a34a' }}>{fmt(a.amount)}</strong></td>
                                    <td>
                                        <span style={{ background: '#f1f5f9', color: '#475569', padding: '2px 8px', borderRadius: '8px', fontSize: '11px', fontWeight: 600 }}>
                                            {a.paymentMethod || 'Cash'}
                                        </span>
                                    </td>
                                    <td><StatusBadge status={a.status} /></td>
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
