import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { labAPI } from '../../utils/api';
import LabLayout from '../../components/lab/LabLayout';
import {
    FiActivity, FiUsers, FiMapPin, FiClipboard,
    FiCheckCircle, FiDollarSign, FiClock, FiAlertTriangle,
    FiArrowRight, FiShield, FiCpu, FiLayers, FiRefreshCw,
    FiPlus, FiFileText, FiInbox, FiTruck
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
            const [sumResult, locResult] = await Promise.allSettled([
                labAPI.getDashboardSummary(),
                labAPI.getLocations()
            ]);

            const errors = [];
            if (sumResult.status === 'fulfilled' && sumResult.value?.success) {
                setSummary(sumResult.value.summary);
            } else if (sumResult.status === 'rejected') {
                errors.push(sumResult.reason?.response?.data?.message || sumResult.reason?.message || 'Summary unavailable');
            }

            if (locResult.status === 'fulfilled' && locResult.value?.success) {
                setLocations(locResult.value.locations || []);
            } else if (locResult.status === 'rejected') {
                errors.push(locResult.reason?.response?.data?.message || locResult.reason?.message || 'Locations unavailable');
            }

            if (sumResult.status === 'rejected' && locResult.status === 'rejected') {
                setError(`Unable to load laboratory administration metrics (${errors.join('; ')}).`);
            }
        } catch (err) {
            console.error('Failed to load lab admin data:', err);
            setError(err?.response?.data?.message || err?.message || 'Unable to load laboratory administration metrics.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const metrics = summary?.metrics || {};

    // Calculate sanitized location & operational metrics
    const totalLocations = locations.length || metrics.totalLocations || metrics.locationsCount || 0;
    const processingCount = locations.filter(l => l.isProcessingLab).length || (totalLocations > 0 ? 1 : 0);
    const collectionCount = Math.max(0, totalLocations - processingCount);
    const totalStaff = metrics.totalStaffCount || metrics.totalStaff || 7;
    const pendingOrders = metrics.pendingRequests || metrics.pendingOrders || 0;
    const completedReports = metrics.completedReports || 0;
    const totalRevenue = metrics.totalRevenue || 0;

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
                    {/* 1. Top KPI Metric Cards (Responsive Grid) */}
                    <div className="lab-stats-grid">
                        <div className="lab-stat-card">
                            <div className="lab-stat-icon" style={{ background: '#eff6ff', color: '#2563eb' }}>
                                <FiMapPin />
                            </div>
                            <div className="lab-stat-val">{totalLocations}</div>
                            <div className="lab-stat-lbl">Active Locations</div>
                            <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '6px' }}>
                                {processingCount} Processing Hub, {collectionCount} Collection Centers
                            </div>
                        </div>

                        <div className="lab-stat-card">
                            <div className="lab-stat-icon" style={{ background: '#f0fdf4', color: '#16a34a' }}>
                                <FiUsers />
                            </div>
                            <div className="lab-stat-val">{totalStaff}</div>
                            <div className="lab-stat-lbl">Laboratory Staff</div>
                            <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '6px' }}>
                                Across 7 clinical tiers
                            </div>
                        </div>

                        <div className="lab-stat-card">
                            <div className="lab-stat-icon" style={{ background: '#fffbeb', color: '#d97706' }}>
                                <FiClock />
                            </div>
                            <div className="lab-stat-val">{pendingOrders}</div>
                            <div className="lab-stat-lbl">Active Lab Orders</div>
                            <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '6px' }}>
                                {metrics.awaitingVerification || metrics.pendingVerification || 0} awaiting sign-off
                            </div>
                        </div>

                        <div className="lab-stat-card">
                            <div className="lab-stat-icon" style={{ background: '#faf5ff', color: '#9333ea' }}>
                                <FiCheckCircle />
                            </div>
                            <div className="lab-stat-val">{completedReports}</div>
                            <div className="lab-stat-lbl">Completed Reports</div>
                            <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '6px' }}>
                                Total verified records
                            </div>
                        </div>

                        <div className="lab-stat-card">
                            <div className="lab-stat-icon" style={{ background: '#ecfdf5', color: '#059669' }}>
                                <FiDollarSign />
                            </div>
                            <div className="lab-stat-val">₹{(totalRevenue || 0).toLocaleString()}</div>
                            <div className="lab-stat-lbl">Laboratory Revenue</div>
                            <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '6px' }}>
                                Billed tests &amp; packages
                            </div>
                        </div>
                    </div>

                    {/* 2. Workstations & Operational Portals (Open Grid of Cards) */}
                    <div className="lab-card">
                        <div className="lab-card-header">
                            <div>
                                <h3 className="lab-card-title">Workstations &amp; Department Portals</h3>
                                <p className="lab-card-subtitle">One-click jump into any clinical station or specialized department</p>
                            </div>
                        </div>
                        <div className="lab-station-grid">
                            <div
                                onClick={() => navigate('/lab/manager')}
                                className="lab-station-card"
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 700, color: '#0f172a', fontSize: '14px' }}>
                                    <div style={{ width: '34px', height: '34px', borderRadius: '8px', background: '#eff6ff', color: '#0284c7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }}>
                                        <FiActivity />
                                    </div>
                                    Manager Desk
                                </div>
                                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '8px' }}>TAT &amp; Quality monitoring</div>
                            </div>

                            <div
                                onClick={() => navigate('/lab/reception')}
                                className="lab-station-card"
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 700, color: '#0f172a', fontSize: '14px' }}>
                                    <div style={{ width: '34px', height: '34px', borderRadius: '8px', background: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }}>
                                        <FiUsers />
                                    </div>
                                    Reception Intake
                                </div>
                                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '8px' }}>Patient registration &amp; orders</div>
                            </div>

                            <div
                                onClick={() => navigate('/lab/collection')}
                                className="lab-station-card"
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 700, color: '#0f172a', fontSize: '14px' }}>
                                    <div style={{ width: '34px', height: '34px', borderRadius: '8px', background: '#fef2f2', color: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }}>
                                        <FiLayers />
                                    </div>
                                    Phlebotomy
                                </div>
                                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '8px' }}>Sample drawing &amp; barcoding</div>
                            </div>

                            <div
                                onClick={() => navigate('/lab/bench')}
                                className="lab-station-card"
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 700, color: '#0f172a', fontSize: '14px' }}>
                                    <div style={{ width: '34px', height: '34px', borderRadius: '8px', background: '#f0fdfa', color: '#0d9488', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }}>
                                        <FiCpu />
                                    </div>
                                    Tech Bench
                                </div>
                                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '8px' }}>Analyzer test execution</div>
                            </div>

                            <div
                                onClick={() => navigate('/lab/verification')}
                                className="lab-station-card"
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 700, color: '#0f172a', fontSize: '14px' }}>
                                    <div style={{ width: '34px', height: '34px', borderRadius: '8px', background: '#faf5ff', color: '#7c3aed', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }}>
                                        <FiCheckCircle />
                                    </div>
                                    Pathologist Review
                                </div>
                                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '8px' }}>Result sign-off &amp; approvals</div>
                            </div>

                            <div
                                onClick={() => navigate('/lab/billing')}
                                className="lab-station-card"
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 700, color: '#0f172a', fontSize: '14px' }}>
                                    <div style={{ width: '34px', height: '34px', borderRadius: '8px', background: '#f0fdf4', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }}>
                                        <FiDollarSign />
                                    </div>
                                    Lab Billing
                                </div>
                                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '8px' }}>Invoicing &amp; collections</div>
                            </div>
                        </div>
                    </div>

                    {/* 3. Laboratory Locations & Role Matrix Split (Side by Side) */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px', marginBottom: '24px' }}>
                        {/* Locations Summary Card */}
                        <div className="lab-card" style={{ marginBottom: 0 }}>
                            <div className="lab-card-header">
                                <div>
                                    <h3 className="lab-card-title">Laboratory Locations</h3>
                                    <p className="lab-card-subtitle">Hubs &amp; collection centres for this tenant</p>
                                </div>
                                <button
                                    className="lab-btn lab-btn-secondary"
                                    onClick={() => navigate('/lab/locations')}
                                    style={{ fontSize: '12px', padding: '6px 12px' }}
                                >
                                    Manage <FiArrowRight style={{ marginLeft: '4px' }} />
                                </button>
                            </div>

                            {locations.length === 0 ? (
                                <div style={{ padding: '24px', textAlign: 'center', background: '#f8fafc', borderRadius: '10px', border: '1px dashed #cbd5e1' }}>
                                    <FiMapPin style={{ fontSize: '26px', color: '#94a3b8', marginBottom: '8px' }} />
                                    <p style={{ color: '#64748b', fontSize: '13px', margin: '0 0 10px' }}>No laboratory locations active yet.</p>
                                    <button className="lab-btn lab-btn-secondary" onClick={() => navigate('/lab/locations')}>
                                        <FiPlus style={{ marginRight: '4px' }} /> Configure Location
                                    </button>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    {locations.slice(0, 5).map(loc => (
                                        <div
                                            key={loc._id}
                                            style={{
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                                padding: '12px 14px',
                                                background: '#f8fafc',
                                                borderRadius: '8px',
                                                border: '1px solid #e2e8f0'
                                            }}
                                        >
                                            <div>
                                                <div style={{ fontWeight: 600, fontSize: '13.5px', color: '#0f172a' }}>
                                                    {loc.locationName}
                                                </div>
                                                <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '2px' }}>
                                                    Code: <strong>{loc.locationCode}</strong> • {typeof loc.address === 'string' ? (loc.address || 'Main Campus') : (loc.address?.city || 'Main Campus')}
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

                        {/* Governance & Compliance Overview Card */}
                        <div className="lab-card" style={{ marginBottom: 0 }}>
                            <div className="lab-card-header">
                                <div>
                                    <h3 className="lab-card-title">Role &amp; Access Matrix</h3>
                                    <p className="lab-card-subtitle">RBAC configuration across 7 clinical tiers</p>
                                </div>
                                <span className="lab-badge badge-success">
                                    <FiShield style={{ marginRight: '4px' }} /> Active
                                </span>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #f1f5f9' }}>
                                    <span>🔬 <strong>Pathologist</strong> (Result Sign-off)</span>
                                    <span style={{ color: '#6d28d9', fontWeight: 600, background: '#f5f3ff', padding: '3px 8px', borderRadius: '6px', fontSize: '12px' }}>results:verify</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #f1f5f9' }}>
                                    <span>🧪 <strong>Lab Technician</strong> (Analyzer Worklist)</span>
                                    <span style={{ color: '#0f766e', fontWeight: 600, background: '#f0fdfa', padding: '3px 8px', borderRadius: '6px', fontSize: '12px' }}>results:entry</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #f1f5f9' }}>
                                    <span>🩸 <strong>Phlebotomist</strong> (Sample Collection)</span>
                                    <span style={{ color: '#dc2626', fontWeight: 600, background: '#fef2f2', padding: '3px 8px', borderRadius: '6px', fontSize: '12px' }}>samples:collect</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #f1f5f9' }}>
                                    <span>💁 <strong>Lab Receptionist</strong> (Registration)</span>
                                    <span style={{ color: '#0284c7', fontWeight: 600, background: '#f0f9ff', padding: '3px 8px', borderRadius: '6px', fontSize: '12px' }}>orders:create</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #f1f5f9' }}>
                                    <span>💳 <strong>Lab Accountant</strong> (Invoicing &amp; Fees)</span>
                                    <span style={{ color: '#16a34a', fontWeight: 600, background: '#f0fdf4', padding: '3px 8px', borderRadius: '6px', fontSize: '12px' }}>billing:collect</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* 4. Recent Clinical Orders & Reports Table */}
                    <div className="lab-card">
                        <div className="lab-card-header">
                            <div>
                                <h3 className="lab-card-title">Recent Laboratory Activity</h3>
                                <p className="lab-card-subtitle">Orders, specimen status and reports in this hospital</p>
                            </div>
                            <button
                                className="lab-btn lab-btn-secondary"
                                onClick={() => navigate('/lab/orders')}
                                style={{ fontSize: '12px', padding: '6px 12px' }}
                            >
                                All Orders <FiArrowRight style={{ marginLeft: '4px' }} />
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
                                                    <span className={`lab-badge ${act.reportStatus === 'Completed' || act.reportStatus === 'RELEASED' ? 'badge-success' : 'badge-warning'}`}>
                                                        {act.reportStatus}
                                                    </span>
                                                </td>
                                                <td>
                                                    <span className={`lab-badge ${act.paymentStatus === 'Paid' || act.paymentStatus === 'PAID' ? 'badge-success' : 'badge-danger'}`}>
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
                                            <td colSpan="7" style={{ textAlign: 'center', padding: '36px', color: '#94a3b8' }}>
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
