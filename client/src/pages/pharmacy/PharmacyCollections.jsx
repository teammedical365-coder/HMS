import React, { useState, useEffect } from 'react';
import { pharmacyAPI } from '../../utils/api';
import './PharmacyCollections.css';

const PharmacyCollections = () => {
    const [dateRange, setDateRange] = useState('today'); // today, week, month, custom
    const [customStart, setCustomStart] = useState('');
    const [customEnd, setCustomEnd] = useState('');
    const [loading, setLoading] = useState(false);
    const [analytics, setAnalytics] = useState({
        totalSales: 0,
        totalRefunds: 0,
        netRevenue: 0,
        cogs: 0,
        grossProfit: 0,
        cashAmount: 0,
        upiAmount: 0,
        cardAmount: 0,
        doctorGuaranteedAmount: 0,
        topSellingItems: [],
        recentTransactions: []
    });

    useEffect(() => {
        if (dateRange !== 'custom') {
            fetchAnalytics();
        } else if (customStart && customEnd) {
            fetchAnalytics();
        }
    }, [dateRange, customStart, customEnd]);

    const fetchAnalytics = async () => {
        setLoading(true);
        try {
            let start, end;
            const now = new Date();
            
            if (dateRange === 'today') {
                start = new Date(now.setHours(0,0,0,0)).toISOString();
                end = new Date(now.setHours(23,59,59,999)).toISOString();
            } else if (dateRange === 'week') {
                const firstDay = new Date(now.setDate(now.getDate() - now.getDay()));
                start = new Date(firstDay.setHours(0,0,0,0)).toISOString();
                end = new Date().toISOString();
            } else if (dateRange === 'month') {
                const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
                start = new Date(firstDay.setHours(0,0,0,0)).toISOString();
                end = new Date().toISOString();
            } else if (dateRange === 'custom') {
                start = new Date(customStart).toISOString();
                end = new Date(new Date(customEnd).setHours(23,59,59,999)).toISOString();
            }

            const res = await pharmacyAPI.getCollectionsAnalytics(start, end);
            if (res.success) {
                setAnalytics({
                    totalSales: res.summary?.totalGrossSales || 0,
                    totalRefunds: res.summary?.totalReturnsRefunded || 0,
                    netRevenue: res.summary?.netCollection || 0,
                    cogs: res.summary?.cogs || 0,
                    grossProfit: res.summary?.grossProfit || 0,
                    cashAmount: res.summary?.cashAmount || 0,
                    upiAmount: res.summary?.upiAmount || 0,
                    cardAmount: res.summary?.cardAmount || 0,
                    doctorGuaranteedAmount: res.summary?.doctorGuaranteedAmount || 0,
                    topSellingItems: res.topSellingItems || [],
                    recentTransactions: res.recentTransactions || []
                });
            }
        } catch (error) {
            console.error("Failed to load analytics", error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="collections-container">
            <div className="collections-header">
                <h2>📊 Pharmacy Collections & Analytics</h2>
                
                <div className="filters">
                    <select value={dateRange} onChange={(e) => setDateRange(e.target.value)}>
                        <option value="today">Today</option>
                        <option value="week">This Week</option>
                        <option value="month">This Month</option>
                        <option value="custom">Custom Range</option>
                    </select>

                    {dateRange === 'custom' && (
                        <div className="custom-dates">
                            <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} />
                            <span> to </span>
                            <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} />
                        </div>
                    )}
                </div>
            </div>

            {loading ? (
                <div className="loading">Loading Analytics...</div>
            ) : !analytics ? (
                <div className="no-data">No analytics data available.</div>
            ) : (
                <>
                    <div className="kpi-grid">
                        <div className="kpi-card sales">
                            <h3>Total Sales</h3>
                            <div className="kpi-value">₹{(analytics?.totalSales || 0).toFixed(2)}</div>
                            <div className="kpi-subtext" style={{ display: 'flex', gap: '10px', marginTop: '5px', fontSize: '12px' }}>
                                <span>Cash: ₹{(analytics?.cashAmount || 0).toFixed(2)}</span>
                                <span>Online: ₹{((analytics?.upiAmount || 0) + (analytics?.cardAmount || 0)).toFixed(2)}</span>
                            </div>
                        </div>
                        <div className="kpi-card refunds">
                            <h3>Total Refunds</h3>
                            <div className="kpi-value" style={{color: '#ef4444'}}>₹{(analytics?.totalRefunds || 0).toFixed(2)}</div>
                            <div className="kpi-subtext" style={{marginTop: '5px', fontSize: '12px'}}>Dr. Guarantee: ₹{(analytics?.doctorGuaranteedAmount || 0).toFixed(2)}</div>
                        </div>
                        <div className="kpi-card net">
                            <h3>Net Revenue</h3>
                            <div className="kpi-value">₹{(analytics?.netRevenue || 0).toFixed(2)}</div>
                        </div>
                        <div className="kpi-card profit">
                            <h3>Gross Profit</h3>
                            <div className="kpi-value" style={{color: '#10b981'}}>₹{(analytics?.grossProfit || 0).toFixed(2)}</div>
                            <div className="kpi-subtext" style={{marginTop: '5px', fontSize: '12px'}}>COGS: ₹{(analytics?.cogs || 0).toFixed(2)}</div>
                        </div>
                    </div>

                    <div className="charts-section">
                        <div className="chart-card">
                            <h3>Top Selling Items</h3>
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>Medicine Name</th>
                                        <th>Qty Sold</th>
                                        <th>Total Revenue</th>
                                        <th>Sales Volume</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(analytics?.topSellingItems || []).map((item, idx) => {
                                        // Calculate a simple percentage for the progress bar (max relative to highest item, or just arbitrary scale)
                                        const maxQty = Math.max(...(analytics?.topSellingItems || []).map(i => i?.quantity || 0)) || 1;
                                        const percent = ((item?.quantity || 0) / maxQty) * 100;
                                        return (
                                            <tr key={idx}>
                                                <td>{item?.medicineName}</td>
                                                <td>{item?.quantity || 0}</td>
                                                <td>₹{(item?.totalRevenue || 0).toFixed(2)}</td>
                                                <td>
                                                    <div className="progress-bar-container">
                                                        <div className="progress-bar-fill" style={{ width: `${percent}%` }}></div>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {(analytics?.topSellingItems || []).length === 0 && (
                                        <tr><td colSpan="4">No sales data found for this period.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>

                        <div className="chart-card">
                            <h3>Recent Transactions</h3>
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th>Order ID</th>
                                        <th>Type</th>
                                        <th>Amount</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(analytics?.recentTransactions || []).map((tx, idx) => (
                                        <tr key={idx}>
                                            <td>{tx?.createdAt ? new Date(tx.createdAt).toLocaleDateString() : 'N/A'}</td>
                                            <td>{tx?._id}</td>
                                            <td>
                                                <span className={`badge ${tx?.type === 'Sale' ? 'badge-sale' : 'badge-refund'}`}>
                                                    {tx?.type || 'Unknown'}
                                                </span>
                                            </td>
                                            <td style={{ color: tx?.type === 'Refund' ? '#ef4444' : '#10b981', fontWeight: 'bold' }}>
                                                {tx?.type === 'Refund' ? '-' : '+'}₹{(tx?.amount || 0).toFixed(2)}
                                            </td>
                                        </tr>
                                    ))}
                                    {(analytics?.recentTransactions || []).length === 0 && (
                                        <tr><td colSpan="4">No transactions found for this period.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default PharmacyCollections;
