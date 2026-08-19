import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doctorAPI, receptionAPI, otAPI, adminEntitiesAPI, admissionAPI, bedAPI } from '../../utils/api';

const PatientProfile = () => {
    const { patientId } = useParams();
    const navigate = useNavigate();
    const [patient, setPatient] = useState(null);
    const [appointments, setAppointments] = useState([]);
    const [labReports, setLabReports] = useState([]);
    const [pharmacyOrders, setPharmacyOrders] = useState([]);
    const [surgeryPlans, setSurgeryPlans] = useState([]);
    const [currentFollowupStatus, setCurrentFollowupStatus] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [activeTab, setActiveTab] = useState('overview');

    const [surgeonsList, setSurgeonsList] = useState([]);
    const [otRoomsList, setOtRoomsList] = useState([]);
    const [showScheduleModal, setShowScheduleModal] = useState(false);
    
    const [showWorkflowModal, setShowWorkflowModal] = useState(false);
    const [workflowActionType, setWorkflowActionType] = useState(null); // 'ADMIT' or 'TRANSFER'
    const [activeSurgeryId, setActiveSurgeryId] = useState(null);
    const [workflowBeds, setWorkflowBeds] = useState([]);
    const [selectedBedId, setSelectedBedId] = useState('');

    const [scheduleData, setScheduleData] = useState({
        id: null,
        otRoomId: '',
        surgeryDate: '',
        startTime: '',
        endTime: '',
        surgeonId: ''
    });

    useEffect(() => {
        if (patientId) fetchProfile();
    }, [patientId]);

    const fetchProfile = async () => {
        setLoading(true);
        try {
            const res = await doctorAPI.getFullPatientProfile(patientId);
            if (res.success) {
                setPatient(res.patient);
                setAppointments(res.appointments || []);
                setLabReports(res.labReports || []);
                setPharmacyOrders(res.pharmacyOrders || []);
            } else {
                setError(res.message || 'Failed to load profile');
            }

            try {
                const spRes = await otAPI.getPatientSurgeryPlans(patientId);
                if (spRes.success) {
                    setSurgeryPlans(spRes.data || []);
                }
            } catch (err) {
                console.warn("Could not fetch surgery plans:", err?.message);
            }

            try {
                const resAuto = await receptionAPI.getFollowupStatus(patientId, 'auto');
                if (resAuto.success) {
                    setCurrentFollowupStatus(resAuto);
                }
            } catch (err) {
                console.warn("Could not fetch followup status:", err?.message);
            }

        } catch (err) {
            setError(err.response?.data?.message || err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const fetchExtras = async () => {
            try {
                const sRes = await adminEntitiesAPI.getDoctors();
                if (sRes.success) setSurgeonsList(sRes.data || []);
            } catch (e) {}
            try {
                const rRes = await otAPI.getRooms();
                if (rRes.success) setOtRoomsList(rRes.rooms.filter(r => r.status !== 'Maintenance' && r.status !== 'MAINTENANCE') || []);
            } catch (e) {}
        };
        fetchExtras();
    }, []);

    const handleOpenScheduleModal = (sp) => {
        setScheduleData({
            id: sp._id,
            otRoomId: sp.otRoomId?._id || sp.otRoomId || '',
            surgeryDate: sp.surgeryDate ? String(sp.surgeryDate).split('T')[0] : sp.preferredDate ? String(sp.preferredDate).split('T')[0] : '',
            startTime: sp.startTime || sp.preferredTime || '',
            endTime: sp.endTime || '',
            surgeonId: sp.surgeonId?._id || sp.surgeonId || ''
        });
        setShowScheduleModal(true);
    };

    const handleScheduleSubmit = async (e) => {
        e.preventDefault();
        try {
            const isEdit = surgeryPlans.find(s => s._id === scheduleData.id)?.status === 'SCHEDULED';
            const apiCall = isEdit ? otAPI.updateScheduledSurgery : otAPI.scheduleSurgery;
            const res = await apiCall(scheduleData.id, scheduleData);
            if (res.success) {
                alert(res.message || 'Surgery scheduled successfully');
                setShowScheduleModal(false);
                fetchProfile();
            }
        } catch (err) {
            alert(err.response?.data?.message || 'Error scheduling surgery');
        }
    };

    const handleWorkflowTransition = async (id, status) => {
        try {
            const res = await otAPI.updateSurgeryWorkflow(id, { status });
            if (res.success) {
                alert(res.message || `Status updated to ${status}`);
                fetchProfile();
            }
        } catch (err) {
            alert(err.response?.data?.message || 'Error updating workflow');
        }
    };

    const handleOpenWorkflowModal = async (id, type) => {
        setActiveSurgeryId(id);
        setWorkflowActionType(type);
        try {
            const res = await bedAPI.getBeds({ status: 'AVAILABLE' });
            if (res.success) setWorkflowBeds(res.beds || []);
            setShowWorkflowModal(true);
        } catch (err) {
            alert('Failed to fetch available beds');
        }
    };

    const handleWorkflowModalSubmit = async (e) => {
        e.preventDefault();
        if (!selectedBedId) return alert('Please select a bed');
        try {
            if (workflowActionType === 'ADMIT') {
                const targetBed = workflowBeds.find(b => b._id === selectedBedId);
                const admRes = await admissionAPI.createAdmission({
                    patientId,
                    ward: targetBed?.ward,
                    bedId: selectedBedId,
                    admissionDate: new Date().toISOString().split('T')[0],
                    admissionTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
                });
                if (admRes.success) {
                    await otAPI.updateSurgeryWorkflow(activeSurgeryId, { status: 'ADMITTED' });
                    alert('Patient admitted successfully');
                }
            } else if (workflowActionType === 'TRANSFER') {
                const actAdmRes = await admissionAPI.getPatientAdmissions(patientId);
                const activeAdm = actAdmRes.admissions?.find(a => a.status === 'Admitted');
                if (activeAdm) {
                    const targetBed = workflowBeds.find(b => b._id === selectedBedId);
                    const transRes = await admissionAPI.transferBed(activeAdm._id, {
                        newWard: targetBed?.ward,
                        newBedId: selectedBedId,
                        transferDate: new Date().toISOString().split('T')[0],
                        transferTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
                    });
                    if (transRes.success) {
                        await otAPI.updateSurgeryWorkflow(activeSurgeryId, { status: 'POST_OP' });
                        alert('Patient transferred successfully');
                    }
                } else {
                    alert('No active admission found to transfer');
                }
            }
            setShowWorkflowModal(false);
            setSelectedBedId('');
            fetchProfile();
        } catch (err) {
            alert(err.response?.data?.message || 'Error processing request');
        }
    };

    const handleCancelSurgery = async (id) => {
        if (!window.confirm("Are you sure you want to cancel this scheduled surgery?")) return;
        try {
            const res = await otAPI.cancelSurgery(id);
            if (res.success) {
                alert(res.message || 'Surgery cancelled');
                fetchProfile();
            }
        } catch (err) {
            alert(err.response?.data?.message || 'Error cancelling surgery');
        }
    };

    const fp = patient?.fertilityProfile || {};
    const vitals = fp.vitals || {};

    const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A';
    const age = patient?.dob ? Math.floor((Date.now() - new Date(patient.dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000)) : null;

    // ─── STYLES ─────────────────────────────────────────────
    const C = {
        page: { minHeight: '100vh', background: 'linear-gradient(145deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)', fontFamily: "'Inter','Segoe UI',system-ui,sans-serif", color: '#e2e8f0' },
        topbar: { background: 'rgba(15,23,42,0.92)', backdropFilter: 'blur(24px)', borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '14px 28px', display: 'flex', alignItems: 'center', gap: '14px', position: 'sticky', top: 0, zIndex: 100 },
        backBtn: { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', padding: '8px 16px', color: '#94a3b8', cursor: 'pointer', fontWeight: '600', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' },
        container: { maxWidth: '1200px', margin: '0 auto', padding: '24px 28px' },
        // Identity Card
        idCard: { background: 'linear-gradient(135deg, rgba(59,130,246,0.12), rgba(139,92,246,0.08))', border: '1px solid rgba(59,130,246,0.2)', borderRadius: '20px', padding: '28px', display: 'flex', gap: '24px', alignItems: 'flex-start', marginBottom: '24px' },
        avatar: { width: '90px', height: '90px', borderRadius: '20px', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '2.2rem', fontWeight: '800', flexShrink: 0, boxShadow: '0 8px 24px rgba(99,102,241,0.3)' },
        idInfo: { flex: 1 },
        idName: { margin: 0, fontSize: '1.5rem', fontWeight: '800', color: '#f8fafc', letterSpacing: '-0.02em' },
        idMeta: { display: 'flex', gap: '16px', marginTop: '8px', flexWrap: 'wrap' },
        idBadge: (bg, color) => ({ background: bg, color: color, padding: '4px 14px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: '700' }),
        idGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginTop: '16px' },
        idItem: { display: 'flex', flexDirection: 'column', gap: '2px' },
        idLabel: { color: '#64748b', fontSize: '0.7rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' },
        idValue: { color: '#e2e8f0', fontSize: '0.88rem', fontWeight: '600' },
        // Tabs
        tabsBar: { display: 'flex', gap: '4px', background: 'rgba(255,255,255,0.04)', padding: '4px', borderRadius: '14px', marginBottom: '20px', border: '1px solid rgba(255,255,255,0.06)', overflowX: 'auto' },
        tab: (a) => ({ padding: '10px 20px', borderRadius: '10px', border: 'none', cursor: 'pointer', fontWeight: '700', fontSize: '0.82rem', transition: 'all 0.2s', background: a ? 'linear-gradient(135deg,#3b82f6,#6366f1)' : 'transparent', color: a ? '#fff' : '#94a3b8', whiteSpace: 'nowrap', boxShadow: a ? '0 2px 12px rgba(59,130,246,0.3)' : 'none' }),
        // Cards
        card: { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '16px', padding: '22px', marginBottom: '16px' },
        cardTitle: { margin: '0 0 16px', fontSize: '1rem', fontWeight: '700', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '8px' },
        grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' },
        grid3: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' },
        grid4: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' },
        fieldGroup: { display: 'flex', flexDirection: 'column', gap: '3px', padding: '10px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.04)' },
        fieldLabel: { color: '#64748b', fontSize: '0.7rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' },
        fieldValue: { color: '#e2e8f0', fontSize: '0.88rem', fontWeight: '600' },
        // Table
        tableWrap: { background: 'rgba(255,255,255,0.03)', borderRadius: '16px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.06)' },
        table: { width: '100%', borderCollapse: 'collapse' },
        th: { padding: '12px 16px', textAlign: 'left', color: '#64748b', fontSize: '0.72rem', textTransform: 'uppercase', fontWeight: '700', letterSpacing: '0.06em', borderBottom: '1px solid rgba(255,255,255,0.06)' },
        td: { padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: '0.85rem' },
        statusBadge: (s) => {
            const m = { 
                confirmed: { b: '#dcfce7', c: '#166534' }, 
                completed: { b: '#dbeafe', c: '#1e40af' }, 
                cancelled: { b: '#fee2e2', c: '#991b1b' }, 
                pending: { b: '#fef3c7', c: '#92400e' }, 
                PENDING: { b: '#fef3c7', c: '#92400e' }, 
                DONE: { b: '#dcfce7', c: '#166534' }, 
                IN_PROGRESS: { b: '#dbeafe', c: '#1e40af' }, 
                UPLOADED: { b: '#dcfce7', c: '#166534' }, 
                PAID: { b: '#dcfce7', c: '#166534' },
                PLANNED: { b: '#fef3c7', c: '#92400e' },
                SCHEDULED: { b: '#e0e7ff', c: '#3730a3' },
                ADMITTED: { b: '#eff6ff', c: '#1d4ed8' },
                PRE_OP: { b: '#fef3c7', c: '#b45309' },
                READY_FOR_OT: { b: '#f3e8ff', c: '#6b21a8' },
                IN_OT: { b: '#fee2e2', c: '#b91c1c' },
                SURGERY_COMPLETED: { b: '#ccfbf1', c: '#0f766e' },
                POST_OP: { b: '#ecfeff', c: '#0e7490' },
                COMPLETED: { b: '#dcfce7', c: '#15803d' },
                CANCELLED: { b: '#f1f5f9', c: '#64748b' }
            };
            const v = m[s] || { b: '#f1f5f9', c: '#475569' };
            return { background: v.b, color: v.c, padding: '3px 12px', borderRadius: '20px', fontSize: '0.72rem', fontWeight: '700', textTransform: 'capitalize' };
        },
        timelineCard: { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '14px', padding: '18px', marginBottom: '12px', borderLeft: '4px solid #3b82f6' },
        empty: { textAlign: 'center', padding: '40px', color: '#64748b' },
        loadWrap: { textAlign: 'center', padding: '80px', color: '#94a3b8' },
    };

    if (loading) return (
        <div style={C.page}>
            <div style={C.loadWrap}>
                <div style={{ width: '40px', height: '40px', border: '3px solid rgba(255,255,255,0.08)', borderTop: '3px solid #3b82f6', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 14px' }} />
                <p>Loading patient profile...</p>
                <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            </div>
        </div>
    );

    if (error || !patient) return (
        <div style={C.page}>
            <div style={C.topbar}>
                <button style={C.backBtn} onClick={() => navigate(-1)}>← Back</button>
            </div>
            <div style={{ ...C.container, textAlign: 'center', padding: '80px 28px' }}>
                <div style={{ fontSize: '3rem', marginBottom: '12px' }}>⚠️</div>
                <h3 style={{ color: '#f8fafc', margin: '0 0 8px' }}>Patient Not Found</h3>
                <p style={{ color: '#64748b' }}>{error || 'Unable to load patient data.'}</p>
            </div>
        </div>
    );

    const tabs = [
        { key: 'overview', label: '📋 Overview', icon: '' },
        { key: 'surgery', label: `🔪 Surgery Plans (${surgeryPlans.length})` },
        { key: 'vitals', label: '💓 Vitals' },
        { key: 'medical', label: '🏥 Medical History' },
        { key: 'visits', label: '📅 All Visits' },
        { key: 'labs', label: '🧪 Lab Reports' },
        { key: 'prescriptions', label: '💊 Prescriptions' },
        { key: 'clinical', label: '🩺 Clinical Profile' },
    ];

    const renderField = (label, value) => (
        <div style={C.fieldGroup}>
            <span style={C.fieldLabel}>{label}</span>
            <span style={C.fieldValue}>{value || '—'}</span>
        </div>
    );

    const renderOverview = () => (
        <>
            {/* Quick Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '14px', marginBottom: '20px' }}>
                {[
                    { label: 'Total Visits', value: appointments.length, icon: '📅', g: 'linear-gradient(135deg,#3b82f6,#6366f1)' },
                    { label: 'Completed', value: appointments.filter(a => a.status === 'completed').length, icon: '✅', g: 'linear-gradient(135deg,#10b981,#059669)' },
                    { label: 'Lab Tests', value: labReports.length, icon: '🧪', g: 'linear-gradient(135deg,#f59e0b,#d97706)' },
                    { label: 'Prescriptions', value: pharmacyOrders.length, icon: '💊', g: 'linear-gradient(135deg,#ef4444,#dc2626)' },
                ].map((s, i) => (
                    <div key={i} style={{ ...C.card, display: 'flex', alignItems: 'center', gap: '14px', padding: '18px', marginBottom: 0 }}>
                        <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: s.g, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', flexShrink: 0 }}>{s.icon}</div>
                        <div>
                            <div style={{ color: '#f8fafc', fontSize: '1.5rem', fontWeight: '800', lineHeight: 1 }}>{s.value}</div>
                            <div style={{ color: '#64748b', fontSize: '0.75rem', fontWeight: '600', marginTop: '2px' }}>{s.label}</div>
                        </div>
                    </div>
                ))}

                {/* Follow-up Card */}
                <div style={{ background: currentFollowupStatus?.active ? '#f0fdf4' : '#fef2f2', borderColor: currentFollowupStatus?.active ? '#bbf7d0' : '#fecaca', borderLeft: currentFollowupStatus?.active ? '4px solid #22c55e' : '4px solid #ef4444', borderStyle: 'solid', borderWidth: '1px 1px 1px 4px', gridColumn: 'span 1', padding: '16px', borderRadius: '16px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <div style={{ width: '100%', fontFamily: "'Inter','Segoe UI',system-ui,sans-serif" }}>
                        <span style={{ color: currentFollowupStatus?.active ? '#166534' : '#991b1b', fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em' }}>Follow-up</span>
                        <div style={{ marginTop: '4px' }}>
                            <span style={{ color: currentFollowupStatus?.active ? '#15803d' : '#b91c1c', fontSize: '1.1rem', fontWeight: 800 }}>
                                {(() => {
                                    if (currentFollowupStatus?.active) return 'Active';
                                    if (currentFollowupStatus?.message === 'New Patient / First Visit' && appointments.length === 0) return 'New Patient';
                                    return 'Expired';
                                })()}
                            </span>
                        </div>
                        {currentFollowupStatus && !(currentFollowupStatus.message === 'New Patient / First Visit' && appointments.length === 0) && (
                            <div style={{ fontSize: '0.75rem', color: currentFollowupStatus.active ? '#166534' : '#7f1d1d', marginTop: '4px', fontWeight: 500 }}>
                                {(() => {
                                    if (currentFollowupStatus.active) {
                                        return <>Valid: {Math.max(0, Math.ceil((new Date(currentFollowupStatus.validUntil).getTime() - new Date().getTime()) / (1000 * 3600 * 24)))} Days</>;
                                    } else {
                                        const lastVisit = appointments.length > 0 ? appointments[0] : null;
                                        const lastDate = currentFollowupStatus.lastConsultation || (lastVisit ? lastVisit.appointmentDate : null);
                                        return <>{lastDate ? `Last: ${new Date(lastDate).toLocaleDateString('en-IN')}` : 'Fee Applicable'}</>;
                                    }
                                })()}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Demographics */}
            <div style={C.card}>
                <h4 style={C.cardTitle}>👤 Demographics</h4>
                <div style={C.grid4}>
                    {renderField('Full Name', patient.name)}
                    {renderField('Phone', patient.phone)}
                    {renderField('Email', patient.email)}
                    {renderField('MRN', patient.patientId)}
                    {renderField('Date of Birth', formatDate(patient.dob))}
                    {renderField('Age', age ? `${age} years` : null)}
                    {renderField('Gender', patient.gender)}
                    {renderField('Blood Group', patient.bloodGroup)}
                    {renderField('Address', patient.address)}
                    {renderField('City', patient.city)}
                    {renderField('Aadhaar', patient.aadhaarNumber ? `****${patient.aadhaarNumber.slice(-4)}` : null)}
                    {renderField('Verified', patient.isAadhaarVerified ? '✅ Yes' : '❌ No')}
                </div>
            </div>

            {/* Recent Visits Timeline */}
            <div style={C.card}>
                <h4 style={C.cardTitle}>🕐 Recent Visits</h4>
                {appointments.length === 0 ? (
                    <p style={{ color: '#64748b', textAlign: 'center', padding: '20px' }}>No visits recorded yet.</p>
                ) : (
                    appointments.slice(0, 5).map((apt, i) => (
                        <div key={apt._id} style={C.timelineCard}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <span style={{ color: '#3b82f6', fontWeight: '800', fontSize: '0.85rem' }}>#{i + 1}</span>
                                    <span style={{ color: '#f8fafc', fontWeight: '700' }}>{formatDate(apt.appointmentDate)}</span>
                                    <span style={{ color: '#94a3b8', fontSize: '0.82rem' }}>at {apt.appointmentTime}</span>
                                </div>
                                <span style={C.statusBadge(apt.status)}>{apt.status}</span>
                            </div>
                            <div style={{ display: 'flex', gap: '24px', color: '#94a3b8', fontSize: '0.82rem' }}>
                                <span>👨‍⚕️ Dr. {apt.doctorId?.name || apt.doctorName || 'N/A'}</span>
                                <span>📋 {apt.serviceName || 'Consultation'}</span>
                                {apt.diagnosis && <span>🩺 {apt.diagnosis}</span>}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </>
    );

    const renderSurgeryPlans = () => (
        <div style={{ ...C.card, borderLeft: '4px solid #7c3aed' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h4 style={{ ...C.cardTitle, color: '#c084fc', margin: 0 }}>🔪 Surgery Plans ({surgeryPlans.length})</h4>
            </div>

            {surgeryPlans.length === 0 ? (
                <div style={C.empty}>
                    <div style={{ fontSize: '2.5rem', marginBottom: '8px' }}>📋</div>
                    <p>No surgery plans found for this patient.</p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {surgeryPlans.map(sp => {
                        const surgeonName = sp.surgeonId?.name || (sp.surgeonId?.firstName ? `${sp.surgeonId.firstName} ${sp.surgeonId.lastName || ''}` : 'Surgeon');
                        const cleanSurgeon = surgeonName.replace(/^Dr\.?\s*/i, '');
                        const refDocName = sp.referringDoctorId?.name ? sp.referringDoctorId.name.replace(/^Dr\.?\s*/i, '') : null;
                        const docName = sp.doctorId?.name ? sp.doctorId.name.replace(/^Dr\.?\s*/i, '') : null;

                        return (
                            <div key={sp._id} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', padding: '18px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px', marginBottom: '12px' }}>
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                            <h5 style={{ margin: 0, fontSize: '1.15rem', fontWeight: '800', color: '#f8fafc' }}>{sp.surgery}</h5>
                                            {sp.planId && (
                                                <span style={{ fontSize: '0.75rem', fontWeight: 800, background: '#e0e7ff', color: '#3730a3', padding: '2px 8px', borderRadius: '4px' }}>
                                                    {sp.planId}
                                                </span>
                                            )}
                                        </div>
                                        <div style={{ color: '#94a3b8', fontSize: '0.85rem', marginTop: '4px' }}>
                                            <strong>Diagnosis:</strong> {sp.diagnosis || 'N/A'}
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                                        <span style={{ ...C.statusBadge(sp.status), padding: '6px 14px' }}>{sp.status}</span>
                                        {sp.status === 'PLANNED' && (
                                            <button onClick={() => handleOpenScheduleModal(sp)} style={{ padding: '6px 14px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold' }}>Schedule Surgery</button>
                                        )}
                                        {sp.status === 'SCHEDULED' && (
                                            <button onClick={() => sp.admissionRequired ? handleOpenWorkflowModal(sp._id, 'ADMIT') : handleWorkflowTransition(sp._id, 'PRE_OP')} style={{ padding: '6px 12px', background: '#8b5cf6', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold' }}>{sp.admissionRequired ? 'Admit Patient' : 'Start Pre-Op'}</button>
                                        )}
                                        {sp.status === 'ADMITTED' && (
                                            <button onClick={() => handleWorkflowTransition(sp._id, 'PRE_OP')} style={{ padding: '6px 12px', background: '#8b5cf6', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold' }}>Start Pre-Op</button>
                                        )}
                                        {sp.status === 'PRE_OP' && (
                                            <button onClick={() => handleWorkflowTransition(sp._id, 'READY_FOR_OT')} style={{ padding: '6px 12px', background: '#f59e0b', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold' }}>Mark Ready for OT</button>
                                        )}
                                        {sp.status === 'READY_FOR_OT' && (
                                            <button onClick={() => handleWorkflowTransition(sp._id, 'IN_OT')} style={{ padding: '6px 12px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold' }}>Send to OT</button>
                                        )}
                                        {sp.status === 'IN_OT' && (
                                            <button onClick={() => handleWorkflowTransition(sp._id, 'SURGERY_COMPLETED')} style={{ padding: '6px 12px', background: '#06b6d4', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold' }}>Complete Surgery</button>
                                        )}
                                        {sp.status === 'SURGERY_COMPLETED' && (
                                            <>
                                                <button onClick={() => handleOpenWorkflowModal(sp._id, 'TRANSFER')} style={{ padding: '6px 12px', background: '#8b5cf6', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold' }}>Transfer & Post-Op</button>
                                                <button onClick={() => handleWorkflowTransition(sp._id, 'POST_OP')} style={{ padding: '6px 12px', background: '#64748b', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold' }}>Start Post-Op</button>
                                            </>
                                        )}
                                        {sp.status === 'SCHEDULED' && (
                                            <>
                                                <button onClick={() => handleOpenScheduleModal(sp)} style={{ padding: '6px 12px', background: '#f59e0b', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold' }}>Edit</button>
                                                <button onClick={() => handleCancelSurgery(sp._id)} style={{ padding: '6px 12px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold' }}>Cancel</button>
                                            </>
                                        )}
                                    </div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', marginTop: '12px', fontSize: '0.85rem' }}>
                                    <div>
                                        <span style={{ color: '#94a3b8' }}>Operating Surgeon: </span>
                                        <strong style={{ color: '#f8fafc' }}>Dr. {cleanSurgeon}</strong>
                                        {sp.assistantSurgeonIds && sp.assistantSurgeonIds.length > 0 && (
                                            <div style={{ color: '#cbd5e1', fontSize: '0.8rem', marginTop: '2px' }}>
                                                🤝 Assistants: {sp.assistantSurgeonIds.map(a => `Dr. ${(a.name || 'Doctor').replace(/^Dr\.?\s*/i, '')}`).join(', ')}
                                            </div>
                                        )}
                                        {(refDocName || docName) && (refDocName !== cleanSurgeon && docName !== cleanSurgeon) && (
                                            <div style={{ color: '#64748b', fontSize: '0.78rem', marginTop: '2px' }}>
                                                Referred by: Dr. {refDocName || docName}
                                            </div>
                                        )}
                                    </div>

                                    {sp.status === 'SCHEDULED' || sp.status === 'ADMITTED' || sp.status === 'PRE_OP' || sp.status === 'READY_FOR_OT' || sp.status === 'IN_OT' || sp.status === 'SURGERY_COMPLETED' || sp.status === 'POST_OP' || sp.status === 'COMPLETED' ? (
                                        <>
                                            <div>
                                                <span style={{ color: '#94a3b8' }}>OT Room: </span>
                                                <strong style={{ color: '#f8fafc' }}>🚪 {sp.otRoomId?.name || 'Assigned'}</strong>
                                            </div>
                                            <div>
                                                <span style={{ color: '#94a3b8' }}>Scheduled: </span>
                                                <strong style={{ color: '#f8fafc' }}>{formatDate(sp.surgeryDate)} ({sp.startTime} - {sp.endTime})</strong>
                                            </div>
                                        </>
                                    ) : (
                                        <div>
                                            <span style={{ color: '#94a3b8' }}>OT Status: </span>
                                            <strong style={{ color: '#fbbf24' }}>⏳ OT scheduling pending</strong>
                                            <div style={{ color: '#94a3b8', fontSize: '0.78rem', marginTop: '2px' }}>
                                                Preferred: {sp.preferredDate ? formatDate(sp.preferredDate) : 'Flexible'} {sp.preferredTime || ''}
                                            </div>
                                        </div>
                                    )}

                                    {sp.surgeryCost > 0 && (
                                        <div>
                                            <span style={{ color: '#94a3b8' }}>Surgery Fee: </span>
                                            <strong style={{ color: '#38bdf8' }}>₹{Number(sp.surgeryCost).toLocaleString('en-IN')}</strong>
                                            <span style={{ marginLeft: '6px', fontSize: '0.75rem', fontWeight: 700, color: sp.paymentStatus === 'PAID' ? '#4ade80' : (sp.paymentStatus === 'PARTIALLY PAID' ? '#fbbf24' : '#f87171') }}>
                                                [{sp.paymentStatus || 'UNPAID'}]
                                            </span>
                                        </div>
                                    )}

                                    <div>
                                        <span style={{ color: '#94a3b8' }}>Admission Required: </span>
                                        <strong style={{ color: '#f8fafc' }}>{sp.admissionRequired ? 'Yes' : 'No'}</strong>
                                    </div>
                                </div>

                                {sp.notes && (
                                    <div style={{ marginTop: '12px', padding: '10px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', fontSize: '0.85rem', color: '#cbd5e1' }}>
                                        <strong>Notes:</strong> {sp.notes}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );

    const renderVitals = () => (
        <div style={C.card}>
            <h4 style={C.cardTitle}>💓 Current Vitals {vitals.lastRecorded && <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '500' }}>(Last: {formatDate(vitals.lastRecorded)})</span>}</h4>
            <div style={C.grid4}>
                {renderField('Weight', vitals.weight ? `${vitals.weight} kg` : null)}
                {renderField('Height', vitals.height ? `${vitals.height} cm` : null)}
                {renderField('BMI', vitals.bmi)}
                {renderField('Blood Pressure', vitals.bloodPressure || fp.historyBp)}
                {renderField('Pulse', vitals.pulse ? `${vitals.pulse} bpm` : (fp.historyPulse ? `${fp.historyPulse}` : null))}
                {renderField('Chest Exam', fp.chestExam)}
                {renderField('CVS Exam', fp.cvsExam)}
                {renderField('Temperature', vitals.temperature ? `${vitals.temperature} °F` : null)}
                {renderField('SpO₂', vitals.spo2 ? `${vitals.spo2}%` : null)}
                {renderField('Resp. Rate', vitals.respiratoryRate ? `${vitals.respiratoryRate}/min` : null)}
            </div>
        </div>
    );

    const renderMedicalHistory = () => {
        const h = fp;
        return (
            <>
                {/* Surgery Plans Summary */}
                {surgeryPlans && surgeryPlans.length > 0 && renderSurgeryPlans()}

                {/* Obstetric History */}
                <div style={C.card}>
                    <h4 style={C.cardTitle}>🤰 Obstetric History</h4>
                    <div style={C.grid3}>
                        {renderField('Gravida', h.gravida)}
                        {renderField('Para', h.para)}
                        {renderField('Abortions', h.abortion || h.abortions)}
                        {renderField('Living Children', h.living || h.livingChildren)}
                        {renderField('Ectopic', h.ectopic)}
                        {renderField('Stillbirth', h.stillbirth)}
                    </div>
                    {Number(h.abortion) > 0 && (
                        <div style={{ marginTop: '14px', background: 'rgba(239, 68, 68, 0.05)', padding: '12px', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '10px' }}>
                            <h5 style={{ margin: '0 0 10px', fontSize: '0.8rem', color: '#fca5a5' }}>📉 Abortion Reasons</h5>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                {Array.from({ length: Number(h.abortion) }).map((_, idx) => (
                                    h[`abortionReason_${idx}`] && renderField(`Abortion #${idx + 1}`, h[`abortionReason_${idx}`])
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Menstrual History */}
                <div style={C.card}>
                    <h4 style={C.cardTitle}>📅 Menstrual History</h4>
                    <div style={C.grid3}>
                        {renderField('LMP', formatDate(h.lmp))}
                        {renderField('Cycle Length', h.cycleLength ? `${h.cycleLength} days` : null)}
                        {renderField('Cycle Regularity', h.cycleRegularity)}
                        {renderField('Menarche Age', h.menarcheAge)}
                        {renderField('Flow Duration', h.flowDuration)}
                        {renderField('Dysmenorrhea', h.dysmenorrhea)}
                        {renderField('Inter. Pain', h.intermenstrualPain)}
                        {renderField('Inter. Bleeding', h.intermenstrualBleeding)}
                    </div>
                </div>

                {/* Medical History */}
                <div style={C.card}>
                    <h4 style={C.cardTitle}>🏥 Chronic Conditions & Habits</h4>
                    <div style={C.grid3}>
                        {renderField('Diabetes', h.diabetes)}
                        {renderField('Hypertension', h.hypertension)}
                        {renderField('Thyroid', h.thyroid)}
                        {renderField('Tuberculosis', h.tb)}
                        {renderField('Allergies', h.allergies)}
                        {renderField('Smoking', h.smoking)}
                        {renderField('Alcohol', h.alcohol)}
                        {renderField('Previous Surgery', h.previousSurgery)}
                    </div>
                </div>

                {/* Male Factor / Partner History */}
                <div style={C.card}>
                    <h4 style={C.cardTitle}>👨 Male Factor / Partner Details</h4>
                    <div style={C.grid3}>
                        {renderField('Spouse Name', h.spouseName)}
                        {renderField('Spouse Age', h.spouseAge)}
                        {renderField('Spouse Occupation', h.spouseOccupation)}
                        {renderField('Semen Analysis', h.semenAnalysis)}
                        {renderField('Male Factor', h.maleFactor)}
                        {renderField('Partner Medical History', h.partnerMedicalHistory)}
                    </div>
                </div>

                {/* Treatment History */}
                <div style={C.card}>
                    <h4 style={C.cardTitle}>💉 Previous Treatment History</h4>
                    <div style={C.grid2}>
                        {renderField('Previous Treatments', h.previousTreatments)}
                        {renderField('IVF Cycles', h.ivfCycles)}
                        {renderField('IUI Attempts', h.iuiAttempts)}
                        {renderField('Outcome', h.treatmentOutcome)}
                    </div>
                </div>
            </>
        );
    };

    const renderVisits = () => (
        <div style={C.tableWrap}>
            <table style={C.table}>
                <thead>
                    <tr>
                        <th style={C.th}>#</th>
                        <th style={C.th}>Date</th>
                        <th style={C.th}>Time</th>
                        <th style={C.th}>Doctor</th>
                        <th style={C.th}>Service</th>
                        <th style={C.th}>Diagnosis</th>
                        <th style={C.th}>Status</th>
                        <th style={C.th}>Notes</th>
                    </tr>
                </thead>
                <tbody>
                    {appointments.length === 0 ? (
                        <tr><td colSpan={8} style={{ ...C.td, textAlign: 'center', color: '#64748b', padding: '40px' }}>No visits recorded</td></tr>
                    ) : (
                        appointments.map((apt, i) => (
                            <tr key={apt._id} onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                <td style={{ ...C.td, color: '#64748b', fontWeight: '600' }}>{i + 1}</td>
                                <td style={{ ...C.td, color: '#f8fafc', fontWeight: '600' }}>{formatDate(apt.appointmentDate)}</td>
                                <td style={{ ...C.td, color: '#94a3b8' }}>{apt.appointmentTime}</td>
                                <td style={C.td}>
                                    <span style={{ color: '#e2e8f0', fontWeight: '600' }}>Dr. {apt.doctorId?.name || apt.doctorName || 'N/A'}</span>
                                </td>
                                <td style={{ ...C.td, color: '#94a3b8' }}>{apt.serviceName || 'Consultation'}</td>
                                <td style={{ ...C.td, color: '#e2e8f0' }}>{apt.diagnosis || '—'}</td>
                                <td style={C.td}><span style={C.statusBadge(apt.status)}>{apt.status}</span></td>
                                <td style={{ ...C.td, color: '#94a3b8', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{apt.notes || apt.doctorNotes || '—'}</td>
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
        </div>
    );

    const renderLabs = () => (
        <div style={C.tableWrap}>
            <table style={C.table}>
                <thead>
                    <tr>
                        <th style={C.th}>#</th>
                        <th style={C.th}>Date</th>
                        <th style={C.th}>Tests</th>
                        <th style={C.th}>Status</th>
                        <th style={C.th}>Report</th>
                        <th style={C.th}>Payment</th>
                        <th style={C.th}>Amount</th>
                        <th style={C.th}>Notes</th>
                        <th style={{...C.th, textAlign: 'center'}}>Action</th>
                    </tr>
                </thead>
                <tbody>
                    {labReports.length === 0 ? (
                        <tr><td colSpan={9} style={{ ...C.td, textAlign: 'center', color: '#64748b', padding: '40px' }}>No lab reports found</td></tr>
                    ) : (
                        labReports.map((lr, i) => (
                            <tr key={lr._id} onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                <td style={{ ...C.td, color: '#64748b', fontWeight: '600' }}>{i + 1}</td>
                                <td style={{ ...C.td, color: '#f8fafc', fontWeight: '600' }}>{formatDate(lr.createdAt)}</td>
                                <td style={C.td}>
                                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                        {(lr.testNames || []).map((t, j) => (
                                            <span key={j} style={{ background: 'rgba(59,130,246,0.15)', color: '#93c5fd', padding: '2px 10px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: '600' }}>{t}</span>
                                        ))}
                                    </div>
                                </td>
                                <td style={C.td}><span style={C.statusBadge(lr.testStatus)}>{lr.testStatus}</span></td>
                                <td style={C.td}><span style={C.statusBadge(lr.reportStatus)}>{lr.reportStatus}</span></td>
                                <td style={C.td}><span style={C.statusBadge(lr.paymentStatus)}>{lr.paymentStatus}</span></td>
                                <td style={{ ...C.td, color: '#f8fafc', fontWeight: '600' }}>{lr.amount ? `₹${lr.amount}` : '—'}</td>
                                <td style={{ ...C.td, color: '#94a3b8' }}>{lr.notes || '—'}</td>
                                <td style={{ ...C.td, textAlign: 'center' }}>
                                    {lr.reportFile?.url && (
                                        <a 
                                            href={lr.reportFile.url} 
                                            target="_blank" 
                                            rel="noopener noreferrer"
                                            style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                padding: '6px 12px',
                                                background: 'rgba(59, 130, 246, 0.15)',
                                                color: '#60a5fa',
                                                borderRadius: '6px',
                                                textDecoration: 'none',
                                                fontSize: '0.75rem',
                                                fontWeight: '700',
                                                border: '1px solid rgba(59, 130, 246, 0.3)',
                                                transition: 'all 0.2s'
                                            }}
                                            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(59, 130, 246, 0.25)' }}
                                            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(59, 130, 246, 0.15)' }}
                                        >
                                            👁️ View
                                        </a>
                                    )}
                                </td>
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
        </div>
    );

    const renderPrescriptions = () => (
        <div>
            {pharmacyOrders.length === 0 ? (
                <div style={C.empty}>
                    <div style={{ fontSize: '2.5rem', marginBottom: '8px' }}>💊</div>
                    <p>No prescriptions found.</p>
                </div>
            ) : (
                pharmacyOrders.map((order, i) => (
                    <div key={order._id} style={C.timelineCard}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <span style={{ color: '#3b82f6', fontWeight: '800' }}>Rx #{i + 1}</span>
                                <span style={{ color: '#f8fafc', fontWeight: '600' }}>{formatDate(order.createdAt)}</span>
                            </div>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <span style={C.statusBadge(order.orderStatus || 'pending')}>{order.orderStatus || 'Pending'}</span>
                                <span style={C.statusBadge(order.paymentStatus || 'PENDING')}>{order.paymentStatus || 'Pending'}</span>
                            </div>
                        </div>
                        <div style={C.tableWrap}>
                            <table style={C.table}>
                                <thead>
                                    <tr>
                                        <th style={C.th}>Medicine</th>
                                        <th style={C.th}>Dosage / Frequency</th>
                                        <th style={C.th}>Duration</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(order.items || []).map((item, j) => (
                                        <tr key={j}>
                                            <td style={{ ...C.td, color: '#f8fafc', fontWeight: '600' }}>{item.medicineName}</td>
                                            <td style={{ ...C.td, color: '#94a3b8' }}>{item.frequency || '—'}</td>
                                            <td style={{ ...C.td, color: '#94a3b8' }}>{item.duration || '—'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ))
            )}
        </div>
    );

    const renderClinical = () => {
        const h = fp;
        return (
            <>
                <div style={C.card}>
                    <h4 style={C.cardTitle}>🩺 Clinical Examination</h4>
                    <div style={C.grid2}>
                        {renderField('General Examination', h.generalExam)}
                        {renderField('Systemic Examination', h.systemicExam)}
                        {renderField('Per Abdomen', h.perAbdomen)}
                        {renderField('Per Speculum', h.perSpeculum)}
                        {renderField('Per Vaginum', h.perVaginum)}
                        {renderField('Breast Examination', h.breastExam)}
                    </div>
                </div>

                <div style={C.card}>
                    <h4 style={C.cardTitle}>📊 Investigation Results</h4>
                    <div style={C.grid2}>
                        {renderField('AMH', h.amh)}
                        {renderField('FSH', h.fsh)}
                        {renderField('LH', h.lh)}
                        {renderField('TSH', h.tsh)}
                        {renderField('Prolactin', h.prolactin)}
                        {renderField('E2', h.e2)}
                        {renderField('AFC (Antral Follicle Count)', h.afc)}
                        {renderField('HSG Report', h.hsgReport)}
                        {renderField('Ultrasound Findings', h.ultrasoundFindings)}
                        {renderField('Other Investigations', h.otherInvestigations)}
                    </div>
                </div>

                <div style={C.card}>
                    <h4 style={C.cardTitle}>📝 Additional Notes</h4>
                    <div style={{ padding: '14px', background: 'rgba(255,255,255,0.03)', borderRadius: '10px', minHeight: '60px', color: '#94a3b8', fontSize: '0.88rem', lineHeight: 1.6 }}>
                        {h.additionalNotes || h.notes || 'No additional notes recorded.'}
                    </div>
                </div>
            </>
        );
    };

    return (
        <div style={C.page}>
            {/* Top Bar */}
            <div style={C.topbar}>
                <button style={C.backBtn} onClick={() => navigate(-1)}>← Back</button>
                <div style={{ flex: 1 }}>
                    <h2 style={{ margin: 0, color: '#f8fafc', fontSize: '1.1rem', fontWeight: '800' }}>Patient Profile</h2>
                </div>
                <span style={{ color: '#64748b', fontSize: '0.82rem' }}>MRN: <strong style={{ color: '#e2e8f0' }}>{patient.patientId || 'N/A'}</strong></span>
            </div>

            <div style={C.container}>
                {/* Identity Card */}
                <div style={C.idCard}>
                    <div style={C.avatar}>
                        {patient.avatar ? (
                            <img src={patient.avatar} alt={patient.name} style={{ width: '100%', height: '100%', borderRadius: '20px', objectFit: 'cover' }} />
                        ) : (
                            (patient.name || 'P')[0].toUpperCase()
                        )}
                    </div>
                    <div style={C.idInfo}>
                        <h2 style={C.idName}>{patient.name}</h2>
                        <div style={C.idMeta}>
                            <span style={C.idBadge('rgba(59,130,246,0.15)', '#93c5fd')}>📞 {patient.phone || 'No Phone'}</span>
                            {patient.gender && <span style={C.idBadge('rgba(139,92,246,0.15)', '#c4b5fd')}>{patient.gender === 'male' ? '♂️' : '♀️'} {patient.gender}</span>}
                            {age && <span style={C.idBadge('rgba(16,185,129,0.15)', '#6ee7b7')}>{age} years</span>}
                            {patient.bloodGroup && <span style={C.idBadge('rgba(239,68,68,0.15)', '#fca5a5')}>{patient.bloodGroup}</span>}
                            <span style={C.idBadge('rgba(255,255,255,0.06)', '#94a3b8')}>Since {formatDate(patient.createdAt)}</span>
                        </div>
                        <div style={C.idGrid}>
                            {renderField('Email', patient.email)}
                            {renderField('Address', patient.address)}
                            {renderField('City', patient.city)}
                            {renderField('Aadhaar', patient.isAadhaarVerified ? '✅ Verified' : 'Not Verified')}
                        </div>
                    </div>
                </div>

                {/* Tabs */}
                <div style={C.tabsBar}>
                    {tabs.map(t => (
                        <button key={t.key} style={C.tab(activeTab === t.key)} onClick={() => setActiveTab(t.key)}>
                            {t.label}
                        </button>
                    ))}
                </div>

                {/* Tab Content */}
                {activeTab === 'overview' && renderOverview()}
                {activeTab === 'surgery' && renderSurgeryPlans()}
                {activeTab === 'vitals' && renderVitals()}
                {activeTab === 'medical' && renderMedicalHistory()}
                {activeTab === 'visits' && renderVisits()}
                {activeTab === 'labs' && renderLabs()}
                {activeTab === 'prescriptions' && renderPrescriptions()}
                {activeTab === 'clinical' && renderClinical()}
            </div>

            {/* Schedule Surgery Modal */}
            {showScheduleModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
                    <div style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '500px', color: '#fff' }}>
                        <h3 style={{ margin: '0 0 16px', fontSize: '1.2rem', color: '#f8fafc' }}>Schedule Operation / Surgery</h3>
                        <form onSubmit={handleScheduleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '4px' }}>Operating Surgeon *</label>
                                <select required value={scheduleData.surgeonId} onChange={e => setScheduleData({ ...scheduleData, surgeonId: e.target.value })} style={{ width: '100%', padding: '10px', background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff' }}>
                                    <option value="">Select Surgeon</option>
                                    {surgeonsList.map(s => <option key={s._id} value={s._id}>Dr. {s.name || `${s.firstName} ${s.lastName || ''}`}</option>)}
                                </select>
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '4px' }}>Assign OT Room *</label>
                                <select required value={scheduleData.otRoomId} onChange={e => setScheduleData({ ...scheduleData, otRoomId: e.target.value })} style={{ width: '100%', padding: '10px', background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff' }}>
                                    <option value="">Select OT Room</option>
                                    {otRoomsList.map(r => <option key={r._id} value={r._id}>{r.name} ({r.roomNumber || ''})</option>)}
                                </select>
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '4px' }}>Surgery Date *</label>
                                <input type="date" required value={scheduleData.surgeryDate} onChange={e => setScheduleData({ ...scheduleData, surgeryDate: e.target.value })} style={{ width: '100%', padding: '10px', background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff', boxSizing: 'border-box' }} />
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '4px' }}>Start Time *</label>
                                    <input type="time" required value={scheduleData.startTime} onChange={e => setScheduleData({ ...scheduleData, startTime: e.target.value })} style={{ width: '100%', padding: '10px', background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff', boxSizing: 'border-box' }} />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '4px' }}>End Time *</label>
                                    <input type="time" required value={scheduleData.endTime} onChange={e => setScheduleData({ ...scheduleData, endTime: e.target.value })} style={{ width: '100%', padding: '10px', background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff', boxSizing: 'border-box' }} />
                                </div>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                                <button type="button" onClick={() => setShowScheduleModal(false)} style={{ padding: '10px 16px', background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px', color: '#94a3b8', cursor: 'pointer' }}>Cancel</button>
                                <button type="submit" style={{ padding: '10px 20px', background: '#7c3aed', border: 'none', borderRadius: '8px', color: '#fff', fontWeight: 'bold', cursor: 'pointer' }}>Confirm Schedule</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Workflow Modal (Admit / Transfer) */}
            {showWorkflowModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
                    <div style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '400px', color: '#fff' }}>
                        <h3 style={{ margin: '0 0 16px', fontSize: '1.2rem', color: '#f8fafc' }}>
                            {workflowActionType === 'ADMIT' ? '🏥 Admit Patient for Surgery' : '🔄 Transfer Patient Bed'}
                        </h3>
                        <form onSubmit={handleWorkflowModalSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '4px' }}>Select Available Bed *</label>
                                <select required value={selectedBedId} onChange={e => setSelectedBedId(e.target.value)} style={{ width: '100%', padding: '10px', background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff' }}>
                                    <option value="">Choose Bed</option>
                                    {workflowBeds.map(b => (
                                        <option key={b._id} value={b._id}>
                                            {b.ward} - Bed {b.bedNumber} ({b.bedType})
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                                <button type="button" onClick={() => setShowWorkflowModal(false)} style={{ padding: '10px 16px', background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px', color: '#94a3b8', cursor: 'pointer' }}>Cancel</button>
                                <button type="submit" style={{ padding: '10px 20px', background: '#3b82f6', border: 'none', borderRadius: '8px', color: '#fff', fontWeight: 'bold', cursor: 'pointer' }}>Confirm</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PatientProfile;
