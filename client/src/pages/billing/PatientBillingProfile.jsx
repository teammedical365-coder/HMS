import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { billingAPI, admissionAPI, patientAPI } from '../../utils/api';
import './PatientBillingProfile.css';

const fmt = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 }).format(n || 0);
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

const PatientBillingProfile = () => {
    const navigate = useNavigate();
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [patient, setPatient] = useState(null);
    const [billing, setBilling] = useState(null);
    const [selected, setSelected] = useState({ appointments: [], labReports: [], pharmacyOrders: [], facilityCharges: [], admissions: [] });
    const [paymentMode, setPaymentMode] = useState('Cash');
    const [paying, setPaying] = useState(false);
    const [successMsg, setSuccessMsg] = useState('');
    const [dischargingId, setDischargingId] = useState(null);
    const [suggestions, setSuggestions] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);

    const loadPatientBilling = async (identifier) => {
        setLoading(true);
        setError('');
        setPatient(null);
        setBilling(null);
        setSelected({ appointments: [], labReports: [], pharmacyOrders: [], facilityCharges: [], admissions: [] });
        setSuccessMsg('');
        try {
            const res = await billingAPI.getPatientBills(identifier);
            if (res.success) {
                setPatient(res.patient);
                setBilling(res.billing);
            }
        } catch (err) {
            setError(err.response?.data?.message || 'Patient not found');
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = (e) => {
        e?.preventDefault();
        if (!searchQuery.trim()) return;
        setShowSuggestions(false);
        loadPatientBilling(searchQuery.trim());
    };

    const handleQueryChange = async (val) => {
        setSearchQuery(val);
        if (val.trim().length >= 2) {
            try {
                const res = await patientAPI.search(val.trim());
                if (res.success) {
                    setSuggestions(res.data || []);
                    setShowSuggestions(true);
                }
            } catch (err) {
                console.error(err);
            }
        } else {
            setSuggestions([]);
            setShowSuggestions(false);
        }
    };

    const toggle = (category, id) => {
        setSelected(prev => ({
            ...prev,
            [category]: prev[category].includes(id)
                ? prev[category].filter(x => x !== id)
                : [...prev[category], id]
        }));
    };

    const toggleAll = (category, items) => {
        const pendingIds = items.filter(x => x.paymentStatus !== 'Paid').map(x => x._id);
        setSelected(prev => {
            const allSelected = pendingIds.every(id => prev[category].includes(id));
            return { ...prev, [category]: allSelected ? [] : pendingIds };
        });
    };

    const totalSelected = () => {
        if (!billing) return 0;
        let total = 0;
        billing.appointments.filter(a => selected.appointments.includes(a._id)).forEach(a => total += (Number(a.amount) || 0));
        billing.labReports.filter(l => selected.labReports.includes(l._id)).forEach(l => total += (Number(l.amount || l.price) || 0));
        billing.pharmacyOrders.filter(p => selected.pharmacyOrders.includes(p._id)).forEach(p => total += (Number(p.totalAmount) || 0));
        billing.facilityCharges.filter(f => selected.facilityCharges.includes(f._id)).forEach(f => total += (Number(f.totalAmount) || 0));
        billing.admissions.filter(a => selected.admissions.includes(a._id)).forEach(a => total += (Number(a.totalAmount) || 0));
        return total;
    };

    const pendingTotal = () => {
        if (!billing) return 0;
        let total = 0;
        billing.appointments.filter(a => a.paymentStatus !== 'Paid').forEach(a => total += (Number(a.amount) || 0));
        billing.labReports.filter(l => l.paymentStatus !== 'Paid').forEach(l => total += (Number(l.amount || l.price) || 0));
        billing.pharmacyOrders.filter(p => p.paymentStatus !== 'Paid').forEach(p => total += (Number(p.totalAmount) || 0));
        billing.facilityCharges.filter(f => f.paymentStatus !== 'Paid').forEach(f => total += (Number(f.totalAmount) || 0));
        billing.admissions.filter(a => a.paymentStatus !== 'Paid').forEach(a => total += (Number(a.totalAmount) || 0));
        return total;
    };

    const grandTotalBill = () => {
        if (!billing) return 0;
        let total = 0;
        billing.appointments?.forEach(a => total += (Number(a.amount) || 0));
        billing.labReports?.forEach(l => total += (Number(l.amount || l.price) || 0));
        billing.pharmacyOrders?.forEach(p => total += (Number(p.totalAmount) || 0));
        billing.facilityCharges?.forEach(f => total += (Number(f.totalAmount) || 0));
        billing.admissions?.forEach(a => total += (Number(a.totalAmount) || 0));
        return total;
    };

    const totalPaidBill = () => {
        if (!billing) return 0;
        let total = 0;
        billing.appointments?.filter(a => a.paymentStatus === 'Paid').forEach(a => total += (Number(a.amount) || 0));
        billing.labReports?.filter(l => l.paymentStatus === 'Paid').forEach(l => total += (Number(l.amount || l.price) || 0));
        billing.pharmacyOrders?.filter(p => p.paymentStatus === 'Paid').forEach(p => total += (Number(p.totalAmount) || 0));
        billing.facilityCharges?.filter(f => f.paymentStatus === 'Paid').forEach(f => total += (Number(f.totalAmount) || 0));
        billing.admissions?.filter(a => a.paymentStatus === 'Paid').forEach(a => total += (Number(a.totalAmount) || 0));
        return total;
    };

    const balanceBill = () => Math.max(0, grandTotalBill() - totalPaidBill());

    const getSectionBadge = (items) => {
        const total = items.length;
        if (total === 0) return null;
        const paid = items.filter(x => x.paymentStatus === 'Paid').length;
        const pending = total - paid;
        if (paid === total) return `${total} paid`;
        if (pending === total) return `${total} pending`;
        return `${pending} pending, ${paid} paid`;
    };

    const handlePay = async () => {
        const total = totalSelected();
        if (total === 0) return alert('Select at least one item to pay.');
        if (!window.confirm(`Process payment of ${fmt(total)} via ${paymentMode}?`)) return;
        setPaying(true);
        try {
            await billingAPI.processPayment({
                appointmentIds: selected.appointments,
                labReportIds: selected.labReports,
                pharmacyOrderIds: selected.pharmacyOrders,
                facilityChargeIds: selected.facilityCharges,
                admissionIds: selected.admissions,
                paymentMode,
            });
            setSuccessMsg(`Payment of ${fmt(total)} processed successfully via ${paymentMode}.`);
            const res = await billingAPI.getPatientBills(searchQuery.trim());
            if (res.success) setBilling(res.billing);
            setSelected({ appointments: [], labReports: [], pharmacyOrders: [], facilityCharges: [], admissions: [] });
        } catch (err) {
            alert(err.response?.data?.message || 'Payment failed');
        } finally {
            setPaying(false);
        }
    };

    const handleDischarge = async (admissionId) => {
        if (!window.confirm('Discharge this patient?')) return;
        setDischargingId(admissionId);
        try {
            await admissionAPI.dischargePatient(admissionId);
            const res = await billingAPI.getPatientBills(searchQuery.trim());
            if (res.success) setBilling(res.billing);
        } catch (err) {
            alert(err.response?.data?.message || 'Discharge failed');
        } finally {
            setDischargingId(null);
        }
    };

    const activeAdmissions = billing?.admissions?.filter(a => a.status === 'Admitted') || [];
    const pastAdmissions = billing?.admissions?.filter(a => a.status === 'Discharged') || [];

    return (
        <div className="billing-profile-page">
            <div className="billing-header">
                <div>
                    <h1>Patient Billing Profile</h1>
                    <p>Search a patient to view and settle their bills</p>
                </div>
                <button className="btn-back" onClick={() => navigate(-1)}>Back</button>
            </div>

            {/* Search */}
            <div style={{ position: 'relative', marginBottom: '20px' }} className="billing-search-container">
                <form className="billing-search-bar" onSubmit={handleSearch}>
                    <input
                        type="text"
                        placeholder="Search by Phone / MRN / Patient ID..."
                        value={searchQuery}
                        onChange={e => handleQueryChange(e.target.value)}
                        className="billing-search-input"
                        onFocus={() => searchQuery.trim().length >= 2 && setShowSuggestions(true)}
                        onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                    />
                    <button type="submit" className="btn-search" disabled={loading}>
                        {loading ? 'Searching...' : 'Search'}
                    </button>
                </form>

                {showSuggestions && suggestions.length > 0 && (
                    <div className="search-suggestions-dropdown" style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        backgroundColor: '#ffffff',
                        border: '1px solid #e2e8f0',
                        borderRadius: '8px',
                        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                        zIndex: 1000,
                        maxHeight: '240px',
                        overflowY: 'auto',
                        marginTop: '4px'
                    }}>
                        {suggestions.map(p => (
                            <div
                                key={p._id}
                                onClick={() => {
                                    setSearchQuery(p.mrn || p.patientId || p.phone || p.name);
                                    setShowSuggestions(false);
                                    loadPatientBilling(p.mrn || p.patientId || p.phone || p.name);
                                }}
                                style={{
                                    padding: '10px 14px',
                                    borderBottom: '1px solid #f1f5f9',
                                    cursor: 'pointer',
                                    fontSize: '0.9rem',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    textAlign: 'left'
                                }}
                                className="suggestion-item"
                                onMouseDown={(e) => e.preventDefault()}
                            >
                                <strong style={{ color: '#1e293b' }}>{p.name}</strong>
                                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                    MRN: {p.mrn || 'N/A'} | Phone: {p.phone || 'N/A'}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {error && <div className="billing-error">{error}</div>}
            {successMsg && <div className="billing-success">{successMsg}</div>}

            {patient && billing && (
                <>
                    {/* Patient Card */}
                    <div className="patient-info-card">
                        <div className="patient-avatar">{patient.name?.charAt(0)?.toUpperCase()}</div>
                        <div className="patient-details">
                            <h2>{patient.name}</h2>
                            <div className="patient-meta">
                                <span>MRN: {patient.mrn || patient.patientId || '—'}</span>
                                <span>Phone: {patient.phone || '—'}</span>
                                {patient.gender && <span>Gender: {patient.gender}</span>}
                                {patient.dob && <span>DOB: {fmtDate(patient.dob)}</span>}
                            </div>
                        </div>
                        <div className="patient-outstanding">
                            <div className="outstanding-label">Grand Total Bill</div>
                            <div className="outstanding-amount">{fmt(grandTotalBill())}</div>
                            <div className="paid-balance-meta">
                                <span className="meta-paid">Paid: {fmt(totalPaidBill())}</span>
                                <span className="meta-balance">Balance: {fmt(balanceBill())}</span>
                            </div>
                        </div>
                    </div>

                    {/* Active Admissions */}
                    {activeAdmissions.length > 0 && (
                        <div className="billing-section admitted-section">
                            <div className="section-header admitted-header">
                                <span className="admitted-badge">Currently Admitted</span>
                                <h3>Active Hospitalization</h3>
                            </div>
                            {activeAdmissions.map(adm => (
                                <div key={adm._id} className="admission-card active">
                                    <div className="admission-top">
                                        <div>
                                            <strong>Admitted:</strong> {fmtDate(adm.admissionDate)}
                                            {adm.ward && <span className="badge-ward"> Ward: {adm.ward}</span>}
                                            {adm.bedNumber && <span className="badge-bed"> Bed: {adm.bedNumber}</span>}
                                        </div>
                                        <div className="admission-actions">
                                            <label className="check-label">
                                                <input
                                                    type="checkbox"
                                                    checked={selected.admissions.includes(adm._id)}
                                                    onChange={() => toggle('admissions', adm._id)}
                                                    disabled={adm.paymentStatus === 'Paid'}
                                                />
                                                {adm.paymentStatus === 'Paid' ? (
                                                    <span className="paid-badge">Paid</span>
                                                ) : (
                                                    <span>Mark for payment</span>
                                                )}
                                            </label>
                                            <button
                                                className="btn-discharge"
                                                onClick={() => handleDischarge(adm._id)}
                                                disabled={dischargingId === adm._id}
                                            >
                                                {dischargingId === adm._id ? 'Discharging...' : 'Discharge'}
                                            </button>
                                        </div>
                                    </div>
                                    {adm.selectedFacilities?.length > 0 && (
                                        <table className="facility-table">
                                            <thead>
                                                <tr><th>Facility</th><th>Rate/Day</th><th>Days</th><th>Amount</th></tr>
                                            </thead>
                                            <tbody>
                                                {adm.selectedFacilities.map((f, i) => (
                                                    <tr key={i}>
                                                        <td>{f.facilityName}</td>
                                                        <td>{fmt(f.pricePerDay)}</td>
                                                        <td>{f.days}</td>
                                                        <td>{fmt(f.totalAmount)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                            <tfoot>
                                                <tr>
                                                    <td colSpan="3"><strong>Total</strong></td>
                                                    <td><strong>{fmt(adm.totalAmount)}</strong></td>
                                                </tr>
                                            </tfoot>
                                        </table>
                                    )}
                                    {adm.notes && <p className="admission-notes">Notes: {adm.notes}</p>}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Consolidated Billing View (Appointments & Facility Charges) */}
                    {(billing.appointments?.length > 0 || billing.facilityCharges?.length > 0) && (
                        <div className="billing-section">
                            <div className="section-header">
                                <h3>Consolidated Billing View (Consultations & ICU Charges)</h3>
                                {billing.facilityCharges.some(f => f.paymentStatus !== 'Paid') && (
                                    <button className="btn-select-all" onClick={() => toggleAll('facilityCharges', billing.facilityCharges)}>
                                        {billing.facilityCharges.filter(f => f.paymentStatus !== 'Paid').every(f => selected.facilityCharges.includes(f._id)) ? 'Deselect All' : 'Select All Unpaid'}
                                    </button>
                                )}
                            </div>
                            <table className="billing-table">
                                <thead><tr><th></th><th>Date</th><th>Type & Description</th><th>Collected By</th><th>Status</th><th>Amount</th></tr></thead>
                                <tbody>
                                    {/* Appointments - Read-Only Informational */}
                                    {billing.appointments.map(a => (
                                        <tr key={a._id} className="readonly-row" style={{backgroundColor: '#f8fafc'}}>
                                            <td>
                                                <span style={{color:'#94a3b8', fontSize:'0.8rem'}}>—</span>
                                            </td>
                                            <td>{fmtDate(a.appointmentDate)}{a.appointmentTime && ` ${a.appointmentTime}`}</td>
                                            <td>
                                                <strong>Appointment Fee</strong><br/>
                                                <span style={{fontSize:'0.85rem', color:'#64748b'}}>{a.serviceName || 'Consultation'}</span>
                                            </td>
                                            <td>{a.doctorName || '—'}</td>
                                            <td>
                                                <span className={`status-badge status-${a.paymentStatus === 'Paid' ? 'Confirmed' : (a.status || 'Pending')}`}>
                                                    {a.paymentStatus === 'Paid' ? 'PAID' : (a.status || 'Pending')}
                                                </span>
                                            </td>
                                            <td className="amount-cell">{fmt(a.amount)}</td>
                                        </tr>
                                    ))}
                                    
                                    {/* Facility / ICU Charges - Actionable */}
                                    {billing.facilityCharges.map(f => (
                                        <tr key={f._id} className={selected.facilityCharges.includes(f._id) ? 'selected-row' : ''}>
                                            <td>
                                                {f.paymentStatus === 'Paid' ? (
                                                    <span className="paid-icon-check">✓</span>
                                                ) : (
                                                    <input type="checkbox" checked={selected.facilityCharges.includes(f._id)} onChange={() => toggle('facilityCharges', f._id)} />
                                                )}
                                            </td>
                                            <td>{fmtDate(f.createdAt)}</td>
                                            <td>
                                                <strong>ICU / Facility Charge</strong><br/>
                                                <span style={{fontSize:'0.85rem', color:'#64748b'}}>{f.facilityName} ({f.daysUsed || f.days || 1} Days @ {fmt(f.pricePerDay)}/day)</span>
                                            </td>
                                            <td>{f.collectedBy?.name || f.addedBy?.name || '—'}</td>
                                            <td>
                                                <span className="status-badge">
                                                    {f.paymentStatus === 'Paid' ? 'PAID' : 'Pending'}
                                                </span>
                                            </td>
                                            <td className="amount-cell">{fmt(f.totalAmount)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Lab Reports */}
                    {billing.labReports.length > 0 && (
                        <div className="billing-section">
                            <div className="section-header">
                                <h3>Lab Tests ({getSectionBadge(billing.labReports)})</h3>
                                {billing.labReports.some(l => l.paymentStatus !== 'Paid') && (
                                    <button className="btn-select-all" onClick={() => toggleAll('labReports', billing.labReports)}>
                                        {billing.labReports.filter(l => l.paymentStatus !== 'Paid').every(l => selected.labReports.includes(l._id)) ? 'Deselect All' : 'Select All'}
                                    </button>
                                )}
                            </div>
                            <table className="billing-table">
                                <thead><tr><th></th><th>Date</th><th>Tests</th><th>Status</th><th>Amount</th></tr></thead>
                                <tbody>
                                    {billing.labReports.map(l => (
                                        <tr key={l._id} className={selected.labReports.includes(l._id) ? 'selected-row' : ''}>
                                            <td>
                                                {l.paymentStatus === 'Paid' ? (
                                                    <span className="paid-icon-check">✓</span>
                                                ) : (
                                                    <input type="checkbox" checked={selected.labReports.includes(l._id)} onChange={() => toggle('labReports', l._id)} />
                                                )}
                                            </td>
                                            <td>{fmtDate(l.createdAt)}</td>
                                            <td>{Array.isArray(l.testNames) ? l.testNames.join(', ') : (l.testName || '—')}</td>
                                            <td>
                                                <span className="status-badge">
                                                    {l.paymentStatus === 'Paid' ? 'PAID' : (l.testStatus || l.status || 'Pending')}
                                                </span>
                                            </td>
                                            <td className="amount-cell">{fmt(l.amount || l.price)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Pharmacy Orders */}
                    {billing.pharmacyOrders.length > 0 && (
                        <div className="billing-section">
                            <div className="section-header">
                                <h3>Pharmacy Orders ({getSectionBadge(billing.pharmacyOrders)})</h3>
                                {billing.pharmacyOrders.some(p => p.paymentStatus !== 'Paid') && (
                                    <button className="btn-select-all" onClick={() => toggleAll('pharmacyOrders', billing.pharmacyOrders)}>
                                        {billing.pharmacyOrders.filter(p => p.paymentStatus !== 'Paid').every(p => selected.pharmacyOrders.includes(p._id)) ? 'Deselect All' : 'Select All'}
                                    </button>
                                )}
                            </div>
                            <table className="billing-table">
                                <thead><tr><th></th><th>Date</th><th>Items</th><th>Order Status</th><th>Amount</th></tr></thead>
                                <tbody>
                                    {billing.pharmacyOrders.map(p => (
                                        <tr key={p._id} className={selected.pharmacyOrders.includes(p._id) ? 'selected-row' : ''}>
                                            <td>
                                                {p.paymentStatus === 'Paid' ? (
                                                    <span className="paid-icon-check">✓</span>
                                                ) : (
                                                    <input type="checkbox" checked={selected.pharmacyOrders.includes(p._id)} onChange={() => toggle('pharmacyOrders', p._id)} />
                                                )}
                                            </td>
                                            <td>{fmtDate(p.createdAt)}</td>
                                            <td>{Array.isArray(p.items) ? p.items.map(i => i.medicineName || i.name).filter(Boolean).join(', ') : '—'}</td>
                                            <td>
                                                <span className="status-badge">
                                                    {p.paymentStatus === 'Paid' ? 'PAID' : (p.orderStatus || 'Pending')}
                                                </span>
                                            </td>
                                            <td className="amount-cell">{fmt(p.totalAmount)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}



                    {/* Past Admissions */}
                    {pastAdmissions.length > 0 && (
                        <div className="billing-section past-admissions">
                            <div className="section-header">
                                <h3>Past Admissions ({pastAdmissions.length})</h3>
                            </div>
                            {pastAdmissions.map(adm => (
                                <div key={adm._id} className="admission-card past">
                                    <div className="admission-top">
                                        <div>
                                            <strong>Admitted:</strong> {fmtDate(adm.admissionDate)}
                                            <strong style={{ marginLeft: 16 }}>Discharged:</strong> {fmtDate(adm.dischargeDate)}
                                            {adm.ward && <span className="badge-ward"> Ward: {adm.ward}</span>}
                                            {adm.bedNumber && <span className="badge-bed"> Bed: {adm.bedNumber}</span>}
                                        </div>
                                        <span className={adm.paymentStatus === 'Paid' ? 'paid-badge' : 'pending-badge'}>
                                            {adm.paymentStatus === 'Paid' ? 'Paid' : `Pending — ${fmt(adm.totalAmount)}`}
                                        </span>
                                    </div>
                                    {adm.selectedFacilities?.length > 0 && (
                                        <div className="facility-list">
                                            {adm.selectedFacilities.map((f, i) => (
                                                <span key={i} className="facility-tag">{f.facilityName} × {f.days}d = {fmt(f.totalAmount)}</span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* No items at all */}
                    {billing.appointments.length === 0 && billing.labReports.length === 0 &&
                        billing.pharmacyOrders.length === 0 && billing.facilityCharges.length === 0 &&
                        activeAdmissions.length === 0 && pastAdmissions.length === 0 && (
                        <div className="no-bills">No billing items found for this patient.</div>
                    )}

                    {/* Payment Panel */}
                    {pendingTotal() > 0 && (
                        <div className="payment-panel">
                            <div className="payment-summary">
                                <div className="payment-row">
                                    <span>Selected Amount:</span>
                                    <strong className="selected-amount">{fmt(totalSelected())}</strong>
                                </div>
                                <div className="payment-row">
                                    <span>Total Balance Due:</span>
                                    <strong>{fmt(pendingTotal())}</strong>
                                </div>
                            </div>
                            <div className="payment-controls">
                                <select value={paymentMode} onChange={e => setPaymentMode(e.target.value)} className="payment-mode-select">
                                    <option value="Cash">Cash</option>
                                    <option value="UPI">UPI</option>
                                    <option value="Card">Card</option>
                                    <option value="NetBanking">Net Banking</option>
                                    <option value="Insurance">Insurance</option>
                                </select>
                                <button className="btn-pay" onClick={handlePay} disabled={paying || totalSelected() === 0}>
                                    {paying ? 'Processing...' : `Pay ${fmt(totalSelected())}`}
                                </button>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default PatientBillingProfile;
