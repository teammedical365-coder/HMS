import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { accountantAPI, billingAPI } from '../../utils/api';
import { FiDollarSign, FiCalendar, FiClock, FiTrendingUp, FiArrowDownCircle, FiSearch, FiRefreshCw, FiUser, FiHash } from 'react-icons/fi';
import socket from '../../utils/socket';
import './AccountantDashboard.css';

const formatCurrency = (amount) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 }).format(amount || 0);
const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const formatDateTime = (d) => d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

const AccountantDashboard = () => {
    const navigate = useNavigate();
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [billingSearch, setBillingSearch] = useState('');
    const [billingSearching, setBillingSearching] = useState(false);
    const [billingError, setBillingError] = useState('');

    const loadDashboard = useCallback(async () => {
        try {
            setLoading(true);
            setError('');
            const res = await accountantAPI.getDashboard();
            if (res.success) setStats(res.data);
        } catch (err) {
            console.error('Dashboard load error:', err);
            setError('Failed to load dashboard data');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadDashboard();
    }, [loadDashboard]);

    // Real-time updates
    useEffect(() => {
        const handleRefundUpdate = () => loadDashboard();
        socket.on('refund_requested', handleRefundUpdate);
        socket.on('refund_approved', handleRefundUpdate);
        socket.on('refund_completed', handleRefundUpdate);
        socket.on('refund_rejected', handleRefundUpdate);
        return () => {
            socket.off('refund_requested', handleRefundUpdate);
            socket.off('refund_approved', handleRefundUpdate);
            socket.off('refund_completed', handleRefundUpdate);
            socket.off('refund_rejected', handleRefundUpdate);
        };
    }, [loadDashboard]);

    const handleBillingSearch = async (e) => {
        e.preventDefault();
        if (!billingSearch.trim()) return;
        setBillingSearching(true);
        setBillingError('');
        try {
            const res = await billingAPI.getPatientBills(billingSearch.trim());
            if (res.success) {
                navigate(`/billing/patient?q=${encodeURIComponent(billingSearch.trim())}`);
            }
        } catch (err) {
            setBillingError(err.response?.data?.message || 'Patient not found');
        } finally {
            setBillingSearching(false);
        }
    };

    const getStatusBadge = (status) => {
        const map = {
            'Paid': 'acc-badge-paid', 'paid': 'acc-badge-paid', 'PAID': 'acc-badge-paid',
            'Pending': 'acc-badge-pending', 'pending': 'acc-badge-pending', 'PENDING': 'acc-badge-pending',
            'Partial': 'acc-badge-partial',
        };
        return <span className={`acc-badge ${map[status] || 'acc-badge-default'}`}>{status}</span>;
    };

    if (loading) {
        return (
            <div className="acc-loading">
                <div className="acc-loading-spinner" />
                <p>Loading financial data...</p>
            </div>
        );
    }

    return (
        <div className="acc-dashboard">
            {/* Header */}
            <div className="acc-header-section">
                <div className="acc-header-text">
                    <h1>
                        Accountant Dashboard
                        <span className="acc-header-tag">Live Treasury</span>
                    </h1>
                    <p>Hospital financial overview &amp; real-time collections</p>
                </div>
                <button className="acc-refresh-btn" onClick={loadDashboard} title="Refresh Data">
                    <FiRefreshCw size={15} className={loading ? 'acc-spinning' : ''} /> Refresh
                </button>
            </div>

            {error && <div className="acc-error-banner">{error}</div>}

            {/* KPI Cards */}
            {stats && (
                <div className="acc-kpi-row">
                    <div className="acc-kpi acc-kpi-green" onClick={() => navigate('/accountant/financial-records')}>
                        <div className="acc-kpi-icon-wrap"><FiDollarSign size={24} /></div>
                        <div className="acc-kpi-data">
                            <span className="acc-kpi-value">{formatCurrency(stats.todayCollection)}</span>
                            <span className="acc-kpi-label">Today's Collection</span>
                            <span className="acc-kpi-sub">{stats.todayCount} transactions</span>
                        </div>
                    </div>

                    <div className="acc-kpi acc-kpi-blue" onClick={() => navigate('/accountant/financial-records')}>
                        <div className="acc-kpi-icon-wrap"><FiCalendar size={24} /></div>
                        <div className="acc-kpi-data">
                            <span className="acc-kpi-value">{formatCurrency(stats.monthCollection)}</span>
                            <span className="acc-kpi-label">This Month</span>
                            <span className="acc-kpi-sub">{stats.monthCount} transactions</span>
                        </div>
                    </div>

                    <div className="acc-kpi acc-kpi-amber">
                        <div className="acc-kpi-icon-wrap"><FiClock size={24} /></div>
                        <div className="acc-kpi-data">
                            <span className="acc-kpi-value">{formatCurrency(stats.pendingAmount)}</span>
                            <span className="acc-kpi-label">Pending Amount</span>
                            <span className="acc-kpi-sub">{stats.pendingCount} pending</span>
                        </div>
                    </div>

                    <div className="acc-kpi acc-kpi-purple">
                        <div className="acc-kpi-icon-wrap"><FiTrendingUp size={24} /></div>
                        <div className="acc-kpi-data">
                            <span className="acc-kpi-value">{formatCurrency(stats.totalCollection)}</span>
                            <span className="acc-kpi-label">Total Collection</span>
                        </div>
                    </div>

                    <div className="acc-kpi acc-kpi-red" onClick={() => navigate('/accountant/refunds')}>
                        <div className="acc-kpi-icon-wrap"><FiArrowDownCircle size={24} /></div>
                        <div className="acc-kpi-data">
                            <span className="acc-kpi-value">{formatCurrency(stats.totalRefunded)}</span>
                            <span className="acc-kpi-label">Refunds</span>
                            {stats.pendingRefunds > 0 && <span className="acc-kpi-sub acc-kpi-alert">₹{stats.pendingRefunds.toLocaleString()} pending</span>}
                        </div>
                    </div>
                </div>
            )}

            {/* Quick Billing Search */}
            <div className="acc-card acc-search-card">
                <h3><FiSearch size={18} /> Patient Billing Lookup</h3>
                <form onSubmit={handleBillingSearch} className="acc-search-form">
                    <input
                        type="text"
                        placeholder="Search by Phone / MRN / Patient ID..."
                        value={billingSearch}
                        onChange={e => { setBillingSearch(e.target.value); setBillingError(''); }}
                        className="acc-search-input"
                    />
                    <button type="submit" disabled={billingSearching} className="acc-btn acc-btn-primary">
                        {billingSearching ? 'Searching...' : 'View Bills'}
                    </button>
                    <button type="button" onClick={() => navigate('/billing/patient')} className="acc-btn acc-btn-outline">
                        Open Billing
                    </button>
                </form>
                {billingError && <p className="acc-search-error">{billingError}</p>}
            </div>

            {/* Recent Payments Table */}
            {stats?.recentPayments?.length > 0 && (
                <div className="acc-card">
                    <div className="acc-card-header">
                        <h3>Financial Records</h3>
                        <button className="acc-btn acc-btn-sm" onClick={() => navigate('/accountant/financial-records')}>View All</button>
                    </div>
                    <div className="acc-table-wrap">
                        <table className="acc-table">
                            <thead>
                                <tr>
                                    <th>Patient</th>
                                    <th>MRN</th>
                                    <th>Amount</th>
                                    <th>Mode</th>
                                    <th>Status</th>
                                    <th>Date</th>
                                </tr>
                            </thead>
                            <tbody>
                                {stats.recentPayments.map((p, i) => (
                                    <tr key={p._id || i}>
                                        <td>
                                            <div className="acc-patient-cell">
                                                <FiUser size={14} />
                                                <span>{p.patientId?.name || '—'}</span>
                                            </div>
                                        </td>
                                        <td><span className="acc-mrn"><FiHash size={12} />{p.patientId?.patientId || p.patientId?.mrn || '—'}</span></td>
                                        <td className="acc-amount">{formatCurrency(p.amount)}</td>
                                        <td>{p.paymentMode || '—'}</td>
                                        <td>{getStatusBadge(p.paymentStatus)}</td>
                                        <td>{formatDateTime(p.paymentDate)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AccountantDashboard;
