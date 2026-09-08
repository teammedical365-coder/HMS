import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { doctorAPI, receptionAPI, reportAPI } from '../../utils/api';
import {
    FiUsers,
    FiSearch,
    FiClock,
    FiCheckCircle,
    FiActivity,
    FiRefreshCw,
    FiAlertCircle,
    FiUserCheck,
    FiUpload,
    FiFileText,
    FiX,
    FiCheck,
    FiFilter
} from 'react-icons/fi';
import './NurseOPDQueue.css';

const NurseOPDQueue = () => {
    const navigate = useNavigate();
    const user = JSON.parse(localStorage.getItem('user') || '{}');

    const [appointments, setAppointments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState('today'); // 'today', 'waiting', 'in_consultation', 'completed', 'all'
    const [selectedDoctorFilter, setSelectedDoctorFilter] = useState('ALL');

    // Modals
    const [vitalsModal, setVitalsModal] = useState({ open: false, appt: null });
    const [vitalsForm, setVitalsForm] = useState({
        weight: '',
        height: '',
        bmi: '',
        systolicBP: '',
        diastolicBP: '',
        pulse: '',
        temperature: '',
        spo2: '',
        respiratoryRate: '',
        chiefComplaint: '',
        notes: ''
    });
    const [savingVitals, setSavingVitals] = useState(false);

    const [uploadModal, setUploadModal] = useState({ open: false, appt: null });
    const [uploadFile, setUploadFile] = useState(null);
    const [uploadingReport, setUploadingReport] = useState(false);

    const [toast, setToast] = useState(null);

    const showToast = useCallback((message, type = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3500);
    }, []);

    // ── Data Fetching ──
    const fetchQueue = useCallback(async (isRefresh = false) => {
        if (isRefresh) setRefreshing(true);
        else setLoading(true);
        try {
            const res = await doctorAPI.getAllAppointments();
            if (res.success) {
                setAppointments(res.appointments || []);
            } else {
                showToast(res.message || 'Error loading appointments', 'error');
            }
        } catch (err) {
            console.error('Queue fetch error:', err);
            showToast(err.response?.data?.message || 'Failed to load OPD queue', 'error');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [showToast]);

    useEffect(() => {
        fetchQueue();
    }, [fetchQueue]);

    // ── Auto Calculate BMI ──
    useEffect(() => {
        const w = parseFloat(vitalsForm.weight);
        const h = parseFloat(vitalsForm.height) / 100; // cm to meters
        if (w > 0 && h > 0) {
            setVitalsForm(v => ({ ...v, bmi: (w / (h * h)).toFixed(1) }));
        }
    }, [vitalsForm.weight, vitalsForm.height]);

    // ── Open Vitals Modal ──
    const handleOpenVitals = (appt) => {
        const patientData = appt.userId || appt.clinicPatientId || {};
        const profile = patientData.fertilityProfile || {};
        
        let sBP = '';
        let dBP = '';
        if (profile.historyBp) {
            const parts = String(profile.historyBp).split('/');
            sBP = parts[0] || '';
            dBP = parts[1] || '';
        }

        setVitalsForm({
            weight: profile.weight || '',
            height: profile.height || '',
            bmi: '',
            systolicBP: sBP,
            diastolicBP: dBP,
            pulse: profile.historyPulse || '',
            temperature: profile.temperature || '',
            spo2: profile.spo2 || '',
            respiratoryRate: profile.respiratoryRate || '',
            chiefComplaint: appt.reason || '',
            notes: ''
        });
        setVitalsModal({ open: true, appt });
    };

    // ── Save OPD Vitals ──
    const handleSaveVitalsSubmit = async (e) => {
        e.preventDefault();
        if (!vitalsModal.appt) return;
        const appt = vitalsModal.appt;
        const patientId = appt.userId?._id || appt.clinicPatientId?._id || appt.patientId;

        if (!patientId) {
            showToast('Patient record not found', 'error');
            return;
        }

        setSavingVitals(true);
        try {
            const bpStr = vitalsForm.systolicBP && vitalsForm.diastolicBP 
                ? `${vitalsForm.systolicBP}/${vitalsForm.diastolicBP}`
                : vitalsForm.systolicBP || '';

            const profileData = {
                height: vitalsForm.height,
                weight: vitalsForm.weight,
                historyBp: bpStr,
                historyPulse: vitalsForm.pulse,
                temperature: vitalsForm.temperature,
                spo2: vitalsForm.spo2,
                respiratoryRate: vitalsForm.respiratoryRate,
                triageNotes: vitalsForm.notes
            };

            await doctorAPI.updatePatientProfile(patientId, profileData);
            showToast('OPD triage vitals recorded successfully');
            setVitalsModal({ open: false, appt: null });
            fetchQueue(true);
        } catch (err) {
            console.error('Error saving vitals:', err);
            showToast(err.response?.data?.message || 'Failed to save vitals', 'error');
        } finally {
            setSavingVitals(false);
        }
    };

    // ── Upload Diagnostic Report ──
    const handleUploadReportSubmit = async (e) => {
        e.preventDefault();
        if (!uploadFile || !uploadModal.appt) return;
        setUploadingReport(true);
        try {
            const formData = new FormData();
            formData.append('reportFile', uploadFile);
            formData.append('appointmentId', uploadModal.appt._id);

            const res = await reportAPI.uploadReport(formData);
            if (res.success && res.report) {
                const uploadedFile = res.report;
                const patientId = uploadModal.appt.userId?._id || uploadModal.appt.clinicPatientId?._id || uploadModal.appt.patientId;
                const existingReports = uploadModal.appt.userId?.fertilityProfile?.previousReports || [];

                const newReport = {
                    fileName: uploadFile.name,
                    url: uploadedFile.url,
                    date: new Date().toISOString()
                };

                await doctorAPI.updatePatientProfile(patientId, {
                    previousReports: [...existingReports, newReport]
                });

                showToast('Diagnostic report attached to patient profile');
                setUploadModal({ open: false, appt: null });
                setUploadFile(null);
                fetchQueue(true);
            }
        } catch (err) {
            console.error('Upload report error:', err);
            showToast(err.response?.data?.message || 'Error uploading report', 'error');
        } finally {
            setUploadingReport(false);
        }
    };

    // ── Date and Time formatting ──
    const todayStr = new Date().toISOString().split('T')[0];

    const isApptToday = (dateVal) => {
        if (!dateVal) return false;
        try {
            return new Date(dateVal).toISOString().split('T')[0] === todayStr;
        } catch {
            return false;
        }
    };

    // ── Metrics calculation ──
    const todayAppointments = useMemo(() => {
        return appointments.filter(a => isApptToday(a.appointmentDate));
    }, [appointments, todayStr]);

    const stats = useMemo(() => {
        const totalToday = todayAppointments.length;
        const waiting = todayAppointments.filter(a => ['pending', 'confirmed', 'checked_in', 'waiting'].includes((a.status || '').toLowerCase())).length;
        const inConsultation = todayAppointments.filter(a => ['in_consultation', 'in-consultation', 'in-progress'].includes((a.status || '').toLowerCase())).length;
        const completed = todayAppointments.filter(a => (a.status || '').toLowerCase() === 'completed').length;
        return { totalToday, waiting, inConsultation, completed };
    }, [todayAppointments]);

    // Unique Doctors for Filter
    const doctorsList = useMemo(() => {
        const set = new Map();
        appointments.forEach(a => {
            if (a.doctorId?._id && a.doctorId?.name) {
                set.set(String(a.doctorId._id), a.doctorId.name);
            }
        });
        return Array.from(set.entries()).map(([id, name]) => ({ id, name }));
    }, [appointments]);

    // ── Filtered List ──
    const filteredQueue = useMemo(() => {
        return appointments.filter(a => {
            // Tab filtering
            const isToday = isApptToday(a.appointmentDate);
            const statusLower = (a.status || '').toLowerCase();

            if (activeTab === 'today' && !isToday) return false;
            if (activeTab === 'waiting') {
                if (!isToday) return false;
                if (!['pending', 'confirmed', 'checked_in', 'waiting'].includes(statusLower)) return false;
            }
            if (activeTab === 'in_consultation') {
                if (!isToday) return false;
                if (!['in_consultation', 'in-consultation', 'in-progress'].includes(statusLower)) return false;
            }
            if (activeTab === 'completed') {
                if (statusLower !== 'completed') return false;
            }

            // Doctor filter
            if (selectedDoctorFilter !== 'ALL') {
                if (String(a.doctorId?._id) !== String(selectedDoctorFilter)) return false;
            }

            // Search query filter
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase();
                const pName = String(a.userId?.name || a.patientName || '').toLowerCase();
                const pPhone = String(a.userId?.phone || a.phone || '');
                const pMRN = String(a.userId?.patientId || a.userId?.uhid || a.clinicPatientId?.patientUid || '').toLowerCase();
                const dName = String(a.doctorId?.name || '').toLowerCase();
                const dept = String(a.department || a.serviceName || '').toLowerCase();

                if (!pName.includes(q) && !pPhone.includes(q) && !pMRN.includes(q) && !dName.includes(q) && !dept.includes(q)) {
                    return false;
                }
            }

            return true;
        });
    }, [appointments, activeTab, selectedDoctorFilter, searchQuery, todayStr]);

    return (
        <div className="nurse-opd-container">
            {/* ── Top Header Banner ── */}
            <div className="no-header-card">
                <div className="no-header-left">
                    <div className="no-title-row">
                        <h1>OPD Patient Queue</h1>
                        <span className="no-role-badge">NURSE</span>
                    </div>
                    <p className="no-subtitle">
                        Real-time out-patient triage, pre-consultation vitals recording & clinic flow monitoring
                    </p>
                </div>
                <div className="no-header-right">
                    <button
                        className="no-refresh-btn"
                        onClick={() => fetchQueue(true)}
                        disabled={refreshing}
                        title="Refresh Queue"
                    >
                        <FiRefreshCw className={refreshing ? 'spin' : ''} />
                        <span>{refreshing ? 'Refreshing...' : 'Refresh Queue'}</span>
                    </button>
                </div>
            </div>

            {/* ── KPI Stats Cards ── */}
            <div className="no-kpi-grid">
                <div className="no-kpi-card blue">
                    <div className="no-kpi-icon"><FiUsers size={22} /></div>
                    <div className="no-kpi-details">
                        <span className="no-kpi-val">{stats.totalToday}</span>
                        <span className="no-kpi-lbl">Today's OPD Total</span>
                    </div>
                </div>

                <div className="no-kpi-card amber">
                    <div className="no-kpi-icon"><FiClock size={22} /></div>
                    <div className="no-kpi-details">
                        <span className="no-kpi-val">{stats.waiting}</span>
                        <span className="no-kpi-lbl">Waiting / In Queue</span>
                    </div>
                </div>

                <div className="no-kpi-card purple">
                    <div className="no-kpi-icon"><FiActivity size={22} /></div>
                    <div className="no-kpi-details">
                        <span className="no-kpi-val">{stats.inConsultation}</span>
                        <span className="no-kpi-lbl">In Consultation</span>
                    </div>
                </div>

                <div className="no-kpi-card emerald">
                    <div className="no-kpi-icon"><FiCheckCircle size={22} /></div>
                    <div className="no-kpi-details">
                        <span className="no-kpi-val">{stats.completed}</span>
                        <span className="no-kpi-lbl">Completed Today</span>
                    </div>
                </div>
            </div>

            {/* ── Filter Toolbar ── */}
            <div className="no-toolbar">
                {/* Search Box */}
                <div className="no-search-box">
                    <FiSearch className="no-search-icon" />
                    <input
                        type="text"
                        placeholder="Search patient name, MRN, phone, doctor..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                    />
                    {searchQuery && (
                        <button className="no-search-clear" onClick={() => setSearchQuery('')}>
                            <FiX size={14} />
                        </button>
                    )}
                </div>

                {/* Status Tabs */}
                <div className="no-tab-group">
                    <button
                        className={`no-tab-btn ${activeTab === 'today' ? 'active' : ''}`}
                        onClick={() => setActiveTab('today')}
                    >
                        Today's Queue ({stats.totalToday})
                    </button>
                    <button
                        className={`no-tab-btn ${activeTab === 'waiting' ? 'active' : ''}`}
                        onClick={() => setActiveTab('waiting')}
                    >
                        Waiting ({stats.waiting})
                    </button>
                    <button
                        className={`no-tab-btn ${activeTab === 'in_consultation' ? 'active' : ''}`}
                        onClick={() => setActiveTab('in_consultation')}
                    >
                        In Consultation ({stats.inConsultation})
                    </button>
                    <button
                        className={`no-tab-btn ${activeTab === 'completed' ? 'active' : ''}`}
                        onClick={() => setActiveTab('completed')}
                    >
                        Completed ({stats.completed})
                    </button>
                    <button
                        className={`no-tab-btn ${activeTab === 'all' ? 'active' : ''}`}
                        onClick={() => setActiveTab('all')}
                    >
                        All OPD History
                    </button>
                </div>

                {/* Doctor Filter */}
                {doctorsList.length > 0 && (
                    <div className="no-doc-filter">
                        <FiFilter size={14} color="#64748b" />
                        <select
                            value={selectedDoctorFilter}
                            onChange={e => setSelectedDoctorFilter(e.target.value)}
                        >
                            <option value="ALL">All Attending Doctors</option>
                            {doctorsList.map(doc => (
                                <option key={doc.id} value={doc.id}>Dr. {doc.name}</option>
                            ))}
                        </select>
                    </div>
                )}
            </div>

            {/* ── Table Card ── */}
            <div className="no-table-card">
                <div className="no-table-header">
                    <h3>
                        <span>📋</span> OPD Patient Queue ({filteredQueue.length})
                    </h3>
                </div>

                {loading ? (
                    <div className="no-loading-box">
                        <div className="no-spinner" />
                        <span>Loading out-patient queue...</span>
                    </div>
                ) : filteredQueue.length === 0 ? (
                    <div className="no-empty-box">
                        <FiUsers size={44} color="#94a3b8" />
                        <h4>No OPD Patients Found</h4>
                        <p>There are no out-patient consultations matching your selected filters.</p>
                    </div>
                ) : (
                    <div className="no-table-responsive">
                        <table className="no-table">
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>Patient Details</th>
                                    <th>Contact</th>
                                    <th>Doctor Assigned</th>
                                    <th>Slot / Time</th>
                                    <th>Date</th>
                                    <th>Status</th>
                                    <th>Triage & Vitals</th>
                                    <th style={{ textAlign: 'center' }}>Nurse Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredQueue.map((appt, idx) => {
                                    const p = appt.userId || appt.clinicPatientId || {};
                                    const patientName = p.name || appt.patientName || 'Walk-in Patient';
                                    const mrn = p.patientId || p.uhid || p.mrn || '—';
                                    const doctorName = appt.doctorId?.name ? `Dr. ${appt.doctorId.name}` : 'Not Assigned';
                                    const dept = appt.department || appt.serviceName || 'OPD Consultation';
                                    const profile = p.fertilityProfile || {};
                                    const hasVitals = !!(profile.historyBp || profile.historyPulse || profile.weight || profile.temperature);

                                    const pid = p._id || p.patientId || appt.patientId || appt._id;

                                    return (
                                        <tr key={appt._id}>
                                            <td style={{ fontWeight: 700, color: '#64748b' }}>{idx + 1}</td>
                                            <td>
                                                <div className="no-pat-cell">
                                                    <div className="no-pat-avatar">
                                                        {(patientName || 'P')[0].toUpperCase()}
                                                    </div>
                                                    <div>
                                                        <div className="no-pat-name">{patientName}</div>
                                                        <div className="no-pat-mrn">MRN: {mrn} {p.age ? `• ${p.age}y` : ''} {p.gender ? `• ${p.gender}` : ''}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td style={{ color: '#475569', fontWeight: 500 }}>
                                                {p.phone || appt.phone || '—'}
                                            </td>
                                            <td>
                                                <div className="no-doc-cell">
                                                    <span className="no-doc-name">{doctorName}</span>
                                                    <span className="no-doc-dept">{dept}</span>
                                                </div>
                                            </td>
                                            <td>
                                                <div style={{ fontWeight: 700, color: '#1e293b' }}>
                                                    {appt.appointmentTime || 'Queue Slot'}
                                                </div>
                                            </td>
                                            <td style={{ color: '#64748b', fontSize: '0.82rem' }}>
                                                {appt.appointmentDate ? new Date(appt.appointmentDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—'}
                                            </td>
                                            <td>
                                                <span className={`no-status-tag ${(appt.status || 'pending').toLowerCase().replace(/\s+/g, '-')}`}>
                                                    {appt.status || 'Pending'}
                                                </span>
                                            </td>
                                            <td>
                                                {hasVitals ? (
                                                    <div className="no-vitals-snapshot" onClick={() => handleOpenVitals(appt)} title="Click to update vitals">
                                                        {profile.historyBp && <span><strong>BP:</strong> {profile.historyBp}</span>}
                                                        {profile.historyPulse && <span><strong>HR:</strong> {profile.historyPulse}</span>}
                                                        {profile.temperature && <span><strong>Temp:</strong> {profile.temperature}°F</span>}
                                                        {profile.weight && <span><strong>Wt:</strong> {profile.weight}kg</span>}
                                                    </div>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        className="no-btn-link"
                                                        onClick={() => handleOpenVitals(appt)}
                                                    >
                                                        + Record Vitals
                                                    </button>
                                                )}
                                            </td>
                                            <td>
                                                <div className="no-actions-row">
                                                    <button
                                                        type="button"
                                                        className="no-btn outline small"
                                                        onClick={() => handleOpenVitals(appt)}
                                                        title="Take or update patient vitals"
                                                    >
                                                        📊 Vitals
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="no-btn outline small"
                                                        onClick={() => setUploadModal({ open: true, appt })}
                                                        title="Attach diagnostic report"
                                                    >
                                                        📎 Report
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="no-btn primary small"
                                                        onClick={() => navigate(`/patient/${pid}/department/${encodeURIComponent(dept)}`)}
                                                        title="Open Unified Clinical Profile"
                                                    >
                                                        🩺 Profile
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* ── OPD Vitals Intake Modal ── */}
            {vitalsModal.open && (
                <div className="no-modal-overlay" onClick={() => setVitalsModal({ open: false, appt: null })}>
                    <div className="no-modal" onClick={e => e.stopPropagation()}>
                        <div className="no-modal-header">
                            <div>
                                <h3>📊 Record Out-Patient Vitals & Intake</h3>
                                <p style={{ margin: '2px 0 0', fontSize: '0.82rem', color: '#64748b' }}>
                                    Patient: <strong>{vitalsModal.appt?.userId?.name || vitalsModal.appt?.patientName}</strong> (MRN: {vitalsModal.appt?.userId?.patientId || vitalsModal.appt?.userId?.uhid || '—'})
                                </p>
                            </div>
                            <button className="no-close-btn" onClick={() => setVitalsModal({ open: false, appt: null })}>
                                <FiX size={18} />
                            </button>
                        </div>
                        <form onSubmit={handleSaveVitalsSubmit}>
                            <div className="no-modal-body">
                                <div className="no-form-grid">
                                    <div className="no-form-group">
                                        <label>Systolic BP (mmHg)</label>
                                        <input
                                            type="number"
                                            placeholder="e.g. 120"
                                            value={vitalsForm.systolicBP}
                                            onChange={e => setVitalsForm(p => ({ ...p, systolicBP: e.target.value }))}
                                        />
                                    </div>
                                    <div className="no-form-group">
                                        <label>Diastolic BP (mmHg)</label>
                                        <input
                                            type="number"
                                            placeholder="e.g. 80"
                                            value={vitalsForm.diastolicBP}
                                            onChange={e => setVitalsForm(p => ({ ...p, diastolicBP: e.target.value }))}
                                        />
                                    </div>
                                    <div className="no-form-group">
                                        <label>Heart Rate (bpm)</label>
                                        <input
                                            type="number"
                                            placeholder="e.g. 72"
                                            value={vitalsForm.pulse}
                                            onChange={e => setVitalsForm(p => ({ ...p, pulse: e.target.value }))}
                                        />
                                    </div>
                                    <div className="no-form-group">
                                        <label>Temperature (°F)</label>
                                        <input
                                            type="number"
                                            step="0.1"
                                            placeholder="e.g. 98.6"
                                            value={vitalsForm.temperature}
                                            onChange={e => setVitalsForm(p => ({ ...p, temperature: e.target.value }))}
                                        />
                                    </div>
                                    <div className="no-form-group">
                                        <label>SpO₂ (%)</label>
                                        <input
                                            type="number"
                                            placeholder="e.g. 98"
                                            value={vitalsForm.spo2}
                                            onChange={e => setVitalsForm(p => ({ ...p, spo2: e.target.value }))}
                                        />
                                    </div>
                                    <div className="no-form-group">
                                        <label>Respiratory Rate (/min)</label>
                                        <input
                                            type="number"
                                            placeholder="e.g. 16"
                                            value={vitalsForm.respiratoryRate}
                                            onChange={e => setVitalsForm(p => ({ ...p, respiratoryRate: e.target.value }))}
                                        />
                                    </div>
                                    <div className="no-form-group">
                                        <label>Weight (kg)</label>
                                        <input
                                            type="number"
                                            step="0.1"
                                            placeholder="e.g. 68.5"
                                            value={vitalsForm.weight}
                                            onChange={e => setVitalsForm(p => ({ ...p, weight: e.target.value }))}
                                        />
                                    </div>
                                    <div className="no-form-group">
                                        <label>Height (cm)</label>
                                        <input
                                            type="number"
                                            placeholder="e.g. 172"
                                            value={vitalsForm.height}
                                            onChange={e => setVitalsForm(p => ({ ...p, height: e.target.value }))}
                                        />
                                    </div>
                                    {vitalsForm.bmi && (
                                        <div className="no-form-group">
                                            <label>Calculated BMI</label>
                                            <div style={{ padding: '9px 12px', background: '#f1f5f9', borderRadius: '8px', fontWeight: 700, color: '#0f172a' }}>
                                                {vitalsForm.bmi} kg/m²
                                            </div>
                                        </div>
                                    )}
                                    <div className="no-form-group full-width">
                                        <label>Triage Observations / Chief Complaint</label>
                                        <textarea
                                            rows={2}
                                            placeholder="Patient presenting complaints, fever duration, allergies..."
                                            value={vitalsForm.notes}
                                            onChange={e => setVitalsForm(p => ({ ...p, notes: e.target.value }))}
                                        />
                                    </div>
                                </div>
                            </div>
                            <div className="no-modal-footer">
                                <button type="button" className="no-btn secondary" onClick={() => setVitalsModal({ open: false, appt: null })}>Cancel</button>
                                <button type="submit" className="no-btn primary" disabled={savingVitals}>
                                    {savingVitals ? 'Saving Vitals...' : '💾 Save OPD Vitals'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ── Report Upload Modal ── */}
            {uploadModal.open && (
                <div className="no-modal-overlay" onClick={() => setUploadModal({ open: false, appt: null })}>
                    <div className="no-modal" onClick={e => e.stopPropagation()}>
                        <div className="no-modal-header">
                            <div>
                                <h3>📎 Upload Diagnostic Report</h3>
                                <p style={{ margin: '2px 0 0', fontSize: '0.82rem', color: '#64748b' }}>
                                    Attach external lab report, scan, or investigation to {uploadModal.appt?.userId?.name}'s profile
                                </p>
                            </div>
                            <button className="no-close-btn" onClick={() => setUploadModal({ open: false, appt: null })}>
                                <FiX size={18} />
                            </button>
                        </div>
                        <form onSubmit={handleUploadReportSubmit}>
                            <div className="no-modal-body">
                                <div className="no-form-group">
                                    <label>Select Report File (PDF / Image) *</label>
                                    <input
                                        type="file"
                                        accept=".pdf,image/*"
                                        onChange={e => setUploadFile(e.target.files[0])}
                                        required
                                    />
                                </div>
                            </div>
                            <div className="no-modal-footer">
                                <button type="button" className="no-btn secondary" onClick={() => setUploadModal({ open: false, appt: null })}>Cancel</button>
                                <button type="submit" className="no-btn primary" disabled={uploadingReport || !uploadFile}>
                                    {uploadingReport ? 'Uploading...' : 'Upload & Attach'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ── Toast Notification ── */}
            {toast && <div className={`no-toast ${toast.type}`}>{toast.message}</div>}
        </div>
    );
};

export default NurseOPDQueue;
