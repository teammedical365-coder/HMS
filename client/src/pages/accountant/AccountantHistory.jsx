import React, { useState, useEffect, useCallback } from 'react';
import { accountantAPI } from '../../utils/api';
import { FiRefreshCw, FiUser, FiHash, FiCheck, FiX } from 'react-icons/fi';
import './AccountantDashboard.css';

const formatCurrency = (amount) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 }).format(amount || 0);
const formatDateTime = (d) => d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

const STATUS_BADGE = {
    REFUNDED: 'acc-badge-refunded',
    REJECTED: 'acc-badge-rejected',
    CANCELLED: 'acc-badge-cancelled',
};

const AccountantHistory = () => {
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [pagination, setPagination] = useState({ page: 1, limit: 30, total: 0, totalPages: 0 });
    const [dateFilter, setDateFilter] = useState({ startDate: '', endDate: '' });
    const [selectedDetail, setSelectedDetail] = useState(null);

    const loadHistory = useCallback(async (page = 1) => {
        try {
            setLoading(true);
            const params = { page, limit: 30 };
            if (dateFilter.startDate) params.startDate = dateFilter.startDate;
            if (dateFilter.endDate) params.endDate = dateFilter.endDate;
            const res = await accountantAPI.getHistory(params);
            if (res.success) {
                setHistory(res.data.history);
                setPagination(res.data.pagination);
            }
        } catch (err) {
            console.error('Load history error:', err);
        } finally {
            setLoading(false);
        }
    }, [dateFilter]);

    useEffect(() => { loadHistory(1); }, [loadHistory]);

    return (
        <div className="acc-history-page">
            <div className="acc-header-section">
                <div className="acc-header-text">
                    <h1>
                        Refund History
                        <span className="acc-header-tag">Audit Trail</span>
                    </h1>
                    <p>Complete audit trail of all refund transactions</p>
                </div>
                <button className="acc-refresh-btn" onClick={() => loadHistory(pagination.page)} title="Refresh">
                    <FiRefreshCw size={15} className={loading ? 'acc-spinning' : ''} /> Refresh
                </button>
            </div>

            {/* Date Filter */}
            <div className="acc-card" style={{ padding: '12px 18px' }}>
                <div className="acc-filter-bar">
                    <span style={{ fontWeight: 600, fontSize: '0.88rem', color: '#475569' }}>Date Range:</span>
                    <input type="date" value={dateFilter.startDate} onChange={e => setDateFilter(f => ({ ...f, startDate: e.target.value }))} />
                    <span style={{ color: '#94a3b8' }}>to</span>
                    <input type="date" value={dateFilter.endDate} onChange={e => setDateFilter(f => ({ ...f, endDate: e.target.value }))} />
                    <button className="acc-btn acc-btn-sm" onClick={() => setDateFilter({ startDate: '', endDate: '' })}>Clear</button>
                </div>
            </div>

            {/* History Table */}
            <div className="acc-card">
                {loading ? (
                    <div className="acc-loading" style={{ minHeight: 200 }}><div className="acc-loading-spinner" /></div>
                ) : history.length === 0 ? (
                    <div className="acc-empty">
                        <div className="acc-empty-icon">📜</div>
                        <h3>No refund history</h3>
                        <p>Completed, rejected, and cancelled refunds will appear here</p>
                    </div>
                ) : (
                    <>
                        <div className="acc-table-wrap">
                            <table className="acc-table">
                                <thead>
                                    <tr>
                                        <th>Patient</th>
                                        <th>MRN</th>
                                        <th>Refund Amount</th>
                                        <th>Mode</th>
                                        <th>Status</th>
                                        <th>Requested By</th>
                                        <th>Approved / Rejected By</th>
                                        <th>Processed / Handed Over By</th>
                                        <th>Refund Ref</th>
                                        <th>Completed At</th>
                                        <th>Details</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {history.map(r => (
                                        <tr key={r._id}>
                                            <td><div className="acc-patient-cell"><FiUser size={14} />{r.patientName || '—'}</div></td>
                                            <td><span className="acc-mrn"><FiHash size={12} />{r.patientMRN || '—'}</span></td>
                                            <td className="acc-amount">{formatCurrency(r.refundAmount)}</td>
                                            <td>{r.refundMode}</td>
                                            <td><span className={`acc-badge ${STATUS_BADGE[r.status] || 'acc-badge-default'}`}>{r.status}</span></td>
                                            <td>{r.requestedByName || '—'}</td>
                                            <td>{r.status === 'REJECTED' ? (r.rejectedByName || '—') : (r.approvedByName || '—')}</td>
                                            <td>{r.handedOverByName || r.processedByName || '—'}</td>
                                            <td style={{ fontSize: '0.8rem', color: '#64748b' }}>{r.refundTransactionId || '—'}</td>
                                            <td style={{ whiteSpace: 'nowrap' }}>{formatDateTime(r.processedAt || r.handedOverAt || r.rejectedAt || r.updatedAt)}</td>
                                            <td>
                                                <button className="acc-btn acc-btn-sm" onClick={() => setSelectedDetail(r)}>View</button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {pagination.totalPages > 1 && (
                            <div className="acc-pagination">
                                <button disabled={pagination.page <= 1} onClick={() => loadHistory(pagination.page - 1)}>Previous</button>
                                <span>Page {pagination.page} of {pagination.totalPages} ({pagination.total} records)</span>
                                <button disabled={pagination.page >= pagination.totalPages} onClick={() => loadHistory(pagination.page + 1)}>Next</button>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Detail Modal */}
            {selectedDetail && (
                <div className="acc-modal-overlay" onClick={() => setSelectedDetail(null)}>
                    <div className="acc-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 620 }}>
                        <h2>Refund Details</h2>
                        <div className="acc-modal-summary">
                            <div className="acc-modal-summary-row"><span>Patient</span><span>{selectedDetail.patientName}</span></div>
                            <div className="acc-modal-summary-row"><span>MRN</span><span>{selectedDetail.patientMRN}</span></div>
                            <div className="acc-modal-summary-row"><span>Refund Amount</span><span style={{ color: '#dc2626', fontWeight: 700 }}>{formatCurrency(selectedDetail.refundAmount)}</span></div>
                            <div className="acc-modal-summary-row"><span>Refund Mode</span><span>{selectedDetail.refundMode}</span></div>
                            <div className="acc-modal-summary-row"><span>Status</span><span className={`acc-badge ${STATUS_BADGE[selectedDetail.status] || ''}`}>{selectedDetail.status}</span></div>
                        </div>

                        <h3 style={{ fontSize: '0.95rem', fontWeight: 700, margin: '16px 0 10px' }}>Financial Snapshot</h3>
                        <div className="acc-modal-summary">
                            <div className="acc-modal-summary-row"><span>Original Payment</span><span>{formatCurrency(selectedDetail.originalPaymentAmount)}</span></div>
                            <div className="acc-modal-summary-row"><span>Total Charges</span><span>{formatCurrency(selectedDetail.totalCharges)}</span></div>
                            <div className="acc-modal-summary-row"><span>Total Paid</span><span>{formatCurrency(selectedDetail.totalPaid)}</span></div>
                            <div className="acc-modal-summary-row"><span>Already Refunded</span><span>{formatCurrency(selectedDetail.alreadyRefunded)}</span></div>
                            <div className="acc-modal-summary-row"><span>Reason</span><span>{selectedDetail.reason || '—'}</span></div>
                        </div>

                        <h3 style={{ fontSize: '0.95rem', fontWeight: 700, margin: '16px 0 10px' }}>Timeline</h3>
                        <div className="acc-modal-summary">
                            <div className="acc-modal-summary-row"><span>Requested By</span><span>{selectedDetail.requestedByName} — {formatDateTime(selectedDetail.requestedAt)}</span></div>
                            {selectedDetail.approvedByName && <div className="acc-modal-summary-row"><span>Approved By</span><span>{selectedDetail.approvedByName} — {formatDateTime(selectedDetail.approvedAt)}</span></div>}
                            {selectedDetail.rejectedByName && <div className="acc-modal-summary-row"><span>Rejected By</span><span>{selectedDetail.rejectedByName} — {formatDateTime(selectedDetail.rejectedAt)}</span></div>}
                            {selectedDetail.rejectionReason && <div className="acc-modal-summary-row"><span>Rejection Reason</span><span>{selectedDetail.rejectionReason}</span></div>}
                            {selectedDetail.processedByName && <div className="acc-modal-summary-row"><span>Processed By</span><span>{selectedDetail.processedByName} — {formatDateTime(selectedDetail.processedAt)}</span></div>}
                            {selectedDetail.handedOverByName && <div className="acc-modal-summary-row"><span>Cash Handed Over By</span><span>{selectedDetail.handedOverByName} — {formatDateTime(selectedDetail.handedOverAt)}</span></div>}
                            {selectedDetail.originalTransactionId && <div className="acc-modal-summary-row"><span>Original Txn ID</span><span>{selectedDetail.originalTransactionId}</span></div>}
                            {selectedDetail.refundTransactionId && <div className="acc-modal-summary-row"><span>Refund Txn ID / UTR</span><span>{selectedDetail.refundTransactionId}</span></div>}
                            {selectedDetail.processingNotes && <div className="acc-modal-summary-row"><span>Processing Notes</span><span>{selectedDetail.processingNotes}</span></div>}
                        </div>

                        <div className="acc-modal-actions">
                            <button className="acc-btn acc-btn-primary" onClick={() => setSelectedDetail(null)}>Close</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AccountantHistory;
