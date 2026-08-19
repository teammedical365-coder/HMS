import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { doctorAPI, uploadAPI, reportAPI, referralAPI, otAPI } from '../../utils/api';

const Patient = () => {
    const navigate = useNavigate();
    const [appointments, setAppointments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState('today');
    const [vitalsPatient, setVitalsPatient] = useState(null);
    const [uploadPatient, setUploadPatient] = useState(null);
    const [uploadFile, setUploadFile] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [vitals, setVitals] = useState({
        weight: '', height: '', bmi: '', bloodPressure: '',
        pulse: '', temperature: '', spo2: '', respiratoryRate: '',
        chiefComplaint: '', notes: ''
    });
    const [saving, setSaving] = useState(false);
    const [myReferrals, setMyReferrals] = useState([]);
    const [mySurgeryPlans, setMySurgeryPlans] = useState([]);

    useEffect(() => {
        fetchAllAppointments();
        fetchMyReferrals();
        fetchMySurgeryPlans();
    }, []);

    const fetchMyReferrals = async () => {
        try {
            const res = await referralAPI.getMyReferrals();
            if (res.success) {
                setMyReferrals(res.referrals || []);
            }
        } catch (err) {
            console.error("Error fetching referrals:", err);
        }
    };

    const fetchMySurgeryPlans = async () => {
        try {
            const res = await otAPI.getMySurgeryPlans();
            if (res.success) {
                setMySurgeryPlans(res.data || []);
            }
        } catch (err) {
            console.error("Error fetching my surgery plans:", err);
        }
    };

    const fetchAllAppointments = async () => {
        setLoading(true);
        setError(null);
        try {
            const user = JSON.parse(localStorage.getItem('user') || '{}');
            const role = (user.role || '').toLowerCase();
            const permissions = user.permissions || [];
            
            const staffRoles = ['nurse', 'admin', 'superadmin', 'hospitaladmin', 'reception', 'receptionist'];
            const isAdminOrStaff = staffRoles.some(r => role.includes(r));
            const isDoctor = role.includes('doctor');
            const isClinicDoctor = isDoctor && user.clinicType === 'clinic';
            
            const hasViewAllAccess = isClinicDoctor || (!isDoctor && (isAdminOrStaff || permissions.includes('patient_view') || permissions.includes('appointment_view_all')));

            const res = hasViewAllAccess
                ? await doctorAPI.getAllAppointments()
                : await doctorAPI.getAppointments();

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

    const handleUploadReport = async (e) => {
        e.preventDefault();
        if (!uploadFile) return;
        setUploading(true);

        try {
            const formData = new FormData();
            formData.append('reportFile', uploadFile);
            formData.append('appointmentId', uploadPatient._id);
            
            const res = await reportAPI.uploadReport(formData);
            if (res.success && res.report) {
                const uploadedFile = res.report;
                const patientId = uploadPatient.userId?._id || uploadPatient.clinicPatientId?.patientUid || uploadPatient.clinicPatientId?._id || uploadPatient.patientId;
                
                const isClinic = !!uploadPatient.clinicPatientId;
                const existingReports = isClinic 
                    ? (uploadPatient.clinicPatientId?.reports || []).map(r => ({
                        fileName: r.name,
                        url: (r.filename || '').startsWith('http://') || (r.filename || '').startsWith('https://')
                            ? r.filename
                            : `${import.meta.env.VITE_API_URL || 'https://hms-n6nk.onrender.com'}/api/patients/reports/${encodeURIComponent(r.filename)}`,
                        date: r.uploadedAt
                      }))
                    : (uploadPatient.userId?.fertilityProfile?.previousReports || []);
                
                const newReport = {
                    fileName: uploadFile.name,
                    url: uploadedFile.url,
                    date: new Date().toISOString()
                };

                await doctorAPI.updatePatientProfile(patientId, {
                    previousReports: [...existingReports, newReport]
                });

                alert("Report uploaded successfully!");
                setUploadPatient(null);
                setUploadFile(null);
                fetchAllAppointments();
            } else {
                throw new Error("Upload failed");
            }
        } catch (err) {
            console.error(err);
            alert("Error uploading report: " + (err.message || ''));
        } finally {
            setUploading(false);
        }
    };

    const handleSaveVitals = async () => {
        if (!vitalsPatient) return;
        setSaving(true);
        try {
            const patientId = vitalsPatient.clinicPatientId?._id || vitalsPatient.clinicPatientId || vitalsPatient.userId?._id || vitalsPatient.userId;
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

            if (vitals.chiefComplaint || vitals.notes) {
                try {
                    await doctorAPI.updateSession(vitalsPatient._id, {
                        notes: `Chief Complaint: ${vitals.chiefComplaint}\nNurse Notes: ${vitals.notes}`
                    });
                } catch (e) {}
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
        let existing = {};
        if (apt.clinicPatientId) {
            existing = apt.clinicPatientId.vitals || {};
            if (!existing.weight && apt.vitals) {
                existing = {
                    weight: apt.vitals.weight,
                    height: apt.vitals.height,
                    bmi: apt.vitals.bmi,
                    bloodPressure: apt.vitals.bp,
                    pulse: apt.vitals.pulse,
                    temperature: apt.vitals.temperature,
                    spo2: apt.vitals.spo2,
                    respiratoryRate: apt.vitals.rr
                };
            }
        } else {
            existing = apt.userId?.fertilityProfile?.vitals || {};
        }

        setVitals({
            weight: existing.weight || '',
            height: existing.height || '',
            bmi: existing.bmi || '',
            bloodPressure: existing.bloodPressure || existing.bp || '',
            pulse: existing.pulse || '',
            temperature: existing.temperature || '',
            spo2: existing.spo2 || '',
            respiratoryRate: existing.respiratoryRate || existing.rr || '',
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
    const allAppts = filtered;

    const displayList = activeTab === 'today' ? todayAppts : allAppts;

    // Stat counts
    const todayTotal = appointments.filter(a => new Date(a.appointmentDate).toDateString() === todayStr).length;
    const pendingToday = appointments.filter(a => (a.status === 'pending' || a.status === 'confirmed') && new Date(a.appointmentDate).toDateString() === todayStr).length;
    const totalPatientsUnique = new Set(appointments.map(a => a.userId?._id || a.patientId)).size;
    const upcomingAppointments = appointments.filter(a => {
        const d = new Date(a.appointmentDate);
        const today = new Date();
        today.setHours(0,0,0,0);
        return d >= today && (a.status === 'pending' || a.status === 'confirmed');
    }).length;

    const completedToday = appointments.filter(a => a.status === 'completed' && new Date(a.appointmentDate).toDateString() === todayStr).length;

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
        page: { minHeight: '100vh', background: 'transparent', fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif", width: '100%', maxWidth: '100%', boxSizing: 'border-box', overflow: 'hidden' },
        statsRow: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px', padding: '0 0 20px', boxSizing: 'border-box' },
        statCard: (gradient) => ({ background: '#ffffff', borderRadius: '16px', padding: '18px 20px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '14px', transition: 'transform 0.2s', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }),
        statIcon: (gradient) => ({ width: '46px', height: '46px', borderRadius: '13px', background: gradient, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', flexShrink: 0 }),
        statNum: { color: '#0f172a', fontSize: '1.6rem', fontWeight: '800', lineHeight: 1.1 },
        statLabel: { color: '#475569', fontSize: '0.75rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '2px' },
        controls: { padding: '0 0 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '14px', flexWrap: 'wrap', boxSizing: 'border-box' },
        searchWrap: { position: 'relative', flex: 1, maxWidth: '420px' },
        searchInput: { width: '100%', padding: '11px 16px 11px 42px', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '12px', color: '#0f172a', fontSize: '0.88rem', outline: 'none', transition: 'border 0.2s', boxSizing: 'border-box' },
        searchIcon: { position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#475569', fontSize: '1rem' },
        tabsWrap: { display: 'flex', gap: '4px', background: '#f1f5f9', padding: '4px', borderRadius: '12px', border: '1px solid #cbd5e1' },
        tab: (active) => ({ padding: '8px 20px', borderRadius: '9px', border: 'none', cursor: 'pointer', fontWeight: '700', fontSize: '0.82rem', transition: 'all 0.25s', background: active ? 'linear-gradient(135deg, #3b82f6, #6366f1)' : 'transparent', color: active ? '#fff' : '#475569', boxShadow: active ? '0 2px 12px rgba(59,130,246,0.25)' : 'none' }),
        content: { padding: '0 0 40px', boxSizing: 'border-box', width: '100%', maxWidth: '100%' },
        sectionHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' },
        sectionTitle: { color: '#0f172a', fontSize: '1rem', fontWeight: '700', margin: 0 },
        sectionCount: { color: '#475569', fontSize: '0.82rem', fontWeight: '600' },
        table: { width: '100%', borderCollapse: 'collapse' },
        th: { padding: '13px 16px', textAlign: 'left', color: '#475569', fontSize: '0.72rem', textTransform: 'uppercase', fontWeight: '700', letterSpacing: '0.06em', borderBottom: '2px solid #cbd5e1', whiteSpace: 'nowrap' },
        td: { padding: '13px 16px', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' },
        tableWrap: { background: '#ffffff', borderRadius: '16px', overflow: 'auto', border: '1px solid #cbd5e1', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)', width: '100%', boxSizing: 'border-box' },
        avatar: (color) => ({ width: '36px', height: '36px', borderRadius: '10px', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: '800', fontSize: '0.85rem', flexShrink: 0 }),
        btn: (bg, color = '#fff') => ({ padding: '7px 18px', borderRadius: '9px', border: 'none', background: bg, color: color, fontWeight: '700', fontSize: '0.8rem', cursor: 'pointer', transition: 'all 0.2s', whiteSpace: 'nowrap' }),
        empty: { textAlign: 'center', padding: '60px 20px', background: '#ffffff', borderRadius: '16px', border: '1px dashed #cbd5e1' },
        overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' },
        modal: { background: 'linear-gradient(145deg, #1e293b, #0f172a)', borderRadius: '20px', width: '560px', maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 24px 64px rgba(0,0,0,0.5)', color: '#f8fafc' },
        modalHeader: { padding: '22px 28px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
        modalBody: { padding: '24px 28px' },
        formGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' },
        formGroup: { display: 'flex', flexDirection: 'column', gap: '6px' },
        formLabel: { color: '#94a3b8', fontSize: '0.75rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' },
        formInput: { padding: '10px 14px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', color: '#f8fafc', fontSize: '0.88rem', outline: 'none' },
        formTextarea: { padding: '10px 14px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', color: '#f8fafc', fontSize: '0.88rem', outline: 'none', minHeight: '70px', resize: 'vertical', fontFamily: 'inherit' },
        modalFooter: { padding: '18px 28px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'flex-end', gap: '10px' },
        loadingWrap: { textAlign: 'center', padding: '60px 0', color: '#475569' },
        errorBanner: { background: 'rgba(239,68,68,0.15)', color: '#ef4444', padding: '14px 28px', fontSize: '0.88rem', fontWeight: '600', borderBottom: '1px solid rgba(239,68,68,0.2)', marginBottom: '20px', borderRadius: '12px' },
    };

    return (
        <div style={{ ...S.page, background: 'transparent', minHeight: 'auto' }}>
            {/* Error */}
            {error && <div style={S.errorBanner}>⚠️ {error}</div>}

            {/* ─── STATS ─── */}
            <div style={S.statsRow}>
                {[
                    { label: "Total Patients (Unique)", value: totalPatientsUnique, icon: '👥', g: 'linear-gradient(135deg, #3b82f6, #6366f1)' },
                    { label: 'Upcoming Appointments', value: upcomingAppointments, icon: '📅', g: 'linear-gradient(135deg, #f59e0b, #ef4444)' },
                    { label: 'Completed Today', value: completedToday, icon: '✅', g: 'linear-gradient(135deg, #10b981, #059669)' },
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
                        All Appointments
                    </button>
                    <button style={S.tab(activeTab === 'referrals')} onClick={() => { setActiveTab('referrals'); fetchMyReferrals(); }}>
                        Surgery Referrals {myReferrals.length > 0 && <span style={{ marginLeft: '6px', background: 'rgba(255,255,255,0.2)', padding: '2px 8px', borderRadius: '10px', fontSize: '0.72rem' }}>{myReferrals.length}</span>}
                    </button>
                    <button style={S.tab(activeTab === 'surgery_plans')} onClick={() => { setActiveTab('surgery_plans'); fetchMySurgeryPlans(); }}>
                        🔪 My Surgery Plans {mySurgeryPlans.length > 0 && <span style={{ marginLeft: '6px', background: 'rgba(255,255,255,0.2)', padding: '2px 8px', borderRadius: '10px', fontSize: '0.72rem' }}>{mySurgeryPlans.length}</span>}
                    </button>
                </div>
            </div>

            {/* ─── REFERRALS TAB ─── */}
            {activeTab === 'referrals' && (
                <div className="referrals-list" style={{ padding: '0 0 30px' }}>
                    {myReferrals.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '60px 20px', background: '#ffffff', borderRadius: '16px', border: '1px dashed #cbd5e1' }}>
                            <div style={{ fontSize: '3rem', marginBottom: '12px' }}>📋</div>
                            <h3 style={{ color: '#475569', fontWeight: '700', margin: '0 0 8px' }}>No Referrals Yet</h3>
                            <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>When other doctors refer patients to you, they will appear here.</p>
                        </div>
                    ) : (
                        <div style={{ background: '#fff', borderRadius: '16px', overflow: 'hidden', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
                            <div style={{ padding: '16px 20px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontWeight: '700', color: '#1e293b' }}>
                                🔄 Surgery Referrals Assigned to You ({myReferrals.length})
                            </div>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ background: '#f1f5f9' }}>
                                        <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '0.75rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Patient</th>
                                        <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '0.75rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Referred By</th>
                                        <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '0.75rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Reason</th>
                                        <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '0.75rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Date</th>
                                        <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '0.75rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Status</th>
                                        <th style={{ padding: '10px 16px', textAlign: 'center', fontSize: '0.75rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {myReferrals.map(ref => (
                                        <tr key={ref._id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                            <td style={{ padding: '12px 16px' }}>
                                                <div style={{ fontWeight: '600', color: '#0f172a', fontSize: '0.88rem' }}>{ref.patientId?.name || 'Unknown'}</div>
                                                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>MRN: {ref.patientId?.patientId || ref.patientId?.mrn || '-'}</div>
                                            </td>
                                            <td style={{ padding: '12px 16px', color: '#334155', fontSize: '0.85rem' }}>{ref.referringDoctorId?.name || '-'}</td>
                                            <td style={{ padding: '12px 16px', color: '#334155', fontSize: '0.85rem', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ref.reason}</td>
                                            <td style={{ padding: '12px 16px', color: '#64748b', fontSize: '0.82rem' }}>{new Date(ref.referralDate).toLocaleDateString()}</td>
                                            <td style={{ padding: '12px 16px' }}>
                                                <span style={{ padding: '4px 10px', borderRadius: '20px', fontSize: '0.72rem', fontWeight: '700', background: ref.status === 'REFERRED' ? '#fef3c7' : ref.status === 'SURGERY_PLANNED' ? '#dcfce7' : ref.status === 'ACCEPTED' ? '#dbeafe' : '#fee2e2', color: ref.status === 'REFERRED' ? '#92400e' : ref.status === 'SURGERY_PLANNED' ? '#166534' : ref.status === 'ACCEPTED' ? '#1e40af' : '#991b1b' }}>
                                                    {ref.status}
                                                </span>
                                            </td>
                                            <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                                {ref.status === 'REFERRED' ? (
                                                    <button
                                                        onClick={() => {
                                                            const pid = ref.patientId?.patientId || ref.patientId?.mrn || ref.patientId?._id || ref.patientId;
                                                            const apptId = ref.appointmentId?._id || ref.appointmentId;
                                                            navigate('/doctor/patient/' + (pid || ref._id), {
                                                                state: {
                                                                    referralId: ref._id,
                                                                    appointmentId: apptId,
                                                                    referral: ref
                                                                }
                                                            });
                                                        }}
                                                        style={{ padding: '6px 14px', background: '#f59e0b', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '0.78rem' }}
                                                    >
                                                        Review & Plan
                                                    </button>
                                                ) : (
                                                    <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>—</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* ─── MY SURGERY PLANS TAB (SURGEON VIEW) ─── */}
            {activeTab === 'surgery_plans' && (
                <div style={{ padding: '0 0 30px' }}>
                    {mySurgeryPlans.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '60px 20px', background: '#ffffff', borderRadius: '16px', border: '1px dashed #cbd5e1' }}>
                            <div style={{ fontSize: '3rem', marginBottom: '12px' }}>🔪</div>
                            <h3 style={{ color: '#475569', fontWeight: '700', margin: '0 0 8px' }}>No Surgery Plans Assigned</h3>
                            <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Surgeries planned for you (self-planned or referred by other doctors) will appear here.</p>
                        </div>
                    ) : (
                        <div style={{ background: '#fff', borderRadius: '16px', overflow: 'hidden', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
                            <div style={{ padding: '16px 20px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontWeight: '800', color: '#0f172a', fontSize: '1rem' }}>
                                    🔪 My Surgery Plans & OT Status ({mySurgeryPlans.length})
                                </span>
                            </div>
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead>
                                        <tr style={{ background: '#f1f5f9' }}>
                                            <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '0.75rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Plan ID & Procedure</th>
                                            <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '0.75rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Patient Details</th>
                                            <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '0.75rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Referring Doctor</th>
                                            <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '0.75rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>OT Room & Timing</th>
                                            <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '0.75rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Status</th>
                                            <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '0.75rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {mySurgeryPlans.map((sp) => {
                                            const patientName = sp.patientId?.name || 'Patient';
                                            const patientMrn = sp.patientId?.mrn || sp.patientId?.patientId || '-';
                                            const refDoc = sp.referringDoctorId?.name ? sp.referringDoctorId.name.replace(/^Dr\.?\s*/i, '') : null;
                                            const docName = sp.doctorId?.name ? sp.doctorId.name.replace(/^Dr\.?\s*/i, '') : null;
                                            const pId = sp.patientId?._id || sp.patientId;

                                            return (
                                                <tr key={sp._id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                                                    <td style={{ padding: '14px 16px' }}>
                                                        <div style={{ fontWeight: 800, color: '#0f172a' }}>{sp.surgery}</div>
                                                        {sp.planId && (
                                                            <span style={{ fontSize: '0.72rem', fontWeight: 800, background: '#e0e7ff', color: '#3730a3', padding: '2px 6px', borderRadius: '4px' }}>
                                                                {sp.planId}
                                                            </span>
                                                        )}
                                                        {sp.diagnosis && (
                                                            <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '2px' }}>
                                                                Dx: {sp.diagnosis}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td style={{ padding: '14px 16px' }}>
                                                        <div style={{ fontWeight: 700, color: '#1e293b' }}>{patientName}</div>
                                                        <div style={{ fontSize: '0.78rem', color: '#64748b' }}>MRN: {patientMrn}</div>
                                                    </td>
                                                    <td style={{ padding: '14px 16px', fontSize: '0.85rem', color: '#334155' }}>
                                                        {refDoc || docName ? (
                                                            <div>Dr. {refDoc || docName}</div>
                                                        ) : (
                                                            <div style={{ color: '#94a3b8' }}>Self-Planned</div>
                                                        )}
                                                        {sp.assistantSurgeonIds && sp.assistantSurgeonIds.length > 0 && (
                                                            <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: '3px' }}>
                                                                🤝 Asst: {sp.assistantSurgeonIds.map(a => `Dr. ${(a.name || 'Doctor').replace(/^Dr\.?\s*/i, '')}`).join(', ')}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td style={{ padding: '14px 16px', fontSize: '0.85rem' }}>
                                                        {sp.otRoomId?.name ? (
                                                            <div>
                                                                <strong style={{ color: '#0f172a' }}>🚪 {sp.otRoomId.name}</strong>
                                                                <div style={{ fontSize: '0.78rem', color: '#475569', marginTop: '2px' }}>
                                                                    📅 {sp.surgeryDate ? new Date(sp.surgeryDate).toLocaleDateString('en-IN') : 'TBD'} ({sp.startTime || '--:--'} - {sp.endTime || '--:--'})
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <div>
                                                                <span style={{ color: '#b45309', fontWeight: 700, fontSize: '0.82rem' }}>⏳ OT scheduling pending</span>
                                                                <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>
                                                                    Pref: {sp.preferredDate ? new Date(sp.preferredDate).toLocaleDateString('en-IN') : 'Flexible'}
                                                                </div>
                                                            </div>
                                                        )}
                                                        {sp.surgeryCost > 0 && (
                                                            <div style={{ fontSize: '0.74rem', fontWeight: 700, color: sp.paymentStatus === 'PAID' ? '#16a34a' : (sp.paymentStatus === 'PARTIALLY PAID' ? '#b45309' : '#dc2626'), marginTop: '3px' }}>
                                                                ₹{Number(sp.surgeryCost).toLocaleString('en-IN')} [{sp.paymentStatus || 'UNPAID'}]
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td style={{ padding: '14px 16px' }}>
                                                        <span style={{
                                                            padding: '4px 10px',
                                                            borderRadius: '12px',
                                                            fontSize: '0.75rem',
                                                            fontWeight: 800,
                                                            background: sp.status === 'PLANNED' ? '#fef3c7' : sp.status === 'SCHEDULED' ? '#e0e7ff' : sp.status === 'IN_OT' ? '#fee2e2' : '#dcfce7',
                                                            color: sp.status === 'PLANNED' ? '#92400e' : sp.status === 'SCHEDULED' ? '#3730a3' : sp.status === 'IN_OT' ? '#b91c1c' : '#166534'
                                                        }}>
                                                            {sp.status}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                                                        <button
                                                            onClick={() => navigate(`/doctor/patients/${pId}`)}
                                                            style={{ padding: '6px 14px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}
                                                        >
                                                            View Profile
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ─── CONTENT (TODAY / ALL APPOINTMENTS) ─── */}
            {(activeTab === 'today' || activeTab === 'all') && (
                <div style={S.content}>
                    {loading ? (
                        <div style={S.loadingWrap}>
                            <div style={{ width: '38px', height: '38px', border: '3px solid rgba(255,255,255,0.08)', borderTop: '3px solid #3b82f6', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 14px' }} />
                            <p style={{ fontSize: '0.9rem' }}>Loading patients...</p>
                            <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
                        </div>
                    ) : displayList.length === 0 ? (
                        <div style={S.empty}>
                            <div style={{ fontSize: '3rem', marginBottom: '12px' }}>👥</div>
                            <h3 style={{ color: '#475569', fontWeight: '700', margin: '0 0 8px' }}>
                                {activeTab === 'today' ? 'No Patients in Queue Today' : 'No Appointments Found'}
                            </h3>
                            <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
                                {searchQuery ? 'Try adjusting your search terms.' : 'Appointments booked by patients will appear here.'}
                            </p>
                        </div>
                    ) : (
                        <>
                            <div style={S.sectionHeader}>
                                <h3 style={S.sectionTitle}>
                                    {activeTab === 'today' ? "Today's Patient Queue" : 'All Patient Appointments'}
                                </h3>
                                <span style={S.sectionCount}>Showing {displayList.length} patients</span>
                            </div>

                            <div style={S.tableWrap}>
                                <table style={S.table}>
                                    <thead>
                                        <tr>
                                            <th style={S.th}>#</th>
                                            <th style={S.th}>Patient</th>
                                            <th style={S.th}>Contact</th>
                                            <th style={S.th}>Doctor</th>
                                            <th style={S.th}>Date & Time</th>
                                            <th style={S.th}>Status</th>
                                            <th style={{ ...S.th, textAlign: 'center' }}>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {displayList.map((apt, i) => {
                                            const statusStyle = getStatusStyle(apt.status);
                                            const pName = apt.userId?.name || apt.clinicPatientId?.name || 'Walk-in Patient';
                                            const pPhone = apt.userId?.phone || apt.clinicPatientId?.phone || '—';
                                            const pEmail = apt.userId?.email || apt.clinicPatientId?.email || '';
                                            const pGender = apt.userId?.gender || apt.clinicPatientId?.gender || '';
                                            const pAge = apt.userId?.age || apt.clinicPatientId?.age || '';
                                            const pId = apt.userId?.patientId || apt.clinicPatientId?.patientUid || apt.patientId || '—';
                                            const dName = apt.doctorName || 'Assigned Doctor';
                                            const colors = ['#6366f1', '#ec4899', '#10b981', '#f59e0b', '#06b6d4', '#8b5cf6'];
                                            const avatarColor = colors[i % colors.length];

                                            return (
                                                <tr
                                                    key={apt._id}
                                                    style={{ transition: 'background 0.15s' }}
                                                    onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                                >
                                                    <td style={{ ...S.td, color: '#475569', fontWeight: '600', fontSize: '0.8rem' }}>{i + 1}</td>
                                                    <td style={S.td}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                            <div style={S.avatar(avatarColor)}>
                                                                {pName.charAt(0).toUpperCase()}
                                                            </div>
                                                            <div>
                                                                <div 
                                                                    onClick={() => {
                                                                        const rawId = apt.userId?._id || apt.clinicPatientId?._id || apt.patientId;
                                                                        if (rawId) navigate(`/doctor/patients/${rawId}`);
                                                                    }}
                                                                    style={{ color: '#0f172a', fontWeight: '700', fontSize: '0.9rem', cursor: 'pointer' }}
                                                                    onMouseEnter={e => e.currentTarget.style.color = '#3b82f6'}
                                                                    onMouseLeave={e => e.currentTarget.style.color = '#0f172a'}
                                                                >
                                                                    {pName}
                                                                </div>
                                                                <div style={{ color: '#475569', fontSize: '0.75rem', marginTop: '1px' }}>
                                                                    ID: {pId} {pGender && `• ${pGender}`} {pAge && `• ${pAge}y`}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td style={S.td}>
                                                        <div style={{ color: '#334155', fontSize: '0.85rem', fontWeight: '500' }}>📞 {pPhone}</div>
                                                        {pEmail && <div style={{ color: '#475569', fontSize: '0.75rem' }}>{pEmail}</div>}
                                                    </td>
                                                    <td style={S.td}>
                                                        <span style={{ color: '#0f172a', fontWeight: '600', fontSize: '0.85rem' }}>👨‍⚕️ Dr. {dName}</span>
                                                    </td>
                                                    <td style={S.td}>
                                                        <div style={{ color: '#0f172a', fontWeight: '600', fontSize: '0.85rem' }}>
                                                            {new Date(apt.appointmentDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                        </div>
                                                        <div style={{ color: '#3b82f6', fontSize: '0.78rem', fontWeight: '600' }}>
                                                            ⏰ {apt.appointmentTime}
                                                        </div>
                                                    </td>
                                                    <td style={S.td}>
                                                        <span style={{
                                                            background: statusStyle.bg,
                                                            color: statusStyle.color,
                                                            padding: '4px 12px',
                                                            borderRadius: '20px',
                                                            fontSize: '0.75rem',
                                                            fontWeight: '700',
                                                            textTransform: 'capitalize',
                                                            display: 'inline-block'
                                                        }}>
                                                            {apt.status}
                                                        </span>
                                                    </td>
                                                    <td style={{ ...S.td, textAlign: 'center' }}>
                                                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                                                            <button
                                                                onClick={() => openVitalsForm(apt)}
                                                                style={{
                                                                    ...S.btn('linear-gradient(135deg, #06b6d4, #3b82f6)'),
                                                                    display: 'flex', alignItems: 'center', gap: '5px'
                                                                }}
                                                            >
                                                                💉 Vitals
                                                            </button>

                                                            <button
                                                                onClick={() => setUploadPatient(apt)}
                                                                style={{
                                                                    ...S.btn('linear-gradient(135deg, #f59e0b, #d97706)'),
                                                                    display: 'flex', alignItems: 'center', gap: '5px'
                                                                }}
                                                            >
                                                                📁 Upload
                                                            </button>

                                                            <button
                                                                onClick={() => {
                                                                    const ptName = (apt.userId?.name || apt.clinicPatientId?.name || 'Walk-in').replace(/\s+/g, '-');
                                                                    const patientMRN = apt.userId?.patientId || apt.clinicPatientId?.patientUid || apt.patientId || ptName;
                                                                    navigate(`/doctor/patient/${patientMRN}`, { state: { appointmentId: apt._id } });
                                                                }}
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
            )}

            {/* ─── VITALS MODAL ─── */}
            {vitalsPatient && (
                <div style={S.overlay} onClick={() => setVitalsPatient(null)}>
                    <div style={S.modal} onClick={e => e.stopPropagation()}>
                        <div style={S.modalHeader}>
                            <div>
                                <h2 style={{ margin: 0, color: '#f8fafc', fontSize: '1.15rem', fontWeight: '800' }}>
                                    💉 Enter Vitals
                                </h2>
                                <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '0.82rem' }}>
                                    Patient: <strong style={{ color: '#e2e8f0' }}>{vitalsPatient.userId?.name || vitalsPatient.clinicPatientId?.name || 'Unknown'}</strong> •
                                    MRN: {vitalsPatient.userId?.patientId || vitalsPatient.clinicPatientId?.patientUid || vitalsPatient.patientId || 'N/A'} •
                                    Dr. {vitalsPatient.doctorName}
                                </p>
                            </div>
                            <button onClick={() => setVitalsPatient(null)} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '1.3rem', cursor: 'pointer' }}>✕</button>
                        </div>

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

                            <div style={{ ...S.formGroup, marginTop: '16px' }}>
                                <label style={S.formLabel}>📋 Chief Complaint</label>
                                <textarea
                                    value={vitals.chiefComplaint}
                                    onChange={e => setVitals({ ...vitals, chiefComplaint: e.target.value })}
                                    placeholder="Patient's chief complaint..."
                                    style={S.formTextarea}
                                />
                            </div>

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
            )}

            {/* UPload Report Modal */}
            {uploadPatient && (
                <div style={S.overlay}>
                    <div style={{ ...S.modal, maxWidth: '400px' }}>
                        <div style={S.modalHeader}>
                            <h2 style={{ margin: 0, fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                📁 Upload Master Record
                            </h2>
                            <button onClick={() => setUploadPatient(null)} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '1.3rem', cursor: 'pointer' }}>&times;</button>
                        </div>
                        <form onSubmit={handleUploadReport} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
                            <p style={{ margin: 0, color: '#64748b', fontSize: '14px' }}>
                                Upload previous medical reports, prescriptions, or scans for <b>{uploadPatient.userId?.name || 'Patient'}</b>.
                            </p>
                            
                            <input 
                                type="file" 
                                accept="application/pdf,image/*"
                                onChange={(e) => setUploadFile(e.target.files[0])}
                                required
                                style={{ padding: '10px', border: '1px dashed #cbd5e1', borderRadius: '8px' }}
                            />

                            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '10px' }}>
                                <button type="button" onClick={() => setUploadPatient(null)} style={S.btn('#e2e8f0', '#475569')}>Cancel</button>
                                <button type="submit" disabled={uploading || !uploadFile} style={S.btn('#3b82f6', '#fff')}>
                                    {uploading ? 'Uploading...' : 'Save Report'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Patient;