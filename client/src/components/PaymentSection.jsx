import React from 'react';

const fmt = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 }).format(n || 0);

/**
 * Shared Payment Section Component
 * Used by both Billing (PatientBillingProfile) and Reception (ReceptionDashboard).
 *
 * Props:
 * - splitPayments: Array of { method, amount }
 * - onSplitChange(index, field, value): handler for changing a split row
 * - onAddSplit(): handler to add a new split row
 * - onRemoveSplit(index): handler to remove a split row
 * - totalAmount: the target amount that splits must sum to
 * - upiOptions: Array of { upiId, label } from hospital config
 * - paymentData: { upiId, transactionId, cardDetails, bankReference }
 * - onPaymentDataChange(newData): handler to update payment data
 * - proofFile: File | null
 * - onProofFileChange(file): handler for proof file upload
 * - label: optional label for the section (default: 'Payment Breakdown')
 */
const PaymentSection = ({
    splitPayments = [],
    onSplitChange,
    onAddSplit,
    onRemoveSplit,
    totalAmount = 0,
    upiOptions = [],
    paymentData = {},
    onPaymentDataChange,
    proofFile = null,
    onProofFileChange,
    label = 'Payment Breakdown'
}) => {
    const totalSplitAmount = splitPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

    // UPI QR Code logic
    const hasUpi = splitPayments.some(sp => sp.method === 'UPI');
    const upiAmount = hasUpi
        ? splitPayments.filter(sp => sp.method === 'UPI').reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0)
        : 0;
    const selectedUpiId = paymentData?.upiId || upiOptions?.[0]?.upiId || '';
    const showQr = hasUpi && upiAmount > 0 && selectedUpiId;

    return (
        <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
            {/* LEFT: Payment Methods */}
            <div style={{ flex: '1 1 400px', minWidth: '300px' }}>
                <label style={{ fontSize: '13px', fontWeight: 'bold', color: '#475569', display: 'block', marginBottom: '10px' }}>
                    {label} <span style={{ color: '#ef4444' }}>*(Total must match: {fmt(totalAmount)})</span>
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {splitPayments.map((split, index) => (
                        <div key={index} className="payment-inline-inputs" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', background: '#f8fafc', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                            <select
                                value={split.method}
                                onChange={e => onSplitChange(index, 'method', e.target.value)}
                                className="payment-mode-select"
                                style={{ padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', minWidth: '150px' }}
                            >
                                <option value="Cash">Cash</option>
                                <option value="UPI">UPI</option>
                                <option value="Card">Card</option>
                                <option value="Cheque">Cheque</option>
                                <option value="NEFT/RTGS">NEFT / RTGS</option>
                            </select>

                            <input
                                type="number"
                                placeholder="Amount"
                                value={split.amount}
                                onChange={e => onSplitChange(index, 'amount', e.target.value)}
                                style={{ padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', width: '120px' }}
                                min="1"
                                required
                            />

                            {splitPayments.length > 1 && (
                                <button type="button" onClick={() => onRemoveSplit(index)} style={{ padding: '8px 12px', background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>✕</button>
                            )}

                            {/* UPI fields */}
                            {split.method === 'UPI' && (
                                <div style={{ flexBasis: '100%', display: 'flex', gap: '10px', marginTop: '10px' }}>
                                    <select
                                        value={paymentData?.upiId || ''}
                                        onChange={e => onPaymentDataChange({ ...paymentData, upiId: e.target.value })}
                                        style={{ padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', flex: 1 }}
                                        required
                                    >
                                        <option value="" disabled>Select Hospital UPI ID</option>
                                        {upiOptions.map((opt, idx) => (
                                            <option key={idx} value={opt.upiId}>{opt.label} ({opt.upiId})</option>
                                        ))}
                                    </select>
                                    <input
                                        type="text"
                                        placeholder="Txn Ref"
                                        required
                                        value={paymentData?.transactionId || ''}
                                        onChange={e => onPaymentDataChange({ ...paymentData, transactionId: e.target.value })}
                                        style={{ padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', flex: 1 }}
                                    />
                                </div>
                            )}

                            {/* Card fields */}
                            {split.method === 'Card' && (
                                <div style={{ flexBasis: '100%', display: 'flex', gap: '10px', marginTop: '10px' }}>
                                    <input
                                        type="text"
                                        placeholder="Card (Last 4)"
                                        required
                                        value={paymentData?.cardDetails || ''}
                                        onChange={e => onPaymentDataChange({ ...paymentData, cardDetails: e.target.value })}
                                        style={{ padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', flex: 1 }}
                                    />
                                    <input
                                        type="text"
                                        placeholder="Txn Ref"
                                        required
                                        value={paymentData?.transactionId || ''}
                                        onChange={e => onPaymentDataChange({ ...paymentData, transactionId: e.target.value })}
                                        style={{ padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', flex: 1 }}
                                    />
                                </div>
                            )}

                            {/* Cheque / NEFT fields */}
                            {['Cheque', 'NEFT/RTGS'].includes(split.method) && (
                                <div style={{ flexBasis: '100%', display: 'flex', gap: '10px', marginTop: '10px' }}>
                                    <input
                                        type="text"
                                        placeholder="Bank Ref / Cheque No"
                                        required
                                        value={paymentData?.bankReference || ''}
                                        onChange={e => onPaymentDataChange({ ...paymentData, bankReference: e.target.value })}
                                        style={{ padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', flex: 1 }}
                                    />
                                </div>
                            )}

                            {/* Proof upload — show once for any non-cash method */}
                            {split.method !== 'Cash' && !proofFile && (
                                <div className="inline-file-upload" style={{ flexBasis: '100%', display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '10px' }}>
                                    <label style={{ fontSize: '11px', color: '#64748b', fontWeight: 'bold' }}>Payment Proof <span style={{ color: '#ef4444' }}>*Required once for all non-cash</span></label>
                                    <input type="file" accept="image/*,.pdf" onChange={e => onProofFileChange(e.target.files[0])} style={{ fontSize: '13px' }} required />
                                </div>
                            )}
                        </div>
                    ))}

                    <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                        <button type="button" onClick={onAddSplit} style={{ padding: '8px 16px', background: '#ccfbf1', color: '#0f766e', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>+ Add Payment Method</button>
                        <span style={{ fontSize: '14px', fontWeight: 600, color: totalSplitAmount === Number(totalAmount) ? '#15803d' : '#ef4444' }}>
                            Split Total: {fmt(totalSplitAmount)} / {fmt(totalAmount)}
                        </span>
                    </div>
                </div>
            </div>

            {/* RIGHT: UPI QR Code */}
            {showQr && (
                <div style={{
                    flex: '0 0 200px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    padding: '20px',
                    background: '#f0fdfa',
                    borderRadius: '12px',
                    border: '1px dashed #0d9488',
                    alignSelf: 'flex-start'
                }}>
                    <div style={{ fontSize: '14px', color: '#0f766e', fontWeight: 'bold', marginBottom: '12px', textAlign: 'center' }}>
                        Scan QR to Pay {fmt(upiAmount)}
                    </div>
                    <img
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent('upi://pay?pa=' + selectedUpiId.trim() + '&pn=Medical365&am=' + upiAmount + '&cu=INR')}`}
                        alt="UPI QR Code"
                        style={{ borderRadius: '8px', width: '150px', height: '150px' }}
                    />
                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '8px', textAlign: 'center' }}>
                        UPI ID: {selectedUpiId}
                    </div>
                </div>
            )}
        </div>
    );
};

export default PaymentSection;
