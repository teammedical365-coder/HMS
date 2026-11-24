import React, { useState, useEffect } from 'react';
import { labAPI } from '../../utils/api';
import './LabBillingModal.css';
import {
    FiX, FiPrinter, FiDollarSign, FiPercent, FiRotateCcw,
    FiCheckCircle, FiAlertTriangle, FiFileText, FiCreditCard
} from 'react-icons/fi';

const LabBillingModal = ({
    type, // 'invoice_print', 'receipt_print', 'record_payment', 'apply_discount', 'process_refund', 'patient_advance', 'cash_register'
    data, // context payload (invoice, payment, order, etc.)
    onClose,
    onSuccess
}) => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // Payment Form State
    const [payAmount, setPayAmount] = useState(data?.pricing?.dueAmount || '');
    const [paymentMethod, setPaymentMethod] = useState('Cash');
    const [transactionRef, setTransactionRef] = useState('');
    const [paymentNotes, setPaymentNotes] = useState('');
    const [availableAdvance, setAvailableAdvance] = useState(0);

    // Discount Form State
    const [discType, setDiscType] = useState('fixed');
    const [discValue, setDiscValue] = useState('');
    const [discReason, setDiscReason] = useState('');

    // Refund Form State
    const [refundAmount, setRefundAmount] = useState('');
    const [refundMethod, setRefundMethod] = useState('Cash');
    const [refundReason, setRefundReason] = useState('');

    // Advance Form State
    const [advanceAmount, setAdvanceAmount] = useState('');
    const [advanceMethod, setAdvanceMethod] = useState('Cash');
    const [advanceRef, setAdvanceRef] = useState('');
    const [advanceNotes, setAdvanceNotes] = useState('');

    // Cash Register Form State
    const [openBalance, setOpenBalance] = useState('');
    const [closeActualBalance, setCloseActualBalance] = useState('');
    const [closingNotes, setClosingNotes] = useState('');

    // Load available advance if paying or viewing advance
    useEffect(() => {
        if ((type === 'record_payment' || type === 'patient_advance') && data?.patientId) {
            labAPI.billing.getAdvanceBalance(data.patientId)
                .then(res => {
                    if (res.success) setAvailableAdvance(res.availableBalance || 0);
                })
                .catch(() => {});
        }
    }, [type, data]);

    const handlePrint = () => {
        window.print();
    };

    // 1. Submit Payment
    const handleRecordPayment = async (e) => {
        e.preventDefault();
        setError('');
        const amt = Number(payAmount);
        if (!amt || amt <= 0) {
            setError('Please enter a valid payment amount greater than zero.');
            return;
        }
        if (amt > (data?.pricing?.dueAmount || 0)) {
            setError(`Amount cannot exceed the current outstanding due of ₹${data?.pricing?.dueAmount}`);
            return;
        }
        if (paymentMethod === 'Advance Adjustment' && amt > availableAdvance) {
            setError(`Insufficient patient advance: Available ₹${availableAdvance}, requested ₹${amt}`);
            return;
        }

        setLoading(true);
        try {
            const res = await labAPI.billing.recordPayment({
                invoiceId: data._id,
                amount: amt,
                paymentMethod,
                transactionReference: transactionRef,
                notes: paymentNotes
            });
            if (res.success) {
                onSuccess(res);
                onClose();
            } else {
                setError(res.message || 'Payment recording failed');
            }
        } catch (err) {
            setError(err.response?.data?.message || err.message || 'Error processing payment');
        } finally {
            setLoading(false);
        }
    };

    // 2. Submit Discount
    const handleApplyDiscount = async (e) => {
        e.preventDefault();
        setError('');
        const val = Number(discValue);
        if (!val || val <= 0) {
            setError('Please enter a valid positive discount value.');
            return;
        }
        if (discType === 'percentage' && val > 100) {
            setError('Percentage discount cannot exceed 100%.');
            return;
        }
        if (!discReason.trim()) {
            setError('Discount reason is mandatory for clinical audit.');
            return;
        }

        setLoading(true);
        try {
            const res = await labAPI.billing.applyDiscount(data._id, {
                type: discType,
                value: val,
                reason: discReason
            });
            if (res.success) {
                onSuccess(res);
                onClose();
            } else {
                setError(res.message || 'Failed to apply discount');
            }
        } catch (err) {
            setError(err.response?.data?.message || err.message || 'Error applying discount');
        } finally {
            setLoading(false);
        }
    };

    // 3. Submit Refund
    const handleProcessRefund = async (e) => {
        e.preventDefault();
        setError('');
        const amt = Number(refundAmount);
        const maxRefundable = Math.max(0, (data?.amount || 0) - (data?.refundedAmount || 0));

        if (!amt || amt <= 0) {
            setError('Please enter a valid refund amount.');
            return;
        }
        if (amt > maxRefundable) {
            setError(`Refund amount cannot exceed max refundable of ₹${maxRefundable}`);
            return;
        }
        if (!refundReason.trim()) {
            setError('Refund reason is required for financial auditing.');
            return;
        }

        setLoading(true);
        try {
            const res = await labAPI.billing.processRefund({
                paymentId: data._id,
                amount: amt,
                refundMethod,
                reason: refundReason
            });
            if (res.success) {
                onSuccess(res);
                onClose();
            } else {
                setError(res.message || 'Failed to process refund');
            }
        } catch (err) {
            setError(err.response?.data?.message || err.message || 'Error processing refund');
        } finally {
            setLoading(false);
        }
    };

    // 4. Submit Patient Advance Deposit
    const handleDepositAdvance = async (e) => {
        e.preventDefault();
        setError('');
        const amt = Number(advanceAmount);
        if (!amt || amt <= 0) {
            setError('Please enter a valid advance deposit amount.');
            return;
        }

        setLoading(true);
        try {
            const res = await labAPI.billing.depositAdvance({
                patientId: data.patientId || data._id,
                amount: amt,
                paymentMethod: advanceMethod,
                transactionReference: advanceRef,
                notes: advanceNotes
            });
            if (res.success) {
                onSuccess(res);
                onClose();
            } else {
                setError(res.message || 'Failed to deposit advance');
            }
        } catch (err) {
            setError(err.response?.data?.message || err.message || 'Error depositing advance');
        } finally {
            setLoading(false);
        }
    };

    // 5. Submit Cash Register Action
    const handleCashRegisterAction = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            if (data?.isOpen) {
                // Close Shift
                const res = await labAPI.billing.closeCashRegister({
                    actualClosingBalance: Number(closeActualBalance),
                    closingNotes
                });
                if (res.success) {
                    onSuccess(res);
                    onClose();
                } else {
                    setError(res.message || 'Failed to close register');
                }
            } else {
                // Open Shift
                const res = await labAPI.billing.openCashRegister({
                    openingBalance: Number(openBalance) || 0,
                    notes: closingNotes
                });
                if (res.success) {
                    onSuccess(res);
                    onClose();
                } else {
                    setError(res.message || 'Failed to open register');
                }
            }
        } catch (err) {
            setError(err.response?.data?.message || err.message || 'Error processing cash register action');
        } finally {
            setLoading(false);
        }
    };

    // =========================================================================
    // RENDER LOGIC
    // =========================================================================

    return (
        <div className="lbm-overlay">
            <div className={`lbm-card ${type.includes('print') ? 'lbm-card-wide' : ''}`}>
                {/* Header */}
                <div className="lbm-hdr">
                    <div className="lbm-hdr-title">
                        {type === 'invoice_print' && <><FiFileText /> Laboratory Diagnostic Invoice</>}
                        {type === 'receipt_print' && <><FiCheckCircle /> Payment Collection Receipt</>}
                        {type === 'record_payment' && <><FiDollarSign /> Record Fee Collection</>}
                        {type === 'apply_discount' && <><FiPercent /> Apply Commercial Discount</>}
                        {type === 'process_refund' && <><FiRotateCcw /> Process Financial Refund</>}
                        {type === 'patient_advance' && <><FiCreditCard /> Patient Advance Ledger</>}
                        {type === 'cash_register' && <><FiDollarSign /> {data?.isOpen ? 'Close Shift Cash Register' : 'Open Shift Cash Register'}</>}
                    </div>
                    <div className="lbm-hdr-actions">
                        {type.includes('print') && (
                            <button onClick={handlePrint} className="lbm-btn-print">
                                <FiPrinter /> Print Document
                            </button>
                        )}
                        <button onClick={onClose} className="lbm-btn-close">
                            <FiX />
                        </button>
                    </div>
                </div>

                {/* Error Banner */}
                {error && (
                    <div style={{ margin: '16px 24px 0', padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#b91c1c', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                        <FiAlertTriangle /> {error}
                    </div>
                )}

                {/* MODAL BODY */}
                <div className="lbm-body">
                    {/* -------------------------------------------------------------
                        1. INVOICE PRINT VIEW
                       ------------------------------------------------------------- */}
                    {type === 'invoice_print' && (
                        <div className="lbm-paper">
                            <div className="lbm-doc-hdr">
                                <div className="lbm-doc-brand">
                                    <h1>{data?.hospital?.name || 'Medical365 Laboratory'}</h1>
                                    <p>{data?.hospital?.address || 'Clinical Diagnostics Centre, Healthcare City'}</p>
                                    <p>Phone: {data?.hospital?.phone || '1800-365-LABS'} | GSTIN: {data?.hospital?.gstin || '27AAAAA0000A1Z5'}</p>
                                </div>
                                <div className="lbm-doc-badge-col">
                                    <div className="lbm-doc-badge">LAB INVOICE</div>
                                    <div className="lbm-doc-num">{data?.invoice?.invoiceNumber}</div>
                                    <div style={{ fontSize: '11px', color: '#64748b' }}>
                                        Date: {new Date(data?.invoice?.createdAt).toLocaleDateString()}
                                    </div>
                                </div>
                            </div>

                            <div className="lbm-doc-meta-grid">
                                <div>
                                    <div className="lbm-meta-row">
                                        <span className="lbm-meta-lbl">Patient Name:</span>
                                        <span className="lbm-meta-val">{data?.invoice?.patientSnapshot?.name}</span>
                                    </div>
                                    <div className="lbm-meta-row">
                                        <span className="lbm-meta-lbl">UHID / MRN:</span>
                                        <span className="lbm-meta-val">{data?.invoice?.patientSnapshot?.uhid || data?.invoice?.patientSnapshot?.mrn || 'N/A'}</span>
                                    </div>
                                    <div className="lbm-meta-row">
                                        <span className="lbm-meta-lbl">Age / Gender:</span>
                                        <span className="lbm-meta-val">{data?.invoice?.patientSnapshot?.age || '-'} Y / {data?.invoice?.patientSnapshot?.gender}</span>
                                    </div>
                                    <div className="lbm-meta-row">
                                        <span className="lbm-meta-lbl">Phone:</span>
                                        <span className="lbm-meta-val">{data?.invoice?.patientSnapshot?.phone}</span>
                                    </div>
                                </div>
                                <div>
                                    <div className="lbm-meta-row">
                                        <span className="lbm-meta-lbl">Order No:</span>
                                        <span className="lbm-meta-val">{data?.invoice?.orderNumber}</span>
                                    </div>
                                    <div className="lbm-meta-row">
                                        <span className="lbm-meta-lbl">Referring Doctor:</span>
                                        <span className="lbm-meta-val">{data?.invoice?.referringDoctorName || 'Self / Walk-in'}</span>
                                    </div>
                                    <div className="lbm-meta-row">
                                        <span className="lbm-meta-lbl">Payment Status:</span>
                                        <span className="lbm-meta-val" style={{ color: data?.invoice?.paymentStatus === 'PAID' ? '#059669' : '#dc2626' }}>
                                            {data?.invoice?.paymentStatus}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Table of Items */}
                            <table className="lbm-table">
                                <thead>
                                    <tr>
                                        <th>#</th>
                                        <th>Investigation / Profile</th>
                                        <th>Code</th>
                                        <th className="lbm-text-right">Qty</th>
                                        <th className="lbm-text-right">Rate (₹)</th>
                                        <th className="lbm-text-right">Discount (₹)</th>
                                        <th className="lbm-text-right">Net Amount (₹)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(data?.invoice?.items || []).map((it, idx) => (
                                        <tr key={idx}>
                                            <td>{idx + 1}</td>
                                            <td><strong>{it.name}</strong> <span style={{ fontSize: '11px', color: '#64748b' }}>({it.itemType})</span></td>
                                            <td>{it.code}</td>
                                            <td className="lbm-text-right">{it.quantity}</td>
                                            <td className="lbm-text-right">{it.unitPrice.toFixed(2)}</td>
                                            <td className="lbm-text-right">{it.discount.toFixed(2)}</td>
                                            <td className="lbm-text-right">{it.amount.toFixed(2)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>

                            {/* Pricing Summary */}
                            <div className="lbm-pricing-summary">
                                <div className="lbm-pricing-box">
                                    <div className="lbm-price-row">
                                        <span>Gross Standard Total:</span>
                                        <span>₹{(data?.invoice?.pricing?.grossAmount || 0).toFixed(2)}</span>
                                    </div>
                                    <div className="lbm-price-row">
                                        <span>Package Savings & Order Disc:</span>
                                        <span>- ₹{(data?.invoice?.pricing?.orderDiscount || 0).toFixed(2)}</span>
                                    </div>
                                    {data?.invoice?.pricing?.invoiceDiscount > 0 && (
                                        <div className="lbm-price-row">
                                            <span>Special Invoice Discount:</span>
                                            <span>- ₹{(data?.invoice?.pricing?.invoiceDiscount || 0).toFixed(2)}</span>
                                        </div>
                                    )}
                                    <div className="lbm-price-row total">
                                        <span>Net Payable Amount:</span>
                                        <span>₹{(data?.invoice?.pricing?.netAmount || 0).toFixed(2)}</span>
                                    </div>
                                    <div className="lbm-price-row paid">
                                        <span>Total Amount Collected:</span>
                                        <span>₹{(data?.invoice?.pricing?.paidAmount || 0).toFixed(2)}</span>
                                    </div>
                                    {data?.invoice?.pricing?.refundedAmount > 0 && (
                                        <div className="lbm-price-row" style={{ color: '#d97706' }}>
                                            <span>Refunds Processed:</span>
                                            <span>- ₹{(data?.invoice?.pricing?.refundedAmount || 0).toFixed(2)}</span>
                                        </div>
                                    )}
                                    <div className="lbm-price-row due">
                                        <span>Outstanding Balance:</span>
                                        <span>₹{(data?.invoice?.pricing?.dueAmount || 0).toFixed(2)}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Payment Ledger on Invoice */}
                            {(data?.payments || []).length > 0 && (
                                <div style={{ marginTop: '20px', borderTop: '1px solid #e2e8f0', paddingTop: '12px' }}>
                                    <h4 style={{ fontSize: '12px', textTransform: 'uppercase', color: '#475569', marginBottom: '8px' }}>
                                        Receipted Payment History
                                    </h4>
                                    <table className="lbm-table" style={{ fontSize: '11px' }}>
                                        <thead>
                                            <tr>
                                                <th>Receipt #</th>
                                                <th>Date & Time</th>
                                                <th>Method</th>
                                                <th>Reference</th>
                                                <th className="lbm-text-right">Collected (₹)</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {data.payments.map((p, pidx) => (
                                                <tr key={pidx}>
                                                    <td>{p.paymentNumber}</td>
                                                    <td>{new Date(p.paymentDate).toLocaleString()}</td>
                                                    <td>{p.paymentMethod}</td>
                                                    <td>{p.transactionReference || 'N/A'}</td>
                                                    <td className="lbm-text-right">₹{p.amount.toFixed(2)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {/* Signature Block */}
                            <div className="lbm-sign-area">
                                <div className="lbm-sign-box">
                                    <div className="lbm-sign-line"></div>
                                    <div className="lbm-sign-lbl">Patient / Representative Signature</div>
                                </div>
                                <div className="lbm-sign-box">
                                    <div className="lbm-sign-line"></div>
                                    <div className="lbm-sign-lbl">Authorized Billing Officer</div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* -------------------------------------------------------------
                        2. PAYMENT RECEIPT PRINT VIEW
                       ------------------------------------------------------------- */}
                    {type === 'receipt_print' && (
                        <div className="lbm-paper">
                            <div className="lbm-doc-hdr">
                                <div className="lbm-doc-brand">
                                    <h1>{data?.hospital?.name || 'Medical365 Laboratory'}</h1>
                                    <p>{data?.hospital?.address || 'Clinical Diagnostics Centre'}</p>
                                    <p>Phone: {data?.hospital?.phone || '1800-365-LABS'}</p>
                                </div>
                                <div className="lbm-doc-badge-col">
                                    <div className="lbm-doc-badge" style={{ background: '#059669' }}>PAYMENT RECEIPT</div>
                                    <div className="lbm-doc-num">{data?.payment?.paymentNumber}</div>
                                    <div style={{ fontSize: '11px', color: '#64748b' }}>
                                        Date: {new Date(data?.payment?.paymentDate).toLocaleString()}
                                    </div>
                                </div>
                            </div>

                            <div className="lbm-doc-meta-grid">
                                <div>
                                    <div className="lbm-meta-row">
                                        <span className="lbm-meta-lbl">Patient Name:</span>
                                        <span className="lbm-meta-val">{data?.payment?.patientSnapshot?.name}</span>
                                    </div>
                                    <div className="lbm-meta-row">
                                        <span className="lbm-meta-lbl">UHID:</span>
                                        <span className="lbm-meta-val">{data?.payment?.patientSnapshot?.uhid || 'N/A'}</span>
                                    </div>
                                    <div className="lbm-meta-row">
                                        <span className="lbm-meta-lbl">Phone:</span>
                                        <span className="lbm-meta-val">{data?.payment?.patientSnapshot?.phone}</span>
                                    </div>
                                </div>
                                <div>
                                    <div className="lbm-meta-row">
                                        <span className="lbm-meta-lbl">Invoice No:</span>
                                        <span className="lbm-meta-val">{data?.payment?.invoiceNumber}</span>
                                    </div>
                                    <div className="lbm-meta-row">
                                        <span className="lbm-meta-lbl">Order No:</span>
                                        <span className="lbm-meta-val">{data?.payment?.orderNumber}</span>
                                    </div>
                                    <div className="lbm-meta-row">
                                        <span className="lbm-meta-lbl">Collected By:</span>
                                        <span className="lbm-meta-val">{data?.payment?.receivedByName || 'Lab Staff'}</span>
                                    </div>
                                </div>
                            </div>

                            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '20px', marginBottom: '20px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                    <span style={{ fontSize: '16px', fontWeight: 600, color: '#334155' }}>Payment Collection Mode:</span>
                                    <span style={{ fontSize: '16px', fontWeight: 700, color: '#2563eb' }}>{data?.payment?.paymentMethod}</span>
                                </div>
                                {data?.payment?.transactionReference && (
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px', color: '#64748b' }}>
                                        <span>Transaction Reference / UTR:</span>
                                        <span style={{ fontWeight: 600, color: '#1e293b' }}>{data?.payment?.transactionReference}</span>
                                    </div>
                                )}
                                <div style={{ borderTop: '2px solid #cbd5e1', paddingTop: '12px', marginTop: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>Amount Received:</span>
                                    <span style={{ fontSize: '22px', fontWeight: 800, color: '#059669' }}>₹{(data?.payment?.amount || 0).toFixed(2)}</span>
                                </div>
                            </div>

                            <div className="lbm-pricing-summary">
                                <div className="lbm-pricing-box">
                                    <div className="lbm-price-row">
                                        <span>Previous Due:</span>
                                        <span>₹{(data?.payment?.previousDue || 0).toFixed(2)}</span>
                                    </div>
                                    <div className="lbm-price-row">
                                        <span>This Payment:</span>
                                        <span>- ₹{(data?.payment?.amount || 0).toFixed(2)}</span>
                                    </div>
                                    <div className="lbm-price-row due">
                                        <span>Remaining Outstanding Due:</span>
                                        <span>₹{(data?.payment?.remainingDue || 0).toFixed(2)}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="lbm-sign-area">
                                <div className="lbm-sign-box">
                                    <div className="lbm-sign-line"></div>
                                    <div className="lbm-sign-lbl">Patient Signature</div>
                                </div>
                                <div className="lbm-sign-box">
                                    <div className="lbm-sign-line"></div>
                                    <div className="lbm-sign-lbl">Cashier / Staff Signature</div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* -------------------------------------------------------------
                        3. RECORD PAYMENT FORM
                       ------------------------------------------------------------- */}
                    {type === 'record_payment' && (
                        <form onSubmit={handleRecordPayment}>
                            <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '16px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                                    <span style={{ color: '#64748b', fontSize: '13px' }}>Invoice: <strong>{data?.invoiceNumber}</strong></span>
                                    <span style={{ color: '#64748b', fontSize: '13px' }}>Patient: <strong>{data?.patientSnapshot?.name}</strong></span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: '#64748b', fontSize: '13px' }}>Net Total: <strong>₹{data?.pricing?.netAmount}</strong></span>
                                    <span style={{ color: '#dc2626', fontSize: '14px', fontWeight: 700 }}>Outstanding Due: ₹{data?.pricing?.dueAmount}</span>
                                </div>
                            </div>

                            <div className="lbm-row">
                                <div className="lbm-form-group">
                                    <label className="lbm-label">Payment Amount (₹)*</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        max={data?.pricing?.dueAmount}
                                        value={payAmount}
                                        onChange={(e) => setPayAmount(e.target.value)}
                                        className="lbm-input"
                                        required
                                    />
                                    <span style={{ fontSize: '11px', color: '#64748b' }}>
                                        Max allowable: ₹{data?.pricing?.dueAmount}
                                    </span>
                                </div>

                                <div className="lbm-form-group">
                                    <label className="lbm-label">Payment Mode*</label>
                                    <select
                                        value={paymentMethod}
                                        onChange={(e) => setPaymentMethod(e.target.value)}
                                        className="lbm-select"
                                    >
                                        <option value="Cash">Cash</option>
                                        <option value="UPI">UPI (QR / App)</option>
                                        <option value="Debit Card">Debit Card</option>
                                        <option value="Credit Card">Credit Card</option>
                                        <option value="Bank Transfer">Bank Transfer / NEFT</option>
                                        <option value="Advance Adjustment">Patient Advance Adjustment</option>
                                        <option value="Other">Other</option>
                                    </select>
                                    {paymentMethod === 'Advance Adjustment' && (
                                        <span style={{ fontSize: '12px', color: availableAdvance > 0 ? '#059669' : '#dc2626', fontWeight: 600 }}>
                                            Available Advance Balance: ₹{availableAdvance}
                                        </span>
                                    )}
                                </div>
                            </div>

                            <div className="lbm-form-group" style={{ marginTop: '12px' }}>
                                <label className="lbm-label">Transaction Reference (UTR / Card Auth / Cheque No.)</label>
                                <input
                                    type="text"
                                    value={transactionRef}
                                    onChange={(e) => setTransactionRef(e.target.value)}
                                    placeholder="e.g. UPI Ref # 1234567890"
                                    className="lbm-input"
                                />
                            </div>

                            <div className="lbm-form-group" style={{ marginTop: '12px' }}>
                                <label className="lbm-label">Payment Notes</label>
                                <textarea
                                    value={paymentNotes}
                                    onChange={(e) => setPaymentNotes(e.target.value)}
                                    placeholder="Optional notes or remarks..."
                                    rows="2"
                                    className="lbm-textarea"
                                />
                            </div>

                            <div className="lbm-footer" style={{ marginTop: '20px', padding: '16px 0 0 0' }}>
                                <button type="button" onClick={onClose} className="lbm-btn-secondary">
                                    Cancel
                                </button>
                                <button type="submit" disabled={loading} className="lbm-btn-primary">
                                    {loading ? 'Recording...' : `Record Payment of ₹${payAmount || 0}`}
                                </button>
                            </div>
                        </form>
                    )}

                    {/* -------------------------------------------------------------
                        4. APPLY DISCOUNT FORM
                       ------------------------------------------------------------- */}
                    {type === 'apply_discount' && (
                        <form onSubmit={handleApplyDiscount}>
                            <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '16px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                    <span style={{ color: '#64748b', fontSize: '13px' }}>Gross Standard Amount: <strong>₹{data?.pricing?.grossAmount}</strong></span>
                                    <span style={{ color: '#64748b', fontSize: '13px' }}>Existing Total Discount: <strong>₹{data?.pricing?.totalDiscount}</strong></span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: '#0f172a', fontSize: '14px', fontWeight: 600 }}>Current Net Payable: ₹{data?.pricing?.netAmount}</span>
                                    <span style={{ color: '#059669', fontSize: '13px' }}>Already Paid: ₹{data?.pricing?.paidAmount}</span>
                                </div>
                            </div>

                            <div className="lbm-row">
                                <div className="lbm-form-group">
                                    <label className="lbm-label">Discount Type*</label>
                                    <select
                                        value={discType}
                                        onChange={(e) => setDiscType(e.target.value)}
                                        className="lbm-select"
                                    >
                                        <option value="fixed">Fixed Amount (₹)</option>
                                        <option value="percentage">Percentage (%)</option>
                                    </select>
                                </div>

                                <div className="lbm-form-group">
                                    <label className="lbm-label">Discount Value*</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        value={discValue}
                                        onChange={(e) => setDiscValue(e.target.value)}
                                        placeholder={discType === 'fixed' ? 'e.g. 200' : 'e.g. 10'}
                                        className="lbm-input"
                                        required
                                    />
                                    {discType === 'percentage' && Number(discValue) > 20 && (
                                        <span style={{ fontSize: '11px', color: '#d97706', fontWeight: 600 }}>
                                            ⚠️ Discounts &gt; 20% require Manager / Accountant authorization
                                        </span>
                                    )}
                                </div>
                            </div>

                            <div className="lbm-form-group" style={{ marginTop: '12px' }}>
                                <label className="lbm-label">Clinical / Administrative Reason for Discount*</label>
                                <textarea
                                    value={discReason}
                                    onChange={(e) => setDiscReason(e.target.value)}
                                    placeholder="e.g. Senior citizen concession, staff dependent discount, special camp waiver..."
                                    rows="3"
                                    className="lbm-textarea"
                                    required
                                />
                            </div>

                            <div className="lbm-footer" style={{ marginTop: '20px', padding: '16px 0 0 0' }}>
                                <button type="button" onClick={onClose} className="lbm-btn-secondary">
                                    Cancel
                                </button>
                                <button type="submit" disabled={loading} className="lbm-btn-primary">
                                    {loading ? 'Applying...' : 'Apply Discount'}
                                </button>
                            </div>
                        </form>
                    )}

                    {/* -------------------------------------------------------------
                        5. PROCESS REFUND FORM
                       ------------------------------------------------------------- */}
                    {type === 'process_refund' && (
                        <form onSubmit={handleProcessRefund}>
                            <div style={{ background: '#fef2f2', padding: '16px', borderRadius: '8px', border: '1px solid #fee2e2', marginBottom: '16px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                    <span style={{ color: '#991b1b', fontSize: '13px' }}>Receipt: <strong>{data?.paymentNumber}</strong></span>
                                    <span style={{ color: '#991b1b', fontSize: '13px' }}>Original Collected: <strong>₹{data?.amount}</strong></span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: '#991b1b', fontSize: '13px' }}>Already Refunded: <strong>₹{data?.refundedAmount || 0}</strong></span>
                                    <span style={{ color: '#b91c1c', fontSize: '14px', fontWeight: 700 }}>
                                        Max Refundable: ₹{Math.max(0, (data?.amount || 0) - (data?.refundedAmount || 0))}
                                    </span>
                                </div>
                            </div>

                            <div className="lbm-row">
                                <div className="lbm-form-group">
                                    <label className="lbm-label">Refund Amount (₹)*</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        max={Math.max(0, (data?.amount || 0) - (data?.refundedAmount || 0))}
                                        value={refundAmount}
                                        onChange={(e) => setRefundAmount(e.target.value)}
                                        className="lbm-input"
                                        required
                                    />
                                </div>

                                <div className="lbm-form-group">
                                    <label className="lbm-label">Refund Mode*</label>
                                    <select
                                        value={refundMethod}
                                        onChange={(e) => setRefundMethod(e.target.value)}
                                        className="lbm-select"
                                    >
                                        <option value="Cash">Cash</option>
                                        <option value="UPI">UPI Return</option>
                                        <option value="Bank Transfer">Bank Transfer</option>
                                        <option value="Original Payment Method">Original Payment Method</option>
                                        <option value="Other">Other</option>
                                    </select>
                                </div>
                            </div>

                            <div className="lbm-form-group" style={{ marginTop: '12px' }}>
                                <label className="lbm-label">Mandatory Audit Reason for Refund*</label>
                                <textarea
                                    value={refundReason}
                                    onChange={(e) => setRefundReason(e.target.value)}
                                    placeholder="e.g. Test cancelled by patient, clinical contraindication, duplicate collection..."
                                    rows="3"
                                    className="lbm-textarea"
                                    required
                                />
                            </div>

                            <div className="lbm-footer" style={{ marginTop: '20px', padding: '16px 0 0 0' }}>
                                <button type="button" onClick={onClose} className="lbm-btn-secondary">
                                    Cancel
                                </button>
                                <button type="submit" disabled={loading} className="lbm-btn-primary" style={{ background: '#dc2626' }}>
                                    {loading ? 'Processing...' : `Approve & Process Refund of ₹${refundAmount || 0}`}
                                </button>
                            </div>
                        </form>
                    )}

                    {/* -------------------------------------------------------------
                        6. PATIENT ADVANCE FORM
                       ------------------------------------------------------------- */}
                    {type === 'patient_advance' && (
                        <form onSubmit={handleDepositAdvance}>
                            <div style={{ background: '#ecfdf5', padding: '16px', borderRadius: '8px', border: '1px solid #d1fae5', marginBottom: '16px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ color: '#065f46', fontSize: '13px' }}>Patient: <strong>{data?.name || data?.patientSnapshot?.name}</strong></span>
                                    <span style={{ color: '#047857', fontSize: '15px', fontWeight: 800 }}>Available Advance: ₹{availableAdvance}</span>
                                </div>
                            </div>

                            <div className="lbm-row">
                                <div className="lbm-form-group">
                                    <label className="lbm-label">Deposit Amount (₹)*</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        value={advanceAmount}
                                        onChange={(e) => setAdvanceAmount(e.target.value)}
                                        placeholder="e.g. 2000"
                                        className="lbm-input"
                                        required
                                    />
                                </div>

                                <div className="lbm-form-group">
                                    <label className="lbm-label">Payment Method*</label>
                                    <select
                                        value={advanceMethod}
                                        onChange={(e) => setAdvanceMethod(e.target.value)}
                                        className="lbm-select"
                                    >
                                        <option value="Cash">Cash</option>
                                        <option value="UPI">UPI</option>
                                        <option value="Card">Card</option>
                                        <option value="Bank Transfer">Bank Transfer</option>
                                    </select>
                                </div>
                            </div>

                            <div className="lbm-form-group" style={{ marginTop: '12px' }}>
                                <label className="lbm-label">Transaction Reference (Optional)</label>
                                <input
                                    type="text"
                                    value={advanceRef}
                                    onChange={(e) => setAdvanceRef(e.target.value)}
                                    placeholder="e.g. Cheque / UTR number"
                                    className="lbm-input"
                                />
                            </div>

                            <div className="lbm-form-group" style={{ marginTop: '12px' }}>
                                <label className="lbm-label">Notes</label>
                                <textarea
                                    value={advanceNotes}
                                    onChange={(e) => setAdvanceNotes(e.target.value)}
                                    placeholder="e.g. Pre-paid health checkup package deposit..."
                                    rows="2"
                                    className="lbm-textarea"
                                />
                            </div>

                            <div className="lbm-footer" style={{ marginTop: '20px', padding: '16px 0 0 0' }}>
                                <button type="button" onClick={onClose} className="lbm-btn-secondary">
                                    Cancel
                                </button>
                                <button type="submit" disabled={loading} className="lbm-btn-primary">
                                    {loading ? 'Depositing...' : `Deposit Advance of ₹${advanceAmount || 0}`}
                                </button>
                            </div>
                        </form>
                    )}

                    {/* -------------------------------------------------------------
                        7. DAILY CASH REGISTER OPEN / CLOSE FORM
                       ------------------------------------------------------------- */}
                    {type === 'cash_register' && (
                        <form onSubmit={handleCashRegisterAction}>
                            {data?.isOpen ? (
                                <>
                                    <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '16px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '13px', color: '#64748b' }}>
                                            <span>Opening Float: <strong>₹{data?.register?.openingBalance || 0}</strong></span>
                                            <span>Cash Collections: <strong>+ ₹{data?.register?.cashReceived || 0}</strong></span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '13px', color: '#64748b' }}>
                                            <span>Cash Refunds: <strong>- ₹{data?.register?.cashRefunds || 0}</strong></span>
                                            <span>Cash Adjustments: <strong>₹{data?.register?.cashAdjustments || 0}</strong></span>
                                        </div>
                                        <div style={{ borderTop: '1px solid #cbd5e1', paddingTop: '8px', display: 'flex', justifyContent: 'space-between', fontWeight: 700, color: '#0f172a' }}>
                                            <span>System Expected Drawer Balance:</span>
                                            <span style={{ color: '#2563eb', fontSize: '16px' }}>
                                                ₹{(data?.register?.openingBalance || 0) + (data?.register?.cashReceived || 0) - (data?.register?.cashRefunds || 0) + (data?.register?.cashAdjustments || 0)}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="lbm-form-group">
                                        <label className="lbm-label">Actual Physical Cash Counted in Drawer (₹)*</label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            value={closeActualBalance}
                                            onChange={(e) => setCloseActualBalance(e.target.value)}
                                            placeholder="Enter actual cash count"
                                            className="lbm-input"
                                            required
                                        />
                                        {closeActualBalance !== '' && (
                                            <div style={{ marginTop: '6px', fontSize: '12px', fontWeight: 600, color: (Number(closeActualBalance) - ((data?.register?.openingBalance || 0) + (data?.register?.cashReceived || 0) - (data?.register?.cashRefunds || 0))) === 0 ? '#059669' : '#dc2626' }}>
                                                Reconciliation Discrepancy: ₹{Number(closeActualBalance) - ((data?.register?.openingBalance || 0) + (data?.register?.cashReceived || 0) - (data?.register?.cashRefunds || 0))}
                                            </div>
                                        )}
                                    </div>

                                    <div className="lbm-form-group" style={{ marginTop: '12px' }}>
                                        <label className="lbm-label">Shift Handover & Reconciliation Notes</label>
                                        <textarea
                                            value={closingNotes}
                                            onChange={(e) => setClosingNotes(e.target.value)}
                                            placeholder="Any note on denominations, shift handover, or variance..."
                                            rows="2"
                                            className="lbm-textarea"
                                        />
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div style={{ background: '#eff6ff', padding: '16px', borderRadius: '8px', border: '1px solid #dbeafe', marginBottom: '16px', color: '#1e40af', fontSize: '13px' }}>
                                        You are opening the daily cash drawer for this workstation shift. All cash collected and refunded during this shift will be tracked against this register.
                                    </div>

                                    <div className="lbm-form-group">
                                        <label className="lbm-label">Opening Cash Float / Petty Balance (₹)*</label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            value={openBalance}
                                            onChange={(e) => setOpenBalance(e.target.value)}
                                            placeholder="e.g. 1000"
                                            className="lbm-input"
                                            required
                                        />
                                    </div>

                                    <div className="lbm-form-group" style={{ marginTop: '12px' }}>
                                        <label className="lbm-label">Opening Shift Remarks</label>
                                        <textarea
                                            value={closingNotes}
                                            onChange={(e) => setClosingNotes(e.target.value)}
                                            placeholder="Remarks, starting shift staff, initial denominations..."
                                            rows="2"
                                            className="lbm-textarea"
                                        />
                                    </div>
                                </>
                            )}

                            <div className="lbm-footer" style={{ marginTop: '20px', padding: '16px 0 0 0' }}>
                                <button type="button" onClick={onClose} className="lbm-btn-secondary">
                                    Cancel
                                </button>
                                <button type="submit" disabled={loading} className="lbm-btn-primary">
                                    {loading ? 'Processing...' : data?.isOpen ? 'Close & Reconcile Shift' : 'Open Shift Cash Register'}
                                </button>
                            </div>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
};

export default LabBillingModal;
