import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { financeAPI, billingAPI } from '../../utils/api';
import './AccountantDashboard.css';

const AccountantDashboard = () => {
    const navigate = useNavigate();
    const currentUser = JSON.parse(localStorage.getItem('user') || '{}');

    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // Quick billing search
    const [billingSearch, setBillingSearch] = useState('');
    const [billingSearching, setBillingSearching] = useState(false);
    const [billingError, setBillingError] = useState('');

    // Filters
    const [datePreset, setDatePreset] = useState('all');
    const [customStartDate, setCustomStartDate] = useState('');
    const [customEndDate, setCustomEndDate] = useState('');

    useEffect(() => {
        // Validate access
        const role = currentUser?.role ? currentUser.role.toLowerCase() : '';
        const permissions = currentUser?.permissions || [];
        const hasAccess = ['accountant', 'centraladmin', 'superadmin', 'hospitaladmin'].includes(role) || permissions.includes('finance_view');

        if (!hasAccess) {
            navigate('/dashboard');
        } else {
            fetchStats('all');
        }
    }, [navigate, currentUser]);

    const fetchStats = async (preset = datePreset, start = customStartDate, end = customEndDate) => {
        try {
            setLoading(true);
            setError('');

            let queryStart = '';
            let queryEnd = '';

            if (preset !== 'all' && preset !== 'custom') {
                const now = new Date();
                const endD = new Date(now);
                const startD = new Date(now);

                if (preset === 'today') {
                    startD.setHours(0, 0, 0, 0);
                    endD.setHours(23, 59, 59, 999);
                } else if (preset === '30') {
                    startD.setDate(startD.getDate() - 30);
                } else if (preset === '60') {
                    startD.setDate(startD.getDate() - 60);
                } else if (preset === '90') {
                    startD.setDate(startD.getDate() - 90);
                }

                queryStart = startD.toISOString();
                queryEnd = endD.toISOString();
            } else if (preset === 'custom') {
                if (start) queryStart = new Date(start).toISOString();
                if (end) queryEnd = new Date(end).toISOString();
            }

            const res = await financeAPI.getDashboardStats(queryStart, queryEnd);
            if (res.success) {
                setStats(res.data);
            }
        } catch (err) {
            console.error(err);
            setError('Error fetching financial statistics');
        } finally {
            setLoading(false);
        }
    };

    const handleDatePresetChange = (preset) => {
        setDatePreset(preset);
        if (preset !== 'custom') {
            fetchStats(preset, customStartDate, customEndDate);
        }
    };

    const handleApplyCustomDate = () => {
        fetchStats('custom', customStartDate, customEndDate);
    };

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

    const handleLogout = () => {
        localStorage.removeItem('user');
        localStorage.removeItem('token');
        navigate('/login');
    };

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            minimumFractionDigits: 0
        }).format(amount || 0);
    };

    return (
        <div className="accountant-dashboard">
            <header className="acc-header">
                <div>
                    <h1>Finance & Accounting Dashboard</h1>
                    <p>Track revenues, costs, and profits across operations</p>
                </div>
                <div className="acc-user-info">
                    <span>👋 {currentUser.name} (Accountant)</span>
                    <button className="logout-btn" onClick={handleLogout}>Logout</button>
                </div>
            </header>

            {/* Patient Billing Quick Access */}
            <div className="admin-card" style={{ marginBottom: '20px', padding: '20px' }}>
                <h3 style={{ margin: '0 0 14px', fontSize: '1rem', fontWeight: 700 }}>🧾 Patient Billing Profile</h3>
                <form onSubmit={handleBillingSearch} style={{ display: 'flex', gap: '10px' }}>
                    <input
                        type="text"
                        placeholder="Search by Phone / MRN / Patient ID..."
                        value={billingSearch}
                        onChange={e => { setBillingSearch(e.target.value); setBillingError(''); }}
                        style={{ flex: 1, padding: '10px 14px', border: '2px solid #e2e8f0', borderRadius: '8px', fontSize: '0.95rem', outline: 'none' }}
                    />
                    <button type="submit" disabled={billingSearching} style={{ padding: '10px 22px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontSize: '0.95rem' }}>
                        {billingSearching ? 'Searching...' : 'View Bills'}
                    </button>
                    <button type="button" onClick={() => navigate('/billing/patient')} style={{ padding: '10px 18px', background: '#f0fdf4', color: '#15803d', border: '1px solid #86efac', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontSize: '0.95rem' }}>
                        Open Billing
                    </button>
                </form>
                {billingError && <p style={{ color: '#dc2626', marginTop: '8px', fontSize: '0.88rem' }}>{billingError}</p>}
            </div>

            <div className="admin-card date-filter-card">
                <h3>📅 Analytics Timeframe</h3>
                <div className="date-filter-controls">
                    <div className="preset-buttons">
                        <button className={datePreset === 'all' ? 'preset-btn active' : 'preset-btn'} onClick={() => handleDatePresetChange('all')}>All Time</button>
                        <button className={datePreset === 'today' ? 'preset-btn active' : 'preset-btn'} onClick={() => handleDatePresetChange('today')}>Today</button>
                        <button className={datePreset === '30' ? 'preset-btn active' : 'preset-btn'} onClick={() => handleDatePresetChange('30')}>Last 30 Days</button>
                        <button className={datePreset === '60' ? 'preset-btn active' : 'preset-btn'} onClick={() => handleDatePresetChange('60')}>Last 60 Days</button>
                        <button className={datePreset === '90' ? 'preset-btn active' : 'preset-btn'} onClick={() => handleDatePresetChange('90')}>Last 90 Days</button>
                    </div>
                    <div className="custom-date-inputs">
                        <input type="date" className="date-input" value={customStartDate} onChange={(e) => { setDatePreset('custom'); setCustomStartDate(e.target.value); }} />
                        <span>to</span>
                        <input type="date" className="date-input" value={customEndDate} onChange={(e) => { setDatePreset('custom'); setCustomEndDate(e.target.value); }} />
                        <button className="btn-save" onClick={handleApplyCustomDate}>Apply Custom</button>
                    </div>
                </div>
            </div>

            {error && <div className="error-message">⚠️ {error}</div>}

            {loading ? (
                <div className="loading-message">⏳ Loading financial data...</div>
            ) : stats ? (
                <>
                    <h2 className="section-title">📊 Overall Financials</h2>
                    <div className="acc-kpi-grid overall-kpi">
                        <div className="acc-kpi-card acc-kpi-green">
                            <div className="acc-kpi-icon">💰</div>
                            <div className="acc-kpi-value">{formatCurrency(stats.totalRevenue)}</div>
                            <div className="acc-kpi-label">Total Revenue</div>
                            <div className="acc-kpi-sub">Gross income received</div>
                        </div>
                        <div className="acc-kpi-card acc-kpi-blue">
                            <div className="acc-kpi-icon">📉</div>
                            <div className="acc-kpi-value">{formatCurrency(stats.medicines.cost)}</div>
                            <div className="acc-kpi-label">Total Costs</div>
                            <div className="acc-kpi-sub">Medicine purchase cost</div>
                        </div>
                        <div className="acc-kpi-card acc-kpi-purple">
                            <div className="acc-kpi-icon">📈</div>
                            <div className="acc-kpi-value">{formatCurrency(stats.totalProfit)}</div>
                            <div className="acc-kpi-label">Net Profit</div>
                            <div className="acc-kpi-sub">Revenue - Internal Costs</div>
                        </div>
                    </div>

                    <h2 className="section-title">🏥 Department Segmentation</h2>
                    <div className="acc-kpi-grid">
                        <div className="acc-kpi-card acc-kpi-teal">
                            <div className="acc-kpi-icon">👨‍⚕️</div>
                            <div className="acc-kpi-value">{formatCurrency(stats.consultations.revenue)}</div>
                            <div className="acc-kpi-label">Consultations</div>
                            <div className="acc-kpi-sub">{stats.consultations.count} Paid Appointments</div>
                        </div>

                        <div className="acc-kpi-card acc-kpi-pink">
                            <div className="acc-kpi-icon">🧪</div>
                            <div className="acc-kpi-value">{formatCurrency(stats.labTests.revenue)}</div>
                            <div className="acc-kpi-label">Lab Tests</div>
                            <div className="acc-kpi-sub">{stats.labTests.count} Paid Reports</div>
                        </div>

                        <div className="acc-kpi-card acc-kpi-orange">
                            <div className="acc-kpi-icon">💊</div>
                            <div className="acc-kpi-value">{formatCurrency(stats.medicines.revenue)}</div>
                            <div className="acc-kpi-label">Pharmacy Gross</div>
                            <div className="acc-kpi-sub">{stats.medicines.count} Prescriptions Sold</div>
                        </div>

                        <div className="acc-kpi-card acc-kpi-magenta" style={{ background: 'linear-gradient(135deg, #10b981, #047857)' }}>
                            <div className="acc-kpi-icon">💸</div>
                            <div className="acc-kpi-value">{formatCurrency(stats.medicines.profit)}</div>
                            <div className="acc-kpi-label">Pharmacy Net Margin</div>
                            <div className="acc-kpi-sub">Medicine profit after buy-cost</div>
                        </div>
                    </div>
                </>
            ) : null}
        </div>
    );
};

export default AccountantDashboard;
