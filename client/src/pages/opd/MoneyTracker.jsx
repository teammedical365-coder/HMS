import React, { useState, useEffect, useCallback } from 'react';
import { freeOpdAPI } from '../../utils/api';
import {
    FiDollarSign,
    FiPlus,
    FiSearch,
    FiTrendingUp,
    FiCalendar,
    FiCheckCircle,
    FiX,
    FiCreditCard,
    FiSmartphone
} from 'react-icons/fi';
import './MoneyTracker.css';

const MoneyTracker = () => {
    const [summary, setSummary] = useState({
        daily: { total: 0, cash: 0, upi: 0, card: 0, other: 0 },
        monthly: { total: 0, cash: 0, upi: 0, card: 0, other: 0 },
        total: { total: 0, cash: 0, upi: 0, card: 0, other: 0 }
    });
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(true);

    // Record Fee Modal State
    const [showRecordModal, setShowRecordModal] = useState(false);
    const [recordForm, setRecordForm] = useState({
        appointmentId: '',
        amount: '',
        paymentMethod: 'Cash',
        transactionId: '',
        description: ''
    });
    const [unpaidAppts, setUnpaidAppts] = useState([]);
    const [savingFee, setSavingFee] = useState(false);
    const [recordError, setRecordError] = useState('');

    // Fetch Financial Summary
    const loadSummary = useCallback(async () => {
        try {
            const res = await freeOpdAPI.getMoneySummary();
            if (res.success && res.summary) {
                setSummary(res.summary);
            }
        } catch (err) {
            console.error('Error fetching money summary:', err);
        }
    }, []);

    // Fetch Transactions
    const loadTransactions = useCallback(async () => {
        setLoading(true);
        try {
            const res = await freeOpdAPI.getTransactions({ limit: 50 });
            if (res.success) {
                setTransactions(res.transactions || []);
            }
        } catch (err) {
            console.error('Error fetching transactions:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadSummary();
        loadTransactions();
    }, [loadSummary, loadTransactions]);

    // Open Record Fee Modal & Load appointments needing payment
    const handleOpenRecordModal = async () => {
        setRecordError('');
        setShowRecordModal(true);
        try {
            const res = await freeOpdAPI.listAppointments({ limit: 40 });
            if (res.success) {
                setUnpaidAppts(res.appointments || []);
            }
        } catch (_) {}
    };

    // Submit Recorded Fee
    const handleRecordSubmit = async (e) => {
        e.preventDefault();
        setRecordError('');
        if (!recordForm.appointmentId) {
            setRecordError('Please select an appointment');
            return;
        }
        if (!recordForm.amount || Number(recordForm.amount) <= 0) {
            setRecordError('Please enter a valid consultation amount');
            return;
        }

        setSavingFee(true);
        try {
            const res = await freeOpdAPI.recordFee(recordForm.appointmentId, {
                amount: Number(recordForm.amount),
                paymentMethod: recordForm.paymentMethod,
                transactionId: recordForm.transactionId.trim(),
                description: recordForm.description.trim()
            });

            if (res.success) {
                setShowRecordModal(false);
                setRecordForm({
                    appointmentId: '',
                    amount: '',
                    paymentMethod: 'Cash',
                    transactionId: '',
                    description: ''
                });
                loadSummary();
                loadTransactions();
            } else {
                setRecordError(res.message || 'Error recording fee');
            }
        } catch (err) {
            setRecordError(err.response?.data?.message || err.message || 'Error recording fee');
        } finally {
            setSavingFee(false);
        }
    };

    return (
        <div className="mt-container">
            {/* 3 Metric Cards */}
            <div className="mt-metrics-grid">
                {/* Card 1: Today's Collection */}
                <div className="mt-metric-card highlight">
                    <div className="mt-metric-title">Today's Total Collection</div>
                    <div className="mt-metric-amount" style={{ color: '#0d9488' }}>
                        ₹{summary.daily?.total?.toLocaleString('en-IN') || 0}
                    </div>
                    <div className="mt-metric-breakdown">
                        <span>💵 Cash: ₹{summary.daily?.cash || 0}</span>
                        <span>📱 UPI: ₹{summary.daily?.upi || 0}</span>
                        <span>💳 Card: ₹{summary.daily?.card || 0}</span>
                    </div>
                </div>

                {/* Card 2: This Month's Collection */}
                <div className="mt-metric-card">
                    <div className="mt-metric-title">This Month's Collection</div>
                    <div className="mt-metric-amount">
                        ₹{summary.monthly?.total?.toLocaleString('en-IN') || 0}
                    </div>
                    <div className="mt-metric-breakdown">
                        <span>💵 Cash: ₹{summary.monthly?.cash || 0}</span>
                        <span>📱 UPI: ₹{summary.monthly?.upi || 0}</span>
                    </div>
                </div>

                {/* Card 3: All-Time Collection */}
                <div className="mt-metric-card">
                    <div className="mt-metric-title">All-Time OPD Revenue</div>
                    <div className="mt-metric-amount">
                        ₹{summary.total?.total?.toLocaleString('en-IN') || 0}
                    </div>
                    <div className="mt-metric-breakdown">
                        <span>Total Records: {transactions.length}</span>
                    </div>
                </div>
            </div>

            {/* Action Bar */}
            <div className="mt-toolbar">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <FiTrendingUp style={{ color: '#0d9488', fontSize: '18px' }} />
                    <span style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>
                        OPD Consultation Fee Ledger
                    </span>
                </div>

                <button
                    type="button"
                    className="pm-action-btn-primary"
                    onClick={handleOpenRecordModal}
                >
                    <FiPlus />
                    <span>Record Consultation Fee</span>
                </button>
            </div>

            {/* Transactions Ledger Table */}
            <div className="am-table-card">
                <div className="am-table-wrap">
                    <table className="am-table">
                        <thead>
                            <tr>
                                <th>Date & Time</th>
                                <th>Patient Name</th>
                                <th>Patient UID / Mobile</th>
                                <th>Fee Amount</th>
                                <th>Payment Mode</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan="6" style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                                        Loading fee transactions...
                                    </td>
                                </tr>
                            ) : transactions.length === 0 ? (
                                <tr>
                                    <td colSpan="6" style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                                        No financial transactions recorded yet.
                                    </td>
                                </tr>
                            ) : (
                                transactions.map((t) => {
                                    const dateStr = new Date(t.date || t.createdAt).toLocaleDateString('en-IN', {
                                        day: '2-digit', month: 'short', year: 'numeric'
                                    });
                                    const mode = (t.paymentMethod || 'Cash').toLowerCase();
                                    const modeClass = mode.includes('upi') ? 'mt-badge-upi' : mode.includes('card') ? 'mt-badge-card' : 'mt-badge-cash';

                                    return (
                                        <tr key={t._id}>
                                            <td>
                                                <strong>{dateStr}</strong>
                                            </td>
                                            <td>
                                                <strong>{t.patientName}</strong>
                                            </td>
                                            <td>
                                                <span className="pm-patient-id-badge">{t.patientCode}</span>
                                                <div style={{ fontSize: '11.5px', color: '#64748b' }}>{t.patientPhone}</div>
                                            </td>
                                            <td>
                                                <strong style={{ fontSize: '14px', color: '#0f172a' }}>
                                                    ₹{t.amount || 0}
                                                </strong>
                                            </td>
                                            <td>
                                                <span className={`mt-mode-badge ${modeClass}`}>
                                                    {t.paymentMethod || 'Cash'}
                                                </span>
                                            </td>
                                            <td>
                                                <span style={{ fontSize: '12px', fontWeight: 700, color: '#059669' }}>
                                                    ✓ {t.paymentStatus || 'Paid'}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ─────────────────────────────────────────────────────────────
               RECORD CONSULTATION FEE MODAL
               ───────────────────────────────────────────────────────────── */}
            {showRecordModal && (
                <div className="pm-modal-overlay">
                    <div className="pm-modal-card" style={{ maxWidth: '520px' }}>
                        <div className="pm-modal-header">
                            <h3 className="pm-modal-title">Record Consultation Fee</h3>
                            <button
                                type="button"
                                className="pm-modal-close-btn"
                                onClick={() => setShowRecordModal(false)}
                            >
                                <FiX />
                            </button>
                        </div>

                        <form onSubmit={handleRecordSubmit}>
                            <div className="pm-modal-body">
                                {recordError && (
                                    <div style={{ background: '#fef2f2', color: '#b91c1c', padding: '10px 14px', borderRadius: '8px', marginBottom: '14px', fontSize: '13px' }}>
                                        ⚠ {recordError}
                                    </div>
                                )}

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                    <div>
                                        <label className="pm-label">Select Patient / Appointment *</label>
                                        <select
                                            className="pm-select"
                                            value={recordForm.appointmentId}
                                            onChange={(e) => {
                                                const sel = unpaidAppts.find(a => a._id === e.target.value);
                                                setRecordForm(prev => ({
                                                    ...prev,
                                                    appointmentId: e.target.value,
                                                    amount: sel?.amount ? String(sel.amount) : prev.amount
                                                }));
                                            }}
                                            required
                                        >
                                            <option value="">-- Choose Consultation --</option>
                                            {unpaidAppts.map(a => {
                                                const pName = a.userId?.name || a.clinicPatientId?.name || 'Walk-in';
                                                const dStr = new Date(a.appointmentDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
                                                return (
                                                    <option key={a._id} value={a._id}>
                                                        {pName} ({dStr}) — Fee: ₹{a.amount || 0}
                                                    </option>
                                                );
                                            })}
                                        </select>
                                    </div>

                                    <div>
                                        <label className="pm-label">Amount Collected (₹) *</label>
                                        <input
                                            type="number"
                                            className="pm-input"
                                            min="0"
                                            placeholder="e.g. 500"
                                            value={recordForm.amount}
                                            onChange={(e) => setRecordForm({ ...recordForm, amount: e.target.value })}
                                            required
                                        />
                                    </div>

                                    <div>
                                        <label className="pm-label">Payment Method *</label>
                                        <select
                                            className="pm-select"
                                            value={recordForm.paymentMethod}
                                            onChange={(e) => setRecordForm({ ...recordForm, paymentMethod: e.target.value })}
                                        >
                                            <option value="Cash">Cash</option>
                                            <option value="UPI">UPI / QR Code</option>
                                            <option value="Card">Debit / Credit Card</option>
                                            <option value="Online">Online Bank Transfer</option>
                                        </select>
                                    </div>

                                    <div>
                                        <label className="pm-label">Transaction Reference / UPI ID (Optional)</label>
                                        <input
                                            type="text"
                                            className="pm-input"
                                            placeholder="e.g. UPI-98765432"
                                            value={recordForm.transactionId}
                                            onChange={(e) => setRecordForm({ ...recordForm, transactionId: e.target.value })}
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="pm-modal-footer">
                                <button
                                    type="button"
                                    className="pm-btn-secondary"
                                    onClick={() => setShowRecordModal(false)}
                                    disabled={savingFee}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="pm-btn-primary"
                                    disabled={savingFee}
                                >
                                    {savingFee ? 'Recording...' : 'Save Fee Collection'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MoneyTracker;

