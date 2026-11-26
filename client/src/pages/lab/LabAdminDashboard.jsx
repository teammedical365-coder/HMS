import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../store/hooks';
import { useBranding } from '../../context/BrandingContext';
import { labAPI } from '../../utils/api';
import { useLabAdminSummary } from '../../components/lab/LabAdminShell';
import {
    FiClipboard, FiClock, FiCheckCircle, FiCalendar,
    FiRefreshCw, FiGrid, FiChevronDown, FiUsers,
    FiCpu, FiFileText, FiActivity, FiArrowRight,
    FiAlertTriangle, FiShield
} from 'react-icons/fi';
import './LabAdminDashboard.css';

// Crisp conical laboratory flask SVG icon for Samples Collected & Specimen Pipeline
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

const formatCurrencyINR = (val) => {
    const num = Number(val) || 0;
    return `₹${num.toLocaleString('en-IN')}`;
};

const LabAdminDashboard = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const { hospitalName: brandingHospitalName } = useBranding();
    const shellCtx = useLabAdminSummary();

    // Fallback local state if rendered outside LabAdminShell
    const [localSummary, setLocalSummary] = useState(null);
    const [localLoading, setLocalLoading] = useState(!shellCtx);
    const [localRefreshing, setLocalRefreshing] = useState(false);
    const [localError, setLocalError] = useState(null);

    const [overviewExpanded, setOverviewExpanded] = useState(false);
    const [currentDate, setCurrentDate] = useState(() => new Date());

    const loadStandaloneSummary = useCallback(async (isManual = false) => {
        if (shellCtx) {
            setCurrentDate(new Date());
            return shellCtx.refreshSummary();
        }
        if (isManual) setLocalRefreshing(true);
        else setLocalLoading(true);
        setLocalError(null);
        try {
            const res = await labAPI.getDashboardSummary();
            if (res?.success && res.summary) {
                setLocalSummary(res.summary);
                setCurrentDate(new Date());
            }
        } catch (err) {
            setLocalError(err?.response?.data?.message || err?.message || 'Unable to load laboratory dashboard summary.');
        } finally {
            setLocalLoading(false);
            setLocalRefreshing(false);
        }
    }, [shellCtx]);

    useEffect(() => {
        if (!shellCtx) {
            loadStandaloneSummary(false);
        }
    }, [shellCtx, loadStandaloneSummary]);

    const summary = shellCtx ? shellCtx.summary : localSummary;
    const loading = shellCtx ? shellCtx.loading : localLoading;
    const refreshing = shellCtx ? shellCtx.refreshing : localRefreshing;
    const error = shellCtx ? shellCtx.error : localError;

    const userName = user?.name || 'Administrator';
    const actualHospitalName = (brandingHospitalName && brandingHospitalName !== 'Medical 365')
        ? brandingHospitalName
        : (summary?.hospitalName || brandingHospitalName || 'Medical 365');

    // Real License Check (only renders banner if actual licensing state explicitly reports UNLICENSED)
    const licenseStatus = summary?.license?.status || user?.licenseStatus || null;
    const isUnlicensedReadOnly = licenseStatus === 'UNLICENSED' || user?.isReadOnlyUnlicensed === true;

    // 4 Live Today's Lab Orders Summary KPIs
    const todaySummary = summary?.todaySummary || {};
    const metrics = summary?.metrics || {};

    const todayTotalOrders = todaySummary.todayTotalOrders ?? metrics.todayTotalOrders ?? 0;
    const todayPendingOrders = todaySummary.todayPendingOrders ?? metrics.todayPendingOrders ?? 0;
    const todaySamplesCollected = todaySummary.todaySamplesCollected ?? metrics.todaySamplesCollected ?? 0;
    const todayReportsReleased = todaySummary.todayReportsReleased ?? metrics.todayReportsReleased ?? 0;

    // Comprehensive Live Overview Data (Strictly operational — no Staff metrics)
    const ov = summary?.overview || {};
    const ordersOv = ov.orders || {};
    const patientsOv = ov.patients || {};
    const collectionOv = ov.sampleCollection || {};
    const processingOv = ov.sampleProcessing || {};
    const verificationOv = ov.verification || {};
    const reportsOv = ov.reportsAndCatalog || {};
    const dailyOv = ov.dailyOperations || {};

    return (
        <div className="lad-page">
            {/* Conditional Real License Status Banner (never hardcoded as unlicensed) */}
            {isUnlicensedReadOnly && (
                <div className="lad-license-banner" role="status">
                    <div className="lad-license-left">
                        <FiShield size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
                        <div>
                            <strong>Medical365 Local Edition: UNLICENSED (Read-Only Mode)</strong>{' '}
                            Patient and diagnostic records remain fully accessible for view and printing. Write operations require activation.
                        </div>
                    </div>
                    <button
                        type="button"
                        className="lad-license-activate-btn"
                        onClick={() => navigate('/hospitaladmin/local-sync')}
                    >
                        Activate License
                    </button>
                </div>
            )}

            {/* Error Alert if API fails */}
            {error && (
                <div className="lad-error-banner">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <FiAlertTriangle size={16} />
                        <span>{error}</span>
                    </div>
                    <button type="button" className="lad-refresh-btn" onClick={() => loadStandaloneSummary(true)}>
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
                        <span className="lad-role-pill">Laboratory Administrator</span>
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
                        onClick={() => loadStandaloneSummary(true)}
                        disabled={loading || refreshing}
                    >
                        <FiRefreshCw size={14} className={(loading || refreshing) ? 'lad-spin' : ''} />
                        <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
                    </button>
                </div>
            </section>

            {/* 2. Today's Lab Orders Summary (4 Live Cards) */}
            <section className="lad-summary-section">
                <div className="lad-section-heading-row">
                    <span className="lad-section-heading-icon">
                        <FiClipboard />
                    </span>
                    <h3 className="lad-section-heading">Today&apos;s Lab Orders Summary</h3>
                </div>

                <div className="lad-kpi-grid">
                    {/* Card 1: Today's Total Orders */}
                    <div className="lad-kpi-card">
                        <div className="lad-kpi-top">
                            <span className="lad-kpi-title">Today&apos;s Total Orders</span>
                            <span className="lad-kpi-icon-badge lad-kpi-icon-blue">
                                <FiClipboard />
                            </span>
                        </div>
                        <div className="lad-kpi-value lad-val-blue">
                            {loading ? <span className="lad-skeleton-val" /> : todayTotalOrders}
                        </div>
                        <div className="lad-kpi-desc">Requisitions logged today</div>
                    </div>

                    {/* Card 2: Pending Orders */}
                    <div className="lad-kpi-card">
                        <div className="lad-kpi-top">
                            <span className="lad-kpi-title">Pending Orders</span>
                            <span className="lad-kpi-icon-badge lad-kpi-icon-amber">
                                <FiClock />
                            </span>
                        </div>
                        <div className="lad-kpi-value lad-val-amber">
                            {loading ? <span className="lad-skeleton-val" /> : todayPendingOrders}
                        </div>
                        <div className="lad-kpi-desc">Ordered / in progress today</div>
                    </div>

                    {/* Card 3: Samples Collected */}
                    <div className="lad-kpi-card">
                        <div className="lad-kpi-top">
                            <span className="lad-kpi-title">Samples Collected</span>
                            <span className="lad-kpi-icon-badge lad-kpi-icon-teal">
                                <ConicalFlaskIcon size={17} />
                            </span>
                        </div>
                        <div className="lad-kpi-value lad-val-teal">
                            {loading ? <span className="lad-skeleton-val" /> : todaySamplesCollected}
                        </div>
                        <div className="lad-kpi-desc">Specimens drawn today</div>
                    </div>

                    {/* Card 4: Reports Released */}
                    <div className="lad-kpi-card">
                        <div className="lad-kpi-top">
                            <span className="lad-kpi-title">Reports Released</span>
                            <span className="lad-kpi-icon-badge lad-kpi-icon-green">
                                <FiCheckCircle />
                            </span>
                        </div>
                        <div className="lad-kpi-value lad-val-green">
                            {loading ? <span className="lad-skeleton-val" /> : todayReportsReleased}
                        </div>
                        <div className="lad-kpi-desc">Diagnostic releases today</div>
                    </div>
                </div>
            </section>

            {/* 3. View All Overview — Pull-Down Section */}
            <section className="lad-overview-panel">
                <button
                    type="button"
                    className="lad-overview-trigger"
                    onClick={() => setOverviewExpanded((prev) => !prev)}
                    aria-expanded={overviewExpanded}
                >
                    <div className="lad-overview-left">
                        <div className="lad-overview-grid-badge">
                            <FiGrid />
                        </div>
                        <div>
                            <div className="lad-overview-title-row">
                                <span className="lad-overview-title">View All Overview</span>
                                <span className="lad-overview-hint-pill">
                                    {overviewExpanded ? 'Expanded View' : 'Pull Down to View'}
                                </span>
                            </div>
                            <div className="lad-overview-sub">
                                Click to pull down and inspect full patient, specimen &amp; laboratory metrics
                            </div>
                        </div>
                    </div>

                    <span className="lad-pulldown-btn">
                        <span>{overviewExpanded ? 'Collapse' : 'Pull Down'}</span>
                        <FiChevronDown size={15} className={`lad-chevron ${overviewExpanded ? 'expanded' : ''}`} />
                    </span>
                </button>

                <div className={`lad-overview-collapse ${overviewExpanded ? 'open' : ''}`}>
                    <div className="lad-overview-collapse-inner">
                        <div className="lad-overview-body">
                            {/* 1. Total Orders Overview */}
                            <div className="lad-ov-card">
                                <div className="lad-ov-card-head">
                                    <span className="lad-ov-card-title">
                                        <FiClipboard color="#2563eb" /> Total Orders Overview
                                    </span>
                                    <button type="button" className="lad-ov-link-btn" onClick={() => navigate('/lab/orders')}>
                                        Orders <FiArrowRight size={12} />
                                    </button>
                                </div>
                                <div className="lad-ov-metrics-list">
                                    <div className="lad-ov-metric-box">
                                        <div className="lad-ov-metric-val">{ordersOv.total ?? metrics.totalOrders ?? 0}</div>
                                        <div className="lad-ov-metric-lbl">Total Requisitions</div>
                                    </div>
                                    <div className="lad-ov-metric-box">
                                        <div className="lad-ov-metric-val">{(ordersOv.confirmed ?? 0) + (ordersOv.inProgress ?? 0)}</div>
                                        <div className="lad-ov-metric-lbl">Active / In Progress</div>
                                    </div>
                                    <div className="lad-ov-metric-box">
                                        <div className="lad-ov-metric-val">{ordersOv.completed ?? metrics.completedReports ?? 0}</div>
                                        <div className="lad-ov-metric-lbl">Completed Orders</div>
                                    </div>
                                    <div className="lad-ov-metric-box">
                                        <div className="lad-ov-metric-val">{ordersOv.statUrgent ?? 0}</div>
                                        <div className="lad-ov-metric-lbl">STAT / Urgent Active</div>
                                    </div>
                                </div>
                            </div>

                            {/* 2. Patient Overview */}
                            <div className="lad-ov-card">
                                <div className="lad-ov-card-head">
                                    <span className="lad-ov-card-title">
                                        <FiUsers color="#0284c7" /> Patient Overview
                                    </span>
                                    <button type="button" className="lad-ov-link-btn" onClick={() => navigate('/lab/orders')}>
                                        Orders <FiArrowRight size={12} />
                                    </button>
                                </div>
                                <div className="lad-ov-metrics-list">
                                    <div className="lad-ov-metric-box">
                                        <div className="lad-ov-metric-val">{patientsOv.totalServed ?? 0}</div>
                                        <div className="lad-ov-metric-lbl">Total Patients Served</div>
                                    </div>
                                    <div className="lad-ov-metric-box">
                                        <div className="lad-ov-metric-val">{patientsOv.registeredToday ?? 0}</div>
                                        <div className="lad-ov-metric-lbl">Patients Seen Today</div>
                                    </div>
                                    <div className="lad-ov-metric-box">
                                        <div className="lad-ov-metric-val">{patientsOv.walkInOrders ?? 0}</div>
                                        <div className="lad-ov-metric-lbl">Walk-in Requisitions</div>
                                    </div>
                                    <div className="lad-ov-metric-box">
                                        <div className="lad-ov-metric-val">{patientsOv.homeAndCentreOrders ?? 0}</div>
                                        <div className="lad-ov-metric-lbl">Home / Centre Intake</div>
                                    </div>
                                </div>
                            </div>

                            {/* 3. Sample Collection Overview */}
                            <div className="lad-ov-card">
                                <div className="lad-ov-card-head">
                                    <span className="lad-ov-card-title">
                                        <ConicalFlaskIcon size={15} /> Sample Collection
                                    </span>
                                    <button type="button" className="lad-ov-link-btn" onClick={() => navigate('/lab/collection')}>
                                        Phlebotomy <FiArrowRight size={12} />
                                    </button>
                                </div>
                                <div className="lad-ov-metrics-list">
                                    <div className="lad-ov-metric-box">
                                        <div className="lad-ov-metric-val">{collectionOv.pendingCollection ?? 0}</div>
                                        <div className="lad-ov-metric-lbl">Pending Draw</div>
                                    </div>
                                    <div className="lad-ov-metric-box">
                                        <div className="lad-ov-metric-val">{collectionOv.collectedTotal ?? 0}</div>
                                        <div className="lad-ov-metric-lbl">Total Specimens Drawn</div>
                                    </div>
                                    <div className="lad-ov-metric-box">
                                        <div className="lad-ov-metric-val">{collectionOv.rejectedSamples ?? 0}</div>
                                        <div className="lad-ov-metric-lbl">Rejected Specimens</div>
                                    </div>
                                    <div className="lad-ov-metric-box">
                                        <div className="lad-ov-metric-val">{collectionOv.recollectionPending ?? 0}</div>
                                        <div className="lad-ov-metric-lbl">Recollection Queue</div>
                                    </div>
                                </div>
                            </div>

                            {/* 4. Sample Processing Overview */}
                            <div className="lad-ov-card">
                                <div className="lad-ov-card-head">
                                    <span className="lad-ov-card-title">
                                        <FiCpu color="#0d9488" /> Sample Processing
                                    </span>
                                    <button type="button" className="lad-ov-link-btn" onClick={() => navigate('/lab/bench')}>
                                        Bench <FiArrowRight size={12} />
                                    </button>
                                </div>
                                <div className="lad-ov-metrics-list">
                                    <div className="lad-ov-metric-box">
                                        <div className="lad-ov-metric-val">{processingOv.accessionPending ?? 0}</div>
                                        <div className="lad-ov-metric-lbl">Awaiting Accession</div>
                                    </div>
                                    <div className="lad-ov-metric-box">
                                        <div className="lad-ov-metric-val">{processingOv.acceptedReady ?? 0}</div>
                                        <div className="lad-ov-metric-lbl">Accepted for Bench</div>
                                    </div>
                                    <div className="lad-ov-metric-box">
                                        <div className="lad-ov-metric-val">{processingOv.inAnalyzer ?? 0}</div>
                                        <div className="lad-ov-metric-lbl">In Analyzer Run</div>
                                    </div>
                                    <div className="lad-ov-metric-box">
                                        <div className="lad-ov-metric-val">{processingOv.processingCompleted ?? 0}</div>
                                        <div className="lad-ov-metric-lbl">Bench Completed</div>
                                    </div>
                                </div>
                            </div>

                            {/* 5. Pending Verification & Results */}
                            <div className="lad-ov-card">
                                <div className="lad-ov-card-head">
                                    <span className="lad-ov-card-title">
                                        <FiCheckCircle color="#7c3aed" /> Verification Queue
                                    </span>
                                    <button type="button" className="lad-ov-link-btn" onClick={() => navigate('/lab/results/verification')}>
                                        Review <FiArrowRight size={12} />
                                    </button>
                                </div>
                                <div className="lad-ov-metrics-list">
                                    <div className="lad-ov-metric-box">
                                        <div className="lad-ov-metric-val">{verificationOv.pendingEntry ?? 0}</div>
                                        <div className="lad-ov-metric-lbl">Pending Result Entry</div>
                                    </div>
                                    <div className="lad-ov-metric-box">
                                        <div className="lad-ov-metric-val">{verificationOv.awaitingVerification ?? 0}</div>
                                        <div className="lad-ov-metric-lbl">Pending Sign-Off</div>
                                    </div>
                                    <div className="lad-ov-metric-box">
                                        <div className="lad-ov-metric-val">{verificationOv.verifiedResults ?? 0}</div>
                                        <div className="lad-ov-metric-lbl">Verified Test Results</div>
                                    </div>
                                    <div className="lad-ov-metric-box">
                                        <div className="lad-ov-metric-val">{verificationOv.criticalAlertsOpen ?? 0}</div>
                                        <div className="lad-ov-metric-lbl">Open Critical Alerts</div>
                                    </div>
                                </div>
                            </div>

                            {/* 6. Completed Reports & Test Catalogue */}
                            <div className="lad-ov-card">
                                <div className="lad-ov-card-head">
                                    <span className="lad-ov-card-title">
                                        <FiFileText color="#16a34a" /> Reports &amp; Catalogue
                                    </span>
                                    <button type="button" className="lad-ov-link-btn" onClick={() => navigate('/lab/reports')}>
                                        Reports <FiArrowRight size={12} />
                                    </button>
                                </div>
                                <div className="lad-ov-metrics-list">
                                    <div className="lad-ov-metric-box">
                                        <div className="lad-ov-metric-val">{reportsOv.releasedTotal ?? metrics.completedReports ?? 0}</div>
                                        <div className="lad-ov-metric-lbl">Completed Reports</div>
                                    </div>
                                    <div className="lad-ov-metric-box">
                                        <div className="lad-ov-metric-val">{reportsOv.pendingReviewReports ?? 0}</div>
                                        <div className="lad-ov-metric-lbl">Awaiting Release</div>
                                    </div>
                                    <div className="lad-ov-metric-box">
                                        <div className="lad-ov-metric-val">{reportsOv.activeTests ?? 0}</div>
                                        <div className="lad-ov-metric-lbl">Active Lab Tests</div>
                                    </div>
                                    <div className="lad-ov-metric-box">
                                        <div className="lad-ov-metric-val">{reportsOv.activePackages ?? 0}</div>
                                        <div className="lad-ov-metric-lbl">Diagnostic Packages</div>
                                    </div>
                                </div>
                            </div>

                            {/* 7. Daily Operational Statistics */}
                            <div className="lad-ov-card">
                                <div className="lad-ov-card-head">
                                    <span className="lad-ov-card-title">
                                        <FiActivity color="#0284c7" /> Daily Operational Stats
                                    </span>
                                    <button type="button" className="lad-ov-link-btn" onClick={() => navigate('/lab/billing')}>
                                        Ledger <FiArrowRight size={12} />
                                    </button>
                                </div>
                                <div className="lad-ov-metrics-list">
                                    <div className="lad-ov-metric-box">
                                        <div className="lad-ov-metric-val">{formatCurrencyINR(dailyOv.todayBilledAmount ?? 0)}</div>
                                        <div className="lad-ov-metric-lbl">Billed Today</div>
                                    </div>
                                    <div className="lad-ov-metric-box">
                                        <div className="lad-ov-metric-val">{formatCurrencyINR(dailyOv.todayCollectedAmount ?? 0)}</div>
                                        <div className="lad-ov-metric-lbl">Collected Today</div>
                                    </div>
                                    <div className="lad-ov-metric-box">
                                        <div className="lad-ov-metric-val">{formatCurrencyINR(dailyOv.totalCollectedRevenue ?? metrics.totalRevenue ?? 0)}</div>
                                        <div className="lad-ov-metric-lbl">Cumulative Collections</div>
                                    </div>
                                    <div className="lad-ov-metric-box">
                                        <div className="lad-ov-metric-val">{dailyOv.activeLocations ?? metrics.totalLocations ?? 0}</div>
                                        <div className="lad-ov-metric-lbl">Active Lab Centres</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* 4. Laboratory Specimen Pipeline (Live Stage Flow) */}
            <section className="lad-pipeline-card">
                <div className="lad-pipeline-header">
                    <div className="lad-pipeline-title-wrap">
                        <span className="lad-section-heading-icon">
                            <ConicalFlaskIcon size={17} />
                        </span>
                        <h3 className="lad-section-heading">Laboratory Specimen Pipeline</h3>
                    </div>
                    <span className="lad-pipeline-sub">Real-time specimen progression across clinical stages</span>
                </div>

                <div className="lad-pipeline-grid">
                    <div className="lad-stage-item">
                        <span className="lad-stage-count">{loading ? '—' : (collectionOv.pendingCollection ?? 0)}</span>
                        <span className="lad-stage-label">Pending Collection</span>
                        <span className="lad-stage-desc">Awaiting tube draw</span>
                    </div>
                    <div className="lad-stage-item">
                        <span className="lad-stage-count">{loading ? '—' : (processingOv.accessionPending ?? 0)}</span>
                        <span className="lad-stage-label">Accession Queue</span>
                        <span className="lad-stage-desc">Drawn &amp; barcoded</span>
                    </div>
                    <div className="lad-stage-item">
                        <span className="lad-stage-count">{loading ? '—' : (processingOv.acceptedReady ?? 0)}</span>
                        <span className="lad-stage-label">Accepted at Hub</span>
                        <span className="lad-stage-desc">Ready for bench</span>
                    </div>
                    <div className="lad-stage-item">
                        <span className="lad-stage-count">{loading ? '—' : (processingOv.inAnalyzer ?? 0)}</span>
                        <span className="lad-stage-label">In Processing</span>
                        <span className="lad-stage-desc">Active analyzer run</span>
                    </div>
                    <div className="lad-stage-item">
                        <span className="lad-stage-count">{loading ? '—' : (verificationOv.awaitingVerification ?? 0)}</span>
                        <span className="lad-stage-label">Pending Verification</span>
                        <span className="lad-stage-desc">Pathologist review</span>
                    </div>
                    <div className="lad-stage-item">
                        <span className="lad-stage-count">{loading ? '—' : (reportsOv.releasedTotal ?? metrics.completedReports ?? 0)}</span>
                        <span className="lad-stage-label">Reports Released</span>
                        <span className="lad-stage-desc">Finalized &amp; delivered</span>
                    </div>
                </div>
            </section>
        </div>
    );
};

export default LabAdminDashboard;
