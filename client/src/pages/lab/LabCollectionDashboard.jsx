import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { useAuth } from '../../store/hooks';
import { useBranding } from '../../context/BrandingContext';
import { labAPI } from '../../utils/api';
import { useLabAdminSummary } from '../../components/lab/LabAdminShell';
import LabBarcodeModal from './LabBarcodeModal';
import {
    FiGrid, FiUsers, FiClipboard, FiClock, FiCheckCircle,
    FiCalendar, FiRefreshCw, FiChevronUp, FiChevronDown,
    FiSearch, FiPrinter, FiSend, FiInfo, FiX, FiAlertTriangle,
    FiArrowRight, FiRotateCcw, FiShield
} from 'react-icons/fi';
import './LabAdminDashboard.css';
import './LabCollectionDashboard.css';

const ConicalFlaskIcon = ({ size = 18 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 3h6" />
        <path d="M10 3v5.4a2 2 0 0 1-.4 1.2L4.7 16.5A2.5 2.5 0 0 0 6.7 20.5h10.6a2.5 2.5 0 0 0 2-4L14.4 9.6a2 2 0 0 1-.4-1.2V3" />
        <path d="M7.5 15h9" />
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

const formatDateTime = (dt) => {
    if (!dt) return '—';
    try {
        const d = new Date(dt);
        if (Number.isNaN(d.getTime())) return '—';
        return d.toLocaleString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch (_) {
        return '—';
    }
};

const toLocalDateTimeInput = (d = new Date()) => {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const resolveTubeVisual = (containerType = '', specimenType = '') => {
    const raw = `${containerType} ${specimenType}`.toLowerCase();
    if (raw.includes('edta') || raw.includes('lavender') || raw.includes('purple')) {
        return { dot: '#9333ea', label: containerType || 'Lavender Top (EDTA)' };
    }
    if (raw.includes('citrate') || raw.includes('blue')) {
        return { dot: '#0284c7', label: containerType || 'Citrate Blue Tube' };
    }
    if (raw.includes('fluoride') || raw.includes('grey') || raw.includes('gray')) {
        return { dot: '#64748b', label: containerType || 'Fluoride Grey Tube' };
    }
    if (raw.includes('heparin') || raw.includes('green')) {
        return { dot: '#16a34a', label: containerType || 'Heparin Green Tube' };
    }
    if (raw.includes('sst') || raw.includes('gel') || raw.includes('plain') || raw.includes('red') || raw.includes('gold') || raw.includes('serum')) {
        return { dot: '#dc2626', label: containerType || 'Plain Red / SST Gel' };
    }
    return { dot: '#0ea5e9', label: containerType || 'Sterile Container' };
};

const getCollectionBadge = (status) => {
    if (status === 'PENDING_COLLECTION') return { label: 'Pending', cls: 'scd-pill-pending' };
    if (status === 'BARCODE_GENERATED') return { label: 'Pending Draw', cls: 'scd-pill-pending' };
    if (status === 'COLLECTED') return { label: 'Collected', cls: 'scd-pill-collected' };
    if (['DISPATCHED', 'IN_TRANSIT', 'ACCESSION_PENDING'].includes(status)) {
        return { label: 'Dispatched to Lab', cls: 'scd-pill-dispatched' };
    }
    if (['RECEIVED_AT_PROCESSING_LAB', 'ACCEPTED', 'PROCESSING_PENDING', 'PROCESSING', 'ON_HOLD', 'PROCESSING_COMPLETED'].includes(status)) {
        return { label: 'Received In Lab', cls: 'scd-pill-received' };
    }
    if (['RECOLLECTION_REQUESTED', 'RECOLLECTION_PENDING'].includes(status)) {
        return { label: 'Correction Needed', cls: 'scd-pill-correction' };
    }
    if (status === 'REJECTED') return { label: 'Rejected', cls: 'scd-pill-rejected' };
    return { label: String(status || 'Pending').replace(/_/g, ' '), cls: 'scd-pill-muted' };
};

const getAnalysisBadge = (analysisStatus) => {
    const val = String(analysisStatus || 'Pending Analysis');
    if (val === 'Completed') return { label: 'Completed', cls: 'scd-pill-collected' };
    if (val === 'In Analyzer Run') return { label: 'In Progress', cls: 'scd-pill-received' };
    if (val === 'Correction Needed') return { label: 'Correction Needed', cls: 'scd-pill-correction' };
    if (val === 'On Hold') return { label: 'On Hold', cls: 'scd-pill-correction' };
    if (val === 'Halted') return { label: 'Halted', cls: 'scd-pill-rejected' };
    if (val === 'Awaiting Sample') return { label: 'Awaiting Sample', cls: 'scd-pill-muted' };
    return { label: 'Pending Analysis', cls: 'scd-pill-pending' };
};

const matchesStatusFilter = (item, filterKey) => {
    const st = item.status;
    if (filterKey === 'ALL') return true;
    if (filterKey === 'PENDING') return ['PENDING_COLLECTION', 'BARCODE_GENERATED'].includes(st);
    if (filterKey === 'COLLECTED') return ['COLLECTED', 'DISPATCHED', 'IN_TRANSIT', 'ACCESSION_PENDING'].includes(st);
    if (filterKey === 'RECEIVED') {
        return ['RECEIVED_AT_PROCESSING_LAB', 'ACCEPTED', 'PROCESSING_PENDING', 'PROCESSING', 'ON_HOLD', 'PROCESSING_COMPLETED'].includes(st);
    }
    if (filterKey === 'CORRECTION_NEEDED') {
        return ['RECOLLECTION_REQUESTED', 'RECOLLECTION_PENDING'].includes(st) || item.analysisStatus === 'Correction Needed';
    }
    if (filterKey === 'REJECTED') return st === 'REJECTED' || item.rejection?.isRejected === true;
    return true;
};

const STATUS_FILTERS = [
    { key: 'ALL', label: 'All' },
    { key: 'PENDING', label: 'Pending' },
    { key: 'COLLECTED', label: 'Collected' },
    { key: 'RECEIVED', label: 'Received' },
    { key: 'CORRECTION_NEEDED', label: 'Correction Needed' },
    { key: 'REJECTED', label: 'Rejected' }
];

const LabCollectionDashboard = ({ mode = 'overview' }) => {
    const location = useLocation();
    const navigate = useNavigate();
    const { user } = useAuth();
    const { hospitalName: brandingHospitalName } = useBranding();
    const shellCtx = useLabAdminSummary();

    const isWorkstationRoute = (
        mode === 'workstation' ||
        location.pathname.endsWith('/samples')
    );

    const roleRaw = String(user?.roleName || user?._roleData?.name || user?.role || '').toLowerCase().trim();
    const isDedicatedCollectorRole = (
        roleRaw.includes('phlebotomist') ||
        roleRaw.includes('sample collector') ||
        roleRaw === 'sample collection'
    );

    // Local summary fallback when viewed outside LabAdminShell (e.g. Hospital Admin / Lab Manager)
    const [localSummary, setLocalSummary] = useState(null);
    const [overviewExpanded, setOverviewExpanded] = useState(true);
    const [currentDate, setCurrentDate] = useState(() => new Date());

    // Workstation state
    const [loadingQueue, setLoadingQueue] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState(null);
    const [benchTab, setBenchTab] = useState('active'); // 'active' | 'recollection'
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [searchInput, setSearchInput] = useState(() => new URLSearchParams(location.search).get('search') || '');

    const [samples, setSamples] = useState([]);
    const [pendingPlaceholders, setPendingPlaceholders] = useState([]);
    const [recollections, setRecollections] = useState([]);

    // Modals
    const [collectModal, setCollectModal] = useState({ open: false, item: null });
    const [collectForm, setCollectForm] = useState({
        collectedAt: toLocalDateTimeInput(),
        collectedVolume: '',
        collectionNotes: '',
        labelConfirmedAttached: true
    });
    const [submittingCollect, setSubmittingCollect] = useState(false);

    const [dispatchModal, setDispatchModal] = useState({ open: false, sample: null });
    const [dispatchForm, setDispatchForm] = useState({
        courierName: 'Internal Laboratory Runner',
        transportReference: '',
        notes: ''
    });
    const [submittingDispatch, setSubmittingDispatch] = useState(false);

    const [infoModal, setInfoModal] = useState({ open: false, item: null, history: [], loadingHistory: false });
    const [barcodeModal, setBarcodeModal] = useState({ open: false, data: null });

    // Sync URL ?search= parameter (from topbar global search)
    useEffect(() => {
        const urlSearch = new URLSearchParams(location.search).get('search') || '';
        setSearchInput(urlSearch);
    }, [location.search]);

    const fetchAllData = useCallback(async (isManual = false) => {
        if (isManual) setRefreshing(true);
        else setLoadingQueue(true);
        setError(null);

        try {
            const promises = [
                labAPI.samples.getCollectionQueue({ search: searchInput.trim() })
            ];
            if (shellCtx) {
                if (isManual) promises.push(shellCtx.refreshSummary());
            } else {
                promises.push(labAPI.getDashboardSummary());
            }

            const [queueRes, summaryRes] = await Promise.allSettled(promises);

            if (queueRes.status === 'fulfilled' && queueRes.value?.success) {
                setSamples(queueRes.value.samples || []);
                setPendingPlaceholders(queueRes.value.pendingPlaceholders || []);
                setRecollections(queueRes.value.recollections || []);
            } else if (queueRes.status === 'rejected') {
                const msg = queueRes.reason?.response?.data?.message || queueRes.reason?.message || 'Unable to load sample collection queue.';
                setError(msg);
            }

            if (!shellCtx && summaryRes && summaryRes.status === 'fulfilled' && summaryRes.value?.success) {
                setLocalSummary(summaryRes.value.summary);
            }

            setCurrentDate(new Date());
            if (isManual) {
                toast.success('Sample collection data refreshed');
            }
        } catch (err) {
            setError(err?.response?.data?.message || err?.message || 'Unable to load sample collection data.');
        } finally {
            setLoadingQueue(false);
            setRefreshing(false);
        }
    }, [searchInput, shellCtx]);

    useEffect(() => {
        const timer = setTimeout(() => {
            fetchAllData(false);
        }, 180);
        return () => clearTimeout(timer);
    }, [fetchAllData]);

    const summary = shellCtx ? shellCtx.summary : localSummary;
    const summaryLoading = shellCtx ? shellCtx.loading : loadingQueue;

    const userName = user?.name || 'Sample Collector';
    const actualHospitalName = (brandingHospitalName && brandingHospitalName !== 'Medical 365')
        ? brandingHospitalName
        : (summary?.hospitalName || brandingHospitalName || 'Medical 365');

    // Real DB Metrics for Part 1B Overview
    const ov = summary?.overview || {};
    const metrics = summary?.metrics || {};
    const totalRegisteredPatients = ov.patients?.totalRegistered ?? ov.patients?.totalServed ?? 0;
    const totalLabOrders = ov.orders?.total ?? metrics.totalOrders ?? 0;
    const pendingOrdersCount = metrics.pendingOrders ?? ((ov.orders?.confirmed ?? 0) + (ov.orders?.inProgress ?? 0));
    const samplesAwaitingCollection = ov.sampleCollection?.awaitingCollection ?? (pendingPlaceholders.length + samples.filter((s) => ['PENDING_COLLECTION', 'BARCODE_GENERATED'].includes(s.status)).length);
    const samplesCollectedCount = ov.sampleCollection?.collectedTotal ?? samples.filter((s) => !['PENDING_COLLECTION', 'BARCODE_GENERATED', 'CANCELLED', 'REJECTED'].includes(s.status)).length;
    const samplesReceivedInLabCount = ov.sampleCollection?.receivedInLab ?? samples.filter((s) => ['RECEIVED_AT_PROCESSING_LAB', 'ACCEPTED', 'PROCESSING_PENDING', 'PROCESSING', 'ON_HOLD', 'PROCESSING_COMPLETED'].includes(s.status)).length;

    // Combine unbarcoded pending placeholders + physical samples into unified bench rows
    const unifiedBenchRows = useMemo(() => {
        const placeholderRows = (pendingPlaceholders || []).map((ph) => ({
            ...ph,
            _rowKey: `ph_${ph.orderId}_${ph.specimenPlaceholderId}`,
            isPlaceholderOnly: true,
            barcode: null,
            testsList: (ph.testNames && ph.testNames.length > 0) ? ph.testNames : (ph.testCodes || [])
        }));

        const sampleRows = (samples || []).map((s) => ({
            ...s,
            _rowKey: String(s._id),
            isPlaceholderOnly: false,
            testsList: (s.tests || []).map((t) => t.testCode || t.testName).filter(Boolean)
        }));

        return [...placeholderRows, ...sampleRows];
    }, [pendingPlaceholders, samples]);

    const filteredBenchRows = useMemo(() => {
        return unifiedBenchRows.filter((item) => matchesStatusFilter(item, statusFilter));
    }, [unifiedBenchRows, statusFilter]);

    const pendingRecollections = useMemo(() => {
        return (recollections || []).filter((r) => r.status !== 'RECOLLECTED');
    }, [recollections]);

    // Open Collection Confirmation Modal
    const openCollectModal = (item) => {
        setCollectForm({
            collectedAt: toLocalDateTimeInput(new Date()),
            collectedVolume: item.collectedVolume || item.requiredVolume || '2-3 mL',
            collectionNotes: item.collectionNotes || '',
            labelConfirmedAttached: true
        });
        setCollectModal({ open: true, item });
    };

    // Confirm Specimen Collection & Open Printable Code 128 Barcode Label
    const handleConfirmCollection = async (e) => {
        e.preventDefault();
        const item = collectModal.item;
        if (!item) return;

        if (!collectForm.labelConfirmedAttached) {
            toast.error('Please confirm barcode label readiness for specimen container attachment.');
            return;
        }

        setSubmittingCollect(true);
        try {
            let sampleId = item._id;

            // Step 1: If this is an unbarcoded order placeholder, atomically generate Code 128 barcode first
            if (item.isPlaceholderOnly || !item.barcode) {
                const genRes = await labAPI.samples.generateBarcode({
                    orderId: item.orderId,
                    specimenPlaceholderId: item.specimenPlaceholderId
                });
                if (!genRes?.success || !genRes.sample?._id) {
                    throw new Error(genRes?.message || 'Failed to generate unique sample barcode.');
                }
                sampleId = genRes.sample._id;
            }

            // Step 2: Confirm physical collection with timestamp, collector, volume & notes (stays COLLECTED until explicitly dispatched)
            const colRes = await labAPI.samples.collectSample(sampleId, {
                collectedAt: collectForm.collectedAt ? new Date(collectForm.collectedAt).toISOString() : new Date().toISOString(),
                collectedVolume: collectForm.collectedVolume.trim() || item.requiredVolume || '2-3 mL',
                collectionNotes: collectForm.collectionNotes.trim(),
                labelConfirmedAttached: true,
                dispatchToLab: false
            });

            if (!colRes?.success) {
                throw new Error(colRes?.message || 'Failed to record specimen collection.');
            }

            toast.success(`Specimen collected (${colRes.sample?.barcode || 'Barcoded'}). Ready to print label.`);
            setCollectModal({ open: false, item: null });

            // Step 3: Load printable Code 128 label & open print modal
            const lblRes = await labAPI.samples.getLabel(sampleId);
            if (lblRes?.success && lblRes.labelData) {
                setBarcodeModal({
                    open: true,
                    data: { ...lblRes.labelData, sampleId }
                });
            }

            await fetchAllData(false);
            if (shellCtx) shellCtx.refreshSummary();
        } catch (err) {
            toast.error(err?.response?.data?.message || err?.message || 'Specimen collection failed');
        } finally {
            setSubmittingCollect(false);
        }
    };

    // Open Printable Barcode Label for an existing sample (or generate first if needed)
    const handleOpenBarcodeLabel = async (item) => {
        try {
            let sampleId = item._id;
            if (item.isPlaceholderOnly || !item.barcode) {
                const genRes = await labAPI.samples.generateBarcode({
                    orderId: item.orderId,
                    specimenPlaceholderId: item.specimenPlaceholderId
                });
                if (!genRes?.success || !genRes.sample?._id) {
                    toast.error(genRes?.message || 'Failed to generate sample barcode');
                    return;
                }
                sampleId = genRes.sample._id;
                toast.success(`Generated unique barcode ${genRes.sample.barcode}`);
                fetchAllData(false);
            }

            const res = await labAPI.samples.getLabel(sampleId);
            if (res?.success && res.labelData) {
                setBarcodeModal({
                    open: true,
                    data: { ...res.labelData, sampleId }
                });
            }
        } catch (err) {
            toast.error(err?.response?.data?.message || err?.message || 'Failed to load barcode label');
        }
    };

    // Open Dispatch / Send to Lab Modal
    const openDispatchModal = (sample) => {
        setDispatchForm({
            courierName: 'Internal Laboratory Runner',
            transportReference: '',
            notes: ''
        });
        setDispatchModal({ open: true, sample });
    };

    const handleConfirmDispatch = async (e) => {
        e.preventDefault();
        const sample = dispatchModal.sample;
        if (!sample?._id) return;

        setSubmittingDispatch(true);
        try {
            const res = await labAPI.samples.dispatchToLab(sample._id, {
                courierName: dispatchForm.courierName.trim() || 'Internal Laboratory Runner',
                transportReference: dispatchForm.transportReference.trim(),
                notes: dispatchForm.notes.trim() || 'Dispatched from Sample Collection to Processing Laboratory'
            });
            if (res?.success) {
                toast.success(res.message || `Sample ${sample.barcode} sent to Processing Laboratory`);
                setDispatchModal({ open: false, sample: null });
                await fetchAllData(false);
                if (shellCtx) shellCtx.refreshSummary();
            }
        } catch (err) {
            toast.error(err?.response?.data?.message || err?.message || 'Failed to send sample to laboratory');
        } finally {
            setSubmittingDispatch(false);
        }
    };

    // Recollect a rejected/requested redraw
    const handleRecollectDraw = async (rec) => {
        try {
            const res = await labAPI.samples.recollectSample(rec._id, {
                collectedVolume: '2-3 mL',
                notes: `Replacement specimen collected for ${rec.originalBarcode}`
            });
            if (res?.success && res.replacementSample) {
                toast.success(`Replacement tube collected: ${res.replacementSample.barcode}`);
                const lbl = await labAPI.samples.getLabel(res.replacementSample._id);
                if (lbl?.success && lbl.labelData) {
                    setBarcodeModal({
                        open: true,
                        data: { ...lbl.labelData, sampleId: res.replacementSample._id }
                    });
                }
                await fetchAllData(false);
                if (shellCtx) shellCtx.refreshSummary();
            }
        } catch (err) {
            toast.error(err?.response?.data?.message || err?.message || 'Failed to process recollection');
        }
    };

    // Open Info / Chain-of-Custody Modal
    const handleOpenInfo = async (item) => {
        if (item.isPlaceholderOnly || !item._id) {
            setInfoModal({ open: true, item, history: [], loadingHistory: false });
            return;
        }
        setInfoModal({ open: true, item, history: [], loadingHistory: true });
        try {
            const res = await labAPI.samples.getTimeline(item._id);
            if (res?.success) {
                setInfoModal({
                    open: true,
                    item: { ...item, ...(res.sample || {}) },
                    history: res.history || [],
                    loadingHistory: false
                });
            } else {
                setInfoModal((prev) => ({ ...prev, loadingHistory: false }));
            }
        } catch (_) {
            setInfoModal((prev) => ({ ...prev, loadingHistory: false }));
        }
    };

    // Scanner Enter handler: if exact barcode typed/scanned, open Info or Collect directly
    const handleScannerSubmit = (e) => {
        e.preventDefault();
        const q = searchInput.trim().toLowerCase();
        if (!q) return;
        const exactMatch = unifiedBenchRows.find(
            (r) => (r.barcode && r.barcode.toLowerCase() === q) || (r.orderNumber && r.orderNumber.toLowerCase() === q)
        );
        if (exactMatch) {
            if (['PENDING_COLLECTION', 'BARCODE_GENERATED'].includes(exactMatch.status)) {
                openCollectModal(exactMatch);
            } else {
                handleOpenInfo(exactMatch);
            }
        } else {
            fetchAllData(false);
        }
    };

    return (
        <div className="scd-page">
            {/* Sub-navigation bar only when accessed by Admin/Manager outside dedicated Sample Collection sidebar */}
            {!isDedicatedCollectorRole && (
                <div className="scd-admin-mode-bar">
                    <div className="scd-admin-mode-tabs">
                        <button
                            type="button"
                            className={`scd-admin-tab-btn ${!isWorkstationRoute ? 'active' : ''}`}
                            onClick={() => navigate('/lab/collection')}
                        >
                            <FiGrid size={14} /> Sample Collection Overview
                        </button>
                        <button
                            type="button"
                            className={`scd-admin-tab-btn ${isWorkstationRoute ? 'active' : ''}`}
                            onClick={() => navigate('/lab/collection/samples')}
                        >
                            <ConicalFlaskIcon size={14} /> Samples Workstation ({unifiedBenchRows.length})
                        </button>
                    </div>
                </div>
            )}

            {/* Error Alert */}
            {error && (
                <div className="lad-error-banner" role="alert">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <FiAlertTriangle size={16} />
                        <span>{error}</span>
                    </div>
                    <button type="button" className="lad-refresh-btn" onClick={() => fetchAllData(true)}>
                        Retry
                    </button>
                </div>
            )}

            {/* =====================================================================
                VIEW 1: SAMPLE COLLECTION DASHBOARD OVERVIEW (Screenshot 1)
               ===================================================================== */}
            {!isWorkstationRoute ? (
                <>
                    {/* Greeting Banner */}
                    <section className="lad-welcome-card">
                        <div className="lad-welcome-left">
                            <div className="lad-greeting-row">
                                <h2 className="lad-greeting-heading">
                                    {getTimeGreeting()}, <span className="lad-greeting-user">{userName}!</span>
                                    <span className="lad-wave-emoji" role="img" aria-label="wave">👋</span>
                                </h2>
                                <span className="lad-role-pill">Sample Collection</span>
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
                                onClick={() => fetchAllData(true)}
                                disabled={summaryLoading || refreshing}
                            >
                                <FiRefreshCw size={14} className={(summaryLoading || refreshing) ? 'lad-spin' : ''} />
                                <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
                            </button>
                        </div>
                    </section>

                    {/* View All Overview — Database-Driven Metric Cards */}
                    <section className="scd-overview-panel">
                        <button
                            type="button"
                            className="scd-overview-head"
                            onClick={() => setOverviewExpanded((prev) => !prev)}
                            aria-expanded={overviewExpanded}
                        >
                            <div className="scd-overview-head-left">
                                <span className="scd-overview-icon-box">
                                    <FiGrid />
                                </span>
                                <div>
                                    <div className="scd-overview-title-row">
                                        <span className="scd-overview-title">View All Overview</span>
                                        <span className="scd-overview-badge">
                                            {overviewExpanded ? 'Expanded' : 'Collapsed'}
                                        </span>
                                    </div>
                                    <div className="scd-overview-sub">
                                        Detailed overview of patient accessions, lab orders &amp; specimen collection queues
                                    </div>
                                </div>
                            </div>

                            <span className="scd-pull-btn">
                                <span>{overviewExpanded ? 'Pull Off' : 'Pull Down'}</span>
                                {overviewExpanded ? <FiChevronUp size={15} /> : <FiChevronDown size={15} />}
                            </span>
                        </button>

                        {overviewExpanded && (
                            <div className="scd-overview-grid-wrap">
                                <div className="scd-metrics-grid">
                                    {/* 1. Total Registered Patients */}
                                    <div className="scd-metric-card">
                                        <div className="scd-metric-top">
                                            <span className="scd-metric-label">Total Registered Patients</span>
                                            <span className="scd-metric-icon scd-icon-teal"><FiUsers /></span>
                                        </div>
                                        <div className="scd-metric-value scd-val-teal">
                                            {summaryLoading ? <span className="lad-skeleton-val" /> : totalRegisteredPatients}
                                        </div>
                                        <div className="scd-metric-desc">Accessioned directory profiles</div>
                                    </div>

                                    {/* 2. Total Lab Orders */}
                                    <div className="scd-metric-card">
                                        <div className="scd-metric-top">
                                            <span className="scd-metric-label">Total Lab Orders</span>
                                            <span className="scd-metric-icon scd-icon-purple"><FiClipboard /></span>
                                        </div>
                                        <div className="scd-metric-value scd-val-purple">
                                            {summaryLoading ? <span className="lad-skeleton-val" /> : totalLabOrders}
                                        </div>
                                        <div className="scd-metric-desc">Requisitions logged</div>
                                    </div>

                                    {/* 3. Pending Orders */}
                                    <div className="scd-metric-card">
                                        <div className="scd-metric-top">
                                            <span className="scd-metric-label">Pending Orders</span>
                                            <span className="scd-metric-icon scd-icon-amber"><FiClock /></span>
                                        </div>
                                        <div className="scd-metric-value scd-val-amber">
                                            {summaryLoading ? <span className="lad-skeleton-val" /> : pendingOrdersCount}
                                        </div>
                                        <div className="scd-metric-desc">Awaiting sample or processing</div>
                                    </div>

                                    {/* 4. Samples Awaiting Collection */}
                                    <div className="scd-metric-card">
                                        <div className="scd-metric-top">
                                            <span className="scd-metric-label">Samples Awaiting Collection</span>
                                            <span className="scd-metric-icon scd-icon-orange"><ConicalFlaskIcon size={17} /></span>
                                        </div>
                                        <div className="scd-metric-value scd-val-orange">
                                            {summaryLoading ? <span className="lad-skeleton-val" /> : samplesAwaitingCollection}
                                        </div>
                                        <div className="scd-metric-desc">Pending phlebotomy intake</div>
                                    </div>

                                    {/* 5. Samples Collected */}
                                    <div className="scd-metric-card">
                                        <div className="scd-metric-top">
                                            <span className="scd-metric-label">Samples Collected</span>
                                            <span className="scd-metric-icon scd-icon-emerald"><FiCheckCircle /></span>
                                        </div>
                                        <div className="scd-metric-value scd-val-emerald">
                                            {summaryLoading ? <span className="lad-skeleton-val" /> : samplesCollectedCount}
                                        </div>
                                        <div className="scd-metric-desc">Drawn &amp; barcoded tubes</div>
                                    </div>

                                    {/* 6. Samples Received in Lab */}
                                    <div className="scd-metric-card">
                                        <div className="scd-metric-top">
                                            <span className="scd-metric-label">Samples Received in Lab</span>
                                            <span className="scd-metric-icon scd-icon-blue"><FiShield /></span>
                                        </div>
                                        <div className="scd-metric-value scd-val-blue">
                                            {summaryLoading ? <span className="lad-skeleton-val" /> : samplesReceivedInLabCount}
                                        </div>
                                        <div className="scd-metric-desc">Confirmed at processing bench</div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </section>

                    {/* Quick Action Bar to Open Sample Collection Workstation */}
                    <section className="scd-launch-card">
                        <div>
                            <h3 className="scd-launch-title">Sample Collection &amp; Barcode Workstation</h3>
                            <p className="scd-launch-sub">
                                {samplesAwaitingCollection > 0
                                    ? `${samplesAwaitingCollection} specimen requirement(s) currently awaiting collection and Code 128 labelling.`
                                    : 'View active specimen tubes, print Code 128 barcode labels, and dispatch collected samples to the laboratory.'}
                            </p>
                        </div>
                        <button
                            type="button"
                            className="scd-launch-btn"
                            onClick={() => navigate('/lab/collection/samples')}
                        >
                            <span>Open Samples Workstation</span>
                            <FiArrowRight size={15} />
                        </button>
                    </section>
                </>
            ) : (
                /* =====================================================================
                   VIEW 2: SAMPLE COLLECTION WORKSTATION (Screenshot 2)
                   ===================================================================== */
                <>
                    <div className="scd-ws-header">
                        <div>
                            <h2 className="scd-ws-title">Specimen Accessioning &amp; Sample Tracking</h2>
                            <p className="scd-ws-subtitle">
                                Multi-tube specimen derivation, Code 128 barcode labelling, laboratory receipt triage, result entry, and pathologist sign-off.
                            </p>
                        </div>
                        <button
                            type="button"
                            className="lad-refresh-btn"
                            onClick={() => fetchAllData(true)}
                            disabled={loadingQueue || refreshing}
                        >
                            <FiRefreshCw size={14} className={(loadingQueue || refreshing) ? 'lad-spin' : ''} />
                            <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
                        </button>
                    </div>

                    {/* Active Specimen Bench vs Recollection Queue */}
                    <div className="scd-ws-mode-row">
                        <div className="scd-ws-mode-pills">
                            <button
                                type="button"
                                className={`scd-mode-pill ${benchTab === 'active' ? 'active' : ''}`}
                                onClick={() => setBenchTab('active')}
                            >
                                <ConicalFlaskIcon size={15} />
                                <span>Active Specimen Bench ({unifiedBenchRows.length})</span>
                            </button>
                            <button
                                type="button"
                                className={`scd-mode-pill ${benchTab === 'recollection' ? 'active' : ''}`}
                                onClick={() => setBenchTab('recollection')}
                            >
                                <FiRotateCcw size={14} />
                                <span>
                                    Recollection Queue{pendingRecollections.length > 0 ? ` (${pendingRecollections.length})` : ''}
                                </span>
                            </button>
                        </div>
                    </div>

                    {/* Search / Barcode Scanner & Status Filters */}
                    {benchTab === 'active' && (
                        <div className="scd-filter-card">
                            <form className="scd-scanner-box" onSubmit={handleScannerSubmit}>
                                <FiSearch className="scd-scanner-icon" />
                                <input
                                    type="text"
                                    className="scd-scanner-input"
                                    placeholder="Scan or search barcode, patient MRN, or order number..."
                                    value={searchInput}
                                    onChange={(e) => setSearchInput(e.target.value)}
                                />
                                {searchInput && (
                                    <button
                                        type="button"
                                        onClick={() => setSearchInput('')}
                                        style={{ border: 'none', background: 'transparent', color: '#94a3b8', cursor: 'pointer', padding: 0, display: 'inline-flex' }}
                                        aria-label="Clear search"
                                    >
                                        <FiX size={15} />
                                    </button>
                                )}
                            </form>

                            <div className="scd-status-filters" role="group" aria-label="Filter samples by status">
                                <span className="scd-filter-label">Filter:</span>
                                {STATUS_FILTERS.map((f) => (
                                    <button
                                        key={f.key}
                                        type="button"
                                        className={`scd-filter-chip ${statusFilter === f.key ? 'active' : ''}`}
                                        onClick={() => setStatusFilter(f.key)}
                                    >
                                        {f.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Main Table Card */}
                    <div className="scd-table-card">
                        {benchTab === 'active' ? (
                            loadingQueue ? (
                                <div className="scd-empty-state">
                                    <FiRefreshCw className="lad-spin" size={24} style={{ color: '#2563eb', marginBottom: '10px' }} />
                                    <h4>Loading Specimen Bench...</h4>
                                    <p>Fetching active orders and barcoded specimen tubes.</p>
                                </div>
                            ) : filteredBenchRows.length === 0 ? (
                                <div className="scd-empty-state">
                                    <div className="scd-empty-icon"><ConicalFlaskIcon size={22} /></div>
                                    <h4>No Specimens Match Current Filter</h4>
                                    <p>
                                        {searchInput || statusFilter !== 'ALL'
                                            ? 'Adjust your search term or select ALL to view every specimen record.'
                                            : 'Eligible lab test orders from Medical365 Reception & Doctors appear here automatically.'}
                                    </p>
                                </div>
                            ) : (
                                <div className="scd-table-scroll">
                                    <table className="scd-table">
                                        <thead>
                                            <tr>
                                                <th>Barcode &amp; Tube</th>
                                                <th>Order &amp; Patient</th>
                                                <th>Container / Specimen</th>
                                                <th>Required Tests</th>
                                                <th>Collection</th>
                                                <th>Analysis</th>
                                                <th>Bench Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredBenchRows.map((row) => {
                                                const tubeVis = resolveTubeVisual(row.containerType, row.specimenType);
                                                const colBadge = getCollectionBadge(row.status);
                                                const anaBadge = getAnalysisBadge(row.analysisStatus);
                                                const mrnVal = row.patientSnapshot?.mrn || row.patientSnapshot?.uhid || 'N/A';
                                                const canCollect = ['PENDING_COLLECTION', 'BARCODE_GENERATED'].includes(row.status);
                                                const canDispatch = row.status === 'COLLECTED' && !row.isPlaceholderOnly;

                                                return (
                                                    <tr key={row._rowKey}>
                                                        <td>
                                                            {row.barcode ? (
                                                                <span className="scd-barcode-code">{row.barcode}</span>
                                                            ) : (
                                                                <span className="scd-barcode-pending">Awaiting Barcode</span>
                                                            )}
                                                            <span className="scd-tube-pill">{row.tubeLabel || 'Tube 1/1'}</span>
                                                        </td>

                                                        <td>
                                                            <div className="scd-patient-name">
                                                                {row.patientSnapshot?.name || 'Registered Patient'}
                                                            </div>
                                                            <div className="scd-patient-meta">
                                                                MRN: {mrnVal} &bull; {row.orderNumber || '—'}
                                                            </div>
                                                            {row.referringDoctorName && (
                                                                <div className="scd-patient-meta">
                                                                    Ref: {row.referringDoctorName}
                                                                </div>
                                                            )}
                                                        </td>

                                                        <td>
                                                            <div className="scd-container-main">
                                                                <span className="scd-cap-dot" style={{ background: tubeVis.dot }} />
                                                                <span>{tubeVis.label}</span>
                                                            </div>
                                                            <div className="scd-specimen-sub">
                                                                {row.specimenType || 'Specimen'} ({row.collectedVolume || row.requiredVolume || '2-3 mL'})
                                                            </div>
                                                        </td>

                                                        <td>
                                                            <div className="scd-tests-wrap">
                                                                {(row.testsList && row.testsList.length > 0) ? (
                                                                    row.testsList.map((tName, idx) => (
                                                                        <span key={`${row._rowKey}_t_${idx}`} className="scd-test-tag">
                                                                            {tName}
                                                                        </span>
                                                                    ))
                                                                ) : (
                                                                    <span className="scd-test-tag">Assay</span>
                                                                )}
                                                            </div>
                                                        </td>

                                                        <td>
                                                            <span className={`scd-status-pill ${colBadge.cls}`}>
                                                                {colBadge.label}
                                                            </span>
                                                        </td>

                                                        <td>
                                                            <span className={`scd-status-pill ${anaBadge.cls}`}>
                                                                {anaBadge.label}
                                                            </span>
                                                        </td>

                                                        <td>
                                                            <div className="scd-actions-cell">
                                                                {canCollect && (
                                                                    <button
                                                                        type="button"
                                                                        className="scd-btn scd-btn-collect"
                                                                        onClick={() => openCollectModal(row)}
                                                                    >
                                                                        <FiCheckCircle size={13} /> Collect
                                                                    </button>
                                                                )}

                                                                {canDispatch && (
                                                                    <button
                                                                        type="button"
                                                                        className="scd-btn scd-btn-dispatch"
                                                                        onClick={() => openDispatchModal(row)}
                                                                        title="Dispatch collected tube to Processing Laboratory"
                                                                    >
                                                                        <FiSend size={12} /> Send to Lab
                                                                    </button>
                                                                )}

                                                                <button
                                                                    type="button"
                                                                    className="scd-btn"
                                                                    onClick={() => handleOpenBarcodeLabel(row)}
                                                                    title="Generate or print Code 128 barcode label"
                                                                >
                                                                    <FiPrinter size={13} /> Label
                                                                </button>

                                                                <button
                                                                    type="button"
                                                                    className="scd-btn"
                                                                    onClick={() => handleOpenInfo(row)}
                                                                    title="View patient, order, specimen & custody details"
                                                                >
                                                                    <FiInfo size={13} /> Info
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )
                        ) : (
                            /* Recollection Queue Table */
                            recollections.length === 0 ? (
                                <div className="scd-empty-state">
                                    <div className="scd-empty-icon"><FiCheckCircle size={22} /></div>
                                    <h4>No Active Recollection Requests</h4>
                                    <p>Rejected or compromised specimens requiring redraw appear here automatically.</p>
                                </div>
                            ) : (
                                <div className="scd-table-scroll">
                                    <table className="scd-table">
                                        <thead>
                                            <tr>
                                                <th>Original Barcode</th>
                                                <th>Order &amp; Patient</th>
                                                <th>Specimen / Container</th>
                                                <th>Rejection / Redraw Reason</th>
                                                <th>Requested By</th>
                                                <th>Status</th>
                                                <th>Action</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {recollections.map((rec) => (
                                                <tr key={rec._id}>
                                                    <td>
                                                        <span className="scd-barcode-code">{rec.originalBarcode || '—'}</span>
                                                        {rec.replacementBarcode && (
                                                            <span className="scd-tube-pill">New: {rec.replacementBarcode}</span>
                                                        )}
                                                    </td>
                                                    <td>
                                                        <div className="scd-patient-name">{rec.patientName || 'Patient'}</div>
                                                        <div className="scd-patient-meta">{rec.orderNumber || '—'}</div>
                                                    </td>
                                                    <td>
                                                        <div className="scd-container-main">{rec.containerType || 'Tube'}</div>
                                                        <div className="scd-specimen-sub">{rec.specimenType || 'Specimen'}</div>
                                                    </td>
                                                    <td>
                                                        <span style={{ color: '#b91c1c', fontWeight: 600 }}>{rec.reason}</span>
                                                        {rec.notes && <div className="scd-patient-meta">{rec.notes}</div>}
                                                    </td>
                                                    <td>
                                                        <div style={{ fontWeight: 600 }}>{rec.requestedByName || 'Lab Staff'}</div>
                                                        <div className="scd-patient-meta">{formatDateTime(rec.createdAt)}</div>
                                                    </td>
                                                    <td>
                                                        <span className={`scd-status-pill ${rec.status === 'RECOLLECTED' ? 'scd-pill-collected' : 'scd-pill-correction'}`}>
                                                            {rec.status === 'RECOLLECTED' ? 'Recollected' : 'Pending Redraw'}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        {rec.status !== 'RECOLLECTED' ? (
                                                            <button
                                                                type="button"
                                                                className="scd-btn scd-btn-collect"
                                                                onClick={() => handleRecollectDraw(rec)}
                                                            >
                                                                <FiRotateCcw size={13} /> Recollect &amp; Label
                                                            </button>
                                                        ) : (
                                                            <span style={{ fontSize: '12px', color: '#15803d', fontWeight: 700 }}>
                                                                Completed
                                                            </span>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )
                        )}
                    </div>
                </>
            )}

            {/* =====================================================================
                MODAL 1: CONFIRM SPECIMEN COLLECTION & GENERATE BARCODE
               ===================================================================== */}
            {collectModal.open && collectModal.item && (
                <div className="scd-modal-backdrop" role="dialog" aria-modal="true" aria-label="Confirm Specimen Collection">
                    <div className="scd-modal-card">
                        <div className="scd-modal-header">
                            <h3 className="scd-modal-title">
                                <ConicalFlaskIcon size={18} /> Confirm Specimen Collection
                            </h3>
                            <button
                                type="button"
                                className="scd-modal-close"
                                onClick={() => setCollectModal({ open: false, item: null })}
                                aria-label="Close modal"
                            >
                                <FiX />
                            </button>
                        </div>

                        <form onSubmit={handleConfirmCollection}>
                            <div className="scd-modal-body">
                                <div className="scd-summary-banner">
                                    <div>
                                        <span className="scd-summary-item-label">Patient &amp; MRN</span>
                                        <span className="scd-summary-item-val">
                                            {collectModal.item.patientSnapshot?.name || 'Registered Patient'} ({collectModal.item.patientSnapshot?.mrn || collectModal.item.patientSnapshot?.uhid || 'N/A'})
                                        </span>
                                    </div>
                                    <div>
                                        <span className="scd-summary-item-label">Order Number</span>
                                        <span className="scd-summary-item-val">
                                            {collectModal.item.orderNumber} &bull; {collectModal.item.priority || 'Routine'}
                                        </span>
                                    </div>
                                    <div>
                                        <span className="scd-summary-item-label">Container &amp; Specimen</span>
                                        <span className="scd-summary-item-val">
                                            {collectModal.item.containerType} &bull; {collectModal.item.specimenType} ({collectModal.item.tubeLabel || 'Tube 1/1'})
                                        </span>
                                    </div>
                                    <div>
                                        <span className="scd-summary-item-label">Required Tests</span>
                                        <span className="scd-summary-item-val">
                                            {(collectModal.item.testsList || []).join(', ') || 'Prescribed Assay'}
                                        </span>
                                    </div>
                                </div>

                                <div className="scd-form-grid-2">
                                    <div className="scd-field">
                                        <label htmlFor="scd-collected-at">Collection Date &amp; Time *</label>
                                        <input
                                            id="scd-collected-at"
                                            type="datetime-local"
                                            className="scd-input"
                                            value={collectForm.collectedAt}
                                            onChange={(e) => setCollectForm((p) => ({ ...p, collectedAt: e.target.value }))}
                                            required
                                        />
                                    </div>
                                    <div className="scd-field">
                                        <label htmlFor="scd-collected-by">Collected By</label>
                                        <input
                                            id="scd-collected-by"
                                            type="text"
                                            className="scd-input"
                                            value={userName}
                                            readOnly
                                            style={{ background: '#f8fafc', color: '#475569' }}
                                        />
                                    </div>
                                </div>

                                <div className="scd-field">
                                    <label htmlFor="scd-collected-vol">Collected Specimen Volume *</label>
                                    <input
                                        id="scd-collected-vol"
                                        type="text"
                                        className="scd-input"
                                        value={collectForm.collectedVolume}
                                        onChange={(e) => setCollectForm((p) => ({ ...p, collectedVolume: e.target.value }))}
                                        placeholder="e.g. 3 mL"
                                        required
                                    />
                                </div>

                                <div className="scd-field">
                                    <label htmlFor="scd-collect-notes">Collection Notes &amp; Sample Details</label>
                                    <textarea
                                        id="scd-collect-notes"
                                        rows={2}
                                        className="scd-textarea"
                                        value={collectForm.collectionNotes}
                                        onChange={(e) => setCollectForm((p) => ({ ...p, collectionNotes: e.target.value }))}
                                        placeholder="Venipuncture site, fasting confirmation, specimen appearance..."
                                    />
                                </div>

                                <label className="scd-checkbox-row">
                                    <input
                                        type="checkbox"
                                        checked={collectForm.labelConfirmedAttached}
                                        onChange={(e) => setCollectForm((p) => ({ ...p, labelConfirmedAttached: e.target.checked }))}
                                    />
                                    <span>
                                        Confirm patient identity &amp; specimen container match, and generate printable Code 128 barcode label
                                    </span>
                                </label>
                            </div>

                            <div className="scd-modal-footer">
                                <button
                                    type="button"
                                    className="scd-btn"
                                    onClick={() => setCollectModal({ open: false, item: null })}
                                    disabled={submittingCollect}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="scd-btn scd-btn-collect"
                                    disabled={submittingCollect}
                                >
                                    <FiCheckCircle size={14} />
                                    <span>{submittingCollect ? 'Recording Collection...' : 'Mark Collected & Print Label'}</span>
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* =====================================================================
                MODAL 2: DISPATCH / SEND SAMPLE TO PROCESSING LABORATORY
               ===================================================================== */}
            {dispatchModal.open && dispatchModal.sample && (
                <div className="scd-modal-backdrop" role="dialog" aria-modal="true" aria-label="Send Sample to Laboratory">
                    <div className="scd-modal-card">
                        <div className="scd-modal-header">
                            <h3 className="scd-modal-title">
                                <FiSend size={17} style={{ color: '#2563eb' }} /> Send Sample to Processing Laboratory
                            </h3>
                            <button
                                type="button"
                                className="scd-modal-close"
                                onClick={() => setDispatchModal({ open: false, sample: null })}
                                aria-label="Close modal"
                            >
                                <FiX />
                            </button>
                        </div>

                        <form onSubmit={handleConfirmDispatch}>
                            <div className="scd-modal-body">
                                <div className="scd-summary-banner">
                                    <div>
                                        <span className="scd-summary-item-label">Sample Barcode</span>
                                        <span className="scd-summary-item-val" style={{ color: '#2563eb', fontFamily: 'monospace' }}>
                                            {dispatchModal.sample.barcode}
                                        </span>
                                    </div>
                                    <div>
                                        <span className="scd-summary-item-label">Patient</span>
                                        <span className="scd-summary-item-val">
                                            {dispatchModal.sample.patientSnapshot?.name} ({dispatchModal.sample.patientSnapshot?.mrn || dispatchModal.sample.patientSnapshot?.uhid || 'N/A'})
                                        </span>
                                    </div>
                                    <div>
                                        <span className="scd-summary-item-label">Container / Specimen</span>
                                        <span className="scd-summary-item-val">
                                            {dispatchModal.sample.containerType} &bull; {dispatchModal.sample.specimenType}
                                        </span>
                                    </div>
                                    <div>
                                        <span className="scd-summary-item-label">Collected At</span>
                                        <span className="scd-summary-item-val">
                                            {formatDateTime(dispatchModal.sample.collectedAt)}
                                        </span>
                                    </div>
                                </div>

                                <div className="scd-form-grid-2">
                                    <div className="scd-field">
                                        <label htmlFor="scd-courier-name">Runner / Courier Name</label>
                                        <input
                                            id="scd-courier-name"
                                            type="text"
                                            className="scd-input"
                                            value={dispatchForm.courierName}
                                            onChange={(e) => setDispatchForm((p) => ({ ...p, courierName: e.target.value }))}
                                            placeholder="Internal Laboratory Runner"
                                        />
                                    </div>
                                    <div className="scd-field">
                                        <label htmlFor="scd-transport-ref">Carrier / Tray Reference</label>
                                        <input
                                            id="scd-transport-ref"
                                            type="text"
                                            className="scd-input"
                                            value={dispatchForm.transportReference}
                                            onChange={(e) => setDispatchForm((p) => ({ ...p, transportReference: e.target.value }))}
                                            placeholder="Optional tray / box code"
                                        />
                                    </div>
                                </div>

                                <div className="scd-field">
                                    <label htmlFor="scd-dispatch-notes">Transfer / Chain-of-Custody Remarks</label>
                                    <textarea
                                        id="scd-dispatch-notes"
                                        rows={2}
                                        className="scd-textarea"
                                        value={dispatchForm.notes}
                                        onChange={(e) => setDispatchForm((p) => ({ ...p, notes: e.target.value }))}
                                        placeholder="Optional handover notes for the Lab Technician..."
                                    />
                                </div>
                            </div>

                            <div className="scd-modal-footer">
                                <button
                                    type="button"
                                    className="scd-btn"
                                    onClick={() => setDispatchModal({ open: false, sample: null })}
                                    disabled={submittingDispatch}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="scd-btn scd-btn-dispatch"
                                    disabled={submittingDispatch}
                                >
                                    <FiSend size={13} />
                                    <span>{submittingDispatch ? 'Dispatching...' : 'Dispatch to Laboratory'}</span>
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* =====================================================================
                MODAL 3: SAMPLE DETAILS & CHAIN-OF-CUSTODY TIMELINE (Info)
               ===================================================================== */}
            {infoModal.open && infoModal.item && (
                <div className="scd-modal-backdrop" role="dialog" aria-modal="true" aria-label="Sample Details and Custody History">
                    <div className="scd-modal-card">
                        <div className="scd-modal-header">
                            <h3 className="scd-modal-title">
                                <FiInfo size={18} style={{ color: '#2563eb' }} /> Specimen &amp; Order Details
                            </h3>
                            <button
                                type="button"
                                className="scd-modal-close"
                                onClick={() => setInfoModal({ open: false, item: null, history: [], loadingHistory: false })}
                                aria-label="Close modal"
                            >
                                <FiX />
                            </button>
                        </div>

                        <div className="scd-modal-body">
                            <div className="scd-summary-banner">
                                <div>
                                    <span className="scd-summary-item-label">Barcode</span>
                                    <span className="scd-summary-item-val" style={{ color: '#2563eb', fontFamily: 'monospace' }}>
                                        {infoModal.item.barcode || 'Pending Barcode Generation'}
                                    </span>
                                </div>
                                <div>
                                    <span className="scd-summary-item-label">Order Number</span>
                                    <span className="scd-summary-item-val">
                                        {infoModal.item.orderNumber || '—'} ({infoModal.item.priority || 'Routine'})
                                    </span>
                                </div>
                                <div>
                                    <span className="scd-summary-item-label">Patient</span>
                                    <span className="scd-summary-item-val">
                                        {infoModal.item.patientSnapshot?.name || 'Patient'} &bull; MRN: {infoModal.item.patientSnapshot?.mrn || infoModal.item.patientSnapshot?.uhid || 'N/A'}
                                    </span>
                                </div>
                                <div>
                                    <span className="scd-summary-item-label">Demographics</span>
                                    <span className="scd-summary-item-val">
                                        {infoModal.item.patientSnapshot?.gender || '—'} / {infoModal.item.patientSnapshot?.age ?? '—'} Yrs &bull; {infoModal.item.patientSnapshot?.phone || '—'}
                                    </span>
                                </div>
                                <div>
                                    <span className="scd-summary-item-label">Container &amp; Specimen</span>
                                    <span className="scd-summary-item-val">
                                        {infoModal.item.containerType} &bull; {infoModal.item.specimenType} ({infoModal.item.collectedVolume || infoModal.item.requiredVolume || '2-3 mL'})
                                    </span>
                                </div>
                                <div>
                                    <span className="scd-summary-item-label">Current Workflow Stage</span>
                                    <span className="scd-summary-item-val">
                                        {String(infoModal.item.status || '').replace(/_/g, ' ')}
                                    </span>
                                </div>
                                {infoModal.item.collectedAt && (
                                    <div>
                                        <span className="scd-summary-item-label">Collected Record</span>
                                        <span className="scd-summary-item-val">
                                            {formatDateTime(infoModal.item.collectedAt)} by {infoModal.item.collectedByName || 'Collector'}
                                        </span>
                                    </div>
                                )}
                                {infoModal.item.processing?.analyzerReference && (
                                    <div>
                                        <span className="scd-summary-item-label">Bench / Analyzer</span>
                                        <span className="scd-summary-item-val">
                                            {infoModal.item.processing.analyzerReference}
                                        </span>
                                    </div>
                                )}
                            </div>

                            {infoModal.item.collectionNotes && (
                                <div style={{ fontSize: '12.5px', color: '#334155', background: '#f8fafc', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                    <strong>Collection Notes:</strong> {infoModal.item.collectionNotes}
                                </div>
                            )}

                            <div>
                                <div style={{ fontSize: '12px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', marginBottom: '8px' }}>
                                    Chain-of-Custody Audit Trail
                                </div>
                                {infoModal.loadingHistory ? (
                                    <div style={{ fontSize: '13px', color: '#64748b' }}>Loading custody timeline...</div>
                                ) : infoModal.history.length === 0 ? (
                                    <div style={{ fontSize: '13px', color: '#64748b' }}>
                                        Specimen awaiting initial collection &amp; barcode activation.
                                    </div>
                                ) : (
                                    <div className="scd-timeline-list">
                                        {infoModal.history.map((h) => (
                                            <div key={h._id} className="scd-timeline-item">
                                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                                                    <strong style={{ color: '#0f172a' }}>{String(h.action || h.newStatus).replace(/_/g, ' ')}</strong>
                                                    <span style={{ color: '#64748b', fontSize: '11.5px' }}>{formatDateTime(h.timestamp)}</span>
                                                </div>
                                                <div style={{ color: '#475569', marginTop: '3px', fontSize: '12px' }}>
                                                    By {h.performedByName || 'Lab Staff'}
                                                    {h.details?.transferNumber ? ` • Transfer ${h.details.transferNumber}` : ''}
                                                    {h.details?.analyzerReference ? ` • ${h.details.analyzerReference}` : ''}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="scd-modal-footer">
                            {infoModal.item.barcode && (
                                <button
                                    type="button"
                                    className="scd-btn"
                                    onClick={() => {
                                        const target = infoModal.item;
                                        setInfoModal({ open: false, item: null, history: [], loadingHistory: false });
                                        handleOpenBarcodeLabel(target);
                                    }}
                                >
                                    <FiPrinter size={13} /> Print Label
                                </button>
                            )}
                            <button
                                type="button"
                                className="scd-btn scd-btn-dispatch"
                                onClick={() => setInfoModal({ open: false, item: null, history: [], loadingHistory: false })}
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* =====================================================================
                MODAL 4: PRINTABLE CODE 128 BARCODE LABEL
               ===================================================================== */}
            {barcodeModal.open && barcodeModal.data && (
                <LabBarcodeModal
                    labelData={barcodeModal.data}
                    onClose={() => setBarcodeModal({ open: false, data: null })}
                    onReprinted={() => fetchAllData(false)}
                />
            )}
        </div>
    );
};

export default LabCollectionDashboard;
