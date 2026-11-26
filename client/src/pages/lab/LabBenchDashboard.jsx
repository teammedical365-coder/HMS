import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { useAuth } from '../../store/hooks';
import { useBranding } from '../../context/BrandingContext';
import { labAPI } from '../../utils/api';
import { useLabAdminSummary } from '../../components/lab/LabAdminShell';
import {
    FiCpu, FiCalendar, FiRefreshCw, FiSearch, FiArrowRight,
    FiClock, FiSettings, FiCheckCircle, FiEdit3, FiX, FiAlertTriangle
} from 'react-icons/fi';
import './LabAdminDashboard.css';
import './LabBenchDashboard.css';

const ConicalFlaskIcon = ({ size = 17 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 3h6" />
        <path d="M10 3v5.4a2 2 0 0 1-.4 1.2L4.7 16.5A2.5 2.5 0 0 0 6.7 20.5h10.6a2.5 2.5 0 0 0 2-4L14.4 9.6a2 2 0 0 1-.4-1.2V3" />
        <path d="M7.5 15h9" />
    </svg>
);

const BarcodeMiniIcon = ({ size = 15 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round">
        <path d="M3 5v14M7 5v14M11 5v14M15 5v14M19 5v14M21 5v14" />
    </svg>
);

const getTimeGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
};

const formatBannerDate = (dateObj) => {
    try {
        const weekday = dateObj.toLocaleDateString('en-GB', { weekday: 'short' });
        const day = dateObj.toLocaleDateString('en-GB', { day: '2-digit' });
        const month = dateObj.toLocaleDateString('en-GB', { month: 'short' });
        const year = dateObj.getFullYear();
        return `${weekday}, ${day} ${month}, ${year}`;
    } catch (_) {
        return dateObj.toDateString();
    }
};

const resolveTubeCapPill = (containerType = '', specimenType = '') => {
    const raw = `${containerType} ${specimenType}`.toLowerCase();
    if (raw.includes('edta') || raw.includes('lavender') || raw.includes('purple')) {
        return { dot: '#9333ea', bg: '#faf5ff', border: '#e9d5ff', text: '#6b21a8', label: containerType || 'Lavender (EDTA)' };
    }
    if (raw.includes('citrate') || raw.includes('blue')) {
        return { dot: '#0284c7', bg: '#f0f9ff', border: '#bae6fd', text: '#0369a1', label: containerType || 'Blue (Citrate)' };
    }
    if (raw.includes('fluoride') || raw.includes('grey') || raw.includes('gray')) {
        return { dot: '#475569', bg: '#f8fafc', border: '#cbd5e1', text: '#334155', label: containerType || 'Grey (Fluoride)' };
    }
    if (raw.includes('heparin') || raw.includes('green')) {
        return { dot: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0', text: '#15803d', label: containerType || 'Green (Heparin)' };
    }
    if (raw.includes('sst') || raw.includes('gel') || raw.includes('plain') || raw.includes('red') || raw.includes('gold') || raw.includes('serum')) {
        return { dot: '#dc2626', bg: '#fef2f2', border: '#fecaca', text: '#b91c1c', label: containerType || 'Red / SST (Serum)' };
    }
    return { dot: '#0284c7', bg: '#eff6ff', border: '#dbeafe', text: '#1d4ed8', label: containerType || 'Sterile Container' };
};

const getBenchStageBadge = (status) => {
    if (status === 'RECEIVED_AT_PROCESSING_LAB') return { label: 'Received at Lab', cls: 'ltd-stage-received' };
    if (status === 'ACCEPTED' || status === 'PROCESSING_PENDING') return { label: 'Accepted', cls: 'ltd-stage-accepted' };
    if (status === 'PROCESSING') return { label: 'Processing', cls: 'ltd-stage-processing' };
    if (status === 'ON_HOLD') return { label: 'On Hold', cls: 'ltd-stage-hold' };
    if (status === 'PROCESSING_COMPLETED') return { label: 'Processing Completed', cls: 'ltd-stage-completed' };
    if (['DISPATCHED', 'IN_TRANSIT', 'ACCESSION_PENDING', 'COLLECTED'].includes(status)) {
        return { label: 'Awaiting Receipt', cls: 'ltd-stage-pending' };
    }
    if (['REJECTED', 'RECOLLECTION_REQUESTED', 'RECOLLECTION_PENDING'].includes(status)) {
        return { label: 'Rejected / Redraw', cls: 'ltd-stage-rejected' };
    }
    return { label: 'Pending', cls: 'ltd-stage-pending' };
};

/**
 * Valid Phase 6 stage transitions from the sample's current status.
 * Strictly prevents bypassing receipt, accession acceptance, or processing.
 */
const getValidStageOptions = (sample) => {
    const status = sample?.status;
    if (['COLLECTED', 'DISPATCHED', 'IN_TRANSIT', 'ACCESSION_PENDING'].includes(status)) {
        return [
            { value: 'RECEIVED_AT_PROCESSING_LAB', label: 'Received at Lab (Confirm Custody Receipt)' },
            { value: 'ACCEPTED', label: 'Accepted for Testing (Barcode & Quality Verified)' }
        ];
    }
    if (status === 'RECEIVED_AT_PROCESSING_LAB') {
        return [
            { value: 'ACCEPTED', label: 'Accepted for Testing (Quality Verified)' }
        ];
    }
    if (status === 'ACCEPTED' || status === 'PROCESSING_PENDING') {
        return [
            { value: 'PROCESSING', label: 'Loaded on Instrument (In Analyzer Run)' },
            { value: 'ON_HOLD', label: 'On Hold (Pre-Run Verification / Calibration)' }
        ];
    }
    if (status === 'PROCESSING') {
        return [
            { value: 'PROCESSING_COMPLETED', label: 'Processing Completed (Eligible for Result Entry)' },
            { value: 'ON_HOLD', label: 'On Hold (Repeat / Dilution / Maintenance)' }
        ];
    }
    if (status === 'ON_HOLD') {
        const opts = [
            { value: 'PROCESSING', label: 'Loaded on Instrument (Resume Analyzer Run)' }
        ];
        if (sample?.processing?.startedAt) {
            opts.push({ value: 'PROCESSING_COMPLETED', label: 'Processing Completed (Eligible for Result Entry)' });
        }
        return opts;
    }
    return [];
};

const LabBenchDashboard = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const { user } = useAuth();
    const { hospitalName: brandingHospitalName } = useBranding();
    const shellCtx = useLabAdminSummary();

    const [currentDate, setCurrentDate] = useState(() => new Date());
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState(null);

    // Queue & Instrument Data from Real Tenant Database
    const [inboundSamples, setInboundSamples] = useState([]);
    const [benchSamples, setBenchSamples] = useState([]);
    const [allTubes, setAllTubes] = useState([]);
    const [instruments, setInstruments] = useState([]);
    const [benchMetrics, setBenchMetrics] = useState({
        activeOnAnalyzers: 0,
        awaitingIntake: 0,
        instrumentsConfigured: 0,
        instrumentsReady: 0,
        activeQueueCount: 0,
        allTubesCount: 0
    });

    // Controls
    const [queueTab, setQueueTab] = useState('active'); // 'active' | 'all'
    const [fullBenchOpen, setFullBenchOpen] = useState(false);
    const [scanBarcodeInput, setScanBarcodeInput] = useState('');
    const [searchFilter, setSearchFilter] = useState(() => new URLSearchParams(location.search).get('search') || '');
    const [stageFilter, setStageFilter] = useState('ALL');
    const [priorityFilter, setPriorityFilter] = useState('ALL');

    // Analyzer Bench Run Modal State
    const [runModal, setRunModal] = useState({ open: false, sample: null, mode: 'stage' }); // mode: 'stage' | 'reject'
    const [selectedInstrument, setSelectedInstrument] = useState('');
    const [targetStage, setTargetStage] = useState('');
    const [sampleCondition, setSampleCondition] = useState('Normal');
    const [holdReason, setHoldReason] = useState('');
    const [benchNotes, setBenchNotes] = useState('');
    const [rejectReason, setRejectReason] = useState('Hemolyzed sample');
    const [requestRecollection, setRequestRecollection] = useState(true);
    const [submittingModal, setSubmittingModal] = useState(false);

    // Sync URL ?search= parameter (from topbar global search)
    useEffect(() => {
        const q = new URLSearchParams(location.search).get('search') || '';
        if (q) {
            setSearchFilter(q);
            setFullBenchOpen(true);
        }
    }, [location.search]);

    const loadBenchData = useCallback(async (isManual = false) => {
        if (isManual) setRefreshing(true);
        else setLoading(true);
        setError(null);

        try {
            const res = await labAPI.samples.getProcessingQueue({
                search: searchFilter.trim()
            });
            if (res?.success) {
                setBenchSamples(res.samples || []);
                setInboundSamples(res.inboundSamples || []);
                setAllTubes(res.allTubes || []);
                setInstruments(res.instruments || []);
                if (res.benchMetrics) {
                    setBenchMetrics(res.benchMetrics);
                }
            }
            if (isManual && shellCtx) {
                shellCtx.refreshSummary();
            }
            setCurrentDate(new Date());
            if (isManual) {
                toast.success('Technician bench synchronized');
            }
        } catch (err) {
            setError(err?.response?.data?.message || err?.message || 'Unable to load laboratory analyzer bench queue.');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [searchFilter, shellCtx]);

    useEffect(() => {
        const timer = setTimeout(() => {
            loadBenchData(false);
        }, 160);
        return () => clearTimeout(timer);
    }, [loadBenchData]);

    const summary = shellCtx ? shellCtx.summary : null;
    const userName = user?.name || 'Lab Technician';
    const actualHospitalName = (brandingHospitalName && brandingHospitalName !== 'Medical 365')
        ? brandingHospitalName
        : (summary?.hospitalName || brandingHospitalName || 'Medical 365');

    // Active Queue combines inbound (dispatched/received) + active bench (accepted/processing/on_hold)
    const activeQueueRows = useMemo(() => {
        const seen = new Set();
        const combined = [];
        [...inboundSamples, ...benchSamples].forEach((s) => {
            const id = String(s._id);
            if (!seen.has(id)) {
                seen.add(id);
                combined.push(s);
            }
        });
        return combined;
    }, [inboundSamples, benchSamples]);

    const displayedRows = useMemo(() => {
        const base = queueTab === 'active' ? activeQueueRows : allTubes;
        return base.filter((s) => {
            if (stageFilter !== 'ALL') {
                if (stageFilter === 'AWAITING_RECEIPT' && !['COLLECTED', 'DISPATCHED', 'IN_TRANSIT', 'ACCESSION_PENDING'].includes(s.status)) return false;
                if (stageFilter !== 'AWAITING_RECEIPT' && s.status !== stageFilter) return false;
            }
            if (priorityFilter !== 'ALL' && String(s.priority || 'Routine').toUpperCase() !== priorityFilter) {
                return false;
            }
            return true;
        });
    }, [queueTab, activeQueueRows, allTubes, stageFilter, priorityFilter]);

    // Open Analyzer Bench Run Modal with valid options for the sample's current stage
    const openAnalyzerModal = (sample) => {
        const options = getValidStageOptions(sample);
        if (options.length === 0) return;

        const defaultInstrument = sample?.processing?.analyzerReference
            || (instruments.length > 0 ? `${instruments[0].name} (${instruments[0].instrumentType})` : 'Manual Bench / Standard Workstation');

        setSelectedInstrument(defaultInstrument);
        setTargetStage(options[0].value);
        setSampleCondition(sample?.sampleCondition || 'Normal');
        setHoldReason(sample?.processing?.holdReason || '');
        setBenchNotes('');
        setRejectReason('Hemolyzed sample');
        setRequestRecollection(true);
        setRunModal({ open: true, sample, mode: 'stage' });
    };

    // Barcode Scanner Submit: locate sample and open Receive / Analyzer Run modal directly
    const handleBarcodeScanSubmit = (e) => {
        e.preventDefault();
        const code = scanBarcodeInput.trim();
        if (!code) return;

        const lower = code.toLowerCase();
        const found = [...activeQueueRows, ...allTubes].find(
            (s) => (s.barcode && s.barcode.toLowerCase() === lower) || (s.orderNumber && s.orderNumber.toLowerCase() === lower)
        );

        if (found) {
            setScanBarcodeInput('');
            if (found.status === 'PROCESSING_COMPLETED') {
                navigate(`/lab/results/entry?barcode=${encodeURIComponent(found.barcode)}`);
                return;
            }
            const validOpts = getValidStageOptions(found);
            if (validOpts.length > 0) {
                openAnalyzerModal(found);
                return;
            }
            toast(`Sample ${found.barcode || found.orderNumber} is currently ${found.status.replace(/_/g, ' ')}`);
        } else {
            setSearchFilter(code);
            setQueueTab('all');
            setFullBenchOpen(true);
            setScanBarcodeInput('');
        }
    };

    // Submit Validated Stage Update or Specimen Rejection
    const handleModalSubmit = async (e) => {
        e.preventDefault();
        const sample = runModal.sample;
        if (!sample?._id) return;

        setSubmittingModal(true);
        try {
            if (runModal.mode === 'reject') {
                const res = await labAPI.samples.rejectSample(sample._id, {
                    reason: rejectReason,
                    notes: benchNotes.trim(),
                    requestRecollection
                });
                if (res?.success) {
                    toast.success(res.message || `Sample ${sample.barcode} rejected`);
                    setRunModal({ open: false, sample: null, mode: 'stage' });
                    await loadBenchData(false);
                    if (shellCtx) shellCtx.refreshSummary();
                }
                return;
            }

            if (targetStage === 'ON_HOLD' && !holdReason.trim()) {
                toast.error('Please enter a reason before placing the specimen on hold.');
                setSubmittingModal(false);
                return;
            }

            const res = await labAPI.samples.updateBenchStage(sample._id, {
                targetStage,
                analyzerReference: selectedInstrument,
                sampleCondition,
                holdReason: holdReason.trim(),
                notes: benchNotes.trim()
            });

            if (res?.success) {
                toast.success(res.message || `Updated ${sample.barcode}`);
                setRunModal({ open: false, sample: null, mode: 'stage' });
                await loadBenchData(false);
                if (shellCtx) shellCtx.refreshSummary();
            }
        } catch (err) {
            toast.error(err?.response?.data?.message || err?.message || 'Failed to update analyzer status');
        } finally {
            setSubmittingModal(false);
        }
    };

    const instrumentsReadyLabel = instruments.length === 0
        ? '0 Configured'
        : `${benchMetrics.instrumentsReady} Ready`;

    const modalStageOptions = runModal.sample ? getValidStageOptions(runModal.sample) : [];
    const isInboundInspectionStage = runModal.sample && ['COLLECTED', 'DISPATCHED', 'IN_TRANSIT', 'ACCESSION_PENDING', 'RECEIVED_AT_PROCESSING_LAB'].includes(runModal.sample.status);

    return (
        <div className="ltd-page">
            {error && (
                <div className="lad-error-banner" role="alert">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <FiAlertTriangle size={16} />
                        <span>{error}</span>
                    </div>
                    <button type="button" className="lad-refresh-btn" onClick={() => loadBenchData(true)}>
                        Retry
                    </button>
                </div>
            )}

            {/* 1. Welcome Card */}
            <section className="lad-welcome-card">
                <div className="lad-welcome-left">
                    <div className="lad-greeting-row">
                        <h2 className="lad-greeting-heading">
                            {getTimeGreeting()}, <span className="lad-greeting-user">{userName}!</span>
                            <span className="lad-wave-emoji" role="img" aria-label="wave">👋</span>
                        </h2>
                        <span className="lad-role-pill">Lab Technician</span>
                    </div>
                    <p className="lad-welcome-sub">
                        Welcome back to <strong>{actualHospitalName}</strong>. Here is your live laboratory overview and operational summary today.
                    </p>
                </div>

                <div className="lad-welcome-right">
                    <div className="lad-date-pill">
                        <FiCalendar size={13} />
                        <span>{formatBannerDate(currentDate)}</span>
                    </div>
                    <button
                        type="button"
                        className="lad-refresh-btn"
                        onClick={() => loadBenchData(true)}
                        disabled={loading || refreshing}
                    >
                        <FiRefreshCw size={14} className={(loading || refreshing) ? 'lad-spin' : ''} />
                        <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
                    </button>
                </div>
            </section>

            {/* 2. Section Header */}
            <div className="ltd-section-header">
                <h3 className="ltd-section-title">
                    <ConicalFlaskIcon size={16} />
                    <span>Analyzer Testing Bench ({benchMetrics.activeOnAnalyzers})</span>
                </h3>
            </div>

            {/* 3. Blue Hero Card: Laboratory Testing & Analyzer Bench Workstation */}
            <section className="ltd-hero-card">
                <div className="ltd-hero-top">
                    <div className="ltd-hero-heading-group">
                        <h2 className="ltd-hero-title">
                            <FiCpu size={21} />
                            <span>Laboratory Testing &amp; Analyzer Bench Workstation</span>
                        </h2>
                        <p className="ltd-hero-sub">
                            Specimen accessioning, tube color triage, automated analyzer loading, and bench result recording.
                        </p>
                    </div>

                    <form className="ltd-hero-scan-form" onSubmit={handleBarcodeScanSubmit}>
                        <FiSearch className="ltd-hero-scan-icon" />
                        <input
                            type="text"
                            className="ltd-hero-scan-input"
                            placeholder="Scan sample barcode to receive or run..."
                            value={scanBarcodeInput}
                            onChange={(e) => setScanBarcodeInput(e.target.value)}
                        />
                        <button type="submit" className="ltd-hero-scan-btn">
                            Scan Tube
                        </button>
                    </form>
                </div>

                {/* 3 Real Database KPI Boxes */}
                <div className="ltd-hero-kpis">
                    <div className="ltd-hero-kpi-box">
                        <span className="ltd-hero-kpi-val">{loading ? '—' : benchMetrics.activeOnAnalyzers}</span>
                        <span className="ltd-hero-kpi-lbl">Active on Analyzers</span>
                    </div>
                    <div className="ltd-hero-kpi-box">
                        <span className="ltd-hero-kpi-val">{loading ? '—' : benchMetrics.awaitingIntake}</span>
                        <span className="ltd-hero-kpi-lbl">Awaiting Intake</span>
                    </div>
                    <div className="ltd-hero-kpi-box">
                        <span className="ltd-hero-kpi-val">{loading ? '—' : instrumentsReadyLabel}</span>
                        <span className="ltd-hero-kpi-lbl">Instruments Ready</span>
                    </div>
                </div>

                {/* Real Configured Instruments Status Strip (Never Hardcoded) */}
                <div className="ltd-instruments-strip">
                    {instruments.length > 0 ? (
                        instruments.map((inst) => {
                            const statusUpper = String(inst.operationalStatus || 'UNVERIFIED').toUpperCase();
                            const dotClass = statusUpper === 'OPERATIONAL'
                                ? 'operational'
                                : statusUpper === 'READY'
                                    ? 'ready'
                                    : (statusUpper === 'MAINTENANCE' || statusUpper === 'STANDBY')
                                        ? 'warning'
                                        : 'offline';

                            return (
                                <div key={inst.id} className="ltd-instrument-pill">
                                    <span className={`ltd-inst-dot ${dotClass}`} />
                                    <span>
                                        {inst.name} ({inst.instrumentType}):{' '}
                                        <strong className="ltd-inst-status-strong">{statusUpper}</strong>
                                        {inst.availability ? ` • ${inst.availability}` : ''}
                                    </span>
                                </div>
                            );
                        })
                    ) : (
                        <div className="ltd-instrument-pill">
                            <span className="ltd-inst-dot offline" />
                            <span>No automated analyzer instruments configured in database — manual bench workflow active</span>
                        </div>
                    )}
                </div>
            </section>

            {/* 4. Specimen Tubes & Analyzer Run Queue */}
            <section className="ltd-queue-card">
                <div className="ltd-queue-header">
                    <div className="ltd-queue-title-wrap">
                        <h3 className="ltd-queue-title">
                            <ConicalFlaskIcon size={17} />
                            <span>Specimen Tubes &amp; Analyzer Run Queue</span>
                        </h3>
                        <span className="ltd-active-bench-pill">
                            {activeQueueRows.length} Active on Bench
                        </span>
                        <span className="ltd-loaded-count">
                            ({allTubes.length} loaded)
                        </span>
                    </div>

                    <div className="ltd-queue-controls">
                        <div className="ltd-segmented-tabs" role="tablist" aria-label="Specimen queue view">
                            <button
                                type="button"
                                role="tab"
                                aria-selected={queueTab === 'active'}
                                className={`ltd-seg-btn ${queueTab === 'active' ? 'active' : ''}`}
                                onClick={() => setQueueTab('active')}
                            >
                                Active Queue ({activeQueueRows.length})
                            </button>
                            <button
                                type="button"
                                role="tab"
                                aria-selected={queueTab === 'all'}
                                className={`ltd-seg-btn ${queueTab === 'all' ? 'active' : ''}`}
                                onClick={() => setQueueTab('all')}
                            >
                                All Tubes ({allTubes.length})
                            </button>
                        </div>

                        <button
                            type="button"
                            className="ltd-open-bench-btn"
                            onClick={() => setFullBenchOpen((prev) => !prev)}
                        >
                            <span>{fullBenchOpen ? 'Compact Bench View' : 'Open Full Specimen Bench'}</span>
                            <FiArrowRight size={14} />
                        </button>
                    </div>
                </div>

                {/* Expanded Full Specimen Bench Toolbar */}
                {fullBenchOpen && (
                    <div className="ltd-full-bench-bar">
                        <div className="ltd-bench-search">
                            <FiSearch style={{ color: '#94a3b8', flexShrink: 0 }} />
                            <input
                                type="text"
                                placeholder="Filter by barcode, patient name, MRN or order number..."
                                value={searchFilter}
                                onChange={(e) => setSearchFilter(e.target.value)}
                            />
                            {searchFilter && (
                                <button
                                    type="button"
                                    onClick={() => setSearchFilter('')}
                                    style={{ border: 'none', background: 'transparent', color: '#94a3b8', cursor: 'pointer', display: 'inline-flex', padding: 0 }}
                                    aria-label="Clear filter"
                                >
                                    <FiX size={15} />
                                </button>
                            )}
                        </div>

                        <div className="ltd-bench-filter-group">
                            <select
                                className="ltd-bench-select"
                                value={stageFilter}
                                onChange={(e) => setStageFilter(e.target.value)}
                                aria-label="Filter by bench stage"
                            >
                                <option value="ALL">All Bench Stages</option>
                                <option value="AWAITING_RECEIPT">Awaiting Receipt at Lab</option>
                                <option value="RECEIVED_AT_PROCESSING_LAB">Received at Lab</option>
                                <option value="ACCEPTED">Accepted</option>
                                <option value="PROCESSING">Processing (In Run)</option>
                                <option value="ON_HOLD">On Hold</option>
                                <option value="PROCESSING_COMPLETED">Processing Completed</option>
                            </select>

                            <select
                                className="ltd-bench-select"
                                value={priorityFilter}
                                onChange={(e) => setPriorityFilter(e.target.value)}
                                aria-label="Filter by priority"
                            >
                                <option value="ALL">All Priorities</option>
                                <option value="STAT">STAT</option>
                                <option value="URGENT">Urgent</option>
                                <option value="ROUTINE">Routine</option>
                            </select>

                            <button
                                type="button"
                                className="ltd-btn-results"
                                onClick={() => navigate('/lab/results/entry')}
                            >
                                <FiEdit3 size={13} /> Result Entry Queue
                            </button>
                        </div>
                    </div>
                )}

                {/* Specimen Tubes Table */}
                <div className="ltd-table-wrap">
                    {loading ? (
                        <div style={{ padding: '42px 24px', textAlign: 'center', color: '#64748b' }}>
                            <FiRefreshCw className="lad-spin" size={22} style={{ color: '#2563eb', marginBottom: '8px' }} />
                            <div style={{ fontWeight: 700, color: '#0f172a' }}>Loading Specimen Run Queue...</div>
                        </div>
                    ) : displayedRows.length === 0 ? (
                        <div style={{ padding: '44px 24px', textAlign: 'center', color: '#64748b' }}>
                            <div style={{ fontWeight: 800, fontSize: '15px', color: '#0f172a', marginBottom: '4px' }}>
                                No Specimen Tubes in {queueTab === 'active' ? 'Active Queue' : 'Current Filter'}
                            </div>
                            <div style={{ fontSize: '13px' }}>
                                Dispatched tubes from Sample Collection appear here automatically for barcode receipt and analyzer processing.
                            </div>
                        </div>
                    ) : (
                        <table className="ltd-table">
                            <thead>
                                <tr>
                                    <th>Tube Barcode</th>
                                    <th>Tube Type &amp; Cap</th>
                                    <th>Patient Demographics</th>
                                    <th>Assigned Test Panel</th>
                                    <th>Bench Stage</th>
                                    <th>Priority</th>
                                    <th>Bench Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {displayedRows.map((s) => {
                                    const cap = resolveTubeCapPill(s.containerType, s.specimenType);
                                    const stage = getBenchStageBadge(s.status);
                                    const prioRaw = String(s.priority || 'Routine').toUpperCase();
                                    const prioCls = prioRaw === 'STAT'
                                        ? 'ltd-prio-stat'
                                        : prioRaw === 'URGENT'
                                            ? 'ltd-prio-urgent'
                                            : 'ltd-prio-routine';

                                    const testPanelText = (s.tests || [])
                                        .map((t) => t.testCode || t.testName)
                                        .filter(Boolean)
                                        .join(', ') || 'Assay';
                                    const mrn = s.patientSnapshot?.mrn || s.patientSnapshot?.uhid || 'N/A';

                                    const isInbound = ['COLLECTED', 'DISPATCHED', 'IN_TRANSIT', 'ACCESSION_PENDING'].includes(s.status);
                                    const isReceivedNeedsAccept = s.status === 'RECEIVED_AT_PROCESSING_LAB';
                                    const isReadyToLoad = s.status === 'ACCEPTED' || s.status === 'PROCESSING_PENDING';
                                    const isRunningOrHold = s.status === 'PROCESSING' || s.status === 'ON_HOLD';
                                    const isCompleted = s.status === 'PROCESSING_COMPLETED';

                                    return (
                                        <tr key={String(s._id)}>
                                            <td>
                                                <div className="ltd-barcode-cell">
                                                    <BarcodeMiniIcon />
                                                    <span>{s.barcode || s.orderNumber || 'Pending'}</span>
                                                </div>
                                            </td>

                                            <td>
                                                <span
                                                    className="ltd-tube-cap-pill"
                                                    style={{ background: cap.bg, border: `1px solid ${cap.border}`, color: cap.text }}
                                                >
                                                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: cap.dot, flexShrink: 0 }} />
                                                    <span>{cap.label}</span>
                                                </span>
                                            </td>

                                            <td>
                                                <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '13.5px' }}>
                                                    {s.patientSnapshot?.name || 'Registered Patient'}
                                                </div>
                                                <div style={{ fontSize: '11.8px', color: '#64748b', marginTop: '2px' }}>
                                                    {mrn}
                                                </div>
                                            </td>

                                            <td>
                                                <span style={{ fontWeight: 700, color: '#0f172a', fontSize: '13px' }}>
                                                    {testPanelText}
                                                </span>
                                                {s.processing?.analyzerReference && (
                                                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                                                        {s.processing.analyzerReference}
                                                    </div>
                                                )}
                                            </td>

                                            <td>
                                                <span className={`ltd-stage-pill ${stage.cls}`}>
                                                    {stage.label}
                                                </span>
                                            </td>

                                            <td>
                                                <span className={`ltd-priority-pill ${prioCls}`}>
                                                    {prioRaw}
                                                </span>
                                            </td>

                                            <td>
                                                {isInbound ? (
                                                    <button
                                                        type="button"
                                                        className="ltd-btn-receive"
                                                        onClick={() => openAnalyzerModal(s)}
                                                    >
                                                        <FiClock size={13} /> Receive at Bench
                                                    </button>
                                                ) : isReceivedNeedsAccept ? (
                                                    <button
                                                        type="button"
                                                        className="ltd-btn-receive"
                                                        onClick={() => openAnalyzerModal(s)}
                                                    >
                                                        <FiCheckCircle size={13} /> Accept Specimen
                                                    </button>
                                                ) : isReadyToLoad ? (
                                                    <button
                                                        type="button"
                                                        className="ltd-btn-load"
                                                        onClick={() => openAnalyzerModal(s)}
                                                    >
                                                        <FiSettings size={13} /> Load on Instrument
                                                    </button>
                                                ) : isRunningOrHold ? (
                                                    <button
                                                        type="button"
                                                        className="ltd-btn-load"
                                                        onClick={() => openAnalyzerModal(s)}
                                                    >
                                                        <FiSettings size={13} /> Update Run Stage
                                                    </button>
                                                ) : isCompleted ? (
                                                    <button
                                                        type="button"
                                                        className="ltd-btn-results"
                                                        onClick={() => navigate(`/lab/results/entry?barcode=${encodeURIComponent(s.barcode)}`)}
                                                    >
                                                        <FiEdit3 size={13} /> Enter Results
                                                    </button>
                                                ) : (
                                                    <button type="button" className="ltd-btn-awaiting" disabled>
                                                        <FiClock size={13} /> Awaiting Collection
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>

                <div className="ltd-queue-footer">
                    Showing <strong>{displayedRows.length > 0 ? 1 : 0}</strong> to <strong>{displayedRows.length}</strong> of{' '}
                    <strong>{displayedRows.length}</strong> {queueTab === 'active' ? 'active queue records' : 'loaded specimen records'}
                </div>
            </section>

            {/* =====================================================================
                MODAL: ANALYZER BENCH RUN (Matches Screenshot 5 & Part 2F)
               ===================================================================== */}
            {runModal.open && runModal.sample && (
                <div className="ltd-modal-overlay" role="dialog" aria-modal="true" aria-label="Analyzer Bench Run">
                    <div className="ltd-modal-card">
                        <div className="ltd-modal-header">
                            <h3 className="ltd-modal-title">
                                {runModal.mode === 'reject'
                                    ? `Reject Defective Specimen: ${runModal.sample.barcode}`
                                    : `Analyzer Bench Run: ${runModal.sample.barcode}`}
                            </h3>
                            <button
                                type="button"
                                className="ltd-modal-close"
                                onClick={() => setRunModal({ open: false, sample: null, mode: 'stage' })}
                                aria-label="Close modal"
                            >
                                <FiX />
                            </button>
                        </div>

                        <form onSubmit={handleModalSubmit}>
                            <div className="ltd-modal-body">
                                {/* Specimen Summary Box */}
                                {(() => {
                                    const cap = resolveTubeCapPill(runModal.sample.containerType, runModal.sample.specimenType);
                                    const targetTests = (runModal.sample.tests || [])
                                        .map((t) => t.testName || t.testCode)
                                        .filter(Boolean)
                                        .join(', ') || 'Diagnostic Assay';

                                    return (
                                        <div className="ltd-specimen-box">
                                            <div className="ltd-specimen-box-top">
                                                <span className="ltd-specimen-barcode">
                                                    Barcode: {runModal.sample.barcode}
                                                </span>
                                                <span
                                                    className="ltd-tube-cap-pill"
                                                    style={{ background: cap.bg, border: `1px solid ${cap.border}`, color: cap.text, padding: '3px 9px', fontSize: '11.5px' }}
                                                >
                                                    <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: cap.dot }} />
                                                    <span>{cap.label}</span>
                                                </span>
                                            </div>
                                            <div className="ltd-specimen-line">
                                                <strong>Patient:</strong> {runModal.sample.patientSnapshot?.name || 'Registered Patient'}
                                                {runModal.sample.patientSnapshot?.mrn ? ` (${runModal.sample.patientSnapshot.mrn})` : ''}
                                            </div>
                                            <div className="ltd-specimen-line">
                                                <strong>Target Test:</strong> {targetTests}
                                            </div>
                                        </div>
                                    );
                                })()}

                                {runModal.mode === 'stage' ? (
                                    <>
                                        {/* Assigned Analyzer Instrument Dropdown (Real DB Instruments + Manual Bench Fallback) */}
                                        <div className="ltd-modal-field">
                                            <label className="ltd-modal-label" htmlFor="ltd-analyzer-select">
                                                Assigned Analyzer Instrument
                                            </label>
                                            <select
                                                id="ltd-analyzer-select"
                                                className="ltd-modal-select"
                                                value={selectedInstrument}
                                                onChange={(e) => setSelectedInstrument(e.target.value)}
                                            >
                                                {instruments.map((inst) => {
                                                    const val = `${inst.name} (${inst.instrumentType})`;
                                                    return (
                                                        <option key={inst.id} value={val}>
                                                            {inst.name} — {inst.instrumentType} [{inst.operationalStatus}]
                                                        </option>
                                                    );
                                                })}
                                                {runModal.sample.processing?.analyzerReference &&
                                                    !instruments.some((i) => `${i.name} (${i.instrumentType})` === runModal.sample.processing.analyzerReference) &&
                                                    runModal.sample.processing.analyzerReference !== 'Manual Bench / Standard Workstation' && (
                                                        <option value={runModal.sample.processing.analyzerReference}>
                                                            {runModal.sample.processing.analyzerReference}
                                                        </option>
                                                    )}
                                                <option value="Manual Bench / Standard Workstation">
                                                    Manual Bench / Standard Workstation
                                                </option>
                                            </select>
                                        </div>

                                        {/* Target Bench Stage Dropdown (Strictly Valid Transitions Only) */}
                                        <div className="ltd-modal-field">
                                            <label className="ltd-modal-label" htmlFor="ltd-stage-select">
                                                Target Bench Stage
                                            </label>
                                            <select
                                                id="ltd-stage-select"
                                                className="ltd-modal-select"
                                                value={targetStage}
                                                onChange={(e) => setTargetStage(e.target.value)}
                                            >
                                                {modalStageOptions.map((opt) => (
                                                    <option key={opt.value} value={opt.value}>
                                                        {opt.label}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>

                                        {/* Specimen Quality Inspection when receiving/accepting */}
                                        {isInboundInspectionStage && targetStage === 'ACCEPTED' && (
                                            <div className="ltd-modal-field">
                                                <label className="ltd-modal-label" htmlFor="ltd-condition-select">
                                                    Specimen Condition Verification
                                                </label>
                                                <select
                                                    id="ltd-condition-select"
                                                    className="ltd-modal-select"
                                                    value={sampleCondition}
                                                    onChange={(e) => setSampleCondition(e.target.value)}
                                                >
                                                    <option value="Normal">Normal (Clear, Adequate Volume, Correct Tube)</option>
                                                    <option value="Hemolyzed">Slightly Hemolyzed</option>
                                                    <option value="Lipemic">Lipemic</option>
                                                    <option value="Icteric">Icteric</option>
                                                </select>
                                            </div>
                                        )}

                                        {/* Hold Reason when placing On Hold */}
                                        {targetStage === 'ON_HOLD' && (
                                            <div className="ltd-modal-field">
                                                <label className="ltd-modal-label" htmlFor="ltd-hold-reason">
                                                    Hold Reason *
                                                </label>
                                                <input
                                                    id="ltd-hold-reason"
                                                    type="text"
                                                    className="ltd-modal-input"
                                                    placeholder="e.g. Repeat dilution, calibration check, clot verification..."
                                                    value={holdReason}
                                                    onChange={(e) => setHoldReason(e.target.value)}
                                                    required
                                                />
                                            </div>
                                        )}

                                        {isInboundInspectionStage && (
                                            <div className="ltd-reject-switch-row">
                                                <span>Defective, clotted, or mislabelled tube?</span>
                                                <button
                                                    type="button"
                                                    className="ltd-reject-link-btn"
                                                    onClick={() => setRunModal((p) => ({ ...p, mode: 'reject' }))}
                                                >
                                                    Reject &amp; Request Recollection
                                                </button>
                                            </div>
                                        )}
                                    </>
                                ) : (
                                    /* Specimen Rejection Sub-mode */
                                    <>
                                        <div className="ltd-modal-field">
                                            <label className="ltd-modal-label" htmlFor="ltd-reject-reason">
                                                Mandatory Rejection Reason *
                                            </label>
                                            <select
                                                id="ltd-reject-reason"
                                                className="ltd-modal-select"
                                                value={rejectReason}
                                                onChange={(e) => setRejectReason(e.target.value)}
                                            >
                                                <option value="Hemolyzed sample">Hemolyzed sample</option>
                                                <option value="Clotted sample">Clotted sample</option>
                                                <option value="Insufficient volume">Insufficient volume (QNS)</option>
                                                <option value="Incorrect container">Incorrect container type</option>
                                                <option value="Leaking container">Leaking / damaged tube</option>
                                                <option value="Unlabelled sample">Unlabelled / mismatched barcode</option>
                                            </select>
                                        </div>

                                        <div className="ltd-modal-field">
                                            <label className="ltd-modal-label" htmlFor="ltd-reject-notes">
                                                Technical Rejection Notes
                                            </label>
                                            <textarea
                                                id="ltd-reject-notes"
                                                rows={2}
                                                className="ltd-modal-textarea"
                                                value={benchNotes}
                                                onChange={(e) => setBenchNotes(e.target.value)}
                                                placeholder="Details for Sample Collection redraw..."
                                            />
                                        </div>

                                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600, color: '#0f172a', cursor: 'pointer' }}>
                                            <input
                                                type="checkbox"
                                                checked={requestRecollection}
                                                onChange={(e) => setRequestRecollection(e.target.checked)}
                                            />
                                            <span>Initiate automatic recollection request in Sample Collection</span>
                                        </label>

                                        <div className="ltd-reject-switch-row">
                                            <span>Specimen acceptable?</span>
                                            <button
                                                type="button"
                                                className="ltd-reject-link-btn"
                                                style={{ color: '#2563eb' }}
                                                onClick={() => setRunModal((p) => ({ ...p, mode: 'stage' }))}
                                            >
                                                Back to Analyzer Bench Run
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>

                            <div className="ltd-modal-footer">
                                <button
                                    type="button"
                                    className="ltd-btn-cancel"
                                    onClick={() => setRunModal({ open: false, sample: null, mode: 'stage' })}
                                    disabled={submittingModal}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="ltd-btn-submit"
                                    style={runModal.mode === 'reject' ? { background: '#dc2626' } : undefined}
                                    disabled={submittingModal}
                                >
                                    {submittingModal
                                        ? 'Updating...'
                                        : runModal.mode === 'reject'
                                            ? 'Confirm Rejection'
                                            : 'Update Analyzer Status'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default LabBenchDashboard;
