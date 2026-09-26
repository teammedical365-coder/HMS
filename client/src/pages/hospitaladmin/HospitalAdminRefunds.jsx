import React, { useState, useEffect, useCallback } from 'react';
import { refundAdminAPI } from '../../utils/api';
import { 
    FiRefreshCw, FiCheck, FiX, FiClock, FiSearch, FiDollarSign, 
    FiAlertCircle, FiUser, FiHash, FiEye, FiCheckCircle, FiXCircle 
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import socket from '../../utils/socket';
import '../accountant/AccountantDashboard.css';

const formatCurrency = (amount) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 }).format(amount || 0);
const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const formatDateTime = (d) => d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

const HospitalAdminRefunds = () => {
    const [refunds, setRefunds] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [statusFilter, setStatusFilter] = useState('PENDING_APPROVAL');
    const [searchTerm, setSearchTerm] = useState('');
    const [page, setPage] = useState(1);
    const [pagination, setPagination] = useState(null);

    // Modals
    const [selectedRefund, setSelectedRefund] = useState(null);
    const [rejectModal, setRejectModal] = useState(null);
    const [rejectionReason, setRejectionReason] = useState('');
    const [actionLoading, setActionLoading] = useState(false);

    const loadRefunds = useCallback(async () => {
        try {
            setLoading(true);
            setError('');
            const params = { page, limit: 30 };
            if (statusFilter && statusFilter !== 'ALL') {
                params.status = statusFilter;
            }
            const res = await refundAdminAPI.getRefunds(params);
            if (res.success) {
                setRefunds(res.data.refunds || []);
                setPagination(res.data.pagination || null);
            }
        } catch (err) {
            console.error('Error loading refunds for admin:', err);
            setError('Failed to load refund requests');
        } finally {
            setLoading(false);
        }
    }, [statusFilter, page]);

    useEffect(() => {
        loadRefunds();
    }, [loadRefunds]);

    // Real-time socket events
    useEffect(() => {
        const handleNewRefund = (data) => {
            toast((t) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <FiDollarSign color="#d97706" />
                    <span>New refund request of {formatCurrency(data.refundAmount)} for {data.patientName || 'Patient'}</span>
                </div>
            ), { duration: 5000 });
            loadRefunds();
        };

        const handleRefundStatus = () => {
            loadRefunds();
        };

        socket.on('refund_requested', handleNewRefund);
        socket.on('refund_status_updated', handleRefundStatus);
        socket.on('refund_completed', handleRefundStatus);

        return () => {
            socket.off('refund_requested', handleNewRefund);
            socket.off('refund_status_updated', handleRefundStatus);
            socket.off('refund_completed', handleRefundStatus);
        };
    }, [loadRefunds]);

    const handleApprove = async (id) => {
        try {
            setActionLoading(true);
            const res = await refundAdminAPI.approveRefund(id);
            if (res.success) {
                toast.success('Refund request approved successfully!');
                loadRefunds();
                if (selectedRefund?._id === id) {
                    setSelectedRefund(null);
                }
            }
        } catch (err) {
            console.error('Error approving refund:', err);
            toast.error(err.response?.data?.message || 'Failed to approve refund');
        } finally {
            setActionLoading(false);
        }
    };

    const handleRejectSubmit = async (e) => {
        e?.preventDefault();
        if (!rejectModal) return;
        if (!rejectionReason.trim()) {
            toast.error('Please enter a rejection reason');
            return;
        }

        try {
            setActionLoading(true);
            const res = await refundAdminAPI.rejectRefund(rejectModal._id, rejectionReason.trim());
            if (res.success) {
                toast.success('Refund request rejected');
                setRejectModal(null);
                setRejectionReason('');
                loadRefunds();
                if (selectedRefund?._id === rejectModal._id) {
                    setSelectedRefund(null);
                }
            }
        } catch (err) {
            console.error('Error rejecting refund:', err);
            toast.error(err.response?.data?.message || 'Failed to reject refund');
        } finally {
            setActionLoading(false);
        }
    };

    // Client-side search filtering
    const filteredRefunds = refunds.filter((r) => {
        if (!searchTerm.trim()) return true;
        const q = searchTerm.toLowerCase();
        return (
            (r.patientName || '').toLowerCase().includes(q) ||
            (r.patientMRN || '').toLowerCase().includes(q) ||
            (r.refundMode || '').toLowerCase().includes(q) ||
            (r.reason || '').toLowerCase().includes(q) ||
            (r.requestedByName || '').toLowerCase().includes(q)
        );
    });

    // Counts for KPI pills
    const pendingCount = refunds.filter(r => r.status === 'PENDING_APPROVAL').length;

    return (
        <div className="acc-refunds-page">
            {/* Header */}
            <div className="acc-header-section">
                <div className="acc-header-text">
                    <h1>
                        Refund Authorizations
                        <span className="acc-header-tag">Executive Approvals</span>
                    </h1>
                    <p>Review, authorize, or decline patient refund requests submitted by the Finance team</p>
                </div>
                <button className="acc-refresh-btn" onClick={loadRefunds} disabled={loading} title="Refresh Data">
                    <FiRefreshCw size={15} className={loading ? 'acc-spinning' : ''} /> Refresh
                </button>
            </div>

            {/* Error banner */}
            {error && <div className="acc-error-banner">{error}</div>}

            {/* Filter Tabs */}
            <div className="acc-tabs-row" style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
                {[
                    { key: 'PENDING_APPROVAL', label: 'Pending Approval', badge: pendingCount },
                    { key: 'APPROVED', label: 'Approved (Pending Execution)' },
                    { key: 'REFUNDED', label: 'Completed / Refunded' },
                    { key: 'REJECTED', label: 'Rejected' },
                    { key: 'ALL', label: 'All Requests' },
                ].map(tab => (
                    <button
                        key={tab.key}
                        className={`acc-tab-btn ${statusFilter === tab.key ? 'active' : ''}`}
                        onClick={() => { setStatusFilter(tab.key); setPage(1); }}
                        style={{
                            padding: '8px 16px',
                            borderRadius: '8px',
                            fontWeight: 600,
                            fontSize: '0.88rem',
                            border: statusFilter === tab.key ? '2px solid #2563eb' : '1px solid #e2e8f0',
                            background: statusFilter === tab.key ? '#eff6ff' : '#fff',
                            color: statusFilter === tab.key ? '#1d4ed8' : '#64748b',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}
                    >
                        {tab.label}
                        {tab.badge !== undefined && tab.badge > 0 && (
                            <span style={{
                                background: '#dc2626',
                                color: '#fff',
                                borderRadius: '10px',
                                padding: '1px 7px',
                                fontSize: '0.75rem',
                                fontWeight: 700
                            }}>
                                {tab.badge}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {/* Search Input */}
            <div className="acc-card" style={{ marginBottom: '16px', padding: '12px 18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <FiSearch color="#94a3b8" />
                    <input
                        type="text"
                        placeholder="Search by patient name, MRN, requested by, or reason..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        style={{
                            border: 'none',
                            outline: 'none',
                            width: '100%',
                            fontSize: '0.9rem',
                            color: '#1e293b'
                        }}
                    />
                    {searchTerm && (
                        <button
                            onClick={() => setSearchTerm('')}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}
                        >
                            <FiX />
                        </button>
                    )}
                </div>
            </div>

            {/* Refund Requests Table */}
            <div className="acc-card">
                {loading ? (
                    <div className="acc-loading" style={{ minHeight: '200px' }}>
                        <div className="acc-loading-spinner" />
                        <p>Loading refund requests...</p>
                    </div>
                ) : filteredRefunds.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px 20px', color: '#64748b' }}>
                        <FiAlertCircle size={36} style={{ marginBottom: '10px', color: '#94a3b8' }} />
                        <p style={{ fontWeight: 600, fontSize: '1rem', margin: 0 }}>No refund requests found</p>
                        <p style={{ fontSize: '0.85rem', margin: '4px 0 0' }}>
                            {statusFilter === 'PENDING_APPROVAL' 
                                ? 'No refund requests awaiting your authorization.' 
                                : 'No matching records found for this filter.'}
                        </p>
                    </div>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table className="acc-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ borderBottom: '2px solid #f1f5f9', textAlign: 'left', fontSize: '0.8rem', color: '#64748b', textTransform: 'uppercase' }}>
                                    <th style={{ padding: '12px' }}>Patient</th>
                                    <th style={{ padding: '12px' }}>Refund Amount</th>
                                    <th style={{ padding: '12px' }}>Mode</th>
                                    <th style={{ padding: '12px' }}>Financial Context</th>
                                    <th style={{ padding: '12px' }}>Requested By</th>
                                    <th style={{ padding: '12px' }}>Status</th>
                                    <th style={{ padding: '12px', textAlign: 'right' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredRefunds.map((r) => (
                                    <tr key={r._id} style={{ borderBottom: '1px solid #f8fafc', fontSize: '0.88rem' }}>
                                        <td style={{ padding: '12px' }}>
                                            <div style={{ fontWeight: 600, color: '#0f172a' }}>{r.patientName || 'Unnamed Patient'}</div>
                                            <div style={{ fontSize: '0.78rem', color: '#64748b' }}>MRN: {r.patientMRN || '—'}</div>
                                        </td>
                                        <td style={{ padding: '12px' }}>
                                            <span style={{ fontWeight: 700, color: '#dc2626', fontSize: '1rem' }}>
                                                {formatCurrency(r.refundAmount)}
                                            </span>
                                        </td>
                                        <td style={{ padding: '12px' }}>
                                            <span style={{
                                                padding: '3px 8px',
                                                borderRadius: '6px',
                                                fontSize: '0.75rem',
                                                fontWeight: 700,
                                                background: r.refundMode === 'CASH' ? '#fef3c7' : '#e0e7ff',
                                                color: r.refundMode === 'CASH' ? '#92400e' : '#3730a3'
                                            }}>
                                                {r.refundMode}
                                            </span>
                                        </td>
                                        <td style={{ padding: '12px' }}>
                                            <div style={{ fontSize: '0.78rem', color: '#475569' }}>
                                                Paid: <strong>{formatCurrency(r.totalPaid)}</strong> | Charges: <strong>{formatCurrency(r.totalCharges)}</strong>
                                            </div>
                                            <div style={{ fontSize: '0.75rem', color: '#059669' }}>
                                                Refundable: {formatCurrency(r.refundableAmount)}
                                            </div>
                                        </td>
                                        <td style={{ padding: '12px' }}>
                                            <div style={{ fontWeight: 500, color: '#334155' }}>{r.requestedByName || 'Accountant'}</div>
                                            <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{formatDateTime(r.requestedAt || r.createdAt)}</div>
                                        </td>
                                        <td style={{ padding: '12px' }}>
                                            <span style={{
                                                padding: '4px 9px',
                                                borderRadius: '6px',
                                                fontSize: '0.75rem',
                                                fontWeight: 700,
                                                background: 
                                                    r.status === 'PENDING_APPROVAL' ? '#fffbeb' :
                                                    r.status === 'APPROVED' ? '#eff6ff' :
                                                    r.status === 'REFUNDED' ? '#ecfdf5' : '#fef2f2',
                                                color:
                                                    r.status === 'PENDING_APPROVAL' ? '#b45309' :
                                                    r.status === 'APPROVED' ? '#1d4ed8' :
                                                    r.status === 'REFUNDED' ? '#047857' : '#b91c1c'
                                            }}>
                                                {r.status?.replace('_', ' ')}
                                            </span>
                                        </td>
                                        <td style={{ padding: '12px', textAlign: 'right' }}>
                                            <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                                                <button
                                                    onClick={() => setSelectedRefund(r)}
                                                    className="acc-btn acc-btn-sm"
                                                    title="View Details"
                                                    style={{ padding: '5px 10px', fontSize: '0.8rem', background: '#f1f5f9', color: '#334155' }}
                                                >
                                                    <FiEye /> Details
                                                </button>

                                                {r.status === 'PENDING_APPROVAL' && (
                                                    <>
                                                        <button
                                                            onClick={() => handleApprove(r._id)}
                                                            disabled={actionLoading}
                                                            className="acc-btn acc-btn-sm"
                                                            title="Approve Refund"
                                                            style={{
                                                                padding: '5px 12px',
                                                                fontSize: '0.8rem',
                                                                background: '#ecfdf5',
                                                                color: '#059669',
                                                                border: '1px solid #a7f3d0'
                                                            }}
                                                        >
                                                            <FiCheck /> Approve
                                                        </button>
                                                        <button
                                                            onClick={() => { setRejectModal(r); setRejectionReason(''); }}
                                                            disabled={actionLoading}
                                                            className="acc-btn acc-btn-sm"
                                                            title="Reject Refund"
                                                            style={{
                                                                padding: '5px 12px',
                                                                fontSize: '0.8rem',
                                                                background: '#fef2f2',
                                                                color: '#dc2626',
                                                                border: '1px solid #fecaca'
                                                            }}
                                                        >
                                                            <FiX /> Reject
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Details Modal */}
            {selectedRefund && (
                <div className="acc-modal-overlay" onClick={() => setSelectedRefund(null)}>
                    <div className="acc-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px' }}>
                        <div className="acc-modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ margin: 0, fontSize: '1.15rem' }}>Refund Authorization Details</h3>
                            <button onClick={() => setSelectedRefund(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: '#64748b' }}>
                                <FiX />
                            </button>
                        </div>
                        <div className="acc-modal-body" style={{ padding: '20px 0' }}>
                            <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '10px', marginBottom: '16px' }}>
                                <div style={{ fontWeight: 700, fontSize: '1rem', color: '#0f172a' }}>{selectedRefund.patientName}</div>
                                <div style={{ fontSize: '0.82rem', color: '#64748b', marginTop: '2px' }}>MRN: {selectedRefund.patientMRN || '—'}</div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                                <div style={{ background: '#fef2f2', padding: '12px', borderRadius: '8px' }}>
                                    <div style={{ fontSize: '0.75rem', color: '#991b1b', textTransform: 'uppercase', fontWeight: 600 }}>Refund Amount</div>
                                    <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#dc2626' }}>{formatCurrency(selectedRefund.refundAmount)}</div>
                                </div>
                                <div style={{ background: '#eff6ff', padding: '12px', borderRadius: '8px' }}>
                                    <div style={{ fontSize: '0.75rem', color: '#1e40af', textTransform: 'uppercase', fontWeight: 600 }}>Refund Mode</div>
                                    <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#2563eb' }}>{selectedRefund.refundMode}</div>
                                </div>
                            </div>

                            <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px', marginBottom: '16px' }}>
                                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#334155', marginBottom: '8px' }}>Financial Breakdown</div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', margin: '4px 0' }}>
                                    <span style={{ color: '#64748b' }}>Total Paid by Patient:</span>
                                    <span style={{ fontWeight: 600 }}>{formatCurrency(selectedRefund.totalPaid)}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', margin: '4px 0' }}>
                                    <span style={{ color: '#64748b' }}>Total Patient Charges:</span>
                                    <span style={{ fontWeight: 600 }}>{formatCurrency(selectedRefund.totalCharges)}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', margin: '4px 0' }}>
                                    <span style={{ color: '#64748b' }}>Previously Refunded:</span>
                                    <span style={{ fontWeight: 600 }}>{formatCurrency(selectedRefund.alreadyRefunded)}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem', margin: '6px 0 0', paddingTop: '6px', borderTop: '1px dashed #e2e8f0', color: '#059669' }}>
                                    <span style={{ fontWeight: 700 }}>Eligible Refundable Balance:</span>
                                    <span style={{ fontWeight: 700 }}>{formatCurrency(selectedRefund.refundableAmount)}</span>
                                </div>
                            </div>

                            {selectedRefund.reason && (
                                <div style={{ marginBottom: '16px' }}>
                                    <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#64748b' }}>Reason for Refund:</div>
                                    <p style={{ margin: '4px 0 0', fontSize: '0.88rem', color: '#1e293b', background: '#f8fafc', padding: '10px', borderRadius: '8px' }}>
                                        {selectedRefund.reason}
                                    </p>
                                </div>
                            )}

                            {/* Audit Timeline */}
                            <div style={{ fontSize: '0.8rem', color: '#64748b', display: 'flex', flexDirection: 'column', gap: '4px', borderTop: '1px solid #f1f5f9', paddingTop: '12px' }}>
                                <div>• Requested by: <strong>{selectedRefund.requestedByName || 'Accountant'}</strong> on {formatDateTime(selectedRefund.requestedAt || selectedRefund.createdAt)}</div>
                                {selectedRefund.approvedBy && (
                                    <div>• Approved by: <strong>{selectedRefund.approvedByName}</strong> on {formatDateTime(selectedRefund.approvedAt)}</div>
                                )}
                                {selectedRefund.rejectedBy && (
                                    <div style={{ color: '#dc2626' }}>• Rejected by: <strong>{selectedRefund.rejectedByName}</strong> on {formatDateTime(selectedRefund.rejectedAt)} — Reason: {selectedRefund.rejectionReason}</div>
                                )}
                                {selectedRefund.processedBy && (
                                    <div>• Processed by: <strong>{selectedRefund.processedByName}</strong> on {formatDateTime(selectedRefund.processedAt)} (UTR: {selectedRefund.refundTransactionId || '—'})</div>
                                )}
                                {selectedRefund.handedOverBy && (
                                    <div>• Cash handed over by: <strong>{selectedRefund.handedOverByName}</strong> on {formatDateTime(selectedRefund.handedOverAt)}</div>
                                )}
                            </div>
                        </div>

                        <div className="acc-modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', paddingTop: '14px', borderTop: '1px solid #f1f5f9' }}>
                            {selectedRefund.status === 'PENDING_APPROVAL' && (
                                <>
                                    <button
                                        onClick={() => { setRejectModal(selectedRefund); setRejectionReason(''); }}
                                        className="acc-btn acc-btn-danger"
                                    >
                                        Reject Request
                                    </button>
                                    <button
                                        onClick={() => handleApprove(selectedRefund._id)}
                                        disabled={actionLoading}
                                        className="acc-btn acc-btn-primary"
                                        style={{ background: '#059669' }}
                                    >
                                        Authorize & Approve
                                    </button>
                                </>
                            )}
                            <button onClick={() => setSelectedRefund(null)} className="acc-btn" style={{ background: '#f1f5f9', color: '#475569' }}>
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Rejection Modal */}
            {rejectModal && (
                <div className="acc-modal-overlay" onClick={() => setRejectModal(null)}>
                    <div className="acc-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '480px' }}>
                        <div className="acc-modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ margin: 0, color: '#dc2626' }}>Reject Refund Request</h3>
                            <button onClick={() => setRejectModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: '#64748b' }}>
                                <FiX />
                            </button>
                        </div>
                        <form onSubmit={handleRejectSubmit}>
                            <div className="acc-modal-body" style={{ padding: '16px 0' }}>
                                <p style={{ fontSize: '0.88rem', color: '#475569', margin: '0 0 12px' }}>
                                    Please provide a reason for declining the refund of <strong>{formatCurrency(rejectModal.refundAmount)}</strong> for <strong>{rejectModal.patientName}</strong>.
                                </p>
                                <textarea
                                    required
                                    rows={4}
                                    placeholder="Enter rejection reason (required for audit trail)..."
                                    value={rejectionReason}
                                    onChange={(e) => setRejectionReason(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '10px',
                                        borderRadius: '8px',
                                        border: '1.5px solid #e2e8f0',
                                        fontSize: '0.88rem',
                                        resize: 'vertical'
                                    }}
                                />
                            </div>
                            <div className="acc-modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                                <button type="button" onClick={() => setRejectModal(null)} className="acc-btn" style={{ background: '#f1f5f9', color: '#475569' }}>
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={actionLoading || !rejectionReason.trim()}
                                    className="acc-btn acc-btn-danger"
                                >
                                    {actionLoading ? 'Rejecting...' : 'Confirm Rejection'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default HospitalAdminRefunds;
