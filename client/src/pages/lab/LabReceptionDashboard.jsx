import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { labAPI } from '../../utils/api';
import LabLayout from '../../components/lab/LabLayout';
import {
    FiInbox, FiUserCheck, FiPrinter, FiDollarSign,
    FiPlusCircle, FiSearch, FiCheckCircle, FiClock,
    FiLayers, FiRefreshCw, FiAlertTriangle
} from 'react-icons/fi';

const LabReceptionDashboard = () => {
    const navigate = useNavigate();
    const [summary, setSummary] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [barcodeModalOrder, setBarcodeModalOrder] = useState(null);

    const loadData = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await labAPI.getDashboardSummary();
            if (res.success) setSummary(res.summary);
        } catch (err) {
            console.error('Failed to load reception data:', err);
            setError('Unable to load reception intake queue.');
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
            title="Reception & Specimen Intake Desk"
            subtitle={`${summary?.labName || 'Central Lab'} — Patient Registration, Order Booking & Barcode Generation`}
        >
            {loading ? (
                <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748b' }}>
                    <FiRefreshCw className="spin" style={{ fontSize: '32px', marginBottom: '12px' }} />
                    <p>Loading intake workstation queue...</p>
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
                    {/* Intake KPI Metrics */}
                    <div className="lab-stats-grid">
                        <div className="lab-stat-card">
                            <div className="lab-stat-icon" style={{ background: '#eff6ff', color: '#2563eb' }}>
                                <FiInbox />
                            </div>
                            <div className="lab-stat-val">{metrics.pendingRequests || 0}</div>
                            <div className="lab-stat-lbl">Today's Intake Orders</div>
                            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                                Registered bookings
                            </div>
                        </div>

                        <div className="lab-stat-card">
                            <div className="lab-stat-icon" style={{ background: '#fef3c7', color: '#d97706' }}>
                                <FiLayers />
                            </div>
                            <div className="lab-stat-val">{metrics.pendingCollection || metrics.pendingRequests || 0}</div>
                            <div className="lab-stat-lbl">Awaiting Phlebotomy</div>
                            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                                Ready for sample drawing
                            </div>
                        </div>

                        <div className="lab-stat-card">
                            <div className="lab-stat-icon" style={{ background: '#f0fdf4', color: '#16a34a' }}>
                                <FiCheckCircle />
                            </div>
                            <div className="lab-stat-val">{metrics.completedReports || 0}</div>
                            <div className="lab-stat-lbl">Delivered Reports</div>
                            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                                Ready for patient collection
                            </div>
                        </div>

                        <div className="lab-stat-card">
                            <div className="lab-stat-icon" style={{ background: '#faf5ff', color: '#9333ea' }}>
                                <FiDollarSign />
                            </div>
                            <div className="lab-stat-val">₹{(metrics.totalRevenue || 0).toLocaleString()}</div>
                            <div className="lab-stat-lbl">Intake Billing Total</div>
                            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                                Payments recorded
                            </div>
                        </div>
                    </div>

                    {/* Reception Quick Action Toolbar */}
                    <div className="lab-card" style={{ marginBottom: '24px' }}>
                        <div className="lab-card-header">
                            <div>
                                <h3 className="lab-card-title">Intake Quick Actions</h3>
                                <p className="lab-card-subtitle">Front desk patient processing & registration</p>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                            <button
                                className="lab-btn lab-btn-primary"
                                onClick={() => navigate('/reception/patients')}
                            >
                                <FiUserCheck style={{ marginRight: '6px' }} /> Patient Directory & Search
                            </button>
                            <button
                                className="lab-btn lab-btn-secondary"
                                onClick={() => navigate('/lab/billing')}
                            >
                                <FiDollarSign style={{ marginRight: '6px' }} /> Collect Fees & Receipts
                            </button>
                            <button
                                className="lab-btn lab-btn-secondary"
                                onClick={() => navigate('/lab/collection')}
                            >
                                <FiLayers style={{ marginRight: '6px' }} /> Phlebotomy Queue
                            </button>
                            <button
                                className="lab-btn lab-btn-secondary"
                                onClick={() => navigate('/lab/completed')}
                            >
                                <FiPrinter style={{ marginRight: '6px' }} /> Print Completed Reports
                            </button>
                        </div>
                    </div>

                    {/* Active Intake & Walk-in Queue */}
                    <div className="lab-card">
                        <div className="lab-card-header">
                            <div>
                                <h3 className="lab-card-title">Patient Intake & Booking Queue</h3>
                                <p className="lab-card-subtitle">Manage registered orders, verify payments and print tube barcode labels</p>
                            </div>
                            <button onClick={loadData} className="lab-btn lab-btn-secondary" style={{ fontSize: '12px', padding: '6px 12px' }}>
                                <FiRefreshCw style={{ marginRight: '6px' }} /> Refresh Queue
                            </button>
                        </div>

                        <div className="lab-table-container">
                            <table className="lab-table">
                                <thead>
                                    <tr>
                                        <th>Patient Info</th>
                                        <th>Prescribed Doctor</th>
                                        <th>Booked Tests</th>
                                        <th>Payment</th>
                                        <th>Specimen Step</th>
                                        <th>Actions</th>
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
                                                    {act.testNames?.length > 0 ? act.testNames.join(', ') : 'Lab Investigation'}
                                                </td>
                                                <td>
                                                    <span className={`lab-badge ${act.paymentStatus === 'Paid' ? 'badge-success' : 'badge-danger'}`}>
                                                        {act.paymentStatus}
                                                    </span>
                                                </td>
                                                <td>
                                                    <span className="lab-badge badge-warning">
                                                        Phlebotomy Pending
                                                    </span>
                                                </td>
                                                <td>
                                                    <div style={{ display: 'flex', gap: '8px' }}>
                                                        <button
                                                            className="lab-btn lab-btn-secondary"
                                                            style={{ fontSize: '11px', padding: '4px 8px' }}
                                                            onClick={() => setBarcodeModalOrder(act)}
                                                        >
                                                            <FiPrinter style={{ marginRight: '4px' }} /> Barcode
                                                        </button>
                                                        <button
                                                            className="lab-btn lab-btn-primary"
                                                            style={{ fontSize: '11px', padding: '4px 8px' }}
                                                            onClick={() => navigate('/lab/collection')}
                                                        >
                                                            Route to Phleb
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr>
                                            <td colSpan="6" style={{ textAlign: 'center', padding: '30px', color: '#94a3b8' }}>
                                                No pending patients in the intake queue.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Barcode Preview Modal */}
                    {barcodeModalOrder && (
                        <div style={{
                            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                            background: 'rgba(15, 23, 42, 0.6)', display: 'flex', alignItems: 'center',
                            justifyContent: 'center', zIndex: 1000
                        }}>
                            <div style={{
                                background: '#fff', borderRadius: '12px', padding: '24px',
                                maxWidth: '440px', width: '90%', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
                            }}>
                                <h3 style={{ margin: '0 0 12px', fontSize: '16px', color: '#0f172a' }}>
                                    Specimen Barcode Label Preview
                                </h3>
                                <div style={{
                                    border: '2px dashed #0284c7', borderRadius: '8px', padding: '16px',
                                    background: '#f8fafc', textAlign: 'center', margin: '16px 0'
                                }}>
                                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#0369a1' }}>
                                        {summary?.hospitalName || 'MEDICAL365'} • LAB
                                    </div>
                                    <div style={{
                                        fontFamily: 'monospace', fontSize: '28px', letterSpacing: '4px',
                                        margin: '12px 0 6px', fontWeight: 'bold'
                                    }}>
                                        ||||| | |||| || |||
                                    </div>
                                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>
                                        LAB-{barcodeModalOrder.id.toString().slice(-6).toUpperCase()}
                                    </div>
                                    <div style={{ fontSize: '12px', color: '#475569', marginTop: '4px' }}>
                                        {barcodeModalOrder.patientName} (MRN: {barcodeModalOrder.patientId})
                                    </div>
                                    <div style={{ fontSize: '11px', color: '#64748b' }}>
                                        {barcodeModalOrder.testNames?.join(', ') || 'Specimen Panel'}
                                    </div>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                                    <button
                                        className="lab-btn lab-btn-secondary"
                                        onClick={() => setBarcodeModalOrder(null)}
                                    >
                                        Close
                                    </button>
                                    <button
                                        className="lab-btn lab-btn-primary"
                                        onClick={() => {
                                            alert(`Barcode LAB-${barcodeModalOrder.id.toString().slice(-6).toUpperCase()} sent to thermal printer.`);
                                            setBarcodeModalOrder(null);
                                        }}
                                    >
                                        <FiPrinter style={{ marginRight: '6px' }} /> Print Label
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </>
            )}
        </LabLayout>
    );
};

export default LabReceptionDashboard;
