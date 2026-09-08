import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ipdCommandCenterAPI, ipdClinicalAPI, ipdNursingAPI } from '../../utils/api';
import socket from '../../utils/socket';
import {
    FiActivity,
    FiAlertCircle,
    FiAlertTriangle,
    FiArrowRight,
    FiCheckCircle,
    FiClock,
    FiDatabase,
    FiDollarSign,
    FiEye,
    FiFileText,
    FiFilter,
    FiHeart,
    FiHelpCircle,
    FiLayers,
    FiLock,
    FiLogOut,
    FiPieChart,
    FiRefreshCw,
    FiSearch,
    FiShield,
    FiTrendingUp,
    FiUser,
    FiUserCheck,
    FiUsers,
    FiX
} from 'react-icons/fi';
import './IPDCommandCenter.css';

const STAGE_CONFIG = {
    ADMITTED: { label: 'Admitted (<24h)', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.1)', border: '#93c5fd' },
    ACTIVE_CARE: { label: 'Active Care', color: '#0ea5e9', bg: 'rgba(14, 165, 233, 0.1)', border: '#7dd3fc' },
    INVESTIGATION: { label: 'Investigation', color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.1)', border: '#c4b5fd' },
    PROCEDURE_OT: { label: 'OT / Procedure', color: '#ec4899', bg: 'rgba(236, 72, 153, 0.1)', border: '#f9a8d4' },
    POST_OP: { label: 'Post-Op Recovery', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.1)', border: '#fcd34d' },
    DISCHARGE_PLANNED: { label: 'Discharge Planned', color: '#10b981', bg: 'rgba(16, 185, 129, 0.1)', border: '#6ee7b7' },
    DISCHARGE_CLEARANCE: { label: 'Safety Clearance', color: '#059669', bg: 'rgba(5, 150, 105, 0.1)', border: '#34d399' },
    DISCHARGED: { label: 'Discharged (24h)', color: '#64748b', bg: 'rgba(100, 116, 139, 0.1)', border: '#cbd5e1' }
};

export default function IPDCommandCenter() {
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState('board'); // 'board', 'wards', 'analytics', 'reconcile'
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [lastRefreshed, setLastRefreshed] = useState(new Date());

    // Overview & Flow Board Data
    const [census, setCensus] = useState(null);
    const [workload, setWorkload] = useState(null);
    const [wardBreakdown, setWardBreakdown] = useState([]);
    const [flowBoard, setFlowBoard] = useState({});
    const [flowCards, setFlowCards] = useState([]);

    // Filters & Search
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedWard, setSelectedWard] = useState('ALL');
    const [selectedStage, setSelectedStage] = useState('ALL');

    // Blocker Drawer Modal
    const [blockerModalOpen, setBlockerModalOpen] = useState(false);
    const [selectedAdmissionId, setSelectedAdmissionId] = useState(null);
    const [blockerData, setBlockerData] = useState(null);
    const [loadingBlockers, setLoadingBlockers] = useState(false);

    // Analytics Data
    const [trendsData, setTrendsData] = useState(null);
    const [nurseWorkloadData, setNurseWorkloadData] = useState([]);
    const [trendsDays, setTrendsDays] = useState(14);

    // Bed Reconciliation State
    const [reconcileResult, setReconcileResult] = useState(null);
    const [reconciling, setReconciling] = useState(false);

    // ── Fetch Main Data ──
    const fetchCommandCenterData = useCallback(async (isSilent = false) => {
        if (!isSilent) setRefreshing(true);
        try {
            const [overviewRes, boardRes] = await Promise.all([
                ipdCommandCenterAPI.getOverview().catch(err => {
                    console.error('Overview error:', err);
                    return { success: false };
                }),
                ipdCommandCenterAPI.getFlowBoard({
                    ward: selectedWard,
                    search: searchQuery,
                    stageFilter: selectedStage
                }).catch(err => {
                    console.error('Flow board error:', err);
                    return { success: false };
                })
            ]);

            if (overviewRes?.success) {
                setCensus(overviewRes.census);
                setWorkload(overviewRes.clinicalWorkload);
                setWardBreakdown(overviewRes.wardBreakdown || []);
            }

            if (boardRes?.success) {
                setFlowBoard(boardRes.board || {});
                setFlowCards(boardRes.cards || []);
            }

            setLastRefreshed(new Date());
        } catch (error) {
            console.error('Failed to load IPD Command Center data:', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [selectedWard, searchQuery, selectedStage]);

    // ── Fetch Analytics Data ──
    const fetchAnalyticsData = useCallback(async () => {
        try {
            const [trendsRes, nursesRes] = await Promise.all([
                ipdCommandCenterAPI.getCensusTrends({ days: trendsDays }),
                ipdCommandCenterAPI.getNurseWorkload()
            ]);
            if (trendsRes?.success) setTrendsData(trendsRes);
            if (nursesRes?.success) setNurseWorkloadData(nursesRes.workload || []);
        } catch (error) {
            console.error('Failed to load analytics:', error);
        }
    }, [trendsDays]);

    useEffect(() => {
        fetchCommandCenterData();
    }, [fetchCommandCenterData]);

    useEffect(() => {
        if (activeTab === 'analytics') {
            fetchAnalyticsData();
        }
    }, [activeTab, fetchAnalyticsData]);

    // ── Socket.IO Realtime Listeners ──
    useEffect(() => {
        if (!socket) return;

        const handleRealtimeEvent = () => {
            fetchCommandCenterData(true);
        };

        const events = [
            'patient_admitted',
            'patient_discharged',
            'bed_status_updated',
            'vitals_recorded',
            'mar_administered',
            'doctor_order_created',
            'doctor_order_acknowledged',
            'order_clarification_requested',
            'order_clarification_resolved',
            'discharge_readiness_changed',
            'discharge_summary_updated',
            'nurse_handover_recorded',
            'nursing_clearance_signed'
        ];

        events.forEach(evt => socket.on(evt, handleRealtimeEvent));

        return () => {
            events.forEach(evt => socket.off(evt, handleRealtimeEvent));
        };
    }, [fetchCommandCenterData]);

    // ── Inspect Discharge Blockers ──
    const handleOpenBlockerModal = async (admissionId) => {
        setSelectedAdmissionId(admissionId);
        setBlockerModalOpen(true);
        setLoadingBlockers(true);
        try {
            const res = await ipdCommandCenterAPI.getDischargeBlockers(admissionId);
            if (res?.success) {
                setBlockerData(res);
            }
        } catch (error) {
            console.error('Failed to inspect blockers:', error);
        } finally {
            setLoadingBlockers(false);
        }
    };

    // ── Bed Reconciliation Execution ──
    const handleRunReconciliation = async () => {
        setReconciling(true);
        try {
            const res = await ipdCommandCenterAPI.reconcileBeds();
            setReconcileResult(res);
            fetchCommandCenterData(true);
        } catch (error) {
            console.error('Reconciliation failed:', error);
            setReconcileResult({
                success: false,
                message: error.response?.data?.message || 'Reconciliation failed'
            });
        } finally {
            setReconciling(false);
        }
    };

    // List of unique wards for dropdown
    const availableWards = useMemo(() => {
        const wards = new Set(wardBreakdown.map(w => w.wardName).filter(Boolean));
        return ['ALL', ...Array.from(wards)];
    }, [wardBreakdown]);

    return (
        <div className="ipd-command-center">
            {/* ── Top Command Bar ── */}
            <header className="cc-header">
                <div className="cc-header-left">
                    <div className="cc-title-stack">
                        <div className="cc-badge-live">
                            <span className="pulse-dot"></span>
                            <span>LIVE COMMAND CENTER</span>
                        </div>
                        <h1 className="cc-main-title">IPD Clinical Operations & Census</h1>
                    </div>
                    <p className="cc-sub-title">
                        Real-time patient progression, bed occupancy, doctor-nurse coordination & discharge blocker intelligence
                    </p>
                </div>

                <div className="cc-header-right">
                    <div className="cc-sync-info">
                        <FiClock className="cc-icon-dim" />
                        <span>Updated: {lastRefreshed.toLocaleTimeString()}</span>
                    </div>
                    <button
                        className={`cc-btn-refresh ${refreshing ? 'spinning' : ''}`}
                        onClick={() => fetchCommandCenterData(false)}
                        title="Refresh live data"
                    >
                        <FiRefreshCw />
                        <span>Refresh</span>
                    </button>
                    <button
                        className="cc-btn-workspace-shortcut"
                        onClick={() => navigate('/nurse/dashboard')}
                    >
                        <FiUserCheck />
                        <span>Nurse Station</span>
                    </button>
                </div>
            </header>

            {/* ── KPI Census Deck ── */}
            <section className="cc-kpi-deck">
                <div className="cc-kpi-card bed-card">
                    <div className="kpi-icon-wrap blue">
                        <FiPieChart />
                    </div>
                    <div className="kpi-content">
                        <span className="kpi-label">BED OCCUPANCY</span>
                        <div className="kpi-val-group">
                            <span className="kpi-main-val">{census?.occupancyRate || '0%'}</span>
                            <span className="kpi-sub-val">({census?.occupiedBeds || 0} / {census?.totalBeds || 0} Beds)</span>
                        </div>
                        <div className="kpi-bar-track">
                            <div
                                className="kpi-bar-fill"
                                style={{ width: `${Math.min(100, census?.occupancyRateValue || 0)}%` }}
                            ></div>
                        </div>
                    </div>
                </div>

                <div className="cc-kpi-card inpatients-card">
                    <div className="kpi-icon-wrap cyan">
                        <FiUsers />
                    </div>
                    <div className="kpi-content">
                        <span className="kpi-label">ACTIVE INPATIENTS</span>
                        <div className="kpi-val-group">
                            <span className="kpi-main-val">{census?.activeInpatients || 0}</span>
                            <span className="kpi-sub-val text-green">+{census?.admittedToday || 0} Today</span>
                        </div>
                        <span className="kpi-hint">
                            {census?.unassignedPatients ? `⚠️ ${census.unassignedPatients} unassigned` : 'All patients assigned to nurses'}
                        </span>
                    </div>
                </div>

                <div className="cc-kpi-card discharge-card">
                    <div className="kpi-icon-wrap green">
                        <FiLogOut />
                    </div>
                    <div className="kpi-content">
                        <span className="kpi-label">DISCHARGE PIPELINE</span>
                        <div className="kpi-val-group">
                            <span className="kpi-main-val">{census?.dischargesPlanned || 0}</span>
                            <span className="kpi-sub-val">Planned</span>
                        </div>
                        <span className="kpi-hint">
                            {census?.dischargesToday || 0} completed discharges today
                        </span>
                    </div>
                </div>

                <div className="cc-kpi-card stay-card">
                    <div className="kpi-icon-wrap amber">
                        <FiClock />
                    </div>
                    <div className="kpi-content">
                        <span className="kpi-label">LONG-STAY PATIENTS</span>
                        <div className="kpi-val-group">
                            <span className="kpi-main-val">{census?.longStayCount || 0}</span>
                            <span className="kpi-sub-val">Stay &gt; 7 Days</span>
                        </div>
                        <span className="kpi-hint">Clinical course review suggested</span>
                    </div>
                </div>

                <div className="cc-kpi-card workload-card">
                    <div className="kpi-icon-wrap purple">
                        <FiActivity />
                    </div>
                    <div className="kpi-content">
                        <span className="kpi-label">CLINICAL WORKLOAD</span>
                        <div className="kpi-val-group">
                            <span className="kpi-main-val">{(workload?.pendingMedications || 0) + (workload?.pendingTasks || 0)}</span>
                            <span className="kpi-sub-val">Pending Actions</span>
                        </div>
                        <span className="kpi-hint">
                            {workload?.overdueMedications ? `🚨 ${workload.overdueMedications} overdue doses` : 'MAR on schedule'}
                        </span>
                    </div>
                </div>

                <div className="cc-kpi-card clarification-card">
                    <div className="kpi-icon-wrap rose">
                        <FiHelpCircle />
                    </div>
                    <div className="kpi-content">
                        <span className="kpi-label">CLARIFICATIONS</span>
                        <div className="kpi-val-group">
                            <span className="kpi-main-val">{workload?.openClarifications || 0}</span>
                            <span className="kpi-sub-val">Open Doctor Questions</span>
                        </div>
                        <span className="kpi-hint">Doctor ↔ Nurse active threads</span>
                    </div>
                </div>
            </section>

            {/* ── Navigation Tabs ── */}
            <div className="cc-tabs-bar">
                <div className="cc-tabs-left">
                    <button
                        className={`cc-tab-btn ${activeTab === 'board' ? 'active' : ''}`}
                        onClick={() => setActiveTab('board')}
                    >
                        <FiLayers />
                        <span>Patient Flow Board</span>
                        <span className="tab-pill-count">{flowCards.length}</span>
                    </button>
                    <button
                        className={`cc-tab-btn ${activeTab === 'wards' ? 'active' : ''}`}
                        onClick={() => setActiveTab('wards')}
                    >
                        <FiPieChart />
                        <span>Ward Breakdown</span>
                        <span className="tab-pill-count">{wardBreakdown.length}</span>
                    </button>
                    <button
                        className={`cc-tab-btn ${activeTab === 'analytics' ? 'active' : ''}`}
                        onClick={() => setActiveTab('analytics')}
                    >
                        <FiTrendingUp />
                        <span>Census & ALOS Analytics</span>
                    </button>
                    <button
                        className={`cc-tab-btn ${activeTab === 'reconcile' ? 'active' : ''}`}
                        onClick={() => setActiveTab('reconcile')}
                    >
                        <FiDatabase />
                        <span>Bed Concurrency Tool</span>
                    </button>
                </div>

                {activeTab === 'board' && (
                    <div className="cc-filters-right">
                        <div className="cc-search-wrap">
                            <FiSearch className="search-icon" />
                            <input
                                type="text"
                                placeholder="Search patient, MRN, Bed..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                            {searchQuery && (
                                <button className="clear-search-btn" onClick={() => setSearchQuery('')}>
                                    <FiX />
                                </button>
                            )}
                        </div>

                        <div className="cc-select-wrap">
                            <FiFilter className="filter-icon" />
                            <select
                                value={selectedWard}
                                onChange={(e) => setSelectedWard(e.target.value)}
                            >
                                {availableWards.map(w => (
                                    <option key={w} value={w}>
                                        {w === 'ALL' ? 'All Wards' : `Ward: ${w}`}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                )}
            </div>

            {/* ── MAIN CONTENT AREA ── */}
            <main className="cc-main-content">
                {/* ── TAB 1: PATIENT FLOW BOARD (8 STAGES) ── */}
                {activeTab === 'board' && (
                    <div className="cc-flow-board-wrapper">
                        {/* Stage Filter Pills */}
                        <div className="stage-filter-pills">
                            <button
                                className={`stage-pill ${selectedStage === 'ALL' ? 'active' : ''}`}
                                onClick={() => setSelectedStage('ALL')}
                            >
                                All Stages ({flowCards.length})
                            </button>
                            {Object.entries(STAGE_CONFIG).map(([stageKey, cfg]) => {
                                const count = flowBoard[stageKey]?.length || 0;
                                return (
                                    <button
                                        key={stageKey}
                                        className={`stage-pill ${selectedStage === stageKey ? 'active' : ''}`}
                                        style={{
                                            '--stage-color': cfg.color,
                                            '--stage-bg': cfg.bg,
                                            '--stage-border': cfg.border
                                        }}
                                        onClick={() => setSelectedStage(stageKey)}
                                    >
                                        <span className="stage-dot" style={{ backgroundColor: cfg.color }}></span>
                                        <span>{cfg.label}</span>
                                        <span className="stage-count">{count}</span>
                                    </button>
                                );
                            })}
                        </div>

                        {/* Kanban Columns */}
                        <div className="flow-columns-container">
                            {Object.entries(STAGE_CONFIG).map(([stageKey, cfg]) => {
                                const patients = flowBoard[stageKey] || [];
                                if (selectedStage !== 'ALL' && selectedStage !== stageKey) return null;

                                return (
                                    <div key={stageKey} className="flow-column">
                                        <div
                                            className="flow-column-header"
                                            style={{ borderTopColor: cfg.color }}
                                        >
                                            <div className="col-title-left">
                                                <span className="col-dot" style={{ backgroundColor: cfg.color }}></span>
                                                <h3 className="col-title">{cfg.label}</h3>
                                            </div>
                                            <span className="col-counter" style={{ color: cfg.color, backgroundColor: cfg.bg }}>
                                                {patients.length}
                                            </span>
                                        </div>

                                        <div className="flow-cards-list">
                                            {patients.length === 0 ? (
                                                <div className="empty-stage-box">
                                                    <span>No patients in this stage</span>
                                                </div>
                                            ) : (
                                                patients.map(card => {
                                                    const wl = card.workloadSummary || {};
                                                    const vitals = card.latestVitals;

                                                    return (
                                                        <div key={card.admissionId} className="flow-patient-card">
                                                            <div className="patient-card-top">
                                                                <div className="pcard-avatar">
                                                                    {card.patient.name ? card.patient.name.slice(0, 2).toUpperCase() : 'PT'}
                                                                </div>
                                                                <div className="pcard-info">
                                                                    <div className="pcard-name-row">
                                                                        <h4 className="pcard-name">{card.patient.name}</h4>
                                                                        <span className="pcard-los-pill">{card.losDays}d Stay</span>
                                                                    </div>
                                                                    <div className="pcard-meta">
                                                                        <span>{card.patient.age || '—'}y / {card.patient.gender || '—'}</span>
                                                                        <span className="dot-sep">•</span>
                                                                        <span>MRN: {card.patient.mrn}</span>
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            {/* Location & Doctor */}
                                                            <div className="pcard-location-row">
                                                                <span className="loc-badge ward-badge">
                                                                    Ward: {card.location.ward}
                                                                </span>
                                                                <span className="loc-badge bed-badge">
                                                                    Bed {card.location.bedNumber} ({card.location.bedType})
                                                                </span>
                                                            </div>

                                                            <div className="pcard-doctor-row">
                                                                <FiUser className="doc-icon" />
                                                                <span className="doc-name">Dr. {card.doctor.name}</span>
                                                            </div>

                                                            {/* Latest Vitals Snapshot */}
                                                            {vitals && (
                                                                <div className={`pcard-vitals-strip ${wl.hasCriticalVitals ? 'critical-vitals' : ''}`}>
                                                                    <div className="vital-item">
                                                                        <span className="v-lbl">BP</span>
                                                                        <span className="v-val">{vitals.bloodPressure || '—'}</span>
                                                                    </div>
                                                                    <div className="vital-item">
                                                                        <span className="v-lbl">HR</span>
                                                                        <span className="v-val">{vitals.pulseRate ? `${vitals.pulseRate} bpm` : '—'}</span>
                                                                    </div>
                                                                    <div className="vital-item">
                                                                        <span className="v-lbl">SpO2</span>
                                                                        <span className="v-val">{vitals.spo2 ? `${vitals.spo2}%` : '—'}</span>
                                                                    </div>
                                                                    <div className="vital-item">
                                                                        <span className="v-lbl">Temp</span>
                                                                        <span className="v-val">{vitals.temperature ? `${vitals.temperature}°F` : '—'}</span>
                                                                    </div>
                                                                </div>
                                                            )}

                                                            {/* Alert Flags Strip */}
                                                            <div className="pcard-flags-strip">
                                                                {wl.urgentTasksCount > 0 && (
                                                                    <span className="flag-tag urgent-task">
                                                                        <FiAlertTriangle /> {wl.urgentTasksCount} Urgent Task
                                                                    </span>
                                                                )}
                                                                {wl.overdueDosesCount > 0 && (
                                                                    <span className="flag-tag overdue-dose">
                                                                        <FiClock /> {wl.overdueDosesCount} Overdue Dose
                                                                    </span>
                                                                )}
                                                                {wl.openClarificationsCount > 0 && (
                                                                    <span className="flag-tag open-clar">
                                                                        <FiHelpCircle /> {wl.openClarificationsCount} Clarification
                                                                    </span>
                                                                )}
                                                                {card.hasDischargeSummary && (
                                                                    <span className={`flag-tag summary-tag ${card.dischargeSummaryStatus === 'FINALIZED' ? 'signed' : 'draft'}`}>
                                                                        <FiFileText /> Summary: {card.dischargeSummaryStatus}
                                                                    </span>
                                                                )}
                                                            </div>

                                                            {/* Assigned Nurses */}
                                                            {card.assignedNurses?.length > 0 ? (
                                                                <div className="pcard-nurses-row">
                                                                    <FiUserCheck className="nurse-icon" />
                                                                    <span className="nurse-names">
                                                                        Nurse: {card.assignedNurses.map(n => n.name).join(', ')}
                                                                    </span>
                                                                </div>
                                                            ) : (
                                                                <div className="pcard-nurses-row unassigned">
                                                                    <FiAlertCircle className="nurse-icon text-amber" />
                                                                    <span>No Nurse Assigned</span>
                                                                </div>
                                                            )}

                                                            {/* Card Actions Footer */}
                                                            <div className="pcard-actions">
                                                                <button
                                                                    className="pcard-btn-blockers"
                                                                    onClick={() => handleOpenBlockerModal(card.admissionId)}
                                                                    title="Check Discharge Blockers & Readiness"
                                                                >
                                                                    <FiShield />
                                                                    <span>Blockers</span>
                                                                </button>
                                                                <button
                                                                    className="pcard-btn-workspace"
                                                                    onClick={() => navigate(`/nurse/patient/${card.admissionId}`)}
                                                                >
                                                                    <span>Workspace</span>
                                                                    <FiArrowRight />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    );
                                                })
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* ── TAB 2: WARD BREAKDOWN ── */}
                {activeTab === 'wards' && (
                    <div className="cc-ward-breakdown-grid">
                        {wardBreakdown.map((w, idx) => (
                            <div key={idx} className="ward-card">
                                <div className="ward-card-header">
                                    <h3 className="ward-name">{w.wardName}</h3>
                                    <span className="ward-occupancy-pill">
                                        {w.occupancyRate}% Occupied
                                    </span>
                                </div>

                                <div className="ward-metrics-row">
                                    <div className="w-stat">
                                        <span className="w-stat-num">{w.totalBeds}</span>
                                        <span className="w-stat-lbl">Total Beds</span>
                                    </div>
                                    <div className="w-stat text-cyan">
                                        <span className="w-stat-num">{w.occupiedBeds}</span>
                                        <span className="w-stat-lbl">Occupied</span>
                                    </div>
                                    <div className="w-stat text-green">
                                        <span className="w-stat-num">{w.availableBeds}</span>
                                        <span className="w-stat-lbl">Available</span>
                                    </div>
                                    <div className="w-stat text-amber">
                                        <span className="w-stat-num">{w.maintenanceBeds}</span>
                                        <span className="w-stat-lbl">Maint.</span>
                                    </div>
                                </div>

                                <div className="ward-progress-bar">
                                    <div
                                        className="ward-progress-fill"
                                        style={{ width: `${Math.min(100, parseFloat(w.occupancyRate) || 0)}%` }}
                                    ></div>
                                </div>

                                <div className="ward-active-patients-preview">
                                    <h4>Active Inpatients ({w.activePatientsCount})</h4>
                                    <div className="ward-pt-list">
                                        {w.activePatients?.length === 0 ? (
                                            <p className="no-pt-text">No patients currently in this ward</p>
                                        ) : (
                                            w.activePatients.map((pt, pidx) => (
                                                <div
                                                    key={pidx}
                                                    className="ward-pt-item"
                                                    onClick={() => navigate(`/nurse/patient/${pt.admissionId}`)}
                                                >
                                                    <span className="wpt-bed">Bed {pt.bedNumber}</span>
                                                    <span className="wpt-name">{pt.patientName}</span>
                                                    <span className="wpt-doc">Dr. {pt.doctorName || 'Attending'}</span>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* ── TAB 3: CENSUS & ALOS ANALYTICS ── */}
                {activeTab === 'analytics' && (
                    <div className="cc-analytics-container">
                        <div className="analytics-top-deck">
                            <div className="analytics-summary-card">
                                <h3>Average Length of Stay (ALOS)</h3>
                                <div className="alos-metric">
                                    <span className="alos-number">{trendsData?.alosDays || '0.0'}</span>
                                    <span className="alos-unit">Days</span>
                                </div>
                                <p className="alos-sub">
                                    Calculated across {trendsData?.totalDischargesInPeriod || 0} discharges in the past {trendsDays} days.
                                </p>
                            </div>

                            <div className="analytics-summary-card">
                                <h3>Admission / Discharge Balance</h3>
                                <div className="balance-row">
                                    <div className="bal-box admissions">
                                        <span className="b-num">+{trendsData?.totalAdmissionsInPeriod || 0}</span>
                                        <span className="b-lbl">Admissions</span>
                                    </div>
                                    <div className="bal-box discharges">
                                        <span className="b-num">-{trendsData?.totalDischargesInPeriod || 0}</span>
                                        <span className="b-lbl">Discharges</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Daily Timeline Table */}
                        <div className="analytics-table-card">
                            <div className="table-card-header">
                                <h3>Daily Census Timeline ({trendsDays} Days)</h3>
                                <select
                                    value={trendsDays}
                                    onChange={(e) => setTrendsDays(Number(e.target.value))}
                                    className="timeframe-select"
                                >
                                    <option value={7}>Past 7 Days</option>
                                    <option value={14}>Past 14 Days</option>
                                    <option value={30}>Past 30 Days</option>
                                </select>
                            </div>

                            <div className="trends-bar-chart">
                                {(trendsData?.dailyTrends || []).map((day, idx) => (
                                    <div key={idx} className="trend-day-col">
                                        <div className="bar-pair">
                                            <div
                                                className="bar-admissions"
                                                style={{ height: `${Math.min(120, (day.admissions || 0) * 20 + 4)}px` }}
                                                title={`${day.admissions} Admissions on ${day.fullDate}`}
                                            >
                                                {day.admissions > 0 && <span>{day.admissions}</span>}
                                            </div>
                                            <div
                                                className="bar-discharges"
                                                style={{ height: `${Math.min(120, (day.discharges || 0) * 20 + 4)}px` }}
                                                title={`${day.discharges} Discharges on ${day.fullDate}`}
                                            >
                                                {day.discharges > 0 && <span>{day.discharges}</span>}
                                            </div>
                                        </div>
                                        <span className="trend-date-lbl">{day.date}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Nurse Workload Distribution */}
                        <div className="analytics-table-card">
                            <div className="table-card-header">
                                <h3>Active Nurse Workload & Performance Today</h3>
                            </div>
                            <div className="workload-table-wrapper">
                                <table className="cc-data-table">
                                    <thead>
                                        <tr>
                                            <th>Nurse Name</th>
                                            <th>Active Assigned Patients</th>
                                            <th>Covered Wards</th>
                                            <th>Tasks Completed Today</th>
                                            <th>MAR Doses Administered Today</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {nurseWorkloadData.length === 0 ? (
                                            <tr>
                                                <td colSpan="5" className="empty-cell">No nurse assignments found</td>
                                            </tr>
                                        ) : (
                                            nurseWorkloadData.map((nw, idx) => (
                                                <tr key={idx}>
                                                    <td className="nurse-cell">
                                                        <FiUser className="mr-2" />
                                                        <strong>{nw.nurseName}</strong>
                                                    </td>
                                                    <td>
                                                        <span className="count-pill">{nw.activePatientsCount} Patients</span>
                                                    </td>
                                                    <td>{nw.assignedWards?.join(', ') || 'General'}</td>
                                                    <td>
                                                        <span className="task-pill">{nw.completedTasksToday} Completed</span>
                                                    </td>
                                                    <td>
                                                        <span className="mar-pill">{nw.administeredDosesToday} Doses</span>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}

                {/* ── TAB 4: BED CONCURRENCY & RECONCILIATION ── */}
                {activeTab === 'reconcile' && (
                    <div className="cc-reconcile-container">
                        <div className="reconcile-hero-box">
                            <div className="reconcile-hero-icon">
                                <FiDatabase />
                            </div>
                            <div className="reconcile-hero-content">
                                <h2>Bed Concurrency Guard & State Healer</h2>
                                <p>
                                    Validates active admissions against bed allocation tables, detects orphaned locks, resets ghost occupancy, and fixes desynchronized bed states.
                                </p>
                                <button
                                    className={`btn-run-reconcile ${reconciling ? 'running' : ''}`}
                                    onClick={handleRunReconciliation}
                                    disabled={reconciling}
                                >
                                    <FiRefreshCw className={reconciling ? 'spin' : ''} />
                                    <span>{reconciling ? 'Reconciling Beds...' : 'Run State Reconciliation'}</span>
                                </button>
                            </div>
                        </div>

                        {reconcileResult && (
                            <div className="reconcile-results-panel">
                                <h3>Reconciliation Report</h3>
                                <div className="reconcile-kpi-row">
                                    <div className="rkpi-box">
                                        <span className="rkpi-val">{reconcileResult.totalBedsChecked || 0}</span>
                                        <span className="rkpi-lbl">Beds Checked</span>
                                    </div>
                                    <div className="rkpi-box">
                                        <span className="rkpi-val">{reconcileResult.activeAdmissionsCount || 0}</span>
                                        <span className="rkpi-lbl">Active Inpatients</span>
                                    </div>
                                    <div className={`rkpi-box ${reconcileResult.anomaliesFixedCount > 0 ? 'highlight-green' : ''}`}>
                                        <span className="rkpi-val">{reconcileResult.anomaliesFixedCount || 0}</span>
                                        <span className="rkpi-lbl">Anomalies Repaired</span>
                                    </div>
                                </div>

                                {reconcileResult.anomaliesFixed?.length > 0 && (
                                    <div className="anomalies-list">
                                        <h4>Repaired Items:</h4>
                                        {reconcileResult.anomaliesFixed.map((ano, idx) => (
                                            <div key={idx} className="anomaly-item">
                                                <FiCheckCircle className="text-green mr-2" />
                                                <span className="ano-bed">Bed {ano.bedNumber} ({ano.ward})</span>
                                                <span className="ano-action">{ano.action}</span>
                                                <span className="ano-reason">{ano.reason}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </main>

            {/* ── DISCHARGE BLOCKER MODAL / INSPECTOR ── */}
            {blockerModalOpen && (
                <div className="cc-modal-overlay" onClick={() => setBlockerModalOpen(false)}>
                    <div className="cc-modal-card" onClick={(e) => e.stopPropagation()}>
                        <div className="cc-modal-header">
                            <div className="modal-title-left">
                                <FiShield className="modal-shield-icon" />
                                <div>
                                    <h3>Discharge Blocker Intelligence</h3>
                                    <p>Comprehensive Safety & Clinical Criteria Analysis</p>
                                </div>
                            </div>
                            <button className="modal-close-btn" onClick={() => setBlockerModalOpen(false)}>
                                <FiX />
                            </button>
                        </div>

                        <div className="cc-modal-body">
                            {loadingBlockers ? (
                                <div className="modal-loading-box">
                                    <FiRefreshCw className="spinning" />
                                    <span>Evaluating clinical criteria & safety checklists...</span>
                                </div>
                            ) : blockerData ? (
                                <>
                                    {/* Decision Banner */}
                                    <div className={`blocker-decision-banner ${blockerData.canDischarge ? 'can-discharge' : 'blocked'}`}>
                                        {blockerData.canDischarge ? (
                                            <>
                                                <FiCheckCircle className="banner-icon" />
                                                <div>
                                                    <h4>Safety Clear: Ready for Discharge</h4>
                                                    <p>All hard clinical, nursing, and line removal criteria have been satisfied.</p>
                                                </div>
                                            </>
                                        ) : (
                                            <>
                                                <FiAlertTriangle className="banner-icon" />
                                                <div>
                                                    <h4>Discharge Blocked: {blockerData.summary?.blockingCount || 0} Hard Blocker(s)</h4>
                                                    <p>Patient cannot be discharged until all safety requirements below are resolved.</p>
                                                </div>
                                            </>
                                        )}
                                    </div>

                                    {/* Blockers List */}
                                    <div className="blockers-list-section">
                                        <h4>Clinical Checklist Evaluation:</h4>
                                        <div className="blocker-items">
                                            {blockerData.blockers?.map((b, idx) => (
                                                <div key={idx} className={`blocker-row ${b.type.toLowerCase()}`}>
                                                    <div className="blocker-type-pill">{b.type}</div>
                                                    <div className="blocker-details">
                                                        <h5 className="blocker-title">{b.title}</h5>
                                                        <p className="blocker-msg">{b.message}</p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <p>Failed to load blocker data</p>
                            )}
                        </div>

                        <div className="cc-modal-footer">
                            <button
                                className="btn-close-modal"
                                onClick={() => setBlockerModalOpen(false)}
                            >
                                Close
                            </button>
                            {selectedAdmissionId && (
                                <button
                                    className="btn-goto-workspace"
                                    onClick={() => {
                                        setBlockerModalOpen(false);
                                        navigate(`/nurse/patient/${selectedAdmissionId}`);
                                    }}
                                >
                                    <span>Open Patient Workspace</span>
                                    <FiArrowRight />
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
