import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
    FiSmartphone,
    FiFilter,
    FiMail,
    FiPhone,
    FiUser
} from 'react-icons/fi';
import './MoneyTracker.css';

const MoneyTracker = () => {
    const [summary, setSummary] = useState({
        daily: { total: 0, cash: 0, upi: 0, card: 0, other: 0 },
        weekly: { total: 0, cash: 0, upi: 0, card: 0, other: 0 },
        monthly: { total: 0, cash: 0, upi: 0, card: 0, other: 0 },
        total: { total: 0, cash: 0, upi: 0, card: 0, other: 0 }
    });
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(true);

    // Filters state
    const [periodFilter, setPeriodFilter] = useState('all'); // 'today' | 'week' | 'month' | 'all' | 'custom'
    const [customFrom, setCustomFrom] = useState('');
    const [customTo, setCustomTo] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedMethod, setSelectedMethod] = useState('all');

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

    // Fetch Financial Summary (Daily, Weekly, Monthly, Total)
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

    // Calculate start/end date based on period
    const getDateParams = useCallback(() => {
        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];

        if (periodFilter === 'today') {
            return { startDate: todayStr, endDate: todayStr };
        }
        if (periodFilter === 'week') {
            const d = new Date(now);
            const dayOfWeek = (d.getDay() + 6) % 7; // Mon = 0, Sun = 6
            d.setDate(d.getDate() - dayOfWeek);
            const mondayStr = d.toISOString().split('T')[0];
            return { startDate: mondayStr, endDate: todayStr };
        }
        if (periodFilter === 'month') {
            const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
            return { startDate: firstDay, endDate: todayStr };
        }
        if (periodFilter === 'custom') {
            return {
                startDate: customFrom || undefined,
                endDate: customTo || undefined
            };
        }
        return {};
    }, [periodFilter, customFrom, customTo]);

    // Fetch Transactions Ledger
    const loadTransactions = useCallback(async () => {
        setLoading(true);
        try {
            const dateParams = getDateParams();
            const params = {
                limit: 100,
                ...dateParams
            };
            if (selectedMethod && selectedMethod !== 'all') {
                params.paymentMethod = selectedMethod;
            }

            const res = await freeOpdAPI.getTransactions(params);
            if (res.success) {
                setTransactions(res.transactions || []);
            }
        } catch (err) {
            console.error('Error fetching transactions:', err);
        } finally {
            setLoading(false);
        }
    }, [getDateParams, selectedMethod]);

    useEffect(() => {
        loadSummary();
    }, [loadSummary]);

    useEffect(() => {
        if (periodFilter !== 'custom' || (customFrom && customTo)) {
            loadTransactions();
        }
    }, [periodFilter, selectedMethod, loadTransactions, customFrom, customTo]);

    // Client-side text search filter
    const filteredTransactions = useMemo(() => {
        if (!searchTerm.trim()) return transactions;
        const q = searchTerm.toLowerCase().trim();
        return transactions.filter(t => {
            const name = (t.patientName || '').toLowerCase();
            const phone = (t.patientPhone || '').toLowerCase();
            const email = (t.patientEmail || '').toLowerCase();
            const code = (t.patientCode || '').toLowerCase();
            const doc = (t.doctorName || '').toLowerCase();
            const txnId = (t.transactionId || '').toLowerCase();
            return name.includes(q) || phone.includes(q) || email.includes(q) || code.includes(q) || doc.includes(q) || txnId.includes(q);
        });
    }, [transactions, searchTerm]);

    // Open Record Fee Modal
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
            {/* ─────────────────────────────────────────────────────────────
               TOP 4 KPI CARDS: TODAY, THIS WEEK, THIS MONTH, TOTAL
               ───────────────────────────────────────────────────────────── */}
            <div className="mt-metrics-grid">
                {/* Card 1: Today */}
                <div className={`mt-metric-card ${periodFilter === 'today' ? 'active-filter-card' : ''}`}>
                    <div className="mt-metric-header">
                        <span className="mt-metric-title">Today's Collection</span>
                        <span className="mt-metric-pill today">Today</span>
                    </div>
                    <div className="mt-metric-amount" style={{ color: '#0d9488' }}>
                        ₹{(summary.daily?.total || 0).toLocaleString('en-IN')}
                    </div>
                    <div className="mt-metric-breakdown">
                        <span>💵 Cash: ₹{(summary.daily?.cash || 0).toLocaleString('en-IN')}</span>
                        <span>📱 UPI: ₹{(summary.daily?.upi || 0).toLocaleString('en-IN')}</span>
                        <span>💳 Card: ₹{(summary.daily?.card || 0).toLocaleString('en-IN')}</span>
                    </div>
                </div>

                {/* Card 2: This Week */}
                <div className={`mt-metric-card ${periodFilter === 'week' ? 'active-filter-card' : ''}`}>
                    <div className="mt-metric-header">
                        <span className="mt-metric-title">This Week</span>
                        <span className="mt-metric-pill week">Current Week</span>
                    </div>
                    <div className="mt-metric-amount" style={{ color: '#0284c7' }}>
                        ₹{(summary.weekly?.total || 0).toLocaleString('en-IN')}
                    </div>
                    <div className="mt-metric-breakdown">
                        <span>💵 Cash: ₹{(summary.weekly?.cash || 0).toLocaleString('en-IN')}</span>
                        <span>📱 UPI: ₹{(summary.weekly?.upi || 0).toLocaleString('en-IN')}</span>
                        <span>💳 Card: ₹{(summary.weekly?.card || 0).toLocaleString('en-IN')}</span>
                    </div>
                </div>

                {/* Card 3: This Month */}
                <div className={`mt-metric-card ${periodFilter === 'month' ? 'active-filter-card' : ''}`}>
                    <div className="mt-metric-header">
                        <span className="mt-metric-title">This Month</span>
                        <span className="mt-metric-pill month">Current Month</span>
                    </div>
                    <div className="mt-metric-amount" style={{ color: '#6366f1' }}>
                        ₹{(summary.monthly?.total || 0).toLocaleString('en-IN')}
                    </div>
                    <div className="mt-metric-breakdown">
                        <span>💵 Cash: ₹{(summary.monthly?.cash || 0).toLocaleString('en-IN')}</span>
                        <span>📱 UPI: ₹{(summary.monthly?.upi || 0).toLocaleString('en-IN')}</span>
                        <span>💳 Card: ₹{(summary.monthly?.card || 0).toLocaleString('en-IN')}</span>
                    </div>
                </div>

                {/* Card 4: Total */}
                <div className={`mt-metric-card ${periodFilter === 'all' ? 'active-filter-card' : ''}`}>
                    <div className="mt-metric-header">
                        <span className="mt-metric-title">Total Collection</span>
                        <span className="mt-metric-pill total">All-Time</span>
                    </div>
                    <div className="mt-metric-amount" style={{ color: '#0f172a' }}>
                        ₹{(summary.total?.total || 0).toLocaleString('en-IN')}
                    </div>
                    <div className="mt-metric-breakdown">
                        <span>Total Records: {transactions.length}</span>
                        {summary.pending?.amount > 0 && (
                            <span style={{ color: '#b45309' }}>⏳ Pending: ₹{summary.pending.amount}</span>
                        )}
                    </div>
                </div>
            </div>

            {/* ─────────────────────────────────────────────────────────────
               FILTER TOOLBAR: QUICK PERIODS + CUSTOM FILTER + SEARCH
               ───────────────────────────────────────────────────────────── */}
            <div className="mt-toolbar">
                <div className="mt-filter-group">
                    <div className="mt-period-buttons">
                        <button
                            type="button"
                            className={`mt-period-btn ${periodFilter === 'today' ? 'active' : ''}`}
                            onClick={() => setPeriodFilter('today')}
                        >
                            Today
                        </button>
                        <button
                            type="button"
                            className={`mt-period-btn ${periodFilter === 'week' ? 'active' : ''}`}
                            onClick={() => setPeriodFilter('week')}
                        >
                            This Week
                        </button>
                        <button
                            type="button"
                            className={`mt-period-btn ${periodFilter === 'month' ? 'active' : ''}`}
                            onClick={() => setPeriodFilter('month')}
                        >
                            This Month
                        </button>
                        <button
                            type="button"
                            className={`mt-period-btn ${periodFilter === 'all' ? 'active' : ''}`}
                            onClick={() => setPeriodFilter('all')}
                        >
                            All
                        </button>
                        <button
                            type="button"
                            className={`mt-period-btn ${periodFilter === 'custom' ? 'active' : ''}`}
                            onClick={() => setPeriodFilter('custom')}
                        >
                            <FiCalendar style={{ marginRight: '5px' }} />
                            Custom
                        </button>
                    </div>

                    {/* Custom Date Range Picker */}
                    {periodFilter === 'custom' && (
                        <div className="mt-custom-dates">
                            <div className="mt-date-input-wrap">
                                <label>From:</label>
                                <input
                                    type="date"
                                    className="mt-date-input"
                                    value={customFrom}
                                    onChange={(e) => setCustomFrom(e.target.value)}
                                />
                            </div>
                            <div className="mt-date-input-wrap">
                                <label>To:</label>
                                <input
                                    type="date"
                                    className="mt-date-input"
                                    value={customTo}
                                    onChange={(e) => setCustomTo(e.target.value)}
                                />
                            </div>
                            <button
                                type="button"
                                className="mt-apply-btn"
                                onClick={loadTransactions}
                            >
                                Apply
                            </button>
                        </div>
                    )}
                </div>

                <div className="mt-right-actions">
                    {/* Search by Patient details */}
                    <div className="mt-search-box">
                        <FiSearch className="mt-search-icon" />
                        <input
                            type="text"
                            placeholder="Search patient, UID, phone..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="mt-search-input"
                        />
                        {searchTerm && (
                            <button
                                type="button"
                                onClick={() => setSearchTerm('')}
                                className="mt-clear-search"
                            >
                                <FiX />
                            </button>
                        )}
                    </div>

                    {/* Payment Mode Selector */}
                    <select
                        className="mt-mode-select"
                        value={selectedMethod}
                        onChange={(e) => setSelectedMethod(e.target.value)}
                    >
                        <option value="all">All Modes</option>
                        <option value="Cash">Cash</option>
                        <option value="UPI">UPI</option>
                        <option value="Card">Card</option>
                        <option value="Online">Online</option>
                    </select>

                    {/* Record Payment Button */}
                    <button
                        type="button"
                        className="pm-action-btn-primary"
                        onClick={handleOpenRecordModal}
                    >
                        <FiPlus />
                        <span>Record Payment</span>
                    </button>
                </div>
            </div>

            {/* ─────────────────────────────────────────────────────────────
               TRANSACTIONS LINE-BY-LINE PAYMENT LEDGER
               ───────────────────────────────────────────────────────────── */}
            <div className="am-table-card">
                <div className="am-table-wrap">
                    <table className="am-table">
                        <thead>
                            <tr>
                                <th>Date & Time</th>
                                <th>Patient Name</th>
                                <th>Patient Details</th>
                                <th>Consultation / Doctor</th>
                                <th>Amount</th>
                                <th>Payment Mode</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan="7" style={{ textAlign: 'center', padding: '50px 20px', color: '#64748b' }}>
                                        <div style={{ fontSize: '24px', marginBottom: '8px' }}>⏳</div>
                                        <div>Loading payments ledger...</div>
                                    </td>
                                </tr>
                            ) : filteredTransactions.length === 0 ? (
                                <tr>
                                    <td colSpan="7" style={{ textAlign: 'center', padding: '50px 20px', color: '#64748b' }}>
                                        <div style={{ fontSize: '28px', marginBottom: '8px' }}>📋</div>
                                        <div style={{ fontWeight: 700, color: '#0f172a' }}>No payment records found</div>
                                        <div style={{ fontSize: '13px', marginTop: '4px' }}>
                                            {searchTerm || periodFilter !== 'all' ? 'Try adjusting your search or date filter' : 'No payments recorded yet.'}
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                filteredTransactions.map((t) => {
                                    const dateObj = new Date(t.date || t.createdAt);
                                    const dateStr = dateObj.toLocaleDateString('en-IN', {
                                        day: '2-digit', month: 'short', year: 'numeric'
                                    });
                                    const timeStr = dateObj.toLocaleTimeString('en-IN', {
                                        hour: '2-digit', minute: '2-digit', hour12: true
                                    });

                                    const mode = (t.paymentMethod || 'Cash').toLowerCase();
                                    const modeClass = mode.includes('upi') ? 'mt-badge-upi' : mode.includes('card') ? 'mt-badge-card' : mode.includes('online') ? 'mt-badge-online' : 'mt-badge-cash';

                                    return (
                                        <tr key={t._id}>
                                            <td>
                                                <div style={{ fontWeight: 700, color: '#0f172a' }}>{dateStr}</div>
                                                <div style={{ fontSize: '11px', color: '#64748b' }}>{timeStr}</div>
                                            </td>
                                            <td>
                                                <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '13.5px' }}>
                                                    {t.patientName || 'Patient'}
                                                </div>
                                            </td>
                                            <td>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                                    <div>
                                                        <span className="pm-patient-id-badge">{t.patientCode}</span>
                                                    </div>
                                                    {t.patientPhone && (
                                                        <div style={{ fontSize: '11.5px', color: '#475569', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                            <FiPhone style={{ fontSize: '10px' }} />
                                                            <span>{t.patientPhone}</span>
                                                        </div>
                                                    )}
                                                    {t.patientEmail && (
                                                        <div style={{ fontSize: '11px', color: '#0284c7', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                            <FiMail style={{ fontSize: '10px' }} />
                                                            <span>{t.patientEmail}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                            <td>
                                                <div style={{ fontSize: '12.5px', fontWeight: 600, color: '#334155' }}>
                                                    {t.doctorName || 'Doctor Consultation'}
                                                </div>
                                                {t.transactionId && (
                                                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                                                        Ref: {t.transactionId}
                                                    </div>
                                                )}
                                            </td>
                                            <td>
                                                <div style={{ fontSize: '15px', fontWeight: 800, color: '#0d9488' }}>
                                                    ₹{(Number(t.amount) || 0).toLocaleString('en-IN')}
                                                </div>
                                            </td>
                                            <td>
                                                <span className={`mt-mode-badge ${modeClass}`}>
                                                    {t.paymentMethod || 'Cash'}
                                                </span>
                                            </td>
                                            <td>
                                                <span style={{ fontSize: '12px', fontWeight: 700, color: '#059669', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                    <FiCheckCircle />
                                                    <span>{t.paymentStatus || 'Paid'}</span>
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
