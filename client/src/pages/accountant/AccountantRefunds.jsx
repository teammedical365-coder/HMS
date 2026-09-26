import React, { useState, useEffect, useCallback } from 'react';
import { accountantAPI, billingAPI } from '../../utils/api';
import { FiRefreshCw, FiPlus, FiSearch, FiUser, FiHash, FiX, FiCheck, FiClock, FiArrowRight } from 'react-icons/fi';
import toast from 'react-hot-toast';
import socket from '../../utils/socket';
import './AccountantDashboard.css';

const formatCurrency = (amount) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 }).format(amount || 0);
const formatDateTime = (d) => d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

const STATUS_CONFIG = {
    PENDING_APPROVAL: { label: 'Pending Approval', badge: 'acc-badge-pending', icon: <FiClock size={12} /> },
    APPROVED: { label: 'Approved', badge: 'acc-badge-approved', icon: <FiCheck size={12} /> },
    PROCESSING: { label: 'Processing', badge: 'acc-badge-processing', icon: <FiArrowRight size={12} /> },
    REFUNDED: { label: 'Refunded', badge: 'acc-badge-refunded', icon: <FiCheck size={12} /> },
    REJECTED: { label: 'Rejected', badge: 'acc-badge-rejected', icon: <FiX size={12} /> },
    CANCELLED: { label: 'Cancelled', badge: 'acc-badge-cancelled', icon: <FiX size={12} /> },
};

const AccountantRefunds = () => {
    const [refunds, setRefunds] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('all');
    const [pagination, setPagination] = useState({ page: 1, limit: 30, total: 0, totalPages: 0 });

    // New refund modal
    const [showNewRefund, setShowNewRefund] = useState(false);
    const [patientSearch, setPatientSearch] = useState('');
    const [patientSearching, setPatientSearching] = useState(false);
    const [patientResults, setPatientResults] = useState([]);
    const [selectedPatient, setSelectedPatient] = useState(null);
    const [refundData, setRefundData] = useState(null);
    const [refundForm, setRefundForm] = useState({ refundAmount: '', refundMode: 'CASH', reason: '', originalPaymentId: '' });
    const [submitting, setSubmitting] = useState(false);

    // Process refund modal
    const [processModal, setProcessModal] = useState(null);
    const [processForm, setProcessForm] = useState({ refundTransactionId: '', processingNotes: '' });
    const [processing, setProcessing] = useState(false);

    const loadRefunds = useCallback(async (page = 1) => {
        try {
            setLoading(true);
            const params = { page, limit: 30 };
            if (activeTab !== 'all') params.status = activeTab;
            const res = await accountantAPI.getRefunds(params);
            if (res.success) {
                setRefunds(res.data.refunds);
                setPagination(res.data.pagination);
            }
        } catch (err) {
            console.error('Load refunds error:', err);
        } finally {
            setLoading(false);
        }
    }, [activeTab]);

    useEffect(() => { loadRefunds(1); }, [loadRefunds]);

    // Real-time updates
    useEffect(() => {
        const handleUpdate = () => loadRefunds(pagination.page);
        socket.on('refund_approved', handleUpdate);
        socket.on('refund_rejected', handleUpdate);
        socket.on('refund_completed', handleUpdate);
        socket.on('refund_status_updated', handleUpdate);
        return () => {
            socket.off('refund_approved', handleUpdate);
            socket.off('refund_rejected', handleUpdate);
            socket.off('refund_completed', handleUpdate);
            socket.off('refund_status_updated', handleUpdate);
        };
    }, [loadRefunds, pagination.page]);

    // Patient search
    const handlePatientSearch = async () => {
        if (!patientSearch.trim()) return;
        setPatientSearching(true);
        try {
            const res = await billingAPI.searchPatients(patientSearch.trim());
            if (res.success) {
                setPatientResults(res.patients || res.data || []);
            }
        } catch (err) {
            toast.error('Patient search failed');
        } finally {
            setPatientSearching(false);
        }
    };

    // Select patient and load refund data
    const handleSelectPatient = async (patient) => {
        setSelectedPatient(patient);
        setPatientResults([]);
        try {
            const res = await accountantAPI.getPatientRefundData(patient._id);
            if (res.success) {
                setRefundData(res.data);
                setRefundForm(f => ({ ...f, refundAmount: '' }));
            }
        } catch (err) {
            toast.error('Failed to load patient refund data');
        }
    };

    // Submit refund request
    const handleSubmitRefund = async () => {
        if (!selectedPatient || !refundForm.refundAmount || !refundForm.refundMode) {
            toast.error('Please fill all required fields');
            return;
        }

        const amount = parseFloat(refundForm.refundAmount);
        if (isNaN(amount) || amount <= 0) {
            toast.error('Invalid refund amount');
            return;
        }

        if (refundData && amount > refundData.refundableAmount) {
            toast.error(`Refund amount cannot exceed ₹${refundData.refundableAmount.toLocaleString()}`);
            return;
        }

        setSubmitting(true);
        try {
            const res = await accountantAPI.createRefundRequest({
                patientId: selectedPatient._id,
                refundAmount: amount,
                refundMode: refundForm.refundMode,
                reason: refundForm.reason,
                originalPaymentId: refundForm.originalPaymentId || undefined
            });

            if (res.success) {
                toast.success('Refund request created! Awaiting Hospital Admin approval.');
                setShowNewRefund(false);
                resetNewRefundForm();
                loadRefunds(1);
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to create refund request');
        } finally {
            setSubmitting(false);
        }
    };

    // Process approved UPI/Bank refund
    const handleProcessRefund = async () => {
        if (!processModal) return;
        setProcessing(true);
        try {
            const res = await accountantAPI.processRefund(processModal._id, {
                refundTransactionId: processForm.refundTransactionId,
                processingNotes: processForm.processingNotes
            });

            if (res.success) {
                toast.success('Refund marked as completed!');
                setProcessModal(null);
                setProcessForm({ refundTransactionId: '', processingNotes: '' });
                loadRefunds(pagination.page);
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to process refund');
        } finally {
            setProcessing(false);
        }
    };

    const resetNewRefundForm = () => {
        setSelectedPatient(null);
        setRefundData(null);
        setPatientSearch('');
        setPatientResults([]);
        setRefundForm({ refundAmount: '', refundMode: 'CASH', reason: '', originalPaymentId: '' });
    };

    const getStatusBadge = (status) => {
        const cfg = STATUS_CONFIG[status] || { label: status, badge: 'acc-badge-default' };
        return <span className={`acc-badge ${cfg.badge}`}>{cfg.icon} {cfg.label}</span>;
    };

    return (
        <div className="acc-refunds-page">
            <div className="acc-header-section">
                <div className="acc-header-text">
                    <h1>
                        Refund Management
                        <span className="acc-header-tag">Multi-Party Flow</span>
                    </h1>
                    <p>Create, track, and process patient refund requests</p>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <button className="acc-btn acc-btn-primary" onClick={() => { setShowNewRefund(true); resetNewRefundForm(); }}>
                        <FiPlus size={15} /> New Refund Request
                    </button>
                    <button className="acc-refresh-btn" onClick={() => loadRefunds(pagination.page)} title="Refresh">
                        <FiRefreshCw size={15} className={loading ? 'acc-spinning' : ''} />
                    </button>
                </div>
            </div>

            {/* Tabs */}
            <div className="acc-tabs">
                {[
                    { key: 'all', label: 'All' },
                    { key: 'PENDING_APPROVAL', label: 'Pending' },
                    { key: 'APPROVED', label: 'Approved' },
                    { key: 'REFUNDED', label: 'Completed' },
                    { key: 'REJECTED', label: 'Rejected' },
                ].map(tab => (
                    <button key={tab.key} className={`acc-tab ${activeTab === tab.key ? 'active' : ''}`} onClick={() => setActiveTab(tab.key)}>
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Refund List */}
            <div className="acc-card">
                {loading ? (
                    <div className="acc-loading" style={{ minHeight: 200 }}><div className="acc-loading-spinner" /></div>
                ) : refunds.length === 0 ? (
                    <div className="acc-empty">
                        <div className="acc-empty-icon">💸</div>
                        <h3>No refund requests</h3>
                        <p>Click "New Refund Request" to create one</p>
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
                                        <th>Requested At</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {refunds.map(r => (
                                        <tr key={r._id}>
                                            <td><div className="acc-patient-cell"><FiUser size={14} /><span>{r.patientName || '—'}</span></div></td>
                                            <td><span className="acc-mrn"><FiHash size={12} />{r.patientMRN || '—'}</span></td>
                                            <td className="acc-amount">{formatCurrency(r.refundAmount)}</td>
                                            <td>{r.refundMode}</td>
                                            <td>{getStatusBadge(r.status)}</td>
                                            <td>{r.requestedByName || '—'}</td>
                                            <td style={{ whiteSpace: 'nowrap' }}>{formatDateTime(r.requestedAt)}</td>
                                            <td>
                                                {r.status === 'APPROVED' && ['UPI', 'BANK_TRANSFER'].includes(r.refundMode) && (
                                                    <button className="acc-btn acc-btn-success" style={{ padding: '5px 12px', fontSize: '0.8rem' }}
                                                        onClick={() => { setProcessModal(r); setProcessForm({ refundTransactionId: '', processingNotes: '' }); }}>
                                                        Process Refund
                                                    </button>
                                                )}
                                                {r.status === 'APPROVED' && r.refundMode === 'CASH' && (
                                                    <span style={{ fontSize: '0.8rem', color: '#d97706' }}>⏳ Awaiting Reception</span>
                                                )}
                                                {r.status === 'REFUNDED' && (
                                                    <span style={{ fontSize: '0.8rem', color: '#059669' }}>✓ Completed</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {pagination.totalPages > 1 && (
                            <div className="acc-pagination">
                                <button disabled={pagination.page <= 1} onClick={() => loadRefunds(pagination.page - 1)}>Previous</button>
                                <span>Page {pagination.page} of {pagination.totalPages}</span>
                                <button disabled={pagination.page >= pagination.totalPages} onClick={() => loadRefunds(pagination.page + 1)}>Next</button>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* ═══ New Refund Request Modal ═══ */}
            {showNewRefund && (
                <div className="acc-modal-overlay" onClick={() => setShowNewRefund(false)}>
                    <div className="acc-modal" onClick={e => e.stopPropagation()}>
                        <h2>Create Refund Request</h2>

                        {!selectedPatient ? (
                            <>
                                <div className="acc-modal-field">
                                    <label>Search Patient</label>
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <input
                                            placeholder="Phone / MRN / Patient ID..."
                                            value={patientSearch}
                                            onChange={e => setPatientSearch(e.target.value)}
                                            onKeyDown={e => e.key === 'Enter' && handlePatientSearch()}
                                        />
                                        <button className="acc-btn acc-btn-primary" onClick={handlePatientSearch} disabled={patientSearching} style={{ flexShrink: 0 }}>
                                            <FiSearch size={16} />
                                        </button>
                                    </div>
                                </div>

                                {patientResults.length > 0 && (
                                    <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                                        {patientResults.map(p => (
                                            <div key={p._id} onClick={() => handleSelectPatient(p)}
                                                style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between' }}
                                                onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                                <span style={{ fontWeight: 600 }}>{p.name}</span>
                                                <span style={{ color: '#64748b', fontSize: '0.85rem' }}>{p.patientId || p.mrn || p.phone}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </>
                        ) : (
                            <>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                                    <div>
                                        <strong>{selectedPatient.name}</strong>
                                        <span style={{ marginLeft: 10, color: '#64748b', fontSize: '0.85rem' }}>{selectedPatient.patientId || selectedPatient.mrn || selectedPatient.phone}</span>
                                    </div>
                                    <button className="acc-btn acc-btn-sm" onClick={resetNewRefundForm}>Change Patient</button>
                                </div>

                                {refundData && (
                                    <>
                                        <div className="acc-modal-summary">
                                            <div className="acc-modal-summary-row"><span>Total Paid</span><span style={{ fontWeight: 600 }}>{formatCurrency(refundData.totalPaid)}</span></div>
                                            <div className="acc-modal-summary-row"><span>Already Refunded</span><span>{formatCurrency(refundData.alreadyRefunded)}</span></div>
                                            {refundData.pendingRefundAmount > 0 && (
                                                <div className="acc-modal-summary-row"><span>Pending Approval</span><span style={{ color: '#d97706', fontWeight: 600 }}>{formatCurrency(refundData.pendingRefundAmount)}</span></div>
                                            )}
                                            <div className="acc-modal-summary-row acc-highlight" style={{ borderTop: '1px solid #e2e8f0', paddingTop: 8, marginTop: 6 }}>
                                                <span style={{ fontWeight: 700, color: '#047857' }}>Max Refundable Balance</span>
                                                <span style={{ fontWeight: 700, color: '#047857', fontSize: '1.05rem' }}>{formatCurrency(refundData.refundableAmount)}</span>
                                            </div>
                                        </div>

                                        {/* Optional: Pick a past payment */}
                                        {refundData.payments && refundData.payments.length > 0 && (
                                            <div style={{ marginBottom: 12 }}>
                                                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>
                                                    Quick Select From Recent Payments (Optional)
                                                </label>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 130, overflowY: 'auto' }}>
                                                    {refundData.payments.slice(0, 5).map(p => {
                                                        const isSelected = refundForm.originalPaymentId === p._id;
                                                        const mode = (p.paymentMode || 'Cash').toUpperCase();
                                                        return (
                                                            <div 
                                                                key={p._id} 
                                                                onClick={() => {
                                                                    const targetMode = mode.includes('UPI') ? 'UPI' : (mode.includes('BANK') || mode.includes('CARD') || mode.includes('ONLINE')) ? 'BANK_TRANSFER' : 'CASH';
                                                                    setRefundForm(f => ({
                                                                        ...f,
                                                                        originalPaymentId: isSelected ? '' : p._id,
                                                                        refundAmount: isSelected ? '' : String(Math.min(p.amount, refundData.refundableAmount)),
                                                                        refundMode: isSelected ? f.refundMode : targetMode
                                                                    }));
                                                                }}
                                                                style={{
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'space-between',
                                                                    padding: '7px 10px',
                                                                    borderRadius: 6,
                                                                    border: isSelected ? '2px solid #059669' : '1px solid #e2e8f0',
                                                                    background: isSelected ? '#ecfdf5' : '#f8fafc',
                                                                    cursor: 'pointer',
                                                                    fontSize: '0.82rem'
                                                                }}
                                                            >
                                                                <div>
                                                                    <strong>{formatCurrency(p.amount)}</strong>
                                                                    <span style={{ marginLeft: 8, padding: '2px 6px', borderRadius: 4, background: '#e2e8f0', fontSize: '0.72rem', fontWeight: 600 }}>{p.paymentMode || 'Cash'}</span>
                                                                    {p.transactionId && <span style={{ marginLeft: 6, color: '#64748b', fontSize: '0.72rem' }}>#{p.transactionId}</span>}
                                                                </div>
                                                                <span style={{ color: isSelected ? '#059669' : '#64748b', fontWeight: isSelected ? 700 : 500 }}>
                                                                    {isSelected ? '✓ Selected' : 'Use'}
                                                                </span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}

                                        {refundData.refundableAmount <= 0 ? (
                                            <div className="acc-error-banner">No refundable amount available for this patient (all collected payments have already been refunded or are pending approval).</div>
                                        ) : (
                                            <>
                                                <div className="acc-modal-field">
                                                    <label>Refund Amount (₹) *</label>
                                                    <input type="number" min="1" max={refundData.refundableAmount} value={refundForm.refundAmount}
                                                        onChange={e => setRefundForm(f => ({ ...f, refundAmount: e.target.value }))}
                                                        placeholder={`Max ₹${refundData.refundableAmount.toLocaleString()}`} />
                                                </div>

                                                <div className="acc-modal-field">
                                                    <label>Refund Mode *</label>
                                                    <select value={refundForm.refundMode} onChange={e => setRefundForm(f => ({ ...f, refundMode: e.target.value }))}>
                                                        <option value="CASH">Cash</option>
                                                        <option value="UPI">UPI</option>
                                                        <option value="BANK_TRANSFER">Bank Transfer</option>
                                                    </select>
                                                </div>

                                                <div className="acc-modal-field">
                                                    <label>Reason / Notes</label>
                                                    <textarea value={refundForm.reason} onChange={e => setRefundForm(f => ({ ...f, reason: e.target.value }))}
                                                        placeholder="Reason for refund..." />
                                                </div>

                                                <div className="acc-modal-actions">
                                                    <button className="acc-btn acc-btn-sm" onClick={() => setShowNewRefund(false)}>Cancel</button>
                                                    <button className="acc-btn acc-btn-primary" onClick={handleSubmitRefund} disabled={submitting}>
                                                        {submitting ? 'Submitting...' : 'Request Refund'}
                                                    </button>
                                                </div>
                                            </>
                                        )}
                                    </>
                                )}
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* ═══ Process Refund Modal (UPI/Bank) ═══ */}
            {processModal && (
                <div className="acc-modal-overlay" onClick={() => setProcessModal(null)}>
                    <div className="acc-modal" onClick={e => e.stopPropagation()}>
                        <h2>Process {processModal.refundMode === 'UPI' ? 'UPI' : 'Bank Transfer'} Refund</h2>

                        <div className="acc-modal-summary">
                            <div className="acc-modal-summary-row"><span>Patient</span><span>{processModal.patientName}</span></div>
                            <div className="acc-modal-summary-row"><span>MRN</span><span>{processModal.patientMRN}</span></div>
                            <div className="acc-modal-summary-row"><span>Refund Amount</span><span style={{ color: '#dc2626', fontWeight: 700 }}>{formatCurrency(processModal.refundAmount)}</span></div>
                            <div className="acc-modal-summary-row"><span>Mode</span><span>{processModal.refundMode}</span></div>
                            <div className="acc-modal-summary-row"><span>Approved By</span><span>{processModal.approvedByName}</span></div>
                        </div>

                        <div className="acc-modal-field">
                            <label>Transaction ID / UTR / Reference Number *</label>
                            <input value={processForm.refundTransactionId} onChange={e => setProcessForm(f => ({ ...f, refundTransactionId: e.target.value }))}
                                placeholder="Enter transaction reference..." />
                        </div>

                        <div className="acc-modal-field">
                            <label>Processing Notes</label>
                            <textarea value={processForm.processingNotes} onChange={e => setProcessForm(f => ({ ...f, processingNotes: e.target.value }))}
                                placeholder="Optional notes..." />
                        </div>

                        <div className="acc-modal-actions">
                            <button className="acc-btn acc-btn-sm" onClick={() => setProcessModal(null)}>Cancel</button>
                            <button className="acc-btn acc-btn-success" onClick={handleProcessRefund} disabled={processing}>
                                {processing ? 'Processing...' : 'Mark Refunded'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AccountantRefunds;
