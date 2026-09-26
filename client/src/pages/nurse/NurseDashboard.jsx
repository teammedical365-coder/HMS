import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ipdNursingAPI, admissionAPI } from '../../utils/api';
import socket from '../../utils/socket';
import {
    FiSearch,
    FiActivity,
    FiClock,
    FiAlertTriangle,
    FiUsers,
    FiChevronRight,
    FiDroplet,
    FiCheckSquare,
    FiRefreshCw,
    FiShield,
    FiCheck,
    FiPlus,
    FiUserCheck
} from 'react-icons/fi';
import './NurseDashboard.css';

const getInitials = (name) => {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return parts[0].slice(0, 2).toUpperCase();
};

const getWardBadgeClass = (ward) => {
    const w = (ward || '').toLowerCase();
    if (w.includes('icu') || w.includes('ccu') || w.includes('nicu')) return 'icu';
    if (w.includes('private') || w.includes('deluxe')) return 'private';
    if (w.includes('semi')) return 'semi';
    return 'general';
};

const NurseDashboard = () => {
    const navigate = useNavigate();
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const userName = user.name || 'Nurse';
    const userId = user._id || user.userId;

    const [patients, setPatients] = useState([]);
    const [summary, setSummary] = useState({
        assignedPatients: 0,
        medicinesDue: 0,
        overdue: 0,
        ivRunning: 0,
        tasksPending: 0,
        totalInpatients: 0
    });
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [searchText, setSearchText] = useState('');
    const [activeFilter, setActiveFilter] = useState('All'); // 'All' | 'Critical' | 'Medication Due' | 'Drip Running' | 'Stable'
    const [activeWard, setActiveWard] = useState('All');

    const [toast, setToast] = useState(null);
    const toastTimeoutRef = useRef(null);

    const showToast = useCallback((message, type = 'success') => {
        setToast({ message, type });
        if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
        toastTimeoutRef.current = setTimeout(() => setToast(null), 3500);
    }, []);

    // ── Fetch Nurse Dashboard Summary & Patient Data ──
    const fetchDashboardData = useCallback(async (isManualRefresh = false) => {
        if (!isManualRefresh) setLoading(true);
        else setRefreshing(true);

        let loadSuccessful = false;

        // 1. Primary: Try unified high-performance IPD summary endpoint
        try {
            const res = await ipdNursingAPI.getDashboardSummary();
            if (res && res.success) {
                setPatients(res.patients || []);
                setSummary(res.summary || {
                    assignedPatients: 0,
                    medicinesDue: 0,
                    overdue: 0,
                    ivRunning: 0,
                    tasksPending: 0,
                    totalInpatients: 0
                });
                loadSuccessful = true;
            }
        } catch (apiErr) {
            console.warn('Nurse Dashboard — Unified summary endpoint fallback to active admissions:', apiErr?.message || apiErr);
        }

        // 2. Resilient Fallback: If summary endpoint is not yet loaded or errored, fetch active admissions
        if (!loadSuccessful) {
            try {
                const admRes = await admissionAPI.getActiveAdmissions();
                const list = admRes.admissions || admRes.data || [];
                const formatted = list.map(a => {
                    const patient = a.patientId || {};
                    const doctor = a.doctorId || {};
                    const appt = a.appointmentId || {};
                    return {
                        admissionId: a._id,
                        patientId: patient._id || patient,
                        patientName: patient.name || 'Inpatient',
                        patientUid: patient.patientId || patient.mrn || '',
                        age: patient.age || (patient.dob ? Math.floor((Date.now() - new Date(patient.dob)) / (365.25 * 24 * 60 * 60 * 1000)) : ''),
                        gender: patient.gender || '',
                        ward: a.ward || 'General',
                        bedNumber: a.bedNumber || '—',
                        attendingDoctor: doctor.name ? `Dr. ${doctor.name}` : (appt.doctorName ? `Dr. ${appt.doctorName}` : 'Not Assigned'),
                        admissionDate: a.admissionDate,
                        clinicalStatus: (a.ward || '').toLowerCase().includes('icu') ? 'Critical' : 'Stable',
                        medicineDue: null,
                        nextMedicine: null,
                        ivFluid: null,
                        latestVitals: null,
                        activeOrdersCount: 0,
                        pendingTasksCount: 0
                    };
                });
                setPatients(formatted);
                setSummary({
                    assignedPatients: formatted.length,
                    medicinesDue: 0,
                    overdue: 0,
                    ivRunning: 0,
                    tasksPending: 0,
                    totalInpatients: formatted.length
                });
                loadSuccessful = true;
            } catch (fallbackErr) {
                console.error('Nurse Dashboard — Fallback active admissions also failed:', fallbackErr);
            }
        }

        if (loadSuccessful && isManualRefresh) {
            showToast('IPD care data updated', 'success');
        } else if (!loadSuccessful) {
            showToast('Could not refresh IPD care data', 'error');
        }

        setLoading(false);
        setRefreshing(false);
    }, [showToast]);

    useEffect(() => {
        fetchDashboardData();
    }, [fetchDashboardData]);

    // ── Socket.IO Real-time Sync ──
    useEffect(() => {
        const hospitalId = user.hospitalId;
        if (!hospitalId) return;

        if (!socket.connected) {
            socket.connect();
            socket.emit('join_hospital', hospitalId);
        }

        const handleLiveUpdate = () => {
            fetchDashboardData(true);
        };

        const events = [
            'inpatient_order_created',
            'inpatient_order_updated',
            'mar_administered',
            'mar_scheduled',
            'vitals_recorded',
            'nursing_task_created',
            'nursing_task_updated',
            'admission_created',
            'patient_discharged',
            'nurse_assigned',
            'ipd_update'
        ];

        events.forEach(evt => socket.on(evt, handleLiveUpdate));

        return () => {
            events.forEach(evt => socket.off(evt, handleLiveUpdate));
        };
    }, [user.hospitalId, fetchDashboardData]);

    // ── Ward List ──
    const wards = useMemo(() => {
        const set = new Set();
        patients.forEach(p => { if (p.ward) set.add(p.ward); });
        return ['All', ...Array.from(set).sort()];
    }, [patients]);

    // ── Filtered Patients ──
    const filteredPatients = useMemo(() => {
        return patients.filter(p => {
            // Search query filter
            if (searchText) {
                const q = searchText.toLowerCase();
                const name = (p.patientName || '').toLowerCase();
                const uid = (p.patientUid || '').toLowerCase();
                const doc = (p.attendingDoctor || '').toLowerCase();
                const ward = (p.ward || '').toLowerCase();
                const bed = String(p.bedNumber || '').toLowerCase();

                if (!name.includes(q) && !uid.includes(q) && !doc.includes(q) && !ward.includes(q) && !bed.includes(q)) {
                    return false;
                }
            }

            // Ward filter
            if (activeWard !== 'All' && p.ward !== activeWard) {
                return false;
            }

            // Clinical Status filter
            if (activeFilter === 'Critical' && p.clinicalStatus !== 'Critical') return false;
            if (activeFilter === 'Medication Due' && !p.medicineDue) return false;
            if (activeFilter === 'Drip Running' && !p.ivFluid) return false;
            if (activeFilter === 'Stable' && p.clinicalStatus !== 'Stable') return false;

            return true;
        });
    }, [patients, searchText, activeWard, activeFilter]);

    return (
        <div className="nurse-ipd-container">
            {/* ── Toast Notification ── */}
            {toast && (
                <div className={`nipd-toast ${toast.type}`}>
                    <span>{toast.message}</span>
                </div>
            )}

            {/* ── Header ── */}
            <div className="nipd-header">
                <div className="nipd-header-left">
                    <div className="nipd-title-badge">NURSE CLINICAL WORKSPACE</div>
                    <h1 className="nipd-title">Nurse IPD Care</h1>
                    <p className="nipd-subtitle">Manage assigned inpatients, medications, IV fluids and clinical tasks.</p>
                </div>
                <div className="nipd-header-right">
                    <div className="nipd-live-badge">
                        <span className="nipd-pulse-dot" /> LIVE
                    </div>
                    <button
                        className="nipd-refresh-btn"
                        onClick={() => fetchDashboardData(true)}
                        disabled={refreshing || loading}
                        title="Refresh IPD Care status"
                    >
                        <FiRefreshCw size={14} className={refreshing ? 'spinning' : ''} />
                        <span>Refresh</span>
                    </button>
                    <div className="nipd-nurse-profile">
                        <div className="nipd-nurse-avatar">{getInitials(userName)}</div>
                        <div className="nipd-nurse-info">
                            <span className="nipd-nurse-name">{userName}</span>
                            <span className="nipd-nurse-role">Duty Staff Nurse</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Top Summary Cards ── */}
            <div className="nipd-summary-grid">
                <div
                    className={`nipd-summary-card ${activeFilter === 'All' ? 'selected' : ''}`}
                    onClick={() => setActiveFilter('All')}
                >
                    <div className="nipd-summary-icon blue">
                        <FiUsers size={20} />
                    </div>
                    <div className="nipd-summary-data">
                        <span className="nipd-summary-value">{summary.assignedPatients || patients.length || 0}</span>
                        <span className="nipd-summary-label">Assigned Patients</span>
                    </div>
                </div>

                <div
                    className={`nipd-summary-card ${activeFilter === 'Medication Due' ? 'selected' : ''}`}
                    onClick={() => setActiveFilter('Medication Due')}
                >
                    <div className="nipd-summary-icon amber">
                        <FiClock size={20} />
                    </div>
                    <div className="nipd-summary-data">
                        <span className="nipd-summary-value">{summary.medicinesDue || 0}</span>
                        <span className="nipd-summary-label">Medicines Due</span>
                    </div>
                </div>

                <div
                    className={`nipd-summary-card alert ${summary.overdue > 0 ? 'has-alert' : ''}`}
                    onClick={() => setActiveFilter('Medication Due')}
                >
                    <div className="nipd-summary-icon red">
                        <FiAlertTriangle size={20} />
                    </div>
                    <div className="nipd-summary-data">
                        <span className="nipd-summary-value">{summary.overdue || 0}</span>
                        <span className="nipd-summary-label">Overdue</span>
                    </div>
                </div>

                <div
                    className={`nipd-summary-card ${activeFilter === 'Drip Running' ? 'selected' : ''}`}
                    onClick={() => setActiveFilter('Drip Running')}
                >
                    <div className="nipd-summary-icon teal">
                        <FiDroplet size={20} />
                    </div>
                    <div className="nipd-summary-data">
                        <span className="nipd-summary-value">{summary.ivRunning || 0}</span>
                        <span className="nipd-summary-label">IV Drips Running</span>
                    </div>
                </div>

                <div className="nipd-summary-card">
                    <div className="nipd-summary-icon purple">
                        <FiCheckSquare size={20} />
                    </div>
                    <div className="nipd-summary-data">
                        <span className="nipd-summary-value">{summary.tasksPending || 0}</span>
                        <span className="nipd-summary-label">Tasks Pending</span>
                    </div>
                </div>
            </div>

            {/* ── Main Section: Patient List ── */}
            <div className="nipd-patient-section">
                <div className="nipd-section-header">
                    <div className="nipd-section-title-wrap">
                        <h2>MY IPD PATIENTS</h2>
                        <span className="nipd-patient-count-badge">{filteredPatients.length} Active</span>
                    </div>

                    {/* Ward Selector */}
                    <div className="nipd-ward-filter">
                        {wards.map(w => (
                            <button
                                key={w}
                                className={`nipd-ward-pill ${activeWard === w ? 'active' : ''}`}
                                onClick={() => setActiveWard(w)}
                            >
                                {w}
                                {w !== 'All' && (
                                    <span className="nipd-ward-count">
                                        {patients.filter(p => p.ward === w).length}
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Toolbar: Search & Filter Pills */}
                <div className="nipd-toolbar">
                    <div className="nipd-search-box">
                        <FiSearch size={16} className="nipd-search-icon" />
                        <input
                            type="text"
                            placeholder="Search patient, MRN, UHID, ward or bed..."
                            value={searchText}
                            onChange={(e) => setSearchText(e.target.value)}
                        />
                        {searchText && (
                            <button className="nipd-search-clear" onClick={() => setSearchText('')}>✕</button>
                        )}
                    </div>

                    <div className="nipd-filter-pills">
                        {['All', 'Critical', 'Medication Due', 'Drip Running', 'Stable'].map(f => (
                            <button
                                key={f}
                                className={`nipd-filter-pill ${activeFilter === f ? 'active' : ''} ${f === 'Critical' ? 'crit' : ''}`}
                                onClick={() => setActiveFilter(f)}
                            >
                                {f === 'Critical' && '● '}
                                {f}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Patient Cards Grid */}
                {loading ? (
                    <div className="nipd-loading-state">
                        <div className="nipd-spinner" />
                        <p>Loading assigned IPD care records...</p>
                    </div>
                ) : filteredPatients.length === 0 ? (
                    <div className="nipd-empty-state">
                        <div className="nipd-empty-icon">🏥</div>
                        <h3>No IPD patients assigned</h3>
                        <p>
                            {searchText || activeFilter !== 'All' || activeWard !== 'All'
                                ? 'No patients matched your search or active filter criteria.'
                                : 'You are all caught up! No active IPD care tasks pending right now.'}
                        </p>
                        {(searchText || activeFilter !== 'All' || activeWard !== 'All') && (
                            <button
                                className="nipd-reset-btn"
                                onClick={() => { setSearchText(''); setActiveFilter('All'); setActiveWard('All'); }}
                            >
                                Reset Filters
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="nipd-cards-grid">
                        {filteredPatients.map(pt => {
                            const wardClass = getWardBadgeClass(pt.ward);
                            const isCrit = pt.clinicalStatus === 'Critical';

                            return (
                                <div className={`nipd-patient-card ${isCrit ? 'critical-border' : ''}`} key={pt.admissionId}>
                                    {/* Card Top: Patient Details & Status */}
                                    <div className="nipd-card-top">
                                        <div className="nipd-patient-primary">
                                            <div className="nipd-pt-avatar">{getInitials(pt.patientName)}</div>
                                            <div className="nipd-pt-meta">
                                                <h3 className="nipd-pt-name" onClick={() => navigate(`/nurse/patient/${pt.admissionId}`)}>
                                                    {pt.patientName}
                                                </h3>
                                                <div className="nipd-pt-sub">
                                                    {pt.age && <span>{pt.age} Yrs</span>}
                                                    {pt.gender && <span>• {pt.gender}</span>}
                                                    {pt.patientUid && <span className="nipd-mrn-tag">MRN: {pt.patientUid}</span>}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="nipd-location-badges">
                                            <span className={`nipd-ward-badge ${wardClass}`}>{pt.ward}</span>
                                            <span className="nipd-bed-badge">Bed {pt.bedNumber}</span>
                                        </div>
                                    </div>

                                    {/* Attending Doctor & Clinical Status Bar */}
                                    <div className="nipd-card-mid-bar">
                                        <div className="nipd-doctor-tag">
                                            <span className="nipd-lbl">Attending:</span>
                                            <strong>{pt.attendingDoctor}</strong>
                                        </div>
                                        <div className={`nipd-status-pill ${pt.clinicalStatus.toLowerCase().replace(/\s+/g, '-')}`}>
                                            ● {pt.clinicalStatus}
                                        </div>
                                    </div>

                                    {/* Clinical Care Status: Med Due, Next, IV Fluid */}
                                    <div className="nipd-card-clinical-body">
                                        {/* Medicine Due Now */}
                                        <div className={`nipd-clinical-row ${pt.medicineDue?.isOverdue ? 'overdue-alert' : pt.medicineDue ? 'due-alert' : ''}`}>
                                            <div className="nipd-row-label">
                                                <span className="nipd-dot" />
                                                <strong>Medicine Due:</strong>
                                            </div>
                                            <div className="nipd-row-content">
                                                {pt.medicineDue ? (
                                                    <span className="nipd-med-highlight">
                                                        {pt.medicineDue.name} {pt.medicineDue.dose ? `(${pt.medicineDue.dose})` : ''} — <strong>{pt.medicineDue.timeStr}</strong>
                                                        {pt.medicineDue.isOverdue && <span className="nipd-overdue-tag">OVERDUE</span>}
                                                    </span>
                                                ) : (
                                                    <span className="nipd-muted-text">None currently due</span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Next Medicine */}
                                        <div className="nipd-clinical-row">
                                            <div className="nipd-row-label">
                                                <span className="nipd-dot next" />
                                                <span>Next:</span>
                                            </div>
                                            <div className="nipd-row-content">
                                                {pt.nextMedicine ? (
                                                    <span>{pt.nextMedicine.name} {pt.nextMedicine.dose ? `(${pt.nextMedicine.dose})` : ''} — <strong>{pt.nextMedicine.timeStr}</strong></span>
                                                ) : (
                                                    <span className="nipd-muted-text">—</span>
                                                )}
                                            </div>
                                        </div>

                                        {/* IV Fluid / Drip Running */}
                                        <div className="nipd-clinical-row iv">
                                            <div className="nipd-row-label">
                                                <span className="nipd-dot iv" />
                                                <span>IV:</span>
                                            </div>
                                            <div className="nipd-row-content">
                                                {pt.ivFluid ? (
                                                    <span className="nipd-iv-running-tag">
                                                        <FiDroplet size={12} /> {pt.ivFluid.name} — <strong>Running ({pt.ivFluid.rate})</strong>
                                                    </span>
                                                ) : (
                                                    <span className="nipd-muted-text">No active IV drip</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Card Footer: Vitals Snippet & Open Patient Action */}
                                    <div className="nipd-card-footer">
                                        <div className="nipd-footer-vitals">
                                            {pt.latestVitals ? (
                                                <div className="nipd-vitals-pills">
                                                    {pt.latestVitals.bp && <span className="nipd-v-pill">BP {pt.latestVitals.bp}</span>}
                                                    {pt.latestVitals.pulse && <span className="nipd-v-pill">HR {pt.latestVitals.pulse}</span>}
                                                    {pt.latestVitals.spo2 && (
                                                        <span className={`nipd-v-pill ${pt.latestVitals.spo2 < 95 ? 'spo2-warn' : ''}`}>
                                                            SpO₂ {pt.latestVitals.spo2}%
                                                        </span>
                                                    )}
                                                </div>
                                            ) : (
                                                <span className="nipd-no-vitals">Vitals pending</span>
                                            )}
                                        </div>

                                        <button
                                            className="nipd-open-btn"
                                            onClick={() => navigate(`/nurse/patient/${pt.admissionId}`)}
                                        >
                                            <span>Open Patient</span>
                                            <FiChevronRight size={15} />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};

export default NurseDashboard;
