import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { labAPI } from '../../utils/api';
import LabLayout from '../../components/lab/LabLayout';
import {
    FiActivity, FiFileText, FiCheckCircle, FiAlertOctagon,
    FiAlertTriangle, FiClock, FiRefreshCw, FiArrowRight,
    FiFilter, FiLayers, FiCheckSquare, FiGrid
} from 'react-icons/fi';

const LabResultDashboard = () => {
    const navigate = useNavigate();
    const [stats, setStats] = useState(null);
    const [departmentSummary, setDepartmentSummary] = useState([]);
    const [criticalAlerts, setCriticalAlerts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const loadDashboard = async () => {
        setLoading(true);
        setError(null);
        try {
            const [statRes, deptRes, alertRes] = await Promise.all([
                labAPI.results.getDashboardStats(),
                labAPI.results.getDepartmentSummary(),
                labAPI.results.getCriticalAlerts({ alertStatus: 'PENDING' })
            ]);

            if (statRes.success) setStats(statRes.stats);
            if (deptRes.success) setDepartmentSummary(deptRes.summary || []);
            if (alertRes.success) setCriticalAlerts(alertRes.alerts || []);
        } catch (err) {
            console.error('Failed to load result dashboard:', err);
            setError(err.response?.data?.message || err.message || 'Failed to load laboratory result dashboard');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadDashboard();
    }, []);

    const cards = [
        { label: 'Pending Result Entry', value: stats?.pending || 0, icon: <FiClock />, color: '#0284c7', bg: '#f0f9ff', path: '/lab/results/entry?status=PENDING' },
        { label: 'Draft Findings', value: stats?.draft || 0, icon: <FiFileText />, color: '#6366f1', bg: '#eef2ff', path: '/lab/results/entry?status=DRAFT' },
        { label: 'Pending Verification', value: stats?.pendingVerification || 0, icon: <FiCheckSquare />, color: '#d97706', bg: '#fffbeb', path: '/lab/results/verification' },
        { label: 'Correction Requested', value: stats?.correctionRequested || 0, icon: <FiAlertTriangle />, color: '#ea580c', bg: '#fff7ed', path: '/lab/results/entry?status=CORRECTION_REQUESTED' },
        { label: 'Verified & Signed Off', value: stats?.verified || 0, icon: <FiCheckCircle />, color: '#16a34a', bg: '#f0fdf4', path: '/lab/completed' },
        { label: 'Rejected Findings', value: stats?.rejected || 0, icon: <FiAlertOctagon />, color: '#dc2626', bg: '#fef2f2', path: '/lab/results/entry?status=REJECTED' },
        { label: 'Pending Critical Alerts', value: stats?.pendingCriticalAlerts || 0, icon: <FiAlertOctagon />, color: '#b91c1c', bg: '#fee2e2', path: '/lab/results/critical-alerts', alert: true },
        { label: 'Total Diagnostic Tests', value: stats?.total || 0, icon: <FiGrid />, color: '#475569', bg: '#f8fafc', path: '/lab/results/entry' }
    ];

    return (
        <LabLayout
            title="Laboratory Result Management & Medical Sign-Off"
            subtitle="Clinical findings entry, automated reference range evaluation, panic value alerts, and pathologist verification"
            action={
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={loadDashboard} className="lab-btn lab-btn-secondary">
                        <FiRefreshCw style={{ marginRight: '6px' }} />
                        Refresh
                    </button>
                    <Link to="/lab/results/entry" className="lab-btn lab-btn-primary">
                        Technician Result Entry
                    </Link>
                    <Link to="/lab/results/verification" className="lab-btn lab-btn-primary" style={{ background: '#16a34a' }}>
                        Pathologist Verification
                    </Link>
                </div>
            }
        >
            {error && (
                <div className="lab-card" style={{ borderLeft: '4px solid #ef4444', color: '#b91c1c', marginBottom: '20px' }}>
                    <FiAlertTriangle style={{ marginRight: '8px' }} />
                    {error}
                </div>
            )}

            {/* Metric Cards Grid */}
            <div className="lab-stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                {cards.map((c, idx) => (
                    <div
                        key={idx}
                        className="lab-stat-card"
                        onClick={() => navigate(c.path)}
                        style={{ cursor: 'pointer', border: c.alert && c.value > 0 ? '2px solid #ef4444' : '1px solid #e2e8f0' }}
                    >
                        <div className="lab-stat-icon" style={{ background: c.bg, color: c.color }}>
                            {c.icon}
                        </div>
                        <div className="lab-stat-val" style={{ color: c.alert && c.value > 0 ? '#b91c1c' : '#0f172a' }}>
                            {loading ? '...' : c.value}
                        </div>
                        <div className="lab-stat-lbl">{c.label}</div>
                    </div>
                ))}
            </div>

            {/* Active Critical Alerts Notice */}
            {criticalAlerts.length > 0 && (
                <div className="lab-card" style={{ borderLeft: '4px solid #ef4444', background: '#fff1f2', marginBottom: '24px', padding: '16px 20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#991b1b' }}>
                            <FiAlertOctagon style={{ fontSize: '24px' }} />
                            <div>
                                <h4 style={{ margin: 0, fontSize: '15px' }}>
                                    {criticalAlerts.length} Unacknowledged Critical Value Alert{criticalAlerts.length > 1 ? 's' : ''}
                                </h4>
                                <span style={{ fontSize: '12px', color: '#7f1d1d' }}>
                                    Immediate clinical correlation and attending physician notification mandatory.
                                </span>
                            </div>
                        </div>
                        <Link to="/lab/results/critical-alerts" className="lab-btn lab-btn-danger">
                            Open Critical Console <FiArrowRight style={{ marginLeft: '6px' }} />
                        </Link>
                    </div>
                </div>
            )}

            {/* Department Summary & Clinical Queues Split */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '20px' }}>
                {/* Department Workload Summary */}
                <div className="lab-card">
                    <h3 style={{ fontSize: '16px', margin: '0 0 16px 0', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <FiLayers style={{ color: '#0284c7' }} />
                        Departmental Workload Distribution
                    </h3>

                    {loading ? (
                        <div style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
                            <FiRefreshCw className="spin" style={{ fontSize: '24px' }} />
                        </div>
                    ) : departmentSummary.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '30px', color: '#94a3b8' }}>
                            No department workload data available today.
                        </div>
                    ) : (
                        <table className="lab-table" style={{ width: '100%', fontSize: '13px' }}>
                            <thead>
                                <tr>
                                    <th>Department</th>
                                    <th>Total Tests</th>
                                    <th>Pending</th>
                                    <th>Submitted</th>
                                    <th>Verified</th>
                                    <th>Critical</th>
                                </tr>
                            </thead>
                            <tbody>
                                {departmentSummary.map((d, idx) => (
                                    <tr key={idx}>
                                        <td style={{ fontWeight: 600, color: '#1e293b' }}>
                                            {d._id || 'General Pathology'}
                                        </td>
                                        <td><strong>{d.total}</strong></td>
                                        <td>
                                            <span className="lab-badge" style={{ background: '#f0f9ff', color: '#0284c7' }}>
                                                {d.pending}
                                            </span>
                                        </td>
                                        <td>
                                            <span className="lab-badge lab-badge-warning">
                                                {d.submitted}
                                            </span>
                                        </td>
                                        <td>
                                            <span className="lab-badge lab-badge-success">
                                                {d.verified}
                                            </span>
                                        </td>
                                        <td>
                                            {d.critical > 0 ? (
                                                <span className="lab-badge lab-badge-danger">
                                                    {d.critical}
                                                </span>
                                            ) : (
                                                <span style={{ color: '#94a3b8' }}>0</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* Workstation Quick Actions */}
                <div className="lab-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <h3 style={{ fontSize: '16px', margin: 0, color: '#0f172a' }}>
                        Clinical Workstations
                    </h3>

                    <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', background: '#fafafa' }}>
                        <h4 style={{ margin: '0 0 6px 0', fontSize: '14px', color: '#0284c7' }}>
                            🧪 Technician Result Entry Workstation
                        </h4>
                        <p style={{ margin: '0 0 12px 0', fontSize: '12px', color: '#64748b' }}>
                            Enter parameter findings for accepted specimens, auto-calculate physiological reference intervals, and submit for verification.
                        </p>
                        <Link to="/lab/results/entry" className="lab-btn lab-btn-primary" style={{ width: '100%', textAlign: 'center', justifyContent: 'center' }}>
                            Launch Entry Workstation <FiArrowRight style={{ marginLeft: '6px' }} />
                        </Link>
                    </div>

                    <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', background: '#fbfcf8' }}>
                        <h4 style={{ margin: '0 0 6px 0', fontSize: '14px', color: '#16a34a' }}>
                            🩺 Pathologist Medical Sign-Off Console
                        </h4>
                        <p style={{ margin: '0 0 12px 0', fontSize: '12px', color: '#64748b' }}>
                            Review submitted technician results, verify diagnostic findings against clinical history, request corrections, or sign off.
                        </p>
                        <Link to="/lab/results/verification" className="lab-btn lab-btn-primary" style={{ width: '100%', textAlign: 'center', justifyContent: 'center', background: '#16a34a' }}>
                            Launch Verification Console <FiArrowRight style={{ marginLeft: '6px' }} />
                        </Link>
                    </div>

                    <div style={{ border: '1px solid #fee2e2', borderRadius: '8px', padding: '16px', background: '#fff5f5' }}>
                        <h4 style={{ margin: '0 0 6px 0', fontSize: '14px', color: '#dc2626' }}>
                            🚨 Critical Panic Value Console
                        </h4>
                        <p style={{ margin: '0 0 12px 0', fontSize: '12px', color: '#64748b' }}>
                            Track, acknowledge, and audit critical life-threatening findings with attending physician notification logging.
                        </p>
                        <Link to="/lab/results/critical-alerts" className="lab-btn lab-btn-danger" style={{ width: '100%', textAlign: 'center', justifyContent: 'center' }}>
                            Open Critical Alerts <FiArrowRight style={{ marginLeft: '6px' }} />
                        </Link>
                    </div>
                </div>
            </div>
        </LabLayout>
    );
};

export default LabResultDashboard;
