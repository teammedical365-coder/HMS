import React, { useState, useEffect, useCallback } from 'react';
import { labAPI } from '../../utils/api';
import LabLayout from '../../components/lab/LabLayout';
import LabBillingModal from './LabBillingModal';
import './LabBillingDashboard.css';
import {
    FiDollarSign, FiCreditCard, FiClock, FiFileText,
    FiPlusCircle, FiPrinter, FiPercent, FiRotateCcw,
    FiEye, FiEyeOff, FiRefreshCw, FiAlertTriangle, FiCheckCircle,
    FiInbox, FiUsers, FiTrendingUp, FiActivity, FiArchive
} from 'react-icons/fi';

const LabBillingDashboard = () => {
    // Period & Filters
    const [period, setPeriod] = useState('today');
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [activeTab, setActiveTab] = useState('invoices'); // 'invoices', 'unbilled', 'payments', 'reports'

    // Sensitive Amount Visibility Flag (View Action Pattern)
    const [showAmounts, setShowAmounts] = useState(true);

    // Data States
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [metrics, setMetrics] = useState({});
    const [invoices, setInvoices] = useState([]);
    const [unbilledOrders, setUnbilledOrders] = useState([]);
    const [payments, setPayments] = useState([]);
    const [cashRegister, setCashRegister] = useState(null);
    const [collectionsReport, setCollectionsReport] = useState([]);
    const [staffReport, setStaffReport] = useState([]);

    // Modal Control State
    const [modalState, setModalState] = useState({
        open: false,
        type: '',
        data: null
    });

    // Helper: format currency with view/hide mask
    const fmt = (val) => {
        if (!showAmounts) return '••••••';
        const num = Number(val) || 0;
        return `₹${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    // Load All Billing Data
    const loadBillingData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [metricsRes, invoicesRes, ordersRes, paymentsRes, regRes] = await Promise.allSettled([
                labAPI.billing.getDashboardMetrics({ period }),
                labAPI.billing.getInvoices({ period, search, paymentStatus: statusFilter, limit: 50 }),
                labAPI.reception.getOrders({ limit: 100 }),
                labAPI.billing.getPayments({ period, limit: 50 }),
                labAPI.billing.getCashRegister()
            ]);

            if (metricsRes.status === 'fulfilled' && metricsRes.value?.success) {
                setMetrics(metricsRes.value.metrics || {});
            }
            if (invoicesRes.status === 'fulfilled' && invoicesRes.value?.success) {
                setInvoices(invoicesRes.value.invoices || []);
            }
            if (paymentsRes.status === 'fulfilled' && paymentsRes.value?.success) {
                setPayments(paymentsRes.value.payments || []);
            }
            if (regRes.status === 'fulfilled' && regRes.value?.success) {
                setCashRegister(regRes.value.register || null);
            }

            // Filter unbilled orders (all active clinical lab orders that don't yet have an invoice)
            if (ordersRes.status === 'fulfilled' && ordersRes.value?.success && ordersRes.value.orders) {
                const invoicesList = (invoicesRes.status === 'fulfilled' && invoicesRes.value?.invoices) ? invoicesRes.value.invoices : [];
                const billedOrderIds = new Set(invoicesList.map(inv => String(inv.orderId?._id || inv.orderId)));
                const unbilled = ordersRes.value.orders.filter(
                    ord => ord.status !== 'Cancelled' && !billedOrderIds.has(String(ord._id))
                );
                setUnbilledOrders(unbilled);
            }

            // If reports tab, load analytics
            if (activeTab === 'reports') {
                const [collRes, staffRes] = await Promise.allSettled([
                    labAPI.billing.getCollectionsReport({ period }),
                    labAPI.billing.getStaffReport({ period })
                ]);
                if (collRes.status === 'fulfilled' && collRes.value?.success) {
                    setCollectionsReport(collRes.value.collections || []);
                }
                if (staffRes.status === 'fulfilled' && staffRes.value?.success) {
                    setStaffReport(staffRes.value.staffCollections || []);
                }
            }

            if (metricsRes.status === 'rejected' && invoicesRes.status === 'rejected') {
                const errMsg = metricsRes.reason?.response?.data?.message || invoicesRes.reason?.response?.data?.message || 'Failed to load laboratory billing ledger.';
                setError(errMsg);
            }
        } catch (err) {
            console.error('[lab billing] error loading dashboard:', err);
            setError(err?.response?.data?.message || err?.message || 'Failed to load laboratory billing ledger. Please check your network connection.');
        } finally {
            setLoading(false);
        }
    }, [period, search, statusFilter, activeTab]);

    useEffect(() => {
        loadBillingData();
    }, [loadBillingData]);

    // Handle Quick Generate Invoice from Unbilled Order
    const handleGenerateInvoice = async (order) => {
        try {
            setLoading(true);
            const res = await labAPI.billing.generateInvoice({
                orderId: order._id,
                notes: `Generated at billing desk for order ${order.orderNumber}`
            });
            if (res.success) {
                // Refresh list and open payment modal for immediate settlement
                await loadBillingData();
                setModalState({
                    open: true,
                    type: 'record_payment',
                    data: res.invoice
                });
            }
        } catch (err) {
            alert(err.response?.data?.message || err.message || 'Failed to generate invoice');
        } finally {
            setLoading(false);
        }
    };

    // Open Print Invoice Modal
    const handleOpenPrintInvoice = async (inv) => {
        try {
            const res = await labAPI.billing.getInvoicePrint(inv._id);
            if (res.success) {
                setModalState({
                    open: true,
                    type: 'invoice_print',
                    data: res.printData
                });
            }
        } catch (err) {
            alert('Failed to load invoice print details');
        }
    };

    // Open Print Receipt Modal
    const handleOpenPrintReceipt = async (pay) => {
        try {
            const res = await labAPI.billing.getPaymentReceipt(pay._id);
            if (res.success) {
                setModalState({
                    open: true,
                    type: 'receipt_print',
                    data: res.receiptData
                });
            }
        } catch (err) {
            alert('Failed to load receipt details');
        }
    };

    return (
        <LabLayout
            title="Laboratory Billing & Accounts"
            subtitle="Central Invoicing, Fee Collection, Payment Reconciliation & Shift Cash Register"
        >
            <div className="lbd-workstation">
                {/* 1. TOP BAR: Date Filters & Shift Register Status */}
                <div className="lbd-top-bar">
                    <div className="lbd-period-filters">
                        <span style={{ fontSize: '13px', fontWeight: 600, color: '#64748b', marginRight: '4px' }}>
                            Period:
                        </span>
                        {['today', 'week', 'month', 'overall'].map((p) => (
                            <button
                                key={p}
                                onClick={() => setPeriod(p)}
                                className={`lbd-period-btn ${period === p ? 'active' : ''}`}
                            >
                                {p === 'today' ? "Today" : p === 'week' ? "This Week" : p === 'month' ? "This Month" : "Overall"}
                            </button>
                        ))}
                    </div>

                    <div className="lbd-actions-group">
                        {/* Sensitive Amounts Visibility Toggle */}
                        <button
                            onClick={() => setShowAmounts(!showAmounts)}
                            className="lbd-toggle-eye-btn"
                            title={showAmounts ? "Hide sensitive financial figures" : "View sensitive financial figures"}
                        >
                            {showAmounts ? <><FiEyeOff /> Mask Amounts</> : <><FiEye /> View Amounts</>}
                        </button>

                        {/* Shift Cash Register Badge */}
                        <div
                            onClick={() => setModalState({
                                open: true,
                                type: 'cash_register',
                                data: { isOpen: cashRegister?.status === 'OPEN', register: cashRegister }
                            })}
                            className={`lbd-register-badge ${cashRegister?.status === 'OPEN' ? 'lbd-register-open' : 'lbd-register-closed'}`}
                            title="Click to manage shift cash drawer"
                        >
                            <FiArchive />
                            {cashRegister?.status === 'OPEN' ? (
                                <span>Shift Drawer: <strong>OPEN ({fmt(cashRegister.expectedClosingBalance || cashRegister.openingBalance)})</strong></span>
                            ) : (
                                <span>Shift Drawer: <strong>CLOSED</strong> (Click to Open)</span>
                            )}
                        </div>

                        {/* Refresh Button */}
                        <button onClick={loadBillingData} className="lbd-btn-action" title="Refresh data">
                            <FiRefreshCw className={loading ? 'spin' : ''} /> Refresh
                        </button>
                    </div>
                </div>

                {/* Error Banner */}
                {error && (
                    <div style={{ padding: '12px 16px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#b91c1c', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <FiAlertTriangle /> {error}
                    </div>
                )}

                {/* 2. FINANCIAL SUMMARY KPI CARDS */}
                <div className="lbd-stats-grid">
                    {/* Gross Billed */}
                    <div className="lbd-stat-card">
                        <div className="lbd-stat-header">
                            <div className="lbd-stat-icon" style={{ background: '#f1f5f9', color: '#475569' }}>
                                <FiFileText />
                            </div>
                            <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748b' }}>
                                {metrics.invoiceCounts?.total || 0} INVOICES
                            </span>
                        </div>
                        <div className="lbd-stat-val">{fmt(metrics.totalBilledNet || 0)}</div>
                        <div className="lbd-stat-lbl">Net Billed Revenue</div>
                        <div className="lbd-stat-sub">
                            <span>Gross: {fmt(metrics.totalBilledGross || 0)}</span>
                            <span>Disc: {fmt(metrics.totalDiscountGiven || 0)}</span>
                        </div>
                    </div>

                    {/* Total Collections */}
                    <div className="lbd-stat-card">
                        <div className="lbd-stat-header">
                            <div className="lbd-stat-icon" style={{ background: '#ecfdf5', color: '#059669' }}>
                                <FiDollarSign />
                            </div>
                            <span style={{ fontSize: '11px', fontWeight: 700, color: '#059669' }}>
                                NET: {fmt(metrics.netCollection || 0)}
                            </span>
                        </div>
                        <div className="lbd-stat-val" style={{ color: '#059669' }}>{fmt(metrics.totalCollection || 0)}</div>
                        <div className="lbd-stat-lbl">Total Fee Collections</div>
                        <div className="lbd-stat-sub">
                            <span>Cash: {fmt(metrics.cashCollection || 0)}</span>
                            <span>UPI: {fmt(metrics.upiCollection || 0)}</span>
                            <span>Card: {fmt(metrics.cardCollection || 0)}</span>
                        </div>
                    </div>

                    {/* Outstanding Dues */}
                    <div className="lbd-stat-card">
                        <div className="lbd-stat-header">
                            <div className="lbd-stat-icon" style={{ background: '#fffbeb', color: '#d97706' }}>
                                <FiClock />
                            </div>
                            <span style={{ fontSize: '11px', fontWeight: 700, color: '#d97706' }}>
                                {metrics.invoiceCounts?.partiallyPaid || 0} PARTIAL
                            </span>
                        </div>
                        <div className="lbd-stat-val" style={{ color: '#d97706' }}>{fmt(metrics.totalOutstandingDue || 0)}</div>
                        <div className="lbd-stat-lbl">Outstanding Dues</div>
                        <div className="lbd-stat-sub">
                            <span>Unpaid Bills: {metrics.invoiceCounts?.unpaid || 0}</span>
                            <span>Paid Bills: {metrics.invoiceCounts?.paid || 0}</span>
                        </div>
                    </div>

                    {/* Refunds Processed */}
                    <div className="lbd-stat-card">
                        <div className="lbd-stat-header">
                            <div className="lbd-stat-icon" style={{ background: '#fef2f2', color: '#dc2626' }}>
                                <FiRotateCcw />
                            </div>
                            <span style={{ fontSize: '11px', fontWeight: 700, color: '#dc2626' }}>
                                AUDITED
                            </span>
                        </div>
                        <div className="lbd-stat-val" style={{ color: '#dc2626' }}>{fmt(metrics.totalRefunds || 0)}</div>
                        <div className="lbd-stat-lbl">Refunds Processed</div>
                        <div className="lbd-stat-sub">
                            <span>Net Kept: {fmt(metrics.netCollection || 0)}</span>
                        </div>
                    </div>
                </div>

                {/* 3. WORKSTATION TABS */}
                <div>
                    <div className="lbd-tabs-bar">
                        <button
                            onClick={() => setActiveTab('invoices')}
                            className={`lbd-tab-btn ${activeTab === 'invoices' ? 'active' : ''}`}
                        >
                            <FiFileText /> Invoices Ledger
                            <span className="lbd-tab-badge">{invoices.length}</span>
                        </button>

                        <button
                            onClick={() => setActiveTab('unbilled')}
                            className={`lbd-tab-btn ${activeTab === 'unbilled' ? 'active' : ''}`}
                        >
                            <FiInbox /> Orders to Bill
                            {unbilledOrders.length > 0 && (
                                <span className="lbd-tab-badge" style={{ background: '#fef3c7', color: '#b45309' }}>
                                    {unbilledOrders.length} New
                                </span>
                            )}
                        </button>

                        <button
                            onClick={() => setActiveTab('payments')}
                            className={`lbd-tab-btn ${activeTab === 'payments' ? 'active' : ''}`}
                        >
                            <FiCreditCard /> Payment Collections & Receipts
                            <span className="lbd-tab-badge">{payments.length}</span>
                        </button>

                        <button
                            onClick={() => setActiveTab('reports')}
                            className={`lbd-tab-btn ${activeTab === 'reports' ? 'active' : ''}`}
                        >
                            <FiTrendingUp /> Collection Analytics & Shifts
                        </button>
                    </div>

                    {/* TAB CONTENT CONTAINER */}
                    <div className="lbd-card">
                        {/* -------------------------------------------------------------
                            TAB 1: INVOICES LEDGER
                           ------------------------------------------------------------- */}
                        {activeTab === 'invoices' && (
                            <>
                                <div className="lbd-filter-row">
                                    <input
                                        type="text"
                                        placeholder="Search by invoice #, order #, patient name, UHID, or phone..."
                                        value={search}
                                        onChange={(e) => setSearch(e.target.value)}
                                        className="lbd-search-input"
                                    />
                                    <select
                                        value={statusFilter}
                                        onChange={(e) => setStatusFilter(e.target.value)}
                                        className="lbd-status-select"
                                    >
                                        <option value="">All Payment Statuses</option>
                                        <option value="UNPAID">Unpaid</option>
                                        <option value="PARTIALLY_PAID">Partially Paid</option>
                                        <option value="PAID">Fully Paid</option>
                                    </select>
                                </div>

                                {invoices.length === 0 ? (
                                    <div className="lbd-empty-state">
                                        <FiFileText />
                                        <h3>No Invoices Found</h3>
                                        <p>No invoices match the selected filter criteria or period.</p>
                                    </div>
                                ) : (
                                    <div className="lbd-table-wrapper">
                                        <table className="lbd-table">
                                            <thead>
                                                <tr>
                                                    <th>Invoice No</th>
                                                    <th>Date</th>
                                                    <th>Patient Demographics</th>
                                                    <th>Order Ref</th>
                                                    <th className="lbd-table-right">Net (₹)</th>
                                                    <th className="lbd-table-right">Paid (₹)</th>
                                                    <th className="lbd-table-right">Due (₹)</th>
                                                    <th>Status</th>
                                                    <th className="lbd-table-right">Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {invoices.map((inv) => (
                                                    <tr key={inv._id}>
                                                        <td>
                                                            <strong style={{ color: '#2563eb' }}>{inv.invoiceNumber}</strong>
                                                        </td>
                                                        <td>{new Date(inv.createdAt).toLocaleDateString()}</td>
                                                        <td>
                                                            <div><strong>{inv.patientSnapshot?.name}</strong></div>
                                                            <div style={{ fontSize: '11px', color: '#64748b' }}>
                                                                UHID: {inv.patientSnapshot?.uhid || 'N/A'} • {inv.patientSnapshot?.phone}
                                                            </div>
                                                        </td>
                                                        <td>
                                                            <span style={{ fontSize: '12px', color: '#475569' }}>{inv.orderNumber}</span>
                                                        </td>
                                                        <td className="lbd-table-right font-mono">
                                                            <strong>{fmt(inv.pricing?.netAmount)}</strong>
                                                        </td>
                                                        <td className="lbd-table-right font-mono" style={{ color: '#059669' }}>
                                                            {fmt(inv.pricing?.paidAmount)}
                                                        </td>
                                                        <td className="lbd-table-right font-mono" style={{ color: inv.pricing?.dueAmount > 0 ? '#dc2626' : '#64748b', fontWeight: 700 }}>
                                                            {fmt(inv.pricing?.dueAmount)}
                                                        </td>
                                                        <td>
                                                            <span className={`lbd-badge ${inv.paymentStatus === 'PAID' ? 'lbd-badge-paid' : inv.paymentStatus === 'PARTIALLY_PAID' ? 'lbd-badge-partial' : 'lbd-badge-unpaid'}`}>
                                                                {inv.paymentStatus}
                                                            </span>
                                                        </td>
                                                        <td className="lbd-table-right">
                                                            <div className="lbd-row-actions">
                                                                <button
                                                                    onClick={() => handleOpenPrintInvoice(inv)}
                                                                    className="lbd-btn-action"
                                                                    title="View & Print Official Invoice"
                                                                >
                                                                    <FiPrinter /> Print
                                                                </button>

                                                                {inv.pricing?.dueAmount > 0 && (
                                                                    <button
                                                                        onClick={() => setModalState({
                                                                            open: true,
                                                                            type: 'record_payment',
                                                                            data: inv
                                                                        })}
                                                                        className="lbd-btn-action lbd-btn-action-success"
                                                                        title="Collect Fee / Record Payment"
                                                                    >
                                                                        <FiDollarSign /> Collect
                                                                    </button>
                                                                )}

                                                                {inv.pricing?.dueAmount > 0 && (
                                                                    <button
                                                                        onClick={() => setModalState({
                                                                            open: true,
                                                                            type: 'apply_discount',
                                                                            data: inv
                                                                        })}
                                                                        className="lbd-btn-action"
                                                                        title="Apply Special Discount"
                                                                    >
                                                                        <FiPercent /> Disc
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </>
                        )}

                        {/* -------------------------------------------------------------
                            TAB 2: ORDERS TO BILL (UNBILLED ORDERS)
                           ------------------------------------------------------------- */}
                        {activeTab === 'unbilled' && (
                            <>
                                <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '16px' }}>
                                    The following Phase 4 confirmed laboratory requisitions have been booked at reception and are ready for invoicing & fee collection.
                                </p>

                                {unbilledOrders.length === 0 ? (
                                    <div className="lbd-empty-state">
                                        <FiCheckCircle style={{ color: '#059669' }} />
                                        <h3>All Requisitions Invoiced!</h3>
                                        <p>There are no pending unbilled orders at the intake desk.</p>
                                    </div>
                                ) : (
                                    <div className="lbd-table-wrapper">
                                        <table className="lbd-table">
                                            <thead>
                                                <tr>
                                                    <th>Order Number</th>
                                                    <th>Token</th>
                                                    <th>Patient Details</th>
                                                    <th>Booked Items</th>
                                                    <th>Referring Doctor</th>
                                                    <th className="lbd-table-right">Expected Amount (₹)</th>
                                                    <th className="lbd-table-right">Action</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {unbilledOrders.map((ord) => (
                                                    <tr key={ord._id}>
                                                        <td>
                                                            <strong style={{ color: '#2563eb' }}>{ord.orderNumber}</strong>
                                                        </td>
                                                        <td>
                                                            <span style={{ padding: '2px 8px', background: '#f1f5f9', borderRadius: '6px', fontWeight: 700 }}>
                                                                TKN-{ord.tokenNumber}
                                                            </span>
                                                        </td>
                                                        <td>
                                                            <div><strong>{ord.patientSnapshot?.name}</strong></div>
                                                            <div style={{ fontSize: '11px', color: '#64748b' }}>
                                                                UHID: {ord.patientSnapshot?.uhid || 'N/A'} • {ord.patientSnapshot?.phone}
                                                            </div>
                                                        </td>
                                                        <td>
                                                            <span style={{ fontSize: '12px' }}>
                                                                {(ord.tests?.length || 0)} Tests, {(ord.packages?.length || 0)} Packages
                                                            </span>
                                                        </td>
                                                        <td>{ord.referringDoctorName || 'Self / Walk-in'}</td>
                                                        <td className="lbd-table-right font-mono">
                                                            <strong>{fmt(ord.pricing?.netAmount)}</strong>
                                                        </td>
                                                        <td className="lbd-table-right">
                                                            <button
                                                                onClick={() => handleGenerateInvoice(ord)}
                                                                className="lbd-btn-action lbd-btn-action-primary"
                                                            >
                                                                <FiPlusCircle /> Generate Invoice
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </>
                        )}

                        {/* -------------------------------------------------------------
                            TAB 3: PAYMENT COLLECTIONS & RECEIPTS
                           ------------------------------------------------------------- */}
                        {activeTab === 'payments' && (
                            <>
                                {payments.length === 0 ? (
                                    <div className="lbd-empty-state">
                                        <FiCreditCard />
                                        <h3>No Payments Recorded</h3>
                                        <p>No payment transactions found for this period.</p>
                                    </div>
                                ) : (
                                    <div className="lbd-table-wrapper">
                                        <table className="lbd-table">
                                            <thead>
                                                <tr>
                                                    <th>Receipt / Payment No</th>
                                                    <th>Timestamp</th>
                                                    <th>Patient Name</th>
                                                    <th>Invoice Ref</th>
                                                    <th>Mode</th>
                                                    <th>Reference / UTR</th>
                                                    <th className="lbd-table-right">Collected (₹)</th>
                                                    <th>Cashier</th>
                                                    <th className="lbd-table-right">Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {payments.map((p) => (
                                                    <tr key={p._id}>
                                                        <td>
                                                            <strong style={{ color: '#059669' }}>{p.paymentNumber}</strong>
                                                        </td>
                                                        <td>{new Date(p.paymentDate).toLocaleString()}</td>
                                                        <td>
                                                            <strong>{p.patientSnapshot?.name}</strong>
                                                            <div style={{ fontSize: '11px', color: '#64748b' }}>
                                                                {p.patientSnapshot?.uhid}
                                                            </div>
                                                        </td>
                                                        <td>{p.invoiceNumber}</td>
                                                        <td>
                                                            <span className="lbd-badge-method">{p.paymentMethod}</span>
                                                        </td>
                                                        <td>{p.transactionReference || '-'}</td>
                                                        <td className="lbd-table-right font-mono" style={{ color: '#059669', fontWeight: 700 }}>
                                                            {fmt(p.amount)}
                                                        </td>
                                                        <td>{p.receivedByName || 'Lab Staff'}</td>
                                                        <td className="lbd-table-right">
                                                            <div className="lbd-row-actions">
                                                                <button
                                                                    onClick={() => handleOpenPrintReceipt(p)}
                                                                    className="lbd-btn-action"
                                                                    title="View & Print Payment Receipt"
                                                                >
                                                                    <FiPrinter /> Receipt
                                                                </button>

                                                                {p.amount > (p.refundedAmount || 0) && (
                                                                    <button
                                                                        onClick={() => setModalState({
                                                                            open: true,
                                                                            type: 'process_refund',
                                                                            data: p
                                                                        })}
                                                                        className="lbd-btn-action"
                                                                        style={{ color: '#dc2626' }}
                                                                        title="Process Refund"
                                                                    >
                                                                        <FiRotateCcw /> Refund
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </>
                        )}

                        {/* -------------------------------------------------------------
                            TAB 4: COLLECTION ANALYTICS & SHIFT REPORTS
                           ------------------------------------------------------------- */}
                        {activeTab === 'reports' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                                {/* Daily Collections Table */}
                                <div>
                                    <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a', marginBottom: '12px' }}>
                                        Daily Collections Breakdown
                                    </h3>
                                    <table className="lbd-table">
                                        <thead>
                                            <tr>
                                                <th>Date</th>
                                                <th>Transactions</th>
                                                <th className="lbd-table-right">Cash (₹)</th>
                                                <th className="lbd-table-right">UPI (₹)</th>
                                                <th className="lbd-table-right">Card (₹)</th>
                                                <th className="lbd-table-right">Total Collection (₹)</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {collectionsReport.map((c, i) => (
                                                <tr key={i}>
                                                    <td><strong>{c.date}</strong></td>
                                                    <td>{c.transactionCount}</td>
                                                    <td className="lbd-table-right font-mono">{fmt(c.cash)}</td>
                                                    <td className="lbd-table-right font-mono">{fmt(c.upi)}</td>
                                                    <td className="lbd-table-right font-mono">{fmt(c.card)}</td>
                                                    <td className="lbd-table-right font-mono" style={{ color: '#059669', fontWeight: 700 }}>
                                                        {fmt(c.totalAmount)}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Staff-wise Collections Table */}
                                <div>
                                    <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a', marginBottom: '12px' }}>
                                        Staff / Cashier Reconciliation Report
                                    </h3>
                                    <table className="lbd-table">
                                        <thead>
                                            <tr>
                                                <th>Staff Member</th>
                                                <th>Transactions</th>
                                                <th className="lbd-table-right">Cash Collected (₹)</th>
                                                <th className="lbd-table-right">Digital Collected (₹)</th>
                                                <th className="lbd-table-right">Total Remittance (₹)</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {staffReport.map((s, i) => (
                                                <tr key={i}>
                                                    <td><strong>{s.staffName}</strong></td>
                                                    <td>{s.transactionCount}</td>
                                                    <td className="lbd-table-right font-mono">{fmt(s.cashCollected)}</td>
                                                    <td className="lbd-table-right font-mono">{fmt(s.digitalCollected)}</td>
                                                    <td className="lbd-table-right font-mono" style={{ color: '#2563eb', fontWeight: 700 }}>
                                                        {fmt(s.totalCollected)}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* POPUP MODAL DISPATCHER */}
            {modalState.open && (
                <LabBillingModal
                    type={modalState.type}
                    data={modalState.data}
                    onClose={() => setModalState({ open: false, type: '', data: null })}
                    onSuccess={() => {
                        loadBillingData();
                    }}
                />
            )}
        </LabLayout>
    );
};

export default LabBillingDashboard;
