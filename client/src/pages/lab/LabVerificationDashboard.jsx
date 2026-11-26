import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { labAPI } from '../../utils/api';
import { useAuth } from '../../store/hooks';
import { useBranding } from '../../context/BrandingContext';
import LabLayout from '../../components/lab/LabLayout';
import LabResultModal from './LabResultModal';
import {
    FiCheckCircle, FiAlertOctagon, FiClock, FiRefreshCw,
    FiAlertTriangle, FiCheckSquare, FiRotateCcw, FiXCircle,
    FiCalendar, FiArrowRight, FiEye
} from 'react-icons/fi';
import './LabResultEntry.css';

const getTimeGreeting = () => {
    const hr = new Date().getHours();
    if (hr < 12) return 'Good morning';
    if (hr < 17) return 'Good afternoon';
    return 'Good evening';
};

const formatBannerDate = (d) => {
    try {
        return d.toLocaleDateString('en-GB', {
            weekday: 'short',
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });
    } catch (_) {
        return '';
    }
};

const formatSubmissionTime = (val) => {
    if (!val) return '—';
    try {
        return new Date(val).toLocaleString([], {
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch (_) {
        return '—';
    }
};

const LabVerificationDashboard = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const { hospitalName: brandingHospitalName } = useBranding();

    const [stats, setStats] = useState(null);
    const [queue, setQueue] = useState([]);
    const [criticalAlerts, setCriticalAlerts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState(null);
    const [activeResultId, setActiveResultId] = useState(null);

    const loadPathologistData = useCallback(async (isManual = false) => {
        if (isManual) setRefreshing(true);
        else setLoading(true);
        setError(null);

        try {
            const [statsRes, queueRes, alertsRes] = await Promise.all([
                labAPI.results.getDashboardStats(),
                labAPI.results.getVerificationQueue(),
                labAPI.results.getCriticalAlerts({ alertStatus: 'PENDING' })
            ]);

            if (statsRes?.success) setStats(statsRes.stats);
            if (queueRes?.success) setQueue(queueRes.queue || []);
            if (alertsRes?.success) setCriticalAlerts(alertsRes.alerts || []);
        } catch (err) {
            console.error('Failed to load Pathologist dashboard:', err);
            setError(err?.response?.data?.message || err?.message || 'Unable to load Pathologist verification overview.');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        loadPathologistData(false);
    }, [loadPathologistData]);

    const userName = user?.name || 'Pathologist';
    const hospitalLabel = brandingHospitalName || 'Medical 365';

    // Strictly the 6 real database-driven metric cards specified in Part 5B
    const metricCards = [
        {
            label: 'Pending Verification',
            value: stats?.pendingVerification ?? stats?.submitted ?? 0,
            sub: 'Submitted awaiting sign-off',
            icon: <FiClock />,
            iconBg: '#eff6ff',
            iconColor: '#2563eb',
            path: '/lab/results/verification?status=SUBMITTED'
        },
        {
            label: 'Under Review',
            value: stats?.underReview ?? 0,
            sub: 'Active pathologist inspection',
            icon: <FiEye />,
            iconBg: '#f5f3ff',
            iconColor: '#7c3aed',
            path: '/lab/results/verification?status=UNDER_REVIEW'
        },
        {
            label: 'Correction Requested',
            value: stats?.correctionRequested ?? 0,
            sub: 'Sent back to technician bench',
            icon: <FiRotateCcw />,
            iconBg: '#fff7ed',
            iconColor: '#ea580c',
            path: '/lab/results/history?status=CORRECTION_REQUESTED'
        },
        {
            label: 'Critical Alerts',
            value: stats?.criticalAlerts ?? stats?.pendingCriticalAlerts ?? 0,
            sub: 'Unacknowledged panic values',
            icon: <FiAlertOctagon />,
            iconBg: '#fef2f2',
            iconColor: '#dc2626',
            alert: (stats?.criticalAlerts ?? stats?.pendingCriticalAlerts ?? 0) > 0,
            path: '/lab/results/critical-alerts'
        },
        {
            label: 'Verified Today',
            value: stats?.verifiedToday ?? 0,
            sub: `${stats?.verified ?? 0} total verified records`,
            icon: <FiCheckCircle />,
            iconBg: '#ecfdf5',
            iconColor: '#059669',
            path: '/lab/results/history?status=VERIFIED'
        },
        {
            label: 'Rejected Results',
            value: stats?.rejectedResults ?? stats?.rejected ?? 0,
            sub: 'Returned with clinical reason',
            icon: <FiXCircle />,
            iconBg: '#fef2f2',
            iconColor: '#b91c1c',
            path: '/lab/results/history?status=REJECTED'
        }
    ];

    return (
        <LabLayout>
            <div className="lre-page">
                {/* Welcome Banner */}
                <section className="pth-welcome-card">
                    <div>
                        <div className="pth-greeting-row">
                            <h1 className="pth-greeting-title">
                                {getTimeGreeting()}, <span className="pth-greeting-accent">{userName}!</span>
                            </h1>
                            <span className="pth-role-badge">Pathologist</span>
                        </div>
                        <p className="pth-welcome-sub">
                            Welcome back to <strong>{hospitalLabel}</strong>. Review submitted laboratory findings, monitor critical alerts, and authorize diagnostic reports.
                        </p>
                    </div>

                    <div className="pth-welcome-right">
                        <span className="pth-date-pill">
                            <FiCalendar size={13} />
                            <span>{formatBannerDate(new Date())}</span>
                        </span>
                        <button
                            type="button"
                            className="lre-btn lre-btn-secondary"
                            onClick={() => loadPathologistData(true)}
                            disabled={loading || refreshing}
                        >
                            <FiRefreshCw size={14} className={(loading || refreshing) ? 'lre-spin' : ''} />
                            <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
                        </button>
                    </div>
                </section>

                {error && (
                    <div className="lrm-alert-strip lrm-alert-critical" role="alert">
                        <FiAlertTriangle size={17} />
                        <span>{error}</span>
                    </div>
                )}

                {/* 6 Real Database-Driven Overview Cards */}
                <section className="pth-metrics-grid" aria-label="Pathologist Overview Metrics">
                    {metricCards.map((card) => (
                        <div
                            key={card.label}
                            className={`pth-metric-card ${card.alert ? 'alert-active' : ''}`}
                            onClick={() => navigate(card.path)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') navigate(card.path);
                            }}
                        >
                            <div className="pth-metric-top">
                                <span className="pth-metric-label">{card.label}</span>
                                <span
                                    className="pth-metric-icon"
                                    style={{ background: card.iconBg, color: card.iconColor }}
                                >
                                    {card.icon}
                                </span>
                            </div>
                            <div
                                className="pth-metric-value"
                                style={card.alert ? { color: '#dc2626' } : undefined}
                            >
                                {loading ? '...' : card.value}
                            </div>
                            <div className="pth-metric-sub">{card.sub}</div>
                        </div>
                    ))}
                </section>

                {/* Real Database Critical Alerts Banner (Shown ONLY when pending critical alerts exist) */}
                {criticalAlerts.length > 0 && (
                    <section className="lre-critical-banner" role="region" aria-label="Unacknowledged Critical Alerts">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <FiAlertOctagon size={22} style={{ color: '#e11d48', flexShrink: 0 }} />
                            <div>
                                <div style={{ fontWeight: 800, color: '#881337', fontSize: '14px' }}>
                                    {criticalAlerts.length} Unacknowledged Critical Value Alert{criticalAlerts.length > 1 ? 's' : ''} Require Immediate Attention
                                </div>
                                <div style={{ fontSize: '12.5px', color: '#9f1239', marginTop: '2px' }}>
                                    Latest: <strong>{criticalAlerts[0].patientName}</strong> ({criticalAlerts[0].orderNumber}) &mdash;{' '}
                                    {criticalAlerts[0].parameterName}: <strong>{criticalAlerts[0].criticalValue} {criticalAlerts[0].criticalThreshold?.unit || ''}</strong>
                                </div>
                            </div>
                        </div>
                        <button
                            type="button"
                            className="lre-btn lre-btn-danger lre-btn-sm"
                            onClick={() => navigate('/lab/results/critical-alerts')}
                        >
                            <span>Open Critical Alerts</span>
                            <FiArrowRight size={13} />
                        </button>
                    </section>
                )}

                {/* Active Verification Queue Preview Table */}
                <section className="lre-table-card">
                    <div className="lre-card-head">
                        <div>
                            <h2 className="lre-card-title">Pathologist Verification Queue ({queue.length})</h2>
                            <p className="lre-card-sub">
                                Eligible technician-submitted results awaiting clinical verification and sign-off
                            </p>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            <button
                                type="button"
                                className="lre-btn lre-btn-secondary lre-btn-sm"
                                onClick={() => navigate('/lab/results/history')}
                            >
                                Verified Results / History
                            </button>
                            <button
                                type="button"
                                className="lre-btn lre-btn-primary lre-btn-sm"
                                onClick={() => navigate('/lab/results/verification')}
                            >
                                <span>Full Verification Queue</span>
                                <FiArrowRight size={13} />
                            </button>
                        </div>
                    </div>

                    {loading ? (
                        <div className="lre-empty-box">
                            <FiRefreshCw className="lre-spin" size={26} style={{ color: '#2563eb' }} />
                            <h4>Loading Verification Queue...</h4>
                            <p>Retrieving submitted findings from clinical laboratory benches.</p>
                        </div>
                    ) : queue.length === 0 ? (
                        <div className="lre-empty-box">
                            <FiCheckCircle size={36} style={{ color: '#16a34a' }} />
                            <h4>All Submitted Results Verified</h4>
                            <p>No pending laboratory results are currently awaiting Pathologist review.</p>
                        </div>
                    ) : (
                        <div className="lre-table-scroll">
                            <table className="lre-table">
                                <thead>
                                    <tr>
                                        <th>Patient Name / MRN</th>
                                        <th>Order Number</th>
                                        <th>Sample Barcode</th>
                                        <th>Test Name</th>
                                        <th>Department</th>
                                        <th>Technician</th>
                                        <th>Submission Date</th>
                                        <th>Priority</th>
                                        <th>Result Status</th>
                                        <th style={{ textAlign: 'right' }}>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {queue.slice(0, 20).map((item) => {
                                        const mrn = item.patientSnapshot?.mrn || item.patientSnapshot?.uhid || 'N/A';
                                        const isStat = item.priority === 'STAT';

                                        return (
                                            <tr
                                                key={String(item._id)}
                                                className={item.hasCriticalParameters ? 'lre-row-critical' : isStat ? 'lre-row-stat' : ''}
                                            >
                                                <td>
                                                    <div style={{ fontWeight: 800, color: '#0f172a' }}>
                                                        {item.patientSnapshot?.name || 'Registered Patient'}
                                                    </div>
                                                    <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '2px' }}>
                                                        MRN: {mrn} &bull; {item.patientSnapshot?.age ?? '—'}y / {item.patientSnapshot?.gender || '—'}
                                                    </div>
                                                </td>
                                                <td style={{ fontWeight: 700, color: '#334155' }}>
                                                    {item.orderNumber}
                                                </td>
                                                <td>
                                                    <span className="lre-mono">{item.barcode}</span>
                                                </td>
                                                <td>
                                                    <div style={{ fontWeight: 700, color: '#1d4ed8' }}>{item.testName}</div>
                                                    <div style={{ fontSize: '11px', color: '#64748b' }}>{item.testCode}</div>
                                                </td>
                                                <td>{item.department || 'General Pathology'}</td>
                                                <td>{item.submittedByName || item.enteredByName || 'Lab Technician'}</td>
                                                <td style={{ whiteSpace: 'nowrap', fontSize: '12px', color: '#475569' }}>
                                                    {formatSubmissionTime(item.submittedAt || item.updatedAt)}
                                                </td>
                                                <td>
                                                    {isStat ? (
                                                        <span className="lre-badge lre-badge-stat">STAT</span>
                                                    ) : item.priority === 'Urgent' ? (
                                                        <span className="lre-badge lre-badge-urgent">Urgent</span>
                                                    ) : (
                                                        <span className="lre-badge lre-badge-routine">Routine</span>
                                                    )}
                                                </td>
                                                <td>
                                                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                                        <span className={`lre-badge ${item.resultStatus === 'UNDER_REVIEW' ? 'lre-badge-review' : 'lre-badge-submitted'}`}>
                                                            {String(item.resultStatus).replace(/_/g, ' ')}
                                                        </span>
                                                        {item.hasCriticalParameters && (
                                                            <span className="lre-badge lre-badge-critical">CRITICAL</span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td style={{ textAlign: 'right' }}>
                                                    <button
                                                        type="button"
                                                        className={`lre-btn lre-btn-sm ${item.hasCriticalParameters ? 'lre-btn-danger' : 'lre-btn-success'}`}
                                                        onClick={() => setActiveResultId(item._id)}
                                                    >
                                                        <FiCheckSquare size={13} />
                                                        <span>Review &amp; Verify</span>
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>

                {/* Pathologist Review Modal */}
                {activeResultId && (
                    <LabResultModal
                        isOpen={true}
                        onClose={() => setActiveResultId(null)}
                        resultId={activeResultId}
                        mode="verification"
                        onActionSuccess={() => loadPathologistData(true)}
                    />
                )}
            </div>
        </LabLayout>
    );
};

export default LabVerificationDashboard;
