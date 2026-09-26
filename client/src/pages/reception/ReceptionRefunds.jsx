import React, { useState, useEffect, useCallback } from 'react';
import { refundReceptionAPI } from '../../utils/api';
import { 
    FiRefreshCw, FiDollarSign, FiCheck, FiClock, FiSearch, 
    FiAlertCircle, FiCheckCircle, FiX, FiUser, FiHash 
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import socket from '../../utils/socket';
import '../accountant/AccountantDashboard.css';

const formatCurrency = (amount) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 }).format(amount || 0);
const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const formatDateTime = (d) => d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

const ReceptionRefunds = () => {
    const [refunds, setRefunds] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [viewTab, setViewTab] = useState('PENDING'); // 'PENDING' or 'HISTORY'
    const [searchTerm, setSearchTerm] = useState('');
    const [actionLoading, setActionLoading] = useState(false);
    const [confirmModal, setConfirmModal] = useState(null);

    const loadRefunds = useCallback(async () => {
        try {
            setLoading(true);
            setError('');
            if (viewTab === 'PENDING') {
                const res = await refundReceptionAPI.getCashRefunds(false);
                if (res.success) {
                    setRefunds(res.data || []);
                }
            } else {
                const res = await refundReceptionAPI.getRefundHistory();
                if (res.success) {
                    setRefunds(res.data || []);
                }
            }
        } catch (err) {
            console.error('Reception Refunds load error:', err);
            setError('Failed to load cash refund queue');
        } finally {
            setLoading(false);
        }
    }, [viewTab]);

    useEffect(() => {
        loadRefunds();
    }, [loadRefunds]);

    // Real-time socket events for receptionist
    useEffect(() => {
        const handleCashReady = (data) => {
            toast((t) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <FiDollarSign color="#059669" size={20} />
                    <div>
                        <div style={{ fontWeight: 700 }}>Cash Refund Ready for Handover!</div>
                        <div style={{ fontSize: '0.82rem' }}>
                            {formatCurrency(data.refundAmount)} for {data.patientName || 'Patient'}
                        </div>
                    </div>
                </div>
            ), { duration: 6000 });
            loadRefunds();
        };

        const handleRefundStatus = () => {
            loadRefunds();
        };

        socket.on('refund_cash_ready', handleCashReady);
        socket.on('refund_status_updated', handleRefundStatus);
        socket.on('refund_completed', handleRefundStatus);

        return () => {
            socket.off('refund_cash_ready', handleCashReady);
            socket.off('refund_status_updated', handleRefundStatus);
            socket.off('refund_completed', handleRefundStatus);
        };
    }, [loadRefunds]);

    const handleHandoverSubmit = async () => {
        if (!confirmModal) return;
        try {
            setActionLoading(true);
            const res = await refundReceptionAPI.handOverCash(confirmModal._id);
            if (res.success) {
                toast.success(`₹${confirmModal.refundAmount} cash handed over to ${confirmModal.patientName}`);
                setConfirmModal(null);
                loadRefunds();
            }
        } catch (err) {
            console.error('Handover error:', err);
            toast.error(err.response?.data?.message || 'Failed to complete cash handover');
        } finally {
            setActionLoading(false);
        }
    };

    const filteredRefunds = refunds.filter((r) => {
        if (!searchTerm.trim()) return true;
        const q = searchTerm.toLowerCase();
        return (
            (r.patientName || '').toLowerCase().includes(q) ||
            (r.patientMRN || '').toLowerCase().includes(q) ||
            (r.reason || '').toLowerCase().includes(q) ||
            (r.approvedByName || '').toLowerCase().includes(q) ||
            (r.handedOverByName || '').toLowerCase().includes(q)
        );
    });

    const pendingTotal = refunds.reduce((sum, r) => sum + (r.refundAmount || 0), 0);

    return (
        <div className="acc-refunds-page">
            {/* Header */}
            <div className="acc-header-section">
                <div className="acc-header-text">
                    <h1>
                        Cash Refund Counter
                        <span className="acc-header-tag">Cash Desk</span>
                    </h1>
                    <p>Hand over approved cash refunds to patients and record physical disbursements</p>
                </div>
                <button className="acc-refresh-btn" onClick={loadRefunds} disabled={loading} title="Refresh Data">
                    <FiRefreshCw size={15} className={loading ? 'acc-spinning' : ''} /> Refresh
                </button>
            </div>

            {error && <div className="acc-error-banner">{error}</div>}

            {/* KPI Banner */}
            <div className="acc-kpi-row" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
                <div className="acc-kpi acc-kpi-amber">
                    <div className="acc-kpi-icon-wrap"><FiDollarSign size={24} /></div>
                    <div className="acc-kpi-data">
                        <span className="acc-kpi-value">{viewTab === 'PENDING' ? formatCurrency(pendingTotal) : formatCurrency(pendingTotal)}</span>
                        <span className="acc-kpi-label">{viewTab === 'PENDING' ? 'Pending Cash Disbursement' : 'Total Handed Over (Recent)'}</span>
                        <span className="acc-kpi-sub">{refunds.length} transactions</span>
                    </div>
                </div>
            </div>

            {/* Tab selection */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
                <button
                    onClick={() => { setViewTab('PENDING'); setSearchTerm(''); }}
                    style={{
                        padding: '10px 20px',
                        borderRadius: '8px',
                        fontWeight: 600,
                        fontSize: '0.9rem',
                        cursor: 'pointer',
                        border: viewTab === 'PENDING' ? '2px solid #059669' : '1px solid #e2e8f0',
                        background: viewTab === 'PENDING' ? '#ecfdf5' : '#fff',
                        color: viewTab === 'PENDING' ? '#065f46' : '#64748b',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                    }}
                >
                    <FiClock /> Pending Handover Queue ({viewTab === 'PENDING' ? refunds.length : '...'})
                </button>
                <button
                    onClick={() => { setViewTab('HISTORY'); setSearchTerm(''); }}
                    style={{
                        padding: '10px 20px',
                        borderRadius: '8px',
                        fontWeight: 600,
                        fontSize: '0.9rem',
                        cursor: 'pointer',
                        border: viewTab === 'HISTORY' ? '2px solid #2563eb' : '1px solid #e2e8f0',
                        background: viewTab === 'HISTORY' ? '#eff6ff' : '#fff',
                        color: viewTab === 'HISTORY' ? '#1e40af' : '#64748b',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                    }}
                >
                    <FiCheckCircle /> Handover History
                </button>
            </div>

            {/* Search Input */}
            <div className="acc-card" style={{ marginBottom: '16px', padding: '12px 18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <FiSearch color="#94a3b8" />
                    <input
                        type="text"
                        placeholder="Search by patient name, MRN, approver..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        style={{ border: 'none', outline: 'none', width: '100%', fontSize: '0.9rem' }}
                    />
                    {searchTerm && (
                        <button onClick={() => setSearchTerm('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
                            <FiX />
                        </button>
                    )}
                </div>
            </div>

            {/* Queue Table */}
            <div className="acc-card">
                {loading ? (
                    <div className="acc-loading" style={{ minHeight: '200px' }}>
                        <div className="acc-loading-spinner" />
                        <p>Loading cash queue...</p>
                    </div>
                ) : filteredRefunds.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px 20px', color: '#64748b' }}>
                        <FiAlertCircle size={36} style={{ marginBottom: '10px', color: '#94a3b8' }} />
                        <p style={{ fontWeight: 600, fontSize: '1rem', margin: 0 }}>
                            {viewTab === 'PENDING' ? 'No pending cash refunds' : 'No cash handover history found'}
                        </p>
                        <p style={{ fontSize: '0.85rem', margin: '4px 0 0' }}>
                            {viewTab === 'PENDING' 
                                ? 'When an administrator approves a cash refund, it will instantly appear in this queue.' 
                                : 'Completed cash handovers will be listed here.'}
                        </p>
                    </div>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table className="acc-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ borderBottom: '2px solid #f1f5f9', textAlign: 'left', fontSize: '0.8rem', color: '#64748b', textTransform: 'uppercase' }}>
                                    <th style={{ padding: '12px' }}>Patient</th>
                                    <th style={{ padding: '12px' }}>Amount to Hand Over</th>
                                    <th style={{ padding: '12px' }}>Authorized By</th>
                                    <th style={{ padding: '12px' }}>Reason</th>
                                    {viewTab === 'HISTORY' ? (
                                        <>
                                            <th style={{ padding: '12px' }}>Handed Over By</th>
                                            <th style={{ padding: '12px' }}>Handed Over At</th>
                                        </>
                                    ) : (
                                        <th style={{ padding: '12px', textAlign: 'right' }}>Action</th>
                                    )}
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
                                            <span style={{ fontWeight: 700, color: '#059669', fontSize: '1.1rem' }}>
                                                {formatCurrency(r.refundAmount)}
                                            </span>
                                            <span style={{ marginLeft: '8px', padding: '2px 6px', background: '#fef3c7', color: '#92400e', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 700 }}>
                                                CASH
                                            </span>
                                        </td>
                                        <td style={{ padding: '12px' }}>
                                            <div style={{ fontWeight: 500, color: '#334155' }}>{r.approvedByName || 'Admin'}</div>
                                            <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{formatDateTime(r.approvedAt)}</div>
                                        </td>
                                        <td style={{ padding: '12px', maxWidth: '250px' }}>
                                            <div style={{ color: '#475569', fontSize: '0.82rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {r.reason || 'Patient refund'}
                                            </div>
                                        </td>

                                        {viewTab === 'HISTORY' ? (
                                            <>
                                                <td style={{ padding: '12px' }}>
                                                    <span style={{ fontWeight: 600, color: '#0f172a' }}>{r.handedOverByName || 'Receptionist'}</span>
                                                </td>
                                                <td style={{ padding: '12px', fontSize: '0.82rem', color: '#64748b' }}>
                                                    {formatDateTime(r.handedOverAt || r.updatedAt)}
                                                </td>
                                            </>
                                        ) : (
                                            <td style={{ padding: '12px', textAlign: 'right' }}>
                                                <button
                                                    onClick={() => setConfirmModal(r)}
                                                    className="acc-btn acc-btn-sm"
                                                    style={{
                                                        background: '#059669',
                                                        color: '#fff',
                                                        padding: '7px 16px',
                                                        fontSize: '0.85rem',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '6px'
                                                    }}
                                                >
                                                    <FiCheck /> Mark Cash Handed Over
                                                </button>
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Confirmation Modal */}
            {confirmModal && (
                <div className="acc-modal-overlay" onClick={() => setConfirmModal(null)}>
                    <div className="acc-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '480px' }}>
                        <div className="acc-modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ margin: 0, color: '#059669' }}>Confirm Cash Handover</h3>
                            <button onClick={() => setConfirmModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: '#64748b' }}>
                                <FiX />
                            </button>
                        </div>
                        <div className="acc-modal-body" style={{ padding: '20px 0' }}>
                            <p style={{ margin: '0 0 14px', fontSize: '0.92rem', color: '#334155' }}>
                                You are about to disburse physical cash to:
                            </p>
                            <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '10px', marginBottom: '16px' }}>
                                <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0f172a' }}>{confirmModal.patientName}</div>
                                <div style={{ fontSize: '0.82rem', color: '#64748b' }}>MRN: {confirmModal.patientMRN || '—'}</div>
                                <div style={{ marginTop: '10px', fontSize: '1.4rem', fontWeight: 800, color: '#059669' }}>
                                    {formatCurrency(confirmModal.refundAmount)}
                                </div>
                            </div>
                            <div style={{ fontSize: '0.82rem', color: '#64748b', background: '#ecfdf5', padding: '10px', borderRadius: '8px', border: '1px solid #a7f3d0' }}>
                                ⚠️ Please verify the patient's identity and hand over the exact cash amount before confirming. This action is permanently recorded in the financial audit log.
                            </div>
                        </div>
                        <div className="acc-modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                            <button onClick={() => setConfirmModal(null)} className="acc-btn" style={{ background: '#f1f5f9', color: '#475569' }}>
                                Cancel
                            </button>
                            <button
                                onClick={handleHandoverSubmit}
                                disabled={actionLoading}
                                className="acc-btn acc-btn-primary"
                                style={{ background: '#059669' }}
                            >
                                {actionLoading ? 'Recording...' : 'Confirm Cash Handed Over'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ReceptionRefunds;
