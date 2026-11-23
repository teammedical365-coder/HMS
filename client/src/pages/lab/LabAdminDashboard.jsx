import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { labAPI } from '../../utils/api';
import LabLayout from '../../components/lab/LabLayout';
import {
    FiActivity, FiUsers, FiMapPin, FiClipboard,
    FiCheckCircle, FiDollarSign, FiClock, FiAlertTriangle,
    FiArrowRight, FiShield, FiCpu, FiLayers, FiRefreshCw
} from 'react-icons/fi';

const LabAdminDashboard = () => {
    const navigate = useNavigate();
    const [summary, setSummary] = useState(null);
    const [locations, setLocations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const loadData = async () => {
        setLoading(true);
        setError(null);
        try {
            const [sumRes, locRes] = await Promise.all([
                labAPI.getDashboardSummary(),
                labAPI.getLocations()
            ]);
            if (sumRes.success) setSummary(sumRes.summary);
            if (locRes.success) setLocations(locRes.locations || []);
        } catch (err) {
            console.error('Failed to load lab admin data:', err);
            setError('Unable to load laboratory administration metrics.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const metrics = summary?.metrics || {};

    return (
        <LabLayout
            title="Laboratory Administration"
            subtitle={`${summary?.labName || 'Central Lab'} — Operational Governance & Infrastructure`}
        >
            {loading ? (
                <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748b' }}>
                    <FiRefreshCw className="spin" style={{ fontSize: '32px', marginBottom: '12px' }} />
                    <p>Loading laboratory administrative data...</p>
                </div>
            ) : error ? (
                <div className="lab-card" style={{ borderLeft: '4px solid #ef4444', color: '#b91c1c' }}>
                    <FiAlertTriangle style={{ marginRight: '8px' }} />
                    {error}
                    <button onClick={loadData} className="lab-btn lab-btn-secondary" style={{ marginLeft: '16px' }}>
                        Retry
                    </button>
                </div>
            ) : (
                <>
                    {/* Top KPI Cards */}
                    <div className="lab-stats-grid">
                        <div className="lab-stat-card">
                            <div className="lab-stat-icon" style={{ background: '#eff6ff', color: '#2563eb' }}>
                                <FiMapPin />
                            </div>
                            <div className="lab-stat-val">{metrics.locationsCount || locations.length || 0}</div>
                            <div className="lab-stat-lbl">Active Locations</div>
                            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                                {metrics.processingLabsCount || 1} Processing Hub, {(metrics.locationsCount || locations.length) - (metrics.processingLabsCount || 1)} Collection Centers
                            </div>
                        </div>

                        <div className="lab-stat-card">
                            <div className="lab-stat-icon" style={{ background: '#f0fdf4', color: '#16a34a' }}>
                                <FiUsers />
                            </div>
                            <div className="lab-stat-val">{metrics.totalStaffCount || 7}</div>
                            <div className="lab-stat-lbl">Laboratory Staff</div>
                            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                                Across 7 clinical roles
                            </div>
                        </div>

                        <div className="lab-stat-card">
                            <div className="lab-stat-icon" style={{ background: '#fffbeb', color: '#d97706' }}>
                                <FiClock />
                            </div>
                            <div className="lab-stat-val">{metrics.pendingRequests || 0}</div>
                            <div className="lab-stat-lbl">Active Lab Orders</div>
                            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                                {metrics.pendingVerification || 0} awaiting sign-off
                            </div>
                        </div>

                        <div className="lab-stat-card">
                            <div className="lab-stat-icon" style={{ background: '#faf5ff', color: '#9333ea' }}>
                                <FiCheckCircle />
                            </div>
                            <div className="lab-stat-val">{metrics.completedReports || 0}</div>
                            <div className="lab-stat-lbl">Completed Reports</div>
                            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                                Total verified records
                            </div>
                        </div>

                        <div className="lab-stat-card">
                            <div className="lab-stat-icon" style={{ background: '#ecfdf5', color: '#059669' }}>
                                <FiDollarSign />
                            </div>
                            <div className="lab-stat-val">₹{(metrics.totalRevenue || 0).toLocaleString()}</div>
                            <div className="lab-stat-lbl">Laboratory Revenue</div>
                            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                                Billed tests & packages
                            </div>
                        </div>
                    </div>

                    {/* Quick Access Workstations for Lab Admin */}
                    <div className="lab-card" style={{ marginBottom: '24px' }}>
                        <div className="lab-card-header">
                            <div>
                                <h3 className="lab-card-title">Workstations & Department Portals</h3>
                                <p className="lab-card-subtitle">Quick jump to any operational workstation under this laboratory</p>
                            </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                            <div
                                onClick={() => navigate('/lab/manager')}
                                style={{ padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0', cursor: 'pointer', background: '#f8fafc', transition: 'all 0.2s' }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, color: '#0f172a' }}>
                                    <FiActivity style={{ color: '#0284c7' }} /> Manager Desk
                                </div>
                                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>TAT & Quality monitoring</div>
                            </div>

                            <div
                                onClick={() => navigate('/lab/reception')}
                                style={{ padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0', cursor: 'pointer', background: '#f8fafc', transition: 'all 0.2s' }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, color: '#0f172a' }}>
                                    <FiUsers style={{ color: '#2563eb' }} /> Reception Intake
                                </div>
                                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>Patient registration & orders</div>
                            </div>

                            <div
                                onClick={() => navigate('/lab/collection')}
                                style={{ padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0', cursor: 'pointer', background: '#f8fafc', transition: 'all 0.2s' }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, color: '#0f172a' }}>
                                    <FiLayers style={{ color: '#dc2626' }} /> Phlebotomy
                                </div>
                                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>Sample drawing & tube barcoding</div>
                            </div>

                            <div
                                onClick={() => navigate('/lab/bench')}
                                style={{ padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0', cursor: 'pointer', background: '#f8fafc', transition: 'all 0.2s' }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, color: '#0f172a' }}>
                                    <FiCpu style={{ color: '#0d9488' }} /> Tech Bench
                                </div>
                                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>Analyzer test execution</div>
                            </div>

                            <div
                                onClick={() => navigate('/lab/verification')}
                                style={{ padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0', cursor: 'pointer', background: '#f8fafc', transition: 'all 0.2s' }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, color: '#0f172a' }}>
                                    <FiCheckCircle style={{ color: '#7c3aed' }} /> Pathologist Review
                                </div>
                                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>Result sign-off & approvals</div>
                            </div>

                            <div
                                onClick={() => navigate('/lab/billing')}
                                style={{ padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0', cursor: 'pointer', background: '#f8fafc', transition: 'all 0.2s' }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, color: '#0f172a' }}>
                                    <FiDollarSign style={{ color: '#16a34a' }} /> Lab Billing
                                </div>
                                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>Invoicing & collections</div>
                            </div>
                        </div>
                    </div>

                    {/* Locations Grid & Activity Split */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' }}>
                        {/* Locations Summary */}
                        <div className="lab-card">
                            <div className="lab-card-header">
                                <div>
                                    <h3 className="lab-card-title">Laboratory Locations</h3>
                                    <p className="lab-card-subtitle">Hubs & collection centres for this tenant</p>
                                </div>
                                <button
                                    className="lab-btn lab-btn-secondary"
                                    onClick={() => navigate('/lab/locations')}
                                    style={{ fontSize: '12px', padding: '6px 10px' }}
                                >
                                    Manage <FiArrowRight style={{ marginLeft: '4px' }} />
                                </button>
                            </div>

                            {locations.length === 0 ? (
                                <p style={{ color: '#64748b', fontSize: '13px' }}>No locations configured yet.</p>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    {locations.slice(0, 4).map(loc => (
                                        <div
                                            key={loc._id}
                                            style={{
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                                padding: '10px 12px',
                                                background: '#f8fafc',
                                                borderRadius: '6px',
                                                border: '1px solid #e2e8f0'
                                            }}
                                        >
                                            <div>
                                                <div style={{ fontWeight: 600, fontSize: '13px', color: '#0f172a' }}>
                                                    {loc.locationName}
                                                </div>
                                                <div style={{ fontSize: '11px', color: '#64748b' }}>
                                                    Code: <strong>{loc.locationCode}</strong> • {loc.address?.city || 'Main Campus'}
                                                </div>
                                            </div>
                                            <span className={`lab-badge ${loc.isProcessingLab ? 'badge-primary' : 'badge-neutral'}`}>
                                                {loc.locationType}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Governance & Compliance Overview */}
                        <div className="lab-card">
                            <div className="lab-card-header">
                                <div>
                                    <h3 className="lab-card-title">Role & Access Matrix</h3>
                                    <p className="lab-card-subtitle">RBAC configuration across 7 clinical tiers</p>
                                </div>
                                <span className="lab-badge badge-success">
                                    <FiShield style={{ marginRight: '4px' }} /> Active
                                </span>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', background: '#f8fafc', borderRadius: '4px' }}>
                                    <span>🔬 <strong>Pathologist</strong> (Result Sign-off)</span>
                                    <span style={{ color: '#6d28d9', fontWeight: 600 }}>results:verify</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', background: '#f8fafc', borderRadius: '4px' }}>
                                    <span>🧪 <strong>Lab Technician</strong> (Analyzer Worklist)</span>
                                    <span style={{ color: '#0f766e', fontWeight: 600 }}>results:entry</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', background: '#f8fafc', borderRadius: '4px' }}>
                                    <span>🩸 <strong>Phlebotomist</strong> (Sample Collection)</span>
                                    <span style={{ color: '#dc2626', fontWeight: 600 }}>samples:collect</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', background: '#f8fafc', borderRadius: '4px' }}>
                                    <span>💁 <strong>Lab Receptionist</strong> (Registration)</span>
                                    <span style={{ color: '#0284c7', fontWeight: 600 }}>orders:create</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', background: '#f8fafc', borderRadius: '4px' }}>
                                    <span>💳 <strong>Lab Accountant</strong> (Invoicing & Fees)</span>
                                    <span style={{ color: '#16a34a', fontWeight: 600 }}>billing:collect</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Recent Clinical Orders & Reports Table */}
                    <div className="lab-card">
                        <div className="lab-card-header">
                            <div>
                                <h3 className="lab-card-title">Recent Laboratory Activity</h3>
                                <p className="lab-card-subtitle">Orders, specimen status and reports in this hospital</p>
                            </div>
                            <button
                                className="lab-btn lab-btn-secondary"
                                onClick={() => navigate('/lab/tests')}
                                style={{ fontSize: '12px', padding: '6px 12px' }}
                            >
                                All Tests <FiArrowRight style={{ marginLeft: '4px' }} />
                            </button>
                        </div>

                        <div className="lab-table-container">
                            <table className="lab-table">
                                <thead>
                                    <tr>
                                        <th>Patient</th>
                                        <th>Referring Doctor</th>
                                        <th>Tests / Panel</th>
                                        <th>Report Status</th>
                                        <th>Payment</th>
                                        <th>Amount</th>
                                        <th>Date</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {summary?.recentActivity && summary.recentActivity.length > 0 ? (
                                        summary.recentActivity.map(act => (
                                            <tr key={act.id}>
                                                <td>
                                                    <strong>{act.patientName}</strong>
                                                    <div style={{ fontSize: '11px', color: '#64748b' }}>MRN: {act.patientId}</div>
                                                </td>
                                                <td>{act.doctorName}</td>
                                                <td>
                                                    {act.testNames?.length > 0
                                                        ? act.testNames.join(', ')
                                                        : 'General Lab Investigation'}
                                                </td>
                                                <td>
                                                    <span className={`lab-badge ${act.reportStatus === 'Completed' ? 'badge-success' : 'badge-warning'}`}>
                                                        {act.reportStatus}
                                                    </span>
                                                </td>
                                                <td>
                                                    <span className={`lab-badge ${act.paymentStatus === 'Paid' ? 'badge-success' : 'badge-danger'}`}>
                                                        {act.paymentStatus}
                                                    </span>
                                                </td>
                                                <td>₹{(act.amount || 0).toLocaleString()}</td>
                                                <td style={{ fontSize: '12px', color: '#64748b' }}>
                                                    {act.createdAt ? new Date(act.createdAt).toLocaleDateString() : 'Today'}
                                                </td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr>
                                            <td colSpan="7" style={{ textAlign: 'center', padding: '30px', color: '#94a3b8' }}>
                                                No active orders found for this laboratory.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}
        </LabLayout>
    );
};

export default LabAdminDashboard;
