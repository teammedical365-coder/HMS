import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { billingAPI, admissionAPI } from '../../utils/api';
import './PatientBillingProfile.css';

const fmt = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 }).format(n || 0);
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

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

    const handleSearch = async (e) => {
        e.preventDefault();
        if (!searchQuery.trim()) return;
        setLoading(true);
        setError('');
        setPatient(null);
        setBilling(null);
        setSelected({ appointments: [], labReports: [], pharmacyOrders: [], facilityCharges: [], admissions: [] });
        setSuccessMsg('');
        try {
            const res = await billingAPI.getPatientBills(searchQuery.trim());
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

    const toggle = (category, id) => {
        setSelected(prev => ({
            ...prev,
            [category]: prev[category].includes(id)
                ? prev[category].filter(x => x !== id)
                : [...prev[category], id]
        }));
    };

    const toggleAll = (category, ids) => {
        setSelected(prev => {
            const allSelected = ids.every(id => prev[category].includes(id));
            return { ...prev, [category]: allSelected ? [] : ids };
        });
    };

    const totalSelected = () => {
        if (!billing) return 0;
        let total = 0;
        billing.appointments.filter(a => selected.appointments.includes(a._id)).forEach(a => total += (a.amount || 0));
        billing.labReports.filter(l => selected.labReports.includes(l._id)).forEach(l => total += (l.amount || l.price || 0));
        billing.pharmacyOrders.filter(p => selected.pharmacyOrders.includes(p._id)).forEach(p => total += (p.totalAmount || 0));
        billing.facilityCharges.filter(f => selected.facilityCharges.includes(f._id)).forEach(f => total += (f.totalAmount || 0));
        billing.admissions.filter(a => selected.admissions.includes(a._id)).forEach(a => total += (a.totalAmount || 0));
        return total;
    };

    const pendingTotal = () => {
        if (!billing) return 0;
        let total = 0;
        billing.appointments.forEach(a => total += (a.amount || 0));
        billing.labReports.forEach(l => total += (l.amount || l.price || 0));
        billing.pharmacyOrders.forEach(p => total += (p.totalAmount || 0));
        billing.facilityCharges.forEach(f => total += (f.totalAmount || 0));
        billing.admissions.filter(a => a.paymentStatus !== 'Paid').forEach(a => total += (a.totalAmount || 0));
        return total;
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
            // Reload billing
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
            <form className="billing-search-bar" onSubmit={handleSearch}>
                <input
                    type="text"
                    placeholder="Search by Phone / MRN / Patient ID..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="billing-search-input"
                />
                <button type="submit" className="btn-search" disabled={loading}>
                    {loading ? 'Searching...' : 'Search'}
                </button>
            </form>

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
                            <div className="outstanding-label">Total Outstanding</div>
                            <div className="outstanding-amount">{fmt(pendingTotal())}</div>
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

                    {/* OPD Consultations */}
                    {billing.appointments.length > 0 && (
                        <div className="billing-section">
                            <div className="section-header">
                                <h3>OPD Consultations ({billing.appointments.length} pending)</h3>
                                <button className="btn-select-all" onClick={() => toggleAll('appointments', billing.appointments.map(a => a._id))}>
                                    {billing.appointments.every(a => selected.appointments.includes(a._id)) ? 'Deselect All' : 'Select All'}
                                </button>
                            </div>
                            <table className="billing-table">
                                <thead><tr><th></th><th>Date</th><th>Doctor</th><th>Service</th><th>Status</th><th>Amount</th></tr></thead>
                                <tbody>
                                    {billing.appointments.map(a => (
                                        <tr key={a._id} className={selected.appointments.includes(a._id) ? 'selected-row' : ''}>
                                            <td><input type="checkbox" checked={selected.appointments.includes(a._id)} onChange={() => toggle('appointments', a._id)} /></td>
                                            <td>{fmtDate(a.appointmentDate)}{a.appointmentTime && ` ${a.appointmentTime}`}</td>
                                            <td>{a.doctorName || '—'}</td>
                                            <td>{a.serviceName || 'Consultation'}</td>
                                            <td><span className={`status-badge status-${a.status}`}>{a.status}</span></td>
                                            <td className="amount-cell">{fmt(a.amount)}</td>
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
                                <h3>Lab Tests ({billing.labReports.length} pending)</h3>
                                <button className="btn-select-all" onClick={() => toggleAll('labReports', billing.labReports.map(l => l._id))}>
                                    {billing.labReports.every(l => selected.labReports.includes(l._id)) ? 'Deselect All' : 'Select All'}
                                </button>
                            </div>
                            <table className="billing-table">
                                <thead><tr><th></th><th>Date</th><th>Tests</th><th>Status</th><th>Amount</th></tr></thead>
                                <tbody>
                                    {billing.labReports.map(l => (
                                        <tr key={l._id} className={selected.labReports.includes(l._id) ? 'selected-row' : ''}>
                                            <td><input type="checkbox" checked={selected.labReports.includes(l._id)} onChange={() => toggle('labReports', l._id)} /></td>
                                            <td>{fmtDate(l.createdAt)}</td>
                                            <td>{Array.isArray(l.testNames) ? l.testNames.join(', ') : (l.testName || '—')}</td>
                                            <td><span className={`status-badge`}>{l.testStatus || l.status || 'Pending'}</span></td>
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
                                <h3>Pharmacy Orders ({billing.pharmacyOrders.length} pending)</h3>
                                <button className="btn-select-all" onClick={() => toggleAll('pharmacyOrders', billing.pharmacyOrders.map(p => p._id))}>
                                    {billing.pharmacyOrders.every(p => selected.pharmacyOrders.includes(p._id)) ? 'Deselect All' : 'Select All'}
                                </button>
                            </div>
                            <table className="billing-table">
                                <thead><tr><th></th><th>Date</th><th>Items</th><th>Order Status</th><th>Amount</th></tr></thead>
                                <tbody>
                                    {billing.pharmacyOrders.map(p => (
                                        <tr key={p._id} className={selected.pharmacyOrders.includes(p._id) ? 'selected-row' : ''}>
                                            <td><input type="checkbox" checked={selected.pharmacyOrders.includes(p._id)} onChange={() => toggle('pharmacyOrders', p._id)} /></td>
                                            <td>{fmtDate(p.createdAt)}</td>
                                            <td>{Array.isArray(p.items) ? p.items.map(i => i.medicineName || i.name).filter(Boolean).join(', ') : '—'}</td>
                                            <td><span className="status-badge">{p.orderStatus || 'Pending'}</span></td>
                                            <td className="amount-cell">{fmt(p.totalAmount)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Facility Charges */}
                    {billing.facilityCharges.length > 0 && (
                        <div className="billing-section">
                            <div className="section-header">
                                <h3>Facility Charges ({billing.facilityCharges.length} pending)</h3>
                                <button className="btn-select-all" onClick={() => toggleAll('facilityCharges', billing.facilityCharges.map(f => f._id))}>
                                    {billing.facilityCharges.every(f => selected.facilityCharges.includes(f._id)) ? 'Deselect All' : 'Select All'}
                                </button>
                            </div>
                            <table className="billing-table">
                                <thead><tr><th></th><th>Date</th><th>Facility</th><th>Rate/Day</th><th>Days</th><th>Amount</th></tr></thead>
                                <tbody>
                                    {billing.facilityCharges.map(f => (
                                        <tr key={f._id} className={selected.facilityCharges.includes(f._id) ? 'selected-row' : ''}>
                                            <td><input type="checkbox" checked={selected.facilityCharges.includes(f._id)} onChange={() => toggle('facilityCharges', f._id)} /></td>
                                            <td>{fmtDate(f.createdAt)}</td>
                                            <td>{f.facilityName}</td>
                                            <td>{fmt(f.pricePerDay)}</td>
                                            <td>{f.daysUsed}</td>
                                            <td className="amount-cell">{fmt(f.totalAmount)}</td>
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

                    {/* No pending bills */}
                    {billing.appointments.length === 0 && billing.labReports.length === 0 &&
                        billing.pharmacyOrders.length === 0 && billing.facilityCharges.length === 0 &&
                        activeAdmissions.length === 0 && (
                        <div className="no-bills">No pending bills found for this patient.</div>
                    )}

                    {/* Payment Panel */}
                    {(billing.appointments.length > 0 || billing.labReports.length > 0 ||
                        billing.pharmacyOrders.length > 0 || billing.facilityCharges.length > 0 ||
                        activeAdmissions.length > 0) && (
                        <div className="payment-panel">
                            <div className="payment-summary">
                                <div className="payment-row">
                                    <span>Selected Amount:</span>
                                    <strong className="selected-amount">{fmt(totalSelected())}</strong>
                                </div>
                                <div className="payment-row">
                                    <span>Total Outstanding:</span>
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
