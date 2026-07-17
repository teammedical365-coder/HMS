import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { billingAPI, admissionAPI, patientAPI, uploadAPI, hospitalAPI } from '../../utils/api';
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
    const [paymentMode, setPaymentMode] = useState('Cash'); // Kept for backward compatibility
    const [splitPayments, setSplitPayments] = useState([{ method: 'Cash', amount: '' }]);
    const [paying, setPaying] = useState(false);
    const [successMsg, setSuccessMsg] = useState('');
    const [dischargingId, setDischargingId] = useState(null);
    const [suggestions, setSuggestions] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [upiOptions, setUpiOptions] = useState([]);
    useEffect(() => {
      hospitalAPI
        .getUpiIds()
        .then((res) => {
          const data = res?.upiIds || [];
          setUpiOptions(data);
        })
        .catch((err) => {
          console.error('Failed to fetch UPI IDs', err);
        });
    }, []);

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

    const [paymentModal, setPaymentModal] = useState({ open: false, data: { transactionId: '', upiId: '', cardDetails: '', bankReference: '' } });
    const [proofFile, setProofFile] = useState(null);
    const [viewProofUrl, setViewProofUrl] = useState('');

    const confirmPaymentWithProof = async (e) => {
        e.preventDefault();
        
        let proofUrl = '';
        let proofFileId = '';

        setPaying(true);
        try {
            if (proofFile) {
                const formData = new FormData();
                formData.append('images', proofFile);
                const uploadRes = await uploadAPI.uploadImages(formData);
                if (uploadRes.success && uploadRes.files.length > 0) {
                    proofUrl = uploadRes.files[0].url;
                    proofFileId = uploadRes.files[0].fileId;
                }
            }

            await executePayment({
                transactionId: paymentModal.data.transactionId,
                upiId: paymentModal.data.upiId,
                cardDetails: paymentModal.data.cardDetails,
                bankReference: paymentModal.data.bankReference,
                proofUrl,
                proofFileId
            });
            setPaymentModal({ open: false, data: {} });
            setProofFile(null);
        } catch (err) {
            console.error('Proof upload failed:', err);
            alert('Failed to process payment with proof');
            setPaying(false);
        }
    };

    const executePayment = async (extraData = {}) => {
        const total = totalSelected();
        setPaying(true);
        try {
            await billingAPI.processPayment({
                appointmentIds: selected.appointments,
                labReportIds: selected.labReports,
                pharmacyOrderIds: selected.pharmacyOrders,
                facilityChargeIds: selected.facilityCharges,
                admissionIds: selected.admissions,
                splitPayments,
                patientId: patient?._id,
                amount: total,
                ...extraData
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

    const handleSplitPaymentChange = (index, field, value) => {
        const newSplits = [...splitPayments];
        newSplits[index][field] = value;
        if (field === 'method' && value === 'Cash') {
            setPaymentModal({ open: false, data: {} });
            setProofFile(null);
        }
        setSplitPayments(newSplits);
    };

    const addSplitPayment = () => setSplitPayments([...splitPayments, { method: 'Cash', amount: '' }]);
    const removeSplitPayment = (index) => setSplitPayments(splitPayments.filter((_, i) => i !== index));

    const totalSplitAmount = splitPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    const balanceRemaining = Math.max(0, totalSelected() - totalSplitAmount);

    return (
        <div className="billing-profile-page" style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px' }}>
            <div className="billing-header" style={{
                background: 'linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%)',
                padding: '30px 40px',
                borderRadius: '16px',
                color: 'white',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                boxShadow: '0 10px 25px -5px rgba(59, 130, 246, 0.5)',
                marginBottom: '30px'
            }}>
                <div>
                    <h1 style={{ margin: '0 0 8px 0', fontSize: '2rem', display: 'flex', alignItems: 'center', gap: '12px', fontWeight: 800 }}>
                        <span>💳</span> Patient Billing Profile
                    </h1>
                    <p style={{ margin: 0, fontSize: '1.05rem', opacity: 0.9 }}>Search a patient to instantly view, manage, and settle their pending bills.</p>
                </div>
                <button className="btn-back" onClick={() => navigate(-1)} style={{
                    padding: '10px 24px',
                    background: 'rgba(255, 255, 255, 0.2)',
                    backdropFilter: 'blur(10px)',
                    border: '1px solid rgba(255, 255, 255, 0.3)',
                    color: 'white',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                    transition: 'all 0.3s'
                }}
                onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)'}
                onMouseOut={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)'}
                >← Back</button>
            </div>

            {/* Search */}
            <div style={{ position: 'relative', marginBottom: '30px' }} className="billing-search-container">
                <form className="billing-search-bar" onSubmit={handleSearch} style={{
                    display: 'flex', gap: '12px', padding: '10px', background: 'white', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)', border: '1px solid #e2e8f0'
                }}>
                    <div style={{ flex: 1, position: 'relative' }}>
                        <span style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', fontSize: '1.2rem' }}>🔍</span>
                        <input
                            type="text"
                            placeholder="Search by Phone / MRN / Patient ID..."
                            value={searchQuery}
                            onChange={e => handleQueryChange(e.target.value)}
                            onFocus={() => searchQuery.trim().length >= 2 && setShowSuggestions(true)}
                            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                            style={{ width: '100%', padding: '16px 16px 16px 48px', border: 'none', borderRadius: '8px', fontSize: '1.1rem', outline: 'none', background: '#f8fafc' }}
                        />
                    </div>
                    <button type="submit" disabled={loading} style={{
                        padding: '0 32px', background: 'linear-gradient(to right, #0ea5e9, #2563eb)', color: 'white', border: 'none', borderRadius: '8px', fontSize: '1.1rem', fontWeight: 600, cursor: 'pointer', boxShadow: '0 4px 6px -1px rgba(37, 99, 235, 0.4)', transition: 'transform 0.1s'
                    }}
                    onMouseDown={e => e.currentTarget.style.transform = 'scale(0.98)'}
                    onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
                    >
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
                            <form className="payment-controls" onSubmit={(e) => {
                                e.preventDefault();
                                if (totalSplitAmount !== totalSelected()) {
                                    alert(`Total split amount (${fmt(totalSplitAmount)}) must exactly match the selected amount (${fmt(totalSelected())}).`);
                                    return;
                                }
                                const hasNonCash = splitPayments.some(p => p.method !== 'Cash');
                                if (!hasNonCash) {
                                    if (!window.confirm(`Process payment of ${fmt(totalSelected())} via Cash?`)) return;
                                    executePayment({});
                                } else {
                                    confirmPaymentWithProof(e);
                                }
                            }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginBottom: '20px' }}>
                                    {splitPayments.map((split, index) => (
                                        <div key={index} className="payment-inline-inputs" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', background: '#f8fafc', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                            <select value={split.method} onChange={e => handleSplitPaymentChange(index, 'method', e.target.value)} className="payment-mode-select" style={{ padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', minWidth: '150px' }}>
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
                                                onChange={e => handleSplitPaymentChange(index, 'amount', e.target.value)} 
                                                style={{ padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', width: '120px' }} 
                                                min="1" 
                                                required 
                                            />

                                            {splitPayments.length > 1 && (
                                                <button type="button" onClick={() => removeSplitPayment(index)} style={{ padding: '8px 12px', background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>✕</button>
                                            )}

                                            {split.method === 'UPI' && (
                                                <div style={{ flexBasis: '100%', display: 'flex', gap: '10px', marginTop: '10px' }}>
                                                    <select value={paymentModal.data?.upiId || ''} onChange={e => setPaymentModal({ ...paymentModal, data: { ...paymentModal.data, upiId: e.target.value } })} style={{ padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', flex: 1 }} required>
                                                        <option value="" disabled>Select Hospital UPI ID</option>
                                                        {upiOptions.map((opt, idx) => (
                                                            <option key={idx} value={opt.upiId}>{opt.label} ({opt.upiId})</option>
                                                        ))}
                                                    </select>
                                                    <input type="text" placeholder="Txn Ref" required value={paymentModal.data?.transactionId || ''} onChange={e => setPaymentModal({ ...paymentModal, data: { ...paymentModal.data, transactionId: e.target.value } })} style={{ padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', flex: 1 }} />
                                                </div>
                                            )}
                                            {split.method === 'Card' && (
                                                <div style={{ flexBasis: '100%', display: 'flex', gap: '10px', marginTop: '10px' }}>
                                                    <input type="text" placeholder="Card (Last 4)" required value={paymentModal.data?.cardDetails || ''} onChange={e => setPaymentModal({ ...paymentModal, data: { ...paymentModal.data, cardDetails: e.target.value } })} style={{ padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', flex: 1 }} />
                                                    <input type="text" placeholder="Txn Ref" required value={paymentModal.data?.transactionId || ''} onChange={e => setPaymentModal({ ...paymentModal, data: { ...paymentModal.data, transactionId: e.target.value } })} style={{ padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', flex: 1 }} />
                                                </div>
                                            )}
                                            {['Cheque', 'NEFT/RTGS'].includes(split.method) && (
                                                <div style={{ flexBasis: '100%', display: 'flex', gap: '10px', marginTop: '10px' }}>
                                                    <input type="text" placeholder="Bank Ref / Cheque No" required value={paymentModal.data?.bankReference || ''} onChange={e => setPaymentModal({ ...paymentModal, data: { ...paymentModal.data, bankReference: e.target.value } })} style={{ padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', flex: 1 }} />
                                                </div>
                                            )}
                                            
                                            {split.method !== 'Cash' && !proofFile && (
                                                <div className="inline-file-upload" style={{ flexBasis: '100%', display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '10px' }}>
                                                    <label style={{ fontSize: '11px', color: '#64748b', fontWeight: 'bold' }}>Payment Proof <span style={{ color: '#ef4444' }}>*Required once for all non-cash</span></label>
                                                    <input type="file" accept="image/*,.pdf" onChange={e => setProofFile(e.target.files[0])} style={{ fontSize: '13px' }} required />
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                    
                                    <button type="button" onClick={addSplitPayment} style={{ alignSelf: 'flex-start', padding: '8px 16px', background: '#e0e7ff', color: '#4f46e5', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>+ Add Payment Method</button>
                                </div>

                                <button type="submit" className="btn-pay" disabled={paying || totalSelected() === 0 || totalSplitAmount !== totalSelected()}>
                                    {paying ? 'Processing...' : `Pay ${fmt(totalSelected())} (Split: ${fmt(totalSplitAmount)})`}
                                </button>
                            </form>
                        </div>
                    )}
                    {/* Payment History */}
                    <div className="billing-section payment-history">
                        <div className="section-header">
                            <h3>Payment History</h3>
                        </div>
                        {(!billing.paymentTransactions || billing.paymentTransactions.length === 0) ? (
                            <div className="no-bills" style={{ padding: '20px', textAlign: 'center', background: '#f8fafc', borderRadius: '10px', color: '#64748b' }}>
                                No past payments found for this patient. Select items above and make a payment to see the history here.
                            </div>
                        ) : (
                            <table className="billing-table">
                                <thead><tr><th>Date</th><th>Mode</th><th>Txn ID</th><th>Details</th><th>Amount</th><th>Status</th><th>Proof</th><th>Actions</th></tr></thead>
                                <tbody>
                                    {billing.paymentTransactions.map(pt => (
                                        <tr key={pt._id}>
                                            <td>{fmtDate(pt.paymentDate)}</td>
                                            <td>
                                                {pt.splitPayments && pt.splitPayments.length > 1 ? (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                        {pt.splitPayments.map((sp, idx) => (
                                                            <span key={idx} style={{ fontSize: '11px', background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px' }}>
                                                                {sp.method}: {fmt(sp.amount)}
                                                            </span>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    pt.paymentMode
                                                )}
                                            </td>
                                            <td>{pt.transactionId || pt.upiId || pt.bankReference || '—'}</td>
                                            <td style={{ maxWidth: '250px' }}>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                    <span style={{ fontSize: '13px', color: '#475569', fontWeight: '500' }}>{pt.description || 'General Payment'}</span>
                                                    {pt.billedItems && (
                                                        <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                                                            {pt.billedItems.appointments?.length > 0 && <span style={{ fontSize: '10px', background: '#e0e7ff', color: '#4f46e5', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>Appointment</span>}
                                                            {pt.billedItems.labReports?.length > 0 && <span style={{ fontSize: '10px', background: '#dbeafe', color: '#2563eb', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>Lab</span>}
                                                            {pt.billedItems.pharmacyOrders?.length > 0 && <span style={{ fontSize: '10px', background: '#dcfce7', color: '#16a34a', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>Medicine</span>}
                                                            {pt.billedItems.facilityCharges?.length > 0 && <span style={{ fontSize: '10px', background: '#fef3c7', color: '#d97706', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>Facility</span>}
                                                            {pt.billedItems.admissions?.length > 0 && <span style={{ fontSize: '10px', background: '#fee2e2', color: '#dc2626', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>ICU/Admission</span>}
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="amount-cell">{fmt(pt.amount)}</td>
                                            <td>
                                                <span className={pt.paymentStatus === 'Paid' ? 'paid-icon-check' : 'status-badge'}>
                                                    {pt.paymentStatus}
                                                </span>
                                            </td>
                                            <td>
                                                {pt.proofUrl ? (
                                                    <div className="proof-thumbnail" onClick={() => setViewProofUrl(pt.proofUrl)}>
                                                        {pt.proofUrl.endsWith('.pdf') ? '📄 PDF' : <img src={pt.proofUrl} alt="Proof" />}
                                                    </div>
                                                ) : '—'}
                                            </td>
                                            <td>
                                                {pt.proofUrl && (
                                                    <div className="action-buttons-proof">
                                                        <button onClick={() => setViewProofUrl(pt.proofUrl)} className="btn-proof-view">👁 View</button>
                                                        <button onClick={() => window.open(pt.proofUrl, '_blank')} className="btn-proof-dl">⬇ Download</button>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </>
            )}

            {/* View Proof Modal */}
            {viewProofUrl && (
                <div className="modal-overlay" onClick={() => setViewProofUrl('')}>
                    <div className="modal-content proof-view-modal" onClick={e => e.stopPropagation()}>
                        <span className="close-btn" onClick={() => setViewProofUrl('')}>&times;</span>
                        {viewProofUrl.endsWith('.pdf') ? (
                            <iframe src={viewProofUrl} title="Payment Proof" width="100%" height="500px" />
                        ) : (
                            <img src={viewProofUrl} alt="Payment Proof" className="full-proof-image" />
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default PatientBillingProfile;
