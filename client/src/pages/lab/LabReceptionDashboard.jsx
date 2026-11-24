import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { labAPI } from '../../utils/api';
import LabLayout from '../../components/lab/LabLayout';
import toast from 'react-hot-toast';
import {
    FiInbox, FiUserCheck, FiPrinter, FiDollarSign,
    FiPlusCircle, FiSearch, FiCheckCircle, FiClock,
    FiLayers, FiRefreshCw, FiAlertTriangle, FiTag, FiFileText
} from 'react-icons/fi';
import LabOrderSlipModal from './LabOrderSlipModal';

const LabReceptionDashboard = () => {
    const navigate = useNavigate();

    const [recentOrders, setRecentOrders] = useState([]);
    const [recollections, setRecollections] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Quick Patient Search
    const [quickSearch, setQuickSearch] = useState('');
    const [quickSearchResults, setQuickSearchResults] = useState([]);
    const [searching, setSearching] = useState(false);

    // Slip Modal
    const [slipModalOpen, setSlipModalOpen] = useState(false);
    const [selectedOrderForSlip, setSelectedOrderForSlip] = useState(null);
    const [isTokenOnly, setIsTokenOnly] = useState(false);

    const loadData = async () => {
        setLoading(true);
        setError(null);
        try {
            const [ordersResult, recResult] = await Promise.allSettled([
                labAPI.reception.getOrders({ limit: 10 }),
                labAPI.reception.getRecollections()
            ]);

            const errors = [];
            if (ordersResult.status === 'fulfilled' && ordersResult.value?.success) {
                setRecentOrders(ordersResult.value.data || []);
            } else if (ordersResult.status === 'rejected') {
                errors.push(ordersResult.reason?.response?.data?.message || ordersResult.reason?.message || 'Orders unavailable');
            }

            if (recResult.status === 'fulfilled' && recResult.value?.success) {
                setRecollections(recResult.value.data || []);
            } else if (recResult.status === 'rejected') {
                errors.push(recResult.reason?.response?.data?.message || recResult.reason?.message || 'Recollections unavailable');
            }

            if (ordersResult.status === 'rejected' && recResult.status === 'rejected') {
                setError(`Unable to load live reception intake queue (${errors.join('; ')}).`);
            }
        } catch (err) {
            console.error('Failed to load reception data:', err);
            setError(err?.response?.data?.message || err?.message || 'Unable to load live reception intake queue.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    // Quick Search Patient
    const handleQuickSearch = async (val) => {
        setQuickSearch(val);
        if (!val.trim() || val.length < 2) {
            setQuickSearchResults([]);
            return;
        }
        setSearching(true);
        try {
            const res = await labAPI.reception.getPatients({ search: val.trim(), limit: 5 });
            if (res.success) setQuickSearchResults(res.data || []);
        } catch (err) {
            console.error('Quick search error:', err);
        } finally {
            setSearching(false);
        }
    };

    const metrics = {
        totalOrders: recentOrders.length,
        pendingRecollections: recollections.length,
        totalRevenue: recentOrders.reduce((sum, o) => sum + (o.pricing?.netAmount || 0), 0)
    };

    return (
        <LabLayout
            title="Reception &amp; Specimen Intake Desk"
            subtitle="Patient Registration, Clinical Order Booking, Slip/Token Printing &amp; Recollections"
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
                    {/* KPI Metrics */}
                    <div className="lab-stats-grid">
                        <div className="lab-stat-card">
                            <div className="lab-stat-icon" style={{ background: '#eff6ff', color: '#2563eb' }}>
                                <FiInbox />
                            </div>
                            <div className="lab-stat-val">{metrics.totalOrders}</div>
                            <div className="lab-stat-lbl">Active Intake Requisitions</div>
                            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                                Today's registered orders
                            </div>
                        </div>

                        <div className="lab-stat-card">
                            <div className="lab-stat-icon" style={{ background: '#fef3c7', color: '#d97706' }}>
                                <FiLayers />
                            </div>
                            <div className="lab-stat-val">
                                {recentOrders.reduce((sum, o) => sum + (o.samplePlaceholders?.length || 0), 0)}
                            </div>
                            <div className="lab-stat-lbl">Sample Tubes Derived</div>
                            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                                Ready for phlebotomy drawing
                            </div>
                        </div>

                        <div className="lab-stat-card">
                            <div className="lab-stat-icon" style={{ background: '#fee2e2', color: '#dc2626' }}>
                                <FiAlertTriangle />
                            </div>
                            <div className="lab-stat-val">{metrics.pendingRecollections}</div>
                            <div className="lab-stat-lbl">Recollection Requests</div>
                            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                                Rejected samples requiring redrawing
                            </div>
                        </div>

                        <div className="lab-stat-card">
                            <div className="lab-stat-icon" style={{ background: '#f0fdf4', color: '#16a34a' }}>
                                <FiDollarSign />
                            </div>
                            <div className="lab-stat-val">₹{metrics.totalRevenue.toLocaleString()}</div>
                            <div className="lab-stat-lbl">Intake Billing Total</div>
                            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                                Verified server tariff
                            </div>
                        </div>
                    </div>

                    {/* Pending Recollections Alert Banner */}
                    {recollections.length > 0 && (
                        <div className="lab-card" style={{ borderLeft: '4px solid #ef4444', background: '#fef2f2', marginBottom: '24px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div>
                                    <strong style={{ color: '#991b1b', fontSize: '1rem' }}>
                                        ⚠️ {recollections.length} Sample Recollection Request(s) Pending!
                                    </strong>
                                    <p style={{ margin: '4px 0 0', color: '#7f1d1d', fontSize: '0.85rem' }}>
                                        Phlebotomy or technical lab flagged samples that need re-drawing. Please schedule recollections promptly.
                                    </p>
                                </div>
                                <button
                                    className="lab-btn lab-btn-primary"
                                    onClick={() => navigate('/lab/orders')}
                                >
                                    Review Recollections
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Reception Quick Action Toolbar & Search */}
                    <div className="lab-card" style={{ marginBottom: '24px' }}>
                        <div className="lab-card-header">
                            <div>
                                <h3 className="lab-card-title">Front Desk Quick Actions</h3>
                                <p className="lab-card-subtitle">Intake shortcuts for fast patient processing</p>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '20px' }}>
                            <button
                                className="lab-btn lab-btn-primary"
                                onClick={() => navigate('/lab/orders/create')}
                            >
                                <FiPlusCircle style={{ marginRight: '6px' }} /> Book New Investigation Order
                            </button>
                            <button
                                className="lab-btn lab-btn-secondary"
                                onClick={() => navigate('/lab/patients')}
                            >
                                <FiUserCheck style={{ marginRight: '6px' }} /> Patient Directory &amp; Register
                            </button>
                            <button
                                className="lab-btn lab-btn-secondary"
                                onClick={() => navigate('/lab/orders')}
                            >
                                <FiInbox style={{ marginRight: '6px' }} /> All Requisitions &amp; History
                            </button>
                            <button
                                className="lab-btn lab-btn-secondary"
                                onClick={() => navigate('/lab/collection')}
                            >
                                <FiLayers style={{ marginRight: '6px' }} /> Phlebotomy Queue
                            </button>
                        </div>

                        {/* Quick Patient Lookup */}
                        <div style={{ position: 'relative', maxWidth: '600px' }}>
                            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                <FiSearch style={{ position: 'absolute', left: '12px', color: '#94a3b8' }} />
                                <input
                                    type="text"
                                    placeholder="Quick patient lookup (type name, phone, or UHID/MRN)..."
                                    value={quickSearch}
                                    onChange={(e) => handleQuickSearch(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '10px 14px 10px 38px',
                                        borderRadius: '8px',
                                        border: '1px solid #cbd5e1',
                                        fontSize: '0.9rem'
                                    }}
                                />
                                {searching && <FiRefreshCw className="spin" style={{ position: 'absolute', right: '12px', color: '#2563eb' }} />}
                            </div>

                            {quickSearchResults.length > 0 && (
                                <div style={{
                                    position: 'absolute',
                                    top: '100%',
                                    left: 0,
                                    right: 0,
                                    background: '#ffffff',
                                    border: '1px solid #cbd5e1',
                                    borderRadius: '8px',
                                    boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
                                    zIndex: 50,
                                    marginTop: '4px'
                                }}>
                                    {quickSearchResults.map(p => (
                                        <div
                                            key={p._id}
                                            style={{
                                                padding: '10px 14px',
                                                borderBottom: '1px solid #f1f5f9',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center'
                                            }}
                                            onClick={() => navigate(`/lab/orders/create?patientId=${p._id}`)}
                                        >
                                            <div>
                                                <strong>{p.name}</strong> • <span style={{ color: '#2563eb' }}>{p.uhid || p.mrn}</span>
                                                <div style={{ fontSize: '11px', color: '#64748b' }}>📞 {p.phone} • {p.age} Yrs ({p.gender})</div>
                                            </div>
                                            <button className="lab-btn lab-btn-primary" style={{ fontSize: '11px', padding: '4px 8px' }}>
                                                Book Order
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Today's Recent Requisitions Queue */}
                    <div className="lab-card">
                        <div className="lab-card-header">
                            <div>
                                <h3 className="lab-card-title">Recent Laboratory Requisitions</h3>
                                <p className="lab-card-subtitle">Latest booked orders, token sequences and printable slips</p>
                            </div>
                            <button onClick={loadData} className="lab-btn lab-btn-secondary" style={{ fontSize: '12px', padding: '6px 12px' }}>
                                <FiRefreshCw style={{ marginRight: '6px' }} /> Refresh Queue
                            </button>
                        </div>

                        <div className="lab-table-container">
                            <table className="lab-table">
                                <thead>
                                    <tr>
                                        <th>Order No.</th>
                                        <th>Token</th>
                                        <th>Patient Info</th>
                                        <th>Doctor</th>
                                        <th>Investigations</th>
                                        <th>Priority</th>
                                        <th>Tariff (₹)</th>
                                        <th>Status</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {recentOrders.length === 0 ? (
                                        <tr>
                                            <td colSpan="9" style={{ textAlign: 'center', padding: '32px', color: '#64748b' }}>
                                                No orders booked today. Click "Book New Investigation Order" above to begin.
                                            </td>
                                        </tr>
                                    ) : (
                                        recentOrders.map(ord => (
                                            <tr key={ord._id}>
                                                <td style={{ fontWeight: '700', color: '#2563eb' }}>{ord.orderNumber}</td>
                                                <td>
                                                    <span style={{
                                                        background: '#f1f5f9',
                                                        padding: '3px 8px',
                                                        borderRadius: '9999px',
                                                        fontWeight: '700',
                                                        fontSize: '0.85rem'
                                                    }}>
                                                        #{ord.tokenNumber}
                                                    </span>
                                                </td>
                                                <td>
                                                    <strong>{ord.patientSnapshot?.name}</strong>
                                                    <div style={{ fontSize: '11px', color: '#64748b' }}>
                                                        {ord.patientSnapshot?.uhid || ord.patientSnapshot?.mrn} • 📞 {ord.patientSnapshot?.phone}
                                                    </div>
                                                </td>
                                                <td>{ord.referringDoctorName || 'Direct Walk-in'}</td>
                                                <td>
                                                    <div>{ord.tests?.length || 0} Test(s)</div>
                                                    <div style={{ fontSize: '11px', color: '#64748b' }}>
                                                        {ord.samplePlaceholders?.length || 0} Sample Tube(s)
                                                    </div>
                                                </td>
                                                <td>
                                                    <span className={`priority-pill ${ord.priority?.toLowerCase()}`}>
                                                        {ord.priority}
                                                    </span>
                                                </td>
                                                <td style={{ fontWeight: '700' }}>₹{ord.pricing?.netAmount || 0}</td>
                                                <td>
                                                    <span className={`lab-badge ${ord.status === 'Cancelled' ? 'badge-danger' : 'badge-success'}`}>
                                                        {ord.status}
                                                    </span>
                                                </td>
                                                <td>
                                                    <div style={{ display: 'flex', gap: '6px' }}>
                                                        <button
                                                            className="lab-btn lab-btn-secondary"
                                                            style={{ fontSize: '11px', padding: '4px 8px' }}
                                                            title="Print Order Requisition Slip"
                                                            onClick={() => {
                                                                setSelectedOrderForSlip(ord);
                                                                setIsTokenOnly(false);
                                                                setSlipModalOpen(true);
                                                            }}
                                                        >
                                                            <FiPrinter style={{ marginRight: '4px' }} /> Slip
                                                        </button>
                                                        <button
                                                            className="lab-btn lab-btn-secondary"
                                                            style={{ fontSize: '11px', padding: '4px 8px' }}
                                                            title="Print Queue Token Slip"
                                                            onClick={() => {
                                                                setSelectedOrderForSlip(ord);
                                                                setIsTokenOnly(true);
                                                                setSlipModalOpen(true);
                                                            }}
                                                        >
                                                            <FiTag style={{ marginRight: '4px' }} /> Token
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}

            {/* Print Slip Modal */}
            {slipModalOpen && selectedOrderForSlip && (
                <LabOrderSlipModal
                    isOpen={slipModalOpen}
                    onClose={() => setSlipModalOpen(false)}
                    order={selectedOrderForSlip}
                    isTokenOnly={isTokenOnly}
                />
            )}
        </LabLayout>
    );
};

export default LabReceptionDashboard;
