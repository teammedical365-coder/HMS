import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { doctorAPI, receptionAPI } from '../../utils/api';
import {
    FiCalendar,
    FiSearch,
    FiClock,
    FiCheckCircle,
    FiUserCheck,
    FiRefreshCw,
    FiAlertCircle,
    FiActivity,
    FiX,
    FiFilter,
    FiUser,
    FiShield
} from 'react-icons/fi';
import './NurseAppointments.css';

const NurseAppointments = () => {
    const navigate = useNavigate();
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const userPermissions = user.permissions || [];
    const canBookAppointment = userPermissions.includes('appointment_manage') || userPermissions.includes('*');

    const [appointments, setAppointments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [selectedDoctorFilter, setSelectedDoctorFilter] = useState('ALL');
    const [activeTab, setActiveTab] = useState('all_day'); // 'all_day', 'confirmed', 'pending', 'completed'

    // Triage Vitals Modal
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
        notes: ''
    });
    const [savingVitals, setSavingVitals] = useState(false);
    const [toast, setToast] = useState(null);

    const showToast = useCallback((message, type = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3500);
    }, []);

    // ── Fetch Appointments ──
    const fetchAppointments = useCallback(async (isRefresh = false) => {
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
            console.error('Fetch appointments error:', err);
            showToast(err.response?.data?.message || 'Failed to load appointments', 'error');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [showToast]);

    useEffect(() => {
        fetchAppointments();
    }, [fetchAppointments]);

    // ── Auto Calculate BMI ──
    useEffect(() => {
        const w = parseFloat(vitalsForm.weight);
        const h = parseFloat(vitalsForm.height) / 100;
        if (w > 0 && h > 0) {
            setVitalsForm(v => ({ ...v, bmi: (w / (h * h)).toFixed(1) }));
        }
    }, [vitalsForm.weight, vitalsForm.height]);

    // ── Open Vitals Modal ──
    const handleOpenVitals = (appt) => {
        const p = appt.userId || appt.clinicPatientId || {};
        const profile = p.fertilityProfile || {};
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
            notes: ''
        });
        setVitalsModal({ open: true, appt });
    };

    // ── Save Vitals ──
    const handleSaveVitals = async (e) => {
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
            showToast('Pre-consultation vitals recorded');
            setVitalsModal({ open: false, appt: null });
            fetchAppointments(true);
        } catch (err) {
            console.error('Error recording vitals:', err);
            showToast(err.response?.data?.message || 'Failed to save vitals', 'error');
        } finally {
            setSavingVitals(false);
        }
    };

    // ── Unique Doctors ──
    const doctorsList = useMemo(() => {
        const set = new Map();
        appointments.forEach(a => {
            if (a.doctorId?._id && a.doctorId?.name) {
                set.set(String(a.doctorId._id), a.doctorId.name);
            }
        });
        return Array.from(set.entries()).map(([id, name]) => ({ id, name }));
    }, [appointments]);

    // ── Filter by Selected Date ──
    const dateFilteredAppointments = useMemo(() => {
        return appointments.filter(a => {
            if (!a.appointmentDate) return false;
            try {
                return new Date(a.appointmentDate).toISOString().split('T')[0] === selectedDate;
            } catch {
                return false;
            }
        });
    }, [appointments, selectedDate]);

    // ── Metrics for selected date ──
    const stats = useMemo(() => {
        const total = dateFilteredAppointments.length;
        const confirmed = dateFilteredAppointments.filter(a => (a.status || '').toLowerCase() === 'confirmed').length;
        const pending = dateFilteredAppointments.filter(a => ['pending', 'waiting'].includes((a.status || '').toLowerCase())).length;
        const completed = dateFilteredAppointments.filter(a => (a.status || '').toLowerCase() === 'completed').length;
        return { total, confirmed, pending, completed };
    }, [dateFilteredAppointments]);

    // ── Final Filtered Table Items ──
    const displayedAppointments = useMemo(() => {
        return dateFilteredAppointments.filter(a => {
            const statusLower = (a.status || '').toLowerCase();

            if (activeTab === 'confirmed' && statusLower !== 'confirmed') return false;
            if (activeTab === 'pending' && !['pending', 'waiting'].includes(statusLower)) return false;
            if (activeTab === 'completed' && statusLower !== 'completed') return false;

            if (selectedDoctorFilter !== 'ALL') {
                if (String(a.doctorId?._id) !== String(selectedDoctorFilter)) return false;
            }

            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase();
                const pName = String(a.userId?.name || a.patientName || '').toLowerCase();
                const pPhone = String(a.userId?.phone || a.phone || '');
                const pMRN = String(a.userId?.patientId || a.userId?.uhid || a.clinicPatientId?.patientUid || '').toLowerCase();
                const dName = String(a.doctorId?.name || '').toLowerCase();

                if (!pName.includes(q) && !pPhone.includes(q) && !pMRN.includes(q) && !dName.includes(q)) {
                    return false;
                }
            }

            return true;
        });
    }, [dateFilteredAppointments, activeTab, selectedDoctorFilter, searchQuery]);

    return (
        <div className="nurse-appts-container">
            {/* ── Top Header ── */}
            <div className="na-header-card">
                <div className="na-header-left">
                    <div className="na-title-row">
                        <h1>Appointments & Clinical Consultations</h1>
                        <span className="na-role-badge">NURSE</span>
                    </div>
                    <p className="na-subtitle">
                        Hospital appointment roster, doctor schedule overview & patient arrival check-in
                    </p>
                </div>
                <div className="na-header-right">
                    <button
                        className="na-refresh-btn"
                        onClick={() => fetchAppointments(true)}
                        disabled={refreshing}
                        title="Refresh Appointments"
                    >
                        <FiRefreshCw className={refreshing ? 'spin' : ''} />
                        <span>{refreshing ? 'Refreshing...' : 'Refresh Schedule'}</span>
                    </button>
                </div>
            </div>

            {/* ── KPI Grid ── */}
            <div className="na-kpi-grid">
                <div className="na-kpi-card blue">
                    <div className="na-kpi-icon"><FiCalendar size={22} /></div>
                    <div className="na-kpi-details">
                        <span className="na-kpi-val">{stats.total}</span>
                        <span className="na-kpi-lbl">Total on Selected Date</span>
                    </div>
                </div>

                <div className="na-kpi-card emerald">
                    <div className="na-kpi-icon"><FiCheckCircle size={22} /></div>
                    <div className="na-kpi-details">
                        <span className="na-kpi-val">{stats.confirmed}</span>
                        <span className="na-kpi-lbl">Confirmed & Scheduled</span>
                    </div>
                </div>

                <div className="na-kpi-card amber">
                    <div className="na-kpi-icon"><FiClock size={22} /></div>
                    <div className="na-kpi-details">
                        <span className="na-kpi-val">{stats.pending}</span>
                        <span className="na-kpi-lbl">Pending / Unconfirmed</span>
                    </div>
                </div>

                <div className="na-kpi-card purple">
                    <div className="na-kpi-icon"><FiActivity size={22} /></div>
                    <div className="na-kpi-details">
                        <span className="na-kpi-val">{stats.completed}</span>
                        <span className="na-kpi-lbl">Completed Consultations</span>
                    </div>
                </div>
            </div>

            {/* ── Filter Toolbar ── */}
            <div className="na-toolbar">
                {/* Date Picker */}
                <div className="na-date-box">
                    <FiCalendar size={16} color="#64748b" />
                    <input
                        type="date"
                        value={selectedDate}
                        onChange={e => setSelectedDate(e.target.value)}
                    />
                    <button
                        type="button"
                        className="na-today-btn"
                        onClick={() => setSelectedDate(new Date().toISOString().split('T')[0])}
                    >
                        Today
                    </button>
                </div>

                {/* Search */}
                <div className="na-search-box">
                    <FiSearch className="na-search-icon" />
                    <input
                        type="text"
                        placeholder="Search patient, MRN, phone, doctor..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                    />
                    {searchQuery && (
                        <button className="na-search-clear" onClick={() => setSearchQuery('')}>
                            <FiX size={14} />
                        </button>
                    )}
                </div>

                {/* Tabs */}
                <div className="na-tab-group">
                    <button
                        className={`na-tab-btn ${activeTab === 'all_day' ? 'active' : ''}`}
                        onClick={() => setActiveTab('all_day')}
                    >
                        All ({stats.total})
                    </button>
                    <button
                        className={`na-tab-btn ${activeTab === 'confirmed' ? 'active' : ''}`}
                        onClick={() => setActiveTab('confirmed')}
                    >
                        Confirmed ({stats.confirmed})
                    </button>
                    <button
                        className={`na-tab-btn ${activeTab === 'pending' ? 'active' : ''}`}
                        onClick={() => setActiveTab('pending')}
                    >
                        Pending ({stats.pending})
                    </button>
                    <button
                        className={`na-tab-btn ${activeTab === 'completed' ? 'active' : ''}`}
                        onClick={() => setActiveTab('completed')}
                    >
                        Completed ({stats.completed})
                    </button>
                </div>

                {/* Doctor Filter */}
                {doctorsList.length > 0 && (
                    <div className="na-doc-filter">
                        <FiFilter size={14} color="#64748b" />
                        <select
                            value={selectedDoctorFilter}
                            onChange={e => setSelectedDoctorFilter(e.target.value)}
                        >
                            <option value="ALL">All Doctors</option>
                            {doctorsList.map(doc => (
                                <option key={doc.id} value={doc.id}>Dr. {doc.name}</option>
                            ))}
                        </select>
                    </div>
                )}
            </div>

            {/* ── Table Card ── */}
            <div className="na-table-card">
                <div className="na-table-header">
                    <h3>
                        <span>📅</span> Scheduled Appointments ({displayedAppointments.length})
                    </h3>
                </div>

                {loading ? (
                    <div className="na-loading-box">
                        <div className="na-spinner" />
                        <span>Loading appointment roster...</span>
                    </div>
                ) : displayedAppointments.length === 0 ? (
                    <div className="na-empty-box">
                        <FiCalendar size={44} color="#94a3b8" />
                        <h4>No Appointments for Selected Date</h4>
                        <p>No consultations match your selected date and filter criteria.</p>
                    </div>
                ) : (
                    <div className="na-table-responsive">
                        <table className="na-table">
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>Patient Details</th>
                                    <th>Contact</th>
                                    <th>Attending Doctor</th>
                                    <th>Slot / Time</th>
                                    <th>Department</th>
                                    <th>Status</th>
                                    <th>Payment</th>
                                    <th style={{ textAlign: 'center' }}>Nurse Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {displayedAppointments.map((appt, idx) => {
                                    const p = appt.userId || appt.clinicPatientId || {};
                                    const patientName = p.name || appt.patientName || 'Walk-in Patient';
                                    const mrn = p.patientId || p.uhid || p.mrn || '—';
                                    const doctorName = appt.doctorId?.name ? `Dr. ${appt.doctorId.name}` : 'Not Assigned';
                                    const dept = appt.department || appt.serviceName || 'General OPD';
                                    const pid = p._id || p.patientId || appt.patientId || appt._id;

                                    return (
                                        <tr key={appt._id}>
                                            <td style={{ fontWeight: 700, color: '#64748b' }}>{idx + 1}</td>
                                            <td>
                                                <div className="na-pat-cell">
                                                    <div className="na-pat-avatar">
                                                        {(patientName || 'P')[0].toUpperCase()}
                                                    </div>
                                                    <div>
                                                        <div className="na-pat-name">{patientName}</div>
                                                        <div className="na-pat-mrn">MRN: {mrn} {p.age ? `• ${p.age}y` : ''}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td style={{ color: '#475569', fontWeight: 500 }}>
                                                {p.phone || appt.phone || '—'}
                                            </td>
                                            <td>
                                                <span className="na-doc-name">{doctorName}</span>
                                            </td>
                                            <td>
                                                <div style={{ fontWeight: 700, color: '#0f172a' }}>
                                                    {appt.appointmentTime || 'Scheduled'}
                                                </div>
                                            </td>
                                            <td style={{ color: '#64748b', fontSize: '0.82rem' }}>
                                                {dept}
                                            </td>
                                            <td>
                                                <span className={`na-status-tag ${(appt.status || 'pending').toLowerCase().replace(/\s+/g, '-')}`}>
                                                    {appt.status || 'Pending'}
                                                </span>
                                            </td>
                                            <td>
                                                <span className={`na-pay-tag ${(appt.paymentStatus || 'pending').toLowerCase()}`}>
                                                    {appt.paymentStatus || 'Pending'}
                                                </span>
                                            </td>
                                            <td>
                                                <div className="na-actions-row">
                                                    <button
                                                        type="button"
                                                        className="na-btn outline small"
                                                        onClick={() => handleOpenVitals(appt)}
                                                        title="Take pre-consultation vitals"
                                                    >
                                                        📊 Vitals
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="na-btn primary small"
                                                        onClick={() => navigate(`/patient/${pid}/department/${encodeURIComponent(dept)}`)}
                                                        title="View Unified Clinical Profile"
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

            {/* ── Triage Vitals Modal ── */}
            {vitalsModal.open && (
                <div className="na-modal-overlay" onClick={() => setVitalsModal({ open: false, appt: null })}>
                    <div className="na-modal" onClick={e => e.stopPropagation()}>
                        <div className="na-modal-header">
                            <div>
                                <h3>📊 Record Pre-Consultation Vitals</h3>
                                <p style={{ margin: '2px 0 0', fontSize: '0.82rem', color: '#64748b' }}>
                                    Patient: <strong>{vitalsModal.appt?.userId?.name || vitalsModal.appt?.patientName}</strong>
                                </p>
                            </div>
                            <button className="na-close-btn" onClick={() => setVitalsModal({ open: false, appt: null })}>
                                <FiX size={18} />
                            </button>
                        </div>
                        <form onSubmit={handleSaveVitals}>
                            <div className="na-modal-body">
                                <div className="na-form-grid">
                                    <div className="na-form-group">
                                        <label>Systolic BP (mmHg)</label>
                                        <input
                                            type="number"
                                            placeholder="e.g. 120"
                                            value={vitalsForm.systolicBP}
                                            onChange={e => setVitalsForm(p => ({ ...p, systolicBP: e.target.value }))}
                                        />
                                    </div>
                                    <div className="na-form-group">
                                        <label>Diastolic BP (mmHg)</label>
                                        <input
                                            type="number"
                                            placeholder="e.g. 80"
                                            value={vitalsForm.diastolicBP}
                                            onChange={e => setVitalsForm(p => ({ ...p, diastolicBP: e.target.value }))}
                                        />
                                    </div>
                                    <div className="na-form-group">
                                        <label>Heart Rate (bpm)</label>
                                        <input
                                            type="number"
                                            placeholder="e.g. 72"
                                            value={vitalsForm.pulse}
                                            onChange={e => setVitalsForm(p => ({ ...p, pulse: e.target.value }))}
                                        />
                                    </div>
                                    <div className="na-form-group">
                                        <label>Temperature (°F)</label>
                                        <input
                                            type="number"
                                            step="0.1"
                                            placeholder="e.g. 98.6"
                                            value={vitalsForm.temperature}
                                            onChange={e => setVitalsForm(p => ({ ...p, temperature: e.target.value }))}
                                        />
                                    </div>
                                    <div className="na-form-group">
                                        <label>SpO₂ (%)</label>
                                        <input
                                            type="number"
                                            placeholder="e.g. 98"
                                            value={vitalsForm.spo2}
                                            onChange={e => setVitalsForm(p => ({ ...p, spo2: e.target.value }))}
                                        />
                                    </div>
                                    <div className="na-form-group">
                                        <label>Respiratory Rate (/min)</label>
                                        <input
                                            type="number"
                                            placeholder="e.g. 16"
                                            value={vitalsForm.respiratoryRate}
                                            onChange={e => setVitalsForm(p => ({ ...p, respiratoryRate: e.target.value }))}
                                        />
                                    </div>
                                    <div className="na-form-group">
                                        <label>Weight (kg)</label>
                                        <input
                                            type="number"
                                            step="0.1"
                                            placeholder="e.g. 68.5"
                                            value={vitalsForm.weight}
                                            onChange={e => setVitalsForm(p => ({ ...p, weight: e.target.value }))}
                                        />
                                    </div>
                                    <div className="na-form-group">
                                        <label>Height (cm)</label>
                                        <input
                                            type="number"
                                            placeholder="e.g. 172"
                                            value={vitalsForm.height}
                                            onChange={e => setVitalsForm(p => ({ ...p, height: e.target.value }))}
                                        />
                                    </div>
                                    {vitalsForm.bmi && (
                                        <div className="na-form-group">
                                            <label>Calculated BMI</label>
                                            <div style={{ padding: '9px 12px', background: '#f1f5f9', borderRadius: '8px', fontWeight: 700, color: '#0f172a' }}>
                                                {vitalsForm.bmi} kg/m²
                                            </div>
                                        </div>
                                    )}
                                    <div className="na-form-group full-width">
                                        <label>Nurse Observations / Triage Notes</label>
                                        <textarea
                                            rows={2}
                                            placeholder="Patient presenting symptoms, allergies, general appearance..."
                                            value={vitalsForm.notes}
                                            onChange={e => setVitalsForm(p => ({ ...p, notes: e.target.value }))}
                                        />
                                    </div>
                                </div>
                            </div>
                            <div className="na-modal-footer">
                                <button type="button" className="na-btn secondary" onClick={() => setVitalsModal({ open: false, appt: null })}>Cancel</button>
                                <button type="submit" className="na-btn primary" disabled={savingVitals}>
                                    {savingVitals ? 'Saving Vitals...' : '💾 Save Vitals'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ── Toast Notification ── */}
            {toast && <div className={`na-toast ${toast.type}`}>{toast.message}</div>}
        </div>
    );
};

export default NurseAppointments;
