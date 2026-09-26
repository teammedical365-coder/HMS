import React, { useState, useEffect, useCallback } from 'react';
import { accountantAPI } from '../../utils/api';
import { FiUser, FiHash, FiFilter, FiRefreshCw } from 'react-icons/fi';
import './AccountantDashboard.css';

const formatCurrency = (amount) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 }).format(amount || 0);
const formatDateTime = (d) => d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

const AccountantFinancialRecords = () => {
    const [records, setRecords] = useState([]);
    const [loading, setLoading] = useState(true);
    const [pagination, setPagination] = useState({ page: 1, limit: 30, total: 0, totalPages: 0 });
    const [filters, setFilters] = useState({ status: '', paymentMode: '', startDate: '', endDate: '', search: '' });

    const loadRecords = useCallback(async (page = 1) => {
        try {
            setLoading(true);
            const params = { page, limit: 30 };
            if (filters.status) params.status = filters.status;
            if (filters.paymentMode) params.paymentMode = filters.paymentMode;
            if (filters.startDate) params.startDate = filters.startDate;
            if (filters.endDate) params.endDate = filters.endDate;
            if (filters.search) params.search = filters.search;

            const res = await accountantAPI.getFinancialRecords(params);
            if (res.success) {
                setRecords(res.data.records);
                setPagination(res.data.pagination);
            }
        } catch (err) {
            console.error('Load financial records error:', err);
        } finally {
            setLoading(false);
        }
    }, [filters]);

    useEffect(() => { loadRecords(1); }, [loadRecords]);

    const getStatusBadge = (status) => {
        const s = (status || '').toLowerCase();
        const map = { paid: 'acc-badge-paid', pending: 'acc-badge-pending', partial: 'acc-badge-partial', failed: 'acc-badge-rejected', refunded: 'acc-badge-refunded' };
        return <span className={`acc-badge ${map[s] || 'acc-badge-default'}`}>{status}</span>;
    };

    return (
        <div className="acc-financial-records">
            <div className="acc-header-section">
                <div className="acc-header-text">
                    <h1>
                        Financial Records
                        <span className="acc-header-tag">{pagination.total || 0} Transactions</span>
                    </h1>
                    <p>All payment transactions &amp; billing records</p>
                </div>
                <button className="acc-refresh-btn" onClick={() => loadRecords(pagination.page)}>
                    <FiRefreshCw size={15} className={loading ? 'acc-spinning' : ''} /> Refresh
                </button>
            </div>

            {/* Filters */}
            <div className="acc-card" style={{ padding: '14px 18px' }}>
                <div className="acc-filter-bar">
                    <FiFilter size={16} style={{ color: '#64748b' }} />
                    <input
                        type="text"
                        placeholder="Search patient name / phone / MRN..."
                        value={filters.search}
                        onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
                        style={{ flex: 1, minWidth: 180, padding: '8px 12px', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '0.88rem', outline: 'none' }}
                    />
                    <select value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}>
                        <option value="">All Status</option>
                        <option value="PAID">Paid</option>
                        <option value="PENDING">Pending</option>
                        <option value="PARTIAL">Partial</option>
                    </select>
                    <select value={filters.paymentMode} onChange={e => setFilters(f => ({ ...f, paymentMode: e.target.value }))}>
                        <option value="">All Modes</option>
                        <option value="Cash">Cash</option>
                        <option value="UPI">UPI</option>
                        <option value="Card">Card</option>
                        <option value="Bank">Bank Transfer</option>
                        <option value="Split">Split Payment</option>
                    </select>
                    <input type="date" value={filters.startDate} onChange={e => setFilters(f => ({ ...f, startDate: e.target.value }))} />
                    <input type="date" value={filters.endDate} onChange={e => setFilters(f => ({ ...f, endDate: e.target.value }))} />
                    <button className="acc-btn acc-btn-sm" onClick={() => setFilters({ status: '', paymentMode: '', startDate: '', endDate: '', search: '' })}>Clear</button>
                </div>
            </div>

            {/* Records Table */}
            <div className="acc-card">
                {loading ? (
                    <div className="acc-loading" style={{ minHeight: 200 }}>
                        <div className="acc-loading-spinner" />
                    </div>
                ) : records.length === 0 ? (
                    <div className="acc-empty">
                        <div className="acc-empty-icon">📋</div>
                        <h3>No records found</h3>
                        <p>Try adjusting your filters</p>
                    </div>
                ) : (
                    <>
                        <div className="acc-table-wrap">
                            <table className="acc-table">
                                <thead>
                                    <tr>
                                        <th>Patient</th>
                                        <th>MRN</th>
                                        <th>Description</th>
                                        <th>Amount</th>
                                        <th>Mode</th>
                                        <th>Transaction ID</th>
                                        <th>Status</th>
                                        <th>Date</th>
                                        <th>Collected By</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {records.map((r) => (
                                        <tr key={r._id}>
                                            <td>
                                                <div className="acc-patient-cell">
                                                    <FiUser size={14} />
                                                    <span>{r.patientId?.name || '—'}</span>
                                                </div>
                                            </td>
                                            <td><span className="acc-mrn"><FiHash size={12} />{r.patientId?.patientId || r.patientId?.mrn || '—'}</span></td>
                                            <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.description || '—'}</td>
                                            <td className="acc-amount">{formatCurrency(r.amount)}</td>
                                            <td>{r.paymentMode || '—'}</td>
                                            <td style={{ fontSize: '0.8rem', color: '#64748b' }}>{r.transactionId || '—'}</td>
                                            <td>{getStatusBadge(r.paymentStatus)}</td>
                                            <td style={{ whiteSpace: 'nowrap' }}>{formatDateTime(r.paymentDate)}</td>
                                            <td>{r.addedBy?.name || '—'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Pagination */}
                        {pagination.totalPages > 1 && (
                            <div className="acc-pagination">
                                <button disabled={pagination.page <= 1} onClick={() => loadRecords(pagination.page - 1)}>Previous</button>
                                <span>Page {pagination.page} of {pagination.totalPages} ({pagination.total} records)</span>
                                <button disabled={pagination.page >= pagination.totalPages} onClick={() => loadRecords(pagination.page + 1)}>Next</button>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

export default AccountantFinancialRecords;
