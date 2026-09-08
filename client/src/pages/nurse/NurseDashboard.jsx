import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { admissionAPI, ipdClinicalAPI, ipdNursingAPI } from '../../utils/api';
import socket from '../../utils/socket';
import {
    FiSearch,
    FiActivity,
    FiClock,
    FiAlertTriangle,
    FiUsers,
    FiChevronRight,
    FiUserCheck,
    FiDroplet,
    FiCheckSquare,
    FiLogOut,
    FiPlus,
    FiRefreshCw,
    FiFilter,
    FiScissors
} from 'react-icons/fi';
import './NurseDashboard.css';

// ── Ward badge classifier ──
const getWardClass = (ward) => {
    const w = (ward || '').toLowerCase();
    if (w.includes('icu')) return 'icu';
    if (w.includes('private')) return 'private';
    if (w.includes('semi')) return 'semi';
    if (w.includes('general')) return 'general';
    return 'default';
};

// ── Patient initials ──
const getInitials = (name) => {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return parts[0].slice(0, 2).toUpperCase();
};

// ── Days since admission ──
const daysSince = (dateStr) => {
    if (!dateStr) return 0;
    const diff = Date.now() - new Date(dateStr).getTime();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
};

// ── Vital status classifier ──
const getVitalStatus = (vitals) => {
    if (!vitals) return null;
    const checks = [];
    if (vitals.spo2 !== undefined && vitals.spo2 !== null) {
        checks.push({ label: `SpO₂ ${vitals.spo2}%`, status: vitals.spo2 < 90 ? 'critical' : vitals.spo2 < 95 ? 'warning' : 'normal' });
    }
    if (vitals.pulse !== undefined && vitals.pulse !== null) {
        checks.push({ label: `HR ${vitals.pulse}`, status: vitals.pulse > 120 || vitals.pulse < 50 ? 'critical' : vitals.pulse > 100 || vitals.pulse < 60 ? 'warning' : 'normal' });
    }
    if (vitals.systolicBP !== undefined && vitals.systolicBP !== null) {
        const bp = vitals.systolicBP;
        checks.push({ label: `BP ${bp}/${vitals.diastolicBP || '?'}`, status: bp > 180 || bp < 90 ? 'critical' : bp > 140 || bp < 100 ? 'warning' : 'normal' });
    }
    return checks.length > 0 ? checks : null;
};

const NurseDashboard = () => {
    const navigate = useNavigate();
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const userName = user.name || 'Nurse';
    const userId = user._id || user.userId;

    const [admissions, setAdmissions] = useState([]);
    const [operationsMetrics, setOperationsMetrics] = useState(null);
    const [hospitalNurses, setHospitalNurses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchText, setSearchText] = useState('');
    const [activeWard, setActiveWard] = useState('All');
    const [workloadFilter, setWorkloadFilter] = useState('ALL');
    const [vitalsMap, setVitalsMap] = useState({}); // admissionId -> latest vitals
    const [alertsMap, setAlertsMap] = useState({}); // admissionId -> alerts array

    // Assignment Modal state
    const [assignModal, setAssignModal] = useState({ open: false, admission: null, nurseId: '', shift: 'Morning', notes: '' });
    const [submittingAssign, setSubmittingAssign] = useState(false);
    const [toast, setToast] = useState(null);

    const toastTimeoutRef = useRef(null);

    const showToast = useCallback((message, type = 'success') => {
        setToast({ message, type });
        if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
        toastTimeoutRef.current = setTimeout(() => setToast(null), 3500);
    }, []);

    // ── Fetch all active admissions and metrics ──
    const fetchDashboardData = useCallback(async () => {
        try {
            const [admissionsRes, metricsRes, nursesRes] = await Promise.all([
                admissionAPI.getActiveAdmissions(),
                ipdNursingAPI.getOperationsMetrics().catch(() => ({ metrics: null })),
                ipdNursingAPI.getHospitalNurses().catch(() => ({ nurses: [] }))
            ]);

            const list = admissionsRes.admissions || admissionsRes.data || [];
            setAdmissions(list);
            if (metricsRes.metrics || metricsRes.data) {
                setOperationsMetrics(metricsRes.metrics || metricsRes.data);
            }
            if (nursesRes.nurses || nursesRes.data) {
                setHospitalNurses(nursesRes.nurses || nursesRes.data);
            }

            // Fetch latest vitals and alerts for visible admissions (batched)
            const batch = list.slice(0, 30);
            const vitalsPromises = batch.map(adm =>
                ipdClinicalAPI.getLatestVitals(adm._id)
                    .then(r => ({ id: adm._id, vitals: r.vitals }))
                    .catch(() => ({ id: adm._id, vitals: null }))
            );
            const alertsPromises = batch.map(adm =>
                ipdNursingAPI.getAdmissionAlerts(adm._id)
                    .then(r => ({ id: adm._id, alerts: r.alerts || [] }))
                    .catch(() => ({ id: adm._id, alerts: [] }))
            );

            const [vitalsResults, alertsResults] = await Promise.all([
                Promise.all(vitalsPromises),
                Promise.all(alertsPromises)
            ]);

            const vMap = {};
            vitalsResults.forEach(v => { vMap[v.id] = v.vitals; });
            setVitalsMap(vMap);

            const aMap = {};
            alertsResults.forEach(a => { aMap[a.id] = a.alerts; });
            setAlertsMap(aMap);
        } catch (err) {
            console.error('Nurse Dashboard — Error fetching data:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchDashboardData();
    }, [fetchDashboardData]);

    // ── Socket.IO Real-time synchronization ──
    useEffect(() => {
        const hospitalId = user.hospitalId;
        if (!hospitalId) return;

        if (!socket.connected) {
            socket.connect();
            socket.emit('join_hospital', hospitalId);
        }

        const handleRefresh = () => {
            fetchDashboardData();
        };

        socket.on('nurse_assigned', handleRefresh);
        socket.on('nurse_unassigned', handleRefresh);
        socket.on('discharge_readiness_changed', handleRefresh);
        socket.on('admission_created', handleRefresh);
        socket.on('admission_updated', handleRefresh);
        socket.on('patient_discharged', handleRefresh);
        socket.on('bed_status_changed', handleRefresh);
        socket.on('vitals_recorded', handleRefresh);
        socket.on('inpatient_order_created', handleRefresh);
        socket.on('nursing_task_created', handleRefresh);
        socket.on('nursing_task_updated', handleRefresh);
        socket.on('intake_output_recorded', handleRefresh);

        return () => {
            socket.off('nurse_assigned', handleRefresh);
            socket.off('nurse_unassigned', handleRefresh);
            socket.off('discharge_readiness_changed', handleRefresh);
            socket.off('admission_created', handleRefresh);
            socket.off('admission_updated', handleRefresh);
            socket.off('patient_discharged', handleRefresh);
            socket.off('bed_status_changed', handleRefresh);
            socket.off('vitals_recorded', handleRefresh);
            socket.off('inpatient_order_created', handleRefresh);
            socket.off('nursing_task_created', handleRefresh);
            socket.off('nursing_task_updated', handleRefresh);
            socket.off('intake_output_recorded', handleRefresh);
        };
    }, [user.hospitalId, fetchDashboardData]);

    // ── Handle Nurse Assignment ──
    const handleAssignSubmit = async (e) => {
        e.preventDefault();
        if (!assignModal.admission || !assignModal.nurseId) {
            showToast('Please select a nurse', 'error');
            return;
        }
        try {
            setSubmittingAssign(true);
            await ipdNursingAPI.assignNurse(assignModal.admission._id, {
                nurseId: assignModal.nurseId,
                shift: assignModal.shift,
                notes: assignModal.notes
            });
            setAssignModal({ open: false, admission: null, nurseId: '', shift: 'Morning', notes: '' });
            showToast('Nurse assigned successfully');
            fetchDashboardData();
        } catch (err) {
            showToast(err.response?.data?.message || 'Error assigning nurse', 'error');
        } finally {
            setSubmittingAssign(false);
        }
    };

    // ── Unique Wards ──
    const wards = useMemo(() => {
        const set = new Set();
        admissions.forEach(a => { if (a.ward) set.add(a.ward); });
        return ['All', ...Array.from(set).sort()];
    }, [admissions]);

    // ── Filtered Admissions ──
    const filteredAdmissions = useMemo(() => {
        return admissions.filter(a => {
            // 1. Search text
            if (searchText) {
                const q = searchText.toLowerCase();
                const pName = typeof a.patientId === 'object' ? (a.patientId?.name || '').toLowerCase() : '';
                const pId = typeof a.patientId === 'object' ? (a.patientId?.patientId || a.patientId?.mrn || '').toLowerCase() : '';
                const docName = typeof a.doctorId === 'object' ? (a.doctorId?.name || '').toLowerCase() : '';
                const ward = (a.ward || '').toLowerCase();
                const bed = String(a.bedNumber || '').toLowerCase();

                if (!pName.includes(q) && !pId.includes(q) && !docName.includes(q) && !ward.includes(q) && !bed.includes(q)) {
                    return false;
                }
            }

            // 2. Ward tab
            if (activeWard !== 'All' && a.ward !== activeWard) {
                return false;
            }

            // 3. Workload filter
            if (workloadFilter === 'MY_PATIENTS') {
                const isAssigned = (a.assignedNurses || []).some(
                    n => String(n.nurseId?._id || n.nurseId) === String(userId) && n.status === 'ACTIVE'
                );
                if (!isAssigned) return false;
            } else if (workloadFilter === 'CRITICAL_VITALS') {
                const vit = vitalsMap[a._id];
                const status = getVitalStatus(vit);
                const hasCritical = status && status.some(s => s.status === 'critical');
                if (!hasCritical) return false;
            } else if (workloadFilter === 'DISCHARGE_PENDING') {
                if (!a.dischargeReadiness?.doctorDischargeOrdered) return false;
            } else if (workloadFilter === 'ALERTS') {
                const alerts = alertsMap[a._id] || [];
                if (alerts.length === 0) return false;
            }

            return true;
        });
    }, [admissions, searchText, activeWard, workloadFilter, vitalsMap, alertsMap, userId]);

    // ── Summary KPI Counts ──
    const myPatientsCount = useMemo(() => {
        return admissions.filter(a =>
            (a.assignedNurses || []).some(n => String(n.nurseId?._id || n.nurseId) === String(userId) && n.status === 'ACTIVE')
        ).length;
    }, [admissions, userId]);

    const criticalVitalsCount = useMemo(() => {
        return Object.values(vitalsMap).filter(v => {
            const status = getVitalStatus(v);
            return status && status.some(s => s.status === 'critical');
        }).length;
    }, [vitalsMap]);

    return (
        <div className="nurse-dashboard">
            {/* ── Top Bar ── */}
            <div className="nd-header">
                <div className="nd-header-title">
                    <span className="nd-header-tag">IPD Clinical Operations</span>
                    <h1>Nurse Command Center</h1>
                    <p>Logged in as <strong>{userName}</strong> • {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })}</p>
                </div>
                <div className="nd-header-actions">
                    <button className="nd-refresh-btn" onClick={fetchDashboardData} disabled={loading}>
                        <FiRefreshCw size={14} className={loading ? 'spinning' : ''} /> Refresh Live
                    </button>
                </div>
            </div>

            {/* ── KPI Operations Summary Bar ── */}
            <div className="nd-stats-row">
                <div className={`nd-stat-card ${workloadFilter === 'ALL' ? 'active' : ''}`} onClick={() => setWorkloadFilter('ALL')}>
                    <div className="nd-stat-icon total"><FiUsers size={20} /></div>
                    <div className="nd-stat-body">
                        <span className="nd-stat-num">{admissions.length}</span>
                        <span className="nd-stat-label">Total Inpatients</span>
                    </div>
                </div>

                <div className={`nd-stat-card ${workloadFilter === 'MY_PATIENTS' ? 'active' : ''}`} onClick={() => setWorkloadFilter('MY_PATIENTS')}>
                    <div className="nd-stat-icon my"><FiUserCheck size={20} /></div>
                    <div className="nd-stat-body">
                        <span className="nd-stat-num">{myPatientsCount}</span>
                        <span className="nd-stat-label">Assigned to Me</span>
                    </div>
                </div>

                <div className={`nd-stat-card ${workloadFilter === 'CRITICAL_VITALS' ? 'active' : ''}`} onClick={() => setWorkloadFilter('CRITICAL_VITALS')}>
                    <div className="nd-stat-icon vitals"><FiActivity size={20} /></div>
                    <div className="nd-stat-body">
                        <span className="nd-stat-num">{criticalVitalsCount}</span>
                        <span className="nd-stat-label">Critical Vitals</span>
                    </div>
                </div>

                <div className="nd-stat-card">
                    <div className="nd-stat-icon meds"><FiDroplet size={20} /></div>
                    <div className="nd-stat-body">
                        <span className="nd-stat-num">{operationsMetrics?.medsDueCount || 0}</span>
                        <span className="nd-stat-label">Meds Due</span>
                    </div>
                </div>

                <div className="nd-stat-card">
                    <div className="nd-stat-icon tasks"><FiCheckSquare size={20} /></div>
                    <div className="nd-stat-body">
                        <span className="nd-stat-num">{operationsMetrics?.overdueTasksCount || 0}</span>
                        <span className="nd-stat-label">Overdue Tasks</span>
                    </div>
                </div>

                <div className={`nd-stat-card ${workloadFilter === 'DISCHARGE_PENDING' ? 'active' : ''}`} onClick={() => setWorkloadFilter('DISCHARGE_PENDING')}>
                    <div className="nd-stat-icon discharge"><FiLogOut size={20} /></div>
                    <div className="nd-stat-body">
                        <span className="nd-stat-num">{operationsMetrics?.dischargePendingCount || 0}</span>
                        <span className="nd-stat-label">Discharge Pending</span>
                    </div>
                </div>
            </div>

            {/* ── Filters & Search Toolbar ── */}
            <div className="nd-toolbar">
                <div className="nd-search-box">
                    <FiSearch size={16} className="nd-search-icon" />
                    <input
                        type="text"
                        placeholder="Search patient, UHID, MRN, ward, bed, doctor..."
                        value={searchText}
                        onChange={e => setSearchText(e.target.value)}
                    />
                </div>

                <div className="nd-ward-tabs">
                    {wards.map(w => (
                        <button
                            key={w}
                            className={`nd-ward-tab ${activeWard === w ? 'active' : ''}`}
                            onClick={() => setActiveWard(w)}
                        >
                            {w}
                            {w !== 'All' && (
                                <span className="nd-ward-count">
                                    {admissions.filter(a => a.ward === w).length}
                                </span>
                            )}
                        </button>
                    ))}
                </div>
            </div>

            {/* ── Patient Cards Grid ── */}
            {loading && admissions.length === 0 ? (
                <div className="nd-loading">
                    <div className="nd-spinner" /> Loading active inpatients...
                </div>
            ) : filteredAdmissions.length === 0 ? (
                <div className="nd-empty">
                    <div className="nd-empty-icon">🏥</div>
                    <h3>No admitted patients matching criteria</h3>
                    <p>{searchText || activeWard !== 'All' || workloadFilter !== 'ALL' ? 'Try adjusting your search query or filters.' : 'All beds are currently available.'}</p>
                </div>
            ) : (
                <div className="nd-grid">
                    {filteredAdmissions.map(adm => {
                        const patient = adm.patientId || {};
                        const patientName = typeof patient === 'object' ? (patient.name || 'Unknown Patient') : 'Unknown';
                        const patientUid = typeof patient === 'object' ? (patient.patientId || patient.mrn || '') : '';
                        const doctor = adm.doctorId || {};
                        const doctorName = typeof doctor === 'object' ? (doctor.name || 'Not Assigned') : 'Not Assigned';
                        const vitals = vitalsMap[adm._id];
                        const vitalStatus = getVitalStatus(vitals);
                        const alerts = alertsMap[adm._id] || [];
                        const days = daysSince(adm.admissionDate);
                        const wardClass = getWardClass(adm.ward);

                        // Active Assigned Nurse
                        const activeAssignments = (adm.assignedNurses || []).filter(n => n.status === 'ACTIVE');
                        const assignedNurseNames = activeAssignments.map(a => {
                            if (typeof a.nurseId === 'object' && a.nurseId?.name) return a.nurseId.name;
                            const found = hospitalNurses.find(hn => String(hn._id) === String(a.nurseId));
                            return found ? found.name : 'Nurse';
                        });

                        const isDischargeOrdered = !!adm.dischargeReadiness?.doctorDischargeOrdered;
                        const isNursingCleared = !!adm.dischargeReadiness?.nursingClearance;

                        return (
                            <div className="nd-card" key={adm._id}>
                                <div className="nd-card-head">
                                    <div className="nd-patient-avatar">{getInitials(patientName)}</div>
                                    <div className="nd-patient-title">
                                        <h3 onClick={() => navigate(`/nurse/patient/${adm._id}`)}>{patientName}</h3>
                                        <div className="nd-patient-sub">
                                            {patientUid && <span>{patientUid}</span>}
                                            {patient.gender && <span>• {patient.gender}</span>}
                                            {patient.age && <span>• {patient.age} yrs</span>}
                                        </div>
                                    </div>
                                    <div className="nd-head-badges">
                                        <span className={`nd-ward-badge ${wardClass}`}>{adm.ward || 'Ward'}</span>
                                        <span className="nd-bed-badge">🛏️ {adm.bedNumber || '—'}</span>
                                    </div>
                                </div>

                                <div className="nd-card-body">
                                    <div className="nd-info-row">
                                        <span className="nd-lbl">Attending:</span>
                                        <span className="nd-val">Dr. {doctorName}</span>
                                    </div>
                                    <div className="nd-info-row">
                                        <span className="nd-lbl">Admitted:</span>
                                        <span className="nd-val">
                                            {adm.admissionDate ? new Date(adm.admissionDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—'}
                                            <span className="nd-days-badge">({days}d)</span>
                                        </span>
                                    </div>

                                    {/* Assigned Nurse Banner */}
                                    <div className="nd-nurse-row">
                                        <span className="nd-lbl">Care Nurse:</span>
                                        {assignedNurseNames.length > 0 ? (
                                            <span className="nd-nurse-name">
                                                <FiUserCheck size={12} /> {assignedNurseNames.join(', ')}
                                            </span>
                                        ) : (
                                            <button className="nd-assign-btn" onClick={() => setAssignModal({ open: true, admission: adm, nurseId: '', shift: 'Morning', notes: '' })}>
                                                + Assign Nurse
                                            </button>
                                        )}
                                    </div>

                                    {/* Live Vitals Badges */}
                                    {vitalStatus && (
                                        <div className="nd-vitals-row">
                                            {vitalStatus.map((v, i) => (
                                                <span key={i} className={`nd-vital-pill ${v.status}`}>{v.label}</span>
                                            ))}
                                        </div>
                                    )}

                                    {/* Alerts / Discharge Status Badges */}
                                    {(alerts.length > 0 || isDischargeOrdered) && (
                                        <div className="nd-alerts-row">
                                            {isDischargeOrdered && (
                                                <span className={`nd-alert-pill discharge ${isNursingCleared ? 'ready' : 'ordered'}`}>
                                                    {isNursingCleared ? '✓ Ready for Discharge' : '⚠️ Discharge Ordered'}
                                                </span>
                                            )}
                                            {alerts.slice(0, 2).map((alt, idx) => (
                                                <span key={idx} className={`nd-alert-pill ${alt.severity.toLowerCase()}`}>
                                                    {alt.title}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                <div className="nd-card-foot">
                                    <button className="nd-assign-link" onClick={() => setAssignModal({ open: true, admission: adm, nurseId: '', shift: 'Morning', notes: '' })}>
                                        <FiUserCheck size={13} /> {assignedNurseNames.length > 0 ? 'Change Nurse' : 'Assign'}
                                    </button>
                                    <button className="nd-action-btn" onClick={() => navigate(`/nurse/patient/${adm._id}`)}>
                                        Open Workspace <FiChevronRight size={14} />
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* ── Quick Assign Nurse Modal ── */}
            {assignModal.open && (
                <div className="nd-modal-overlay" onClick={() => setAssignModal({ open: false, admission: null, nurseId: '', shift: 'Morning', notes: '' })}>
                    <div className="nd-modal" onClick={e => e.stopPropagation()}>
                        <div className="nd-modal-header">
                            <h3>Assign Primary Care Nurse</h3>
                        </div>
                        <form onSubmit={handleAssignSubmit}>
                            <div className="nd-modal-body">
                                <div className="nd-form-group">
                                    <label>Patient</label>
                                    <div style={{ fontWeight: 600, color: '#0f172a', padding: '4px 0' }}>
                                        {typeof assignModal.admission?.patientId === 'object' ? assignModal.admission.patientId?.name : 'Patient'}
                                        <span style={{ fontSize: '0.8rem', color: '#64748b', marginLeft: '8px' }}>
                                            ({assignModal.admission?.ward} • Bed {assignModal.admission?.bedNumber})
                                        </span>
                                    </div>
                                </div>
                                <div className="nd-form-group" style={{ marginTop: '12px' }}>
                                    <label>Select Nurse *</label>
                                    <select
                                        value={assignModal.nurseId}
                                        onChange={e => setAssignModal(p => ({ ...p, nurseId: e.target.value }))}
                                        required
                                    >
                                        <option value="">-- Choose Nurse --</option>
                                        {hospitalNurses.map(n => (
                                            <option key={n._id} value={n._id}>
                                                {n.name} ({n.specialization || n.role || 'Staff Nurse'})
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="nd-form-group" style={{ marginTop: '12px' }}>
                                    <label>Assigned Shift</label>
                                    <select
                                        value={assignModal.shift}
                                        onChange={e => setAssignModal(p => ({ ...p, shift: e.target.value }))}
                                    >
                                        <option value="Morning">Morning Shift</option>
                                        <option value="Evening">Evening Shift</option>
                                        <option value="Night">Night Shift</option>
                                        <option value="All">All Shifts / Primary Incharge</option>
                                    </select>
                                </div>
                                <div className="nd-form-group" style={{ marginTop: '12px' }}>
                                    <label>Assignment Notes</label>
                                    <textarea
                                        placeholder="Special instructions for the assigned nurse..."
                                        value={assignModal.notes}
                                        onChange={e => setAssignModal(p => ({ ...p, notes: e.target.value }))}
                                        rows={2}
                                    />
                                </div>
                            </div>
                            <div className="nd-modal-footer">
                                <button type="button" className="nd-btn secondary" onClick={() => setAssignModal({ open: false, admission: null, nurseId: '', shift: 'Morning', notes: '' })}>
                                    Cancel
                                </button>
                                <button type="submit" className="nd-btn primary" disabled={submittingAssign || !assignModal.nurseId}>
                                    {submittingAssign ? 'Assigning...' : 'Confirm Assignment'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ── Toast Feedback ── */}
            {toast && <div className={`nd-toast ${toast.type}`}>{toast.message}</div>}
        </div>
    );
};

export default NurseDashboard;
